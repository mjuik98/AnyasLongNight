-- Weapons/trinkets are passive indicators. Native talents grant hidden marker
-- abilities; SurvivorAugments computes their effects from a complete snapshot.
-- Matching object definitions live in assets/war3map.w3a and assets/war3map.w3t.
-- Indicator item objects have iprn=0/idrp=0: excluded from random loot and death drops.
SurvivorNativeLoadout = {}
do
    local weapons = {firebolt = "HsW1", flamefield = "HsW2", chainlightning = "HsW3", orbitblade = "HsW4",
        monsoon = "HsW5", frontslash = "HsW6", frostshard = "HsW7",
        frostnova = "HsW8", blizzard = "HsW9", meteor = "HsWA", thunderorb = "HsWB", returnblade = "HsWC",
        plaguedart = "HsWD", plaguetrail = "HsWE", corrosion = "HsWF", plaguepool = "HsWG",
        deathcoil = "HsWH", soulchain = "HsWI", wraithguard = "HsWJ", shadowscythe = "HsWK",
        plaguejar = "HsWL", catalyst = "HsWM", boilingflask = "HsWN", acidvials = "HsWO",
        banshee = "HsWP", shadowarcher = "HsWQ", plaguezombie = "HsWR", experiment = "HsWS"}
    local trinkets = {power = "HsT1", haste = "HsT2", reach = "HsT3", velocity = "HsT4", magnitude = "HsT5", longevity = "HsT6", multicast = "HsT7",
        vitality = "HsT8", renewal = "HsT9", stride = "HsTA", armor = "HsTB"}
    local weaponPositions = {{0, 2}, {1, 2}, {2, 2}, {3, 2}, {2, 1}, {3, 1}}
    local hero, build
    local ownsStatDetails = false
    -- Hidden item-stat passives feed the renamed ASde rows (build/build.mjs).
    -- Only HsCD stays live: automatic weapon clocks never read native cooldowns.
    -- The others are real engine modifiers (amplification, vampirism, resolve,
    -- crits), so they carry a value only while combat is paused and nothing fights.
    local statDisplays = {
        {code = "HsCD", field = "Icr1", stat = "commonCooldownReduction", live = true},
        {code = "HsDM", field = "Isa1", stat = "commonDamageBonus"},
        {code = "HsAR", field = "Ilv1", stat = "commonAreaBonus"},
        {code = "HsSZ", field = "Isv1", stat = "commonSizeBonus"},
        {code = "HsRG", field = "Ivam", stat = "commonRangeBonus"},
        {code = "HsDU", field = "Ocr1", stat = "commonDurationBonus", scale = 100},
        {code = "HsPS", field = "Ocr1", stat = "commonProjectileSpeedBonus", scale = 100},
    }
    local ownedDisplays, displayValues = {}, {}
    local originalInterfaceText
    local items, textCache = {}, {}
    local descriptions, titles, descriptionRevision = {}, {}, nil
    local talentEarned, talentGranted, talentSpent, refreshSerial, talentRetry = 0, 0, 0, 0, 0
    local talentChoices, pointItems = {}, {}
    local ownsTalentController, campaignTalentLevel = false, 0
    local deliveringTalent = false

    function SurvivorNativeLoadout.TalentStatus()
        return talentGranted - talentSpent, talentEarned, talentEarned - talentGranted
    end
    local function DeliverTalentPoint()
        for item in pairs(pointItems) do if GetItemTypeId(item) == 0 then pointItems[item] = nil end end
        if deliveringTalent or talentGranted >= talentEarned or refreshSerial < talentRetry or IsUnitPaused(hero) then return end
        talentRetry = refreshSerial + 20 -- Retry rejected pickups without a new timer or a busy item loop.
        local item = CreateItem(FourCC(SurvivorConfig.talents.pointItem), GetUnitX(hero), GetUnitY(hero))
        if item == nil then return end
        pointItems[item] = true -- Own the handle before native pickup callbacks can fail.
        local owner = hero
        deliveringTalent = true
        local ok, accepted = pcall(UnitAddItem, hero, item)
        deliveringTalent = false
        if not ok then error(accepted) end
        if hero ~= owner then return end
        if accepted then
            talentGranted = talentGranted + 1
            if GetItemTypeId(item) == 0 then pointItems[item] = nil end
        else pointItems[item] = nil; RemoveItem(item) end
    end
    local function ReconcileTalents()
        local changed = false
        for tier = 1, talentGranted do
            if talentChoices[tier] == nil then
                local selected
                for _, entry in ipairs(SurvivorConfig.talents.tiers[tier]) do
                    if GetUnitAbilityLevel(hero, FourCC(entry.id)) > 0 then
                        assert(selected == nil, "Multiple native talents selected in one tier")
                        selected = entry.id
                    end
                end
                if selected then
                    talentChoices[tier], talentSpent, changed = selected, talentSpent + 1, true
                    UnitMakeAbilityPermanent(hero, true, FourCC(selected))
                end
            end
        end
        if changed then SurvivorAugments.SetTalents(build, talentChoices, hero) end
        return changed
    end
    function SurvivorNativeLoadout.GrantStageTalent(index)
        assert(hero ~= nil and GetUnitTypeId(hero) ~= 0, "Talent points need a live loadout")
        if index <= talentEarned then return false end
        assert(index == talentEarned + 1 and index <= #SurvivorConfig.talents.tiers, "Invalid talent point stage")
        talentEarned, talentRetry = index, 0
        SurvivorNativeLoadout.Refresh()
        return true
    end

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
    local function UpdateTrinketText(item, id)
        local level = SurvivorAugments.Level(build, id)
        local title, description = Title(id, level), Description(id)
        if textCache[id] == title .. description then return end
        BlzSetItemName(item, title)
        BlzSetItemTooltip(item, title)
        BlzSetItemExtendedTooltip(item, description)
        BlzSetItemDescription(item, description)
        SetItemCharges(item, level)
        textCache[id] = title .. description
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
        -- Native pickup/UI observers must see the concise current-level text.
        UpdateTrinketText(item, id)
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
    local function RefreshStatDisplay(display, paused)
        local id = FourCC(display.code)
        local level = GetUnitAbilityLevel(hero, id)
        if level == 0 then
            assert(UnitAddAbility(hero, id), "Missing native stat display " .. display.code)
            ownedDisplays[display.code], displayValues[display.code] = true, nil
            UnitMakeAbilityPermanent(hero, true, id)
            -- Keep the passive active for ASde, without taking a command-card slot.
            BlzUnitDisableAbility(hero, id, false, true)
            level = 1
        end
        local value = (display.live or paused) and build.stats[display.stat] * (display.scale or 1) or 0
        if displayValues[display.code] == value then return end
        -- Suspend the old modifier, populate the inactive rank, then reactivate.
        -- Updating an ability field alone can leave a cached passive bonus intact.
        local nextLevel = level == 1 and 2 or 1
        BlzUnitDisableAbility(hero, id, true, true)
        local ability = assert(BlzGetUnitAbility(hero, id), "Missing stat display handle " .. display.code)
        assert(BlzSetAbilityRealLevelField(ability, ConvertAbilityRealLevelField(FourCC(display.field)), nextLevel - 1, value),
            "Could not update native stat display " .. display.code)
        SetUnitAbilityLevel(hero, id, nextLevel)
        assert(GetUnitAbilityLevel(hero, id) == nextLevel, "Could not refresh native stat display " .. display.code)
        BlzUnitDisableAbility(hero, id, false, true)
        displayValues[display.code] = value
    end
    -- Combat calls this on every pause transition, before units resume.
    function SurvivorNativeLoadout.RefreshStatDisplays()
        if hero == nil or GetUnitTypeId(hero) == 0 then return end
        -- Combat sets this for every pause reason (see SurvivorCombat.SetPaused); the
        -- regeneration flag is not used here because interactive panels keep it false.
        local paused = build.stats.combatPaused == true
        for _, display in ipairs(statDisplays) do RefreshStatDisplay(display, paused) end
    end
    function SurvivorNativeLoadout.Refresh()
        if hero == nil or GetUnitTypeId(hero) == 0 then return end
        SurvivorMetrics.Count("loadout.refreshes")
        refreshSerial = refreshSerial + 1
        DeliverTalentPoint()
        local talentsChanged = ReconcileTalents()
        SurvivorNativeLoadout.RefreshStatDisplays()
        if descriptionRevision ~= build.revision then
            descriptions, titles, descriptionRevision = {}, {}, build.revision
        end
        local available, earned, pending = SurvivorNativeLoadout.TalentStatus()
        local interfaceState = available .. ":" .. earned .. ":" .. pending
        if textCache.interface ~= interfaceState then
            textCache.interface = interfaceState
            local entry = FourCC("ASpc")
            local presentation = SurvivorConfig.talents.interface
            BlzSetAbilityTooltip(entry, presentation.title, 0)
            BlzSetAbilityExtendedTooltip(entry, string.format(
                presentation.format,
                available, earned, pending > 0 and ("|n포인트 전달 대기: " .. pending .. "개") or ""), 0)
        end
        local passive = FourCC("HsAE")
        if GetUnitAbilityLevel(hero, passive) == 0 then
            assert(UnitAddAbility(hero, passive), "Missing Anya escape passive HsAE")
            UnitMakeAbilityPermanent(hero, true, passive)
            textCache.escapeReady = nil
        end
        local ready, remaining = SurvivorCombat.EscapeStatus()
        if textCache.escapeReady ~= ready then
            BlzUnitDisableAbility(hero, passive, not ready, false)
            textCache.escapeReady = ready
        end
        local state = remaining > 0 and ("보호 중 · " .. math.ceil(remaining) .. "초") or ready and "사용 가능" or "소진 · 다음 스테이지에서 재충전"
        if textCache.escape ~= state then
            textCache.escape = state
            BlzSetAbilityTooltip(passive, "그림자 탈출 · " .. state, 0)
            BlzSetAbilityExtendedTooltip(passive, "치명적인 피해를 받을 시 30%의 생명력으로 생존합니다.|n주변 적이 적은 방향으로 최대 400 거리 순간 이동하고, 2.5초|n동안 무적 상태가 됩니다.", 0)
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
            if item then UpdateTrinketText(item, id) end
        end
        return inventoryChanged or talentsChanged
    end
    function SurvivorNativeLoadout.Init(unit, runBuild)
        assert(hero == nil, "Clean native loadout before initialization")
        hero, build = unit, runBuild
        for _, display in ipairs(statDisplays) do
            assert(GetUnitAbilityLevel(hero, FourCC(display.code)) == 0, "Stat display ID is already in use: " .. display.code)
        end
        assert(UnitInventorySize(hero) >= SurvivorConfig.trinketSlots, "Trinkets need the classic hero inventory")
        -- ASde joins the existing ASpc equipment interface; no extra command slot
        -- or custom input surface. build/build.mjs limits its native stat list.
        local details = FourCC("ASde")
        originalInterfaceText = {BlzGetAbilityTooltip(FourCC("ASpc"), 0) or "",
            BlzGetAbilityExtendedTooltip(FourCC("ASpc"), 0) or ""}
        ownsStatDetails = GetUnitAbilityLevel(hero, details) == 0
        if ownsStatDetails then assert(UnitAddAbility(hero, details), "Missing native stat details ASde") end
        UnitMakeAbilityPermanent(hero, true, details)
        local talents = SurvivorConfig.talents
        for level = 1, #talents.tiers do
            BlzSetAbilityExtendedTooltip(FourCC(talents.controller), talents.controllerText, level - 1)
        end
        -- Initialize the native tooltip cache before the talent panel can read it.
        -- Use only the catalog effect; never restore an older description/footer.
        for _, tier in ipairs(talents.tiers) do
            for _, entry in ipairs(tier) do BlzSetAbilityExtendedTooltip(FourCC(entry.id), entry.text, 0) end
        end
        campaignTalentLevel = GetUnitAbilityLevel(hero, FourCC(talents.base))
        if campaignTalentLevel > 0 then UnitRemoveAbility(hero, FourCC(talents.base)) end
        ownsTalentController = GetUnitAbilityLevel(hero, FourCC(talents.controller)) == 0
        if ownsTalentController then assert(UnitAddAbility(hero, FourCC(talents.controller)), "Missing native talent controller") end
        UnitMakeAbilityPermanent(hero, true, FourCC(talents.controller))
        SurvivorNativeLoadout.Refresh()
    end
    function SurvivorNativeLoadout.Cleanup()
        for item in pairs(pointItems) do pointItems[item] = nil; if GetItemTypeId(item) ~= 0 then RemoveItem(item) end end
        for id, item in pairs(items) do items[id] = nil; RemoveItem(item) end
        if hero ~= nil and GetUnitTypeId(hero) ~= 0 then
            local talents = SurvivorConfig.talents
            if ownsTalentController then UnitRemoveAbility(hero, FourCC(talents.controller)) end
            for _, tier in ipairs(talents.tiers) do
                for _, entry in ipairs(tier) do UnitRemoveAbility(hero, FourCC(entry.id)) end
            end
            if campaignTalentLevel > 0 then
                UnitAddAbility(hero, FourCC(talents.base))
                SetUnitAbilityLevel(hero, FourCC(talents.base), campaignTalentLevel)
            end
            if ownsStatDetails then UnitRemoveAbility(hero, FourCC("ASde")) end
            for code in pairs(ownedDisplays) do UnitRemoveAbility(hero, FourCC(code)) end
            UnitRemoveAbility(hero, FourCC("HsAE"))
            for _, code in pairs(weapons) do UnitRemoveAbility(hero, FourCC(code)) end
        end
        hero, build = nil, nil
        ownsStatDetails = false
        ownedDisplays, displayValues = {}, {}
        ownsTalentController, campaignTalentLevel = false, 0
        deliveringTalent = false
        talentEarned, talentGranted, talentSpent, refreshSerial, talentRetry = 0, 0, 0, 0, 0
        talentChoices, pointItems = {}, {}
        items, textCache = {}, {}
        descriptions, titles, descriptionRevision = {}, {}, nil
        local previous = originalInterfaceText
        originalInterfaceText = nil
        if previous then
            local okTitle, titleError = pcall(BlzSetAbilityTooltip, FourCC("ASpc"), previous[1], 0)
            local okText, textError = pcall(BlzSetAbilityExtendedTooltip, FourCC("ASpc"), previous[2], 0)
            if not okTitle or not okText then error(tostring(titleError or textError)) end
        end
    end
end
