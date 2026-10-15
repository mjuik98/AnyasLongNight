-- Presentation only: owned weapons are passive command-card abilities; trinkets
-- are non-usable inventory indicators. SurvivorAugments alone computes their effects.
-- Matching object definitions live in assets/war3map.w3a and assets/war3map.w3t.
-- Indicator item objects have iprn=0/idrp=0: excluded from random loot and death drops.
SurvivorNativeLoadout = {}
do
    local weapons = {firebolt = "HsW1", flamefield = "HsW2", chainlightning = "HsW3", orbitblade = "HsW4",
        monsoon = "HsW5", frontslash = "HsW6", frostshard = "HsW7",
        frostnova = "HsW8", blizzard = "HsW9", meteor = "HsWA", thunderorb = "HsWB", returnblade = "HsWC"}
    local trinkets = {power = "HsT1", haste = "HsT2", reach = "HsT3", velocity = "HsT4", magnitude = "HsT5", longevity = "HsT6", multicast = "HsT7",
        vitality = "HsT8", renewal = "HsT9", stride = "HsTA"}
    local weaponPositions = {{0, 2}, {1, 2}, {2, 2}, {3, 2}, {2, 1}, {3, 1}}
    local hero, build
    local items, textCache = {}, {}
    local descriptions, titles, descriptionRevision = {}, {}, nil

    local function Description(id)
        if descriptions[id] == nil then
            descriptions[id] = SurvivorAugments.OwnedTooltip(id, build):gsub("\n", "|n")
            SurvivorMetrics.Count("loadout.descriptions")
        end
        return descriptions[id]
    end
    local function Title(id, level)
        if titles[id] == nil then
            titles[id] = SurvivorAugments.Get(id).name .. " · "
                .. (level == SurvivorConfig.growthMaxLevel and "MAX" or "Lv." .. level)
            if build.evolutions[id] then titles[id] = SurvivorAugments.Get(build.evolutions[id]).name .. " · 진화" end
        end
        return titles[id]
    end

    local function ReadMainSlots(main)
        main = main or {}
        main.items, main.positions, main.size = {}, {}, math.min(6, UnitInventorySize(hero))
        for slot = 0, main.size - 1 do
            local item = UnitItemInSlot(hero, slot)
            main.items[slot] = item
            if item ~= nil then main.positions[item] = slot end
        end
        return main
    end
    local function RemoveIndicator(item, main)
        local slot = main.positions[item]
        if slot ~= nil then main.items[slot], main.positions[item] = nil, nil end
        RemoveItem(item)
    end
    local function EnsureTrinket(id, main)
        local item = items[id]
        if item ~= nil and GetItemTypeId(item) ~= 0 and main.positions[item] ~= nil then return item, false end
        -- The native inventory can reject additions while the hero is paused for
        -- a level-up choice. Keep the learned level and create its indicator later.
        if IsUnitPaused(hero) or not UnitAlive(hero) then return nil, false end
        -- A native UI move into the expanded bag must not hide a learned trinket
        -- forever or alter its bonuses. Restore only our indicator, never other gear.
        local empty
        for slot = 0, main.size - 1 do
            if main.items[slot] == nil then empty = slot; break end
        end
        if empty == nil then
            -- A displaced indicator is never loot; remove it even if all slots are full.
            if item ~= nil then RemoveIndicator(item, main); items[id] = nil; return nil, true end
            return nil, false
        end
        if item ~= nil then RemoveIndicator(item, main); items[id] = nil end
        local typeId = FourCC(trinkets[id])
        -- UnitAddItemToSlotById hides the created handle when insertion fails.
        -- Own the handle before insertion so a failed attempt cannot leak ground loot.
        item = CreateItem(typeId, GetUnitX(hero), GetUnitY(hero))
        assert(item ~= nil and GetItemTypeId(item) == typeId, "Missing native trinket object: " .. trinkets[id])
        items[id], textCache[id] = item, nil
        SetItemDroppable(item, false)
        SetItemPawnable(item, false)
        SetItemDropOnDeath(item, false)
        local added = UnitAddItem(hero, item)
        -- Native insertion can choose another slot or reject the main inventory.
        -- Refresh only after a transaction; unchanged indicators share the first scan.
        ReadMainSlots(main)
        if not added or main.positions[item] == nil then
            items[id] = nil
            RemoveIndicator(item, main)
            return nil, true
        end
        return item, true
    end
    function SurvivorNativeLoadout.Refresh()
        if hero == nil or GetUnitTypeId(hero) == 0 then return end
        SurvivorMetrics.Count("loadout.refreshes")
        if descriptionRevision ~= build.revision then
            descriptions, titles, descriptionRevision = {}, {}, build.revision
        end
        local passive = FourCC("HsAE")
        if GetUnitAbilityLevel(hero, passive) == 0 then
            assert(UnitAddAbility(hero, passive), "Missing Anya escape passive HsAE")
            UnitMakeAbilityPermanent(hero, true, passive)
        end
        local ready, remaining = SurvivorCombat.EscapeStatus()
        local ward, wardTime = SurvivorCombat.WardStatus()
        local state = remaining > 0 and ("보호 중 · " .. math.ceil(remaining) .. "초") or ready and "사용 가능" or "소진 · 다음 스테이지에서 재충전"
        local shield = ward > 0 and string.format("|n수색 보호막 %.0f · %d초 남음", ward, math.ceil(wardTime)) or ""
        if textCache.escape ~= state .. shield then
            textCache.escape = state .. shield
            BlzSetAbilityTooltip(passive, "그림자 탈출 · " .. state, 0)
            BlzSetAbilityExtendedTooltip(passive, "안야의 자동 생존 능력 · 스테이지당 1회|n치명적인 피해를 무효화하고 생명력을 최소 30%로 보장합니다.|n이후 2.5초 동안 피해를 받지 않습니다. 이 틈에 이동해 포위망을 벗어나세요.|n|n성장 선택·인벤토리·스토리 중에는 보호 시간이 줄지 않습니다.|n다음 스테이지에서 재충전 · 직접 누를 필요 없음|n|n현재: " .. state .. shield, 0)
        end
        for slot, id in ipairs(build.weapons) do
            local code = weapons[id]
            assert(code ~= nil, "Missing native weapon presentation: " .. id)
            local abilityId, level = FourCC(code), SurvivorAugments.Level(build, id)
            if GetUnitAbilityLevel(hero, abilityId) == 0 then
                -- Reserve (1, 1) for escape; weapons fill the bottom row then (2, 1)/(3, 1).
                -- Keep movement and patrol commands in their existing positions.
                BlzSetAbilityPosX(abilityId, weaponPositions[slot][1])
                BlzSetAbilityPosY(abilityId, weaponPositions[slot][2])
                assert(UnitAddAbility(hero, abilityId), "Missing passive weapon object: " .. code)
                UnitMakeAbilityPermanent(hero, true, abilityId)
                textCache[id] = nil
            end
            if GetUnitAbilityLevel(hero, abilityId) ~= level then SetUnitAbilityLevel(hero, abilityId, level) end
            local title = Title(id, level)
            local description = Description(id)
            local signature = title .. description
            if textCache[id] ~= signature then
                BlzSetAbilityTooltip(abilityId, title, level - 1)
                BlzSetAbilityExtendedTooltip(abilityId, description, level - 1)
                textCache[id] = signature
            end
        end
        local main, inventoryChanged = #build.trinkets > 0 and ReadMainSlots() or nil, false
        for _, id in ipairs(build.trinkets) do
            assert(trinkets[id] ~= nil, "Missing native trinket presentation: " .. id)
            local item, changed = EnsureTrinket(id, main)
            inventoryChanged = inventoryChanged or changed
            if item then
                local level = SurvivorAugments.Level(build, id)
                local title = Title(id, level)
                local description = Description(id)
                    .. "|n|n레벨업 장신구 · 버리기 불가 · 숫자는 강화 레벨"
                if textCache[id] ~= title .. description then
                    BlzSetItemName(item, title)
                    BlzSetItemTooltip(item, title)
                    BlzSetItemExtendedTooltip(item, description)
                    BlzSetItemDescription(item, description)
                    SetItemCharges(item, level)
                    textCache[id] = title .. description
                end
            end
        end
        return inventoryChanged
    end
    function SurvivorNativeLoadout.Init(unit, runBuild)
        assert(hero == nil, "Clean native loadout before initialization")
        hero, build = unit, runBuild
        assert(UnitInventorySize(hero) >= SurvivorConfig.trinketSlots, "Trinkets need the classic hero inventory")
        SurvivorNativeLoadout.Refresh()
    end
    function SurvivorNativeLoadout.Cleanup()
        for id, item in pairs(items) do items[id] = nil; RemoveItem(item) end
        if hero ~= nil and GetUnitTypeId(hero) ~= 0 then
            UnitRemoveAbility(hero, FourCC("HsAE"))
            for _, code in pairs(weapons) do UnitRemoveAbility(hero, FourCC(code)) end
        end
        hero, build = nil, nil
        items, textCache = {}, {}
        descriptions, titles, descriptionRevision = {}, {}, nil
    end
end
