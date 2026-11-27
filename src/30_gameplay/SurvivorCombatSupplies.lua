-- Breakable supply crates and the runes they drop (recovery, experience, purge,
-- time stop). Crates are run units with record.bonus; pickups are native items the
-- hero collects by walking close or picking them up. SurvivorCombat binds its
-- primitives once and attaches each run table.
SurvivorCombatSupplies = {}
do
    local run = nil
    local Alive = SurvivorUtil.UnitLive
    local Height = SurvivorUtil.TerrainZ
    local Enemy, ProcVisual, SetUnitPause
    function SurvivorCombatSupplies.Bind(combat)
        Enemy, ProcVisual, SetUnitPause = combat.Enemy, combat.ProcVisual, combat.SetUnitPause
    end
    -- The run table owned by SurvivorCombat (hero, units, bounds, bonusItems/bonusCount/nextBonusAt).
    function SurvivorCombatSupplies.Attach(state) run = state end
    function SurvivorCombatSupplies.PurgeNearby()
        if not RunSession.IsRunning() or not Alive(run.hero) then return 0 end
        local config, victims, count = SurvivorConfig.bonusProps, {}, 0
        local x, y = GetUnitX(run.hero), GetUnitY(run.hero)
        for u in pairs(run.units) do
            if Enemy(u) and (GetUnitX(u) - x)^2 + (GetUnitY(u) - y)^2 <= config.purgeRadius^2 then victims[#victims + 1] = u end
        end
        table.sort(victims, function(a, b) return GetHandleId(a) < GetHandleId(b) end)
        local previous = run.purging
        run.purging = true
        local ok, message = pcall(function()
            for _, u in ipairs(victims) do
                if not RunSession.IsRunning() or not Alive(run.hero) then break end
                if Enemy(u) then
                    if run.units[u].boss then SetWidgetLife(u, math.max(1, GetWidgetLife(u) - BlzGetUnitMaxHP(u) * config.purgeBossFraction))
                    else KillUnit(u); count = count + 1 end
                end
            end
        end)
        run.purging = previous
        if not ok then error(message, 0) end
        ProcVisual(x, y, Height(x, y), SurvivorConfig.emberBurstModel, config.purgeRadius / 300)
        return count
    end
    -- Draws one pickup kind by drop weight.
    function SurvivorCombatSupplies.Roll()
        local roll, total = GetRandomInt(1, 100), 0
        for _, drop in ipairs(SurvivorConfig.bonusProps.drops) do
            total = total + drop.weight
            if roll <= total then return drop.kind end
        end
        error("Bonus drop weights must total 100")
    end
    local function DiscardItem(item)
        run.bonusItems[item] = nil
        SurvivorUtil.RemoveItemIfPresent(item)
    end
    function SurvivorCombatSupplies.ClearItems()
        while next(run.bonusItems) ~= nil do DiscardItem(next(run.bonusItems)) end
    end
    function SurvivorCombatSupplies.Collect(item)
        local record = run.bonusItems[item]
        if not record or not RunSession.IsRunning() or not Alive(run.hero) then return end
        -- Detach before removing the native item or invoking a possibly reentrant reward.
        DiscardItem(item)
        if run.onBonus then run.onBonus(record.kind) end
    end
    function SurvivorCombatSupplies.Drop(kind, x, y)
        local config = SurvivorConfig.bonusProps
        local itemId = config[kind].itemId
        local item = CreateItem(itemId, x, y)
        assert(item ~= nil and GetItemTypeId(item) == itemId, "Bonus pickup object ID is missing")
        run.bonusItems[item] = {kind = kind, expires = RunSession.GetElapsed() + config.itemLifetime}
    end
    -- Collects nearby or pending pickups and expires old ones (also each status tick).
    function SurvivorCombatSupplies.UpdateItems(elapsed)
        local config, hx, hy = SurvivorConfig.bonusProps, GetUnitX(run.hero), GetUnitY(run.hero)
        for item, record in pairs(run.bonusItems) do
            -- An automatically consumed powerup may already have no native handle.
            -- A paused pickup retains its reward until the next running update.
            if record.pending then SurvivorCombatSupplies.Collect(item)
            elseif not SurvivorUtil.ItemExists(item) or elapsed >= record.expires then DiscardItem(item)
            else
                local x, y = GetItemX(item), GetItemY(item)
                if (x - hx)^2 + (y - hy)^2 <= config.pickupRadius^2 and SurvivorStage.LineClear(hx, hy, x, y) then
                    SurvivorCombatSupplies.Collect(item)
                end
            end
        end
    end
    -- Removes a supply crate (alive or broken) without any drop.
    function SurvivorCombatSupplies.Remove(u, record)
        if record.alive then run.bonusCount = math.max(0, run.bonusCount - 1) end
        if record.cosmetic then DestroyEffect(record.cosmetic); record.cosmetic = nil end
        ALICE_RemoveIdentifier(u, "hsEnemy")
        run.units[u] = nil
        RemoveUnit(u)
    end
    -- Expires crates and pickups, then spawns the next crate on reachable ground.
    function SurvivorCombatSupplies.Update(elapsed)
        local config = SurvivorConfig.bonusProps
        SurvivorCombatSupplies.UpdateItems(elapsed)
        for u, record in pairs(run.units) do
            if record.bonus and elapsed >= (record.alive and record.expiresAt or record.removeAt) then SurvivorCombatSupplies.Remove(u, record) end
        end
        if elapsed < run.nextBonusAt or run.bonusCount >= config.limit or run.boss ~= nil or run.bossDefeated
            or elapsed - run.stageStarted >= SurvivorConfig.StageTiming(run.stage).bossStart then return end
        run.nextBonusAt = elapsed + config.retry
        local hx, hy = GetUnitX(run.hero), GetUnitY(run.hero)
        for _ = 1, 16 do
            local angle, distance = GetRandomReal(0, 2 * math.pi), GetRandomReal(config.distanceMin, config.distanceMax)
            local x, y = hx + math.cos(angle) * distance, hy + math.sin(angle) * distance
            local valid = x > run.bounds.minX + 64 and x < run.bounds.maxX - 64 and y > run.bounds.minY + 64 and y < run.bounds.maxY - 64
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
            for u, record in pairs(run.units) do
                if record.bonus and record.alive and (GetUnitX(u) - x)^2 + (GetUnitY(u) - y)^2 < 240^2 then valid = false end
            end
            if valid then
                local prop = CreateUnit(Player(PLAYER_NEUTRAL_PASSIVE), config.unitId, x, y, GetRandomReal(0, 360))
                assert(prop ~= nil and GetUnitTypeId(prop) == config.unitId, "Bonus prop object ID is missing")
                run.units[prop] = {bonus = true, alive = true, expiresAt = elapsed + config.lifetime}
                run.bonusCount = run.bonusCount + 1
                BlzSetUnitMaxHP(prop, config.hits)
                SetWidgetLife(prop, config.hits)
                BlzSetUnitName(prop, config.name)
                SetUnitPause(prop, run.units[prop], "prop", true) -- Supplies never move.
                local marker = AddSpecialEffect(SurvivorConfig.specialSafeMarkerModel, x, y)
                run.units[prop].cosmetic = marker
                BlzSetSpecialEffectScale(marker, 0.55)
                BlzSetSpecialEffectColor(marker, config.color[1], config.color[2], config.color[3])
                ALICE_AddIdentifier(prop, "hsEnemy", "unit")
                run.nextBonusAt = elapsed + GetRandomReal(config.intervalMin, config.intervalMax)
                return
            end
        end
    end
    -- A broken crate drops one rolled pickup; called from the run death event.
    function SurvivorCombatSupplies.OnBroken(dead, record)
        run.bonusCount = math.max(0, run.bonusCount - 1)
        record.removeAt = RunSession.GetElapsed() + 0.2
        ALICE_RemoveIdentifier(dead, "hsEnemy")
        if RunSession.IsRunning() and Alive(run.hero) then
            SurvivorCombatSupplies.Drop(SurvivorCombatSupplies.Roll(), GetUnitX(dead), GetUnitY(dead))
        end
    end
    -- Only the hero collects pickups; one picked up during a pause is granted on resume.
    function SurvivorCombatSupplies.OnPickup(item)
        local record = run.bonusItems[item]
        if not record then return end
        if RunSession.IsRunning() then SurvivorCombatSupplies.Collect(item)
        else record.pending = true end
    end
end
