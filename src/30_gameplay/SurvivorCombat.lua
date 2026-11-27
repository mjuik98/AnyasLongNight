-- ALICE owns scheduling, missile actors, target enumeration and zone pairs.
-- The run owns every created unit/effect and removes them on finish/restart.
-- This module keeps the run table, objects, hit pipeline, weapons, time stop and
-- lifecycle. Status effects (SurvivorCombatStatus), set/tag effects (SurvivorCombatSets),
-- enemy hazards (SurvivorCombatHazards), supply crates (SurvivorCombatSupplies), hero
-- survival (SurvivorCombatHero) and enemy spawning/steering (SurvivorCombatEnemies) are
-- bound to these primitives at load and attached to each run table.
SurvivorCombat = {}
do
    local Status, Sets, Hazards = SurvivorCombatStatus, SurvivorCombatSets, SurvivorCombatHazards
    local Supplies, Hero, Enemies = SurvivorCombatSupplies, SurvivorCombatHero, SurvivorCombatEnemies
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
    local ZoneLifetime, Throw, Residue
    local Shatter
    local clearTimer, clearGeneration, clearing = nil, 0, false
    local FallPayload, AreaHit
    -- A cast reads its weapon from the shot (extra attacks carry a snapshot); a bare
    -- call fires the engine's reference weapon.
    local function ShotWeapon(shot, engine)
        return shot and shot.weapon or run.stats.weapons[SurvivorConfig.weaponEngines[engine].weapon]
    end
    -- The reference weapon keeps the engine's default effect identifiers.
    local function ReferenceWeapon(w, engine)
        return w.weaponId == SurvivorConfig.weaponEngines[engine].weapon
    end

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

    local Alive = SurvivorConfig.UnitLive
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
                record.nativePaused = SurvivorConfig.UnitExists(u) and IsUnitPaused(u)
            end
            reasons[reason] = true
        elseif reasons then
            reasons[reason] = nil
            if next(reasons) == nil then record.pauseReasons = nil end
        end
        if not skipNative and SurvivorConfig.UnitExists(u) then
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
        if SurvivorConfig.UnitExists(u) then Status.Color(u, record, false) end
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
        if SurvivorUI.SetTimeStopFilter then
            SurvivorUI.SetTimeStopFilter(not immediate and not run.frozen and RunSession.IsRunning()
                and RunSession.GetElapsed() < run.timeStopUntil, immediate)
        end
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
    local Height = SurvivorConfig.TerrainZ
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
    local function MoveMissile(missile)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or missile.cleaned then return dt end
        if missile.life <= 0 or missile.remaining <= 0 or not AttackTarget(missile.target) then
            ALICE_Kill(missile)
            return dt
        end
        -- Re-read terrain and fly height so climbing/flying targets remain tracked.
        local tx, ty, tz = ImpactPoint(missile.target)
        local dx, dy, dz = tx - missile.x, ty - missile.y, tz - missile.z
        local distance = math.sqrt(dx * dx + dy * dy + dz * dz)
        local step = math.min(missile.speed * math.min(dt, missile.life), missile.remaining)
        missile.flightAge = (missile.flightAge or 0) + math.min(dt, missile.life)
        missile.life = missile.life - dt
        local hitRadius = missile.hitRadius
        FaceMissile(missile, dx, dy, dz)
        -- Move at constant 3D speed, stopping at the target's hit sphere.
        -- Check zero distance before normalization, including vertical-only shots.
        if distance > 0 then
            local fraction = math.min(step, math.max(0, distance - hitRadius)) / distance
            if not SurvivorStage.LineClear(missile.x, missile.y, missile.x + dx * fraction, missile.y + dy * fraction) then ALICE_Kill(missile); return dt end
            missile.remaining = missile.remaining - distance * fraction
            missile.x = missile.x + dx * fraction
            missile.y = missile.y + dy * fraction
            missile.z = missile.z + dz * fraction
        end
        BlzSetSpecialEffectPosition(missile.visual, missile.x, missile.y, missile.z)
        -- The swept step reaches the sphere: no XY-only hits on overhead targets.
        if distance <= step + hitRadius then
            local target, damage, evolution = missile.target, Sets.HomingDamage(missile, missile.damage), missile.evolution
            local mode, weapon = missile.modeValues, missile.weapon
            local x, y, z = ImpactPoint(target)
            ALICE_Kill(missile)
            if evolution == "focus" then
                local record, now = run.units[target], RunSession.GetElapsed()
                local stacks = now < (record.fireFocusUntil or 0) and (record.fireFocus or 0) or 0
                damage = damage * (1 + math.min(mode.stacks, stacks) * mode.damage)
                record.fireFocus, record.fireFocusUntil = math.min(mode.stacks, stacks + 1), now + mode.duration
            end
            Hit(target, damage, weapon, nil, nil, missile.statusScale)
            if evolution == "burst" and RunSession.IsRunning() then
                CreateObject({identifier = "hsFireBurst", x = x, y = y, z = z, life = 0.4,
                    isAnonymous = true, selfInteractions = ZoneLifetime}, SurvivorConfig.fireBurstModel, 0.14)
                local victims, radius = {}, mode.radius
                local candidates = Candidates(x, y, x, y, radius, weapon .. ".area")
                for _, u in ipairs(candidates) do
                    if u ~= target and Enemy(u) and (GetUnitX(u) - x)^2 + (GetUnitY(u) - y)^2 <= radius^2 then victims[#victims + 1] = u end
                end
                ReleaseCandidates(candidates)
                table.sort(victims, function(a, b) return GetHandleId(a) < GetHandleId(b) end)
                for i = 1, math.min(mode.targets, #victims) do Hit(victims[i], damage * mode.damage, weapon, true) end
            end
            return dt
        end
        return dt
    end
    ZoneLifetime = function(zone)
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
    local function ZoneDamage(zone, enemy)
        local interval = zone.pulse
        if not RunSession.IsRunning() or zone.cleaned or zone.life <= 0 then return interval end
        if GroundTarget(enemy) then
            local dx, dy = GetUnitX(enemy) - zone.x, GetUnitY(enemy) - zone.y
            if dx * dx + dy * dy <= zone.radius * zone.radius then
                Hit(enemy, Sets.ZoneRampDamage(zone, enemy, zone.damage), zone.weapon, nil, nil, zone.statusScale)
            end
        end
        return interval
    end
    function SurvivorCombat.FireMissile(shot)
        local w = ShotWeapon(shot, "missile")
        if not RunSession.IsRunning() or not Alive(run.hero) or not w.enabled then return end
        local x, y = GetUnitX(run.hero), GetUnitY(run.hero)
        local primary = ALICE_GetClosestObject(x, y, "hsEnemy", w.range,
            function(u) return AttackTarget(u) and SurvivorStage.LineClear(x, y, GetUnitX(u), GetUnitY(u)) end)
        if primary == nil then return end
        local selected, yaw = {}, HeroYaw()
        local z = Height(x, y) + GetUnitFlyHeight(run.hero) + SurvivorConfig.missileLaunchHeight
        local extra = shot and shot.index ~= nil
        for index = 1, w.count do
            -- Prefer different enemies; concentrate extra shots if fewer are nearby.
            local target = index == 1 and primary or ALICE_GetClosestObject(x, y, "hsEnemy", w.range,
                function(u) return AttackTarget(u) and not selected[u] and SurvivorStage.LineClear(x, y, GetUnitX(u), GetUnitY(u)) end) or primary
            selected[target] = true
            local offset = (index - (w.count + 1) / 2) * 18
            local missile = {identifier = "hsMissile", weapon = w.weaponId, statusScale = w.statusScale,
                x = x - math.sin(yaw) * offset, y = y + math.cos(yaw) * offset, z = z, yaw = yaw,
                owner = SurvivorConfig.Owner(), target = target, life = w.lifetime, damage = w.damage, tagExtra = extra,
                speed = w.speed, hitRadius = w.hitRadius, remaining = w.range, evolution = w.evolution, modeValues = w.modeValues,
                selfInteractions = MoveMissile, isAnonymous = true}
            CreateObject(missile, w.model or SurvivorConfig.missileModel, w.scale)
            local tx, ty, tz = ImpactPoint(target)
            FaceMissile(missile, tx - missile.x, ty - missile.y, tz - missile.z)
        end
    end
    local function SpreadPoint(x, y, distance, shot)
        if shot and shot.index then
            local angle = HeroYaw() + (shot.index == 1 and -1 or 1) * math.pi / 2
            return x + math.cos(angle) * distance, y + math.sin(angle) * distance
        end
        return x, y
    end
    function SurvivorCombat.CreateZone(shot)
        local w = ShotWeapon(shot, "zone")
        if not RunSession.IsRunning() or not Alive(run.hero) or not w.enabled then return end
        local x, y = GetUnitX(run.hero), GetUnitY(run.hero)
        x, y = SpreadPoint(x, y, w.radius * 0.8, shot)
        CreateObject({identifier = "hsZone", weapon = w.weaponId, statusScale = w.statusScale, x = x, y = y, z = Height(x, y),
            owner = SurvivorConfig.Owner(), radius = w.radius, isStationary = true,
            life = w.duration, damage = w.damage, pulse = w.pulse, tagExtra = shot and shot.index ~= nil,
            selfInteractions = ZoneLifetime, interactions = {hsEnemy = ZoneDamage}},
            w.model or SurvivorConfig.zoneModel, w.radius / 230)
    end
    function SurvivorCombat.CastChainLightning(shot)
        local relayHits = run.stats and run.stats.sets.conductor and not (shot and shot.index) and {} or nil
        local w = ShotWeapon(shot, "chain")
        if not RunSession.IsRunning() or not Alive(run.hero) or not w.enabled then return end
        local x, y, z = ImpactPoint(run.hero)
        local visited, damage, range = {}, w.damage, w.range
        local weapon = w.weaponId
        for jump = 1, w.targets do
            local target = ALICE_GetClosestObject(x, y, "hsEnemy", range,
                function(u) return AttackTarget(u) and not visited[u] end)
            if target == nil then break end
            visited[target] = true
            local tx, ty, tz = ImpactPoint(target)
            local bolt = {identifier = "hsLightning", x = x, y = y, z = z,
                life = 0.22, isStationary = true, isAnonymous = true,
                selfInteractions = ZoneLifetime, destroy = DestroyObject}
            bolt.lightning = AddLightningEx(w.lightning or (jump == 1 and "CLPB" or "CLSB"), true, x, y, z, tx, ty, tz)
            run.objects[bolt] = true
            ALICE_Create(bolt)
            -- Unattached: an attached effect inherits each unit's model and SetUnitScale size.
            CreateObject({identifier = "hsChainHit", weapon = weapon, x = tx, y = ty, z = tz,
                life = SurvivorConfig.chainHitDuration,
                isStationary = true, isAnonymous = true, selfInteractions = ZoneLifetime},
                w.model or SurvivorConfig.chainHitModel, SurvivorConfig.chainHitScale)
            Hit(target, damage, weapon, nil, nil, w.statusScale)
            if relayHits and Enemy(target) then relayHits[#relayHits + 1] = {unit = target, damage = damage} end
            x, y, z, range = tx, ty, tz, w.jumpRange
            damage = damage * SurvivorConfig.chainFalloff
        end
        for i = #(relayHits or {}), 1, -1 do
            local last = relayHits[i]
            if Enemy(last.unit) then Sets.RelayEnd(weapon, last.unit, last.damage); break end
        end
    end
    local function SegmentDistanceSquared(px, py, ax, ay, bx, by)
        local dx, dy = bx - ax, by - ay
        local length = dx * dx + dy * dy
        local t = length > 0 and math.max(0, math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) or 0
        local x, y = px - ax - t * dx, py - ay - t * dy
        return x * x + y * y
    end
    local function MoveBlade(blade)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or blade.cleaned then return dt end
        blade.life = blade.life - dt
        if blade.life <= 0 or not Alive(run.hero) then ALICE_Kill(blade); return dt end
        local oldX, oldY = blade.x, blade.y
        blade.age = blade.age + dt
        local orbit = blade.orbit
        if blade.evolution == "pulse" then orbit = orbit * (1 + 0.325 * (1 - math.cos(blade.age * 2 * math.pi / 3))) end
        if blade.evolution == "guard" then
            local desired = HeroYaw() + math.sin(blade.age * 2 * math.pi / blade.period) * 0.65 + blade.offset
            local delta = Atan2(math.sin(desired - blade.angle), math.cos(desired - blade.angle))
            blade.angle = blade.angle + math.max(-dt * 6, math.min(dt * 6, delta))
        else blade.angle = (blade.angle + dt * 2 * math.pi / blade.period) % (2 * math.pi) end
        blade.x, blade.y = GetUnitX(run.hero) + math.cos(blade.angle) * orbit, GetUnitY(run.hero) + math.sin(blade.angle) * orbit
        blade.z = Height(blade.x, blade.y) + 65
        BlzSetSpecialEffectPosition(blade.visual, blade.x, blade.y, blade.z)
        BlzSetSpecialEffectYaw(blade.visual, blade.angle + math.pi / 2)
        local now = RunSession.GetElapsed()
        for u, expiry in pairs(blade.hitTimes) do if expiry <= now or not AttackTarget(u) then blade.hitTimes[u] = nil end end
        local candidates = Candidates(oldX, oldY, blade.x, blade.y, blade.hitRadius, blade.weapon)
        for _, u in ipairs(candidates) do
            if blade.cleaned or not RunSession.IsRunning() then break end
            if GroundTarget(u) and not blade.hitTimes[u]
                and SegmentDistanceSquared(GetUnitX(u), GetUnitY(u), oldX, oldY, blade.x, blade.y) <= blade.hitRadius ^ 2 then
                blade.hitTimes[u] = now + blade.hitInterval
                Hit(u, blade.damage, blade.weapon)
            end
        end
        ReleaseCandidates(candidates)
        return dt
    end
    function SurvivorCombat.CastBlades(shot)
        local w = ShotWeapon(shot, "orbit")
        if not RunSession.IsRunning() or not Alive(run.hero) or not w.enabled then return end
        -- One activation is one evenly spaced ring, including multicast blades.
        -- Older rings keep their own lifetime, damage and per-enemy hit history.
        local count, phase = w.count + run.stats.multiCount, RunSession.GetElapsed()
        local centerX, centerY = GetUnitX(run.hero), GetUnitY(run.hero)
        local identifier = ReferenceWeapon(w, "orbit") and "hsBlade" or "hsWraith"
        for i = 1, count do
            local angle = 2 * math.pi * (i - 1) / count + phase
            local offset = (i - (count + 1) / 2) / math.max(1, count - 1) * 0.8
            if w.evolution == "guard" then angle = HeroYaw() + offset end
            local x, y = centerX + math.cos(angle) * w.radius, centerY + math.sin(angle) * w.radius
            local damage = w.damage * (i > w.count and run.stats.multiDamage or 1)
            CreateObject({identifier = identifier, weapon = w.weaponId, x = x, y = y, z = Height(x, y) + 65,
                angle = angle, orbit = w.radius, period = w.period, damage = damage,
                age = 0, offset = offset, evolution = w.evolution,
                life = w.duration, hitRadius = w.hitRadius, hitInterval = w.hitInterval,
                hitTimes = {}, isAnonymous = true, selfInteractions = MoveBlade}, w.model or SurvivorConfig.bladeModel, w.scale)
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
    local function StrikeMonsoon(strike)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or strike.cleaned then return dt end
        strike.life = strike.life - dt
        if strike.life > 0 then return dt end
        local x, y, z, radius, damage = strike.x, strike.y, strike.z, strike.radius, strike.damage
        ALICE_Kill(strike)
        if not Alive(run.hero) then return dt end
        CreateObject({identifier = "hsMonsoonEffect", weapon = strike.weapon, x = x, y = y, z = z, life = 0.9,
            isAnonymous = true, selfInteractions = ZoneLifetime}, strike.model or SurvivorConfig.monsoonModel, radius / 150)
        -- A column of lightning hits ground and flying enemies at the locked point.
        local started, checked = SurvivorMetrics.Begin(), 0
        SurvivorMetrics.Count("monsoon.area.calls")
        local candidates = AreaCandidates(x, y, radius, strike.weapon)
        for _, u in ipairs(candidates) do
            if not RunSession.IsRunning() or not Alive(run.hero) then break end
            if AttackTarget(u) then
                checked = checked + 1
                local dx, dy = GetUnitX(u) - x, GetUnitY(u) - y
                if dx * dx + dy * dy <= radius * radius then Hit(u, damage, strike.weapon, nil, nil, strike.statusScale) end
            end
        end
        ReleaseCandidates(candidates)
        SurvivorMetrics.Count("monsoon.area.distanceChecks", checked)
        SurvivorMetrics.End("monsoon.area", started)
        return dt
    end
    function SurvivorCombat.CastMonsoon(shot)
        local w = ShotWeapon(shot, "strike")
        if not RunSession.IsRunning() or not Alive(run.hero) or not w.enabled then return end
        local x, y = GetUnitX(run.hero), GetUnitY(run.hero)
        local primary = ALICE_GetClosestObject(x, y, "hsEnemy", w.range, AttackTarget)
        if not primary then return end
        local selected = {}
        for i = 1, w.count do
            local target = ALICE_GetClosestObject(x, y, "hsEnemy", w.range,
                function(u) return AttackTarget(u) and not selected[u] end) or primary
            selected[target] = true
            local tx, ty, tz = ImpactPoint(target)
            tx, ty = SpreadPoint(tx, ty, w.radius * 0.7, shot)
            if i == 1 and not (shot and shot.index) and Enemy(target) then
                Sets.RecordFallingCast(w.weaponId, tx, ty, tz, w.damage, w.radius,
                    w.throwModel or SurvivorConfig.meteorModel, (w.throwScale or 1) * 0.6)
            end
            local life = w.delay + (i - 1) * w.spacing
            if w.falling then
                local id, damage, radius, scale = w.weaponId, w.damage, w.radius, w.statusScale
                FallPayload(id, tx, ty, tz, 0.55 + (i - 1) * w.spacing,
                    w.throwModel, w.throwScale or 1, function()
                        CreateObject({identifier = "hsVialImpact", weapon = id, x = tx, y = ty, z = tz, life = 0.45,
                            isAnonymous = true, selfInteractions = ZoneLifetime}, w.model, radius / 150)
                        AreaHit({x = tx, y = ty, z = tz, radius = radius, slow = 0, weapon = id, statusScale = scale}, damage)
                    end)
            else
                if w.thrown then
                    -- A vial lands exactly when its strike resolves; the strike owns the damage.
                    local hx, hy, hz = ImpactPoint(run.hero)
                    life = Throw(hx, hy, hz, tx, ty, tz, w.throwSpeed, (i - 1) * w.spacing, nil, w.throwScale, w.throwModel, w.weaponId)
                end
                local strike = {identifier = "hsMonsoon", weapon = w.weaponId, model = w.model,
                    statusScale = w.statusScale, x = tx, y = ty, z = tz,
                    life = life, radius = w.radius, damage = w.damage,
                    isAnonymous = true, isStationary = true, selfInteractions = StrikeMonsoon, destroy = DestroyObject}
                run.objects[strike] = true
                ALICE_Create(strike)
            end
        end
    end
    local function SweepSlash(slash)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or slash.cleaned then return dt end
        slash.life = slash.life - dt
        if slash.life <= 0 then ALICE_Kill(slash); return dt end
        slash.sweepElapsed = slash.sweepElapsed + dt
        local angle = slash.facing - slash.arc / 2 + slash.arc * math.min(1, slash.sweepElapsed / slash.sweepTime)
        slash.x, slash.y = slash.originX + math.cos(angle) * slash.radius, slash.originY + math.sin(angle) * slash.radius
        BlzSetSpecialEffectPosition(slash.visual, slash.x, slash.y, slash.z)
        BlzSetSpecialEffectYaw(slash.visual, angle + math.pi / 2)
        return dt
    end
    local function HitSlash(area)
        local cosine = math.cos(area.arc / 2)
        local candidates = Candidates(area.x, area.y, area.x, area.y, area.radius, area.weapon)
        for _, u in ipairs(candidates) do
            if area.cleaned or not RunSession.IsRunning() or not Alive(run.hero) then break end
            if GroundTarget(u) and not area.hitTimes[u] then
                local dx, dy = GetUnitX(u) - area.x, GetUnitY(u) - area.y
                local distance = math.sqrt(dx * dx + dy * dy)
                if distance <= area.radius and (distance < 1
                    or (dx * math.cos(area.facing) + dy * math.sin(area.facing)) / distance >= cosine) then
                    area.hitTimes[u] = true
                    local tx, ty, tz = ImpactPoint(u)
                    CreateObject({identifier = "hsSlashHit", x = tx, y = ty, z = tz, life = 0.4,
                        isAnonymous = true, selfInteractions = ZoneLifetime}, area.hitModel or SurvivorConfig.slashModel, area.scale)
                    Hit(u, area.damage, area.weapon, nil, nil, area.statusScale)
                end
            end
        end
        ReleaseCandidates(candidates)
    end
    local function LingerSlash(area)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or area.cleaned then return dt end
        if not Alive(run.hero) then ALICE_Kill(area); return dt end
        area.life = area.life - dt
        if area.life <= 0 then ALICE_Kill(area); return dt end
        HitSlash(area)
        return dt
    end
    function SurvivorCombat.CastFrontSlash(shot)
        local w = ShotWeapon(shot, "cone")
        if not RunSession.IsRunning() or not Alive(run.hero) or not w.enabled then return end
        local x, y = GetUnitX(run.hero), GetUnitY(run.hero)
        local facing, arc = HeroYaw(), w.angle * bj_DEGTORAD
        local radius = w.range
        local target = ALICE_GetClosestObject(x, y, "hsEnemy", radius, GroundEnemy)
        if target then
            local dx, dy = GetUnitX(target) - x, GetUnitY(target) - y
            if dx * dx + dy * dy >= 1 then facing = math.atan(dy, dx) end
        end
        local sweepRadius, startAngle = radius * 0.7, facing - arc / 2
        CreateObject({identifier = ReferenceWeapon(w, "cone") and "hsSlash" or "hsBreath", weapon = w.weaponId, originX = x, originY = y,
            x = x + math.cos(startAngle) * sweepRadius, y = y + math.sin(startAngle) * sweepRadius,
            z = Height(x, y) + 65, facing = facing, arc = arc, radius = sweepRadius,
            life = math.max(w.sweepTime, w.duration), sweepTime = w.sweepTime, sweepElapsed = 0,
            isAnonymous = true, selfInteractions = SweepSlash}, w.model or SurvivorConfig.bladeModel, 1.3 * w.scale)
        -- Snapshot origin/facing/damage for the whole cast. A lingering cone hits each enemy once.
        local area = {identifier = "hsSlashArea", weapon = w.weaponId, statusScale = w.statusScale,
            hitModel = w.hitModel, x = x, y = y, z = Height(x, y),
            facing = facing, arc = arc, radius = radius, damage = w.damage, scale = w.scale,
            life = w.duration, hitTimes = {}, isAnonymous = true, isStationary = true,
            selfInteractions = LingerSlash, destroy = DestroyObject}
        if area.life > 0 then run.objects[area] = true; ALICE_Create(area) end
        HitSlash(area)
    end
    local function ProcVisual(x, y, z, model, scale, weapon)
        CreateObject({identifier = "hsSetEffect", weapon = weapon, x = x, y = y, z = z, life = 0.7,
            isAnonymous = true, selfInteractions = ZoneLifetime}, model, scale)
    end
    -- Quadratic Bezier throw: P0 = launch, P2 = locked landing point, P1 = midpoint raised by height.
    local function MoveThrow(throw)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or throw.cleaned then return dt end
        if not Alive(run.hero) then ALICE_Kill(throw); return dt end
        throw.age = throw.age + dt
        local t = math.max(0, math.min(1, throw.age / throw.flight))
        local u = 1 - t
        throw.x = u * u * throw.x0 + 2 * u * t * throw.cx + t * t * throw.x1
        throw.y = u * u * throw.y0 + 2 * u * t * throw.cy + t * t * throw.y1
        throw.z = u * u * throw.z0 + 2 * u * t * throw.cz + t * t * throw.z1
        BlzSetSpecialEffectPosition(throw.visual, throw.x, throw.y, throw.z)
        if t >= 1 then
            local land = throw.onLand
            ALICE_Kill(throw)
            if land and Alive(run.hero) then land() end
        end
        return dt
    end
    -- Returns delay + flight time so callers can resolve damage on landing.
    Throw = function(x0, y0, z0, x1, y1, z1, speed, delay, onLand, scale, model, weapon)
        local config = SurvivorConfig.throw
        local distance = math.sqrt((x1 - x0) ^ 2 + (y1 - y0) ^ 2)
        local height = math.min(config.maxHeight, math.max(config.minHeight, distance * config.arc))
        local flight = (config.minFlight + (config.maxFlight - config.minFlight) * math.min(1, distance / config.flightRange))
            / math.max(0.1, speed or 1)
        CreateObject({identifier = "hsThrow", weapon = weapon, tint = weapon and SurvivorConfig.weapons[weapon].throwTint,
            x = x0, y = y0, z = z0, x0 = x0, y0 = y0, z0 = z0, x1 = x1, y1 = y1, z1 = z1,
            cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2 + height, age = -(delay or 0), flight = flight,
            onLand = onLand, isAnonymous = true, selfInteractions = MoveThrow}, model or config.model, scale or 1)
        return (delay or 0) + flight
    end
    -- One mark per enemy stays attached while repeated hits keep refreshing it.
    local function MarkLifetime(mark)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or mark.cleaned then return dt end
        mark.life = mark.life - dt
        if mark.life <= 0 or not Enemy(mark.unit) then ALICE_Kill(mark) end
        return dt
    end
    local function MarkUnit(u, model, duration)
        local record = run.units[u]
        local mark = record.dotMark
        if mark and not mark.cleaned then mark.life = math.max(mark.life, duration); return end
        mark = {identifier = "hsDotMark", target = u, unit = u, attachPoint = "overhead", x = GetUnitX(u), y = GetUnitY(u), z = 0,
            life = duration, tint = false, isAnonymous = true, selfInteractions = MarkLifetime}
        record.dotMark = mark
        CreateObject(mark, model, 1)
    end
    AreaHit = function(object, amount)
        local weapon, checked = object.weapon, 0
        local started = SurvivorMetrics.Begin()
        SurvivorMetrics.Count(weapon .. ".area.calls")
        local candidates = AreaCandidates(object.x, object.y, object.radius, weapon)
        for _, u in ipairs(candidates) do
            if not RunSession.IsRunning() or not Alive(run.hero) then break end
            if AttackTarget(u) and (not object.enemiesOnly or Enemy(u))
                and not (object.groundOnly and IsUnitType(u, UNIT_TYPE_FLYING)) then
                checked = checked + 1
                local x, y, z = ImpactPoint(u)
                local dx, dy = x - object.x, y - object.y
                local dz = object.spherical and z - object.z or 0
                if dx * dx + dy * dy + dz * dz <= object.radius ^ 2 then
                    local damage = Sets.HomingDamage(object, Sets.ZoneRampDamage(object, u, amount))
                    Hit(u, damage, object.weapon, object.setProc, object.secondary, object.statusScale, object.status)
                    if object.markModel and Enemy(u) then MarkUnit(u, object.markModel, object.pulse + 0.15) end
                    if object.slow > 0 then Status.Slow(u, object.slow, object.slowDuration, object.weapon) end
                end
            end
        end
        ReleaseCandidates(candidates)
        SurvivorMetrics.Count(weapon .. ".area.distanceChecks", checked)
        SurvivorMetrics.End(weapon .. ".area", started)
    end
    local function ExtraZone(zone)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or zone.cleaned then return dt end
        zone.life = zone.life - dt
        if zone.life <= 0 or not Alive(run.hero) then ALICE_Kill(zone); return dt end
        zone.pulseClock = zone.pulseClock + dt
        if zone.pulseClock >= zone.pulse then
            zone.pulseClock = zone.pulseClock - zone.pulse
            if zone.weapon == "blizzard" then
                zone.snowAngle = (zone.snowAngle or 0) + 0.7
                for i = 1, 2 do
                    local angle = zone.snowAngle + i * math.pi
                    local x, y = zone.x + math.cos(angle) * zone.radius * 0.55, zone.y + math.sin(angle) * zone.radius * 0.55
                    CreateObject({identifier = "hsSnow", x = x, y = y, z = Height(x, y), life = 0.7,
                        isAnonymous = true, selfInteractions = ZoneLifetime}, [[Abilities\Spells\Human\Blizzard\BlizzardTarget.mdl]], 0.8)
                end
            end
            AreaHit(zone, zone.damage)
        end
        return dt
    end
    local function NewZone(id, x, y, w, damage, status)
        local model = id == "blizzard" and [[Abilities\Spells\Human\Blizzard\BlizzardTarget.mdl]]
            or w.model or SurvivorConfig.zoneModel
        CreateObject({identifier = "hsExtraZone", weapon = id, status = status, statusScale = w.statusScale,
            tint = w.tint, markModel = w.markModel, x = x, y = y, z = Height(x, y),
            radius = w.radius, damage = damage, life = w.duration, pulse = w.pulse, pulseClock = w.pulse,
            slow = w.slow, slowDuration = math.max(0.5, w.duration / 3) + (w.slowDurationBonus or 0), isStationary = true, isAnonymous = true,
            selfInteractions = ExtraZone}, model, math.min(2.5, w.radius / 230))
    end
    Residue = function(weapon, x, y)
        NewZone(weapon, x, y, {radius = 150, duration = 2, pulse = 0.5, slow = 0,
            model = SurvivorConfig.residueModel}, 0, {poison = 1, curse = 0, reaction = 0})
    end
    local function FallMeteor(meteor)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or meteor.cleaned then return dt end
        meteor.life = meteor.life - dt
        if not Alive(run.hero) then ALICE_Kill(meteor); return dt end
        meteor.z = meteor.groundZ + 750 * math.max(0, meteor.life / meteor.delay)
        BlzSetSpecialEffectPosition(meteor.visual, meteor.x, meteor.y, meteor.z)
        if meteor.life <= 0 then
            local w, x, y = meteor.profile, meteor.x, meteor.y
            local land = meteor.land
            ALICE_Kill(meteor)
            if land then land(); return dt end
            -- One impact only. The visual expires without a lingering damage callback.
            CreateObject({identifier = "hsMeteorImpact", weapon = "meteor", x = x, y = y, z = meteor.groundZ,
                life = 0.6, isAnonymous = true, selfInteractions = ZoneLifetime},
                SurvivorConfig.meteorImpactModel, math.min(2.5, w.radius / 230))
            AreaHit({x = x, y = y, z = meteor.groundZ, radius = w.radius, slow = 0, weapon = "meteor", statusScale = w.statusScale}, w.damage)
        end
        return dt
    end
    FallPayload = function(id, x, y, z, delay, model, scale, land, setProc)
        CreateObject({identifier = "hsFallingPayload", weapon = id, x = x, y = y, z = z + 750, groundZ = z,
            tint = SurvivorConfig.weapons[id].throwTint,
            life = delay, delay = delay, land = land, setProc = setProc, isAnonymous = true, selfInteractions = FallMeteor}, model, scale)
    end
    local function MoveOrb(orb)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or orb.cleaned then return dt end
        if not Alive(run.hero) or orb.life <= 0 then ALICE_Kill(orb); return dt end
        if not AttackTarget(orb.target) then
            orb.target = ALICE_GetClosestObject(orb.x, orb.y, "hsEnemy", orb.range, Enemy)
        end
        if orb.target then
            local tx, ty, tz = ImpactPoint(orb.target)
            local dx, dy, dz = tx - orb.x, ty - orb.y, tz - orb.z
            local distance = math.sqrt(dx * dx + dy * dy + dz * dz)
            orb.remaining = distance
            if distance > 0 then orb.dx, orb.dy, orb.dz = dx / distance, dy / distance, dz / distance end
        end
        orb.flightAge = (orb.flightAge or 0) + math.min(dt, orb.life)
        local step = math.min(orb.speed * math.min(dt, orb.life), orb.remaining)
        if not SurvivorStage.LineClear(orb.x, orb.y, orb.x + orb.dx * step, orb.y + orb.dy * step) then step = 0 end
        orb.x, orb.y, orb.z = orb.x + orb.dx * step, orb.y + orb.dy * step, orb.z + orb.dz * step
        orb.life, orb.remaining, orb.pulseClock = orb.life - dt, orb.remaining - step, orb.pulseClock + dt
        BlzSetSpecialEffectPosition(orb.visual, orb.x, orb.y, orb.z)
        orb.chainClock = (orb.chainClock or 0) + dt
        if orb.pulseClock >= orb.pulse then
            orb.pulseClock = orb.pulseClock - orb.pulse
            local primary = ALICE_GetClosestObject(orb.x, orb.y, "hsEnemy", orb.radius, Enemy)
            local px, py, pz
            if primary then px, py, pz = ImpactPoint(primary) end
            AreaHit(orb, orb.damage)
            if primary and orb.chainClock >= orb.chainInterval and RunSession.IsRunning() and not orb.cleaned then
                local target = ALICE_GetClosestObject(px, py, "hsEnemy", orb.chainRange,
                    function(u) return u ~= primary and Enemy(u) and SurvivorStage.LineClear(px, py, GetUnitX(u), GetUnitY(u)) end)
                if target then
                    orb.chainClock = 0
                    local tx, ty, tz = ImpactPoint(target)
                    local bolt = {identifier = "hsOrbChain", weapon = orb.weapon, x = tx, y = ty, z = tz,
                        life = 0.2, isAnonymous = true, selfInteractions = ZoneLifetime,
                        lightning = AddLightningEx(orb.weapon == "thunderorb" and "CLPB" or "SPLK", true, px, py, pz, tx, ty, tz)}
                    CreateObject(bolt, SurvivorConfig.chainHitModel, 0.5)
                    local damage = Sets.HomingDamage(orb, orb.damage) * orb.chainFraction
                    Hit(target, damage, orb.weapon, nil, nil, orb.statusScale)
                    if Sets.PrimaryTagAttack(orb, "연쇄") then
                        Sets.RelayEnd(orb.weapon, Enemy(target) and target or primary, Enemy(target) and damage or Sets.HomingDamage(orb, orb.damage))
                    end
                elseif Sets.PrimaryTagAttack(orb, "연쇄") then
                    Sets.RelayEnd(orb.weapon, primary, Sets.HomingDamage(orb, orb.damage))
                end
            end
        end
        return dt
    end
    local function SummonTarget(summon, w)
        local ground = w.summonKind == "zombie" or w.summonKind == "brute"
        return ALICE_GetClosestObject(GetUnitX(run.hero), GetUnitY(run.hero), "hsEnemy", w.range,
            function(u) return (ground and GroundEnemy(u) or not ground and Enemy(u))
                and SurvivorStage.LineClear(summon.x, summon.y, GetUnitX(u), GetUnitY(u)) end)
    end
    local function SummonAttack(summon, w, damage, scale)
        local target = SummonTarget(summon, w)
        if not target then return false end
        local tx, ty, tz = ImpactPoint(target)
        local reach = w.summonKind == "archer" and w.range or w.summonKind == "banshee" and 210
            or w.summonKind == "brute" and 160 or 85
        if (tx - summon.x)^2 + (ty - summon.y)^2 > reach^2 then return false end
        damage = Sets.SummonDamage(summon.weapon, damage, scale)
        BlzSetSpecialEffectYaw(summon.visual, Atan2(ty - summon.y, tx - summon.x))
        if BlzPlaySpecialEffect then BlzPlaySpecialEffect(summon.visual, ANIM_TYPE_ATTACK) end
        summon.motion = "attack"
        summon.animationTime = 0.35
        if w.summonKind == "archer" then
            CreateObject({identifier = "hsSummonArrow", weapon = summon.weapon, x = summon.x, y = summon.y, z = summon.z + 55,
                target = target, life = 3, remaining = w.range + 300, speed = 850, hitRadius = 24 * w.size,
                damage = damage, statusScale = scale, isAnonymous = true, selfInteractions = MoveMissile}, SurvivorConfig.missileModel, 0.65 * w.size)
        elseif w.summonKind == "zombie" then
            Hit(target, damage, summon.weapon, nil, nil, scale)
        else
            CreateObject({identifier = "hsSummonImpact", weapon = summon.weapon, x = tx, y = ty, z = tz, life = 0.4,
                isAnonymous = true, selfInteractions = ZoneLifetime}, w.summonKind == "banshee"
                    and [[Abilities\Spells\Undead\FrostNova\FrostNovaTarget.mdl]] or SurvivorConfig.slashModel, w.radius / 150)
            AreaHit({x = tx, y = ty, z = tz, radius = w.radius, slow = w.slow,
                slowDuration = 1.2, groundOnly = w.summonKind == "brute", weapon = summon.weapon, statusScale = scale}, damage)
        end
        return true
    end
    local function UpdateSummon(summon)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or summon.cleaned then return dt end
        if not Alive(run.hero) or summon.life <= 0 then ALICE_Kill(summon); return dt end
        local w = run.stats.weapons[summon.weapon]
        if not w or not w.enabled then ALICE_Kill(summon); return dt end
        summon.life, summon.attackClock, summon.aiClock = summon.life - dt, summon.attackClock + dt, summon.aiClock - dt
        summon.animationTime = math.max(0, (summon.animationTime or 0) - dt)
        if summon.aiClock <= 0 then
            summon.aiClock = 0.25
            summon.target = SummonTarget(summon, w)
        end
        local hx, hy = GetUnitX(run.hero), GetUnitY(run.hero)
        local angle = HeroYaw() + math.pi + (summon.slot - 1) * 0.65
        local tx, ty = hx + math.cos(angle) * 100, hy + math.sin(angle) * 100
        local reach = w.summonKind == "archer" and w.range * 0.8 or w.summonKind == "banshee" and 180
            or w.summonKind == "brute" and 120 or 60
        local moving = true
        if Enemy(summon.target) then
            tx, ty = GetUnitX(summon.target), GetUnitY(summon.target)
            if (tx - summon.x)^2 + (ty - summon.y)^2 <= reach^2 then moving = false end
        end
        if (hx - summon.x)^2 + (hy - summon.y)^2 > (w.range + 350)^2 then
            summon.x, summon.y, summon.target = hx + math.cos(angle) * 80, hy + math.sin(angle) * 80, nil
        elseif moving then
            local dx, dy = tx - summon.x, ty - summon.y
            local distance = math.sqrt(dx * dx + dy * dy)
            if distance > 16 then
                local step = math.min(w.speed * dt, distance)
                local nx, ny = summon.x + dx / distance * step, summon.y + dy / distance * step
                if nx > run.bounds.minX and nx < run.bounds.maxX and ny > run.bounds.minY and ny < run.bounds.maxY
                    and SurvivorStage.LineClear(summon.x, summon.y, nx, ny) then
                    summon.x, summon.y = nx, ny
                    BlzSetSpecialEffectYaw(summon.visual, Atan2(dy, dx))
                end
            else moving = false end
        end
        summon.z = Height(summon.x, summon.y)
        BlzSetSpecialEffectPosition(summon.visual, summon.x, summon.y, summon.z)
        if summon.attackClock >= w.pulse and SummonAttack(summon, w, w.damage, 1) then
            summon.attackClock = 0
        elseif summon.animationTime <= 0 and summon.motion ~= (moving and "walk" or "stand") then
            summon.motion = moving and "walk" or "stand"
            if BlzPlaySpecialEffect then BlzPlaySpecialEffect(summon.visual, moving and ANIM_TYPE_WALK or ANIM_TYPE_STAND) end
        end
        return dt
    end
    local function CastSummon(id, w, shot)
        local count = math.min(w.cap, w.count)
        if shot then
            -- Multicast is one extra helper attack, never an unbounded extra army.
            for actor in pairs(run.objects) do
                if actor.summon and actor.weapon == id and not actor.cleaned and actor.life > 0
                    and SummonAttack(actor, w, w.damage, w.statusScale or 0.5) then break end
            end
            return
        end
        for actor in pairs(run.objects) do
            if actor.summon and actor.weapon == id and not actor.cleaned then actor.life = w.duration end
        end
        while (run.summonCounts[id] or 0) < count do
            local slot = (run.summonCounts[id] or 0) + 1
            local angle = HeroYaw() + math.pi + (slot - 1) * 0.65
            local x, y = GetUnitX(run.hero) + math.cos(angle) * 80, GetUnitY(run.hero) + math.sin(angle) * 80
            x = math.max(run.bounds.minX + 32, math.min(run.bounds.maxX - 32, x))
            y = math.max(run.bounds.minY + 32, math.min(run.bounds.maxY - 32, y))
            CreateObject({identifier = "hsSummon", weapon = id, summon = true, slot = slot, opaque = true,
                x = x, y = y, z = Height(x, y), life = w.duration, attackClock = w.pulse, aiClock = 0,
                isAnonymous = true, selfInteractions = UpdateSummon}, w.model, (w.summonKind == "brute" and 0.8 or 0.9) * w.size)
            run.summonCounts[id] = slot
        end
    end
    local function MoveReturnBlade(blade)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or blade.cleaned then return dt end
        if not Alive(run.hero) or blade.life <= 0 then ALICE_Kill(blade); return dt end
        local oldX, oldY, dx, dy = blade.x, blade.y, blade.dx, blade.dy
        local step = blade.speed * math.min(dt, blade.life)
        if blade.returning then
            dx, dy = GetUnitX(run.hero) - blade.x, GetUnitY(run.hero) - blade.y
            local distance = math.sqrt(dx * dx + dy * dy)
            step = math.min(step, distance)
            if distance > 0 then dx, dy = dx / distance, dy / distance else dx, dy = 0, 0 end
        else step = math.min(step, blade.remaining) end
        blade.x, blade.y = blade.x + dx * step, blade.y + dy * step
        blade.z, blade.life = Height(blade.x, blade.y) + 65, blade.life - dt
        BlzSetSpecialEffectPosition(blade.visual, blade.x, blade.y, blade.z)
        BlzSetSpecialEffectYaw(blade.visual, Atan2(dy, dx))
        local leg = blade.leg
        local candidates = Candidates(oldX, oldY, blade.x, blade.y, blade.radius, blade.weapon)
        if run.stats.sets.tracker then
            local sx, sy = blade.x - oldX, blade.y - oldY
            table.sort(candidates, function(a, b)
                local ta = (GetUnitX(a) - oldX) * sx + (GetUnitY(a) - oldY) * sy
                local tb = (GetUnitX(b) - oldX) * sx + (GetUnitY(b) - oldY) * sy
                return ta < tb or ta == tb and GetHandleId(a) < GetHandleId(b)
            end)
        end
        for _, u in ipairs(candidates) do
            if blade.cleaned or not RunSession.IsRunning() then break end
            if GroundTarget(u) and blade.hitTimes[u] ~= leg
                and SegmentDistanceSquared(GetUnitX(u), GetUnitY(u), oldX, oldY, blade.x, blade.y) <= blade.radius ^ 2 then
                blade.hitTimes[u] = leg
                -- Putress scythes curse on the way out and punish cursed enemies on the way back.
                local status, damage = run.stats.status and run.stats.status[blade.weapon], blade.damage
                if status and blade.returning then
                    if Status.CurseStacks(run.units[u]) > 0 then damage = damage * (1 + status.returnBonus) end
                    status = {cursedBonus = status.cursedBonus, maxCurseBonus = status.maxCurseBonus, poison = 0, curse = 0, reaction = 0}
                end
                Hit(u, Sets.PierceDamage(blade, u, damage), blade.weapon, nil, nil, blade.statusScale, status)
            end
        end
        ReleaseCandidates(candidates)
        if blade.cleaned or not RunSession.IsRunning() then return dt end
        if blade.returning then
            local hx, hy = GetUnitX(run.hero) - blade.x, GetUnitY(run.hero) - blade.y
            if hx * hx + hy * hy <= 25 ^ 2 then
                -- Longevity buys additional travel/hits instead of unused maximum lifetime.
                local target = ALICE_GetClosestObject(blade.x, blade.y, "hsEnemy", blade.range, GroundTarget)
                local angle = HeroYaw()
                if target then angle = Atan2(GetUnitY(target) - blade.y, GetUnitX(target) - blade.x) end
                blade.dx, blade.dy = math.cos(angle), math.sin(angle)
                blade.remaining, blade.returning, blade.leg, blade.hitTimes = blade.range, false, leg + 1, {}
            end
        else
            blade.remaining = blade.remaining - step
            if blade.remaining <= 0 then blade.returning, blade.leg, blade.hitTimes = true, leg + 1, {} end
        end
        return dt
    end
    -- Profile-engine casts: engines[name].cast(id, shot). shot is nil for the weapon's own
    -- cast and carries the snapshot for a multicast extra attack. deliver(id, w, shot, x, y, z)
    -- receives the live weapon (or snapshot) and the hero's impact point.
    local function ProfileCast(deliver)
        return function(id, shot)
            local w = shot and shot.weapon or run.stats.weapons[id]
            if not w or not w.enabled or not RunSession.IsRunning() or not Alive(run.hero) then return end
            deliver(id, w, shot, ImpactPoint(run.hero))
        end
    end
    -- The closest target in range and its impact point; nil when none is in range.
    local function ProfileTarget(w, x, y, filter)
        local target = ALICE_GetClosestObject(x, y, "hsEnemy", w.range, filter)
        if not target then return nil end
        return target, ImpactPoint(target)
    end
    local engines = SurvivorConfig.weaponEngines
    engines.summon.cast = ProfileCast(CastSummon)
    engines.nova.cast = ProfileCast(function(id, w, _, x, y, z)
        -- Reservoir sampling gives every living enemy in range the same chance.
        local target, count = nil, 0
        local candidates = AreaCandidates(x, y, w.range, "frostnovaSelection")
        for _, u in ipairs(candidates) do
            if AttackTarget(u) then
                local dx, dy = GetUnitX(u) - x, GetUnitY(u) - y
                if dx * dx + dy * dy <= w.range * w.range then
                    count = count + 1
                    if GetRandomInt(1, count) == 1 then target = u end
                end
            end
        end
        ReleaseCandidates(candidates)
        if not target then return end
        x, y, z = ImpactPoint(target)
        CreateObject({identifier = "hsNova", weapon = id, x = x, y = y, z = Height(x, y) + GetUnitFlyHeight(target), life = 0.6,
            isAnonymous = true, selfInteractions = ZoneLifetime}, w.model or [[Abilities\Spells\Undead\FrostNova\FrostNovaTarget.mdl]], w.radius / 150)
        AreaHit({x = x, y = y, z = z, radius = w.radius, slow = w.slow, statusScale = w.statusScale,
            slowDuration = w.duration + (w.slowDurationBonus or 0), weapon = id}, w.damage)
    end)
    -- A field lands on the target (spread for an extra attack); thrown fields arc there first.
    engines.field.cast = ProfileCast(function(id, w, shot, x, y, z)
        local target, tx, ty, tz = ProfileTarget(w, x, y, AttackTarget)
        if not target then return end
        tx, ty = SpreadPoint(tx, ty, w.radius * 0.8, shot)
        if w.thrown then
            Throw(x, y, z, tx, ty, tz, w.speed, 0, function() NewZone(id, tx, ty, w, w.damage) end,
                w.throwScale, w.throwModel, id)
            return
        end
        NewZone(id, tx, ty, w, w.damage)
    end)
    -- A meteor (or a falling jar) drops on the target point and hits once on impact.
    engines.meteor.cast = ProfileCast(function(id, w, shot, x, y, z)
        local target, tx, ty, tz = ProfileTarget(w, x, y, AttackTarget)
        if not target then return end
        tx, ty = SpreadPoint(tx, ty, w.radius * 0.8, shot)
        if not (shot and shot.index) and Enemy(target) then
            Sets.RecordFallingCast(id, tx, ty, tz, w.damage, w.radius, w.throwModel or SurvivorConfig.meteorModel,
                w.falling and (w.throwScale or 1) * 0.6 or 0.7 * w.size)
        end
        if w.falling then
            -- Only the weapon's own cast splits jars; an extra attack's jar lands whole.
            local status = not shot and run.stats.status and run.stats.status[id]
            local function Land(lx, ly, lz, scale, split)
                CreateObject({identifier = "hsJarImpact", weapon = id, tint = false, x = lx, y = ly, z = lz, life = 0.5,
                    isAnonymous = true, selfInteractions = ZoneLifetime}, SurvivorConfig.jarExplosionModel, w.radius / 150)
                AreaHit({x = lx, y = ly, z = lz, radius = w.radius, slow = 0, weapon = id, statusScale = w.statusScale}, w.damage * scale)
                for k = 1, split and status and status.splitJars or 0 do
                    local angle = k * 2 * math.pi / status.splitJars
                    local sx, sy = lx + math.cos(angle) * 150, ly + math.sin(angle) * 150
                    FallPayload(id, sx, sy, Height(sx, sy), 0.45, w.throwModel, (w.throwScale or 1) * 0.6,
                        function() Land(sx, sy, Height(sx, sy), 0.4, false) end)
                end
            end
            FallPayload(id, tx, ty, tz, w.delay, w.throwModel, w.throwScale or 1, function() Land(tx, ty, tz, 1, true) end)
            return
        end
        CreateObject({identifier = "hsMeteor", x = tx, y = ty, z = tz + 750, groundZ = tz,
            profile = w, life = w.delay, delay = w.delay, isAnonymous = true, selfInteractions = FallMeteor}, SurvivorConfig.meteorModel, 1.8 * w.size)
    end)
    -- Orbs chase their target in 3D; returning blades fly flat to range and back.
    local function LaunchProjectile(id, w, shot, x, y, z, filter, orb)
        local target, tx, ty, tz = ProfileTarget(w, x, y, filter)
        if not target then return end
        local dx, dy, dz = tx - x, ty - y, orb and tz - z or 0
        local distance = math.sqrt(dx * dx + dy * dy + dz * dz)
        if distance < 1 then local yaw = HeroYaw(); dx, dy, dz, distance = math.cos(yaw), math.sin(yaw), 0, 1 end
        -- Putress models keep their own colours; only Anya's glaive is tinted.
        local object = {identifier = orb and "hsOrb" or w.model and "hsScythe" or "hsReturnBlade", weapon = id, opaque = w.opaque,
            x = x, y = y, z = z, dx = dx / distance, dy = dy / distance, dz = dz / distance,
            life = w.duration, remaining = w.range, range = w.range, leg = 1, speed = w.speed, radius = w.radius, damage = w.damage,
            pulse = w.pulse, pulseClock = 0, spherical = true, slow = 0, hitTimes = {}, target = orb and target or nil,
            chainClock = 0, chainInterval = w.chainInterval, chainRange = w.chainRange, chainFraction = w.chainFraction,
            tagExtra = shot and shot.index ~= nil, isAnonymous = true, selfInteractions = orb and MoveOrb or MoveReturnBlade}
        object.statusScale = w.statusScale
        CreateObject(object, w.model or (orb and [[Abilities\Spells\Orc\LightningShield\LightningShieldTarget.mdl]] or SurvivorConfig.bladeModel),
            w.size * (w.modelScale or 1))
    end
    engines.orb.cast = ProfileCast(function(id, w, shot, x, y, z) LaunchProjectile(id, w, shot, x, y, z, AttackTarget, true) end)
    engines.boomerang.cast = ProfileCast(function(id, w, shot, x, y, z) LaunchProjectile(id, w, shot, x, y, z, GroundTarget, false) end)
    -- Any engine's cast by weapon id; shot as for the engine casts above.
    function SurvivorCombat.CastExtra(id, shot)
        return engines[SurvivorConfig.weapons[id].engine].cast(id, shot)
    end
    local function MoveFrost(shard)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or shard.cleaned then return dt end
        if not Alive(run.hero) or shard.life <= 0 or shard.remaining <= 0 then ALICE_Kill(shard); return dt end
        local step = math.min(shard.speed * math.min(dt, shard.life), shard.remaining)
        local dx, dy, dz = shard.dx * step, shard.dy * step, shard.dz * step
        if not SurvivorStage.LineClear(shard.x, shard.y, shard.x + dx, shard.y + dy) then ALICE_Kill(shard); return dt end
        local length, hits = dx * dx + dy * dy + dz * dz, {}
        local candidates = Candidates(shard.x, shard.y, shard.x + dx, shard.y + dy, shard.hitRadius, shard.weapon)
        for _, u in ipairs(candidates) do
            if AttackTarget(u) and not shard.hitTimes[u] then
                local tx, ty, tz = ImpactPoint(u)
                local t = length > 0 and math.max(0, math.min(1,
                    ((tx - shard.x) * dx + (ty - shard.y) * dy + (tz - shard.z) * dz) / length)) or 0
                local rx, ry, rz = tx - shard.x - t * dx, ty - shard.y - t * dy, tz - shard.z - t * dz
                if rx * rx + ry * ry + rz * rz <= shard.hitRadius * shard.hitRadius then hits[#hits + 1] = {unit = u, t = t} end
            end
        end
        ReleaseCandidates(candidates)
        -- Consume limited pierces from nearest to farthest, not Lua table iteration order.
        table.sort(hits, function(a, b) return a.t < b.t or a.t == b.t and GetHandleId(a.unit) < GetHandleId(b.unit) end)
        for _, hit in ipairs(hits) do
            local u = hit.unit
            if AttackTarget(u) then
                shard.hitTimes[u] = true
                Hit(u, Sets.PierceDamage(shard, u, shard.damage), shard.weapon, false, shard.secondary, shard.statusScale)
                if shard.cleaned or not RunSession.IsRunning() then return dt end
                if shard.slow > 0 then Status.Slow(u, shard.slow, shard.slowDuration, shard.weapon) end
                if Enemy(u) and shard.evolution == "lance" and not shard.secondary then
                    local record, lance = run.units[u], shard.modeValues
                    record.spearHits = math.min(lance.hits, (record.spearHits or 0) + 1)
                    if record.spearHits >= lance.hits and Status.Freeze(u, lance.freeze) then record.spearHits = 0 end
                end
                shard.pierces = shard.pierces - 1
                if shard.pierces <= 0 then ALICE_Kill(shard); return dt end
            end
        end
        shard.x, shard.y, shard.z = shard.x + dx, shard.y + dy, shard.z + dz
        shard.remaining, shard.life = shard.remaining - step, shard.life - dt
        BlzSetSpecialEffectPosition(shard.visual, shard.x, shard.y, shard.z)
        return dt
    end
    function SurvivorCombat.FireFrostShard(shot)
        local w = ShotWeapon(shot, "pierce")
        if not RunSession.IsRunning() or not Alive(run.hero) or not w.enabled then return end
        local x, y, z = ImpactPoint(run.hero)
        local target = ALICE_GetClosestObject(x, y, "hsEnemy", w.range,
            function(u) return AttackTarget(u) and SurvivorStage.LineClear(x, y, GetUnitX(u), GetUnitY(u)) end)
        if not target then return end
        local tx, ty, tz = ImpactPoint(target)
        local dx, dy, dz = tx - x, ty - y, tz - z
        local distance = math.sqrt(dx * dx + dy * dy + dz * dz)
        if distance < 1 then local yaw = HeroYaw(); dx, dy, dz, distance = math.cos(yaw), math.sin(yaw), 0, 1 end
        dx, dy, dz = dx / distance, dy / distance, dz / distance
        local count = w.count or 1
        for k = 1, count do
            -- Extra shards fan out horizontally around the aimed direction.
            local turn = (k - (count + 1) / 2) * 0.17
            local cos, sin = math.cos(turn), math.sin(turn)
            local sx, sy = dx * cos - dy * sin, dx * sin + dy * cos
            local shard = {identifier = "hsFrostShard", weapon = w.weaponId, statusScale = w.statusScale, x = x, y = y, z = z, yaw = 0,
                dx = sx, dy = sy, dz = dz, speed = w.speed,
                life = w.lifetime, remaining = w.range, hitRadius = w.hitRadius,
                damage = w.damage, pierces = w.pierce, hitTimes = {}, tagExtra = shot and shot.index ~= nil,
                slow = w.slow, slowDuration = w.slowDuration, evolution = w.evolution, modeValues = w.modeValues,
                isAnonymous = true, selfInteractions = MoveFrost}
            CreateObject(shard, w.model or SurvivorConfig.frostModel, w.scale)
            FaceMissile(shard, sx, sy, dz)
        end
    end
    -- A slowed enemy's death bursts into shards from the weapon evolved into "shatter"
    -- (its modeValues give range, count, damage and shard shape); the shards are its damage.
    Shatter = function(dead, record)
        if run.hitSecondary then return end
        local id, frost
        for _, weapon in ipairs(SurvivorConfig.weaponOrder) do
            local w = run.stats.weapons[weapon]
            if w and w.evolution == "shatter" then id, frost = weapon, w; break end
        end
        local now = RunSession.GetElapsed()
        if not frost or now < run.shatterReady then return end
        local slowed = false
        for _, slow in pairs(record.slows or {}) do if slow.expires > now then slowed = true end end
        if not slowed then return end
        local mode = frost.modeValues
        local range, count = mode.range, mode.targets
        run.shatterReady = now + mode.cooldown -- Bound dense-wave secondary effects; secondary kills never repeat it.
        local x, y, z = ImpactPoint(dead)
        local candidates, nearest = Candidates(x, y, x, y, range, "shatter.area"), {}
        for _, u in ipairs(candidates) do
            local tx, ty = GetUnitX(u), GetUnitY(u)
            local distance = (tx - x)^2 + (ty - y)^2
            if Enemy(u) and distance <= range^2 and SurvivorStage.LineClear(x, y, tx, ty) then
                local handle, position = GetHandleId(u), 1
                while nearest[position] and (nearest[position].distance < distance
                    or nearest[position].distance == distance and nearest[position].handle < handle) do position = position + 1 end
                if position <= count then
                    table.insert(nearest, position, {unit = u, x = tx, y = ty, distance = distance, handle = handle})
                    nearest[count + 1] = nil
                end
            end
        end
        ReleaseCandidates(candidates)
        for _, target in ipairs(nearest) do
            local offset = SurvivorConfig.missileImpactHeightByType[GetUnitTypeId(target.unit)] or SurvivorConfig.missileImpactHeight
            local tx, ty, tz = target.x, target.y, Height(target.x, target.y) + GetUnitFlyHeight(target.unit) + offset
            local dx, dy, dz = tx - x, ty - y, tz - z
            local length = math.max(1, math.sqrt(dx^2 + dy^2 + dz^2))
            local shard = {identifier = "hsFrostShard", weapon = id, x = x, y = y, z = z, yaw = 0,
                dx = dx/length, dy = dy/length, dz = dz/length, speed = frost.speed, life = mode.life, remaining = range,
                hitRadius = mode.hitRadius, damage = frost.damage * mode.damage, pierces = 1, hitTimes = {}, secondary = true,
                slow = frost.slow, slowDuration = mode.slowDuration, isAnonymous = true, selfInteractions = MoveFrost}
            CreateObject(shard, SurvivorConfig.frostModel, mode.scale)
            FaceMissile(shard, dx, dy, dz)
        end
    end
    -- Core-engine casts take a shot ({weapon = stats or snapshot, index}); their own cast
    -- fires the weapon's live stats.
    local function CoreCast(fire)
        return function(id, shot) fire(shot or {weapon = run.stats.weapons[id]}) end
    end
    engines.missile.cast = CoreCast(SurvivorCombat.FireMissile)
    engines.zone.cast = CoreCast(SurvivorCombat.CreateZone)
    engines.chain.cast = CoreCast(SurvivorCombat.CastChainLightning)
    engines.orbit.cast = CoreCast(SurvivorCombat.CastBlades)
    engines.strike.cast = CoreCast(SurvivorCombat.CastMonsoon)
    engines.cone.cast = CoreCast(SurvivorCombat.CastFrontSlash)
    engines.pierce.cast = CoreCast(SurvivorCombat.FireFrostShard)
    for name, engine in pairs(engines) do assert(engine.cast, "Weapon engine needs a cast " .. name) end
    local function EngineOf(id)
        local weapon = SurvivorConfig.weapons[id]
        return weapon and engines[weapon.engine]
    end
    -- shot is nil for the weapon's own cast, or an extra attack's {weapon = snapshot, index}.
    local function DispatchWeapon(id, shot)
        EngineOf(id).cast(id, shot)
    end
    local function ExtraAttack(pending)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or pending.cleaned then return dt end
        pending.life = pending.life - dt
        if pending.life > 0 then return dt end
        local id, shot = pending.weapon, pending.shot
        ALICE_Kill(pending)
        if Alive(run.hero) then DispatchWeapon(id, shot) end -- Raw cast: never schedules more extra attacks.
        return dt
    end
    function SurvivorCombat.CastWeapon(id)
        if not RunSession.IsRunning() or not Alive(run.hero) then return end
        local engine, w = EngineOf(id), run.stats.weapons[id]
        if not engine or not w or not w.enabled then return end
        DispatchWeapon(id)
        -- A volley spawns base and extra blades together; no delayed single-blade casts.
        if engine.volley or not RunSession.IsRunning() or not run.stats or run.stats.multiCount == 0 then return end
        -- Extra attacks fire from a snapshot: individual projectiles/strikes (single = 1),
        -- never copies of an entire volley, applying half the status stacks (at least one).
        local snapshot = {}
        for key, value in pairs(run.stats.weapons[id]) do snapshot[key] = value end
        snapshot.damage = snapshot.damage * run.stats.multiDamage
        if engine.single then snapshot[engine.single] = 1 end
        snapshot.statusScale = 0.5
        for i = 1, run.stats.multiCount do
            local pending = {identifier = "hsExtraAttack", x = GetUnitX(run.hero), y = GetUnitY(run.hero), z = 0,
                weapon = id, shot = {weapon = snapshot, index = i}, life = i * 0.18,
                isAnonymous = true, selfInteractions = ExtraAttack, destroy = DestroyObject}
            run.objects[pending] = true
            ALICE_Create(pending)
        end
    end
    -- Advance every weapon's cooldown clock by one lifecycle tick and return the weapons
    -- now due, in cast order, split by engine phase: early (fired before status upkeep)
    -- and late (fired after the tick's spawns). An unowned weapon has no cooldown
    -- accumulation and cannot fire; a carry engine keeps its overshoot.
    function SurvivorCombat.TickWeapons(dt)
        local early, late = {}, {}
        for _, id in ipairs(SurvivorConfig.weaponOrder) do
            local engine, weapon = EngineOf(id), run.stats.weapons[id]
            local enabled = weapon and weapon.enabled
            local clock = enabled and (run.weaponClocks[id] or 0) + dt or 0
            local interval = enabled and weapon.interval
            if enabled and clock >= interval then
                clock = engine.carry and clock - interval or 0
                local due = engine.phase == "early" and early or late
                due[#due + 1] = id
            end
            run.weaponClocks[id] = clock
        end
        return early, late
    end
    function SurvivorCombat.CastWeapons(ids)
        for _, id in ipairs(ids) do SurvivorCombat.CastWeapon(id) end
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
        if SurvivorNativeLoadout and SurvivorNativeLoadout.RefreshStatDisplays then SurvivorNativeLoadout.RefreshStatDisplays() end
        if run.inventoryFrozen then
            BlzUnitDisableAbility(run.hero, FourCC("Amov"), false, false)
        end
        for u, record in pairs(run.units) do
            if SurvivorConfig.UnitExists(u) then
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
        if SurvivorConfig.UnitExists(u) then Status.Color(u, record, false, true) end
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
        if SurvivorConfig.UnitExists(run.hero) then
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
            if SurvivorConfig.ItemExists(item) then CleanupCall(errors, "bonus item", function() RemoveItem(item) end) end
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
        TriggerRegisterPlayerUnitEvent(run.bonusPickupTrigger, SurvivorConfig.Owner(), EVENT_PLAYER_UNIT_PICKUP_ITEM, nil)
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
                    procOk, procError = pcall(function() Shatter(dead, record); Sets.StatusDeath(dead, record) end)
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
        Enemy = Enemy, GroundTarget = GroundTarget, UnitTimeStopped = UnitTimeStopped, HostileStopped = HostileStopped,
        SetUnitPause = SetUnitPause, UnitTime = UnitTime,
        Hit = Hit, AreaHit = AreaHit, HurtHero = Hero.HurtHero, Residue = Residue, StopUnitTime = StopUnitTime,
        Candidates = Candidates, AreaCandidates = AreaCandidates, ReleaseCandidates = ReleaseCandidates,
        ImpactPoint = ImpactPoint, FaceMissile = FaceMissile, ProcVisual = ProcVisual, FallPayload = FallPayload,
        CreateObject = CreateObject, DestroyObject = DestroyObject, TrackHostile = TrackHostile, ZoneLifetime = ZoneLifetime,
        WarningStrip = WarningStrip, SegmentDistanceSquared = SegmentDistanceSquared, MoveEnemy = Enemies.Move,
        HeroYaw = HeroYaw, MeleeGuard = Sets.MeleeGuard,
        TagSecondary = function() return run.tagSecondary end,
        Stage = function() return run.stage end, Boss = function() return run.boss end,
        BossDefeated = function() return run.bossDefeated end, Bounds = function() return run.bounds end,
        EnemyCount = function() return run.enemyCount end,
        -- Friendly effects dim while any warning is pending.
        ExtendWarning = function(untilTime) run.warningUntil = math.max(run.warningUntil, untilTime) end,
    }
    Status.Bind(primitives)
    Sets.Bind(primitives)
    Hazards.Bind(primitives)
    Supplies.Bind(primitives)
    Hero.Bind(primitives)
    Enemies.Bind(primitives)
    -- Public combat API served by the extracted modules.
    SurvivorCombat.Spawn, SurvivorCombat.SpawnBoss, SurvivorCombat.SpawnCourier = Enemies.Spawn, Enemies.SpawnBoss, Enemies.SpawnCourier
    SurvivorCombat.ReleaseCourier, SurvivorCombat.PurgeNearby = Enemies.Release, Supplies.PurgeNearby
    SurvivorCombat.WardStatus, SurvivorCombat.GrantSearchRecovery = Hero.WardStatus, Hero.GrantSearchRecovery
    SurvivorCombat.StageEscapeUses, SurvivorCombat.DamageHistory, SurvivorCombat.EscapeStatus = Hero.StageEscapeUses, Hero.DamageHistory, Hero.EscapeStatus
    SurvivorCombat.WarnLava, SurvivorCombat.WarnRush = Hazards.WarnLava, Hazards.WarnRush
end
