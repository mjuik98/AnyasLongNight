-- ALICE owns scheduling, missile actors, target enumeration and zone pairs.
-- The run owns every created unit/effect and removes them on finish/restart.
SurvivorCombat = {}
do
    local hero, heightLocation, deathTrigger = nil, nil, nil
    local units, objects, statusUnits, frostStackUnits, poisonUnits = {}, {}, {}, {}, {}
    local stats, onKill, onDeath, onBonus, bounds = nil, nil, nil, nil, nil
    local enemyCount, frozen = 0, false
    local bonusCount, nextBonusAt = 0, 0
    local bonusItems, bonusPickupTrigger = {}, nil
    local timeStopUntil, timeStopBossUntil, purging = 0, 0, false
    local timeStopUnits, hostileObjects = {}, {}
    local UpdateBonusItems
    local inventoryFrozen, inventoryVitals = false, nil
    local stage, stageStarted, damageTotals, warningUntil = 1, 0, {}, 0
    -- Per hero and stage; the playing hero speaks its own escape line.
    local escapeLines = {
        anya = {"위험했네… 여기서 벗어나자.", "불길이 코앞이었어. 빠지자.", "냉기가 스며들기 전에 물러나자.",
            "포위됐어. 길을 다시 열자.", "물길로 빠지자. 아직 끝나지 않았어."},
        putress = {"이미 썩은 몸이라도 여기서 끝날 순 없지.", "불길은 시약까지 태워 버려. 일단 물러나지.", "약병이 얼기 전에 자리를 옮기지.",
            "포위라… 계산이 틀렸군. 다시 길을 내지.", "물길로 빠진다. 아직 데려갈 자가 남았어."},
    }
    local difficulty = SurvivorConfig.difficulties.normal
    local Slow, SetHit, ExpireEmber, ZoneLifetime, ApplyStatus, Throw, StatusDeath, Residue
    local soulReady, inStatusProc = 0, false
    local stormHits, stormReady, bladeReady = 0, 0, 0
    local boss, bossDefeated = nil, false
    local damageTrigger, escapeEffect = nil, nil
    local escapeOwnsInvulnerability = false
    local escapeReady, escapeUntil, escapeUses, eliteSerial = true, 0, 0, 0
    local ward, wardUntil, damageContext, hitSecondary = 0, 0, nil, false
    local recentDamage, stageEscapeUses = {}, {}
    local shatterReady = 0
    local Shatter, Freeze
    local queryGroup, candidatePool = nil, {}
    local clearTimer, clearGeneration, clearing = nil, 0, false
    local friendlyAlpha = 140
    local enemyOwners, enemyOwnerSerial = nil, 0
    local orderSerial, orderPhase = 0, 0
    local summonCounts = {}
    local FallPayload, AreaHit, RecordFallingCast, RelayEnd
    local tagState = {summon = {}, fall = {}, relay = {}, burstHits = 0, burstReady = 0, meleeUntil = 0}
    local tagSecondary = false
    local function HasTag(id, wanted)
        local weapon = SurvivorConfig.weapons[id]
        for _, tag in ipairs(weapon and weapon.tags or {}) do if tag == wanted then return true end end
        return false
    end

    local function CleanupCall(errors, label, action)
        local ok, message = pcall(action)
        if not ok then errors[#errors + 1] = label .. ": " .. tostring(message) end
        return ok
    end

    local function HurtHero(source, amount, name, hint)
        local previous = damageContext
        damageContext = {name = name, hint = hint}
        local ok, message = pcall(UnitDamageTarget, source, hero, amount, false, false, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS)
        damageContext = previous
        if not ok then error(message) end
    end
    function SurvivorCombat.WardStatus()
        return RunSession.GetElapsed() < wardUntil and ward or 0, math.max(0, wardUntil - RunSession.GetElapsed())
    end
    function SurvivorCombat.GrantSearchRecovery()
        local maximum, before = BlzGetUnitMaxHP(hero), GetWidgetLife(hero)
        local heal = math.min(maximum * 0.25, math.max(0, maximum - before))
        SetWidgetLife(hero, before + heal)
        ward = maximum * 0.25 - heal
        wardUntil = ward > 0 and RunSession.GetElapsed() + 12 or 0
        return string.format("생명력 %.0f 회복", heal) .. (ward > 0 and string.format(" / 초과분 보호막 %.0f (12초)", ward) or "")
    end
    function SurvivorCombat.StageEscapeUses(index) return stageEscapeUses[index] or 0 end
    function SurvivorCombat.DamageHistory()
        local lines, now = {}, RunSession.GetElapsed()
        for _, entry in ipairs(recentDamage) do
            if now - entry.time <= 8 then
                lines[#lines + 1] = string.format("%.1f초 전 · %s · %s", now - entry.time, entry.name,
                    entry.escaped and "그림자 탈출" or string.format("피해 %.0f", entry.damage))
            end
        end
        local last = recentDamage[#recentDamage]
        return table.concat(lines, "\n"), last and last.hint or "위험 표식 바깥으로 이동하고 장비·성장 구성을 점검하세요."
    end

    function SurvivorCombat.EscapeStatus()
        return escapeReady, math.max(0, escapeUntil - RunSession.GetElapsed()), escapeUses
    end
    local function ClearEscape()
        local effect, release = escapeEffect, escapeOwnsInvulnerability
        escapeEffect, escapeOwnsInvulnerability = nil, false
        escapeUntil = 0
        local errors = {}
        if release and hero ~= nil and GetUnitTypeId(hero) ~= 0 then
            CleanupCall(errors, "escape invulnerability", function() SetUnitInvulnerable(hero, false) end)
        end
        if effect then CleanupCall(errors, "escape effect", function() DestroyEffect(effect) end) end
        if #errors > 0 then error(table.concat(errors, "\n"), 0) end
    end

    function SurvivorCombat.TrackWeapons(ids)
        for _, id in ipairs(ids) do
            if not damageTotals[id] then
                damageTotals[id] = {damage = 0, stageDamage = 0, bossDamage = 0, slowSeconds = 0,
                    ownedAt = RunSession.GetElapsed()}
            end
        end
    end
    function SurvivorCombat.DamageRows(ids)
        local rows, now = {}, RunSession.GetElapsed()
        for _, id in ipairs(ids) do
            local data = damageTotals[id]
            if data then
                rows[#rows + 1] = {id = id, damage = data.damage, stageDamage = data.stageDamage,
                    bossDamage = data.bossDamage, slowSeconds = data.slowSeconds,
                    dps = data.damage / math.max(0.02, now - data.ownedAt)}
            end
        end
        return rows
    end

    local function Alive(u)
        return u ~= nil and GetUnitTypeId(u) ~= 0 and UnitAlive(u)
    end
    local function Enemy(u)
        local record = units[u]
        return record ~= nil and record.enemy and record.alive and Alive(u)
    end
    local function AttackTarget(u)
        local record = units[u]
        return record ~= nil and (record.enemy or record.bonus) and record.alive and Alive(u)
    end
    local function GroundTarget(u)
        return AttackTarget(u) and not IsUnitType(u, UNIT_TYPE_FLYING)
    end
    local function GroundEnemy(u)
        return Enemy(u) and not IsUnitType(u, UNIT_TYPE_FLYING)
    end
    local function UnitTimeStopped(u, now)
        local record = units[u]
        return record ~= nil and record.timeStopUntil ~= nil and record.timeStopUntil > (now or RunSession.GetElapsed())
    end
    local function HostileStopped(object)
        if not object.hostile then return false end
        -- Keep source-bound motion synchronized with the unit's pause state.
        if object.identifier == "hsBossSpecial" and not object.trail then return UnitTimeStopped(object.source) end
        return RunSession.GetElapsed() < timeStopUntil
    end
    local function EnemyColor(u, record, stopped, restore)
        local color = record.baseColor or {255, 255, 255, 255}
        local now, tint = RunSession.GetElapsed(), nil
        local palette = SurvivorConfig.statusColors
        if not restore and record.alive then
            local slowed = now < (record.freezeUntil or 0)
            if record.slows then
                for _, slow in pairs(record.slows) do
                    if slow.amount > 0 and slow.expires > now then slowed = true; break end
                end
            end
            if slowed then tint = palette.slow
            elseif (record.poison or 0) > 0 and now < (record.poisonUntil or 0) then tint = palette.poison
            elseif (record.curse or 0) > 0 and now < (record.curseUntil or 0) then tint = palette.curse end
        end
        if stopped == nil then stopped = UnitTimeStopped(u) end
        local brightness = stopped and SurvivorConfig.bonusProps.timeStopBrightness or 1
        local strength = tint and palette.strength or 0
        local r = math.floor((color[1] * (1 - strength) + (tint and tint[1] or 0) * strength) * brightness)
        local g = math.floor((color[2] * (1 - strength) + (tint and tint[2] or 0) * strength) * brightness)
        local b = math.floor((color[3] * (1 - strength) + (tint and tint[3] or 0) * strength) * brightness)
        local cached = record.displayColor
        if not cached or cached[1] ~= r or cached[2] ~= g or cached[3] ~= b or cached[4] ~= color[4] then
            SetUnitVertexColor(u, r, g, b, color[4])
            record.displayColor = {r, g, b, color[4]}
        end
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
        object.hostile = object.identifier:find("Enemy") ~= nil or object.identifier:find("Boss") ~= nil
        if object.hostile then
            hostileObjects[object] = true
            ObjectTimeScale(object, frozen or HostileStopped(object))
        end
    end
    local function StopUnitTime(u, record, deadline)
        local now = RunSession.GetElapsed()
        if deadline <= now or not Enemy(u) then return end
        if not record.timeStopUntil then
            record.timeStopStarted = now
            if record.special then record.timeStopWasPaused = record.special.sourceWasPaused == true
            elseif record.freezeUntil then record.timeStopWasPaused = record.freezeWasPaused == true
            else record.timeStopWasPaused = IsUnitPaused(u) end
        end
        record.timeStopUntil = deadline
        timeStopUnits[u] = true
        PauseUnit(u, true)
        SetUnitTimeScale(u, 0)
        EnemyColor(u, record, true)
        if record.cosmetic then BlzSetSpecialEffectTimeScale(record.cosmetic, 0) end
    end
    local function ReleaseUnitTime(u, record, now)
        local duration = math.max(0, math.min(now, record.timeStopUntil) - record.timeStopStarted)
        for _, key in ipairs({"nextShot", "nextBlast", "nextTrait", "supportAt"}) do
            if record[key] then record[key] = record[key] + duration end
        end
        record.wasPaused = record.timeStopWasPaused
        if GetUnitTypeId(u) ~= 0 then EnemyColor(u, record, false) end
        if Alive(u) then
            PauseUnit(u, frozen or record.timeStopWasPaused == true or record.special ~= nil
                or (record.freezeUntil ~= nil and record.freezeUntil > now))
            SetUnitTimeScale(u, frozen and 0 or 1)
            if record.cosmetic then BlzSetSpecialEffectTimeScale(record.cosmetic, frozen and 0 or 1) end
        end
        record.timeStopUntil, record.timeStopStarted, record.timeStopWasPaused = nil, nil, nil
        timeStopUnits[u] = nil
    end
    local function RefreshTimeStopFilter(immediate)
        if SurvivorUI.SetTimeStopFilter then
            SurvivorUI.SetTimeStopFilter(not immediate and not frozen and RunSession.IsRunning()
                and RunSession.GetElapsed() < timeStopUntil, immediate)
        end
    end
    local function UpdateTimeStop(now, force)
        if timeStopUntil == 0 and next(timeStopUnits) == nil and not force then return end
        for u in pairs(timeStopUnits) do
            local record = units[u]
            if not record or not record.alive then timeStopUnits[u] = nil
            elseif now >= record.timeStopUntil then ReleaseUnitTime(u, record, now) end
        end
        for object in pairs(hostileObjects) do
            local stopped = frozen or HostileStopped(object)
            if object.timeStopVisualFrozen ~= stopped then ObjectTimeScale(object, stopped) end
        end
        if now >= timeStopUntil and next(timeStopUnits) == nil then timeStopUntil, timeStopBossUntil = 0, 0 end
        RefreshTimeStopFilter()
    end
    local function ResetTimeStop()
        local now = RunSession.GetElapsed()
        for u in pairs(timeStopUnits) do
            if units[u] then ReleaseUnitTime(u, units[u], now) end
        end
        timeStopUntil, timeStopBossUntil = 0, 0
        RefreshTimeStopFilter(true)
        UpdateTimeStop(now, true)
    end
    function SurvivorCombat.StopTime()
        if not RunSession.IsRunning() or not Alive(hero) then return end
        local now, config = RunSession.GetElapsed(), SurvivorConfig.bonusProps
        timeStopUntil = math.max(timeStopUntil, now + config.timeStopDuration)
        timeStopBossUntil = math.max(timeStopBossUntil, now + config.timeStopBossDuration)
        for u, record in pairs(units) do
            if Enemy(u) then StopUnitTime(u, record, record.boss and timeStopBossUntil or timeStopUntil) end
        end
        UpdateTimeStop(now)
    end
    -- Query the engine's current spatial index, then keep the original narrow-phase
    -- geometry. The enclosing circle also covers fast/diagonal/zero-length sweeps.
    -- Snapshot before dealing damage: nested death/set effects may enumerate again.
    local function Candidates(ax, ay, bx, by, radius, weapon)
        local started = SurvivorMetrics.Begin()
        local list = table.remove(candidatePool) or {}
        local dx, dy = bx - ax, by - ay
        GroupEnumUnitsInRange(queryGroup, (ax + bx) * 0.5, (ay + by) * 0.5,
            math.sqrt(dx * dx + dy * dy) * 0.5 + radius + 1, nil)
        for i = 0, BlzGroupGetSize(queryGroup) - 1 do
            local unit = BlzGroupUnitAt(queryGroup, i)
            if AttackTarget(unit) then list[#list + 1] = unit end
        end
        GroupClear(queryGroup)
        SurvivorMetrics.Count(weapon .. ".queries")
        SurvivorMetrics.Count(weapon .. ".fullScanEquivalent", enemyCount)
        SurvivorMetrics.Count(weapon .. ".candidates", #list)
        SurvivorMetrics.End("collision.query", started)
        return list
    end
    local function ReleaseCandidates(list)
        for i = #list, 1, -1 do list[i] = nil end
        candidatePool[#candidatePool + 1] = list
    end
    local function AreaCandidates(x, y, radius, weapon)
        local list = Candidates(x, y, x, y, radius, weapon .. ".area")
        local selected, scanned = {}, 0
        for _, u in ipairs(list) do selected[u] = true end
        for i = #list, 1, -1 do list[i] = nil end
        -- Retain the old table iteration order for set procs and secondary deaths.
        -- Snapshot before damage; nested queries/deaths cannot rewrite this cast.
        for u in pairs(units) do
            scanned = scanned + 1
            if selected[u] then list[#list + 1] = u end
        end
        SurvivorMetrics.Count(weapon .. ".area.orderScans", scanned)
        return list
    end
    local function Height(x, y)
        MoveLocation(heightLocation, x, y)
        return GetLocationZ(heightLocation)
    end
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
        if self.summon then summonCounts[self.weapon] = math.max(0, (summonCounts[self.weapon] or 0) - 1) end
        objects[self] = nil
        hostileObjects[self] = nil
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
        if object.identifier == "hsChainHit" or object.opaque then return warning and 110 or 255 end
        if object.identifier == "hsEscapeDeparture" or object.identifier == "hsEscapeArrival" then return 255 end
        -- Solid metal needs more opacity than luminous spell particles at night.
        if object.readableBlade then return warning and 150 or 255 end
        return warning and 70 or 140
    end
    local function CreateObject(object, model, scale)
        object.visual = object.attachPoint and AddSpecialEffectTarget(model, object.target, object.attachPoint)
            or AddSpecialEffect(model, object.x, object.y)
        assert(object.visual ~= nil, "Could not create combat effect")
        object.destroy = DestroyObject
        objects[object] = true
        BlzSetSpecialEffectScale(object.visual, scale)
        if not object.attachPoint then BlzSetSpecialEffectZ(object.visual, object.z) end
        object.friendly = not object.identifier:find("Enemy") and not object.identifier:find("Boss")
        object.readableBlade = object.identifier == "hsBlade" or object.identifier == "hsSlash"
            or object.identifier == "hsSlashHit"
        if object.friendly then
            object.alpha = FriendlyEffectAlpha(object, RunSession.GetElapsed() < warningUntil)
            BlzSetSpecialEffectAlpha(object.visual, object.alpha)
        end
        local weapon = object.weapon and SurvivorConfig.weapons[object.weapon]
        local tint = object.tint
        if tint == nil then tint = weapon and (weapon.tint or SurvivorConfig.elements[weapon.element].tint) end
        if tint then
            BlzSetSpecialEffectColor(object.visual, tint[1], tint[2], tint[3])
        elseif object.readableBlade then
            BlzSetSpecialEffectColor(object.visual, 235, 245, 255)
        elseif object.identifier == "hsReturnBlade" then
            BlzSetSpecialEffectColor(object.visual, 190, 165, 225)
        elseif object.identifier == "hsEscapeDeparture" or object.identifier == "hsEscapeArrival" then
            BlzSetSpecialEffectColor(object.visual, 185, 135, 255)
        end
        TrackHostile(object)
        ALICE_Create(object)
    end
    -- Putress curse stacks amplify every hero hit, including poison ticks and reactions.
    local function CurseStacks(record)
        return RunSession.GetElapsed() < (record.curseUntil or 0) and record.curse or 0
    end
    -- status = the weapon's live status entry; statusOverride replaces it (residues, ticks).
    local function Hit(target, amount, weapon, setProc, secondary, statusScale, statusOverride)
        -- Supplies take one point per hit, without weapon damage, status or set procs.
        if RunSession.IsRunning() and Alive(hero) and AttackTarget(target) and units[target].bonus then
            if amount > 0 then UnitDamageTarget(hero, target, 1, false, false, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC, WEAPON_TYPE_WHOKNOWS) end
            return
        end
        if RunSession.IsRunning() and Alive(hero) and Enemy(target) then
            local baseAmount = amount
            local status = statusOverride or stats.status and stats.status[weapon]
            local curse = CurseStacks(units[target])
            if curse > 0 then
                amount = amount * (1 + SurvivorConfig.status.curseAmp * curse + (status and status.cursedBonus or 0)
                    + (status and curse >= SurvivorConfig.status.curseMax and status.maxCurseBonus or 0))
            end
            units[target].lastHit, units[target].lastWeapon = amount, weapon
            local before = math.max(0, GetWidgetLife(target))
            local isBoss = units[target].boss
            local previous, previousTag = hitSecondary, tagSecondary
            hitSecondary = setProc and true or secondary == true
            tagSecondary = setProc == "tag"
            UnitDamageTarget(hero, target, amount, false, false, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC, WEAPON_TYPE_WHOKNOWS)
            hitSecondary, tagSecondary = previous, previousTag
            local after = Alive(target) and math.max(0, GetWidgetLife(target)) or 0
            local actual = math.max(0, before - after)
            local data = weapon and damageTotals[weapon]
            if data then
                data.damage, data.stageDamage = data.damage + actual, data.stageDamage + actual
                if isBoss then data.bossDamage = data.bossDamage + actual end
            end
            if not setProc and not secondary and actual > 0 then SetHit(target, amount, weapon, baseAmount) end
            if status and not setProc and not secondary then ApplyStatus(target, weapon, status, statusScale or 1) end
        end
    end
    local function PrimaryTagAttack(object, tag)
        return not object.setProc and not object.secondary and not object.tagExtra
            and (not object.statusScale or object.statusScale >= 1) and HasTag(object.weapon, tag)
    end
    local function HomingDamage(object, damage)
        if stats.sets.pursuer and PrimaryTagAttack(object, "유도") and (object.flightAge or 0) + 0.0000001 >= 0.5 then
            return damage * 1.4
        end
        return damage
    end
    local function ZoneRampDamage(zone, target, damage)
        if not stats.sets.mire then zone.rampHits = nil; return damage end
        if damage <= 0 or zone.status or not PrimaryTagAttack(zone, "장판") or not Enemy(target) then return damage end
        zone.rampHits = zone.rampHits or {}
        local count = math.min(6, (zone.rampHits[target] or 0) + 1)
        zone.rampHits[target] = count
        return damage * (1 + (count - 1) * 0.1)
    end
    local function PierceDamage(object, target, damage)
        if not stats.sets.tracker or object.secondary or object.tagExtra or object.statusScale and object.statusScale < 1
            or not HasTag(object.weapon or "frostshard", "관통") or not Enemy(target) then return damage end
        object.pierceTargets = object.pierceTargets or {}
        local count = object.pierceCount or 0
        if not object.pierceTargets[target] then
            count = count + 1
            object.pierceTargets[target], object.pierceCount = true, count
        end
        return damage * (1 + math.min(3, math.max(0, count - 1)) * 0.20)
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
            local target, damage, evolution = missile.target, HomingDamage(missile, missile.damage), missile.evolution
            local x, y, z = ImpactPoint(target)
            ALICE_Kill(missile)
            if evolution == "evolution2" then
                local record, now = units[target], RunSession.GetElapsed()
                local stacks = now < (record.fireFocusUntil or 0) and (record.fireFocus or 0) or 0
                damage = damage * (1 + math.min(4, stacks) * 0.15)
                record.fireFocus, record.fireFocusUntil = math.min(4, stacks + 1), now + 3
            end
            Hit(target, damage, missile.weapon, nil, nil, missile.statusScale)
            if evolution == "evolution1" and RunSession.IsRunning() then
                CreateObject({identifier = "hsFireBurst", x = x, y = y, z = z, life = 0.4,
                    isAnonymous = true, selfInteractions = ZoneLifetime}, SurvivorConfig.fireBurstModel, 0.14)
                local victims = {}
                local candidates = Candidates(x, y, x, y, 140, "firebolt.area")
                for _, u in ipairs(candidates) do
                    if u ~= target and Enemy(u) and (GetUnitX(u) - x)^2 + (GetUnitY(u) - y)^2 <= 140^2 then victims[#victims + 1] = u end
                end
                ReleaseCandidates(candidates)
                table.sort(victims, function(a, b) return GetHandleId(a) < GetHandleId(b) end)
                for i = 1, math.min(12, #victims) do Hit(victims[i], damage * 0.30, "firebolt", true) end
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
            if zone.identifier == "hsZone" then ExpireEmber(zone) end
            ALICE_Kill(zone)
        end
        return dt
    end
    local function EscapeLanding(source)
        local x, y = GetUnitX(hero), GetUnitY(hero)
        local hasSource = source ~= nil and source ~= hero and GetUnitTypeId(source) ~= 0
        local angle = hasSource and Atan2(y - GetUnitY(source), x - GetUnitX(source))
            or GetUnitFacing(hero) * bj_DEGTORAD
        local enemies = {}
        for u in pairs(units) do
            if Enemy(u) then enemies[#enemies + 1] = {GetUnitX(u), GetUnitY(u)} end
        end
        local function Walkable(px, py)
            if px < bounds.minX + 32 or px > bounds.maxX - 32
                or py < bounds.minY + 32 or py > bounds.maxY - 32 then return false end
            -- Check the hero's footprint, not just an empty center pixel.
            for ox = -32, 32, 32 do
                for oy = -32, 32, 32 do
                    if IsTerrainPathable(px + ox, py + oy, PATHING_TYPE_WALKABILITY) then return false end
                end
            end
            return true
        end
        local bestX, bestY, bestScore = x, y, -math.huge
        for _, distance in ipairs(SurvivorConfig.escapeDistances) do
            for _, offset in ipairs({0, 1, -1, 2, -2, 3, -3, 4}) do
                local direction = angle + offset * math.pi / 4
                local tx, ty = x + math.cos(direction) * distance, y + math.sin(direction) * distance
                local clear = Walkable(tx, ty) and SurvivorStage.LineClear(x, y, tx, ty)
                -- Do not cross cliffs, trees or narrow gaps into an isolated pocket.
                local steps = math.ceil(distance / 32)
                for step = 1, steps - 1 do
                    if not clear then break end
                    clear = Walkable(x + (tx - x) * step / steps, y + (ty - y) * step / steps)
                end
                if clear then
                    local score = distance - math.abs(offset) * 20
                    for _, enemy in ipairs(enemies) do
                        local separation = math.sqrt((tx - enemy[1])^2 + (ty - enemy[2])^2)
                        score = score - math.max(0, 320 - separation) * 3 - math.max(0, 96 - separation) * 10
                    end
                    if score > bestScore then bestX, bestY, bestScore = tx, ty, score end
                end
            end
        end
        return bestX, bestY
    end
    local function EscapeBlink(source)
        local x, y = GetUnitX(hero), GetUnitY(hero)
        local tx, ty = EscapeLanding(source)
        CreateObject({identifier = "hsEscapeDeparture", x = x, y = y, z = Height(x, y), life = 0.7,
            isStationary = true, isAnonymous = true, selfInteractions = ZoneLifetime}, SurvivorConfig.escapeDepartureModel, 1.5)
        SetUnitX(hero, tx)
        SetUnitY(hero, ty)
        CreateObject({identifier = "hsEscapeArrival", x = tx, y = ty, z = Height(tx, ty), life = 0.9,
            isStationary = true, isAnonymous = true, selfInteractions = ZoneLifetime}, SurvivorConfig.escapeArrivalModel, 1.8)
        return (tx - x)^2 + (ty - y)^2 > 1
    end
    local function ZoneDamage(zone, enemy)
        local interval = zone.pulse
        if not RunSession.IsRunning() or zone.cleaned or zone.life <= 0 then return interval end
        if GroundTarget(enemy) then
            local dx, dy = GetUnitX(enemy) - zone.x, GetUnitY(enemy) - zone.y
            if dx * dx + dy * dy <= zone.radius * zone.radius then
                Hit(enemy, ZoneRampDamage(zone, enemy, zone.damage), zone.weapon, nil, nil, zone.statusScale)
            end
        end
        return interval
    end
    function SurvivorCombat.FireMissile(shot)
        local stats = shot and shot.stats or stats
        if not RunSession.IsRunning() or not Alive(hero) or not stats.missileEnabled then return end
        local x, y = GetUnitX(hero), GetUnitY(hero)
        local primary = ALICE_GetClosestObject(x, y, "hsEnemy", stats.missileRange,
            function(u) return AttackTarget(u) and SurvivorStage.LineClear(x, y, GetUnitX(u), GetUnitY(u)) end)
        if primary == nil then return end
        local selected, yaw = {}, GetUnitFacing(hero) * bj_DEGTORAD
        local z = Height(x, y) + GetUnitFlyHeight(hero) + SurvivorConfig.missileLaunchHeight
        local extra = shot and shot.index ~= nil
        for shot = 1, stats.missileCount do
            -- Prefer different enemies; concentrate extra shots if fewer are nearby.
            local target = shot == 1 and primary or ALICE_GetClosestObject(x, y, "hsEnemy", stats.missileRange,
                function(u) return AttackTarget(u) and not selected[u] and SurvivorStage.LineClear(x, y, GetUnitX(u), GetUnitY(u)) end) or primary
            selected[target] = true
            local offset = (shot - (stats.missileCount + 1) / 2) * 18
            local missile = {identifier = "hsMissile", weapon = stats.weaponId or "firebolt", statusScale = stats.statusScale,
                x = x - math.sin(yaw) * offset, y = y + math.cos(yaw) * offset, z = z, yaw = yaw,
                owner = GetOwningPlayer(hero), target = target, life = stats.missileLifetime, damage = stats.missileDamage, tagExtra = extra,
                speed = stats.missileSpeed, hitRadius = stats.missileHitRadius, remaining = stats.missileRange, evolution = stats.fireEvolution,
                selfInteractions = MoveMissile, isAnonymous = true}
            CreateObject(missile, stats.model or SurvivorConfig.missileModel, stats.missileScale)
            local tx, ty, tz = ImpactPoint(target)
            FaceMissile(missile, tx - missile.x, ty - missile.y, tz - missile.z)
        end
    end
    local function SpreadPoint(x, y, distance, shot)
        if shot and shot.index then
            local angle = GetUnitFacing(hero) * bj_DEGTORAD + (shot.index == 1 and -1 or 1) * math.pi / 2
            return x + math.cos(angle) * distance, y + math.sin(angle) * distance
        end
        return x, y
    end
    function SurvivorCombat.CreateZone(shot)
        local stats = shot and shot.stats or stats
        if not RunSession.IsRunning() or not Alive(hero) or not stats.zoneEnabled then return end
        local x, y = GetUnitX(hero), GetUnitY(hero)
        x, y = SpreadPoint(x, y, stats.zoneRadius * 0.8, shot)
        CreateObject({identifier = "hsZone", weapon = stats.weaponId or "flamefield", statusScale = stats.statusScale, x = x, y = y, z = Height(x, y),
            owner = GetOwningPlayer(hero), radius = stats.zoneRadius, isStationary = true,
            life = stats.zoneDuration, damage = stats.zoneDamage, pulse = stats.zonePulse, tagExtra = shot and shot.index ~= nil,
            selfInteractions = ZoneLifetime, interactions = {hsEnemy = ZoneDamage}},
            stats.model or SurvivorConfig.zoneModel, stats.zoneRadius / 230)
    end
    function SurvivorCombat.CastChainLightning(shot)
        local relayHits = stats and stats.sets.conductor and not (shot and shot.index) and {} or nil
        local stats = shot and shot.stats or stats
        if not RunSession.IsRunning() or not Alive(hero) or not stats.chainEnabled then return end
        local x, y, z = ImpactPoint(hero)
        local visited, damage, range = {}, stats.chainDamage, stats.chainRange
        local weapon = stats.weaponId or "chainlightning"
        for jump = 1, stats.chainTargets do
            local target = ALICE_GetClosestObject(x, y, "hsEnemy", range,
                function(u) return AttackTarget(u) and not visited[u] end)
            if target == nil then break end
            visited[target] = true
            local tx, ty, tz = ImpactPoint(target)
            local bolt = {identifier = "hsLightning", x = x, y = y, z = z,
                life = 0.22, isStationary = true, isAnonymous = true,
                selfInteractions = ZoneLifetime, destroy = DestroyObject}
            bolt.lightning = AddLightningEx(stats.lightning or (jump == 1 and "CLPB" or "CLSB"), true, x, y, z, tx, ty, tz)
            objects[bolt] = true
            ALICE_Create(bolt)
            -- Unattached: an attached effect inherits each unit's model and SetUnitScale size.
            CreateObject({identifier = "hsChainHit", weapon = stats.weaponId, x = tx, y = ty, z = tz,
                life = SurvivorConfig.chainHitDuration,
                isStationary = true, isAnonymous = true, selfInteractions = ZoneLifetime},
                stats.model or SurvivorConfig.chainHitModel, SurvivorConfig.chainHitScale)
            Hit(target, damage, weapon, nil, nil, stats.statusScale)
            if relayHits and Enemy(target) then relayHits[#relayHits + 1] = {unit = target, damage = damage} end
            x, y, z, range = tx, ty, tz, stats.chainJumpRange
            damage = damage * SurvivorConfig.chainFalloff
        end
        for i = #(relayHits or {}), 1, -1 do
            local last = relayHits[i]
            if Enemy(last.unit) then RelayEnd(weapon, last.unit, last.damage); break end
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
        if blade.life <= 0 or not Alive(hero) then ALICE_Kill(blade); return dt end
        local oldX, oldY = blade.x, blade.y
        blade.age = blade.age + dt
        local orbit = blade.orbit
        if blade.evolution == "evolution7" then orbit = orbit * (1 + 0.325 * (1 - math.cos(blade.age * 2 * math.pi / 3))) end
        if blade.evolution == "evolution8" then
            local desired = GetUnitFacing(hero) * bj_DEGTORAD + math.sin(blade.age * 2 * math.pi / blade.period) * 0.65 + blade.offset
            local delta = Atan2(math.sin(desired - blade.angle), math.cos(desired - blade.angle))
            blade.angle = blade.angle + math.max(-dt * 6, math.min(dt * 6, delta))
        else blade.angle = (blade.angle + dt * 2 * math.pi / blade.period) % (2 * math.pi) end
        blade.x, blade.y = GetUnitX(hero) + math.cos(blade.angle) * orbit, GetUnitY(hero) + math.sin(blade.angle) * orbit
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
        local view = shot and shot.stats or stats
        if not RunSession.IsRunning() or not Alive(hero) or not view.bladeEnabled then return end
        -- One activation is one evenly spaced ring, including multicast blades.
        -- Older rings keep their own lifetime, damage and per-enemy hit history.
        local count, phase = view.bladeCount + stats.multiCount, RunSession.GetElapsed()
        local centerX, centerY = GetUnitX(hero), GetUnitY(hero)
        local weapon = view.weaponId or "orbitblade"
        for i = 1, count do
            local angle = 2 * math.pi * (i - 1) / count + phase
            local offset = (i - (count + 1) / 2) / math.max(1, count - 1) * 0.8
            if view.bladeEvolution == "evolution8" then angle = GetUnitFacing(hero) * bj_DEGTORAD + offset end
            local x, y = centerX + math.cos(angle) * view.bladeRadius, centerY + math.sin(angle) * view.bladeRadius
            local damage = view.bladeDamage * (i > view.bladeCount and stats.multiDamage or 1)
            CreateObject({identifier = view.weaponId and "hsWraith" or "hsBlade", weapon = weapon, x = x, y = y, z = Height(x, y) + 65,
                angle = angle, orbit = view.bladeRadius, period = view.bladePeriod, damage = damage,
                age = 0, offset = offset, evolution = view.bladeEvolution,
                life = view.bladeDuration, hitRadius = view.bladeHitRadius, hitInterval = view.bladeHitInterval,
                hitTimes = {}, isAnonymous = true, selfInteractions = MoveBlade}, view.model or SurvivorConfig.bladeModel, view.bladeScale)
        end
    end
    function SurvivorCombat.UpdateWeapons(dt)
        if not RunSession.IsRunning() or not Alive(hero) then return end
        if next(bonusItems) ~= nil then UpdateBonusItems(RunSession.GetElapsed()) end
        UpdateTimeStop(RunSession.GetElapsed())
        local started, checked = SurvivorMetrics.Begin(), 0
        SurvivorMetrics.Count("status.calls")
        local now = RunSession.GetElapsed()
        if ward > 0 and now >= wardUntil then ward, wardUntil = 0, 0 end
        if escapeUntil > 0 and now >= escapeUntil then ClearEscape() end
        -- Poison ticks: snapshot due units first, because a tick may kill and clean records.
        if next(poisonUnits) then
            local config, due = SurvivorConfig.status, {}
            for u in pairs(poisonUnits) do
                local record = units[u]
                if not record or not record.alive or not Enemy(u) or now >= (record.poisonUntil or 0) or record.poison <= 0 then
                    poisonUnits[u] = nil
                    if record then record.poison = 0 end
                elseif now >= record.poisonNext then due[#due + 1] = u end
            end
            for _, u in ipairs(due) do
                local record = units[u]
                if Enemy(u) and RunSession.IsRunning() then
                    record.poisonNext = record.poisonNext + config.poisonTick
                    local status = stats.status and stats.status[record.poisonWeapon]
                    local power = status and status.tickPower or stats.poisonDamage / config.poisonDamage
                    Hit(u, record.poison * config.poisonDamage * power * config.poisonTick, record.poisonWeapon, true)
                end
            end
        end
        -- Passive frost stacks need no per-tick update after their slow expires.
        -- Keep the stacks, and reset all of them when the set is unequipped.
        if not stats.sets.frost then
            for u in pairs(frostStackUnits) do
                if units[u] then units[u].frostHits = 0 end
                frostStackUnits[u] = nil
            end
        end
        for u in pairs(statusUnits) do
            checked = checked + 1
            local record = units[u]
            if not record or not record.alive then
                statusUnits[u] = nil
                frostStackUnits[u] = nil
            else
                if record.freezeUntil and record.freezeUntil <= now then
                    PauseUnit(u, UnitTimeStopped(u, now) or record.special ~= nil or record.freezeWasPaused == true)
                    record.freezeUntil, record.freezeWasPaused = nil, nil
                end
                if record.slows and Enemy(u) then
                    local strongest, source = 0, nil
                    for id, slow in pairs(record.slows) do
                        if slow.expires <= now then record.slows[id] = nil
                        elseif slow.amount > strongest or slow.amount == strongest and (not source or id < source) then
                            strongest, source = slow.amount, id
                        end
                    end
                    if strongest ~= record.slowAmount then
                        record.slowAmount = strongest
                        SetUnitMoveSpeed(u, record.baseSpeed * (1 - strongest))
                    end
                    -- Count only the strongest source, with the original lexical tie break.
                    if source and damageTotals[source] then damageTotals[source].slowSeconds = damageTotals[source].slowSeconds + dt end
                    if next(record.slows) == nil then record.slows = nil end
                end
                EnemyColor(u, record)
                local poisoned = (record.poison or 0) > 0 and now < (record.poisonUntil or 0)
                local cursed = (record.curse or 0) > 0 and now < (record.curseUntil or 0)
                if not record.freezeUntil and not record.slows and not poisoned and not cursed then
                    statusUnits[u] = nil
                end
            end
        end
        if not stats.sets.storm then stormHits = 0 end
        if not stats.sets.commander then tagState.summon = {} end
        if not stats.sets.bombardier then tagState.fall = {} end
        if not stats.sets.destroyer then tagState.burstHits, tagState.burstReady = 0, 0 end
        if not stats.sets.bulwark then tagState.meleeUntil = 0 end
        if not stats.sets.conductor then tagState.relay = {} end
        local alpha = now < warningUntil and 70 or 140
        if friendlyAlpha ~= alpha then
            friendlyAlpha = alpha
            for object in pairs(objects) do
                if object.friendly and object.visual then
                    local targetAlpha = FriendlyEffectAlpha(object, now < warningUntil)
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
        if not Alive(hero) then return dt end
        CreateObject({identifier = "hsMonsoonEffect", weapon = strike.weapon, x = x, y = y, z = z, life = 0.9,
            isAnonymous = true, selfInteractions = ZoneLifetime}, strike.model or SurvivorConfig.monsoonModel, radius / 150)
        -- A column of lightning hits ground and flying enemies at the locked point.
        local started, checked = SurvivorMetrics.Begin(), 0
        SurvivorMetrics.Count("monsoon.area.calls")
        local candidates = AreaCandidates(x, y, radius, strike.weapon)
        for _, u in ipairs(candidates) do
            if not RunSession.IsRunning() or not Alive(hero) then break end
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
        local stats = shot and shot.stats or stats
        if not RunSession.IsRunning() or not Alive(hero) or not stats.monsoonEnabled then return end
        local x, y = GetUnitX(hero), GetUnitY(hero)
        local primary = ALICE_GetClosestObject(x, y, "hsEnemy", stats.monsoonRange, AttackTarget)
        if not primary then return end
        local selected = {}
        for i = 1, stats.monsoonCount do
            local target = ALICE_GetClosestObject(x, y, "hsEnemy", stats.monsoonRange,
                function(u) return AttackTarget(u) and not selected[u] end) or primary
            selected[target] = true
            local tx, ty, tz = ImpactPoint(target)
            tx, ty = SpreadPoint(tx, ty, stats.monsoonRadius * 0.7, shot)
            if i == 1 and not (shot and shot.index) and Enemy(target) then
                RecordFallingCast(stats.weaponId or "monsoon", tx, ty, tz, stats.monsoonDamage, stats.monsoonRadius,
                    stats.throwModel or SurvivorConfig.meteorModel, (stats.throwScale or 1) * 0.6)
            end
            local life = stats.monsoonDelay + (i - 1) * stats.monsoonSpacing
            if stats.falling then
                local id, damage, radius, scale = stats.weaponId, stats.monsoonDamage, stats.monsoonRadius, stats.statusScale
                FallPayload(id, tx, ty, tz, 0.55 + (i - 1) * stats.monsoonSpacing,
                    stats.throwModel, stats.throwScale or 1, function()
                        CreateObject({identifier = "hsVialImpact", weapon = id, x = tx, y = ty, z = tz, life = 0.45,
                            isAnonymous = true, selfInteractions = ZoneLifetime}, stats.model, radius / 150)
                        AreaHit({x = tx, y = ty, z = tz, radius = radius, slow = 0, weapon = id, statusScale = scale}, damage)
                    end)
            else
                if stats.thrown then
                    -- A vial lands exactly when its strike resolves; the strike owns the damage.
                    local hx, hy, hz = ImpactPoint(hero)
                    life = Throw(hx, hy, hz, tx, ty, tz, stats.throwSpeed, (i - 1) * stats.monsoonSpacing, nil, stats.throwScale, stats.throwModel, stats.weaponId)
                end
                local strike = {identifier = "hsMonsoon", weapon = stats.weaponId or "monsoon", model = stats.model,
                    statusScale = stats.statusScale, x = tx, y = ty, z = tz,
                    life = life, radius = stats.monsoonRadius, damage = stats.monsoonDamage,
                    isAnonymous = true, isStationary = true, selfInteractions = StrikeMonsoon, destroy = DestroyObject}
                objects[strike] = true
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
            if area.cleaned or not RunSession.IsRunning() or not Alive(hero) then break end
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
        if not Alive(hero) then ALICE_Kill(area); return dt end
        area.life = area.life - dt
        if area.life <= 0 then ALICE_Kill(area); return dt end
        HitSlash(area)
        return dt
    end
    function SurvivorCombat.CastFrontSlash(shot)
        local stats = shot and shot.stats or stats
        if not RunSession.IsRunning() or not Alive(hero) or not stats.slashEnabled then return end
        local x, y = GetUnitX(hero), GetUnitY(hero)
        local facing, arc = GetUnitFacing(hero) * bj_DEGTORAD, stats.slashAngle * bj_DEGTORAD
        local radius = stats.slashRange
        local target = ALICE_GetClosestObject(x, y, "hsEnemy", radius, GroundEnemy)
        if target then
            local dx, dy = GetUnitX(target) - x, GetUnitY(target) - y
            if dx * dx + dy * dy >= 1 then facing = math.atan(dy, dx) end
        end
        local sweepRadius, startAngle = radius * 0.7, facing - arc / 2
        CreateObject({identifier = stats.weaponId and "hsBreath" or "hsSlash", weapon = stats.weaponId, originX = x, originY = y,
            x = x + math.cos(startAngle) * sweepRadius, y = y + math.sin(startAngle) * sweepRadius,
            z = Height(x, y) + 65, facing = facing, arc = arc, radius = sweepRadius,
            life = math.max(stats.slashSweepTime, stats.slashDuration), sweepTime = stats.slashSweepTime, sweepElapsed = 0,
            isAnonymous = true, selfInteractions = SweepSlash}, stats.model or SurvivorConfig.bladeModel, 1.3 * stats.slashScale)
        -- Snapshot origin/facing/damage for the whole cast. A lingering cone hits each enemy once.
        local area = {identifier = "hsSlashArea", weapon = stats.weaponId or "frontslash", statusScale = stats.statusScale,
            hitModel = stats.hitModel, x = x, y = y, z = Height(x, y),
            facing = facing, arc = arc, radius = radius, damage = stats.slashDamage, scale = stats.slashScale,
            life = stats.slashDuration, hitTimes = {}, isAnonymous = true, isStationary = true,
            selfInteractions = LingerSlash, destroy = DestroyObject}
        if area.life > 0 then objects[area] = true; ALICE_Create(area) end
        HitSlash(area)
    end
    Slow = function(target, amount, duration, weapon)
        if not Enemy(target) then return end
        local record, now = units[target], RunSession.GetElapsed()
        if record.boss then amount = math.min(0.20, amount) end
        record.slows = record.slows or {}
        statusUnits[target] = true
        record.slows[weapon] = {amount = amount, expires = now + duration}
        local strongest = 0
        for _, slow in pairs(record.slows) do if slow.expires > now then strongest = math.max(strongest, slow.amount) end end
        record.slowAmount = strongest
        SetUnitMoveSpeed(target, record.baseSpeed * (1 - strongest))
        EnemyColor(target, record)
    end
    Freeze = function(target, duration)
        if not Enemy(target) then return false end
        local record, now = units[target], RunSession.GetElapsed()
        if now < (record.freezeImmuneUntil or 0) then return false end
        duration = record.boss and math.min(0.35, duration) or math.min(1, duration)
        record.freezeImmuneUntil = now + (record.boss and 8 or 5)
        if not record.freezeUntil then
            if record.special then record.freezeWasPaused = record.special.sourceWasPaused
            elseif record.timeStopUntil then record.freezeWasPaused = record.timeStopWasPaused
            else record.freezeWasPaused = IsUnitPaused(target) end
        end
        record.freezeUntil = now + duration
        statusUnits[target] = true
        PauseUnit(target, true)
        EnemyColor(target, record)
        return true
    end
    local function ProcVisual(x, y, z, model, scale, weapon)
        CreateObject({identifier = "hsSetEffect", weapon = weapon, x = x, y = y, z = z, life = 0.7,
            isAnonymous = true, selfInteractions = ZoneLifetime}, model, scale)
    end
    RelayEnd = function(weapon, target, damage)
        if not stats or not stats.sets.conductor or not HasTag(weapon, "연쇄") or not Enemy(target)
            or not RunSession.IsRunning() or not Alive(hero) then return end
        local now = RunSession.GetElapsed()
        if now < (tagState.relay[weapon] or 0) then return end
        tagState.relay[weapon] = now + 2
        local x, y, z = ImpactPoint(target)
        ProcVisual(x, y, z, SurvivorConfig.chainHitModel, 0.6, weapon)
        Hit(target, damage * 0.6, weapon, "tag")
    end
    -- Putress statuses. Reaction consumes poison before this hit adds new stacks.
    -- scale < 1 (multicast) applies a reduced, never zero, number of stacks.
    ApplyStatus = function(target, weapon, status, scale)
        if not Enemy(target) then return end
        local config, record, now = SurvivorConfig.status, units[target], RunSession.GetElapsed()
        local life = 1 + (stats.commonDurationBonus or 0)
        local function Stacks(value)
            value = value or 0
            if value <= 0 or scale >= 1 then return value end
            return math.max(1, math.floor(value * scale))
        end
        if (status.reaction or 0) > 0 and (record.poison or 0) > 0 and now < (record.poisonUntil or 0)
            and now >= (record.reactionReady or 0) then
            local consumed = status.reactionAll and record.poison or math.ceil(record.poison / 2)
            record.poison, record.reactionReady = record.poison - consumed, now + config.reactionCooldown
            local x, y, z = ImpactPoint(target)
            ProcVisual(x, y, z, SurvivorConfig.reactionModel, SurvivorConfig.reactionScale, weapon)
            Hit(target, consumed * config.reactionDamage * status.reaction * stats.poisonDamage / config.poisonDamage
                * (stats.sets.apprentice and 1.6 or 1), weapon, true)
            if not Enemy(target) then
                -- Apprentice set: a reaction kill leaves a short poison residue.
                if stats.sets.apprentice and RunSession.IsRunning() then Residue(weapon, x, y) end
                return
            end
        end
        local poison = Stacks(status.poison)
        if poison > 0 then
            if now >= (record.poisonUntil or 0) then record.poison, record.poisonNext = 0, now + config.poisonTick end
            record.poison = math.min(config.poisonMax + (stats.sets.apothecary and 4 or 0), record.poison + poison)
            record.poisonUntil, record.poisonWeapon = now + config.poisonDuration * life, weapon
            poisonUnits[target] = true
        end
        local curse = Stacks(status.curse)
        if curse > 0 then
            record.curse = math.min(config.curseMax, CurseStacks(record) + curse)
            record.curseUntil = now + config.curseDuration * life
        end
        if poison > 0 or curse > 0 or statusUnits[target] then
            statusUnits[target] = true
            EnemyColor(target, record)
        end
    end
    -- Quadratic Bezier throw: P0 = launch, P2 = locked landing point, P1 = midpoint raised by height.
    local function MoveThrow(throw)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or throw.cleaned then return dt end
        if not Alive(hero) then ALICE_Kill(throw); return dt end
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
            if land and Alive(hero) then land() end
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
    ExpireEmber = function(zone)
        if not stats or not stats.sets.ember or zone.weapon ~= "flamefield" or not Alive(hero) then return end
        ProcVisual(zone.x, zone.y, zone.z, SurvivorConfig.emberBurstModel, zone.radius / 240)
        local candidates = AreaCandidates(zone.x, zone.y, zone.radius, "ember")
        for _, u in ipairs(candidates) do
            if GroundTarget(u) then
                local dx, dy = GetUnitX(u) - zone.x, GetUnitY(u) - zone.y
                if dx * dx + dy * dy <= zone.radius ^ 2 then Hit(u, zone.damage * 2, "flamefield", true) end
            end
        end
        ReleaseCandidates(candidates)
    end
    SetHit = function(target, amount, weapon, baseAmount)
        if not stats or not RunSession.IsRunning() or not Alive(hero) then return end
        local now = RunSession.GetElapsed()
        if stats.sets.bulwark and HasTag(weapon, "근접") then tagState.meleeUntil = now + 3 end
        if stats.sets.destroyer and HasTag(weapon, "폭발") then
            tagState.burstHits = math.min(3, tagState.burstHits + 1)
            if tagState.burstHits >= 3 and now >= tagState.burstReady then
                tagState.burstHits, tagState.burstReady = 0, now + 2
                local x, y, z = ImpactPoint(target)
                ProcVisual(x, y, z, SurvivorConfig.emberBurstModel, 0.5, weapon)
                AreaHit({x = x, y = y, z = z, radius = 160, slow = 0, weapon = weapon,
                    setProc = "tag", enemiesOnly = true}, (baseAmount or amount) * 0.4)
                if not RunSession.IsRunning() or not Alive(hero) then return end
            end
        end
        if stats.sets.storm and (weapon == "chainlightning" or weapon == "monsoon" or weapon == "thunderorb") then
            stormHits = math.min(6, stormHits + 1)
            if stormHits >= 6 and now >= stormReady then
                stormHits, stormReady = 0, now + 2
                local victim = Enemy(target) and target or ALICE_GetClosestObject(GetUnitX(hero), GetUnitY(hero), "hsEnemy", 1000, Enemy)
                if victim then
                    local x, y, z = ImpactPoint(victim)
                    ProcVisual(x, y, z, SurvivorConfig.monsoonModel, 1)
                    Hit(victim, amount, weapon, true)
                end
            end
        elseif stats.sets.frost and Enemy(target) and (weapon == "frostshard" or weapon == "frostnova" or weapon == "blizzard") then
            local record, slowed = units[target], false
            for _, slow in pairs(record.slows or {}) do if slow.expires > now then slowed = true end end
            if not slowed then record.frostHits = 0; frostStackUnits[target] = nil; return end
            if now < (record.frostReady or 0) then return end
            record.frostHits = (record.frostHits or 0) + 1
            frostStackUnits[target] = true
            if record.frostHits >= 4 then
                record.frostHits, record.frostReady = 0, now + 5
                frostStackUnits[target] = nil
                local x, y, z = ImpactPoint(target)
                ProcVisual(x, y, z, [[Abilities\Spells\Undead\FrostNova\FrostNovaTarget.mdl]], 0.8)
                if record.boss then Hit(target, amount, weapon, true)
                else Freeze(target, 1) end
            end
        elseif stats.sets.blade and now >= bladeReady and (weapon == "orbitblade" or weapon == "frontslash" or weapon == "returnblade") then
            bladeReady = now + 8
            local x, y = GetUnitX(target), GetUnitY(target)
            ProcVisual(x, y, Height(x, y) + 65, SurvivorConfig.bladeProcModel, 1.5)
            local candidates = AreaCandidates(x, y, 220, "bladeSet")
            for _, u in ipairs(candidates) do
                if GroundTarget(u) then
                    local dx, dy = GetUnitX(u) - x, GetUnitY(u) - y
                    if dx * dx + dy * dy <= 220 ^ 2 then Hit(u, amount * 1.5, weapon, true) end
                end
            end
            ReleaseCandidates(candidates)
        end
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
        local record = units[u]
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
            if not RunSession.IsRunning() or not Alive(hero) then break end
            if AttackTarget(u) and (not object.enemiesOnly or Enemy(u))
                and not (object.groundOnly and IsUnitType(u, UNIT_TYPE_FLYING)) then
                checked = checked + 1
                local x, y, z = ImpactPoint(u)
                local dx, dy = x - object.x, y - object.y
                local dz = object.spherical and z - object.z or 0
                if dx * dx + dy * dy + dz * dz <= object.radius ^ 2 then
                    local damage = HomingDamage(object, ZoneRampDamage(object, u, amount))
                    Hit(u, damage, object.weapon, object.setProc, object.secondary, object.statusScale, object.status)
                    if object.markModel and Enemy(u) then MarkUnit(u, object.markModel, object.pulse + 0.15) end
                    if object.slow > 0 then Slow(u, object.slow, object.slowDuration, object.weapon) end
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
        if zone.life <= 0 or not Alive(hero) then ALICE_Kill(zone); return dt end
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
    -- Putress 4-piece set effects that trigger when a statused enemy dies.
    StatusDeath = function(dead, record)
        if not stats or inStatusProc or tagSecondary or not Alive(hero) then return end
        local now, config = RunSession.GetElapsed(), SurvivorConfig.status
        local x, y, z = ImpactPoint(dead)
        local function Nearby(radius, limit)
            local list, chosen = Candidates(x, y, x, y, radius, "statusDeath"), {}
            for _, u in ipairs(list) do
                local distance = (GetUnitX(u) - x) ^ 2 + (GetUnitY(u) - y) ^ 2
                if u ~= dead and Enemy(u) and distance <= radius * radius then chosen[#chosen + 1] = {unit = u, distance = distance} end
            end
            ReleaseCandidates(list)
            table.sort(chosen, function(a, b) return a.distance < b.distance
                or a.distance == b.distance and GetHandleId(a.unit) < GetHandleId(b.unit) end)
            for i = #chosen, (limit or #chosen) + 1, -1 do chosen[i] = nil end
            return chosen
        end
        inStatusProc = true
        if stats.sets.apothecary and (record.poison or 0) >= 8 and now < (record.poisonUntil or 0) then
            for _, target in ipairs(Nearby(300, 3)) do
                ApplyStatus(target.unit, record.poisonWeapon, {poison = math.floor(record.poison / 2)}, 1)
            end
        end
        if stats.sets.gravewarden and CurseStacks(record) >= config.curseMax and now >= soulReady then
            soulReady = now + 1
            ProcVisual(x, y, z, SurvivorConfig.soulBurstModel, 1.2, record.lastWeapon)
            for _, target in ipairs(Nearby(200)) do
                Hit(target.unit, (record.lastHit or 0) * 1.5, record.lastWeapon, true)
                if Enemy(target.unit) then ApplyStatus(target.unit, record.lastWeapon, {curse = 1}, 1) end
            end
        end
        inStatusProc = false
    end
    local function FallMeteor(meteor)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or meteor.cleaned then return dt end
        meteor.life = meteor.life - dt
        if not Alive(hero) then ALICE_Kill(meteor); return dt end
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
    RecordFallingCast = function(id, x, y, z, damage, radius, model, scale)
        if not stats.sets.bombardier or not HasTag(id, "낙하") then return end
        local counter = tagState.fall[id] or {hits = 0, ready = 0}
        tagState.fall[id] = counter
        counter.hits = math.min(4, counter.hits + 1)
        local now = RunSession.GetElapsed()
        if counter.hits < 4 or now < counter.ready then return end
        counter.hits, counter.ready = 0, now + 4
        FallPayload(id, x, y, z, 0.65, model, scale, function()
            if not stats or not stats.sets.bombardier or not RunSession.IsRunning() or not Alive(hero) then return end
            ProcVisual(x, y, z, SurvivorConfig.meteorImpactModel, 0.45, id)
            AreaHit({x = x, y = y, z = z, radius = radius * 0.7, slow = 0, weapon = id,
                setProc = "tag", enemiesOnly = true}, damage * 0.4)
        end, true)
    end
    local function MoveOrb(orb)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or orb.cleaned then return dt end
        if not Alive(hero) or orb.life <= 0 then ALICE_Kill(orb); return dt end
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
                    local damage = HomingDamage(orb, orb.damage) * orb.chainFraction
                    Hit(target, damage, orb.weapon, nil, nil, orb.statusScale)
                    if PrimaryTagAttack(orb, "연쇄") then
                        RelayEnd(orb.weapon, Enemy(target) and target or primary, Enemy(target) and damage or HomingDamage(orb, orb.damage))
                    end
                elseif PrimaryTagAttack(orb, "연쇄") then
                    RelayEnd(orb.weapon, primary, HomingDamage(orb, orb.damage))
                end
            end
        end
        return dt
    end
    local function SummonTarget(summon, w)
        local ground = w.summonKind == "zombie" or w.summonKind == "brute"
        return ALICE_GetClosestObject(GetUnitX(hero), GetUnitY(hero), "hsEnemy", w.range,
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
        if stats.sets.commander and scale == 1 then
            local counter = tagState.summon[summon.weapon] or {hits = 0, ready = 0}
            tagState.summon[summon.weapon] = counter
            counter.hits = math.min(6, counter.hits + 1)
            local now = RunSession.GetElapsed()
            if counter.hits >= 6 and now >= counter.ready then
                counter.hits, counter.ready = 0, now + 2
                damage = damage * 2
            end
        end
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
        if not Alive(hero) or summon.life <= 0 then ALICE_Kill(summon); return dt end
        local w = stats.extraWeapons[summon.weapon]
        if not w or not w.enabled then ALICE_Kill(summon); return dt end
        summon.life, summon.attackClock, summon.aiClock = summon.life - dt, summon.attackClock + dt, summon.aiClock - dt
        summon.animationTime = math.max(0, (summon.animationTime or 0) - dt)
        if summon.aiClock <= 0 then
            summon.aiClock = 0.25
            summon.target = SummonTarget(summon, w)
        end
        local hx, hy = GetUnitX(hero), GetUnitY(hero)
        local angle = GetUnitFacing(hero) * bj_DEGTORAD + math.pi + (summon.slot - 1) * 0.65
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
                if nx > bounds.minX and nx < bounds.maxX and ny > bounds.minY and ny < bounds.maxY
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
            for actor in pairs(objects) do
                if actor.summon and actor.weapon == id and not actor.cleaned and actor.life > 0
                    and SummonAttack(actor, w, w.damage, w.statusScale or 0.5) then break end
            end
            return
        end
        for actor in pairs(objects) do
            if actor.summon and actor.weapon == id and not actor.cleaned then actor.life = w.duration end
        end
        while (summonCounts[id] or 0) < count do
            local slot = (summonCounts[id] or 0) + 1
            local angle = GetUnitFacing(hero) * bj_DEGTORAD + math.pi + (slot - 1) * 0.65
            local x, y = GetUnitX(hero) + math.cos(angle) * 80, GetUnitY(hero) + math.sin(angle) * 80
            x = math.max(bounds.minX + 32, math.min(bounds.maxX - 32, x))
            y = math.max(bounds.minY + 32, math.min(bounds.maxY - 32, y))
            CreateObject({identifier = "hsSummon", weapon = id, summon = true, slot = slot, opaque = true,
                x = x, y = y, z = Height(x, y), life = w.duration, attackClock = w.pulse, aiClock = 0,
                isAnonymous = true, selfInteractions = UpdateSummon}, w.model, (w.summonKind == "brute" and 0.8 or 0.9) * w.size)
            summonCounts[id] = slot
        end
    end
    local function MoveReturnBlade(blade)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or blade.cleaned then return dt end
        if not Alive(hero) or blade.life <= 0 then ALICE_Kill(blade); return dt end
        local oldX, oldY, dx, dy = blade.x, blade.y, blade.dx, blade.dy
        local step = blade.speed * math.min(dt, blade.life)
        if blade.returning then
            dx, dy = GetUnitX(hero) - blade.x, GetUnitY(hero) - blade.y
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
        if stats.sets.tracker then
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
                local status, damage = stats.status and stats.status[blade.weapon], blade.damage
                if status and blade.returning then
                    if CurseStacks(units[u]) > 0 then damage = damage * (1 + status.returnBonus) end
                    status = {cursedBonus = status.cursedBonus, maxCurseBonus = status.maxCurseBonus, poison = 0, curse = 0, reaction = 0}
                end
                Hit(u, PierceDamage(blade, u, damage), blade.weapon, nil, nil, blade.statusScale, status)
            end
        end
        ReleaseCandidates(candidates)
        if blade.cleaned or not RunSession.IsRunning() then return dt end
        if blade.returning then
            local hx, hy = GetUnitX(hero) - blade.x, GetUnitY(hero) - blade.y
            if hx * hx + hy * hy <= 25 ^ 2 then
                -- Longevity buys additional travel/hits instead of unused maximum lifetime.
                local target = ALICE_GetClosestObject(blade.x, blade.y, "hsEnemy", blade.range, GroundTarget)
                local angle = GetUnitFacing(hero) * bj_DEGTORAD
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
    function SurvivorCombat.CastExtra(id, shot)
        local stats = shot and shot.stats or stats
        local w = stats.extraWeapons[id]
        if not w or not w.enabled or not RunSession.IsRunning() or not Alive(hero) then return end
        local x, y, z = ImpactPoint(hero)
        local engine = SurvivorConfig.weapons[id].engine
        if engine == "summon" then CastSummon(id, w, shot); return end
        if engine == "nova" then
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
            return
        end
        local target = ALICE_GetClosestObject(x, y, "hsEnemy", w.range, engine == "boomerang" and GroundTarget or AttackTarget)
        if not target then return end
        local tx, ty, tz = ImpactPoint(target)
        if engine == "field" or engine == "meteor" then tx, ty = SpreadPoint(tx, ty, w.radius * 0.8, shot) end
        if not (shot and shot.index) and engine == "meteor" and Enemy(target) then
            RecordFallingCast(id, tx, ty, tz, w.damage, w.radius, w.throwModel or SurvivorConfig.meteorModel,
                w.falling and (w.throwScale or 1) * 0.6 or 0.7 * w.size)
        end
        if w.falling then
            local status = stats.status and stats.status[id]
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
        if w.thrown then
            Throw(x, y, z, tx, ty, tz, w.speed, 0, function() NewZone(id, tx, ty, w, w.damage) end,
                w.throwScale, w.throwModel, id)
            return
        end
        if engine == "field" then NewZone(id, tx, ty, w, w.damage); return end
        if engine == "meteor" then
            CreateObject({identifier = "hsMeteor", x = tx, y = ty, z = tz + 750, groundZ = tz,
                profile = w, life = w.delay, delay = w.delay, isAnonymous = true, selfInteractions = FallMeteor}, SurvivorConfig.meteorModel, 1.8 * w.size)
            return
        end
        local orb = engine == "orb"
        local dx, dy, dz = tx - x, ty - y, orb and tz - z or 0
        local distance = math.sqrt(dx * dx + dy * dy + dz * dz)
        if distance < 1 then dx, dy, dz, distance = math.cos(GetUnitFacing(hero) * bj_DEGTORAD), math.sin(GetUnitFacing(hero) * bj_DEGTORAD), 0, 1 end
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
    local function MoveFrost(shard)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or shard.cleaned then return dt end
        if not Alive(hero) or shard.life <= 0 or shard.remaining <= 0 then ALICE_Kill(shard); return dt end
        local step = math.min(shard.speed * math.min(dt, shard.life), shard.remaining)
        local dx, dy, dz = shard.dx * step, shard.dy * step, shard.dz * step
        if not SurvivorStage.LineClear(shard.x, shard.y, shard.x + dx, shard.y + dy) then ALICE_Kill(shard); return dt end
        local length, hits = dx * dx + dy * dy + dz * dz, {}
        local candidates = Candidates(shard.x, shard.y, shard.x + dx, shard.y + dy, shard.hitRadius, shard.weapon or "frostshard")
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
                Hit(u, PierceDamage(shard, u, shard.damage), shard.weapon or "frostshard", false, shard.secondary, shard.statusScale)
                if shard.cleaned or not RunSession.IsRunning() then return dt end
                if shard.slow > 0 then Slow(u, shard.slow, shard.slowDuration, "frostshard") end
                if Enemy(u) and shard.evolution == "evolution14" and not shard.secondary then
                    local record = units[u]
                    record.spearHits = math.min(3, (record.spearHits or 0) + 1)
                    if record.spearHits >= 3 and Freeze(u, 0.8) then record.spearHits = 0 end
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
        local stats = shot and shot.stats or stats
        if not RunSession.IsRunning() or not Alive(hero) or not stats.frostEnabled then return end
        local x, y, z = ImpactPoint(hero)
        local target = ALICE_GetClosestObject(x, y, "hsEnemy", stats.frostRange,
            function(u) return AttackTarget(u) and SurvivorStage.LineClear(x, y, GetUnitX(u), GetUnitY(u)) end)
        if not target then return end
        local tx, ty, tz = ImpactPoint(target)
        local dx, dy, dz = tx - x, ty - y, tz - z
        local distance = math.sqrt(dx * dx + dy * dy + dz * dz)
        if distance < 1 then dx, dy, dz, distance = math.cos(GetUnitFacing(hero) * bj_DEGTORAD), math.sin(GetUnitFacing(hero) * bj_DEGTORAD), 0, 1 end
        dx, dy, dz = dx / distance, dy / distance, dz / distance
        local count = stats.frostCount or 1
        for k = 1, count do
            -- Extra shards fan out horizontally around the aimed direction.
            local turn = (k - (count + 1) / 2) * 0.17
            local cos, sin = math.cos(turn), math.sin(turn)
            local sx, sy = dx * cos - dy * sin, dx * sin + dy * cos
            local shard = {identifier = "hsFrostShard", weapon = stats.weaponId, statusScale = stats.statusScale, x = x, y = y, z = z, yaw = 0,
                dx = sx, dy = sy, dz = dz, speed = stats.frostSpeed,
                life = stats.frostLifetime, remaining = stats.frostRange, hitRadius = stats.frostHitRadius,
                damage = stats.frostDamage, pierces = stats.frostPierce, hitTimes = {}, tagExtra = shot and shot.index ~= nil,
                slow = stats.frostSlow, slowDuration = stats.frostSlowDuration, evolution = stats.frostEvolution,
                isAnonymous = true, selfInteractions = MoveFrost}
            CreateObject(shard, stats.model or SurvivorConfig.frostModel, stats.frostScale)
            FaceMissile(shard, sx, sy, dz)
        end
    end
    Shatter = function(dead, record)
        local now = RunSession.GetElapsed()
        if hitSecondary or stats.frostEvolution ~= "evolution13" or now < shatterReady then return end
        local slowed = false
        for _, slow in pairs(record.slows or {}) do if slow.expires > now then slowed = true end end
        if not slowed then return end
        shatterReady = now + 0.12 -- Bound dense-wave secondary effects; secondary kills never repeat it.
        local x, y, z = ImpactPoint(dead)
        local candidates, nearest = Candidates(x, y, x, y, 450, "shatter.area"), {}
        for _, u in ipairs(candidates) do
            local tx, ty = GetUnitX(u), GetUnitY(u)
            local distance = (tx - x)^2 + (ty - y)^2
            if Enemy(u) and distance <= 450^2 and SurvivorStage.LineClear(x, y, tx, ty) then
                local handle, position = GetHandleId(u), 1
                while nearest[position] and (nearest[position].distance < distance
                    or nearest[position].distance == distance and nearest[position].handle < handle) do position = position + 1 end
                if position <= 3 then
                    table.insert(nearest, position, {unit = u, x = tx, y = ty, distance = distance, handle = handle})
                    nearest[4] = nil
                end
            end
        end
        ReleaseCandidates(candidates)
        for _, target in ipairs(nearest) do
            local offset = SurvivorConfig.missileImpactHeightByType[GetUnitTypeId(target.unit)] or SurvivorConfig.missileImpactHeight
            local tx, ty, tz = target.x, target.y, Height(target.x, target.y) + GetUnitFlyHeight(target.unit) + offset
            local dx, dy, dz = tx - x, ty - y, tz - z
            local length = math.max(1, math.sqrt(dx^2 + dy^2 + dz^2))
            local shard = {identifier = "hsFrostShard", x = x, y = y, z = z, yaw = 0,
                dx = dx/length, dy = dy/length, dz = dz/length, speed = stats.frostSpeed, life = 1.5, remaining = 450,
                hitRadius = 28, damage = stats.frostDamage * 0.35, pierces = 1, hitTimes = {}, secondary = true,
                slow = stats.frostSlow, slowDuration = 1, isAnonymous = true, selfInteractions = MoveFrost}
            CreateObject(shard, SurvivorConfig.frostModel, 0.7)
            FaceMissile(shard, dx, dy, dz)
        end
    end
    local function EngineOf(id)
        local weapon = SurvivorConfig.weapons[id]
        return weapon and SurvivorConfig.weaponEngines[weapon.engine]
    end
    -- An engine's own weapon reads stats directly; other weapons on it read stats.views[id].
    local function ViewOf(id, engine)
        return engine.weapon == id and stats or stats.views and stats.views[id]
    end
    local function DispatchWeapon(id, shot)
        local engine = EngineOf(id)
        if engine.profile then SurvivorCombat.CastExtra(id, shot); return end
        if not shot and engine.weapon ~= id then shot = {stats = ViewOf(id, engine)} end
        SurvivorCombat[engine.cast](shot)
    end
    local function ExtraAttack(pending)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or pending.cleaned then return dt end
        pending.life = pending.life - dt
        if pending.life > 0 then return dt end
        local id, shot = pending.weapon, pending.shot
        ALICE_Kill(pending)
        if Alive(hero) then DispatchWeapon(id, shot) end -- Raw cast: never schedules more extra attacks.
        return dt
    end
    function SurvivorCombat.CastWeapon(id)
        if not RunSession.IsRunning() or not Alive(hero) then return end
        local engine = EngineOf(id)
        if not engine then return end
        local view = not engine.profile and ViewOf(id, engine)
        if engine.profile and (not stats.extraWeapons[id] or not stats.extraWeapons[id].enabled)
            or not engine.profile and not (view and view[engine.enabled]) then return end
        if engine.volley then
            -- Spawn base and extra blades together; no delayed single-blade casts.
            SurvivorCombat[engine.cast](view ~= stats and {stats = view} or nil)
            return
        end
        DispatchWeapon(id)
        if not RunSession.IsRunning() or not stats or stats.multiCount == 0 then return end
        local snapshot = {}
        if engine.profile then
            local copy = {}
            for key, value in pairs(stats.extraWeapons[id]) do copy[key] = value end
            copy.damage = copy.damage * stats.multiDamage
            copy.statusScale = 0.5 -- Extra attacks apply half the status stacks (at least one).
            snapshot.extraWeapons = {[id] = copy}
        elseif view ~= stats then
            for key, value in pairs(view) do snapshot[key] = value end
            snapshot[engine.damage] = snapshot[engine.damage] * stats.multiDamage
            if engine.single then snapshot[engine.single] = 1 end
            snapshot.statusScale = 0.5
        else
            for _, key in ipairs(engine.fields) do snapshot[key] = stats[key] end
            snapshot[engine.damage] = snapshot[engine.damage] * stats.multiDamage
            -- Add individual projectiles/strikes, not copies of an entire existing volley.
            if engine.single then snapshot[engine.single] = 1 end
        end
        for i = 1, stats.multiCount do
            local pending = {identifier = "hsExtraAttack", x = GetUnitX(hero), y = GetUnitY(hero), z = 0,
                weapon = id, shot = {stats = snapshot, index = i}, life = i * 0.18,
                isAnonymous = true, selfInteractions = ExtraAttack, destroy = DestroyObject}
            objects[pending] = true
            ALICE_Create(pending)
        end
    end
    local function MoveEnemyMissile(missile)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or missile.cleaned then return dt end
        if not Alive(hero) or not Enemy(missile.source) then ALICE_Kill(missile); return dt end
        if HostileStopped(missile) then return dt end
        missile.life = missile.life - dt
        if missile.life <= 0 then ALICE_Kill(missile); return dt end
        local hx, hy, hz = ImpactPoint(hero)
        local dx, dy, dz = missile.vx * dt, missile.vy * dt, missile.vz * dt
        if not SurvivorStage.LineClear(missile.x, missile.y, missile.x + dx, missile.y + dy) then ALICE_Kill(missile); return dt end
        local length = dx * dx + dy * dy + dz * dz
        local t = length > 0 and math.max(0, math.min(1,
            ((hx - missile.x) * dx + (hy - missile.y) * dy + (hz - missile.z) * dz) / length)) or 0
        local rx, ry, rz = hx - missile.x - dx * t, hy - missile.y - dy * t, hz - missile.z - dz * t
        if rx * rx + ry * ry + rz * rz <= 45 * 45 then
            local source, damage = missile.source, missile.damage
            ALICE_Kill(missile)
            HurtHero(source, damage, "원거리 사격", "발사 방향의 옆으로 이동하거나 지형 뒤에서 사선을 끊으세요.")
            return dt
        end
        missile.x, missile.y, missile.z = missile.x + dx, missile.y + dy, missile.z + dz
        BlzSetSpecialEffectPosition(missile.visual, missile.x, missile.y, missile.z)
        return dt
    end
    -- Warcraft queues pathing per player, so one owner with hundreds of units stutters.
    -- Spread enemies over allied slots that borrow Neutral Hostile's color; all share one display name.
    local function NextEnemyOwner()
        if not enemyOwners then
            local template, heroOwner = Player(PLAYER_NEUTRAL_AGGRESSIVE), Player(SurvivorConfig.playerId)
            enemyOwners = {}
            for _, id in ipairs(SurvivorConfig.enemyPlayerIds) do enemyOwners[#enemyOwners + 1] = Player(id) end
            for _, owner in ipairs(enemyOwners) do
                SetPlayerColor(owner, GetPlayerColor(template))
                SetPlayerName(owner, SurvivorConfig.enemyPlayerName)
                SetPlayerAlliance(owner, heroOwner, ALLIANCE_PASSIVE, false)
                SetPlayerAlliance(heroOwner, owner, ALLIANCE_PASSIVE, false)
                SetPlayerAlliance(owner, template, ALLIANCE_PASSIVE, true)
                SetPlayerAlliance(template, owner, ALLIANCE_PASSIVE, true)
                for _, other in ipairs(enemyOwners) do
                    if other ~= owner then SetPlayerAlliance(owner, other, ALLIANCE_PASSIVE, true) end
                end
            end
        end
        enemyOwnerSerial = enemyOwnerSerial % #enemyOwners + 1
        return enemyOwners[enemyOwnerSerial]
    end
    -- Each move order repaths; skip it while the unit already heads near the same point.
    -- A unit still moving re-aims only on its due tick; a lost order is replaced at once.
    local function MoveEnemy(unit, record, x, y, slack, due)
        local ox, oy = record.moveX, record.moveY
        if ox and GetUnitCurrentOrder(unit) == OrderId("move")
            and (not due or (ox - x)^2 + (oy - y)^2 <= slack * slack) then return end
        record.moveX, record.moveY = x, y
        IssuePointOrder(unit, "move", x, y)
    end
    local function FireEnemyMissile(source, profile)
        local x, y, z = ImpactPoint(source)
        local tx, ty, tz = ImpactPoint(hero)
        local dx, dy, dz = tx - x, ty - y, tz - z
        local distance = math.sqrt(dx * dx + dy * dy + dz * dz)
        if distance < 1 then return end
        local speed = profile.projectileSpeed / distance
        local missile = {identifier = "hsEnemyMissile", x = x, y = y, z = z,
            vx = dx * speed, vy = dy * speed, vz = dz * speed,
            source = source, damage = profile.damage * units[source].damageScale, life = 4, yaw = 0,
            isAnonymous = true, selfInteractions = MoveEnemyMissile}
        CreateObject(missile, SurvivorConfig.enemyProjectileModel, 0.95)
        BlzSetSpecialEffectColor(missile.visual, 255, 70, 180)
        FaceMissile(missile, dx, dy, dz)
        SetUnitAnimation(source, "attack")
    end
    local function ResolveBossBlast(blast)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or blast.cleaned then return dt end
        if (not blast.environment and not Enemy(blast.source)) or not Alive(hero) then ALICE_Kill(blast); return dt end
        if HostileStopped(blast) then return dt end
        blast.life = blast.life - dt
        if blast.life > 0 then
            local c = SurvivorConfig
            local fraction = 1 - math.min(1, blast.life / c.bossWarningBrightTime)
            local alpha = math.floor(c.bossWarningAlpha + (c.bossWarningFinalAlpha - c.bossWarningAlpha) * fraction)
            if blast.warningAlpha ~= alpha then
                BlzSetSpecialEffectAlpha(blast.markers[1], alpha)
                blast.warningAlpha = alpha
            end
            return dt
        end
        local source, x, y, z, radius, damage = blast.source, blast.x, blast.y, blast.z, blast.radius, blast.damage
        ALICE_Kill(blast)
        CreateObject({identifier = "hsBossImpact", x = x, y = y, z = z, life = 0.6,
            isAnonymous = true, selfInteractions = ZoneLifetime}, SurvivorConfig.bossImpactModel, radius / 240)
        local dx, dy = GetUnitX(hero) - x, GetUnitY(hero) - y
        if dx * dx + dy * dy <= radius * radius then
            HurtHero(source, damage, blast.environment and "지하 분출" or "보스 폭발", "폭발이 확정되기 전에 원 바깥으로 이동하세요.")
        end
        return dt
    end
    local function WarnBossBlast(x, y, radius, delay, environment)
        warningUntil = math.max(warningUntil, RunSession.GetElapsed() + delay)
        local blast = {identifier = "hsBossWarning", x = x, y = y, z = Height(x, y),
            source = environment and hero or boss, environment = environment,
            radius = radius, damage = (environment and 35 or SurvivorConfig.bossBlastDamage) * SurvivorConfig.stageDamage[stage] * difficulty.damage,
            life = delay, markers = {}, isStationary = true, isAnonymous = true,
            selfInteractions = ResolveBossBlast, destroy = DestroyObject}
        objects[blast] = true
        -- One red ground ring sized to the blast radius marks the whole danger area.
        local marker = AddSpecialEffect(SurvivorConfig.warningRingModel, x, y)
        blast.markers[1] = marker
        BlzSetSpecialEffectZ(marker, blast.z + 5)
        BlzSetSpecialEffectScale(marker, blast.radius / SurvivorConfig.warningRingRadius)
        local color = SurvivorConfig.warningColors.danger
        BlzSetSpecialEffectColor(marker, color[1], color[2], color[3])
        blast.warningAlpha = SurvivorConfig.bossWarningAlpha
        BlzSetSpecialEffectAlpha(marker, blast.warningAlpha)
        TrackHostile(blast)
        ALICE_Create(blast)
    end
    function SurvivorCombat.WarnLava()
        if stage == 2 and RunSession.IsRunning() and Alive(hero) then
            for _, point in ipairs(SurvivorStage.LavaPoints()) do WarnBossBlast(point.x, point.y, point.radius, 1.8, true) end
        end
    end
    local function ReleaseSpecial(self)
        local record = units[self.source]
        if record and record.special == self then
            record.special = nil
            record.wasPaused = self.sourceWasPaused
            if Alive(self.source) then
                PauseUnit(self.source, frozen or UnitTimeStopped(self.source) or self.sourceWasPaused == true
                    or (record.freezeUntil ~= nil and record.freezeUntil > RunSession.GetElapsed()))
            end
        end
    end
    local function SpecialMarker(self, x, y, green)
        -- Red spell markers outline danger; green ones mark the safe gaps.
        local effect = AddSpecialEffect(green and SurvivorConfig.specialSafeMarkerModel or SurvivorConfig.specialMarkerModel, x, y)
        self.markers[#self.markers + 1] = effect
        BlzSetSpecialEffectScale(effect, green and 0.55 or 0.38)
        BlzSetSpecialEffectZ(effect, Height(x, y) + 5)
        return effect
    end
    local function ClearMarkers(self)
        for _, effect in ipairs(self.markers) do DestroyEffect(effect) end
        self.markers = {}
    end
    local function DamageSpecial(self, factor)
        local name = self.kind == "dash" and (factor < 1 and "돌진 잔불" or "돌진") or "냉기 파동"
        HurtHero(self.source, self.damage * factor, name, self.kind == "dash" and "돌진 통로의 옆으로 피하고 잔불이 사라질 때까지 접근하지 마세요." or "초록색 표식 사이의 안전한 틈으로 이동하세요.")
    end
    local function StepSpecial(self)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or self.cleaned then return dt end
        if not Alive(hero) or not Enemy(self.source) then ALICE_Kill(self); return dt end
        if HostileStopped(self) then return dt end
        local sourceRecord = units[self.source]
        if sourceRecord.freezeUntil and sourceRecord.freezeUntil > RunSession.GetElapsed() then return dt end
        self.elapsed = self.elapsed + dt
        if self.elapsed < self.delay then return dt end
        local hx, hy = GetUnitX(hero), GetUnitY(hero)
        if self.kind == "dash" then
            if not self.trail then
                local fraction = math.min(1, (self.elapsed - self.delay) * 900 / self.distance)
                local nx, ny = self.ax + (self.bx - self.ax) * fraction, self.ay + (self.by - self.ay) * fraction
                if IsTerrainPathable(nx, ny, PATHING_TYPE_WALKABILITY) then
                    self.bx, self.by = GetUnitX(self.source), GetUnitY(self.source)
                    fraction = 1
                end
                local ox, oy = GetUnitX(self.source), GetUnitY(self.source)
                if fraction < 1 or not IsTerrainPathable(nx, ny, PATHING_TYPE_WALKABILITY) then
                    SetUnitX(self.source, nx); SetUnitY(self.source, ny)
                end
                if not self.dashHit and SegmentDistanceSquared(hx, hy, ox, oy, GetUnitX(self.source), GetUnitY(self.source)) <= self.width^2 then
                    self.dashHit = true; DamageSpecial(self, 1)
                    if self.cleaned or not Alive(hero) then return dt end
                end
                if fraction >= 1 then
                    if self.elite or self.noTrail then ALICE_Kill(self); return dt end
                    self.trail, self.expires = true, self.elapsed + 2
                    ReleaseSpecial(self)
                    ClearMarkers(self)
                    for i = 0, 7 do
                        local x, y = self.ax + (self.bx - self.ax) * i / 7, self.ay + (self.by - self.ay) * i / 7
                        local effect = AddSpecialEffect([[Abilities\Spells\NightElf\Immolation\ImmolationTarget.mdl]], x, y)
                        self.markers[#self.markers + 1] = effect
                        BlzSetSpecialEffectScale(effect, 1.3)
                    end
                end
            else
                if self.elapsed >= self.expires then ALICE_Kill(self); return dt end
                if not self.trailHit and SegmentDistanceSquared(hx, hy, self.ax, self.ay, self.bx, self.by) <= self.width^2 then
                    self.trailHit = true; DamageSpecial(self, 0.5)
                end
            end
        elseif self.kind == "wave" then
            local radius = 120 + (self.elapsed - self.delay) * 340
            if radius > self.waveMaxRadius then ALICE_Kill(self); return dt end
            for i, angle in ipairs(self.angles) do
                local x, y = self.ax + math.cos(angle) * radius, self.ay + math.sin(angle) * radius
                BlzSetSpecialEffectPosition(self.markers[i], x, y, Height(x, y) + 55)
            end
            local dx, dy = hx - self.ax, hy - self.ay
            local angle = Atan2(dy, dx) - self.gap
            local outsideGap = math.abs(Atan2(math.sin(angle), math.cos(angle))) > self.gapWidth / 2
            if not self.hit and outsideGap and math.abs(math.sqrt(dx * dx + dy * dy) - radius) <= self.width then
                self.hit = true; DamageSpecial(self, 1)
            end
        else -- Three warned chain lanes; the spaces between the lanes stay safe.
            local hit = false
            for _, lane in ipairs(self.lanes) do
                local dx, dy = lane.bx - lane.ax, lane.by - lane.ay
                local projection = (hx - lane.ax) * dx + (hy - lane.ay) * dy
                if projection >= 0 and projection <= dx * dx + dy * dy
                    and SegmentDistanceSquared(hx, hy, lane.ax, lane.ay, lane.bx, lane.by) <= self.width^2 then hit = true end
            end
            local source, damage = self.source, self.damage
            for _, lane in ipairs(self.lanes) do
                for i = 0, 4 do
                    local x, y = lane.ax + (lane.bx - lane.ax) * i / 4, lane.ay + (lane.by - lane.ay) * i / 4
                    CreateObject({identifier = "hsBossChain", x = x, y = y, z = Height(x, y), life = 0.55,
                        isAnonymous = true, selfInteractions = ZoneLifetime}, [[Doodads\Dungeon\Props\ChainPost\ChainPost.mdl]], 0.5)
                end
            end
            ALICE_Kill(self)
            if hit and Alive(hero) then HurtHero(source, damage, "사슬 봉쇄", "예고된 줄 사이로 이동하세요. 수색 완료 시 첫 봉쇄의 중앙 줄이 사라집니다.") end
        end
        return dt
    end
    local function StartSpecial(kind, record, source)
        source = source or boss
        local x, y, hx, hy = GetUnitX(source), GetUnitY(source), GetUnitX(hero), GetUnitY(hero)
        local angle = Atan2(hy - y, hx - x)
        local self = {identifier = "hsBossSpecial", kind = kind, source = source, elite = record.elite, ax = x, ay = y, x = x, y = y, z = Height(x, y),
            damage = SurvivorConfig.bossBlastDamage * SurvivorConfig.stageDamage[stage] * difficulty.damage,
            elapsed = 0, delay = SurvivorConfig.bossBlastDelay, width = kind == "dash" and 100 or 65,
            markers = {}, isAnonymous = true, selfInteractions = StepSpecial,
            destroy = function(object) ReleaseSpecial(object); DestroyObject(object) end}
        if record.elite then self.damage, self.delay, self.width = 26 * record.damageScale, 1.2, 75 end
        local informed = not record.elite and ((stage == 2 and kind == "dash") or (stage == 3 and kind == "wave") or (stage == 5 and kind == "chains"))
            and SurvivorExpedition.UseAdvantage(stage)
        self.noTrail = informed and stage == 2
        warningUntil = math.max(warningUntil, RunSession.GetElapsed() + self.delay)
        self.sourceWasPaused = IsUnitPaused(source)
        record.special = self
        objects[self] = true
        IssueImmediateOrder(source, "stop")
        PauseUnit(source, true)
        SetUnitFacing(source, angle * bj_RADTODEG)
        if kind == "dash" then
            self.distance = math.max(200, math.min(750, math.sqrt((hx - x)^2 + (hy - y)^2)))
            self.bx = math.max(bounds.minX + 32, math.min(bounds.maxX - 32, x + math.cos(angle) * self.distance))
            self.by = math.max(bounds.minY + 32, math.min(bounds.maxY - 32, y + math.sin(angle) * self.distance))
            self.distance = math.max(1, math.sqrt((self.bx - x)^2 + (self.by - y)^2))
            -- Use the final, arena-clamped route so warnings never point beyond the real dash.
            local c, dx, dy = SurvivorConfig, self.bx - x, self.by - y
            local direction = Atan2(dy, dx)
            local count = record.elite and math.max(1, math.floor((self.distance - c.dashArrowOffset) / c.dashArrowSpacing) + 1)
                or math.max(1, math.ceil(self.distance / c.dashArrowSpacing))
            for i = 1, count do
                local distance = record.elite and math.min(self.distance, c.dashArrowOffset + (i - 1) * c.dashArrowSpacing)
                    or self.distance * i / count
                local px, py = x + dx * distance / self.distance, y + dy * distance / self.distance
                local arrow = AddSpecialEffect(c.dashArrowModel, px, py)
                self.markers[#self.markers + 1] = arrow
                BlzSetSpecialEffectScale(arrow, record.elite and c.dashArrowScale or c.bossDashArrowScale)
                BlzSetSpecialEffectYaw(arrow, direction)
                BlzSetSpecialEffectZ(arrow, Height(px, py) + 5)
            end
        elseif kind == "wave" then
            self.gap, self.gapWidth, self.angles = angle + math.pi / 2, math.pi / 2, {}
            self.waveMaxRadius = 900
            if informed and stage == 3 then self.gapWidth = math.pi end
            for i = 0, 17 do
                local a = self.gap + self.gapWidth / 2 + (2 * math.pi - self.gapWidth) * i / 17
                self.angles[#self.angles + 1] = a
                SpecialMarker(self, x + math.cos(a) * 120, y + math.sin(a) * 120, i == 0 or i == 17)
            end
            -- The two rays mark the full safe wedge, including the outer edge of the final wave.
            for _, side in ipairs({-1, 1}) do
                local a, reach = self.gap + side * self.gapWidth / 2, self.waveMaxRadius + self.width
                WarningStrip(self, x, y, x + math.cos(a) * reach, y + math.sin(a) * reach,
                    8, SurvivorConfig.warningColors.safe, 185, 8)
            end
        else
            self.lanes = {}
            for offset = -240, 240, 240 do
                if not (informed and stage == 5 and offset == 0) then
                    local cx, cy = hx - math.sin(angle) * offset, hy + math.cos(angle) * offset
                    local lane = {ax = cx - math.cos(angle) * 450, ay = cy - math.sin(angle) * 450,
                        bx = cx + math.cos(angle) * 450, by = cy + math.sin(angle) * 450}
                    self.lanes[#self.lanes + 1] = lane
                    local danger = SurvivorConfig.warningColors.danger
                    WarningStrip(self, lane.ax, lane.ay, lane.bx, lane.by, self.width * 2, danger, 80)
                    for _, side in ipairs({-1, 1}) do
                        local offset = (self.width - 2.5) * side
                        local dx, dy = -math.sin(angle) * offset, math.cos(angle) * offset
                        WarningStrip(self, lane.ax + dx, lane.ay + dy, lane.bx + dx, lane.by + dy, 5, danger, 220, 6)
                    end
                end
            end
        end
        warningUntil = math.max(warningUntil, RunSession.GetElapsed() + self.delay + 3)
        TrackHostile(self)
        ALICE_Create(self)
    end
    local function BossPattern(record)
        local pattern = SurvivorConfig.encounters[stage].pattern
        record.patternCount = (record.patternCount or 0) + 1
        if pattern == "cycle" then pattern = ({"dash", "wave", "chains", "cross"})[(record.patternCount - 1) % 4 + 1] end
        local x, y, delay = GetUnitX(hero), GetUnitY(hero), SurvivorConfig.bossBlastDelay
        if stage == 4 and (record.patternCount - 1) % 4 == 0 then
            if not SurvivorExpedition.UseAdvantage(stage) then
                record.supportAt = RunSession.GetElapsed() + 2
            end
        end
        if stage == 1 and pattern == "target" and SurvivorExpedition.UseAdvantage(stage) then delay = delay + 1 end
        if pattern == "dash" or pattern == "wave" or pattern == "chains" then
            StartSpecial(pattern, record)
        elseif pattern == "target" then
            WarnBossBlast(x, y, SurvivorConfig.bossBlastRadius, delay)
        else
            WarnBossBlast(x, y, 150, delay)
            for i = 1, 4 do
                local angle = i * math.pi / 2
                WarnBossBlast(x + math.cos(angle) * 340, y + math.sin(angle) * 340, 150, delay + 0.4)
            end
        end
    end
    local eliteTraits = {
        {id = "tracker", name = "추격자", color = {255, 145, 70}, model = [[Abilities\Spells\Orc\Bloodlust\BloodlustTarget.mdl]]},
        {id = "guardian", name = "결계지기", color = {90, 160, 255}, model = [[Abilities\Spells\Human\ManaShield\ManaShieldTarget.mdl]]},
        {id = "plague", name = "역병술사", color = {200, 100, 230}, model = [[Abilities\Spells\Undead\DiseaseCloud\DiseaseCloudTarget.mdl]]},
    }
    local function PlagueStep(self)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or self.cleaned then return dt end
        if not Enemy(self.source) or not Alive(hero) then ALICE_Kill(self); return dt end
        if HostileStopped(self) then return dt end
        self.elapsed = self.elapsed + dt
        if self.elapsed < 1.2 then return dt end
        if self.elapsed >= 6.2 then ALICE_Kill(self); return dt end
        if not self.visual then
            self.visual = AddSpecialEffect([[Abilities\Spells\Undead\PlagueCloud\PlagueCloudtarget.mdl]], self.x, self.y)
            BlzSetSpecialEffectScale(self.visual, 1.5)
        end
        if self.elapsed >= self.nextHit then
            self.nextHit = self.elapsed + 1
            if (GetUnitX(hero) - self.x)^2 + (GetUnitY(hero) - self.y)^2 <= 160^2 then
                HurtHero(self.source, self.damage, "역병 장판", "보라색 원 밖으로 이동하거나 역병술사를 먼저 처치하세요.")
            end
        end
        return dt
    end
    local function WarnPlague(source, record)
        local x, y = GetUnitX(hero), GetUnitY(hero)
        local self = {identifier = "hsEnemyPlague", source = source, x = x, y = y, z = Height(x, y),
            elapsed = 0, nextHit = 1.2, damage = 12 * record.damageScale, markers = {},
            isStationary = true, isAnonymous = true, selfInteractions = PlagueStep, destroy = DestroyObject}
        objects[self] = true
        for i = 1, 12 do
            local angle = i * 2 * math.pi / 12
            local marker = AddSpecialEffect(SurvivorConfig.warningModel, x + math.cos(angle) * 160, y + math.sin(angle) * 160)
            BlzSetSpecialEffectColor(marker, 230, 70, 220)
            BlzSetSpecialEffectScale(marker, 0.4)
            self.markers[#self.markers + 1] = marker
        end
        warningUntil = math.max(warningUntil, RunSession.GetElapsed() + 1.2)
        TrackHostile(self)
        ALICE_Create(self)
    end
    function SurvivorCombat.Spawn(elite, kind)
        local c, elapsed = SurvivorConfig, RunSession.GetElapsed() - stageStarted
        local encounter = c.encounters[stage]
        if not RunSession.IsRunning() or not Alive(hero) then return false end
        local isBoss = kind == "boss"
        if isBoss and (boss ~= nil or bossDefeated) then return false end
        -- Reserve one actor slot so a full wave cannot block the final boss.
        local cap = math.min(c.maxEnemies, c.stageEnemyCaps[stage])
        if enemyCount >= cap - (isBoss and 0 or 1) then return false end
        if not kind then
            local roll = GetRandomInt(1, 100)
            local flying = elapsed >= encounter.flyingStart and encounter.flying or 0
            kind = not elite and roll <= flying and "flying"
                or not elite and elapsed >= encounter.rangedStart and roll <= flying + encounter.ranged and "ranged" or "melee"
        end
        local profile = kind == "ranged" and c.rangedEnemy or kind == "flying" and c.flyingEnemy or nil
        local scaling = c.EnemyScaling(stage, elapsed, isBoss)
        local theme = SurvivorStage.Get(stage)
        local id = theme.ids[isBoss and "boss" or kind == "courier" and "ranged" or kind]
        local heroX, heroY, distance = GetUnitX(hero), GetUnitY(hero), c.spawnDistance
        local enemy
        for _ = 1, 16 do
            local angle = GetRandomReal(0, 2 * math.pi)
            local x, y = heroX + math.cos(angle) * distance, heroY + math.sin(angle) * distance
            if x > bounds.minX and x < bounds.maxX and y > bounds.minY and y < bounds.maxY
                and not IsTerrainPathable(x, y, PATHING_TYPE_WALKABILITY) then
                enemy = CreateUnit(NextEnemyOwner(), id, x, y, 0)
                assert(enemy ~= nil and GetUnitTypeId(enemy) == id, "Enemy object ID is missing")
                -- Native pathing may relocate a unit; never accept a closer spawn.
                local actualX, actualY = GetUnitX(enemy), GetUnitY(enemy)
                local dx, dy = actualX - heroX, actualY - heroY
                if dx * dx + dy * dy + 0.01 >= distance * distance
                    and actualX > bounds.minX and actualX < bounds.maxX
                    and actualY > bounds.minY and actualY < bounds.maxY
                    and not IsTerrainPathable(actualX, actualY, PATHING_TYPE_WALKABILITY) then break end
                RemoveUnit(enemy)
                enemy = nil
            end
        end
        if not enemy then return false end
        units[enemy] = {enemy = true, alive = true, elite = elite == true, boss = isBoss,
            profile = profile, damageScale = scaling.damage * difficulty.damage,
            attackSpeed = scaling.attackSpeed * difficulty.attackSpeed,
            nextShot = RunSession.GetElapsed() + 1.2, nextBlast = RunSession.GetElapsed() + 2.0}
        enemyCount = enemyCount + 1
        SetUnitCreepGuard(enemy, false)
        RemoveGuardPosition(enemy)
        local life = (isBoss and c.bossLife or (profile and profile.life or c.enemyLife * encounter.meleeLife)
            * (elite and c.eliteLifeMultiplier or 1)) * scaling.life * difficulty.life
        -- Stage/profile multipliers produce reals; the max-HP native requires an integer.
        life = math.max(1, math.floor(life + 0.5))
        BlzSetUnitMaxHP(enemy, life)
        SetWidgetLife(enemy, life)
        BlzSetUnitBaseDamage(enemy, math.floor((isBoss and c.bossDamage or c.enemyDamage * (elite and c.eliteDamageMultiplier or 1)) * units[enemy].damageScale), 0)
        if not profile then
            -- Native melee swings and Lua ranged shots each use their own cooldown source.
            local cooldown = BlzGetUnitAttackCooldown(enemy, 0)
            if cooldown > 0 then BlzSetUnitAttackCooldown(enemy, cooldown / units[enemy].attackSpeed, 0) end
        end
        if isBoss then
            boss = enemy
            if theme.burningBoss then
                units[enemy].cosmetic = AddSpecialEffectTarget("Abilities\\Spells\\NightElf\\Immolation\\ImmolationTarget.mdl", enemy, "origin")
            end
            BlzSetUnitName(enemy, stage .. "단계 보스 · " .. encounter.bossName)
            SetUnitScale(enemy, 1.6, 1.6, 1.6)
        elseif profile then
            BlzSetUnitName(enemy, kind == "flying" and encounter.flyingName or encounter.rangedName)
            -- Lua projectiles can freeze with the same ALICE clock as our weapons.
            BlzUnitDisableAbility(enemy, FourCC("Aatk"), true, true)
        elseif elite then
            SetUnitScale(enemy, 1.35, 1.35, 1.35)
            BlzSetUnitName(enemy, "정예 · " .. encounter.meleeName)
        else
            BlzSetUnitName(enemy, encounter.meleeName)
            if stage == 4 then SetUnitScale(enemy, 1.2, 1.2, 1.2) end
        end
        local color = theme.color
        if elite and not isBoss then
            eliteSerial = eliteSerial + 1
            local trait = eliteTraits[(eliteSerial - 1) % #eliteTraits + 1]
            local record = units[enemy]
            record.trait, record.nextTrait = trait.id, RunSession.GetElapsed() + 3
            record.cosmetic = AddSpecialEffectTarget(trait.model, enemy, "origin")
            BlzSetUnitName(enemy, "정예 " .. trait.name .. " · " .. encounter.meleeName)
            color = trait.color
        end
        units[enemy].baseColor = {color[1], color[2], color[3], 255}
        EnemyColor(enemy, units[enemy])
        SetUnitMoveSpeed(enemy, math.min(330, (isBoss and c.bossMoveSpeed or profile and profile.speed or c.enemyMoveSpeed * encounter.meleeSpeed)
            * scaling.moveSpeed * difficulty.moveSpeed))
        units[enemy].baseSpeed = GetUnitMoveSpeed(enemy)
        ALICE_AddIdentifier(enemy, "hsEnemy", "unit")
        orderSerial = orderSerial % SurvivorConfig.enemyOrderGroups + 1
        units[enemy].orderGroup = orderSerial
        StopUnitTime(enemy, units[enemy], isBoss and timeStopBossUntil or timeStopUntil)
        if profile then MoveEnemy(enemy, units[enemy], GetUnitX(hero), GetUnitY(hero), 0, true)
        else IssueTargetOrder(enemy, "attack", hero) end
        return true, enemy
    end
    function SurvivorCombat.SpawnCourier(points)
        local success, unit = SurvivorCombat.Spawn(false, "courier")
        if not success then return nil end
        local record = units[unit]
        record.courier, record.waypoint = points, 2
        SetUnitX(unit, points[1].x); SetUnitY(unit, points[1].y)
        SetUnitMoveSpeed(unit, 260); record.baseSpeed = 260
        BlzSetUnitName(unit, "수색 명령을 지닌 전령")
        record.baseColor = {235, 210, 100, 255}
        EnemyColor(unit, record)
        BlzUnitDisableAbility(unit, FourCC("Aatk"), true, true)
        MoveEnemy(unit, record, points[2].x, points[2].y, 0, true)
        return unit
    end
    function SurvivorCombat.ReleaseCourier(unit)
        local record = units[unit]
        if not record then return end
        statusUnits[unit] = nil
        frostStackUnits[unit] = nil
        poisonUnits[unit] = nil
        if record.alive then enemyCount = enemyCount - 1; ALICE_RemoveIdentifier(unit, "hsEnemy") end
        if record.cosmetic then DestroyEffect(record.cosmetic) end
        units[unit] = nil
        RemoveUnit(unit)
    end
    function SurvivorCombat.SpawnBoss()
        return SurvivorCombat.Spawn(false, "boss")
    end
    function SurvivorCombat.BossDefeated() return bossDefeated end
    function SurvivorCombat.BossStatus()
        if not Enemy(boss) then return nil end
        local current, maximum = math.max(0, GetWidgetLife(boss)), BlzGetUnitMaxHP(boss)
        return {name = SurvivorConfig.encounters[stage].bossName, current = current, max = maximum,
            enraged = stage == 5 and current <= maximum * 0.5}
    end
    function SurvivorCombat.PurgeNearby()
        if not RunSession.IsRunning() or not Alive(hero) then return 0 end
        local config, victims, count = SurvivorConfig.bonusProps, {}, 0
        local x, y = GetUnitX(hero), GetUnitY(hero)
        for u in pairs(units) do
            if Enemy(u) and (GetUnitX(u) - x)^2 + (GetUnitY(u) - y)^2 <= config.purgeRadius^2 then victims[#victims + 1] = u end
        end
        table.sort(victims, function(a, b) return GetHandleId(a) < GetHandleId(b) end)
        local previous = purging
        purging = true
        local ok, message = pcall(function()
            for _, u in ipairs(victims) do
                if not RunSession.IsRunning() or not Alive(hero) then break end
                if Enemy(u) then
                    if units[u].boss then SetWidgetLife(u, math.max(1, GetWidgetLife(u) - BlzGetUnitMaxHP(u) * config.purgeBossFraction))
                    else KillUnit(u); count = count + 1 end
                end
            end
        end)
        purging = previous
        if not ok then error(message, 0) end
        ProcVisual(x, y, Height(x, y), SurvivorConfig.emberBurstModel, config.purgeRadius / 300)
        return count
    end
    local function RollBonus()
        local roll, total = GetRandomInt(1, 100), 0
        for _, drop in ipairs(SurvivorConfig.bonusProps.drops) do
            total = total + drop.weight
            if roll <= total then return drop.kind end
        end
        error("Bonus drop weights must total 100")
    end
    local function RemoveBonusItem(item)
        bonusItems[item] = nil
        if GetItemTypeId(item) ~= 0 then RemoveItem(item) end
    end
    local function ClearBonusItems()
        while next(bonusItems) ~= nil do RemoveBonusItem(next(bonusItems)) end
    end
    local function CollectBonusItem(item)
        local record = bonusItems[item]
        if not record or not RunSession.IsRunning() or not Alive(hero) then return end
        -- Detach before removing the native item or invoking a possibly reentrant reward.
        RemoveBonusItem(item)
        if onBonus then onBonus(record.kind) end
    end
    local function DropBonusItem(kind, x, y)
        local config = SurvivorConfig.bonusProps
        local itemId = config[kind].itemId
        local item = CreateItem(itemId, x, y)
        assert(item ~= nil and GetItemTypeId(item) == itemId, "Bonus pickup object ID is missing")
        bonusItems[item] = {kind = kind, expires = RunSession.GetElapsed() + config.itemLifetime}
    end
    UpdateBonusItems = function(elapsed)
        local config, hx, hy = SurvivorConfig.bonusProps, GetUnitX(hero), GetUnitY(hero)
        for item, record in pairs(bonusItems) do
            -- An automatically consumed powerup may already have no native handle.
            -- A paused pickup retains its reward until the next running update.
            if record.pending then CollectBonusItem(item)
            elseif GetItemTypeId(item) == 0 or elapsed >= record.expires then RemoveBonusItem(item)
            else
                local x, y = GetItemX(item), GetItemY(item)
                if (x - hx)^2 + (y - hy)^2 <= config.pickupRadius^2 and SurvivorStage.LineClear(hx, hy, x, y) then
                    CollectBonusItem(item)
                end
            end
        end
    end
    local function RemoveBonus(u, record)
        if record.alive then bonusCount = math.max(0, bonusCount - 1) end
        if record.cosmetic then DestroyEffect(record.cosmetic); record.cosmetic = nil end
        ALICE_RemoveIdentifier(u, "hsEnemy")
        units[u] = nil
        RemoveUnit(u)
    end
    local function UpdateBonuses(elapsed)
        local config = SurvivorConfig.bonusProps
        UpdateBonusItems(elapsed)
        for u, record in pairs(units) do
            if record.bonus and elapsed >= (record.alive and record.expiresAt or record.removeAt) then RemoveBonus(u, record) end
        end
        if elapsed < nextBonusAt or bonusCount >= config.limit or boss ~= nil or bossDefeated
            or elapsed - stageStarted >= SurvivorConfig.StageTiming(stage).bossStart then return end
        nextBonusAt = elapsed + config.retry
        local hx, hy = GetUnitX(hero), GetUnitY(hero)
        for _ = 1, 16 do
            local angle, distance = GetRandomReal(0, 2 * math.pi), GetRandomReal(config.distanceMin, config.distanceMax)
            local x, y = hx + math.cos(angle) * distance, hy + math.sin(angle) * distance
            local valid = x > bounds.minX + 64 and x < bounds.maxX - 64 and y > bounds.minY + 64 and y < bounds.maxY - 64
                and SurvivorStage.LineClear(hx, hy, x, y)
            -- Check the route through native scenery too, with a hero-sized margin.
            local steps = math.ceil(distance / 48)
            for i = 1, steps do
                if not valid then break end
                local px, py = hx + (x - hx) * i / steps, hy + (y - hy) * i / steps
                for _, offset in ipairs({{0, 0}, {32, 0}, {-32, 0}, {0, 32}, {0, -32}}) do
                    if IsTerrainPathable(px + offset[1], py + offset[2], PATHING_TYPE_WALKABILITY) then valid = false; break end
                end
            end
            for u, record in pairs(units) do
                if record.bonus and record.alive and (GetUnitX(u) - x)^2 + (GetUnitY(u) - y)^2 < 240^2 then valid = false end
            end
            if valid then
                local prop = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), config.unitId, x, y, GetRandomReal(0, 360))
                assert(prop ~= nil and GetUnitTypeId(prop) == config.unitId, "Bonus prop object ID is missing")
                units[prop] = {bonus = true, alive = true, expiresAt = elapsed + config.lifetime}
                bonusCount = bonusCount + 1
                BlzSetUnitMaxHP(prop, config.hits)
                SetWidgetLife(prop, config.hits)
                BlzSetUnitName(prop, config.name)
                PauseUnit(prop, true)
                units[prop].wasPaused = true
                local marker = AddSpecialEffect(SurvivorConfig.specialSafeMarkerModel, x, y)
                units[prop].cosmetic = marker
                BlzSetSpecialEffectScale(marker, 0.55)
                BlzSetSpecialEffectColor(marker, config.color[1], config.color[2], config.color[3])
                ALICE_AddIdentifier(prop, "hsEnemy", "unit")
                nextBonusAt = elapsed + GetRandomReal(config.intervalMin, config.intervalMax)
                return
            end
        end
    end
    function SurvivorCombat.UpdateEnemies(elapsed)
        if not RunSession.IsRunning() or not Alive(hero) then return end
        UpdateBonuses(elapsed)
        orderPhase = orderPhase % SurvivorConfig.enemyOrderGroups + 1
        local guardians = {}
        for u, record in pairs(units) do
            if record.trait == "guardian" and Enemy(u) then
                guardians[#guardians + 1] = {unit = u, x = GetUnitX(u), y = GetUnitY(u)}
            end
        end
        for u, record in pairs(units) do
            if record.enemy then
                record.shieldSource = nil
                if #guardians > 0 and record.alive and not record.boss and record.trait ~= "guardian" then
                    local x, y = GetUnitX(u), GetUnitY(u)
                    for _, guardian in ipairs(guardians) do
                        if (guardian.x - x)^2 + (guardian.y - y)^2 <= 400^2 then
                            record.shieldSource = guardian.unit; break
                        end
                    end
                end
                if record.alive and not record.special and not UnitTimeStopped(u, elapsed)
                    and not (record.freezeUntil and record.freezeUntil > elapsed) then
                    if record.trait and elapsed >= record.nextTrait then
                        record.nextTrait = elapsed + 8
                        if record.trait == "tracker" then StartSpecial("dash", record, u)
                        elseif record.trait == "plague" then WarnPlague(u, record) end
                    end
                    if record.courier then
                        local point = record.courier[record.waypoint]
                        if (GetUnitX(u) - point.x)^2 + (GetUnitY(u) - point.y)^2 < 140^2 then
                            record.waypoint = record.waypoint % #record.courier + 1
                            point = record.courier[record.waypoint]
                        end
                        MoveEnemy(u, record, point.x, point.y, 0, true)
                    elseif record.profile then
                        local profile = record.profile
                        local dx, dy = GetUnitX(hero) - GetUnitX(u), GetUnitY(hero) - GetUnitY(u)
                        local distanceSq = dx * dx + dy * dy
                        if distanceSq > profile.range * profile.range or not SurvivorStage.LineClear(GetUnitX(u), GetUnitY(u), GetUnitX(hero), GetUnitY(hero)) then
                            -- Far chasers tolerate a staler target; close ones re-aim sooner.
                            MoveEnemy(u, record, GetUnitX(hero), GetUnitY(hero), math.max(128, math.sqrt(distanceSq) * 0.25),
                                record.orderGroup == orderPhase)
                        else
                            if GetUnitCurrentOrder(u) ~= 0 then IssueImmediateOrder(u, "stop") end
                            if elapsed >= record.nextShot then
                                record.nextShot = elapsed + profile.interval / record.attackSpeed
                                SetUnitFacing(u, Atan2(dy, dx) * bj_RADTODEG)
                                FireEnemyMissile(u, profile)
                            end
                        end
                    else
                        -- Reissuing an attack during its windup can interrupt the hit.
                        if GetUnitCurrentOrder(u) ~= OrderId("attack") then IssueTargetOrder(u, "attack", hero) end
                    end
                    if record.boss and elapsed >= record.nextBlast then
                        local enraged = stage == 5 and GetWidgetLife(u) <= BlzGetUnitMaxHP(u) * 0.5
                        record.nextBlast = elapsed + (enraged and 3.5 or SurvivorConfig.bossBlastInterval) / record.attackSpeed
                        BossPattern(record)
                    end
                    if record.boss and record.supportAt and elapsed >= record.supportAt then
                        record.supportAt = nil
                        for i = 1, 3 do SurvivorCombat.Spawn(false, i == 3 and "melee" or "ranged") end
                    end
                elseif not record.alive and record.removeAt and elapsed >= record.removeAt then units[u] = nil; RemoveUnit(u) end
            end
        end
    end
    function SurvivorCombat.MaintainInventoryPause()
        if not frozen or not inventoryVitals or not Alive(hero) then return end
        -- Leave the hero's inventory abilities enabled. Freeze movement/vitals
        -- separately so native equip/unequip orders still work during the pause.
        inventoryVitals.life = math.min(inventoryVitals.life, GetWidgetLife(hero), BlzGetUnitMaxHP(hero))
        inventoryVitals.mana = math.min(inventoryVitals.mana, GetUnitState(hero, UNIT_STATE_MANA), GetUnitState(hero, UNIT_STATE_MAX_MANA))
        SetWidgetLife(hero, inventoryVitals.life)
        SetUnitState(hero, UNIT_STATE_MANA, inventoryVitals.mana)
        if inventoryFrozen then
            if GetUnitX(hero) ~= inventoryVitals.x then SetUnitX(hero, inventoryVitals.x) end
            if GetUnitY(hero) ~= inventoryVitals.y then SetUnitY(hero, inventoryVitals.y) end
        end
    end
    function SurvivorCombat.SetPaused(enable, reason)
        local interactiveHero = enable and (reason == "INVENTORY" or reason == "STAGE_CLEAR")
        local showRegeneration = interactiveHero or enable and RunSession.IsInventoryOpen and RunSession.IsInventoryOpen() == true
        local suppressRegeneration = enable == true and not showRegeneration
        if frozen == enable and inventoryFrozen == interactiveHero
            and stats.nativeRegenerationPaused == suppressRegeneration then return end
        -- Interactive panels show the real engine rate in ASde. The existing
        -- inventory timer and final close correction keep actual HP frozen.
        -- Choice screens suppress it only when no native stats panel is open.
        stats.nativeRegenerationPaused = suppressRegeneration
        -- Every pause reason, including interactive panels that keep regeneration visible.
        stats.combatPaused = enable == true
        SurvivorAugments.ApplyHeroRegeneration(hero, stats)
        if inventoryVitals then SurvivorCombat.MaintainInventoryPause() end
        -- ASde display passives are real engine modifiers: clear them before resuming.
        if SurvivorNativeLoadout and SurvivorNativeLoadout.RefreshStatDisplays then SurvivorNativeLoadout.RefreshStatDisplays() end
        if inventoryFrozen then
            BlzUnitDisableAbility(hero, FourCC("Amov"), false, false)
        end
        for u, record in pairs(units) do
            if GetUnitTypeId(u) ~= 0 then
                if enable and not frozen then
                    record.wasPaused = IsUnitPaused(u)
                    if record.freezeUntil then record.wasPaused = record.freezeWasPaused end
                    if record.timeStopUntil then record.wasPaused = record.timeStopWasPaused end
                end
                PauseUnit(u, (enable and not (interactiveHero and u == hero)) or record.wasPaused == true
                    or record.special ~= nil or UnitTimeStopped(u)
                    or (record.freezeUntil ~= nil and record.freezeUntil > RunSession.GetElapsed()))
                local scale = (enable or UnitTimeStopped(u)) and 0 or 1
                SetUnitTimeScale(u, scale)
                if record.cosmetic then BlzSetSpecialEffectTimeScale(record.cosmetic, scale) end
            end
        end
        if showRegeneration then
            inventoryVitals = {life = GetWidgetLife(hero), mana = GetUnitState(hero, UNIT_STATE_MANA),
                x = GetUnitX(hero), y = GetUnitY(hero)}
        else inventoryVitals = nil end
        if interactiveHero then
            IssueImmediateOrder(hero, "stop")
            BlzUnitDisableAbility(hero, FourCC("Amov"), true, true)
        end
        frozen, inventoryFrozen = enable, interactiveHero
        RefreshTimeStopFilter(enable)
        for object in pairs(objects) do
            ObjectTimeScale(object, enable or HostileStopped(object))
        end
    end
    function SurvivorCombat.Counts()
        local count, visuals = 0, 0
        for object in pairs(objects) do
            count = count + 1
            if object.visual then visuals = visuals + 1 end
            if object.markers then visuals = visuals + #object.markers end
            if object.lightning then visuals = visuals + 1 end
        end
        for _, record in pairs(units) do if record.cosmetic then visuals = visuals + 1 end end
        return enemyCount, count, visuals
    end
    function SurvivorCombat.DamageReport()
        local rows = {}
        for id, data in pairs(damageTotals) do rows[#rows + 1] = {id = id, damage = data.damage} end
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
            CleanupCall(errors, "pause cleanup timer", function() PauseTimer(timer) end)
            CleanupCall(errors, "destroy cleanup timer", function() DestroyTimer(timer) end)
            if #errors > 0 then error(table.concat(errors, "\n"), 0) end
        end
    end
    local function RemoveEnemy(u)
        local record = units[u]
        if not record or not record.enemy then return end
        if GetUnitTypeId(u) ~= 0 then EnemyColor(u, record, false, true) end
        statusUnits[u] = nil
        frostStackUnits[u] = nil
        poisonUnits[u] = nil
        if record.cosmetic then DestroyEffect(record.cosmetic); record.cosmetic = nil end
        if record.alive then enemyCount = math.max(0, enemyCount - 1) end
        units[u] = nil
        ALICE_RemoveIdentifier(u, "hsEnemy")
        RemoveUnit(u)
    end
    function SurvivorCombat.IsClearing() return clearing end
    function SurvivorCombat.ClearBattlefieldAsync(onComplete)
        assert(RunSession.GetState() == "STAGE_CLEAR" and not clearing, "Clear only once while combat is paused")
        assert(type(onComplete) == "function", "Missing battlefield completion callback")
        CancelBattlefieldClear()
        ClearEscape()
        ClearBonusItems()
        ResetTimeStop()
        ward, wardUntil = 0, 0
        local pending, head = {}, 1
        for u, record in pairs(units) do if record.enemy or record.bonus then pending[#pending + 1] = u end end
        local generation = clearGeneration
        local budget = math.max(1, math.floor(SurvivorConfig.battlefieldCleanupBudget))
        local aliceBudget = math.max(1, math.floor(SurvivorConfig.battlefieldAliceCleanupBudget))
        clearing, clearTimer = true, CreateTimer()
        -- ALICE is halted during stage clear. This native timer only removes owned
        -- handles; it never advances combat time, XP, drops, or weapon lifetimes.
        TimerStart(clearTimer, SurvivorConfig.battlefieldCleanupInterval, true, function()
            if generation ~= clearGeneration then return end
            if RunSession.GetState() ~= "STAGE_CLEAR" then CancelBattlefieldClear(); return end
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
                if next(objects) == nil and head > #pending and remainingActors == 0 then
                    CancelBattlefieldClear()
                    enemyCount, boss = 0, nil
                    onComplete()
                    return
                end
                local work = 0
                while work < budget do
                    local object = next(objects)
                    if object then
                        local cost = 1 + (object.markers and #object.markers or 0) + (object.lightning and 1 or 0)
                        -- A single actor is indivisible; never combine a large actor
                        -- with other removals when it exceeds this tick's budget.
                        if work > 0 and work + cost > budget then break end
                        objects[object] = nil
                        ALICE_Kill(object)
                        work = work + cost
                        SurvivorMetrics.Count("cleanup.objects")
                    elseif head <= #pending then
                        local unit = pending[head]
                        local cost = units[unit] and units[unit].cosmetic and 2 or 1
                        if work > 0 and work + cost > budget then break end
                        head = head + 1
                        if units[unit] and units[unit].bonus then RemoveBonus(unit, units[unit]) else RemoveEnemy(unit) end
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
        ClearEscape()
        ClearBonusItems()
        ResetTimeStop()
        ward, wardUntil = 0, 0
        while next(objects) ~= nil do local object = next(objects); objects[object] = nil; ALICE_Kill(object) end
        for u, record in pairs(units) do
            if record.bonus then RemoveBonus(u, record)
            elseif record.enemy then
                RemoveEnemy(u)
            end
        end
        enemyCount, boss = 0, nil
    end
    function SurvivorCombat.BeginStage(index, elapsed)
        assert(Alive(hero) and index >= 1 and index <= SurvivorConfig.stages, "Invalid stage transition")
        SurvivorCombat.ClearBattlefield()
        stage, stageStarted, enemyCount, boss, bossDefeated, warningUntil = index, elapsed, 0, nil, false, 0
        bonusCount, nextBonusAt = 0, elapsed + SurvivorConfig.bonusProps.firstSpawn
        stormHits, stormReady, bladeReady = 0, 0, 0
        tagState = {summon = {}, fall = {}, relay = {}, burstHits = 0, burstReady = 0, meleeUntil = 0}
        escapeReady = true
        recentDamage = {}
        for _, data in pairs(damageTotals) do data.stageDamage = 0 end
        -- Keep the same hero/XP/inventory and the same damage ledger across stages.
        SetUnitX(hero, (bounds.minX + bounds.maxX) / 2)
        SetUnitY(hero, (bounds.minY + bounds.maxY) / 2)
        SetWidgetLife(hero, BlzGetUnitMaxHP(hero))
        -- A still-open inventory keeps the pause reason, so refresh its frozen snapshot too.
        if inventoryVitals then
            inventoryVitals.x, inventoryVitals.y, inventoryVitals.life = GetUnitX(hero), GetUnitY(hero), GetWidgetLife(hero)
        end
    end
    function SurvivorCombat.Cleanup()
        local errors = {}
        CleanupCall(errors, "battlefield timer", CancelBattlefieldClear)
        onKill, onDeath, onBonus = nil, nil, nil
        if stats then stats.nativeRegenerationPaused = true end
        if hero ~= nil and GetUnitTypeId(hero) ~= 0 then
            CleanupCall(errors, "hero regeneration", function() SurvivorAugments.ApplyHeroRegeneration(hero, stats) end)
        end
        CleanupCall(errors, "escape", ClearEscape)
        local oldDamage, oldDeath, oldPickup = damageTrigger, deathTrigger, bonusPickupTrigger
        damageTrigger, deathTrigger, bonusPickupTrigger = nil, nil, nil
        if oldDamage then CleanupCall(errors, "damage trigger", function() DestroyTrigger(oldDamage) end) end
        if oldDeath then CleanupCall(errors, "death trigger", function() DestroyTrigger(oldDeath) end) end
        if oldPickup then CleanupCall(errors, "bonus pickup trigger", function() DestroyTrigger(oldPickup) end) end
        local pendingItems = bonusItems
        bonusItems = {}
        timeStopUntil, timeStopBossUntil, purging = 0, 0, false
        CleanupCall(errors, "time stop filter", function() RefreshTimeStopFilter(true) end)
        timeStopUnits, hostileObjects = {}, {}
        for item in pairs(pendingItems) do
            if GetItemTypeId(item) ~= 0 then CleanupCall(errors, "bonus item", function() RemoveItem(item) end) end
        end
        local pendingObjects, pendingUnits = objects, units
        objects, units, statusUnits, frostStackUnits, poisonUnits = {}, {}, {}, {}, {}
        for object in pairs(pendingObjects) do
            if not CleanupCall(errors, "actor", function() ALICE_Kill(object) end) then
                -- ALICE_Kill clears its actor only after the object's destroy method.
                -- An exception there must not leave a callback registered after reset.
                if type(object.destroy) == "function" then CleanupCall(errors, "actor effects", function() object:destroy() end) end
                if type(ALICE_Destroy) == "function" then CleanupCall(errors, "actor registration", function() ALICE_Destroy(object) end) end
            end
        end
        for u, record in pairs(pendingUnits) do
            if record.cosmetic then
                local cosmetic = record.cosmetic
                record.cosmetic = nil
                CleanupCall(errors, "unit effect", function() DestroyEffect(cosmetic) end)
            end
            CleanupCall(errors, "unit", function() RemoveUnit(u) end)
        end
        local oldHeight, oldGroup = heightLocation, queryGroup
        heightLocation, queryGroup = nil, nil
        if oldHeight ~= nil then CleanupCall(errors, "height location", function() RemoveLocation(oldHeight) end) end
        if oldGroup ~= nil then CleanupCall(errors, "query group", function() DestroyGroup(oldGroup) end) end
        candidatePool = {}
        friendlyAlpha = 140
        hero, stats, bounds = nil, nil, nil
        summonCounts = {}
        enemyCount, frozen, inventoryFrozen, inventoryVitals = 0, false, false, nil
        bonusCount, nextBonusAt = 0, 0
        stage, stageStarted, damageTotals, warningUntil, boss, bossDefeated = 1, 0, {}, 0, nil, false
        difficulty = SurvivorConfig.difficulties.normal
        stormHits, stormReady, bladeReady = 0, 0, 0
        tagState = {summon = {}, fall = {}, relay = {}, burstHits = 0, burstReady = 0, meleeUntil = 0}
        escapeReady, escapeUses, eliteSerial = true, 0, 0
        tagSecondary = false
        ward, wardUntil, damageContext, hitSecondary, shatterReady = 0, 0, nil, false, 0
        recentDamage, stageEscapeUses = {}, {}
        if #errors > 0 then error(table.concat(errors, "\n"), 0) end
    end
    function SurvivorCombat.Init(unit, buildStats, arena, killCallback, deathCallback, difficultyId, bonusCallback)
        assert(hero == nil, "Combat must be cleaned before reinitializing")
        difficulty = assert(SurvivorConfig.difficulties[difficultyId or "normal"], "Invalid combat difficulty")
        hero, stats, bounds, onKill, onDeath = unit, buildStats, arena, killCallback, deathCallback
        onBonus = bonusCallback
        bonusCount, nextBonusAt = 0, RunSession.GetElapsed() + SurvivorConfig.bonusProps.firstSpawn
        units[hero] = {enemy = false, alive = true}
        stats.nativeRegenerationPaused, stats.combatPaused = false, false
        SurvivorAugments.ApplyHeroRegeneration(hero, stats)
        heightLocation = Location(0, 0)
        queryGroup = CreateGroup()
        bonusPickupTrigger = CreateTrigger()
        TriggerRegisterAnyUnitEventBJ(bonusPickupTrigger, EVENT_PLAYER_UNIT_PICKUP_ITEM)
        TriggerAddAction(bonusPickupTrigger, function()
            if GetTriggerUnit() ~= hero or not Alive(hero) then return end
            local item = GetManipulatedItem()
            local record = bonusItems[item]
            if not record then return end
            if RunSession.IsRunning() then CollectBonusItem(item)
            else record.pending = true end
        end)
        damageTrigger = CreateTrigger()
        TriggerRegisterAnyUnitEventBJ(damageTrigger, EVENT_PLAYER_UNIT_DAMAGED)
        TriggerAddAction(damageTrigger, function()
            local target, damage = GetTriggerUnit(), GetEventDamage()
            if damage <= 0 then return end
            local record = units[target]
            if record and record.bonus then
                BlzSetEventDamage(RunSession.IsRunning() and record.alive and Alive(hero) and GetEventDamageSource() == hero and 1 or 0)
            elseif target == hero then
                -- Post-mitigation damage event, before HP subtraction; catches native melee too.
                if not RunSession.IsRunning() or RunSession.GetElapsed() < escapeUntil then BlzSetEventDamage(0); return end
                if UnitTimeStopped(GetEventDamageSource()) then BlzSetEventDamage(0); return end
                if SurvivorExpedition.RiskActive() and Enemy(GetEventDamageSource()) then damage = damage * 1.25 end
                if stats.sets.bulwark and RunSession.GetElapsed() < tagState.meleeUntil then damage = damage * 0.85 end
                if ward > 0 and RunSession.GetElapsed() < wardUntil then
                    local absorbed = math.min(ward, damage)
                    ward, damage = ward - absorbed, damage - absorbed
                end
                local source = GetEventDamageSource()
                local sourceName = source ~= hero and source ~= nil and GetUnitTypeId(source) ~= 0 and GetUnitName(source) or "환경"
                local entry = {time = RunSession.GetElapsed(), damage = math.min(damage, GetWidgetLife(hero)),
                    name = sourceName .. " / " .. (damageContext and damageContext.name or "일반 공격"),
                    hint = damageContext and damageContext.hint or "근접 적에게 포위되지 않도록 넓은 쪽으로 이동하세요."}
                if escapeReady and damage >= GetWidgetLife(hero) - 0.405 then
                    escapeReady, escapeUntil, escapeUses = false, RunSession.GetElapsed() + SurvivorConfig.escapeDuration, escapeUses + 1
                    BlzSetEventDamage(0)
                    SetWidgetLife(hero, math.max(GetWidgetLife(hero), BlzGetUnitMaxHP(hero) * 0.30))
                    escapeOwnsInvulnerability = not BlzIsUnitInvulnerable(hero)
                    if escapeOwnsInvulnerability then SetUnitInvulnerable(hero, true) end
                    local moved = EscapeBlink(source)
                    escapeEffect = AddSpecialEffectTarget([[Abilities\Spells\Undead\AntiMagicShell\AntiMagicShell.mdl]], hero, "origin")
                    BlzSetSpecialEffectScale(escapeEffect, 1.2)
                    BlzSetSpecialEffectColor(escapeEffect, 185, 135, 255)
                    stageEscapeUses[stage] = (stageEscapeUses[stage] or 0) + 1
                    entry.escaped, entry.damage = true, 0
                    SurvivorUI.Cue("escape")
                    SurvivorUI.Alert(6,
                        "|cffbbaaff그림자 탈출 · " .. (moved and "순간 이동" or "제자리 보호")
                        .. "|r\n생명력 최소 30% · 2.5초 무적\n다음 스테이지에서 재충전", 50, "escape")
                    local heroId, profile = SurvivorConfig.HeroOf(hero)
                    local lines = escapeLines[heroId] or escapeLines.anya
                    SurvivorUI.Say(profile.name, lines[stage] or lines[1])
                else BlzSetEventDamage(damage) end
                if damage > 0 then
                    if #recentDamage == 5 then table.remove(recentDamage, 1) end
                    recentDamage[#recentDamage + 1] = entry
                end
            elseif record and record.shieldSource and Enemy(record.shieldSource)
                and (GetUnitX(target) - GetUnitX(record.shieldSource))^2 + (GetUnitY(target) - GetUnitY(record.shieldSource))^2 <= 400^2 then
                BlzSetEventDamage(damage * 0.70)
            end
        end)
        deathTrigger = CreateTrigger()
        TriggerRegisterAnyUnitEventBJ(deathTrigger, EVENT_PLAYER_UNIT_DEATH)
        TriggerAddAction(deathTrigger, function()
            local dead = GetTriggerUnit()
            local record = units[dead]
            if not record or not record.alive then return end
            record.alive = false
            timeStopUnits[dead] = nil
            if record.timeStopUntil then SetUnitTimeScale(dead, 1) end
            if record.enemy then EnemyColor(dead, record, false) end
            statusUnits[dead] = nil
            frostStackUnits[dead] = nil
            poisonUnits[dead] = nil
            if record.cosmetic then DestroyEffect(record.cosmetic); record.cosmetic = nil end
            if record.bonus then
                bonusCount = math.max(0, bonusCount - 1)
                record.removeAt = RunSession.GetElapsed() + 0.2
                ALICE_RemoveIdentifier(dead, "hsEnemy")
                if RunSession.IsRunning() and Alive(hero) then
                    local kind = RollBonus()
                    DropBonusItem(kind, GetUnitX(dead), GetUnitY(dead))
                end
            elseif record.enemy then
                enemyCount = enemyCount - 1
                record.removeAt = RunSession.GetElapsed() + 2.0
                ALICE_RemoveIdentifier(dead, "hsEnemy")
                if record.boss then bossDefeated = true end
                if RunSession.IsRunning() and not purging then Shatter(dead, record); StatusDeath(dead, record) end
                -- Finish is deferred to Step; never tear down combat during a Hit loop.
                if RunSession.IsRunning() and onKill then onKill(dead, record.elite, record.boss) end
            elseif onDeath then onDeath() end
        end)
    end
end
