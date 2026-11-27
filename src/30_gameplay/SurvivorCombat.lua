-- ALICE owns scheduling, missile actors, target enumeration and zone pairs.
-- The run owns every created unit/effect and removes them on finish/restart.
-- This module keeps the run table, objects, hit pipeline, time stop and lifecycle.
-- Weapon engines (SurvivorCombatWeapons), status effects (SurvivorCombatStatus), set/tag
-- effects (SurvivorCombatSets), enemy hazards (SurvivorCombatHazards), supply crates
-- (SurvivorCombatSupplies), hero survival (SurvivorCombatHero) and enemy spawning/steering
-- (SurvivorCombatEnemies) are bound to these primitives at load and attached to each run table.
SurvivorCombat = {}
do
    local Status, Sets, Hazards = SurvivorCombatStatus, SurvivorCombatSets, SurvivorCombatHazards
    local Supplies, Hero, Enemies = SurvivorCombatSupplies, SurvivorCombatHero, SurvivorCombatEnemies
    local Weapons = SurvivorCombatWeapons
    -- Everything combat asks of the layers above it: presentation (alerts, cues, lines and
    -- screen effects), the expedition's risk and advantage state, and the loadout's stat
    -- displays. Those modules load after combat, so each call is late-bound; the optional
    -- presentation hooks (time-stop filter, hit vignette, stat displays) are skipped when absent.
    local outside = {
        Alert = function(...) return SurvivorUI.Alert(...) end,
        Cue = function(...) return SurvivorUI.Cue(...) end,
        Say = function(...) return SurvivorUI.Say(...) end,
        HitFlash = function(...) if SurvivorUI.HitFlash then return SurvivorUI.HitFlash(...) end end,
        TimeStopFilter = function(...) if SurvivorUI.SetTimeStopFilter then return SurvivorUI.SetTimeStopFilter(...) end end,
        RefreshStatDisplays = function()
            if SurvivorNativeLoadout and SurvivorNativeLoadout.RefreshStatDisplays then SurvivorNativeLoadout.RefreshStatDisplays() end
        end,
        RiskActive = function() return SurvivorExpedition.RiskActive() end,
        UseAdvantage = function(stage) return SurvivorExpedition.UseAdvantage(stage) end,
    }
    -- Everything one run owns lives in this table: Init fills it, Cleanup drops it for a
    -- fresh NewRun(), and BeginStage resets its stage fields. The extracted combat modules
    -- attach to the same table, so a new field needs no second reset list.
    local function NewRun()
        return {
            hero = nil, stats = nil, bounds = nil, difficulty = SurvivorConfig.difficulties.normal,
            onKill = nil, onDeath = nil, onBonus = nil,
            damageTrigger = nil, deathTrigger = nil, bonusPickupTrigger = nil, queryGroup = nil,
            units = {}, objects = {}, hostileObjects = {}, candidatePool = {}, summonCounts = {}, damageTotals = {},
            -- Stage progress and pause state; weaponClocks[id] = cooldown time since the last cast.
            stage = 1, stageStarted = 0, enemyCount = 0, boss = nil, bossDefeated = false, eliteSerial = 0, weaponClocks = {},
            frozen = false, inventoryFrozen = false, inventoryVitals = nil, warningUntil = 0, friendlyAlpha = 140,
            -- Breakable supplies and their dropped pickups.
            bonusCount = 0, nextBonusAt = 0, bonusItems = {},
            -- Time stop: until when enemies/bosses stay stopped and which units sit in it.
            timeStopUntil = 0, timeStopBossUntil = 0, timeStopUnits = {}, purging = false,
            -- Hero survival: shadow escape, search ward and the recent damage log.
            escapeReady = true, escapeUntil = 0, escapeUses = 0, escapeEffect = nil, escapeOwnsInvulnerability = false,
            ward = 0, wardUntil = 0, damageContext = nil, recentDamage = {}, stageEscapeUses = {},
            -- Hit pipeline flags for nested secondary/tag hits.
            hitSecondary = false, tagSecondary = false, shatterReady = 0,
        }
    end
    local run = NewRun()
    local clearTimer, clearGeneration, clearing = nil, 0, false

    local CleanupCall = RunSession.Attempt
    -- Damage, death and pickup events fire inside UnitDamageTarget hit loops, so
    -- RunSession.TriggerAction defers their failures to the session callback.
    local function HeroYaw() return GetUnitFacing(run.hero) * bj_DEGTORAD end


    function SurvivorCombat.TrackWeapons(ids)
        for _, id in ipairs(ids) do
            if not run.damageTotals[id] then
                run.damageTotals[id] = {damage = 0, stageDamage = 0, bossDamage = 0, slowSeconds = 0,
                    ownedAt = RunSession.GetElapsed()}
            end
        end
    end
    function SurvivorCombat.DamageRows(ids)
        local rows, now = {}, RunSession.GetElapsed()
        for _, id in ipairs(ids) do
            local data = run.damageTotals[id]
            if data then
                rows[#rows + 1] = {id = id, damage = data.damage, stageDamage = data.stageDamage,
                    bossDamage = data.bossDamage, slowSeconds = data.slowSeconds,
                    dps = data.damage / math.max(0.02, now - data.ownedAt)}
            end
        end
        return rows
    end

    local Alive = SurvivorUtil.UnitLive
    local function Enemy(u)
        local record = run.units[u]
        return record ~= nil and record.enemy and record.alive and Alive(u)
    end
    local function AttackTarget(u)
        local record = run.units[u]
        return record ~= nil and (record.enemy or record.bonus) and record.alive and Alive(u)
    end
    local function GroundTarget(u)
        return AttackTarget(u) and not IsUnitType(u, UNIT_TYPE_FLYING)
    end
    local function GroundEnemy(u)
        return Enemy(u) and not IsUnitType(u, UNIT_TYPE_FLYING)
    end
    local function UnitTimeStopped(u, now)
        local record = run.units[u]
        return record ~= nil and record.timeStopUntil ~= nil and record.timeStopUntil > (now or RunSession.GetElapsed())
    end
    -- Each combat pause source names its reason (menu, timeStop, freeze, special, prop);
    -- a unit stays paused while any holds. The native state from before the first
    -- reason is restored once the last one ends, so outside pauses survive.
    -- skipNative only records the reason (a dead unit keeps its last native state).
    local function SetUnitPause(u, record, reason, active, skipNative)
        local reasons = record.pauseReasons
        if active then
            if not reasons then
                reasons = {}
                record.pauseReasons = reasons
                record.nativePaused = SurvivorUtil.UnitExists(u) and IsUnitPaused(u)
            end
            reasons[reason] = true
        elseif reasons then
            reasons[reason] = nil
            if next(reasons) == nil then record.pauseReasons = nil end
        end
        if not skipNative and SurvivorUtil.UnitExists(u) then
            PauseUnit(u, record.pauseReasons ~= nil or record.nativePaused == true)
        end
    end
    -- A unit's own clock: run time minus the time stops it has sat through. Its attack,
    -- trait, support and rush deadlines are kept on this clock, so a stop never shifts them.
    local function UnitTime(record, now)
        return (now or RunSession.GetElapsed()) - (record.stoppedFor or 0)
    end
    -- Presentation and time-stop class per combat object identifier. Hostile objects are
    -- the enemy side: a time stop freezes them and they never dim. Friendly effects show
    -- alpha, dimmed to warningAlpha while an enemy warning is pending; color applies when
    -- the object has no weapon/element tint. Unlisted identifiers are plain friendly spells.
    local HOSTILE = {hostile = true}
    local ESCAPE = {alpha = 255, warningAlpha = 255, color = {185, 135, 255}}
    -- Solid metal needs more opacity than luminous spell particles at night.
    local BLADE = {alpha = 255, warningAlpha = 150, color = {235, 245, 255}}
    local OPAQUE = {alpha = 255, warningAlpha = 110}
    local SPELL = {alpha = 140, warningAlpha = 70}
    local objectStyles = {
        hsEnemyMissile = HOSTILE, hsEnemyPlague = HOSTILE, hsEnemyRushWarning = HOSTILE,
        hsBossChain = HOSTILE, hsBossImpact = HOSTILE, hsBossSpecial = HOSTILE, hsBossWarning = HOSTILE,
        hsEscapeDeparture = ESCAPE, hsEscapeArrival = ESCAPE, hsChainHit = OPAQUE,
        hsBlade = BLADE, hsSlash = BLADE, hsSlashHit = BLADE,
        hsReturnBlade = {alpha = 140, warningAlpha = 70, color = {190, 165, 225}},
    }
    local function ObjectStyle(object)
        local style = objectStyles[object.identifier]
        if style then return style end
        -- A new enemy-side identifier must be listed above, not silently treated as a spell.
        assert(not object.identifier:find("Enemy") and not object.identifier:find("Boss"),
            "Unlisted hostile combat object " .. object.identifier)
        return SPELL
    end
    local function HostileStopped(object)
        if not object.hostile then return false end
        -- Keep source-bound motion synchronized with the unit's pause state.
        if object.identifier == "hsBossSpecial" and not object.trail then return UnitTimeStopped(object.source) end
        return RunSession.GetElapsed() < run.timeStopUntil
    end
    local function ObjectTimeScale(object, stopped)
        local scale = stopped and 0 or 1
        if object.visual then BlzSetSpecialEffectTimeScale(object.visual, scale) end
        if object.markers then
            for _, effect in ipairs(object.markers) do BlzSetSpecialEffectTimeScale(effect, scale) end
        end
        object.timeStopVisualFrozen = stopped
    end
    local function TrackHostile(object)
        object.hostile = ObjectStyle(object).hostile == true
        if object.hostile then
            run.hostileObjects[object] = true
            ObjectTimeScale(object, run.frozen or HostileStopped(object))
        end
    end
    local function StopUnitTime(u, record, deadline)
        local now = RunSession.GetElapsed()
        if deadline <= now or not Enemy(u) then return end
        if not record.timeStopUntil then record.timeStopStarted = now end
        record.timeStopUntil = deadline
        run.timeStopUnits[u] = true
        SetUnitPause(u, record, "timeStop", true)
        SetUnitTimeScale(u, 0)
        Status.Color(u, record, true)
        if record.cosmetic then BlzSetSpecialEffectTimeScale(record.cosmetic, 0) end
    end
    local function ReleaseUnitTime(u, record, now)
        local duration = math.max(0, math.min(now, record.timeStopUntil) - record.timeStopStarted)
        record.stoppedFor = (record.stoppedFor or 0) + duration
        if SurvivorUtil.UnitExists(u) then Status.Color(u, record, false) end
        local alive = Alive(u)
        SetUnitPause(u, record, "timeStop", false, not alive)
        if alive then
            SetUnitTimeScale(u, run.frozen and 0 or 1)
            if record.cosmetic then BlzSetSpecialEffectTimeScale(record.cosmetic, run.frozen and 0 or 1) end
        end
        record.timeStopUntil, record.timeStopStarted = nil, nil
        run.timeStopUnits[u] = nil
    end
    local function RefreshTimeStopFilter(immediate)
        outside.TimeStopFilter(not immediate and not run.frozen and RunSession.IsRunning()
            and RunSession.GetElapsed() < run.timeStopUntil, immediate)
    end
    local function UpdateTimeStop(now, force)
        if run.timeStopUntil == 0 and next(run.timeStopUnits) == nil and not force then return end
        for u in pairs(run.timeStopUnits) do
            local record = run.units[u]
            if not record or not record.alive then run.timeStopUnits[u] = nil
            elseif now >= record.timeStopUntil then ReleaseUnitTime(u, record, now) end
        end
        for object in pairs(run.hostileObjects) do
            local stopped = run.frozen or HostileStopped(object)
            if object.timeStopVisualFrozen ~= stopped then ObjectTimeScale(object, stopped) end
        end
        if now >= run.timeStopUntil and next(run.timeStopUnits) == nil then run.timeStopUntil, run.timeStopBossUntil = 0, 0 end
        RefreshTimeStopFilter()
    end
    local function ResetTimeStop()
        local now = RunSession.GetElapsed()
        for u in pairs(run.timeStopUnits) do
            if run.units[u] then ReleaseUnitTime(u, run.units[u], now) end
        end
        run.timeStopUntil, run.timeStopBossUntil = 0, 0
        RefreshTimeStopFilter(true)
        UpdateTimeStop(now, true)
    end
    function SurvivorCombat.StopTime()
        if not RunSession.IsRunning() or not Alive(run.hero) then return end
        local now, config = RunSession.GetElapsed(), SurvivorConfig.bonusProps
        run.timeStopUntil = math.max(run.timeStopUntil, now + config.timeStopDuration)
        run.timeStopBossUntil = math.max(run.timeStopBossUntil, now + config.timeStopBossDuration)
        for u, record in pairs(run.units) do
            if Enemy(u) then StopUnitTime(u, record, record.boss and run.timeStopBossUntil or run.timeStopUntil) end
        end
        UpdateTimeStop(now)
    end
    -- Query the engine's current spatial index, then keep the original narrow-phase
    -- geometry. The enclosing circle also covers fast/diagonal/zero-length sweeps.
    -- Snapshot before dealing damage: nested death/set effects may enumerate again.
    local function Candidates(ax, ay, bx, by, radius, weapon)
        local started = SurvivorMetrics.Begin()
        local list = table.remove(run.candidatePool) or {}
        local dx, dy = bx - ax, by - ay
        GroupEnumUnitsInRange(run.queryGroup, (ax + bx) * 0.5, (ay + by) * 0.5,
            math.sqrt(dx * dx + dy * dy) * 0.5 + radius + 1, nil)
        for i = 0, BlzGroupGetSize(run.queryGroup) - 1 do
            local unit = BlzGroupUnitAt(run.queryGroup, i)
            if AttackTarget(unit) then list[#list + 1] = unit end
        end
        GroupClear(run.queryGroup)
        SurvivorMetrics.Count(weapon .. ".queries")
        SurvivorMetrics.Count(weapon .. ".fullScanEquivalent", run.enemyCount)
        SurvivorMetrics.Count(weapon .. ".candidates", #list)
        SurvivorMetrics.End("collision.query", started)
        return list
    end
    local function ReleaseCandidates(list)
        for i = #list, 1, -1 do list[i] = nil end
        run.candidatePool[#run.candidatePool + 1] = list
    end
    local function AreaCandidates(x, y, radius, weapon)
        local list = Candidates(x, y, x, y, radius, weapon .. ".area")
        local selected, scanned = {}, 0
        for _, u in ipairs(list) do selected[u] = true end
        for i = #list, 1, -1 do list[i] = nil end
        -- Retain the old table iteration order for set procs and secondary deaths.
        -- Snapshot before damage; nested queries/deaths cannot rewrite this cast.
        for u in pairs(run.units) do
            scanned = scanned + 1
            if selected[u] then list[#list + 1] = u end
        end
        SurvivorMetrics.Count(weapon .. ".area.orderScans", scanned)
        return list
    end
    local Height = SurvivorUtil.TerrainZ
    local function WarningStrip(owner, ax, ay, bx, by, width, color, alpha, elevation)
        local x, y, dx, dy = (ax + bx) / 2, (ay + by) / 2, bx - ax, by - ay
        local effect = AddSpecialEffect(SurvivorConfig.warningPlaneModel, x, y)
        owner.markers[#owner.markers + 1] = effect
        BlzSetSpecialEffectYaw(effect, Atan2(dy, dx))
        BlzSetSpecialEffectMatrixScale(effect, math.sqrt(dx * dx + dy * dy) / 100, width / 100, 1)
        BlzSetSpecialEffectZ(effect, Height(x, y) + (elevation or 5))
        BlzSetSpecialEffectColor(effect, color[1], color[2], color[3])
        BlzSetSpecialEffectAlpha(effect, alpha)
        return effect
    end
    local function ImpactPoint(target)
        local x, y = GetUnitX(target), GetUnitY(target)
        local offset = SurvivorConfig.missileImpactHeightByType[GetUnitTypeId(target)]
            or SurvivorConfig.missileImpactHeight
        return x, y, Height(x, y) + GetUnitFlyHeight(target) + offset
    end
    local function FaceMissile(missile, dx, dy, dz)
        local planarDistance = math.sqrt(dx * dx + dy * dy)
        -- Retain facing for a target directly above/below the missile.
        if planarDistance > 0 then missile.yaw = Atan2(dy, dx) end
        if planarDistance > 0 or dz ~= 0 then
            BlzSetSpecialEffectOrientation(missile.visual, missile.yaw, -Atan2(dz, planarDistance), 0)
        end
    end
    local function DestroyObject(self)
        if self.cleaned then return end
        self.cleaned = true
        if self.summon then run.summonCounts[self.weapon] = math.max(0, (run.summonCounts[self.weapon] or 0) - 1) end
        run.objects[self] = nil
        run.hostileObjects[self] = nil
        local errors, visual, lightning, markers = {}, self.visual, self.lightning, self.markers
        self.visual, self.lightning, self.markers = nil, nil, nil
        if visual ~= nil then CleanupCall(errors, "effect", function() DestroyEffect(visual) end) end
        if lightning ~= nil then CleanupCall(errors, "lightning", function() DestroyLightning(lightning) end) end
        if markers then
            for _, effect in ipairs(markers) do CleanupCall(errors, "marker", function() DestroyEffect(effect) end) end
        end
        self.target, self.source, self.hitTimes, self.shot, self.land = nil, nil, nil, nil, nil
        -- Keep coordinates intact until ALICE_Kill completes actor destruction.
        if #errors > 0 then error(table.concat(errors, "\n"), 0) end
    end
    local function FriendlyEffectAlpha(object, warning)
        -- A weapon can mark its own effect opaque (e.g. Putress models that keep their colours).
        local style = object.opaque and OPAQUE or ObjectStyle(object)
        return warning and style.warningAlpha or style.alpha
    end
    local function CreateObject(object, model, scale)
        object.visual = object.attachPoint and AddSpecialEffectTarget(model, object.target, object.attachPoint)
            or AddSpecialEffect(model, object.x, object.y)
        assert(object.visual ~= nil, "Could not create combat effect")
        object.destroy = DestroyObject
        run.objects[object] = true
        BlzSetSpecialEffectScale(object.visual, scale)
        if not object.attachPoint then BlzSetSpecialEffectZ(object.visual, object.z) end
        local style = ObjectStyle(object)
        object.friendly = not style.hostile
        if object.friendly then
            object.alpha = FriendlyEffectAlpha(object, RunSession.GetElapsed() < run.warningUntil)
            BlzSetSpecialEffectAlpha(object.visual, object.alpha)
        end
        local weapon = object.weapon and SurvivorConfig.weapons[object.weapon]
        local tint = object.tint
        if tint == nil then tint = weapon and (weapon.tint or SurvivorConfig.elements[weapon.element].tint) end
        tint = tint or style.color
        if tint then BlzSetSpecialEffectColor(object.visual, tint[1], tint[2], tint[3]) end
        TrackHostile(object)
        ALICE_Create(object)
    end
    local function ZoneLifetime(zone)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or zone.cleaned then return dt end
        if HostileStopped(zone) then return dt end
        if zone.identifier ~= "hsZone" then
            if zone.lifeSteps == nil then
                -- Count the old subtraction boundary once, including fractional
                -- lifetimes such as 0.22 that previously needed twelve steps.
                local life, steps = zone.life, 0
                while life > 0 do life, steps = life - dt, steps + 1 end
                zone.lifeSteps, zone.scheduledSteps = steps, 1
            end
            -- Only completed pair schedule steps age the effect. ALICE can halt
            -- after advancing its public tick but before evaluating any pairs.
            zone.lifeSteps = zone.lifeSteps - zone.scheduledSteps
            zone.life = math.max(0, zone.lifeSteps * dt)
            if zone.lifeSteps <= 0 then ALICE_Kill(zone); return dt end
            local maximum = math.max(1, math.floor((ALICE_Config.MAX_INTERVAL or zone.life) / dt))
            zone.scheduledSteps = math.min(zone.lifeSteps, maximum)
            return zone.scheduledSteps * dt
        end
        zone.life = zone.life - dt
        if zone.life <= 0 then
            if zone.identifier == "hsZone" then Sets.ExpireEmber(zone) end
            ALICE_Kill(zone)
        end
        return dt
    end
    local function SegmentDistanceSquared(px, py, ax, ay, bx, by)
        local dx, dy = bx - ax, by - ay
        local length = dx * dx + dy * dy
        local t = length > 0 and math.max(0, math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) or 0
        local x, y = px - ax - t * dx, py - ay - t * dy
        return x * x + y * y
    end
    -- status = the weapon's live status entry; statusOverride replaces it (residues, ticks).
    local function Hit(target, amount, weapon, setProc, secondary, statusScale, statusOverride)
        -- Supplies take one point per hit, without weapon damage, status or set procs.
        if RunSession.IsRunning() and Alive(run.hero) and AttackTarget(target) and run.units[target].bonus then
            if amount > 0 then UnitDamageTarget(run.hero, target, 1, false, false, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC, WEAPON_TYPE_WHOKNOWS) end
            return
        end
        if RunSession.IsRunning() and Alive(run.hero) and Enemy(target) then
            local baseAmount = amount
            local status = statusOverride or run.stats.status and run.stats.status[weapon]
            local curse = Status.CurseStacks(run.units[target])
            if curse > 0 then
                amount = amount * (1 + SurvivorConfig.status.curseAmp * curse + (status and status.cursedBonus or 0)
                    + (status and curse >= SurvivorConfig.status.curseMax and status.maxCurseBonus or 0))
            end
            run.units[target].lastHit, run.units[target].lastWeapon = amount, weapon
            local before = math.max(0, GetWidgetLife(target))
            local isBoss = run.units[target].boss
            local previous, previousTag = run.hitSecondary, run.tagSecondary
            run.hitSecondary = setProc and true or secondary == true
            run.tagSecondary = setProc == "tag"
            UnitDamageTarget(run.hero, target, amount, false, false, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC, WEAPON_TYPE_WHOKNOWS)
            run.hitSecondary, run.tagSecondary = previous, previousTag
            -- The damage/death events may have ended the run or released this unit.
            -- A pending teardown keeps combat owned, so the dealt damage still counts.
            if RunSession.GetState() ~= "RUNNING" or not run.units[target] then return end
            local after = Alive(target) and math.max(0, GetWidgetLife(target)) or 0
            local actual = math.max(0, before - after)
            local data = weapon and run.damageTotals[weapon]
            if data then
                data.damage, data.stageDamage = data.damage + actual, data.stageDamage + actual
                if isBoss then data.bossDamage = data.bossDamage + actual end
            end
            if not RunSession.IsRunning() then return end -- No new procs once teardown is pending.
            if not setProc and not secondary and actual > 0 then Sets.SetHit(target, amount, weapon, baseAmount) end
            if status and not setProc and not secondary then Status.Apply(target, weapon, status, statusScale or 1) end
        end
    end
    function SurvivorCombat.UpdateStatus(dt)
        if not RunSession.IsRunning() or not Alive(run.hero) then return end
        if next(run.bonusItems) ~= nil then Supplies.UpdateItems(RunSession.GetElapsed()) end
        UpdateTimeStop(RunSession.GetElapsed())
        local started, checked = SurvivorMetrics.Begin(), 0
        SurvivorMetrics.Count("status.calls")
        local now = RunSession.GetElapsed()
        if run.ward > 0 and now >= run.wardUntil then run.ward, run.wardUntil = 0, 0 end
        if run.escapeUntil > 0 and now >= run.escapeUntil then Hero.ClearEscape() end
        checked = Status.Update(now, dt)
        Sets.Update()
        local alpha = now < run.warningUntil and 70 or 140
        if run.friendlyAlpha ~= alpha then
            run.friendlyAlpha = alpha
            for object in pairs(run.objects) do
                if object.friendly and object.visual then
                    local targetAlpha = FriendlyEffectAlpha(object, now < run.warningUntil)
                    if object.alpha ~= targetAlpha then
                        object.alpha = targetAlpha
                        BlzSetSpecialEffectAlpha(object.visual, targetAlpha)
                    end
                end
            end
        end
        SurvivorMetrics.Count("status.unitChecks", checked)
        SurvivorMetrics.End("status.update", started)
    end
    function SurvivorCombat.BossDefeated() return run.bossDefeated end
    function SurvivorCombat.BossStatus()
        if not Enemy(run.boss) then return nil end
        local current, maximum = math.max(0, GetWidgetLife(run.boss)), BlzGetUnitMaxHP(run.boss)
        local encounter = SurvivorConfig.encounters[run.stage]
        return {name = encounter.bossName, current = current, max = maximum,
            enraged = encounter.enrage ~= nil and current <= maximum * encounter.enrage.life}
    end
    function SurvivorCombat.UpdateEnemies(elapsed)
        if not RunSession.IsRunning() or not Alive(run.hero) then return end
        Supplies.Update(elapsed)
        Enemies.Update(elapsed)
    end
    function SurvivorCombat.MaintainInventoryPause()
        if not run.frozen or not run.inventoryVitals or not Alive(run.hero) then return end
        -- Leave the hero's inventory abilities enabled. Status.Freeze movement/vitals
        -- separately so native equip/unequip orders still work during the pause.
        run.inventoryVitals.life = math.min(run.inventoryVitals.life, GetWidgetLife(run.hero), BlzGetUnitMaxHP(run.hero))
        run.inventoryVitals.mana = math.min(run.inventoryVitals.mana, GetUnitState(run.hero, UNIT_STATE_MANA), GetUnitState(run.hero, UNIT_STATE_MAX_MANA))
        SetWidgetLife(run.hero, run.inventoryVitals.life)
        SetUnitState(run.hero, UNIT_STATE_MANA, run.inventoryVitals.mana)
        if run.inventoryFrozen then
            if GetUnitX(run.hero) ~= run.inventoryVitals.x then SetUnitX(run.hero, run.inventoryVitals.x) end
            if GetUnitY(run.hero) ~= run.inventoryVitals.y then SetUnitY(run.hero, run.inventoryVitals.y) end
        end
    end
    function SurvivorCombat.SetPaused(enable, reason)
        local interactiveHero = enable and (reason == "INVENTORY" or reason == "STAGE_CLEAR")
        local showRegeneration = interactiveHero or enable and RunSession.IsInventoryOpen and RunSession.IsInventoryOpen() == true
        local suppressRegeneration = enable == true and not showRegeneration
        if run.frozen == enable and run.inventoryFrozen == interactiveHero
            and run.stats.nativeRegenerationPaused == suppressRegeneration then return end
        -- Interactive panels show the real engine rate in ASde. The existing
        -- inventory timer and final close correction keep actual HP frozen.
        -- Choice screens suppress it only when no native stats panel is open.
        run.stats.nativeRegenerationPaused = suppressRegeneration
        -- Every pause reason, including interactive panels that keep regeneration visible.
        run.stats.combatPaused = enable == true
        SurvivorAugments.ApplyHeroRegeneration(run.hero, run.stats)
        if run.inventoryVitals then SurvivorCombat.MaintainInventoryPause() end
        -- ASde display passives are real engine modifiers: clear them before resuming.
        outside.RefreshStatDisplays()
        if run.inventoryFrozen then
            BlzUnitDisableAbility(run.hero, FourCC("Amov"), false, false)
        end
        for u, record in pairs(run.units) do
            if SurvivorUtil.UnitExists(u) then
                SetUnitPause(u, record, "menu", enable and not (interactiveHero and u == run.hero))
                local scale = (enable or UnitTimeStopped(u)) and 0 or 1
                SetUnitTimeScale(u, scale)
                if record.cosmetic then BlzSetSpecialEffectTimeScale(record.cosmetic, scale) end
            end
        end
        if showRegeneration then
            run.inventoryVitals = {life = GetWidgetLife(run.hero), mana = GetUnitState(run.hero, UNIT_STATE_MANA),
                x = GetUnitX(run.hero), y = GetUnitY(run.hero)}
        else run.inventoryVitals = nil end
        if interactiveHero then
            IssueImmediateOrder(run.hero, "stop")
            BlzUnitDisableAbility(run.hero, FourCC("Amov"), true, true)
        end
        run.frozen, run.inventoryFrozen = enable, interactiveHero
        RefreshTimeStopFilter(enable)
        for object in pairs(run.objects) do
            ObjectTimeScale(object, enable or HostileStopped(object))
        end
    end
    function SurvivorCombat.Counts()
        local count, visuals = 0, 0
        for object in pairs(run.objects) do
            count = count + 1
            if object.visual then visuals = visuals + 1 end
            if object.markers then visuals = visuals + #object.markers end
            if object.lightning then visuals = visuals + 1 end
        end
        for _, record in pairs(run.units) do if record.cosmetic then visuals = visuals + 1 end end
        return run.enemyCount, count, visuals
    end
    function SurvivorCombat.DamageReport()
        local rows = {}
        for id, data in pairs(run.damageTotals) do rows[#rows + 1] = {id = id, damage = data.damage} end
        table.sort(rows, function(a, b) return a.damage > b.damage or a.damage == b.damage and a.id < b.id end)
        local lines = {}
        for i = 1, #rows do
            lines[#lines + 1] = SurvivorAugments.Get(rows[i].id).name .. string.format(" %.0f", rows[i].damage)
        end
        return #lines > 0 and "누적 유효 피해\n" .. table.concat(lines, "\n") or "누적 유효 피해: 없음"
    end
    local function CancelBattlefieldClear()
        clearGeneration, clearing = clearGeneration + 1, false
        local timer = clearTimer
        clearTimer = nil
        if timer then
            local errors = {}
            RunSession.CancelTimer(errors, "cleanup timer", timer)
            if #errors > 0 then error(table.concat(errors, "\n"), 0) end
        end
    end
    local function RemoveEnemy(u)
        local record = run.units[u]
        if not record or not record.enemy then return end
        if SurvivorUtil.UnitExists(u) then Status.Color(u, record, false, true) end
        Status.Forget(u)
        if record.cosmetic then DestroyEffect(record.cosmetic); record.cosmetic = nil end
        if record.alive then run.enemyCount = math.max(0, run.enemyCount - 1) end
        run.units[u] = nil
        ALICE_RemoveIdentifier(u, "hsEnemy")
        RemoveUnit(u)
    end
    function SurvivorCombat.IsClearing() return clearing end
    function SurvivorCombat.ClearBattlefieldAsync(onComplete)
        assert(RunSession.GetState() == "STAGE_CLEAR" and not clearing, "Clear only once while combat is paused")
        assert(type(onComplete) == "function", "Missing battlefield completion callback")
        CancelBattlefieldClear()
        Hero.ClearEscape()
        Supplies.ClearItems()
        ResetTimeStop()
        run.ward, run.wardUntil = 0, 0
        local pending, head = {}, 1
        for u, record in pairs(run.units) do if record.enemy or record.bonus then pending[#pending + 1] = u end end
        local generation = clearGeneration
        local budget = math.max(1, math.floor(SurvivorConfig.battlefieldCleanupBudget))
        local aliceBudget = math.max(1, math.floor(SurvivorConfig.battlefieldAliceCleanupBudget))
        clearing, clearTimer = true, CreateTimer()
        -- ALICE is halted during stage clear. This native timer only removes owned
        -- handles; it never advances combat time, XP, drops, or weapon lifetimes.
        TimerStart(clearTimer, SurvivorConfig.battlefieldCleanupInterval, true, function()
            if generation ~= clearGeneration then return end
            if RunSession.GetState() ~= "STAGE_CLEAR" then
                -- Debug.try would only print a failed cancel (release builds not even that).
                local cancelled, failure = pcall(CancelBattlefieldClear)
                if not cancelled then RunSession.Fail(failure) end
                return
            end
            local started = SurvivorMetrics.Begin()
            local ok, message = pcall(function()
                local remainingActors = 0
                if type(ALICE_DrainDestroyed) == "function" then
                    local work, actors, pairs, remaining = ALICE_DrainDestroyed(aliceBudget)
                    remainingActors = remaining
                    SurvivorMetrics.Count("cleanup.aliceWork", work)
                    SurvivorMetrics.Count("cleanup.aliceActors", actors)
                    SurvivorMetrics.Count("cleanup.alicePairs", pairs)
                end
                -- Start the story on a separate tick after the final removal batch.
                if next(run.objects) == nil and head > #pending and remainingActors == 0 then
                    CancelBattlefieldClear()
                    run.enemyCount, run.boss = 0, nil
                    onComplete()
                    return
                end
                local work = 0
                while work < budget do
                    local object = next(run.objects)
                    if object then
                        local cost = 1 + (object.markers and #object.markers or 0) + (object.lightning and 1 or 0)
                        -- A single actor is indivisible; never combine a large actor
                        -- with other removals when it exceeds this tick's budget.
                        if work > 0 and work + cost > budget then break end
                        run.objects[object] = nil
                        ALICE_Kill(object)
                        work = work + cost
                        SurvivorMetrics.Count("cleanup.objects")
                    elseif head <= #pending then
                        local unit = pending[head]
                        local cost = run.units[unit] and run.units[unit].cosmetic and 2 or 1
                        if work > 0 and work + cost > budget then break end
                        head = head + 1
                        if run.units[unit] and run.units[unit].bonus then Supplies.Remove(unit, run.units[unit]) else RemoveEnemy(unit) end
                        work = work + cost
                        SurvivorMetrics.Count("cleanup.units")
                    else break end
                end
                SurvivorMetrics.Count("cleanup.batches")
                SurvivorMetrics.Count("cleanup.work", work)
            end)
            SurvivorMetrics.End("cleanup.tick", started)
            if not ok then CancelBattlefieldClear(); RunSession.Fail(message) end
        end)
    end
    function SurvivorCombat.ClearBattlefield()
        CancelBattlefieldClear()
        Hero.ClearEscape()
        Supplies.ClearItems()
        ResetTimeStop()
        run.ward, run.wardUntil = 0, 0
        while next(run.objects) ~= nil do local object = next(run.objects); run.objects[object] = nil; ALICE_Kill(object) end
        for u, record in pairs(run.units) do
            if record.bonus then Supplies.Remove(u, record)
            elseif record.enemy then
                RemoveEnemy(u)
            end
        end
        run.enemyCount, run.boss = 0, nil
    end
    function SurvivorCombat.BeginStage(index, elapsed)
        assert(Alive(run.hero) and index >= 1 and index <= SurvivorConfig.stages, "Invalid stage transition")
        SurvivorCombat.ClearBattlefield()
        run.stage, run.stageStarted, run.enemyCount, run.boss, run.bossDefeated, run.warningUntil = index, elapsed, 0, nil, false, 0
        run.weaponClocks = {}
        run.bonusCount, run.nextBonusAt = 0, elapsed + SurvivorConfig.bonusProps.firstSpawn
        Sets.BeginStage()
        run.escapeReady = true
        run.recentDamage = {}
        for _, data in pairs(run.damageTotals) do data.stageDamage = 0 end
        -- Keep the same hero/XP/inventory and the same damage ledger across stages.
        SetUnitX(run.hero, (run.bounds.minX + run.bounds.maxX) / 2)
        SetUnitY(run.hero, (run.bounds.minY + run.bounds.maxY) / 2)
        SetWidgetLife(run.hero, BlzGetUnitMaxHP(run.hero))
        -- A still-open inventory keeps the pause reason, so refresh its frozen snapshot too.
        if run.inventoryVitals then
            run.inventoryVitals.x, run.inventoryVitals.y, run.inventoryVitals.life = GetUnitX(run.hero), GetUnitY(run.hero), GetWidgetLife(run.hero)
        end
    end
    -- The extracted modules work on the current run table (records, objects, stats).
    local function AttachModules()
        Weapons.Attach(run)
        Status.Attach(run)
        Sets.Attach(run)
        Hazards.Attach(run)
        Supplies.Attach(run)
        Hero.Attach(run)
        Enemies.Attach(run)
    end
    function SurvivorCombat.Cleanup()
        local errors = {}
        CleanupCall(errors, "battlefield timer", CancelBattlefieldClear)
        run.onKill, run.onDeath, run.onBonus = nil, nil, nil
        if run.stats then run.stats.nativeRegenerationPaused = true end
        if SurvivorUtil.UnitExists(run.hero) then
            CleanupCall(errors, "hero regeneration", function() SurvivorAugments.ApplyHeroRegeneration(run.hero, run.stats) end)
        end
        CleanupCall(errors, "escape", Hero.ClearEscape)
        local oldDamage, oldDeath, oldPickup = run.damageTrigger, run.deathTrigger, run.bonusPickupTrigger
        run.damageTrigger, run.deathTrigger, run.bonusPickupTrigger = nil, nil, nil
        RunSession.DestroyTrigger(errors, "damage trigger", oldDamage)
        RunSession.DestroyTrigger(errors, "death trigger", oldDeath)
        RunSession.DestroyTrigger(errors, "bonus pickup trigger", oldPickup)
        local old = run
        -- Detach the whole run before any actor or unit removal: destroy methods and
        -- late callbacks only ever see the fresh, empty run. Set and status state
        -- restarts with the run clock.
        run = NewRun()
        AttachModules()
        CleanupCall(errors, "time stop filter", function() RefreshTimeStopFilter(true) end)
        for item in pairs(old.bonusItems) do
            if SurvivorUtil.ItemExists(item) then CleanupCall(errors, "bonus item", function() RemoveItem(item) end) end
        end
        for object in pairs(old.objects) do
            if not CleanupCall(errors, "actor", function() ALICE_Kill(object) end) then
                -- ALICE_Kill clears its actor only after the object's destroy method.
                -- An exception there must not leave a callback registered after reset.
                if type(object.destroy) == "function" then CleanupCall(errors, "actor effects", function() object:destroy() end) end
                if type(ALICE_Destroy) == "function" then CleanupCall(errors, "actor registration", function() ALICE_Destroy(object) end) end
            end
        end
        for u, record in pairs(old.units) do
            if record.cosmetic then
                local cosmetic = record.cosmetic
                record.cosmetic = nil
                CleanupCall(errors, "unit effect", function() DestroyEffect(cosmetic) end)
            end
            CleanupCall(errors, "unit", function() RemoveUnit(u) end)
        end
        local oldGroup = old.queryGroup
        if oldGroup ~= nil then CleanupCall(errors, "query group", function() DestroyGroup(oldGroup) end) end
        if #errors > 0 then error(table.concat(errors, "\n"), 0) end
    end
    function SurvivorCombat.Init(unit, buildStats, arena, killCallback, deathCallback, difficultyId, bonusCallback)
        assert(run.hero == nil, "Combat must be cleaned before reinitializing")
        -- Own the hero before any validation can fail, so Cleanup removes it.
        run.hero, run.stats, run.bounds, run.onKill, run.onDeath = unit, buildStats, arena, killCallback, deathCallback
        run.units[run.hero] = {enemy = false, alive = true}
        run.difficulty = assert(SurvivorConfig.difficulties[difficultyId or "normal"], "Invalid combat difficulty")
        AttachModules()
        run.onBonus = bonusCallback
        run.bonusCount, run.nextBonusAt = 0, RunSession.GetElapsed() + SurvivorConfig.bonusProps.firstSpawn
        run.stats.nativeRegenerationPaused, run.stats.combatPaused = false, false
        SurvivorAugments.ApplyHeroRegeneration(run.hero, run.stats)
        run.queryGroup = CreateGroup()
        run.bonusPickupTrigger = CreateTrigger()
        -- Only the hero collects bonus items, and the hero always belongs to the run owner.
        TriggerRegisterPlayerUnitEvent(run.bonusPickupTrigger, SurvivorUtil.Owner(), EVENT_PLAYER_UNIT_PICKUP_ITEM, nil)
        TriggerAddAction(run.bonusPickupTrigger, RunSession.TriggerAction(function()
            if GetTriggerUnit() ~= run.hero or not Alive(run.hero) then return end
            Supplies.OnPickup(GetManipulatedItem())
        end))
        run.damageTrigger = CreateTrigger()
        TriggerRegisterAnyUnitEventBJ(run.damageTrigger, EVENT_PLAYER_UNIT_DAMAGED)
        TriggerAddAction(run.damageTrigger, RunSession.TriggerAction(function()
            local target, damage = GetTriggerUnit(), GetEventDamage()
            if damage <= 0 then return end
            local record = run.units[target]
            if record and record.bonus then
                -- Supplies take one point per hero hit and nothing from anyone else.
                BlzSetEventDamage(RunSession.IsRunning() and record.alive and Alive(run.hero) and GetEventDamageSource() == run.hero and 1 or 0)
            elseif target == run.hero then
                Hero.OnDamaged(damage)
            elseif record and record.shieldSource and Enemy(record.shieldSource) then
                local guardian = SurvivorConfig.eliteGuardian
                if (GetUnitX(target) - GetUnitX(record.shieldSource))^2 + (GetUnitY(target) - GetUnitY(record.shieldSource))^2 <= guardian.radius^2 then
                    BlzSetEventDamage(damage * guardian.damageTaken)
                end
            end
        end))
        run.deathTrigger = CreateTrigger()
        TriggerRegisterAnyUnitEventBJ(run.deathTrigger, EVENT_PLAYER_UNIT_DEATH)
        TriggerAddAction(run.deathTrigger, RunSession.TriggerAction(function()
            local dead = GetTriggerUnit()
            local record = run.units[dead]
            if not record or not record.alive then return end
            record.alive = false
            run.timeStopUnits[dead] = nil
            if record.timeStopUntil then SetUnitTimeScale(dead, 1) end
            if record.enemy then Status.Color(dead, record, false) end
            Status.Forget(dead)
            if record.cosmetic then DestroyEffect(record.cosmetic); record.cosmetic = nil end
            if record.bonus then Supplies.OnBroken(dead, record)
            elseif record.enemy then
                run.enemyCount = run.enemyCount - 1
                record.removeAt = RunSession.GetElapsed() + 2.0
                ALICE_RemoveIdentifier(dead, "hsEnemy")
                if record.boss then run.bossDefeated = true end
                -- A failed death proc must not cancel this kill's reward; report it afterwards.
                local procOk, procError = true, nil
                if RunSession.IsRunning() and not run.purging then
                    procOk, procError = pcall(function() Weapons.Shatter(dead, record); Sets.StatusDeath(dead, record) end)
                end
                -- Finish is deferred to Step; never tear down combat during a Hit loop.
                -- Report kills while a teardown is pending too; the owner withholds rewards.
                if RunSession.GetState() == "RUNNING" and run.onKill then run.onKill(dead, record.elite, record.boss) end
                if not procOk then error(procError, 0) end
            elseif run.onDeath then
                -- The run owner defers this too while running (see AnyasLongNight Step).
                run.onDeath()
            end
        end))
    end
    -- Primitives the extracted modules call. Values that change during a run are getters.
    local primitives = {
        Enemy = Enemy, AttackTarget = AttackTarget, GroundTarget = GroundTarget, GroundEnemy = GroundEnemy,
        UnitTimeStopped = UnitTimeStopped, HostileStopped = HostileStopped,
        SetUnitPause = SetUnitPause, UnitTime = UnitTime,
        Hit = Hit, AreaHit = Weapons.AreaHit, HurtHero = Hero.HurtHero, Residue = Weapons.Residue, StopUnitTime = StopUnitTime,
        Candidates = Candidates, AreaCandidates = AreaCandidates, ReleaseCandidates = ReleaseCandidates,
        ImpactPoint = ImpactPoint, FaceMissile = FaceMissile, ProcVisual = Weapons.ProcVisual, FallPayload = Weapons.FallPayload,
        CreateObject = CreateObject, DestroyObject = DestroyObject, TrackHostile = TrackHostile, ZoneLifetime = ZoneLifetime,
        WarningStrip = WarningStrip, SegmentDistanceSquared = SegmentDistanceSquared, MoveEnemy = Enemies.Move,
        HeroYaw = HeroYaw, MeleeGuard = Sets.MeleeGuard, Outside = outside,
        TagSecondary = function() return run.tagSecondary end,
        Stage = function() return run.stage end, Boss = function() return run.boss end,
        BossDefeated = function() return run.bossDefeated end, Bounds = function() return run.bounds end,
        EnemyCount = function() return run.enemyCount end,
        -- Friendly effects dim while any warning is pending.
        ExtendWarning = function(untilTime) run.warningUntil = math.max(run.warningUntil, untilTime) end,
    }
    Weapons.Bind(primitives)
    Status.Bind(primitives)
    Sets.Bind(primitives)
    Hazards.Bind(primitives)
    Supplies.Bind(primitives)
    Hero.Bind(primitives)
    Enemies.Bind(primitives)
    -- Attach the initial empty run at load: the first Start cleans up before any Init.
    AttachModules()
    -- Public combat API served by the extracted modules.
    SurvivorCombat.Spawn, SurvivorCombat.SpawnBoss, SurvivorCombat.SpawnCourier = Enemies.Spawn, Enemies.SpawnBoss, Enemies.SpawnCourier
    SurvivorCombat.ReleaseCourier, SurvivorCombat.PurgeNearby = Enemies.Release, Supplies.PurgeNearby
    SurvivorCombat.WardStatus, SurvivorCombat.GrantSearchRecovery = Hero.WardStatus, Hero.GrantSearchRecovery
    SurvivorCombat.StageEscapeUses, SurvivorCombat.DamageHistory, SurvivorCombat.EscapeStatus = Hero.StageEscapeUses, Hero.DamageHistory, Hero.EscapeStatus
    SurvivorCombat.WarnLava, SurvivorCombat.WarnRush = Hazards.WarnLava, Hazards.WarnRush
    SurvivorCombat.CastWeapon, SurvivorCombat.TickWeapons, SurvivorCombat.CastWeapons = Weapons.CastWeapon, Weapons.TickWeapons, Weapons.CastWeapons
end
