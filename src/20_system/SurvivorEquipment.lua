-- Real expanded-bag items and native equipment slots are the source of truth.
-- Object fields in assets/war3map.w3t are generated from this literal catalog.
-- Equipment Type (iequ) verified against A1P4K4's WC3 3.0 example map:
-- https://www.hiveworkshop.com/threads/reforged-3-0-new-equipment-stats-and-talent-system.374193/
SurvivorEquipment = {}
do
    local catalog = {
        {id = "Hs01", base = "gcel", slot = "Gloves", name = "수색자의 장갑",
            icon = "ReplaceableTextures\\CommandButtons\\BTNGlove.blp",
            description = "모든 무기 피해 +5%", bonuses = {all = {damagePct = 0.05}}},
        {id = "Hs02", base = "bspd", slot = "Boots", name = "낡은 순찰 장화",
            icon = "ReplaceableTextures\\CommandButtons\\BTNBootsOfSpeed.blp",
            description = "이동 속도 +10", bonuses = {all = {moveSpeed = 10}}},
        {id = "Hs03", base = "ciri", slot = "Chest", name = "잿불 수호의 로브", set = "ember",
            icon = "ReplaceableTextures\\CommandButtons\\BTNRobeOfTheMagi.blp",
            description = "최대 생명력 +150 (장착 시 회복 없음)", bonuses = {all = {maxLife = 150}}},
        {id = "Hs04", base = "cnob", slot = "Head", name = "잿불 추적자의 관", set = "ember",
            icon = "ReplaceableTextures\\CommandButtons\\BTNHelmutPurple.blp",
            description = "잿불 화살 발사 수 +1 · 해당 무기 보유 시 적용",
            bonuses = {firebolt = {extraProjectiles = 1}}},
        {id = "Hs05", base = "gcel", slot = "Gloves", name = "불길 직조의 장갑",
            icon = "ReplaceableTextures\\CommandButtons\\BTNGlove.blp",
            description = "잿불 발자취 지속 +1초 / 반경 +20%p · 해당 무기 보유 시 적용",
            bonuses = {flamefield = {duration = 1, areaPct = 0.20}}},
        {id = "Hs06", base = "cnob", slot = "Head", name = "폭풍 부름의 관",
            icon = "ReplaceableTextures\\CommandButtons\\BTNHelmOfValor.blp",
            description = "폭풍의 부름 횟수 +1 / 피해 +15%p · 해당 무기 보유 시 적용",
            bonuses = {monsoon = {extraStrikes = 1, damagePct = 0.15}}},
        {id = "Hs07", base = "gcel", slot = "Gloves", name = "검무사의 장갑",
            icon = "ReplaceableTextures\\CommandButtons\\BTNGauntletsOfOgrePower.blp",
            description = "그림자 베기 각도 +30도 / 거리 +20%p · 해당 무기 보유 시 적용",
            bonuses = {frontslash = {angle = 30, areaPct = 0.20}}},
        {id = "Hs08", base = "ciri", slot = "Chest", name = "서리술사의 로브",
            icon = "ReplaceableTextures\\CommandButtons\\BTNRobeOfTheMagi.blp",
            description = "서리 화살 관통 대상 +1 / 둔화 지속 +1초 · 해당 무기 보유 시 적용",
            bonuses = {frostshard = {extraPierce = 1, slowDuration = 1}}},
        {id = "Hs09", base = "cnob", slot = "Head", name = "서리심장의 관",
            icon = "ReplaceableTextures\\CommandButtons\\BTNCirclet.blp",
            description = "서리 폭발 범위 +20% / 둔화 지속 +1초 · 해당 무기 보유 시 적용",
            bonuses = {frostnova = {areaPct = 0.20, duration = 1}}},
        {id = "Hs10", base = "ciri", slot = "Chest", name = "눈보라 기록관의 외투",
            icon = "ReplaceableTextures\\CommandButtons\\BTNRobeOfTheMagi.blp",
            description = "묘역의 눈보라 피해 +15% / 지속 +1초 · 해당 무기 보유 시 적용",
            bonuses = {blizzard = {damagePct = 0.15, duration = 1}}},
        {id = "Hs11", base = "gcel", slot = "Gloves", name = "낙성을 부르는 장갑",
            icon = "ReplaceableTextures\\CommandButtons\\BTNGlove.blp",
            description = "잿불 낙성과 잔불 피해 +25% · 해당 무기 보유 시 적용",
            bonuses = {meteor = {damagePct = 0.25}}},
        {id = "Hs12", base = "cnob", slot = "Head", name = "폭풍 구슬의 관",
            icon = "ReplaceableTextures\\CommandButtons\\BTNHelmOfValor.blp",
            description = "폭풍 구슬 범위 +20% / 최대 지속 +0.5초 · 해당 무기 보유 시 적용",
            bonuses = {thunderorb = {areaPct = 0.20, duration = 0.5}}},
        {id = "Hs13", base = "bspd", slot = "Boots", name = "귀환 검객의 장화",
            icon = "ReplaceableTextures\\CommandButtons\\BTNBootsOfSpeed.blp",
            description = "귀환 칼날 피해 +20% / 타격 크기 +15% · 해당 무기 보유 시 적용",
            bonuses = {returnblade = {damagePct = 0.20, areaPct = 0.15}}},
        {id = "Hs14", base = "penr", slot = "Trinket", name = "빛바랜 목걸이",
            icon = "ReplaceableTextures\\CommandButtons\\BTNPendantOfEnergy.blp",
            description = "최대 생명력 +50 (장착 시 회복 없음)", bonuses = {all = {maxLife = 50}}},
        {id = "Hs15", base = "ram3", slot = "Ring", name = "병사의 반지",
            icon = "ReplaceableTextures\\CommandButtons\\BTNRingLionHead.blp",
            description = "모든 무기 피해 +4%", bonuses = {all = {damagePct = 0.04}}},
        {id = "Hs16", base = "rlif", slot = "Ring", name = "정찰병의 반지",
            icon = "ReplaceableTextures\\CommandButtons\\BTNRingSkull.blp",
            description = "모든 무기 쿨다운 3.8% 감소 (단독 기준)", bonuses = {all = {speedPct = 0.04}}},
        {id = "Hs17", base = "ofro", slot = "Primary", name = "순찰자의 발톱",
            icon = "ReplaceableTextures\\CommandButtons\\BTNClawsOfAttack.blp",
            description = "모든 무기 피해 +8%", bonuses = {all = {damagePct = 0.08}}},
        {id = "Hs18", base = "lhst", slot = "Offhand", name = "해진 주문서",
            icon = "ReplaceableTextures\\CommandButtons\\BTNBookOfTheDead.blp",
            description = "모든 무기 쿨다운 4.8% 감소 (단독 기준)", bonuses = {all = {speedPct = 0.05}}},
    }
    local rarities = {
        common = {name = "일반", color = "|cffffffff"},
        rare = {name = "희귀", color = "|cff609fff"},
        epic = {name = "영웅", color = "|cffc080ff"},
    }
    local setOrder = {"ember", "storm", "frost", "blade", "ashguide", "duskstorm", "silentcrypt", "nightwatch"}
    local sets = {
        ember = {name = "잿불지기의 유품", prefix = "잿불지기의", flavor = "불길 속에서도 길과 피난처를 지켰던 이들의 유품.", code = "He", weapons = {"firebolt", "flamefield", "meteor"},
            existing = {Head = "Hs04", Chest = "Hs03", Gloves = "Hs05"},
            tiers = {{count = 2, text = "화염 계열 피해 +15%p", bonuses = {}},
                {count = 4, text = "잿불 발자취 종료 시 장판 피해 200%로 폭발 (지상)", bonuses = {set = {ember = 1}}}}},
        storm = {name = "폭풍 파수꾼의 장구", prefix = "폭풍 파수꾼의", flavor = "마지막 성벽을 떠나지 않았던 파수꾼의 장구.", code = "Ht", weapons = {"chainlightning", "monsoon", "thunderorb"},
            existing = {Head = "Hs06"},
            tiers = {{count = 2, text = "번개 계열 쿨다운 13.0% 감소 (단독 기준)", bonuses = {}},
                {count = 4, text = "번개 6회 적중마다 추가 낙뢰: 해당 타격 피해 100% (재사용 2초)", bonuses = {set = {storm = 1}}}}},
        frost = {name = "서리 기록관의 유물", prefix = "서리 기록관의", flavor = "얼어붙은 기록 속에 사라진 이들의 이름이 남아 있다.", code = "Hi", weapons = {"frostshard", "frostnova", "blizzard"},
            existing = {Head = "Hs09", Chest = "Hs08"},
            tiers = {{count = 2, text = "냉기 계열 둔화 지속 +1초", bonuses = {}},
                {count = 4, text = "둔화 중 냉기 4회 적중: 1초 빙결 (대상별 5초)|n보스는 빙결 대신 해당 타격 피해 100% 추가", bonuses = {set = {frost = 1}}}}},
        blade = {name = "그림자 순찰자의 장구", prefix = "그림자 순찰자의", flavor = "돌아오는 길까지 살피던 순찰자의 장구.", code = "Hb", weapons = {"orbitblade", "frontslash", "returnblade"},
            existing = {Gloves = "Hs07", Boots = "Hs13"},
            tiers = {{count = 2, text = "칼날 계열 피해 +15%p", bonuses = {}},
                {count = 4, text = "칼날 적중 시 원형 검격: 해당 타격 피해 150% (지상·재사용 8초)", bonuses = {set = {blade = 1}}}}},
        ashguide = {name = "잿길 인도자의 유산", prefix = "잿길 인도자의", short = "잿길", code = "Ha",
            flavor = "꺼지지 않는 불씨로 길 잃은 이들을 이끌었던 자의 유산.",
            weapons = {"firebolt", "flamefield", "meteor"}, existing = {}, firstBonus = {damagePct = 0.20},
            tiers = {{count = 3, text = "화염 계열 피해 +20%p", bonuses = {}},
                {count = 5, text = "잿불 화살 +2발|n잿불 발자취 지속 +2초 · 잿불 낙성 타격 범위 +30%p",
                    bonuses = {firebolt = {extraProjectiles = 2}, flamefield = {duration = 2}, meteor = {areaPct = 0.30}}}}},
        duskstorm = {name = "황혼 뇌우의 유산", prefix = "황혼 뇌우의", short = "뇌우", code = "Hn",
            flavor = "침묵한 성벽 위로 마지막까지 응답했던 뇌우의 흔적.",
            weapons = {"chainlightning", "monsoon", "thunderorb"}, existing = {}, firstBonus = {damagePct = 0.20},
            tiers = {{count = 3, text = "번개 계열 피해 +20%p", bonuses = {}},
                {count = 5, text = "연쇄 번개 탐색·전이 거리 +35%p|n폭풍의 부름 +2회 · 폭풍 구슬 지속 +2초",
                    bonuses = {chainlightning = {areaPct = 0.35}, monsoon = {extraStrikes = 2}, thunderorb = {duration = 2}}}}},
        silentcrypt = {name = "침묵 묘역의 기억", prefix = "침묵 묘역의", short = "묘역", code = "Hc",
            flavor = "이름 없는 묘비 아래에서도 사라지지 않은 기억.",
            weapons = {"frostshard", "frostnova", "blizzard"}, existing = {}, firstBonus = {speedPct = 0.20},
            tiers = {{count = 3, text = "냉기 계열 쿨다운 16.7% 감소 (단독 기준)", bonuses = {}},
                {count = 5, text = "서리 화살 관통 +2명|n서리 폭발 범위 +35%p · 묘역의 눈보라 지속 +2초",
                    bonuses = {frostshard = {extraPierce = 2}, frostnova = {areaPct = 0.35}, blizzard = {duration = 2}}}}},
        nightwatch = {name = "긴 밤 파수꾼의 맹세", prefix = "긴 밤 파수꾼의", short = "긴 밤", code = "Hv",
            flavor = "긴 수색의 끝에서 돌아올 이를 기다리던 파수꾼의 맹세.",
            weapons = {"orbitblade", "frontslash", "returnblade"}, existing = {}, firstBonus = {speedPct = 0.20},
            tiers = {{count = 3, text = "칼날 계열 쿨다운 16.7% 감소 (단독 기준)", bonuses = {}},
                {count = 5, text = "순찰자의 칼날 피해 +35%p|n그림자 베기 각도 +45도 · 귀환 칼날 지속 +2초",
                    bonuses = {orbitblade = {damagePct = 0.35}, frontslash = {angle = 45}, returnblade = {duration = 2}}}}},
    }
    -- Nine simultaneous slots: each set has two distinct rings and seven other pieces.
    local parts = {
        {key = "Head", slot = "Head", base = "cnob", name = "두건", icon = "BTNHelmutPurple.blp", rarity = "rare", stat = "maxLife", value = 100, text = "최대 생명력 +100 (장착 시 회복 없음)"},
        {key = "Chest", slot = "Chest", base = "ciri", name = "외투", icon = "BTNRobeOfTheMagi.blp", rarity = "rare", stat = "maxLife", value = 150, text = "최대 생명력 +150 (장착 시 회복 없음)"},
        {key = "Gloves", slot = "Gloves", base = "gcel", name = "장갑", icon = "BTNGlove.blp", rarity = "rare", stat = "speedPct", value = 0.08, text = "모든 무기 쿨다운 7.4% 감소 (단독 기준)"},
        {key = "Boots", slot = "Boots", base = "bspd", name = "장화", icon = "BTNBootsOfSpeed.blp", rarity = "rare", stat = "moveSpeed", value = 20, text = "이동 속도 +20"},
        {key = "Ring1", slot = "Ring", base = "ram3", name = "서약", icon = "BTNRingLionHead.blp", rarity = "rare", stat = "damagePct", value = 0.10, text = "모든 무기 피해 +10%"},
        {key = "Ring2", slot = "Ring", base = "rlif", name = "결의", icon = "BTNRingSkull.blp", rarity = "epic", stat = "damagePct", value = 0.20, specialized = true, text = "소속 세트 계열 무기 피해 +20%p"},
        {key = "Primary", slot = "Primary", base = "ofro", name = "발톱", icon = "BTNClawsOfAttack.blp", rarity = "epic", stat = "damagePct", value = 0.25, specialized = true, text = "소속 세트 계열 무기 피해 +25%p"},
        {key = "Offhand", slot = "Offhand", base = "lhst", name = "봉인서", icon = "BTNBookOfTheDead.blp", rarity = "epic", stat = "speedPct", value = 0.15, specialized = true, text = "소속 세트 계열 무기 쿨다운 13.0% 감소 (단독 기준)"},
        {key = "Trinket", slot = "Trinket", base = "penr", name = "부적", icon = "BTNPendantOfEnergy.blp", rarity = "epic", stat = "damagePct", value = 0.10, specialized = true, text = "최대 생명력 +100 / 소속 세트 계열 무기 피해 +10%p"},
    }
    local existingById = {}
    for _, entry in ipairs(catalog) do
        entry.rarity = "common"
        -- Keep all existing rawcodes, stats and equipment slots intact.
        if entry.id == "Hs10" or entry.id == "Hs11" or entry.id == "Hs12" then entry.rarity = "rare" end
        existingById[entry.id] = entry
    end
    for _, id in ipairs(setOrder) do
        local set = sets[id]
        set.pieces = {}
        for _, weapon in ipairs(set.weapons) do
            set.tiers[1].bonuses[weapon] = set.firstBonus or id == "storm" and {speedPct = 0.15}
                or id == "frost" and {slowDuration = 1} or {damagePct = 0.15}
        end
        for i, part in ipairs(parts) do
            local entry = existingById[set.existing[part.key]]
            if not entry then
                local bonuses = {}
                if part.specialized then
                    for _, weapon in ipairs(set.weapons) do bonuses[weapon] = {[part.stat] = part.value} end
                    if part.slot == "Trinket" then bonuses.all = {maxLife = 100} end
                else bonuses.all = {[part.stat] = part.value} end
                entry = {id = set.code .. string.format("%02d", i), base = part.base, slot = part.slot,
                    name = set.prefix .. " " .. part.name, icon = "ReplaceableTextures\\CommandButtons\\" .. part.icon,
                    description = part.text, bonuses = bonuses}
                catalog[#catalog + 1] = entry
            end
            entry.name, entry.flavor = set.prefix .. " " .. part.name, set.flavor
            entry.set, entry.rarity = id, part.rarity
            set.pieces[#set.pieces + 1] = entry.id
        end
    end
    local flavor = {
        Hs01 = "안야가 수색길에 챙겨 온 오래된 장갑.",
        Hs02 = "무너진 길에도 돌아갈 발자국을 남긴다.",
        Hs10 = "눈보라 속에서도 기록을 감싸 지켜 낸 외투.",
        Hs11 = "검게 그을린 손끝에서 붉은 빛이 떨어진다.",
        Hs12 = "오래전 폭풍의 잔향이 관 안에 맴돈다.",
        Hs14 = "주인의 이름은 지워졌지만 무게는 남아 있다.",
        Hs15 = "이름 없는 병사가 끝까지 지녔던 반지.",
        Hs16 = "흔적을 찾는 손에 익숙한 작은 반지.",
        Hs17 = "길을 가로막은 것들을 조용히 걷어 낸다.",
        Hs18 = "찢어진 여백에도 사용할 주문은 남아 있다.",
    }
    for _, entry in ipairs(catalog) do entry.flavor = entry.flavor or flavor[entry.id] end
    local slotNames = {Head = "머리", Chest = "가슴", Gloves = "장갑", Boots = "신발",
        Trinket = "장신구 (장비용)", Ring = "반지 (두 칸 중 하나)", Primary = "무기", Offhand = "보조무기"}
    local byType, byId = {}, {}
    for _, entry in ipairs(catalog) do byType[FourCC(entry.id)], byId[entry.id] = entry, entry end
    local hero, build, eventTrigger
    local owned, lastSlots, lastBag = {}, {}, {}
    local dryKills, bonusesDirty, allTooltipsDirty = 0, true, true
    local equippedIds, descriptionCache, tooltipDirty = {}, {}, {}
    local tooltipCache = setmetatable({}, {__mode = "k"})
    local uiRevision, lastBagCapacity, lastPendingCount = 0, nil, nil
    local HelpfulBossIndex
    local currentStage = 1
    local pickupMode, locked = 1, {}
    local pickupNames = {"전체", "희귀 이상", "영웅만", "OFF"}
    local rarityRank = {common = 1, rare = 2, epic = 3}
    local function TouchUI() uiRevision = uiRevision + 1 end

    function SurvivorEquipment.PickupMode() return pickupNames[pickupMode] end
    function SurvivorEquipment.CyclePickup()
        if hero then pickupMode = pickupMode % #pickupNames + 1; TouchUI() end
    end

    -- Regression fixtures enumerate the runtime catalog through this API.
    function SurvivorEquipment.Catalog() return catalog end
    function SurvivorEquipment.Get(id) return byId[id] end
    function SurvivorEquipment.Name(id)
        local entry = assert(byId[id], "Unknown gear")
        return rarities[entry.rarity].color .. entry.name .. "|r"
    end
    function SurvivorEquipment.SetStage(index) currentStage = index end
    function SurvivorEquipment.Summary(id)
        local entry = assert(byId[id], "Unknown gear")
        local rarity = rarities[entry.rarity]
        local set = sets[entry.set]
        local thresholds = {}
        if set then
            for _, tier in ipairs(set.tiers) do thresholds[#thresholds + 1] = tier.count .. "개" end
        end
        return rarity.color .. rarity.name .. "|r · " .. slotNames[entry.slot],
            set and (set.name .. "\n" .. table.concat(thresholds, "·") .. " 세트 효과") or "단품 장비 · 세트 없음"
    end
    local function RollRarity(elite, bossReward)
        local roll = GetRandomInt(1, 100)
        if bossReward then return roll <= 25 + 10 * (currentStage - 1) and "epic" or "rare" end
        if elite then return roll <= 10 + 5 * (currentStage - 1) and "epic" or "rare" end
        if roll <= 2 + 2 * (currentStage - 1) then return "epic" end
        if roll <= 20 + 10 * (currentStage - 1) then return "rare" end
        return "common"
    end
    function SurvivorEquipment.FitsBuild(id)
        local entry = byId[id]
        if not entry or not build then return false end
        for _, weapon in ipairs(build.weapons) do
            if entry.bonuses[weapon] then return true end
            if entry.set then
                for _, member in ipairs(sets[entry.set].weapons) do if member == weapon then return true end end
            end
        end
        return false
    end
    local function RollIndex(elite, bossReward, excluded, relevant)
        local rarity, candidates = RollRarity(elite, bossReward), {}
        for i, entry in ipairs(catalog) do
            if entry.rarity == rarity and not (excluded and excluded[entry.id])
                and (not relevant or SurvivorEquipment.FitsBuild(entry.id)) then candidates[#candidates + 1] = i end
        end
        -- A guaranteed related choice stays rare or better even if a tier has no match.
        if relevant and #candidates == 0 then
            for i, entry in ipairs(catalog) do
                if entry.rarity ~= "common" and not (excluded and excluded[entry.id])
                    and SurvivorEquipment.FitsBuild(entry.id) then candidates[#candidates + 1] = i end
            end
        end
        assert(#candidates > 0, "Empty equipment rarity pool")
        return candidates[GetRandomInt(1, #candidates)]
    end
    function SurvivorEquipment.RollBossReward()
        local offers, excluded = {}, {}
        for i = 1, 3 do
            local entry = catalog[i == 1 and build ~= nil and HelpfulBossIndex() or RollIndex(false, true, excluded)]
            offers[i], excluded[entry.id] = entry.id, true
        end
        return offers
    end
    function SurvivorEquipment.RollRiskReward()
        local offers, used = {}, {}
        for slot = 1, 3 do
            local tier = currentStage >= 3 and "epic" or (GetRandomInt(1, 100) <= 20 and "epic" or "rare")
            local pool = {}
            for _, entry in ipairs(catalog) do
                if entry.rarity == tier and not used[entry.id]
                    and (slot ~= 1 or SurvivorEquipment.FitsBuild(entry.id)) then pool[#pool + 1] = entry.id end
            end
            if #pool == 0 then
                for _, entry in ipairs(catalog) do
                    if entry.rarity == tier and not used[entry.id] then pool[#pool + 1] = entry.id end
                end
            end
            assert(#pool > 0, "Missing risk reward candidates")
            local id = pool[GetRandomInt(1, #pool)]
            offers[slot], used[id] = id, true
        end
        return offers
    end

    local function Entry(item)
        return item ~= nil and byType[GetItemTypeId(item)] or nil
    end
    local function ReadSlots()
        local slots = {}
        for i = 0, 8 do slots[i + 1] = UnitItemInEquipmentSlot(hero, ConvertLoadoutSlot(i)) end
        return slots
    end
    local function ReadBag()
        local bag, count, capacity = {}, 0, UnitExtendedInventorySize(hero)
        for i = 0, capacity - 1 do
            local item = UnitItemInBagSlot(hero, i)
            bag[i + 1] = item
            if item ~= nil then count = count + 1 end
        end
        return bag, count, capacity
    end
    local function ObserveBag(bag, capacity)
        local changed = capacity ~= lastBagCapacity
        for i = 1, math.max(capacity, lastBagCapacity or 0) do
            if bag[i] ~= lastBag[i] then
                changed = true
                if bag[i] ~= nil then tooltipDirty[bag[i]] = true end
            end
        end
        lastBag, lastBagCapacity = bag, capacity
        if changed then TouchUI() end
        return changed
    end
    local function ObservePendingRewards(bag, capacity, slots)
        local bagged, equipped, pending = nil, nil, 0
        for item, record in pairs(owned) do
            if record.pendingReward and GetItemTypeId(item) ~= 0 then
                if not bagged then
                    bagged = {}
                    for i = 1, capacity do if bag[i] then bagged[bag[i]] = true end end
                end
                if not bagged[item] then
                    if not equipped then
                        equipped = {}
                        slots = slots or ReadSlots()
                        for i = 1, 9 do if slots[i] then equipped[slots[i]] = true end end
                    end
                    if not equipped[item] then pending = pending + 1 end
                end
            end
        end
        if pending ~= lastPendingCount then lastPendingCount = pending; TouchUI(); return true end
        return false
    end
    function SurvivorEquipment.UIRevision()
        if hero then
            local bag, _, capacity = ReadBag()
            ObserveBag(bag, capacity)
            ObservePendingRewards(bag, capacity)
        end
        return uiRevision
    end
    local function ReadInventory()
        local bag, count, capacity = ReadBag()
        local inventory = {slots = ReadSlots(), bag = bag, count = count, capacity = capacity,
            bagged = {}, equipped = {}, copies = {}}
        local seen = {}
        local function Add(item)
            if not item or seen[item] then return end
            seen[item] = true
            local entry = Entry(item)
            if entry then inventory.copies[entry.id] = (inventory.copies[entry.id] or 0) + 1 end
        end
        for i = 1, 9 do local item = inventory.slots[i]; if item then inventory.equipped[item] = true; Add(item) end end
        for i = 1, capacity do local item = bag[i]; if item then inventory.bagged[item] = true; Add(item) end end
        for i = 0, UnitInventorySize(hero) - 1 do Add(UnitItemInSlot(hero, i)) end
        return inventory
    end
    local function Sources(slots)
        local sources, equipped, seen = {}, {}, {}
        for i = 1, 9 do
            local item = slots[i]
            local entry = Entry(item)
            if entry and not seen[item] then
                seen[item] = true
                sources["slot:" .. i] = entry.bonuses
                equipped[entry.id] = true
            end
        end
        for id, set in pairs(sets) do
            local count = 0
            for _, piece in ipairs(set.pieces) do if equipped[piece] then count = count + 1 end end
            for _, tier in ipairs(set.tiers) do
                if count >= tier.count then sources["set:" .. id .. ":" .. tier.count] = tier.bonuses end
            end
        end
        return sources, equipped
    end
    -- Pure previews never equip items or mutate the hero/build.
    local function PreviewBonuses(entries)
        local bonuses, counts, seen = {}, {}, {}
        local function Add(source)
            for scope, values in pairs(source) do
                bonuses[scope] = bonuses[scope] or {}
                for key, value in pairs(values) do bonuses[scope][key] = (bonuses[scope][key] or 0) + value end
            end
        end
        for _, entry in ipairs(entries) do
            Add(entry.bonuses)
            if entry.set and not seen[entry.id] then counts[entry.set] = (counts[entry.set] or 0) + 1 end
            seen[entry.id] = true
        end
        for id, set in pairs(sets) do
            for _, tier in ipairs(set.tiers) do if (counts[id] or 0) >= tier.count then Add(tier.bonuses) end end
        end
        return bonuses, counts
    end
    -- Shared by runtime tooltips and the object-data description. Only equipped gear counts.
    function SurvivorEquipment.Describe(id, equipped)
        local entry = byId[id]
        assert(entry ~= nil, "Unknown equipment description: " .. tostring(id))
        equipped = equipped or {}
        local rarity = rarities[entry.rarity]
        local lines = {rarity.color .. rarity.name .. " 장비|r", "|cffffcc00장착 부위: " .. slotNames[entry.slot] .. "|r", entry.description}
        lines[#lines + 1] = "가방 정리 시 장비가 삭제됩니다."
        if entry.slot == "Trinket" then
            lines[#lines + 1] = "|cffaaaaaa레벨업으로 얻는 인장과 별도의 장비입니다.|r"
        elseif entry.slot == "Primary" then
            lines[#lines + 1] = "|cffaaaaaa자동 공격 스킬을 새로 부여하지 않습니다.|r"
        end
        local set = sets[entry.set]
        if set then
            local count = 0
            for _, piece in ipairs(set.pieces) do if equipped[piece] then count = count + 1 end end
            lines[#lines + 1] = ""
            lines[#lines + 1] = string.format("|cffffcc00<%s> %d/%d 착용|r", set.name, count, #set.pieces)
            for _, piece in ipairs(set.pieces) do
                lines[#lines + 1] = (equipped[piece] and "|cff80ff80[장착] " or "|cff888888[미장착] ") .. byId[piece].name .. "|r"
            end
            for _, tier in ipairs(set.tiers) do
                local active = count >= tier.count
                lines[#lines + 1] = (active and "|cff80ff80" or "|cff888888")
                    .. string.format("(%d) %s · %s|r", tier.count, tier.text, active and "활성" or "비활성")
            end
            lines[#lines + 1] = "|cffaaaaaa보유 중인 해당 무기에만 적용|r"
            lines[#lines + 1] = "|cffaaaaaa기본 능력치는 각각 적용 · 동일 장비의 세트 개수는 1개|r"
            lines[#lines + 1] = "|cffaaaaaa세트 추가 공격은 재발동하지 않음|r"
        end
        lines[#lines + 1] = "|cffaaaaaa확장 인벤토리에서 장착 시 적용|r"
        if entry.flavor then lines[#lines + 1] = "|cffaaaaaa" .. entry.flavor .. "|r" end
        return table.concat(lines, "|n")
    end
    local function RefreshTooltip(item, equipped)
        local entry = Entry(item)
        if not entry then return end
        local text = descriptionCache[entry.id]
        if not text then text = SurvivorEquipment.Describe(entry.id, equipped); descriptionCache[entry.id] = text end
        if owned[item] and owned[item].pendingReward then
            text = "|cffffcc00미수령 보상 · 이번 도전 중 자동 소멸 없음|r|n" .. text
        end
        if locked[item] then text = "|cffffcc00[보관 잠금] 일괄 정리 제외|r|n" .. text end
        if tooltipCache[item] == text then return end
        local name = SurvivorEquipment.Name(entry.id)
        BlzSetItemName(item, name)
        BlzSetItemTooltip(item, name)
        BlzSetItemDescription(item, text)
        BlzSetItemExtendedTooltip(item, text)
        tooltipCache[item] = text
        SurvivorMetrics.Count("equipment.tooltipWrites")
    end
    local function BagCount()
        local _, count, capacity = ReadBag()
        return count, capacity
    end
    function SurvivorEquipment.BagCount() if not hero then return 0, 0 end; return BagCount() end
    local function HeldItems()
        local list, seen = {}, {}
        local function Add(item)
            if item and not seen[item] and Entry(item) then list[#list + 1], seen[item] = item, true end
        end
        for i = 0, 8 do Add(UnitItemInEquipmentSlot(hero, ConvertLoadoutSlot(i))) end
        for i = 0, UnitExtendedInventorySize(hero) - 1 do Add(UnitItemInBagSlot(hero, i)) end
        for i = 0, UnitInventorySize(hero) - 1 do Add(UnitItemInSlot(hero, i)) end
        return list
    end
    -- Rank only the first boss card, after the existing rarity roll. Compare pure
    -- derived stats so cooldown caps and evolution conversions match real combat.
    local rewardFields = {
        firebolt = {"missileDamage", "missileCount", "missileRange", "-missileInterval"},
        flamefield = {"zoneDamage", "zoneRadius", "zoneDuration", "-zoneInterval"},
        chainlightning = {"chainDamage", "chainTargets", "chainRange", "chainJumpRange", "-chainInterval"},
        orbitblade = {"bladeDamage", "bladeCount", "bladeRadius", "bladeDuration", "-bladeInterval"},
        monsoon = {"monsoonDamage", "monsoonCount", "monsoonRange", "monsoonRadius", "-monsoonInterval"},
        frontslash = {"slashDamage", "slashRange", "slashAngle", "slashDuration", "-slashInterval"},
        frostshard = {"frostDamage", "frostPierce", "frostSlowDuration", "-frostInterval"},
    }
    local function RewardValues(stats)
        local values = {stats.equipmentLife, stats.moveSpeed, stats.regeneration}
        for _, weapon in ipairs(build.weapons) do
            local fields = rewardFields[weapon]
            local source = fields and stats or stats.extraWeapons[weapon]
            for _, field in ipairs(fields or {"damage", "radius", "range", "duration", "slowDurationBonus", "-interval"}) do
                local lower = field:sub(1, 1) == "-"
                local value = source[lower and field:sub(2) or field] or 0
                values[#values + 1] = lower and -value or value
            end
        end
        return values
    end
    HelpfulBossIndex = function()
        local rarity, pool = RollRarity(false, true), {}
        for index, entry in ipairs(catalog) do
            if entry.rarity == rarity and SurvivorEquipment.FitsBuild(entry.id) then pool[#pool + 1] = index end
        end
        if #pool == 0 then
            for index, entry in ipairs(catalog) do
                if entry.rarity ~= "common" and SurvivorEquipment.FitsBuild(entry.id) then pool[#pool + 1] = index end
            end
        end
        assert(#pool > 0, "Empty related boss reward pool")
        local held, entries = {}, {}
        for _, item in ipairs(HeldItems()) do held[Entry(item).id] = true end
        for item, record in pairs(owned) do
            if record.pendingReward and Entry(item) then held[Entry(item).id] = true end
        end
        for _, item in pairs(ReadSlots()) do
            local entry = Entry(item)
            if entry then entries[#entries + 1] = entry end
        end
        local beforeBonuses, beforeCounts = PreviewBonuses(entries)
        local before = RewardValues(SurvivorAugments.PreviewEquipment(build, {reward = beforeBonuses}))
        local best, choices = -1, {}
        for _, index in ipairs(pool) do
            local candidate, positions = catalog[index], {}
            for i, entry in ipairs(entries) do if entry.slot == candidate.slot then positions[#positions + 1] = i end end
            if #positions < (candidate.slot == "Ring" and 2 or 1) then positions[#positions + 1] = #entries + 1 end
            local priority = 0
            for _, position in ipairs(positions) do
                local afterEntries = {}
                for i, entry in ipairs(entries) do afterEntries[i] = entry end
                afterEntries[position] = candidate
                local afterBonuses, afterCounts = PreviewBonuses(afterEntries)
                local after = RewardValues(SurvivorAugments.PreviewEquipment(build, {reward = afterBonuses}))
                local improves, loses, activates, breaksSet = false, false, false, false
                for i, value in ipairs(after) do
                    if value > before[i] + 0.0001 then improves = true end
                    if value < before[i] - 0.0001 then loses = true end
                end
                for setId, set in pairs(sets) do
                    for _, tier in ipairs(set.tiers) do
                        local was, nextActive = (beforeCounts[setId] or 0) >= tier.count, (afterCounts[setId] or 0) >= tier.count
                        if was and not nextActive then breaksSet = true end
                        if not was and nextActive and setId == candidate.set then activates = true end
                    end
                end
                local tiers = candidate.set and sets[candidate.set].tiers
                local missing = tiers and (beforeCounts[candidate.set] or 0) > 0
                    and (beforeCounts[candidate.set] or 0) < tiers[#tiers].count
                    and (afterCounts[candidate.set] or 0) > (beforeCounts[candidate.set] or 0)
                local rank = 0
                if not breaksSet then
                    if activates and not loses then rank = 5
                    elseif improves and not loses then rank = missing and 4 or 3
                    elseif missing then rank = 2
                    elseif improves then rank = 1 end
                end
                priority = math.max(priority, rank)
            end
            -- Prefer a new useful item, then a useful second copy (e.g. a ring),
            -- before an unowned item that offers no improvement to this build.
            local score = priority > 0 and (held[candidate.id] and 10 or 20) + priority or (held[candidate.id] and 0 or 1)
            if score > best then best, choices = score, {index}
            elseif score == best then choices[#choices + 1] = index end
        end
        return choices[GetRandomInt(1, #choices)]
    end
    function SurvivorEquipment.PendingRewardCount()
        local count = 0
        if not hero then return count end
        for item, record in pairs(owned) do
            if record.pendingReward and GetItemTypeId(item) ~= 0
                and not UnitHasItemBagged(hero, item) and not UnitHasItemEquipped(hero, item) then count = count + 1 end
        end
        return count
    end
    local function Received(item, record)
        if record.pendingReward then tooltipDirty[item] = true; TouchUI() end
        record.carried, record.restPickup, record.pendingReward = true, false, false
    end
    local function TryPickup(item, record, inventory)
        local carried, restPickup, pending, noAuto, reward = record.carried, record.restPickup,
            record.pendingReward, record.noAuto, record.reward
        if not UnitAddItem(hero, item) then
            -- Pickup events may fire before a rejected native insertion finishes.
            record.carried, record.restPickup, record.pendingReward, record.noAuto, record.reward =
                carried, restPickup, pending, noAuto, reward
            tooltipDirty[item] = true
            return false
        end
        Received(item, record)
        inventory.count = inventory.count + 1
        inventory.bagged[item], inventory.changed = true, true
        local entry = Entry(item)
        if entry then inventory.copies[entry.id] = (inventory.copies[entry.id] or 0) + 1 end
        return true
    end
    local function CollectPendingRewards(nearOnly, elapsed, inventory)
        if not hero then return end
        local x, y = GetUnitX(hero), GetUnitY(hero)
        for item, record in pairs(owned) do
            if record.pendingReward and GetItemTypeId(item) ~= 0 then
                if inventory.bagged[item] or inventory.equipped[item] then Received(item, record)
                elseif inventory.count < inventory.capacity and (not nearOnly or elapsed >= (record.retry or 0)) then
                    local dx, dy = GetItemX(item) - x, GetItemY(item) - y
                    if not nearOnly or dx * dx + dy * dy <= SurvivorConfig.equipmentPickupRadius ^ 2 then
                        record.retry = elapsed + 0.5
                        TryPickup(item, record, inventory)
                    end
                end
            end
        end
    end
    local function CanAutoPick(item, record, inventory)
        if record.noAuto then return false end
        -- A reward explicitly chosen by the player bypasses all auto-loot filters.
        if record.reward then return true end
        local entry = Entry(item)
        if not entry or pickupMode == 4 or rarityRank[entry.rarity] < pickupMode then return false end
        local copies = inventory.copies[entry.id] or 0
        return copies < (entry.slot == "Ring" and 2 or 1)
    end
    function SurvivorEquipment.BagEntries()
        local list = {}
        if not hero then return list, 0, 0 end
        local bag, count, capacity = ReadBag()
        ObserveBag(bag, capacity)
        for i = 1, capacity do
            local item = bag[i]
            local entry = Entry(item)
            if entry then list[#list + 1] = {item = item, id = entry.id, locked = locked[item] == true} end
        end
        return list, count, capacity
    end
    function SurvivorEquipment.ToggleLock(item)
        if not hero or not Entry(item) or not UnitHasItemBagged(hero, item) then return false end
        locked[item] = not locked[item] or nil
        tooltipDirty[item] = true
        TouchUI()
        SurvivorEquipment.Reconcile()
        return true
    end
    local families = {"화염", "번개", "얼음", "칼날", "공용"}
    function SurvivorEquipment.CleanupFamilies() return families end
    function SurvivorEquipment.Family(id)
        local entry = assert(byId[id], "Unknown equipment family")
        if entry.set then return SurvivorAugments.Get(sets[entry.set].weapons[1]).element end
        for scope in pairs(entry.bonuses) do
            if scope ~= "all" and scope ~= "set" then return SurvivorAugments.Get(scope).element end
        end
        return "공용"
    end
    function SurvivorEquipment.PreviewCleanup(kind, keepFamily)
        local result = {kind = kind, keepFamily = keepFamily, items = {}}
        local validFamily = false
        for _, name in ipairs(families) do if keepFamily == name then validFamily = true end end
        if not hero or (kind ~= "common" and kind ~= "duplicate" and kind ~= "family")
            or (kind == "family" and not validFamily) then return result end
        local kept = {}
        -- Protected copies count first, regardless of bag order.
        for _, item in ipairs(HeldItems()) do
            if locked[item] or not UnitHasItemBagged(hero, item) or UnitHasItemEquipped(hero, item) then
                local id = GetItemTypeId(item)
                kept[id] = (kept[id] or 0) + 1
            end
        end
        for _, row in ipairs(SurvivorEquipment.BagEntries()) do
            local item, entry = row.item, byId[row.id]
            if not locked[item] and not UnitHasItemEquipped(hero, item) then
                local id, remove = GetItemTypeId(item), kind == "common" and entry.rarity == "common"
                if kind == "duplicate" then
                    kept[id] = (kept[id] or 0) + 1
                    remove = kept[id] > (entry.slot == "Ring" and 2 or 1)
                end
                if kind == "family" then remove = SurvivorEquipment.Family(entry.id) ~= keepFamily end
                if remove then result.items[#result.items + 1] = item end
            end
        end
        return result
    end
    function SurvivorEquipment.ConfirmCleanup(preview)
        local state = RunSession.GetState()
        if not hero or not preview or (state ~= "INVENTORY" and state ~= "STAGE_CLEAR") then return 0 end
        local allowed, removed = {}, 0
        for _, item in ipairs(SurvivorEquipment.PreviewCleanup(preview.kind, preview.keepFamily).items) do allowed[item] = true end
        -- Never delete newly arrived items or items equipped/locked since the preview.
        for _, item in ipairs(preview.items) do
            if allowed[item] and GetItemTypeId(item) ~= 0 then
                allowed[item], owned[item], locked[item], tooltipDirty[item], tooltipCache[item] = nil, nil, nil, nil, nil
                RemoveItem(item)
                removed = removed + 1
            end
        end
        if removed > 0 then TouchUI() end
        SurvivorEquipment.Reconcile()
        return removed
    end
    function SurvivorEquipment.Reconcile(inventory)
        if hero == nil then return end
        local slots = inventory and inventory.slots or ReadSlots()
        local bag, _, capacity
        if inventory then bag, capacity = inventory.bag, inventory.capacity else bag, _, capacity = ReadBag() end
        local changed = ObserveBag(bag, capacity)
        for i = 1, 9 do
            if slots[i] ~= lastSlots[i] then
                bonusesDirty, changed = true, true
                if slots[i] ~= nil then tooltipDirty[slots[i]] = true end
            end
        end
        if bonusesDirty then
            local sources, equipped = Sources(slots)
            SurvivorAugments.SetEquipmentBonuses(build, sources, hero)
            local same = true
            for id in pairs(equipped) do if not equippedIds[id] then same = false end end
            for id in pairs(equippedIds) do if not equipped[id] then same = false end end
            if not same then
                equippedIds, descriptionCache, allTooltipsDirty = equipped, {}, true
            end
            lastSlots, bonusesDirty = slots, false
            TouchUI()
        end
        local seen = {}
        local function Refresh(item)
            if item and not seen[item] then
                seen[item] = true
                if GetItemTypeId(item) ~= 0 then RefreshTooltip(item, equippedIds) end
                tooltipDirty[item] = nil
            end
        end
        if allTooltipsDirty then
            for item in pairs(owned) do Refresh(item) end
            -- Gear granted by the editor or another system is observed without item events.
            for i = 1, 9 do Refresh(slots[i]) end
            for i = 1, capacity do Refresh(bag[i]) end
            allTooltipsDirty, changed = false, true
        else
            for item in pairs(tooltipDirty) do Refresh(item); tooltipDirty[item] = nil; changed = true end
        end
        if ObservePendingRewards(bag, capacity, slots) then changed = true end
        -- The observer can reuse the revision from this exact native snapshot.
        return changed, uiRevision
    end
    function SurvivorEquipment.Init(unit, runBuild)
        assert(hero == nil, "Equipment must be cleaned before initialization")
        assert(type(UnitEquipItem) == "function" and type(UnitUnequipItem) == "function"
            and type(UnitItemInEquipmentSlot) == "function" and type(UnitItemInBagSlot) == "function"
            and type(UnitExtendedInventorySize) == "function" and type(UnitHasItemBagged) == "function"
            and type(UnitHasItemEquipped) == "function" and type(ConvertLoadoutSlot) == "function"
            and EVENT_PLAYER_UNIT_EQUIP_ITEM ~= nil and EVENT_PLAYER_UNIT_UNEQUIP_ITEM ~= nil,
            "장비 시스템은 Warcraft III 3.0 이상이 필요합니다.")
        hero, build, dryKills, bonusesDirty, allTooltipsDirty, currentStage = unit, runBuild, 0, true, true, 1
        pickupMode, locked = 1, {}
        -- AInv holds level-up trinket indicators; AIni/AEqu hold physical dropped gear.
        for _, code in ipairs({"AInv", "AIni", "AEqu"}) do
            local id = FourCC(code)
            if GetUnitAbilityLevel(hero, id) == 0 then assert(UnitAddAbility(hero, id), "Missing inventory ability: " .. code) end
            UnitMakeAbilityPermanent(hero, true, id)
        end
        assert(UnitExtendedInventorySize(hero) > 0, "확장 인벤토리가 활성화되지 않았습니다.")
        eventTrigger = CreateTrigger()
        for _, event in ipairs({EVENT_PLAYER_UNIT_EQUIP_ITEM, EVENT_PLAYER_UNIT_UNEQUIP_ITEM,
            EVENT_PLAYER_UNIT_PICKUP_ITEM, EVENT_PLAYER_UNIT_DROP_ITEM}) do
            TriggerRegisterPlayerUnitEvent(eventTrigger, GetOwningPlayer(hero), event, nil)
        end
        TriggerAddAction(eventTrigger, function()
            -- Event timing may precede native slot mutation. Read slots after the transaction.
            if GetTriggerUnit() == hero then
                TouchUI()
                local item = GetManipulatedItem()
                if Entry(item) then
                    tooltipDirty[item] = true
                    owned[item] = owned[item] or {expires = RunSession.GetElapsed() + SurvivorConfig.equipmentGroundLifetime}
                    if GetTriggerEventId() == EVENT_PLAYER_UNIT_DROP_ITEM then
                        owned[item].noAuto, owned[item].restPickup, owned[item].reward = true, false, false
                        owned[item].pendingReward = false
                    elseif GetTriggerEventId() == EVENT_PLAYER_UNIT_PICKUP_ITEM then
                        owned[item].noAuto = false
                        Received(item, owned[item])
                    end
                end
            end
        end)
        SurvivorEquipment.Reconcile()
    end
    function SurvivorEquipment.DropAt(x, y, catalogIndex, pendingReward)
        if hero == nil then return nil end
        local ground, oldest, oldestTime = 0, nil, math.huge
        for item, record in pairs(owned) do
            if GetItemTypeId(item) ~= 0 and not record.pendingReward
                and not UnitHasItemBagged(hero, item) and not UnitHasItemEquipped(hero, item) then
                ground = ground + 1
                if record.expires < oldestTime then oldest, oldestTime = item, record.expires end
            end
        end
        if not pendingReward and ground >= SurvivorConfig.equipmentGroundLimit and oldest then
            owned[oldest], locked[oldest], tooltipDirty[oldest], tooltipCache[oldest] = nil, nil, nil, nil; RemoveItem(oldest)
        end
        local entry = catalog[catalogIndex or RollIndex(false, false)]
        assert(entry ~= nil, "Unknown equipment catalog index")
        local item = CreateItem(FourCC(entry.id), x, y)
        assert(item ~= nil and GetItemTypeId(item) == FourCC(entry.id), "Missing equipment objects: import assets/war3map.w3t")
        owned[item] = {expires = RunSession.GetElapsed() + SurvivorConfig.equipmentGroundLifetime, carried = false,
            pendingReward = pendingReward == true, reward = pendingReward == true, restPickup = pendingReward == true}
        if pendingReward then TouchUI() end
        SurvivorEquipment.Reconcile()
        RefreshTooltip(item, equippedIds)
        return item
    end
    function SurvivorEquipment.ClaimReward(id, source)
        if not hero or not byId[id] then return false end
        local index
        for i, entry in ipairs(catalog) do if entry.id == id then index = i; break end end
        local item = SurvivorEquipment.DropAt(GetUnitX(hero), GetUnitY(hero), index, true)
        SurvivorEquipment.CollectRest()
        SurvivorUI.Notify(
            (source or "보스 보상") .. ": " .. SurvivorEquipment.Name(id)
                .. (owned[item].pendingReward and "\n발밑에 보관 · 수령 전 자동 소멸 없음"
                    or " · 가방에 수령했습니다."))
        return true
    end
    function SurvivorEquipment.OnKill(dead, elite)
        dryKills = dryKills + 1
        if elite or dryKills >= SurvivorConfig.equipmentPityKills or GetRandomReal(0, 1) < SurvivorConfig.equipmentDropChance then
            SurvivorEquipment.DropAt(GetUnitX(dead), GetUnitY(dead), RollIndex(elite, false))
            dryKills = 0
        end
    end
    function SurvivorEquipment.Step(elapsed)
        if hero == nil or not RunSession.IsRunning() then return end
        local inventory = ReadInventory()
        CollectPendingRewards(true, elapsed, inventory)
        local x, y = GetUnitX(hero), GetUnitY(hero)
        local radius = SurvivorConfig.equipmentPickupRadius
        for item, record in pairs(owned) do
            if GetItemTypeId(item) == 0 then
                if record.pendingReward then TouchUI() end
                owned[item], locked[item], tooltipDirty[item], tooltipCache[item] = nil, nil, nil, nil
            elseif inventory.bagged[item] or inventory.equipped[item] then Received(item, record)
            elseif not record.pendingReward then
                if record.carried then
                    record.carried = false
                    record.noAuto, record.restPickup, record.reward = true, false, false
                    record.expires = elapsed + SurvivorConfig.equipmentGroundLifetime
                    record.retry = elapsed + 3 -- Allow intentionally dropped items to remain on the floor.
                end
                if elapsed >= record.expires then
                    owned[item], locked[item], tooltipDirty[item], tooltipCache[item] = nil, nil, nil, nil; RemoveItem(item)
                elseif elapsed >= (record.retry or 0) then
                    local dx, dy = GetItemX(item) - x, GetItemY(item) - y
                    if dx * dx + dy * dy <= radius * radius and CanAutoPick(item, record, inventory) then
                        record.retry = elapsed + 0.5
                        if inventory.count < inventory.capacity and TryPickup(item, record, inventory) then
                            SurvivorUI.Notify("장비 획득: " .. SurvivorEquipment.Name(Entry(item).id) .. "\n확장 인벤토리에서 장착")
                        end
                    end
                end
            end
        end
        SurvivorEquipment.Reconcile(inventory.changed and ReadInventory() or inventory)
    end
    function SurvivorEquipment.DebugDrops()
        for i = 1, #catalog do SurvivorEquipment.DropAt(GetUnitX(hero) + (i - 3) * 45, GetUnitY(hero) + 60, i) end
    end
    -- Regression fixtures exercise ordinary-floor cleanup and protected rewards.
    function SurvivorEquipment.ClearGround()
        for item, record in pairs(owned) do
            if GetItemTypeId(item) == 0 then
                if record.pendingReward then TouchUI() end
                owned[item], locked[item], tooltipDirty[item], tooltipCache[item] = nil, nil, nil, nil
            elseif not record.pendingReward and not UnitHasItemBagged(hero, item) and not UnitHasItemEquipped(hero, item) then
                owned[item], locked[item], tooltipDirty[item], tooltipCache[item] = nil, nil, nil, nil
                RemoveItem(item)
            end
        end
    end
    function SurvivorEquipment.PrepareRest()
        if not hero then return end
        for item, record in pairs(owned) do
            if GetItemTypeId(item) ~= 0 and not UnitHasItemBagged(hero, item) and not UnitHasItemEquipped(hero, item) then
                record.restPickup = not record.noAuto
                SetItemPosition(item, GetUnitX(hero), GetUnitY(hero))
            end
        end
        SurvivorEquipment.CollectRest()
    end
    function SurvivorEquipment.CollectRest()
        if not hero then return end
        local inventory = ReadInventory()
        CollectPendingRewards(false, RunSession.GetElapsed(), inventory)
        for item, record in pairs(owned) do
            if GetItemTypeId(item) == 0 then
                if record.pendingReward then TouchUI() end
                owned[item], locked[item], tooltipDirty[item], tooltipCache[item] = nil, nil, nil, nil
            elseif inventory.bagged[item] or inventory.equipped[item] then
                Received(item, record)
            elseif record.restPickup and inventory.count < inventory.capacity and CanAutoPick(item, record, inventory) then
                TryPickup(item, record, inventory)
            end
        end
        return SurvivorEquipment.Reconcile(inventory.changed and ReadInventory() or inventory)
    end
    function SurvivorEquipment.CarryGroundToStage()
        for item, record in pairs(owned) do
            if GetItemTypeId(item) ~= 0 and not UnitHasItemBagged(hero, item) and not UnitHasItemEquipped(hero, item) then
                SetItemPosition(item, GetUnitX(hero), GetUnitY(hero))
                record.expires = RunSession.GetElapsed() + SurvivorConfig.equipmentGroundLifetime
                record.carried, record.restPickup, record.retry = false, false, RunSession.GetElapsed() + 3
            end
        end
    end
    function SurvivorEquipment.Cleanup()
        if eventTrigger ~= nil then DestroyTrigger(eventTrigger); eventTrigger = nil end
        for item in pairs(owned) do owned[item] = nil; RemoveItem(item) end
        owned, lastSlots, lastBag = {}, {}, {}
        equippedIds, descriptionCache, tooltipDirty = {}, {}, {}
        tooltipCache, lastBagCapacity, lastPendingCount = setmetatable({}, {__mode = "k"}), nil, nil
        locked, pickupMode = {}, 1
        hero, build, dryKills, bonusesDirty, allTooltipsDirty, currentStage = nil, nil, 0, true, true, 1
        TouchUI()
    end
end
