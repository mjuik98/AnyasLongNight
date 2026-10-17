-- ALICE owns scheduling, missile actors, target enumeration and zone pairs.
-- The run owns every created unit/effect and removes them on finish/restart.
SurvivorCombat = {}
do
    local hero, heightLocation, deathTrigger = nil, nil, nil
    local units, objects, statusUnits, frostStackUnits = {}, {}, {}, {}
    local stats, onKill, onDeath, bounds = nil, nil, nil, nil
    local enemyCount, frozen = 0, false
    local inventoryFrozen, inventoryVitals = false, nil
    local stage, stageStarted, damageTotals, warningUntil = 1, 0, {}, 0
    local escapeLines = {"위험했네… 여기서 벗어나자.", "불길이 코앞이었어. 빠지자.", "냉기가 스며들기 전에 물러나자.",
        "포위됐어. 길을 다시 열자.", "물길로 빠지자. 아직 끝나지 않았어."}
    local difficulty = SurvivorConfig.difficulties.normal
    local Slow, SetHit, ExpireEmber, ZoneLifetime
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

    local function CleanupCall(errors, label, action)
        local ok, message = pcall(action)
        if not ok then errors[#errors + 1] = label .. ": " .. tostring(message) end
        return ok
    end

    local function HurtHero(source, amount, name, hint)
        local previous = damageContext
        damageContext = {name = name, hint = hint}
        local ok, message = pcall(UnitDamageTarget, source, hero, amount, false, false, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC, WEAPON_TYPE_WHOKNOWS)
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
    local function GroundEnemy(u)
        return Enemy(u) and not IsUnitType(u, UNIT_TYPE_FLYING)
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
            if Enemy(unit) then list[#list + 1] = unit end
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
        objects[self] = nil
        local errors, visual, lightning, markers = {}, self.visual, self.lightning, self.markers
        self.visual, self.lightning, self.markers = nil, nil, nil
        if visual ~= nil then CleanupCall(errors, "effect", function() DestroyEffect(visual) end) end
        if lightning ~= nil then CleanupCall(errors, "lightning", function() DestroyLightning(lightning) end) end
        if markers then
            for _, effect in ipairs(markers) do CleanupCall(errors, "marker", function() DestroyEffect(effect) end) end
        end
        self.target, self.source, self.hitTimes, self.shot = nil, nil, nil, nil
        -- Keep coordinates intact until ALICE_Kill completes actor destruction.
        if #errors > 0 then error(table.concat(errors, "\n"), 0) end
    end
    local function FriendlyEffectAlpha(object, warning)
        if object.identifier == "hsChainHit" then return warning and 110 or 255 end
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
        if object.readableBlade then
            BlzSetSpecialEffectColor(object.visual, 235, 245, 255)
        elseif object.identifier == "hsReturnBlade" then
            BlzSetSpecialEffectColor(object.visual, 190, 165, 225)
        elseif object.identifier == "hsEscapeDeparture" or object.identifier == "hsEscapeArrival" then
            BlzSetSpecialEffectColor(object.visual, 185, 135, 255)
        end
        ALICE_Create(object)
    end
    local function Hit(target, amount, weapon, setProc, secondary)
        if RunSession.IsRunning() and Alive(hero) and Enemy(target) then
            local before = math.max(0, GetWidgetLife(target))
            local isBoss = units[target].boss
            local previous = hitSecondary
            hitSecondary = setProc == true or secondary == true
            UnitDamageTarget(hero, target, amount, false, false, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_MAGIC, WEAPON_TYPE_WHOKNOWS)
            hitSecondary = previous
            local after = Alive(target) and math.max(0, GetWidgetLife(target)) or 0
            local actual = math.max(0, before - after)
            local data = weapon and damageTotals[weapon]
            if data then
                data.damage, data.stageDamage = data.damage + actual, data.stageDamage + actual
                if isBoss then data.bossDamage = data.bossDamage + actual end
            end
            if not setProc and not secondary and actual > 0 then SetHit(target, amount, weapon) end
        end
    end
    local function MoveMissile(missile)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or missile.cleaned then return dt end
        if missile.life <= 0 or missile.remaining <= 0 or not Enemy(missile.target) then
            ALICE_Kill(missile)
            return dt
        end
        -- Re-read terrain and fly height so climbing/flying targets remain tracked.
        local tx, ty, tz = ImpactPoint(missile.target)
        local dx, dy, dz = tx - missile.x, ty - missile.y, tz - missile.z
        local distance = math.sqrt(dx * dx + dy * dy + dz * dz)
        local step = math.min(missile.speed * math.min(dt, missile.life), missile.remaining)
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
            local target, damage, evolution = missile.target, missile.damage, missile.evolution
            local x, y, z = ImpactPoint(target)
            ALICE_Kill(missile)
            if evolution == "evolution2" then
                local record, now = units[target], RunSession.GetElapsed()
                local stacks = now < (record.fireFocusUntil or 0) and (record.fireFocus or 0) or 0
                damage = damage * (1 + math.min(4, stacks) * 0.15)
                record.fireFocus, record.fireFocusUntil = math.min(4, stacks + 1), now + 3
            end
            Hit(target, damage, "firebolt")
            if evolution == "evolution1" and RunSession.IsRunning() then
                CreateObject({identifier = "hsFireBurst", x = x, y = y, z = z, life = 0.4,
                    isAnonymous = true, selfInteractions = ZoneLifetime}, SurvivorConfig.bossImpactModel, 0.55)
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
        if GroundEnemy(enemy) then
            local dx, dy = GetUnitX(enemy) - zone.x, GetUnitY(enemy) - zone.y
            if dx * dx + dy * dy <= zone.radius * zone.radius then Hit(enemy, zone.damage, "flamefield") end
        end
        return interval
    end
    function SurvivorCombat.FireMissile(shot)
        local stats = shot and shot.stats or stats
        if not RunSession.IsRunning() or not Alive(hero) or not stats.missileEnabled then return end
        local x, y = GetUnitX(hero), GetUnitY(hero)
        local primary = ALICE_GetClosestObject(x, y, "hsEnemy", stats.missileRange,
            function(u) return Enemy(u) and SurvivorStage.LineClear(x, y, GetUnitX(u), GetUnitY(u)) end)
        if primary == nil then return end
        local selected, yaw = {}, GetUnitFacing(hero) * bj_DEGTORAD
        local z = Height(x, y) + GetUnitFlyHeight(hero) + SurvivorConfig.missileLaunchHeight
        for shot = 1, stats.missileCount do
            -- Prefer different enemies; concentrate extra shots if fewer are nearby.
            local target = shot == 1 and primary or ALICE_GetClosestObject(x, y, "hsEnemy", stats.missileRange,
                function(u) return Enemy(u) and not selected[u] and SurvivorStage.LineClear(x, y, GetUnitX(u), GetUnitY(u)) end) or primary
            selected[target] = true
            local offset = (shot - (stats.missileCount + 1) / 2) * 18
            local missile = {identifier = "hsMissile",
                x = x - math.sin(yaw) * offset, y = y + math.cos(yaw) * offset, z = z, yaw = yaw,
                owner = GetOwningPlayer(hero), target = target, life = stats.missileLifetime, damage = stats.missileDamage,
                speed = stats.missileSpeed, hitRadius = stats.missileHitRadius, remaining = stats.missileRange, evolution = stats.fireEvolution,
                selfInteractions = MoveMissile, isAnonymous = true}
            CreateObject(missile, SurvivorConfig.missileModel, stats.missileScale)
            local tx, ty, tz = ImpactPoint(target)
            FaceMissile(missile, tx - missile.x, ty - missile.y, tz - missile.z)
        end
    end
    local function SpreadPoint(x, y, distance, shot)
        if shot then
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
        CreateObject({identifier = "hsZone", x = x, y = y, z = Height(x, y),
            owner = GetOwningPlayer(hero), radius = stats.zoneRadius, isStationary = true,
            life = stats.zoneDuration, damage = stats.zoneDamage, pulse = stats.zonePulse,
            selfInteractions = ZoneLifetime, interactions = {hsEnemy = ZoneDamage}},
            SurvivorConfig.zoneModel, stats.zoneRadius / 230)
    end
    function SurvivorCombat.CastChainLightning(shot)
        local stats = shot and shot.stats or stats
        if not RunSession.IsRunning() or not Alive(hero) or not stats.chainEnabled then return end
        local x, y, z = ImpactPoint(hero)
        local visited, damage, range = {}, stats.chainDamage, stats.chainRange
        for jump = 1, stats.chainTargets do
            local target = ALICE_GetClosestObject(x, y, "hsEnemy", range,
                function(u) return Enemy(u) and not visited[u] end)
            if target == nil then break end
            visited[target] = true
            local tx, ty, tz = ImpactPoint(target)
            local bolt = {identifier = "hsLightning", x = x, y = y, z = z,
                life = 0.22, isStationary = true, isAnonymous = true,
                selfInteractions = ZoneLifetime, destroy = DestroyObject}
            bolt.lightning = AddLightningEx(jump == 1 and "CLPB" or "CLSB", true, x, y, z, tx, ty, tz)
            objects[bolt] = true
            ALICE_Create(bolt)
            CreateObject({identifier = "hsChainHit", x = tx, y = ty, z = tz,
                target = target, attachPoint = "chest", life = SurvivorConfig.chainHitDuration,
                isStationary = true, isAnonymous = true, selfInteractions = ZoneLifetime},
                SurvivorConfig.chainHitModel, SurvivorConfig.chainHitScale)
            Hit(target, damage, "chainlightning")
            x, y, z, range = tx, ty, tz, stats.chainJumpRange
            damage = damage * SurvivorConfig.chainFalloff
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
        for u, expiry in pairs(blade.hitTimes) do if expiry <= now or not Enemy(u) then blade.hitTimes[u] = nil end end
        local candidates = Candidates(oldX, oldY, blade.x, blade.y, blade.hitRadius, "orbitblade")
        for _, u in ipairs(candidates) do
            if blade.cleaned or not RunSession.IsRunning() then break end
            if GroundEnemy(u) and not blade.hitTimes[u]
                and SegmentDistanceSquared(GetUnitX(u), GetUnitY(u), oldX, oldY, blade.x, blade.y) <= blade.hitRadius ^ 2 then
                blade.hitTimes[u] = now + blade.hitInterval
                Hit(u, blade.damage, "orbitblade")
            end
        end
        ReleaseCandidates(candidates)
        return dt
    end
    function SurvivorCombat.CastBlades()
        if not RunSession.IsRunning() or not Alive(hero) or not stats.bladeEnabled then return end
        -- One activation is one evenly spaced ring, including multicast blades.
        -- Older rings keep their own lifetime, damage and per-enemy hit history.
        local count, phase = stats.bladeCount + stats.multiCount, RunSession.GetElapsed()
        local centerX, centerY = GetUnitX(hero), GetUnitY(hero)
        for i = 1, count do
            local angle = 2 * math.pi * (i - 1) / count + phase
            local offset = (i - (count + 1) / 2) / math.max(1, count - 1) * 0.8
            if stats.bladeEvolution == "evolution8" then angle = GetUnitFacing(hero) * bj_DEGTORAD + offset end
            local x, y = centerX + math.cos(angle) * stats.bladeRadius, centerY + math.sin(angle) * stats.bladeRadius
            local damage = stats.bladeDamage * (i > stats.bladeCount and stats.multiDamage or 1)
            CreateObject({identifier = "hsBlade", x = x, y = y, z = Height(x, y) + 65,
                angle = angle, orbit = stats.bladeRadius, period = stats.bladePeriod, damage = damage,
                age = 0, offset = offset, evolution = stats.bladeEvolution,
                life = stats.bladeDuration, hitRadius = stats.bladeHitRadius, hitInterval = stats.bladeHitInterval,
                hitTimes = {}, isAnonymous = true, selfInteractions = MoveBlade}, SurvivorConfig.bladeModel, stats.bladeScale)
        end
    end
    function SurvivorCombat.UpdateWeapons(dt)
        if not RunSession.IsRunning() or not Alive(hero) then return end
        local started, checked = SurvivorMetrics.Begin(), 0
        SurvivorMetrics.Count("status.calls")
        local now = RunSession.GetElapsed()
        if ward > 0 and now >= wardUntil then ward, wardUntil = 0, 0 end
        if escapeUntil > 0 and now >= escapeUntil then ClearEscape() end
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
                    PauseUnit(u, record.special ~= nil or record.freezeWasPaused == true)
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
                if not record.freezeUntil and not record.slows then
                    statusUnits[u] = nil
                end
            end
        end
        if not stats.sets.storm then stormHits = 0 end
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
        CreateObject({identifier = "hsMonsoonEffect", x = x, y = y, z = z, life = 0.9,
            isAnonymous = true, selfInteractions = ZoneLifetime}, SurvivorConfig.monsoonModel, radius / 150)
        -- A column of lightning hits ground and flying enemies at the locked point.
        local started, checked = SurvivorMetrics.Begin(), 0
        SurvivorMetrics.Count("monsoon.area.calls")
        local candidates = AreaCandidates(x, y, radius, "monsoon")
        for _, u in ipairs(candidates) do
            if not RunSession.IsRunning() or not Alive(hero) then break end
            if Enemy(u) then
                checked = checked + 1
                local dx, dy = GetUnitX(u) - x, GetUnitY(u) - y
                if dx * dx + dy * dy <= radius * radius then Hit(u, damage, "monsoon") end
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
        local primary = ALICE_GetClosestObject(x, y, "hsEnemy", stats.monsoonRange, Enemy)
        if not primary then return end
        local selected = {}
        for i = 1, stats.monsoonCount do
            local target = ALICE_GetClosestObject(x, y, "hsEnemy", stats.monsoonRange,
                function(u) return Enemy(u) and not selected[u] end) or primary
            selected[target] = true
            local tx, ty, tz = ImpactPoint(target)
            tx, ty = SpreadPoint(tx, ty, stats.monsoonRadius * 0.7, shot)
            local strike = {identifier = "hsMonsoon", x = tx, y = ty, z = tz,
                life = stats.monsoonDelay + (i - 1) * stats.monsoonSpacing, radius = stats.monsoonRadius, damage = stats.monsoonDamage,
                isAnonymous = true, isStationary = true, selfInteractions = StrikeMonsoon, destroy = DestroyObject}
            objects[strike] = true
            ALICE_Create(strike)
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
        local candidates = Candidates(area.x, area.y, area.x, area.y, area.radius, "frontslash")
        for _, u in ipairs(candidates) do
            if area.cleaned or not RunSession.IsRunning() or not Alive(hero) then break end
            if GroundEnemy(u) and not area.hitTimes[u] then
                local dx, dy = GetUnitX(u) - area.x, GetUnitY(u) - area.y
                local distance = math.sqrt(dx * dx + dy * dy)
                if distance <= area.radius and (distance < 1
                    or (dx * math.cos(area.facing) + dy * math.sin(area.facing)) / distance >= cosine) then
                    area.hitTimes[u] = true
                    local tx, ty, tz = ImpactPoint(u)
                    CreateObject({identifier = "hsSlashHit", x = tx, y = ty, z = tz, life = 0.4,
                        isAnonymous = true, selfInteractions = ZoneLifetime}, SurvivorConfig.slashModel, area.scale)
                    Hit(u, area.damage, "frontslash")
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
        local sweepRadius, startAngle = radius * 0.7, facing - arc / 2
        CreateObject({identifier = "hsSlash", originX = x, originY = y,
            x = x + math.cos(startAngle) * sweepRadius, y = y + math.sin(startAngle) * sweepRadius,
            z = Height(x, y) + 65, facing = facing, arc = arc, radius = sweepRadius,
            life = math.max(stats.slashSweepTime, stats.slashDuration), sweepTime = stats.slashSweepTime, sweepElapsed = 0,
            isAnonymous = true, selfInteractions = SweepSlash}, SurvivorConfig.bladeModel, 1.3 * stats.slashScale)
        -- Snapshot origin/facing/damage for the whole cast. A lingering cone hits each enemy once.
        local area = {identifier = "hsSlashArea", x = x, y = y, z = Height(x, y),
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
    end
    Freeze = function(target, duration)
        if not Enemy(target) then return false end
        local record, now = units[target], RunSession.GetElapsed()
        if now < (record.freezeImmuneUntil or 0) then return false end
        duration = record.boss and math.min(0.35, duration) or math.min(1, duration)
        record.freezeImmuneUntil = now + (record.boss and 8 or 5)
        if not record.freezeUntil then
            if record.special then record.freezeWasPaused = record.special.sourceWasPaused
            else record.freezeWasPaused = IsUnitPaused(target) end
        end
        record.freezeUntil = now + duration
        statusUnits[target] = true
        PauseUnit(target, true)
        return true
    end
    local function ProcVisual(x, y, z, model, scale)
        CreateObject({identifier = "hsSetEffect", x = x, y = y, z = z, life = 0.7,
            isAnonymous = true, selfInteractions = ZoneLifetime}, model, scale)
    end
    ExpireEmber = function(zone)
        if not stats or not stats.sets.ember or not Alive(hero) then return end
        ProcVisual(zone.x, zone.y, zone.z, SurvivorConfig.bossImpactModel, zone.radius / 240)
        local candidates = AreaCandidates(zone.x, zone.y, zone.radius, "ember")
        for _, u in ipairs(candidates) do
            if GroundEnemy(u) then
                local dx, dy = GetUnitX(u) - zone.x, GetUnitY(u) - zone.y
                if dx * dx + dy * dy <= zone.radius ^ 2 then Hit(u, zone.damage * 2, "flamefield", true) end
            end
        end
        ReleaseCandidates(candidates)
    end
    SetHit = function(target, amount, weapon)
        if not stats or not RunSession.IsRunning() or not Alive(hero) then return end
        local now = RunSession.GetElapsed()
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
            ProcVisual(x, y, Height(x, y) + 65, SurvivorConfig.bladeModel, 1.5)
            local candidates = AreaCandidates(x, y, 220, "bladeSet")
            for _, u in ipairs(candidates) do
                if GroundEnemy(u) then
                    local dx, dy = GetUnitX(u) - x, GetUnitY(u) - y
                    if dx * dx + dy * dy <= 220 ^ 2 then Hit(u, amount * 1.5, weapon, true) end
                end
            end
            ReleaseCandidates(candidates)
        end
    end
    local function AreaHit(object, amount)
        local weapon, checked = object.weapon, 0
        local started = SurvivorMetrics.Begin()
        SurvivorMetrics.Count(weapon .. ".area.calls")
        local candidates = AreaCandidates(object.x, object.y, object.radius, weapon)
        for _, u in ipairs(candidates) do
            if not RunSession.IsRunning() or not Alive(hero) then break end
            if Enemy(u) then
                checked = checked + 1
                local x, y, z = ImpactPoint(u)
                local dx, dy = x - object.x, y - object.y
                local dz = object.spherical and z - object.z or 0
                if dx * dx + dy * dy + dz * dz <= object.radius ^ 2 then
                    Hit(u, amount, object.weapon)
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
    local function NewZone(id, x, y, w, damage)
        local model = id == "blizzard" and [[Abilities\Spells\Human\Blizzard\BlizzardTarget.mdl]]
            or id == "meteor" and SurvivorConfig.meteorImpactModel or SurvivorConfig.zoneModel
        CreateObject({identifier = "hsExtraZone", weapon = id, x = x, y = y, z = Height(x, y),
            radius = w.radius, damage = damage, life = w.duration, pulse = w.pulse, pulseClock = w.pulse,
            slow = w.slow, slowDuration = math.max(0.5, w.duration / 3) + (w.slowDurationBonus or 0), isStationary = true, isAnonymous = true,
            selfInteractions = ExtraZone}, model, math.min(2.5, w.radius / 230))
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
            ALICE_Kill(meteor)
            NewZone("meteor", x, y, w, w.damage * 0.2)
            AreaHit({x = x, y = y, z = meteor.groundZ, radius = w.radius, slow = 0, weapon = "meteor"}, w.damage)
        end
        return dt
    end
    local function MoveOrb(orb)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or orb.cleaned then return dt end
        if not Alive(hero) or orb.life <= 0 then ALICE_Kill(orb); return dt end
        local step = math.min(orb.speed * math.min(dt, orb.life), orb.remaining)
        orb.x, orb.y, orb.z = orb.x + orb.dx * step, orb.y + orb.dy * step, orb.z + orb.dz * step
        orb.life, orb.remaining, orb.pulseClock = orb.life - dt, orb.remaining - step, orb.pulseClock + dt
        BlzSetSpecialEffectPosition(orb.visual, orb.x, orb.y, orb.z)
        if orb.pulseClock >= orb.pulse then orb.pulseClock = orb.pulseClock - orb.pulse; AreaHit(orb, orb.damage) end
        return dt
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
        local candidates = Candidates(oldX, oldY, blade.x, blade.y, blade.radius, "returnblade")
        for _, u in ipairs(candidates) do
            if blade.cleaned or not RunSession.IsRunning() then break end
            if GroundEnemy(u) and blade.hitTimes[u] ~= leg
                and SegmentDistanceSquared(GetUnitX(u), GetUnitY(u), oldX, oldY, blade.x, blade.y) <= blade.radius ^ 2 then
                blade.hitTimes[u] = leg
                Hit(u, blade.damage, "returnblade")
            end
        end
        ReleaseCandidates(candidates)
        if blade.cleaned or not RunSession.IsRunning() then return dt end
        if blade.returning then
            local hx, hy = GetUnitX(hero) - blade.x, GetUnitY(hero) - blade.y
            if hx * hx + hy * hy <= 25 ^ 2 then
                -- Longevity buys additional travel/hits instead of unused maximum lifetime.
                local target = ALICE_GetClosestObject(blade.x, blade.y, "hsEnemy", blade.range, GroundEnemy)
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
        if id == "frostnova" then
            -- Reservoir sampling gives every living enemy in range the same chance.
            local target, count = nil, 0
            local candidates = AreaCandidates(x, y, w.range, "frostnovaSelection")
            for _, u in ipairs(candidates) do
                if Enemy(u) then
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
            CreateObject({identifier = "hsNova", x = x, y = y, z = Height(x, y) + GetUnitFlyHeight(target), life = 0.6,
                isAnonymous = true, selfInteractions = ZoneLifetime}, [[Abilities\Spells\Undead\FrostNova\FrostNovaTarget.mdl]], w.radius / 150)
            AreaHit({x = x, y = y, z = z, radius = w.radius, slow = w.slow,
                slowDuration = w.duration + (w.slowDurationBonus or 0), weapon = id}, w.damage)
            return
        end
        local target = ALICE_GetClosestObject(x, y, "hsEnemy", w.range, id == "returnblade" and GroundEnemy or Enemy)
        if not target then return end
        local tx, ty, tz = ImpactPoint(target)
        if id == "blizzard" or id == "meteor" then tx, ty = SpreadPoint(tx, ty, w.radius * 0.8, shot) end
        if id == "blizzard" then NewZone(id, tx, ty, w, w.damage); return end
        if id == "meteor" then
            CreateObject({identifier = "hsMeteor", x = tx, y = ty, z = tz + 750, groundZ = tz,
                profile = w, life = w.delay, delay = w.delay, isAnonymous = true, selfInteractions = FallMeteor}, SurvivorConfig.meteorModel, 1.8 * w.size)
            return
        end
        local dx, dy, dz = tx - x, ty - y, id == "returnblade" and 0 or tz - z
        local distance = math.sqrt(dx * dx + dy * dy + dz * dz)
        if distance < 1 then dx, dy, dz, distance = math.cos(GetUnitFacing(hero) * bj_DEGTORAD), math.sin(GetUnitFacing(hero) * bj_DEGTORAD), 0, 1 end
        local object = {identifier = id == "thunderorb" and "hsOrb" or "hsReturnBlade", weapon = id,
            x = x, y = y, z = z, dx = dx / distance, dy = dy / distance, dz = dz / distance,
            life = w.duration, remaining = w.range, range = w.range, leg = 1, speed = w.speed, radius = w.radius, damage = w.damage,
            pulse = w.pulse, pulseClock = 0, spherical = true, slow = 0, hitTimes = {},
            isAnonymous = true, selfInteractions = id == "thunderorb" and MoveOrb or MoveReturnBlade}
        CreateObject(object, id == "thunderorb" and [[Abilities\Spells\Orc\LightningShield\LightningShieldTarget.mdl]] or SurvivorConfig.bladeModel, w.size)
    end
    local function MoveFrost(shard)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or shard.cleaned then return dt end
        if not Alive(hero) or shard.life <= 0 or shard.remaining <= 0 then ALICE_Kill(shard); return dt end
        local step = math.min(shard.speed * math.min(dt, shard.life), shard.remaining)
        local dx, dy, dz = shard.dx * step, shard.dy * step, shard.dz * step
        if not SurvivorStage.LineClear(shard.x, shard.y, shard.x + dx, shard.y + dy) then ALICE_Kill(shard); return dt end
        local length, hits = dx * dx + dy * dy + dz * dz, {}
        local candidates = Candidates(shard.x, shard.y, shard.x + dx, shard.y + dy, shard.hitRadius, "frostshard")
        for _, u in ipairs(candidates) do
            if Enemy(u) and not shard.hitTimes[u] then
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
            if Enemy(u) then
                shard.hitTimes[u] = true
                Hit(u, shard.damage, "frostshard", false, shard.secondary)
                if shard.cleaned or not RunSession.IsRunning() then return dt end
                Slow(u, shard.slow, shard.slowDuration, "frostshard")
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
            function(u) return Enemy(u) and SurvivorStage.LineClear(x, y, GetUnitX(u), GetUnitY(u)) end)
        if not target then return end
        local tx, ty, tz = ImpactPoint(target)
        local dx, dy, dz = tx - x, ty - y, tz - z
        local distance = math.sqrt(dx * dx + dy * dy + dz * dz)
        if distance < 1 then dx, dy, dz, distance = math.cos(GetUnitFacing(hero) * bj_DEGTORAD), math.sin(GetUnitFacing(hero) * bj_DEGTORAD), 0, 1 end
        local shard = {identifier = "hsFrostShard", x = x, y = y, z = z, yaw = 0,
            dx = dx / distance, dy = dy / distance, dz = dz / distance, speed = stats.frostSpeed,
            life = stats.frostLifetime, remaining = stats.frostRange, hitRadius = stats.frostHitRadius,
            damage = stats.frostDamage, pierces = stats.frostPierce, hitTimes = {},
            slow = stats.frostSlow, slowDuration = stats.frostSlowDuration, evolution = stats.frostEvolution,
            isAnonymous = true, selfInteractions = MoveFrost}
        CreateObject(shard, SurvivorConfig.frostModel, stats.frostScale)
        FaceMissile(shard, dx, dy, dz)
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
    local castMethods = {firebolt = "FireMissile", flamefield = "CreateZone", chainlightning = "CastChainLightning",
        orbitblade = "CastBlades", monsoon = "CastMonsoon", frontslash = "CastFrontSlash", frostshard = "FireFrostShard"}
    local enabledFields = {firebolt = "missileEnabled", flamefield = "zoneEnabled", chainlightning = "chainEnabled",
        orbitblade = "bladeEnabled", monsoon = "monsoonEnabled", frontslash = "slashEnabled", frostshard = "frostEnabled"}
    local snapshotFields = {
        firebolt = {"missileEnabled", "missileRange", "missileCount", "missileLifetime", "missileDamage", "missileSpeed", "missileHitRadius", "missileScale", "fireEvolution"},
        flamefield = {"zoneEnabled", "zoneRadius", "zoneDuration", "zoneDamage", "zonePulse"},
        chainlightning = {"chainEnabled", "chainDamage", "chainRange", "chainTargets", "chainJumpRange"},
        monsoon = {"monsoonEnabled", "monsoonRange", "monsoonCount", "monsoonRadius", "monsoonDelay", "monsoonSpacing", "monsoonDamage"},
        frontslash = {"slashEnabled", "slashAngle", "slashRange", "slashSweepTime", "slashDuration", "slashScale", "slashDamage"},
        frostshard = {"frostEnabled", "frostRange", "frostSpeed", "frostLifetime", "frostHitRadius", "frostDamage", "frostPierce", "frostSlow", "frostSlowDuration", "frostEvolution", "frostScale"},
    }
    local snapshotDamage = {firebolt = "missileDamage", flamefield = "zoneDamage", chainlightning = "chainDamage",
        monsoon = "monsoonDamage", frontslash = "slashDamage", frostshard = "frostDamage"}
    local function DispatchWeapon(id, shot)
        local method = castMethods[id]
        if method then SurvivorCombat[method](shot) else SurvivorCombat.CastExtra(id, shot) end
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
        local enabled = enabledFields[id]
        if enabled and not stats[enabled] or not enabled and (not stats.extraWeapons[id] or not stats.extraWeapons[id].enabled) then return end
        if id == "orbitblade" then
            SurvivorCombat.CastBlades() -- Spawn base and extra blades together; no delayed single-blade casts.
            return
        end
        DispatchWeapon(id)
        if not RunSession.IsRunning() or not stats or stats.multiCount == 0 then return end
        local snapshot = {}
        local fields = snapshotFields[id]
        if fields then
            for _, key in ipairs(fields) do snapshot[key] = stats[key] end
            local damage = snapshotDamage[id]
            snapshot[damage] = snapshot[damage] * stats.multiDamage
        else
            local copy = {}
            for key, value in pairs(stats.extraWeapons[id]) do copy[key] = value end
            copy.damage = copy.damage * stats.multiDamage
            snapshot.extraWeapons = {[id] = copy}
        end
        -- Add individual projectiles/blades/strikes, not copies of an entire existing volley.
        if id == "firebolt" then snapshot.missileCount = 1
        elseif id == "monsoon" then snapshot.monsoonCount = 1 end
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
    -- Spread enemies over allied slots that borrow Neutral Hostile's color and name.
    local function NextEnemyOwner()
        if not enemyOwners then
            local template, heroOwner = Player(PLAYER_NEUTRAL_AGGRESSIVE), Player(SurvivorConfig.playerId)
            enemyOwners = {}
            for _, id in ipairs(SurvivorConfig.enemyPlayerIds) do enemyOwners[#enemyOwners + 1] = Player(id) end
            for _, owner in ipairs(enemyOwners) do
                SetPlayerColor(owner, GetPlayerColor(template))
                SetPlayerName(owner, GetPlayerName(template))
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
        blast.life = blast.life - dt
        if blast.life > 0 then return dt end
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
        for i = 1, 20 do
            local angle = 2 * math.pi * i / 20
            local mx, my = x + math.cos(angle) * blast.radius, y + math.sin(angle) * blast.radius
            local marker = AddSpecialEffect(SurvivorConfig.warningModel, mx, my)
            blast.markers[#blast.markers + 1] = marker
            BlzSetSpecialEffectZ(marker, Height(mx, my) + 95)
            BlzSetSpecialEffectScale(marker, 0.5)
            local color = SurvivorStage.Get(stage).warning
            BlzSetSpecialEffectColor(marker, color[1], color[2], color[3])
        end
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
                PauseUnit(self.source, frozen or self.sourceWasPaused == true
                    or (record.freezeUntil ~= nil and record.freezeUntil > RunSession.GetElapsed()))
            end
        end
    end
    local function SpecialMarker(self, x, y, green)
        local effect = AddSpecialEffect(SurvivorConfig.warningModel, x, y)
        self.markers[#self.markers + 1] = effect
        BlzSetSpecialEffectScale(effect, green and 0.55 or 0.38)
        BlzSetSpecialEffectZ(effect, Height(x, y) + 55)
        local color = SurvivorStage.Get(stage).warning
        BlzSetSpecialEffectColor(effect, green and 70 or color[1], green and 255 or color[2], green and 90 or color[3])
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
            if radius > 900 then ALICE_Kill(self); return dt end
            for i, angle in ipairs(self.angles) do
                local x, y = self.ax + math.cos(angle) * radius, self.ay + math.sin(angle) * radius
                BlzSetSpecialEffectPosition(self.markers[i], x, y, Height(x, y) + 55)
            end
            local dx, dy = hx - self.ax, hy - self.ay
            local angle = Atan2(dy, dx) - self.gap
            local outsideGap = math.abs(Atan2(math.sin(angle), math.cos(angle))) > self.gapWidth / 2
            if not self.hit and outsideGap and math.abs(math.sqrt(dx * dx + dy * dy) - radius) <= 65 then
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
            for i = 0, 8 do
                local px, py = x + (self.bx - x) * i / 8, y + (self.by - y) * i / 8
                for side = -1, 1, 2 do SpecialMarker(self, px - math.sin(angle) * self.width * side, py + math.cos(angle) * self.width * side) end
            end
        elseif kind == "wave" then
            self.gap, self.gapWidth, self.angles = angle + math.pi / 2, math.pi / 2, {}
            if informed and stage == 3 then self.gapWidth = math.pi end
            for i = 0, 17 do
                local a = self.gap + self.gapWidth / 2 + (2 * math.pi - self.gapWidth) * i / 17
                self.angles[#self.angles + 1] = a
                SpecialMarker(self, x + math.cos(a) * 120, y + math.sin(a) * 120, i == 0 or i == 17)
            end
        else
            self.lanes = {}
            for offset = -240, 240, 240 do
                if not (informed and stage == 5 and offset == 0) then
                    local cx, cy = hx - math.sin(angle) * offset, hy + math.cos(angle) * offset
                    local lane = {ax = cx - math.cos(angle) * 450, ay = cy - math.sin(angle) * 450,
                        bx = cx + math.cos(angle) * 450, by = cy + math.sin(angle) * 450}
                    self.lanes[#self.lanes + 1] = lane
                    for i = 0, 5 do
                        local px, py = lane.ax + (lane.bx - lane.ax) * i / 5, lane.ay + (lane.by - lane.ay) * i / 5
                        for side = -1, 1, 2 do SpecialMarker(self, px - math.sin(angle) * self.width * side, py + math.cos(angle) * self.width * side) end
                    end
                end
            end
        end
        warningUntil = math.max(warningUntil, RunSession.GetElapsed() + self.delay + 3)
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
        local x, y, found
        for _ = 1, 16 do
            local angle = GetRandomReal(0, 2 * math.pi)
            x = GetUnitX(hero) + math.cos(angle) * SurvivorConfig.spawnDistance
            y = GetUnitY(hero) + math.sin(angle) * SurvivorConfig.spawnDistance
            if x > bounds.minX and x < bounds.maxX and y > bounds.minY and y < bounds.maxY
                and not IsTerrainPathable(x, y, PATHING_TYPE_WALKABILITY) then found = true; break end
        end
        if not found then return false end
        local theme = SurvivorStage.Get(stage)
        local id = theme.ids[isBoss and "boss" or kind == "courier" and "ranged" or kind]
        local enemy = CreateUnit(NextEnemyOwner(), id, x, y, 0)
        assert(enemy ~= nil and GetUnitTypeId(enemy) == id, "Enemy object ID is missing")
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
        SetUnitVertexColor(enemy, color[1], color[2], color[3], 255)
        SetUnitMoveSpeed(enemy, math.min(330, (isBoss and c.bossMoveSpeed or profile and profile.speed or c.enemyMoveSpeed * encounter.meleeSpeed)
            * scaling.moveSpeed * difficulty.moveSpeed))
        units[enemy].baseSpeed = GetUnitMoveSpeed(enemy)
        ALICE_AddIdentifier(enemy, "hsEnemy", "unit")
        orderSerial = orderSerial % SurvivorConfig.enemyOrderGroups + 1
        units[enemy].orderGroup = orderSerial
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
        SetUnitVertexColor(unit, 235, 210, 100, 255)
        BlzUnitDisableAbility(unit, FourCC("Aatk"), true, true)
        MoveEnemy(unit, record, points[2].x, points[2].y, 0, true)
        return unit
    end
    function SurvivorCombat.ReleaseCourier(unit)
        local record = units[unit]
        if not record then return end
        statusUnits[unit] = nil
        frostStackUnits[unit] = nil
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
    function SurvivorCombat.UpdateEnemies(elapsed)
        if not Alive(hero) then return end
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
                if record.alive and not record.special and not (record.freezeUntil and record.freezeUntil > elapsed) then
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
        SurvivorAugments.ApplyHeroRegeneration(hero, stats)
        if inventoryVitals then SurvivorCombat.MaintainInventoryPause() end
        if inventoryFrozen then
            BlzUnitDisableAbility(hero, FourCC("Amov"), false, false)
        end
        for u, record in pairs(units) do
            if GetUnitTypeId(u) ~= 0 then
                if enable and not frozen then
                    record.wasPaused = IsUnitPaused(u)
                    if record.freezeUntil then record.wasPaused = record.freezeWasPaused end
                end
                PauseUnit(u, (enable and not (interactiveHero and u == hero)) or record.wasPaused == true
                    or record.special ~= nil
                    or (record.freezeUntil ~= nil and record.freezeUntil > RunSession.GetElapsed()))
                SetUnitTimeScale(u, enable and 0 or 1)
                if record.cosmetic then BlzSetSpecialEffectTimeScale(record.cosmetic, enable and 0 or 1) end
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
        for object in pairs(objects) do
            if object.visual ~= nil then BlzSetSpecialEffectTimeScale(object.visual, enable and 0 or 1) end
            if object.markers then
                for _, effect in ipairs(object.markers) do BlzSetSpecialEffectTimeScale(effect, enable and 0 or 1) end
            end
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
        statusUnits[u] = nil
        frostStackUnits[u] = nil
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
        ward, wardUntil = 0, 0
        local pending, head = {}, 1
        for u, record in pairs(units) do if record.enemy then pending[#pending + 1] = u end end
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
                        RemoveEnemy(unit)
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
        ward, wardUntil = 0, 0
        while next(objects) ~= nil do local object = next(objects); objects[object] = nil; ALICE_Kill(object) end
        for u, record in pairs(units) do
            if record.enemy then
                RemoveEnemy(u)
            end
        end
        enemyCount, boss = 0, nil
    end
    function SurvivorCombat.BeginStage(index, elapsed)
        assert(Alive(hero) and index >= 1 and index <= SurvivorConfig.stages, "Invalid stage transition")
        SurvivorCombat.ClearBattlefield()
        stage, stageStarted, enemyCount, boss, bossDefeated, warningUntil = index, elapsed, 0, nil, false, 0
        stormHits, stormReady, bladeReady = 0, 0, 0
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
        onKill, onDeath = nil, nil
        if stats then stats.nativeRegenerationPaused = true end
        if hero ~= nil and GetUnitTypeId(hero) ~= 0 then
            CleanupCall(errors, "hero regeneration", function() SurvivorAugments.ApplyHeroRegeneration(hero, stats) end)
        end
        CleanupCall(errors, "escape", ClearEscape)
        local oldDamage, oldDeath = damageTrigger, deathTrigger
        damageTrigger, deathTrigger = nil, nil
        if oldDamage then CleanupCall(errors, "damage trigger", function() DestroyTrigger(oldDamage) end) end
        if oldDeath then CleanupCall(errors, "death trigger", function() DestroyTrigger(oldDeath) end) end
        local pendingObjects, pendingUnits = objects, units
        objects, units, statusUnits, frostStackUnits = {}, {}, {}, {}
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
        enemyCount, frozen, inventoryFrozen, inventoryVitals = 0, false, false, nil
        stage, stageStarted, damageTotals, warningUntil, boss, bossDefeated = 1, 0, {}, 0, nil, false
        difficulty = SurvivorConfig.difficulties.normal
        stormHits, stormReady, bladeReady = 0, 0, 0
        escapeReady, escapeUses, eliteSerial = true, 0, 0
        ward, wardUntil, damageContext, hitSecondary, shatterReady = 0, 0, nil, false, 0
        recentDamage, stageEscapeUses = {}, {}
        if #errors > 0 then error(table.concat(errors, "\n"), 0) end
    end
    function SurvivorCombat.Init(unit, buildStats, arena, killCallback, deathCallback, difficultyId)
        assert(hero == nil, "Combat must be cleaned before reinitializing")
        difficulty = assert(SurvivorConfig.difficulties[difficultyId or "normal"], "Invalid combat difficulty")
        hero, stats, bounds, onKill, onDeath = unit, buildStats, arena, killCallback, deathCallback
        units[hero] = {enemy = false, alive = true}
        stats.nativeRegenerationPaused = false
        SurvivorAugments.ApplyHeroRegeneration(hero, stats)
        heightLocation = Location(0, 0)
        queryGroup = CreateGroup()
        damageTrigger = CreateTrigger()
        TriggerRegisterAnyUnitEventBJ(damageTrigger, EVENT_PLAYER_UNIT_DAMAGED)
        TriggerAddAction(damageTrigger, function()
            local target, damage = GetTriggerUnit(), GetEventDamage()
            if damage <= 0 then return end
            local record = units[target]
            if target == hero then
                -- Post-mitigation damage event, before HP subtraction; catches native melee too.
                if not RunSession.IsRunning() or RunSession.GetElapsed() < escapeUntil then BlzSetEventDamage(0); return end
                if SurvivorExpedition.RiskActive() and Enemy(GetEventDamageSource()) then damage = damage * 1.25 end
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
                    SurvivorUI.Say("안야", escapeLines[stage] or escapeLines[1])
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
            statusUnits[dead] = nil
            frostStackUnits[dead] = nil
            if record.cosmetic then DestroyEffect(record.cosmetic); record.cosmetic = nil end
            if record.enemy then
                enemyCount = enemyCount - 1
                record.removeAt = RunSession.GetElapsed() + 2.0
                ALICE_RemoveIdentifier(dead, "hsEnemy")
                if record.boss then bossDefeated = true end
                if RunSession.IsRunning() then Shatter(dead, record) end
                -- Finish is deferred to Step; never tear down combat during a Hit loop.
                if RunSession.IsRunning() and onKill then onKill(dead, record.elite, record.boss) end
            elseif onDeath then onDeath() end
        end)
    end
end
