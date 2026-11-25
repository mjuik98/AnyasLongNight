-- Enemy status effects: slow, freeze, Putress poison (per-weapon shares), curse and
-- reactions, their per-tick upkeep and the status tint. SurvivorCombat owns the unit
-- records and the hit pipeline: it binds the combat primitives once and attaches each
-- run's record table and derived stats.
SurvivorCombatStatus = {}
do
    local units, stats, damageTotals = {}, nil, {}
    -- Units whose status needs a tick update; poisoned units; set-frost stack holders.
    local statusUnits, frostStackUnits, poisonUnits = {}, {}, {}
    local Enemy, Hit, ImpactPoint, ProcVisual, Residue, UnitTimeStopped
    function SurvivorCombatStatus.Bind(combat)
        Enemy, Hit, ImpactPoint = combat.Enemy, combat.Hit, combat.ImpactPoint
        ProcVisual, Residue, UnitTimeStopped = combat.ProcVisual, combat.Residue, combat.UnitTimeStopped
    end
    -- A run's unit records, derived stats and damage ledger; status bookkeeping restarts.
    function SurvivorCombatStatus.Attach(run)
        units, stats, damageTotals = run.units, run.stats, run.damageTotals
        statusUnits, frostStackUnits, poisonUnits = {}, {}, {}
    end
    -- A removed or dead unit leaves every status list.
    function SurvivorCombatStatus.Forget(u)
        statusUnits[u] = nil
        frostStackUnits[u] = nil
        poisonUnits[u] = nil
    end
    -- The frost set's four-hit counter on a slowed enemy.
    function SurvivorCombatStatus.TrackFrostStacks(u, tracked)
        frostStackUnits[u] = tracked or nil
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
    SurvivorCombatStatus.Color = EnemyColor
    -- Putress curse stacks amplify every hero hit, including poison ticks and reactions.
    local function CurseStacks(record)
        return RunSession.GetElapsed() < (record.curseUntil or 0) and record.curse or 0
    end
    SurvivorCombatStatus.CurseStacks = CurseStacks
    function SurvivorCombatStatus.Slow(target, amount, duration, weapon)
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
    function SurvivorCombatStatus.Freeze(target, duration)
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
    -- record.poison is the total; record.poisonBy[weapon] holds each weapon's share.
    -- Returns the weapons holding stacks in id order, so ticks are deterministic.
    local function PoisonShares(record)
        if record.poisonBy == nil then
            record.poisonBy = {}
            -- A record poisoned before shares existed belongs to its last applier.
            if (record.poison or 0) > 0 and record.poisonWeapon then record.poisonBy[record.poisonWeapon] = record.poison end
        end
        local list = {}
        for weapon, stacks in pairs(record.poisonBy) do
            if stacks > 0 then list[#list + 1] = weapon end
        end
        table.sort(list)
        return list
    end
    -- A reaction consumes every weapon's share in proportion; the remainder goes in id order.
    local function ConsumePoison(record, consumed)
        local list, total, left = PoisonShares(record), record.poison, consumed
        local shares = record.poisonBy
        for _, weapon in ipairs(list) do
            local take = math.floor(shares[weapon] * consumed / total)
            shares[weapon], left = shares[weapon] - take, left - take
        end
        for _, weapon in ipairs(list) do
            if left <= 0 then break end
            if shares[weapon] > 0 then shares[weapon], left = shares[weapon] - 1, left - 1 end
        end
        record.poison = total - consumed
    end
    -- Putress statuses. Reaction consumes poison before this hit adds new stacks.
    -- scale < 1 (multicast) applies a reduced, never zero, number of stacks.
    function SurvivorCombatStatus.Apply(target, weapon, status, scale)
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
            ConsumePoison(record, consumed)
            record.reactionReady = now + config.reactionCooldown
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
            if now >= (record.poisonUntil or 0) then record.poison, record.poisonNext, record.poisonBy = 0, now + config.poisonTick, nil end
            PoisonShares(record)
            local total = math.min(config.poisonMax + (stats.sets.apothecary and 4 or 0), record.poison + poison)
            -- Stacks above the cap are dropped; existing stacks keep their weapon.
            record.poisonBy[weapon] = (record.poisonBy[weapon] or 0) + total - record.poison
            -- poisonWeapon names only the last applier (the apothecary spread's credit).
            record.poison, record.poisonUntil, record.poisonWeapon = total, now + config.poisonDuration * life, weapon
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
    -- Per gameplay tick: poison damage, expired slows/freezes and the status tint.
    -- Returns the number of status units checked (for metrics).
    function SurvivorCombatStatus.Update(now, dt)
        local checked = 0
        -- Poison ticks: snapshot due units first, because a tick may kill and clean records.
        if next(poisonUnits) then
            local config, due = SurvivorConfig.status, {}
            for u in pairs(poisonUnits) do
                local record = units[u]
                if not record or not record.alive or not Enemy(u) or now >= (record.poisonUntil or 0) or record.poison <= 0 then
                    poisonUnits[u] = nil
                    if record then record.poison, record.poisonBy = 0, nil end
                elseif now >= record.poisonNext then due[#due + 1] = u end
            end
            for _, u in ipairs(due) do
                local record = units[u]
                if Enemy(u) and RunSession.IsRunning() then
                    record.poisonNext = record.poisonNext + config.poisonTick
                    -- Each weapon's stacks tick with that weapon's power and credit.
                    for _, weapon in ipairs(PoisonShares(record)) do
                        if not Enemy(u) or not RunSession.IsRunning() then break end
                        local status = stats.status and stats.status[weapon]
                        local power = status and status.tickPower or stats.poisonDamage / config.poisonDamage
                        Hit(u, record.poisonBy[weapon] * config.poisonDamage * power * config.poisonTick, weapon, true)
                    end
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
        return checked
    end
end
