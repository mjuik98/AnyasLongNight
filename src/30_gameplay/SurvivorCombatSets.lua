-- Equipment set and attack-tag effects layered on weapon hits: damage modifiers
-- (pursuer, mire, tracker, commander), on-hit procs (bulwark, destroyer, storm, frost,
-- blade), chain endings (conductor), falling extras (bombardier), the ember burst and
-- Putress status-death procs. Set extras never re-trigger other sets or statuses.
-- SurvivorCombat binds the hit pipeline once and attaches each run's hero and stats.
SurvivorCombatSets = {}
do
    local hero, stats, units = nil, nil, {}
    local tagState = {summon = {}, fall = {}, relay = {}, burstHits = 0, burstReady = 0, meleeUntil = 0}
    local stormHits, stormReady, bladeReady = 0, 0, 0
    local soulReady, inStatusProc = 0, false
    local Alive = SurvivorConfig.UnitLive
    local Height = SurvivorConfig.TerrainZ
    local Status = SurvivorCombatStatus
    local Enemy, GroundTarget, Hit, AreaHit, Candidates, AreaCandidates, ReleaseCandidates
    local ImpactPoint, ProcVisual, FallPayload, TagSecondary
    function SurvivorCombatSets.Bind(combat)
        Enemy, GroundTarget, Hit, AreaHit = combat.Enemy, combat.GroundTarget, combat.Hit, combat.AreaHit
        Candidates, AreaCandidates, ReleaseCandidates = combat.Candidates, combat.AreaCandidates, combat.ReleaseCandidates
        ImpactPoint, ProcVisual, FallPayload, TagSecondary = combat.ImpactPoint, combat.ProcVisual, combat.FallPayload, combat.TagSecondary
    end
    -- Per-stage counters and cooldowns restart with each stage.
    function SurvivorCombatSets.BeginStage()
        stormHits, stormReady, bladeReady = 0, 0, 0
        tagState = {summon = {}, fall = {}, relay = {}, burstHits = 0, burstReady = 0, meleeUntil = 0}
    end
    -- A run's hero, unit records and stats. Run time restarts at zero, so run-clock
    -- cooldowns must not survive a run either.
    function SurvivorCombatSets.Attach(run)
        hero, stats, units = run.hero, run.stats, run.units
        SurvivorCombatSets.BeginStage()
        soulReady, inStatusProc = 0, false
    end
    local function HasTag(id, wanted)
        local weapon = SurvivorConfig.weapons[id]
        for _, tag in ipairs(weapon and weapon.tags or {}) do if tag == wanted then return true end end
        return false
    end
    SurvivorCombatSets.HasTag = HasTag
    -- Unequipped sets drop their counters.
    function SurvivorCombatSets.Update()
        if not stats.sets.storm then stormHits = 0 end
        if not stats.sets.commander then tagState.summon = {} end
        if not stats.sets.bombardier then tagState.fall = {} end
        if not stats.sets.destroyer then tagState.burstHits, tagState.burstReady = 0, 0 end
        if not stats.sets.bulwark then tagState.meleeUntil = 0 end
        if not stats.sets.conductor then tagState.relay = {} end
    end
    -- Bulwark: hero damage is reduced for three seconds after a melee hit.
    function SurvivorCombatSets.MeleeGuard(now)
        return stats.sets.bulwark and now < tagState.meleeUntil
    end
    local function PrimaryTagAttack(object, tag)
        return not object.setProc and not object.secondary and not object.tagExtra
            and (not object.statusScale or object.statusScale >= 1) and HasTag(object.weapon, tag)
    end
    SurvivorCombatSets.PrimaryTagAttack = PrimaryTagAttack
    function SurvivorCombatSets.HomingDamage(object, damage)
        if stats.sets.pursuer and PrimaryTagAttack(object, "유도") and (object.flightAge or 0) + 0.0000001 >= 0.5 then
            return damage * 1.4
        end
        return damage
    end
    function SurvivorCombatSets.ZoneRampDamage(zone, target, damage)
        if not stats.sets.mire then zone.rampHits = nil; return damage end
        if damage <= 0 or zone.status or not PrimaryTagAttack(zone, "장판") or not Enemy(target) then return damage end
        zone.rampHits = zone.rampHits or {}
        local count = math.min(6, (zone.rampHits[target] or 0) + 1)
        zone.rampHits[target] = count
        return damage * (1 + (count - 1) * 0.1)
    end
    function SurvivorCombatSets.PierceDamage(object, target, damage)
        if not stats.sets.tracker or object.secondary or object.tagExtra or object.statusScale and object.statusScale < 1
            or not HasTag(object.weapon, "관통") or not Enemy(target) then return damage end
        object.pierceTargets = object.pierceTargets or {}
        local count = object.pierceCount or 0
        if not object.pierceTargets[target] then
            count = count + 1
            object.pierceTargets[target], object.pierceCount = true, count
        end
        return damage * (1 + math.min(3, math.max(0, count - 1)) * 0.20)
    end
    -- Commander: every sixth real summon attack (not a multicast helper attack) hits double.
    function SurvivorCombatSets.SummonDamage(weapon, damage, scale)
        if not stats.sets.commander or scale ~= 1 then return damage end
        local counter = tagState.summon[weapon] or {hits = 0, ready = 0}
        tagState.summon[weapon] = counter
        counter.hits = math.min(6, counter.hits + 1)
        local now = RunSession.GetElapsed()
        if counter.hits >= 6 and now >= counter.ready then
            counter.hits, counter.ready = 0, now + 2
            return damage * 2
        end
        return damage
    end
    function SurvivorCombatSets.RelayEnd(weapon, target, damage)
        if not stats or not stats.sets.conductor or not HasTag(weapon, "연쇄") or not Enemy(target)
            or not RunSession.IsRunning() or not Alive(hero) then return end
        local now = RunSession.GetElapsed()
        if now < (tagState.relay[weapon] or 0) then return end
        tagState.relay[weapon] = now + 2
        local x, y, z = ImpactPoint(target)
        ProcVisual(x, y, z, SurvivorConfig.chainHitModel, 0.6, weapon)
        Hit(target, damage * 0.6, weapon, "tag")
    end
    function SurvivorCombatSets.ExpireEmber(zone)
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
    -- A primary weapon hit that dealt damage.
    function SurvivorCombatSets.SetHit(target, amount, weapon, baseAmount)
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
            if not slowed then record.frostHits = 0; Status.TrackFrostStacks(target, false); return end
            if now < (record.frostReady or 0) then return end
            record.frostHits = (record.frostHits or 0) + 1
            Status.TrackFrostStacks(target, true)
            if record.frostHits >= 4 then
                record.frostHits, record.frostReady = 0, now + 5
                Status.TrackFrostStacks(target, false)
                local x, y, z = ImpactPoint(target)
                ProcVisual(x, y, z, [[Abilities\Spells\Undead\FrostNova\FrostNovaTarget.mdl]], 0.8)
                if record.boss then Hit(target, amount, weapon, true)
                else Status.Freeze(target, 1) end
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
    -- Putress 4-piece set effects that trigger when a statused enemy dies.
    function SurvivorCombatSets.StatusDeath(dead, record)
        if not stats or inStatusProc or TagSecondary() or not Alive(hero) then return end
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
        -- Release the reentry guard even when a nested proc fails; a stuck guard
        -- would silently disable every later status-death set effect.
        local ok, message = pcall(function()
            if stats.sets.apothecary and (record.poison or 0) >= 8 and now < (record.poisonUntil or 0) then
                for _, target in ipairs(Nearby(300, 3)) do
                    Status.Apply(target.unit, record.poisonWeapon, {poison = math.floor(record.poison / 2)}, 1)
                end
            end
            if stats and stats.sets.gravewarden and Status.CurseStacks(record) >= config.curseMax and now >= soulReady then
                soulReady = now + 1
                ProcVisual(x, y, z, SurvivorConfig.soulBurstModel, 1.2, record.lastWeapon)
                for _, target in ipairs(Nearby(200)) do
                    Hit(target.unit, (record.lastHit or 0) * 1.5, record.lastWeapon, true)
                    if Enemy(target.unit) then Status.Apply(target.unit, record.lastWeapon, {curse = 1}, 1) end
                end
            end
        end)
        inStatusProc = false
        if not ok then error(message, 0) end
    end
    -- Bombardier: every fourth primary falling cast drops a small extra payload.
    function SurvivorCombatSets.RecordFallingCast(id, x, y, z, damage, radius, model, scale)
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
end
