-- Level-up weapons/trinkets are owned skills, separate from physical dropped gear.
-- Derived stats are rebuilt from levels and equipment bonuses, never incrementally stacked.
SurvivorAugments = {}
do
    local icons = [[ReplaceableTextures\CommandButtons\]]
    local order = {"firebolt", "flamefield", "chainlightning", "orbitblade", "monsoon", "frontslash", "frostshard", "frostnova", "blizzard", "meteor", "thunderorb", "returnblade",
        "power", "haste", "velocity", "magnitude", "reach", "longevity", "multicast", "vitality", "renewal", "stride"}
    local catalog = {
        firebolt = {kind = "weapon", name = "잿불 화살", icon = icons .. "BTNFireBolt.blp",
            text = "추적 투사체 · 지상·공중"},
        flamefield = {kind = "weapon", name = "잿불 발자취", icon = icons .. "BTNWallOfFire.blp",
            text = "발밑 장판 · 지상"},
        chainlightning = {kind = "weapon", name = "연쇄 번개", icon = icons .. "BTNChainLightning.blp",
            text = "연쇄 공격 · 지상·공중"},
        orbitblade = {kind = "weapon", name = "순찰자의 칼날", icon = icons .. "BTNWhirlwind.blp",
            text = "회전 칼날 · 지상"},
        monsoon = {kind = "weapon", name = "폭풍의 부름", icon = icons .. "BTNMonsoon.blp",
            text = "낙뢰 · 지상·공중"},
        frontslash = {kind = "weapon", name = "그림자 베기", icon = icons .. "BTNCleavingAttack.blp",
            text = "전방 부채꼴 · 지상"},
        frostshard = {kind = "weapon", name = "서리 화살", icon = icons .. "BTNColdArrows.blp",
            text = "관통·둔화 투사체 · 지상·공중"},
        frostnova = {kind = "weapon", name = "서리 폭발", icon = icons .. "BTNGlacier.blp", text = "무작위 적 위치에 냉기 폭발·둔화 · 지상·공중"},
        blizzard = {kind = "weapon", name = "묘역의 눈보라", icon = icons .. "BTNBlizzard.blp", text = "적 위치에 눈보라·둔화 · 지상·공중"},
        meteor = {kind = "weapon", name = "잿불 낙성", icon = icons .. "BTNInfernal.blp", text = "적 위치에 운석·잔불 · 지상·공중"},
        thunderorb = {kind = "weapon", name = "폭풍 구슬", icon = icons .. "BTNLightningShield.blp", text = "전진 후 머무는 지속 타격 구체 · 지상·공중"},
        returnblade = {kind = "weapon", name = "귀환 칼날", icon = icons .. "BTNGlaiveThrower.blp", text = "왕복 칼날 · 구간별 1회 타격 · 지상"},
        power = {kind = "trinket", name = "힘의 인장", icon = icons .. "BTNGauntletsOfOgrePower.blp",
            text = "모든 무기 피해 증가", statName = "모든 무기 피해", amount = 0.10},
        haste = {kind = "trinket", name = "신속의 인장", icon = icons .. "BTNGlove.blp",
            text = "모든 무기 쿨다운 감소", statName = "모든 무기 쿨다운", amount = 0.10},
        velocity = {kind = "trinket", name = "가속의 인장", icon = icons .. "BTNBootsOfSpeed.blp",
            text = "투사체 속도 증가", statName = "투사체 속도", amount = 0.20},
        magnitude = {kind = "trinket", name = "확대의 인장", icon = icons .. "BTNOrbOfFire.blp",
            text = "모든 무기 크기 증가", statName = "모든 무기 크기", amount = 0.15},
        reach = {kind = "trinket", name = "추적의 인장", icon = icons .. "BTNCrystalBall.blp",
            text = "모든 무기 사정거리 증가", statName = "모든 무기 사정거리", amount = 0.15},
        longevity = {kind = "trinket", name = "지속의 인장", icon = icons .. "BTNAnkh.blp",
            text = "모든 무기 지속시간 증가", statName = "모든 무기 지속시간", amount = 0.20},
        multicast = {kind = "trinket", name = "잔향의 인장", icon = icons .. "BTNWand.blp",
            text = "모든 무기에 추가 공격 발동"},
        vitality = {kind = "trinket", name = "불굴의 인장", icon = icons .. "BTNPeriapt1.blp",
            text = "최대 생명력 증가", statName = "최대 생명력", amount = 60, unit = ""},
        renewal = {kind = "trinket", name = "회복의 인장", icon = icons .. "BTNRingSkull.blp",
            text = "생명력 재생 증가", statName = "생명력 재생", amount = 1, unit = "/초"},
        stride = {kind = "trinket", name = "발걸음의 인장", icon = icons .. "BTNBoots.blp",
            text = "이동 속도 증가", statName = "이동 속도", amount = 12, unit = ""},
        recovery = {kind = "recovery", name = "회복", icon = icons .. "BTNPotionGreenSmall.blp",
            text = "최대 생명력의 30%를 회복합니다."},
    }
    local flavor = {
        firebolt = "끝까지 놓치지 않는 순찰자의 잿불.",
        flamefield = "뒤따르는 추격자에게 남기는 경고.",
        meteor = "막힌 길을 열어젖히는 붉은 낙성.",
        chainlightning = "한 번 붙잡은 흔적은 다음으로 이어진다.",
        monsoon = "고요한 하늘에도 응답은 남아 있다.",
        thunderorb = "사라진 파수꾼의 경계는 아직 끝나지 않았다.",
        orbitblade = "포위 속에서도 한 걸음의 틈을 남긴다.",
        frontslash = "앞을 막은 그림자를 베어 길을 연다.",
        returnblade = "멀리 떠난 칼날도 주인에게 돌아온다.",
        frostshard = "차가운 화살은 도주하는 발을 붙든다.",
        frostnova = "남은 흔적을 따라 냉기가 터져 나온다.",
        blizzard = "잊힌 묘역의 겨울이 다시 깨어난다.",
        power = "긴 수색을 버틸 힘을 새긴 인장.",
        haste = "망설임보다 빠르게 움직이기 위해.",
        velocity = "놓치기 전에 닿아야 한다.",
        magnitude = "좁은 틈을 넓은 길로 바꾸는 힘.",
        reach = "보이지 않는 흔적에도 닿을 수 있도록.",
        longevity = "한순간의 결심을 오래 붙들어 둔다.",
        multicast = "한 번의 결심이 여러 번 울린다.",
        vitality = "무너진 뒤에도 남아 있는 의지.",
        renewal = "다시 일어나 다음 흔적을 좇는다.",
        stride = "돌아갈 곳이 없어도, 향할 곳은 있다.",
    }
    for id, text in pairs(flavor) do catalog[id].flavor = text end
    local elements = {firebolt = "화염", flamefield = "화염", meteor = "화염",
        chainlightning = "번개", monsoon = "번개", thunderorb = "번개",
        orbitblade = "칼날", frontslash = "칼날", returnblade = "칼날",
        frostshard = "얼음", frostnova = "얼음", blizzard = "얼음"}
    for id, element in pairs(elements) do catalog[id].element = element end
    local multiCounts, multiDamage = {1, 1, 2, 2, 2}, {0.30, 0.45, 0.30, 0.40, 0.50}
    -- Each max-level weapon chooses one permanent branch without another equipment requirement.
    local evolutions = {
        {"firebolt", "폭렬 화살", "발사 수 +2 · 피해 -15% · 적중 시 주변 140에 30% 폭발 피해(최대 12명)", {missileDamage = 0.85}, {missileCount = 2}},
        {"firebolt", "심판의 불꽃", "피해 +25% · 쿨다운 20% 증가 · 같은 적 연속 적중 시 피해 +15%씩 최대 60%(3초 유지)", {missileDamage = 1.25, missileInterval = 1.2}},
        {"flamefield", "불바다", "반경 +45% · 피해 -10%", {zoneRadius = 1.45, zoneDamage = 0.9}},
        {"flamefield", "지옥의 화로", "타격 간격 -35% · 반경 -15%", {zonePulse = 0.65, zoneRadius = 0.85}},
        {"chainlightning", "폭풍 그물", "연쇄 대상 +4 · 전이 거리 +35%", {chainJumpRange = 1.35}, {chainTargets = 4}},
        {"chainlightning", "뇌격", "피해 +100% · 연쇄 3명 고정 · 연쇄 증가 효과는 피해 배율로 전환", {chainDamage = 2}, {}, {chainTargets = 3}},
        {"orbitblade", "칼날 성좌", "칼날 +2 · 3초마다 바깥으로 퍼졌다가 돌아옴(최대 반경 165%)", {}, {bladeCount = 2}},
        {"orbitblade", "그림자 호위", "전방에 칼날을 모아 왕복 베기 · 후방 노출 · 타격 간격 -40% · 반경 -20%", {bladeHitInterval = 0.6, bladeRadius = 0.8}},
        {"monsoon", "폭풍 전선", "낙뢰 +2회 · 타격 반경 +20%", {monsoonRadius = 1.2}, {monsoonCount = 2}},
        {"monsoon", "천벌", "피해 +300% · 낙뢰 1회 고정 · 횟수 증가 효과는 피해 배율로 전환", {monsoonDamage = 4}, {}, {monsoonCount = 1}},
        {"frontslash", "반월참", "각도 180도 · 베기 거리 +35%", {slashRange = 1.35}, {}, {slashAngle = 180}},
        {"frontslash", "집중 일섬", "피해 +100% · 각도 60도 고정", {slashDamage = 2}, {}, {slashAngle = 60}},
        {"frostshard", "빙하 관통", "관통 +4 · 크기 +25% · 둔화된 적 처치 시 파편 3개(35% 피해) · 파편 연쇄 생성 없음", {frostHitRadius = 1.25, frostScale = 1.25}, {frostPierce = 4}},
        {"frostshard", "서리 창", "피해 +140% · 관통 1명 · 같은 적 3회 적중 시 빙결 0.8초(보스 0.35초/면역 8초)", {frostDamage = 2.4}, {}, {frostPierce = 1}},
        {"frostnova", "혹한의 고리", "반경 +40% · 둔화 지속 +50%", {radius = 1.4, duration = 1.5}},
        {"frostnova", "빙결 파동", "쿨다운 40% 감소 · 반경 -15%", {interval = 0.6, radius = 0.85}},
        {"blizzard", "백색 폭풍", "반경 +40% · 지속 +30%", {radius = 1.4, duration = 1.3}},
        {"blizzard", "우박 세례", "피해 +50% · 타격 간격 -20% · 반경 -20%", {damage = 1.5, pulse = 0.8, radius = 0.8}},
        {"meteor", "재앙의 운석", "충돌·잔불 피해 +80% · 쿨다운 20% 증가", {damage = 1.8, interval = 1.2}},
        {"meteor", "잿불 분화구", "반경 +40% · 잔불 지속 +100%", {radius = 1.4, duration = 2}},
        {"thunderorb", "뇌운 구체", "반경 +45% · 지속 +50% · 투사체 속도 -25%", {radius = 1.45, duration = 1.5, speed = 0.75}},
        {"thunderorb", "과부하", "타격 간격 -40% · 피해 +20%", {pulse = 0.6, damage = 1.2}},
        {"returnblade", "윤회 칼날", "지속 +80% · 투사체 속도 +20%", {duration = 1.8, speed = 1.2}},
        {"returnblade", "거인 절단검", "피해 +70% · 타격 크기 +50% · 투사체 속도 -20%", {damage = 1.7, radius = 1.5, size = 1.5, speed = 0.8}},
    }
    for i, definition in ipairs(evolutions) do
        local weapon, id = definition[1], "evolution" .. i
        catalog[id] = {kind = "evolution", weapon = weapon, name = definition[2], text = definition[3],
            icon = catalog[weapon].icon, element = catalog[weapon].element,
            multiply = definition[4], add = definition[5] or {}, set = definition[6] or {}}
        order[#order + 1] = id
    end
    local missilePower = {1, 1.25, 1.5, 1.875, 2.25}
    local missileCount = {1, 1, 2, 2, 3}
    local zonePower = {1, 1.3, 1.6, 2, 2.5}
    local zoneRadius = {1, 1, 1.15, 1.15, 1.3}
    local zoneDuration = {0, 0, 0, 1, 1}
    local chainPower = {1, 1.3, 1.6, 1.9, 2.3}
    local chainTargets = {3, 4, 5, 6, 7}
    local bladePower = {1, 1.3, 1.6, 2, 2.5}
    local bladeCount = {2, 2, 3, 3, 4}
    local monsoonPower, monsoonCount = {1, 1.3, 1.6, 1.9, 2.3}, {1, 1, 2, 2, 3}
    local slashPower = {1, 1.3, 1.6, 2, 2.5}
    local frostPower, frostPierce = {1, 1.3, 1.6, 2, 2.5}, {2, 3, 3, 4, 5}
    local bonusKeys = {
        set = {ember = true, storm = true, frost = true, blade = true},
        all = {damagePct = true, speedPct = true, areaPct = true, moveSpeed = true, extraProjectiles = true, duration = true, maxLife = true,
            projectileSpeedPct = true, projectileSizePct = true, projectileRangePct = true, projectileDurationPct = true},
        firebolt = {damagePct = true, speedPct = true, areaPct = true, extraProjectiles = true},
        flamefield = {damagePct = true, speedPct = true, areaPct = true, duration = true},
        chainlightning = {damagePct = true, speedPct = true, areaPct = true},
        orbitblade = {damagePct = true, speedPct = true, areaPct = true},
        monsoon = {damagePct = true, speedPct = true, areaPct = true, extraStrikes = true},
        frontslash = {damagePct = true, speedPct = true, areaPct = true, angle = true},
        frostshard = {damagePct = true, speedPct = true, extraPierce = true, slowDuration = true},
    }

    for id in pairs(SurvivorConfig.extraWeapons) do
        bonusKeys[id] = {damagePct = true, speedPct = true, areaPct = true, duration = true, slowDuration = true}
    end
    function SurvivorAugments.Get(id) return catalog[id] end
    function SurvivorAugments.Level(build, id) return build.levels[id] or 0 end
    function SurvivorAugments.OwnedTooltip(id, build)
        local entry, stats = catalog[id], build.stats
        local level = SurvivorAugments.Level(build, id)
        local description = entry.text
        if id == "firebolt" then
            description = description .. string.format("\n피해 %.1f · 발사 수 %d\n쿨다운 %.2f초 · 탐색 거리 %.0f",
                stats.missileDamage, stats.missileCount, stats.missileInterval, stats.missileRange)
        elseif id == "flamefield" then
            description = description .. string.format("\n%.2f초마다 피해 %.1f · 반경 %.0f\n%.1f초 지속 · 쿨다운 %.2f초",
                stats.zonePulse, stats.zoneDamage, stats.zoneRadius, stats.zoneDuration, stats.zoneInterval)
        elseif id == "chainlightning" then
            description = description .. string.format("\n첫 피해 %.1f · 최대 %d명 · 쿨다운 %.2f초\n탐색 %.0f / 연쇄 %.0f · 전이마다 피해 -15%%",
                stats.chainDamage, stats.chainTargets, stats.chainInterval, stats.chainRange, stats.chainJumpRange)
        elseif id == "orbitblade" then
            description = description .. string.format("\n피해 %.1f · 칼날 %d개 · 궤도 반경 %.0f\n회전 %.2f초 · 칼날별 동일 대상 간격 %.2f초",
                stats.bladeDamage, stats.bladeCount, stats.bladeRadius, stats.bladePeriod, stats.bladeHitInterval)
                .. string.format("\n생성 쿨다운 %.2f초 · 유지 %.2f초 · 중첩", stats.bladeInterval, stats.bladeDuration)
        elseif id == "monsoon" then
            description = description .. string.format("\n피해 %.1f · 낙뢰 %d회 · 쿨다운 %.2f초\n탐색 거리 %.0f · 타격 반경 %.0f",
                stats.monsoonDamage, stats.monsoonCount, stats.monsoonInterval, stats.monsoonRange, stats.monsoonRadius)
        elseif id == "frontslash" then
            description = description .. string.format("\n피해 %.1f · 쿨다운 %.2f초\n전방 거리 %.0f · 각도 %.0f도",
                stats.slashDamage, stats.slashInterval, stats.slashRange, stats.slashAngle)
                .. string.format("\n판정 %.2f초 · 대상별 1회 타격", stats.slashDuration)
        elseif id == "frostshard" then
            description = description .. string.format("\n피해 %.1f · 최대 %d명 관통 · 쿨다운 %.2f초\n둔화 -%.0f%% · %.1f초",
                stats.frostDamage, stats.frostPierce, stats.frostInterval, stats.frostSlow * 100, stats.frostSlowDuration)
        elseif SurvivorConfig.extraWeapons[id] then
            local w = stats.extraWeapons[id]
            description = description .. string.format("\n피해 %.1f · 쿨다운 %.2f초\n범위 %.0f · 사정거리 %.0f · 지속 %.2f초", w.damage, w.interval, w.radius, w.range, w.duration)
            if id == "meteor" then description = description .. "\n잔불: 충돌 피해 20%/타격"
            elseif id == "returnblade" then description = description .. "\n귀환 후 남은 시간 동안 재발사" end
        elseif id == "multicast" then
            description = string.format("추가 공격 +%d회\n추가 공격 피해 %.0f%%",
                stats.multiCount, stats.multiDamage * 100)
        elseif id == "haste" then
            description = string.format("모든 무기 쿨다운 -%.1f%%", (1 - 1 / (1 + level * entry.amount)) * 100)
        elseif entry.kind == "trinket" then
            description = string.format("%s +%.0f%s", entry.statName,
                level * entry.amount * (entry.unit and 1 or 100), entry.unit or "%")
            if id == "velocity" and not SurvivorAugments.HasProjectileWeapon(build) then
                description = description .. "\n|cffffcc00현재 적용 무기 없음|r"
            end
        end
        if id == "firebolt" or id == "frostshard" then
            local speed, radius, range, life = stats.missileSpeed, stats.missileHitRadius, stats.missileRange, stats.missileLifetime
            if id == "frostshard" then speed, radius, range, life = stats.frostSpeed, stats.frostHitRadius, stats.frostRange, stats.frostLifetime end
            description = description .. string.format("\n투사체 속도 %.0f · 충돌 반경 %.0f\n최대 비행 %.0f · 최대 %.1f초", speed, radius, range, life)
        end
        local evolved = build.evolutions and build.evolutions[id]
        if evolved then description = description .. "\n|cffffcc00진화: " .. catalog[evolved].name .. "|r\n" .. catalog[evolved].text end
        if entry.kind == "weapon" and stats.multiCount > 0 then
            description = description .. string.format("\n다중: 추가 %d회 · 개별 피해 %.0f%%", stats.multiCount, stats.multiDamage * 100)
        end
        return description
    end
    local function EquipmentTotals(sources)
        local totals, ids = {}, {}
        for id in pairs(sources) do ids[#ids + 1] = id end
        table.sort(ids)
        for _, id in ipairs(ids) do
            for scope, modifiers in pairs(sources[id]) do
                totals[scope] = totals[scope] or {}
                for key, value in pairs(modifiers) do
                    totals[scope][key] = (totals[scope][key] or 0) + value
                end
            end
        end
        return totals
    end
    local function Bonus(build, scope, key)
        local values = build.equipmentTotals[scope]
        local talents = build.talentTotals and build.talentTotals[scope]
        return (values and values[key] or 0) + (talents and talents[key] or 0)
    end
    local function Calculate(build)
        if not build.equipmentTotals then
            build = {levels = build.levels, evolutions = build.evolutions,
                equipmentTotals = EquipmentTotals(build.equipmentBonuses), talentTotals = build.talentTotals}
        end
        local c, levels = SurvivorConfig, build.levels
        local fire, zone = levels.firebolt or 0, levels.flamefield or 0
        local chain, blade = levels.chainlightning or 0, levels.orbitblade or 0
        local storm, slash, frost = levels.monsoon or 0, levels.frontslash or 0, levels.frostshard or 0
        local power = (levels.power or 0) * catalog.power.amount + Bonus(build, "all", "damagePct")
        local speed = (levels.haste or 0) * catalog.haste.amount + Bonus(build, "all", "speedPct")
        local area = Bonus(build, "all", "areaPct")
        -- Cooldown affects every weapon; projectile speed changes flight only.
        local weaponSize = math.min(3, math.max(0.1, 1 + (levels.magnitude or 0) * catalog.magnitude.amount + Bonus(build, "all", "sizePct")))
        local weaponRange = math.max(0.1, 1 + (levels.reach or 0) * catalog.reach.amount + Bonus(build, "all", "rangePct"))
        local weaponLife = math.max(0.1, 1 + (levels.longevity or 0) * catalog.longevity.amount + Bonus(build, "all", "durationPct"))
        local projectileSpeed = math.max(0.1, 1 + (levels.velocity or 0) * catalog.velocity.amount + Bonus(build, "all", "projectileSpeedPct"))
        local projectileSize = math.min(3, math.max(0.1, 1 + (levels.magnitude or 0) * catalog.magnitude.amount + Bonus(build, "all", "projectileSizePct") + Bonus(build, "all", "sizePct")))
        local projectileRange = math.max(0.1, 1 + (levels.reach or 0) * catalog.reach.amount + Bonus(build, "all", "projectileRangePct") + Bonus(build, "all", "rangePct"))
        local projectileLife = math.max(0.1, 1 + (levels.longevity or 0) * catalog.longevity.amount + Bonus(build, "all", "projectileDurationPct") + Bonus(build, "all", "durationPct"))
        local result = {
            multiCount = multiCounts[levels.multicast or 0] or 0, multiDamage = multiDamage[levels.multicast or 0] or 0,
            missileEnabled = fire > 0, zoneEnabled = zone > 0,
            chainEnabled = chain > 0, bladeEnabled = blade > 0,
            monsoonEnabled = storm > 0, slashEnabled = slash > 0, frostEnabled = frost > 0,
            missileSpeed = math.min(4000, c.missileSpeed * projectileSpeed),
            missileScale = 0.8 * projectileSize, missileHitRadius = c.missileHitRadius * projectileSize,
            missileLifetime = math.min(20, c.missileLifetime * projectileLife),
            missileDamage = fire > 0 and c.missileDamage * missilePower[fire]
                * math.max(0.1, 1 + power + Bonus(build, "firebolt", "damagePct")) or 0,
            missileInterval = math.max(0.15, c.missileInterval / math.max(0.1, 1 + speed + Bonus(build, "firebolt", "speedPct"))),
            missileCount = fire > 0 and math.min(12, math.max(1, missileCount[fire]
                + math.floor(Bonus(build, "all", "extraProjectiles") + Bonus(build, "firebolt", "extraProjectiles")))) or 0,
            missileRange = math.min(2500, c.missileRange * projectileRange * math.max(0.1, 1 + area + Bonus(build, "firebolt", "areaPct"))),
            zoneDamage = zone > 0 and c.zoneDamage * zonePower[zone]
                * math.max(0.1, 1 + power + Bonus(build, "flamefield", "damagePct")) or 0,
            zoneInterval = math.max(0.5, c.zoneInterval / math.max(0.1, 1 + speed + Bonus(build, "flamefield", "speedPct"))),
            zonePulse = math.max(0.1, c.zonePulse),
            zoneRadius = math.min(900, c.zoneRadius * weaponSize * weaponRange * (zone > 0 and zoneRadius[zone] or 1)
                * math.max(0.1, 1 + area + Bonus(build, "flamefield", "areaPct"))),
            zoneDuration = math.max(0.5, (c.zoneDuration + (zone > 0 and zoneDuration[zone] or 0)
                + Bonus(build, "all", "duration") + Bonus(build, "flamefield", "duration")) * weaponLife),
            chainDamage = chain > 0 and c.chainDamage * chainPower[chain]
                * math.max(0.1, 1 + power + Bonus(build, "chainlightning", "damagePct")) or 0,
            chainTargets = chain > 0 and math.min(20, math.ceil(chainTargets[chain] * weaponLife)) or 0,
            chainInterval = math.max(0.4, c.chainInterval / math.max(0.1, 1 + speed + Bonus(build, "chainlightning", "speedPct"))),
            chainRange = math.min(2500, c.chainRange * weaponRange * math.max(0.1, 1 + area + Bonus(build, "chainlightning", "areaPct"))),
            chainJumpRange = math.min(1200, c.chainJumpRange * weaponSize * weaponRange * math.max(0.1, 1 + area + Bonus(build, "chainlightning", "areaPct"))),
            bladeDamage = blade > 0 and c.bladeDamage * bladePower[blade]
                * math.max(0.1, 1 + power + Bonus(build, "orbitblade", "damagePct")) or 0,
            bladeCount = blade > 0 and bladeCount[blade] or 0,
            bladeHitRadius = c.bladeHitRadius * weaponSize, bladeScale = 0.85 * weaponSize,
            bladeHitInterval = c.bladeHitInterval,
            bladeInterval = math.max(1, c.bladeInterval / math.max(0.1, 1 + speed + Bonus(build, "orbitblade", "speedPct"))),
            bladeDuration = c.bladeDuration * weaponLife,
            bladeRadius = math.min(450, c.bladeRadius * weaponRange * math.max(0.1, 1 + area + Bonus(build, "orbitblade", "areaPct"))),
            bladePeriod = math.max(0.6, c.bladePeriod),
            monsoonDamage = storm > 0 and c.monsoonDamage * monsoonPower[storm] * math.max(0.1, 1 + power + Bonus(build, "monsoon", "damagePct")) or 0,
            monsoonCount = storm > 0 and math.min(8, math.max(1, math.ceil((monsoonCount[storm] + math.floor(Bonus(build, "monsoon", "extraStrikes"))) * weaponLife))) or 0,
            monsoonInterval = math.max(0.5, c.monsoonInterval / math.max(0.1, 1 + speed + Bonus(build, "monsoon", "speedPct"))),
            monsoonDelay = 0.12, monsoonSpacing = 0.18,
            monsoonRange = math.min(2500, c.monsoonRange * weaponRange * math.max(0.1, 1 + area + Bonus(build, "monsoon", "areaPct"))),
            monsoonRadius = math.min(600, c.monsoonRadius * weaponSize * math.max(0.1, 1 + area + Bonus(build, "monsoon", "areaPct"))),
            slashDamage = slash > 0 and c.slashDamage * slashPower[slash] * math.max(0.1, 1 + power + Bonus(build, "frontslash", "damagePct")) or 0,
            slashInterval = math.max(0.3, c.slashInterval / math.max(0.1, 1 + speed + Bonus(build, "frontslash", "speedPct"))),
            slashScale = weaponSize, slashSweepTime = 0.24,
            slashDuration = math.max(0, 0.6 * (weaponLife - 1)),
            slashRange = math.min(750, c.slashRange * weaponSize * weaponRange * math.max(0.1, 1 + area + Bonus(build, "frontslash", "areaPct"))),
            slashAngle = math.min(180, math.max(20, c.slashAngle + math.max(0, slash - 1) * 10 + Bonus(build, "frontslash", "angle"))),
            frostDamage = frost > 0 and c.frostDamage * frostPower[frost] * math.max(0.1, 1 + power + Bonus(build, "frostshard", "damagePct")) or 0,
            frostPierce = frost > 0 and math.min(12, math.max(1, frostPierce[frost] + math.floor(Bonus(build, "frostshard", "extraPierce")))) or 0,
            frostInterval = math.max(0.25, c.frostInterval / math.max(0.1, 1 + speed + Bonus(build, "frostshard", "speedPct"))),
            frostSpeed = math.min(4000, c.frostSpeed * projectileSpeed), frostScale = projectileSize,
            frostRange = math.min(2500, c.frostRange * projectileRange), frostHitRadius = c.frostHitRadius * projectileSize,
            frostLifetime = math.min(20, c.frostLifetime * projectileLife), frostSlow = c.frostSlow,
            frostSlowDuration = math.max(0.1, (c.frostSlowDuration + Bonus(build, "frostshard", "slowDuration")) * weaponLife),
            moveSpeed = math.min(500, math.max(100, c.moveSpeed + Bonus(build, "all", "moveSpeed") + (levels.stride or 0) * catalog.stride.amount)),
            equipmentLife = math.floor(Bonus(build, "all", "maxLife") + (levels.vitality or 0) * catalog.vitality.amount),
            regeneration = c.heroRegeneration + (levels.renewal or 0) * catalog.renewal.amount + Bonus(build, "all", "regeneration"),
            sets = {ember = Bonus(build, "set", "ember") >= 1, storm = Bonus(build, "set", "storm") >= 1,
                frost = Bonus(build, "set", "frost") >= 1, blade = Bonus(build, "set", "blade") >= 1},
        }
        result.extraWeapons = {}
        for id, profile in pairs(c.extraWeapons) do
            local level = levels[id] or 0
            local size = math.max(0.1, weaponSize * (1 + area + Bonus(build, id, "areaPct")))
            result.extraWeapons[id] = {
                enabled = level > 0,
                damage = level > 0 and profile.damage * (1 + 0.35 * (level - 1)) * math.max(0.1, 1 + power + Bonus(build, id, "damagePct")) or 0,
                interval = math.max(0.5, profile.interval / math.max(0.1, 1 + speed + Bonus(build, id, "speedPct"))),
                radius = math.min(900, profile.radius * size * (id == "frostnova" and weaponRange or 1)),
                range = math.min(2500, profile.range * weaponRange), size = weaponSize,
                duration = math.min(20, math.max(0.1, profile.duration + Bonus(build, "all", "duration") + Bonus(build, id, "duration")) * weaponLife),
                speed = profile.speed * ((id == "thunderorb" or id == "returnblade") and projectileSpeed or 1),
                pulse = math.max(0.1, profile.pulse),
                slow = profile.slow, delay = 0.8,
                slowDurationBonus = Bonus(build, id, "slowDuration"),
            }
        end
        for weapon, id in pairs(build.evolutions or {}) do
            local entry = catalog[id]
            local target = result.extraWeapons[weapon] or result
            for key, value in pairs(entry.multiply) do target[key] = target[key] * value end
            for key, value in pairs(entry.add) do target[key] = target[key] + value end
            -- Fixed-count branches retain the value of duration/count bonuses as damage.
            if entry.set.chainTargets then target.chainDamage = target.chainDamage * target.chainTargets / chainTargets[levels.chainlightning] end
            if entry.set.monsoonCount then target.monsoonDamage = target.monsoonDamage * target.monsoonCount / monsoonCount[levels.monsoon] end
            for key, value in pairs(entry.set) do target[key] = value end
        end
        result.fireEvolution = build.evolutions and build.evolutions.firebolt
        result.bladeEvolution = build.evolutions and build.evolutions.orbitblade
        result.frostEvolution = build.evolutions and build.evolutions.frostshard
        return result
    end
    function SurvivorAugments.ApplyHeroRegeneration(hero, stats)
        -- Combat owns the pause flag; recalculation during a choice or equipment
        -- transaction must not restart native healing behind the paused UI.
        local rate = stats.nativeRegenerationPaused and 0 or stats.regeneration
        assert(BlzSetUnitRealField(hero, UNIT_RF_HIT_POINTS_REGENERATION_RATE, rate),
            "Could not update native hero regeneration")
    end
    local function ApplyHeroStats(build, hero)
        if hero ~= nil then
            SetUnitMoveSpeed(hero, build.stats.moveSpeed)
            SurvivorAugments.ApplyHeroRegeneration(hero, build.stats)
            local previous = build.appliedHero == hero and (build.appliedEquipmentLife or 0) or 0
            local nextBonus = build.stats.equipmentLife
            if previous ~= nextBonus then
                -- Preserve the hero's current max HP and life when adjusting gear bonuses.
                local life = GetWidgetLife(hero)
                local maximum = math.max(1, BlzGetUnitMaxHP(hero) - previous + nextBonus)
                BlzSetUnitMaxHP(hero, maximum)
                SetWidgetLife(hero, math.min(life, maximum))
            end
            build.appliedEquipmentLife = nextBonus
            build.appliedHero = hero
        end
    end
    function SurvivorAugments.Recalculate(build, hero)
        local derived = Calculate(build)
        -- Preserve this table's identity: combat holds the same stats reference.
        for key, value in pairs(derived) do build.stats[key] = value end
        build.revision = (build.revision or 0) + 1
        ApplyHeroStats(build, hero)
    end
    function SurvivorAugments.PreviewEquipment(build, sources)
        return Calculate({levels = build.levels, equipmentBonuses = sources, evolutions = build.evolutions, talentTotals = build.talentTotals})
    end
    function SurvivorAugments.SetTalents(build, choices, hero)
        local selected, totals, changed = {}, {all = {}}, false
        for tier, id in pairs(choices) do
            assert(type(tier) == "number" and tier % 1 == 0 and SurvivorConfig.talents.tiers[tier], "Invalid talent tier")
            local entry
            for _, candidate in ipairs(SurvivorConfig.talents.tiers[tier]) do if candidate.id == id then entry = candidate end end
            assert(entry, "Invalid talent choice")
            selected[tier] = id
            for key, value in pairs(entry.bonuses) do totals.all[key] = (totals.all[key] or 0) + value end
            if not build.talentChoices or build.talentChoices[tier] ~= id then changed = true end
        end
        for tier in pairs(build.talentChoices or {}) do if not selected[tier] then changed = true end end
        if not changed then return false end
        build.talentChoices, build.talentTotals = selected, totals
        SurvivorAugments.Recalculate(build, hero)
        return true
    end
    function SurvivorAugments.NewBuild(startingWeapon, startingTrinket)
        assert(SurvivorConfig.growthMaxLevel >= 1 and SurvivorConfig.growthMaxLevel <= 5, "Growth tables support levels 1..5")
        assert(SurvivorConfig.weaponSlots >= 1 and SurvivorConfig.weaponSlots <= 6
            and SurvivorConfig.trinketSlots >= 1 and SurvivorConfig.trinketSlots <= 6, "Growth UI supports 1..6 slots per category")
        local first = startingWeapon or SurvivorConfig.startingWeapon
        assert(catalog[first] and catalog[first].kind == "weapon", "Invalid starting weapon")
        local build = {levels = {[first] = 1}, weapons = {first}, trinkets = {}, stats = {}, equipmentBonuses = {},
            evolutions = {}, excluded = {}, excludesRemaining = SurvivorConfig.excludesPerRun}
        if startingTrinket then
            assert(catalog[startingTrinket] and catalog[startingTrinket].kind == "trinket", "Invalid starting trinket")
            build.levels[startingTrinket] = 1
            build.trinkets[1] = startingTrinket
        end
        SurvivorAugments.Recalculate(build)
        return build
    end
    function SurvivorAugments.HasProjectileWeapon(build)
        for _, id in ipairs(build.weapons) do
            if id == "firebolt" or id == "frostshard" or id == "thunderorb" or id == "returnblade" then return true end
        end
        return false
    end
    function SurvivorAugments.CanChoose(id, build)
        local entry = catalog[id]
        if not entry or entry.kind == "recovery" or build.excluded[id] then return false end
        if id == "velocity" and not SurvivorAugments.HasProjectileWeapon(build) then
            if #build.weapons >= SurvivorConfig.weaponSlots then return false end
            local future = false
            for _, weapon in ipairs({"firebolt", "frostshard", "thunderorb", "returnblade"}) do
                if not build.excluded[weapon] then future = true end
            end
            if not future then return false end
        end
        if entry.kind == "evolution" then
            return SurvivorAugments.Level(build, entry.weapon) == SurvivorConfig.growthMaxLevel and not build.evolutions[entry.weapon]
        end
        local level = SurvivorAugments.Level(build, id)
        if level > 0 then return level < SurvivorConfig.growthMaxLevel end
        if entry.kind == "weapon" then return #build.weapons < SurvivorConfig.weaponSlots end
        return #build.trinkets < SurvivorConfig.trinketSlots
    end
    function SurvivorAugments.Roll(build)
        local pool, fresh, upgrades, result = {}, {}, {}, {}
        for _, id in ipairs(order) do
            if SurvivorAugments.CanChoose(id, build) then
                pool[#pool + 1] = id
                if catalog[id].kind ~= "evolution" then
                    if SurvivorAugments.Level(build, id) == 0 then fresh[#fresh + 1] = id
                    else upgrades[#upgrades + 1] = id end
                end
            end
        end
        build.evolutionOffer = false
        build.choiceKinds = {}
        -- Offer both surviving branches of the first eligible weapon before random growth.
        for _, weapon in ipairs(build.weapons) do
            for _, id in ipairs(pool) do
                if catalog[id].kind == "evolution" and catalog[id].weapon == weapon then
                    result[#result + 1] = id
                    build.evolutionOffer = true
                end
            end
            if build.evolutionOffer then break end
        end
        for i = #pool, 1, -1 do
            for _, id in ipairs(result) do if pool[i] == id then table.remove(pool, i); break end end
        end
        if #pool == 0 and #result == 0 then return {"recovery"} end
        if not build.evolutionOffer then
            local function Guaranteed(candidates, kind)
                if #candidates == 0 then return end
                local id = candidates[GetRandomInt(1, #candidates)]
                result[#result + 1] = id
                build.choiceKinds[#result] = kind
                for i, value in ipairs(pool) do if value == id then table.remove(pool, i); break end end
            end
            Guaranteed(upgrades, "upgrade")
            Guaranteed(fresh, "new")
        end
        while #result < 3 and #pool > 0 do result[#result + 1] = table.remove(pool, GetRandomInt(1, #pool)) end
        return result
    end
    local function RerollPool(build, offers, index)
        if type(index) ~= "number" or index % 1 ~= 0 or index < 1 or index > 3
            or offers == nil or offers[index] == nil or offers[index] == "recovery" then return {} end
        local excluded, pool = {}, {}
        -- Keep the other cards, and never replace a card with itself.
        for _, id in ipairs(offers) do excluded[id] = true end
        for _, id in ipairs(order) do
            local kind = build.choiceKinds and build.choiceKinds[index]
            local level = SurvivorAugments.Level(build, id)
            if not excluded[id] and SurvivorAugments.CanChoose(id, build)
                and (not kind or catalog[id].kind ~= "evolution" and (kind == "new" and level == 0 or kind == "upgrade" and level > 0)) then
                pool[#pool + 1] = id
            end
        end
        return pool
    end
    function SurvivorAugments.CanReroll(build, offers, index)
        return #RerollPool(build, offers, index) > 0
    end
    function SurvivorAugments.Reroll(build, offers, index)
        local pool = RerollPool(build, offers, index)
        if #pool == 0 then return false end
        offers[index] = pool[GetRandomInt(1, #pool)]
        return true
    end
    function SurvivorAugments.CanExclude(build, offers, index)
        local id = offers and offers[index]
        return build.excludesRemaining > 0 and id ~= nil and id ~= "recovery"
            and (catalog[id].kind == "evolution" or SurvivorAugments.Level(build, id) == 0)
    end
    function SurvivorAugments.Exclude(build, offers, index)
        if not SurvivorAugments.CanExclude(build, offers, index) then return false end
        build.excluded[offers[index]] = true
        build.excludesRemaining = build.excludesRemaining - 1
        if not SurvivorAugments.Reroll(build, offers, index) then
            -- Fall back only when exclusion exhausts this card's category.
            if build.choiceKinds then build.choiceKinds[index] = nil end
            if not SurvivorAugments.Reroll(build, offers, index) then
                table.remove(offers, index)
                if build.choiceKinds then
                    for i = index, 3 do build.choiceKinds[i] = build.choiceKinds[i + 1] end
                end
            end
        end
        if #offers == 0 then offers[1] = "recovery" end
        return true
    end
    function SurvivorAugments.ChoiceLabel(id, build)
        local entry, level = catalog[id], SurvivorAugments.Level(build, id)
        if entry.kind == "recovery" then return "남은 성장 후보 없음" end
        if entry.kind == "evolution" then return "|cffffcc00" .. catalog[entry.weapon].name .. " 진화 · 택 1|r" end
        local kind = entry.kind == "weapon" and "무기" or "장신구"
        if level == 0 then return "|cff80ff80신규 " .. kind .. " · Lv.1|r" end
        return "|cffffdd7d" .. kind .. " 강화 · Lv." .. level .. " → " .. (level + 1) .. "|r"
    end
    local function Delta(label, before, after, decimals, suffix)
        local fmt = "%." .. (decimals or 0) .. "f"
        suffix = suffix or ""
        return label .. " " .. string.format(fmt, before) .. suffix .. " → |cff80ff80"
            .. string.format(fmt, after) .. suffix .. "|r"
    end
    function SurvivorAugments.Preview(id, build)
        if id == "recovery" then return "생명력 30% 회복\n무기·장신구 슬롯을 사용하지 않습니다." end
        local entry = catalog[id]
        if entry.kind == "evolution" then return "진화 선택 후 변경 불가" end
        if id == "multicast" then
            local level = SurvivorAugments.Level(build, id) + 1
            return Delta("추가 공격", build.stats.multiCount, multiCounts[level]) .. "\n"
                .. Delta("추가 공격 피해", build.stats.multiDamage * 100, multiDamage[level] * 100, 0, "%")
        end
        if id == "haste" then
            local level = SurvivorAugments.Level(build, id)
            return Delta(entry.statName, (1 / (1 + level * entry.amount) - 1) * 100,
                (1 / (1 + (level + 1) * entry.amount) - 1) * 100, 1, "%")
        end
        if entry.kind == "trinket" then
            local amount = entry.amount * (entry.unit and 1 or 100)
            local before = SurvivorAugments.Level(build, id) * amount
            return Delta(entry.statName, before, before + amount, 0, entry.unit or "%")
                .. (id == "velocity" and not SurvivorAugments.HasProjectileWeapon(build)
                    and "\n|cffffcc00현재 적용 무기 없음|r" or "")
        end
        local preview = {levels = {}, equipmentBonuses = build.equipmentBonuses, evolutions = build.evolutions}
        for key, value in pairs(build.levels) do preview.levels[key] = value end
        preview.levels[id] = (preview.levels[id] or 0) + 1
        local old, new = build.stats, Calculate(preview)
        if SurvivorConfig.extraWeapons[id] then
            local a, b = old.extraWeapons[id], new.extraWeapons[id]
            return Delta("피해", a.damage, b.damage, 1) .. "\n" .. string.format("쿨다운 %.2f초 · 지속 %.1f초", b.interval, b.duration)
        elseif id == "firebolt" then
            return Delta("피해", old.missileDamage, new.missileDamage, 1) .. "\n"
                .. Delta("발사 수", old.missileCount, new.missileCount)
        elseif id == "flamefield" then
            if SurvivorAugments.Level(build, id) == 0 then
                return string.format("피해 %.1f / 반경 %.0f\n%.1f초 지속 · 쿨다운 %.2f초", new.zoneDamage, new.zoneRadius, new.zoneDuration, new.zoneInterval)
            end
            return Delta("피해", old.zoneDamage, new.zoneDamage, 1) .. "\n"
                .. Delta("반경", old.zoneRadius, new.zoneRadius) .. "\n"
                .. Delta("지속", old.zoneDuration, new.zoneDuration, 1, "초")
        elseif id == "chainlightning" then
            return Delta("첫 피해", old.chainDamage, new.chainDamage, 1) .. "\n"
                .. Delta("최대 대상", old.chainTargets, new.chainTargets) .. "\n대상별 1회 타격"
        elseif id == "orbitblade" then
            return Delta("피해", old.bladeDamage, new.bladeDamage, 1) .. "\n"
                .. Delta("칼날 수", old.bladeCount, new.bladeCount) .. "\n영웅과 함께 이동"
        elseif id == "monsoon" then
            return Delta("피해", old.monsoonDamage, new.monsoonDamage, 1) .. "\n"
                .. Delta("낙뢰 수", old.monsoonCount, new.monsoonCount)
        elseif id == "frontslash" then
            return Delta("피해", old.slashDamage, new.slashDamage, 1) .. "\n"
                .. Delta("베기 각도", old.slashAngle, new.slashAngle, 0, "도")
        elseif id == "frostshard" then
            return Delta("피해", old.frostDamage, new.frostDamage, 1) .. "\n"
                .. Delta("최대 관통", old.frostPierce, new.frostPierce) .. "\n이동 속도 30% 감소"
        end
        return entry.text
    end
    function SurvivorAugments.Apply(id, build, hero)
        if id == "recovery" then
            for _, candidate in ipairs(order) do
                assert(not SurvivorAugments.CanChoose(candidate, build), "Recovery only after all available growth ends")
            end
            SetWidgetLife(hero, math.min(BlzGetUnitMaxHP(hero), GetWidgetLife(hero) + BlzGetUnitMaxHP(hero) * 0.30))
            return
        end
        assert(SurvivorAugments.CanChoose(id, build), "Unavailable growth choice")
        if catalog[id].kind == "evolution" then
            build.evolutions[catalog[id].weapon] = id
            SurvivorAugments.Recalculate(build, hero)
            return
        end
        if SurvivorAugments.Level(build, id) == 0 then
            local list = catalog[id].kind == "weapon" and build.weapons or build.trinkets
            list[#list + 1] = id
        end
        build.levels[id] = SurvivorAugments.Level(build, id) + 1
        SurvivorAugments.Recalculate(build, hero)
    end

    -- The drop/equipment system submits a COMPLETE snapshot keyed by stable source ID.
    -- Example: { ["slot:ring1"] = {all = {damagePct = 0.10}},
    --            ["set:fire:2"] = {firebolt = {extraProjectiles = 1}} }
    -- Set bonuses can target one skill without granting an unowned weapon.
    -- Replacing with {} removes all gear bonuses; repeating a snapshot never stacks it.
    function SurvivorAugments.SetEquipmentBonuses(build, sources, hero)
        local snapshot = {}
        for sourceId, source in pairs(sources) do
            assert(type(sourceId) == "string" and type(source) == "table", "Invalid equipment source")
            local copy = {}
            for scope, modifiers in pairs(source) do
                assert(bonusKeys[scope] ~= nil, "Unknown bonus scope")
                assert(type(modifiers) == "table", "Invalid modifier list")
                copy[scope] = {}
                for key, value in pairs(modifiers) do
                    assert(bonusKeys[scope][key] and type(value) == "number" and value == value and math.abs(value) < math.huge, "Invalid equipment modifier")
                    copy[scope][key] = value
                end
            end
            snapshot[sourceId] = copy
        end
        local totals = EquipmentTotals(snapshot)
        local previous = build.equipmentTotals or EquipmentTotals(build.equipmentBonuses)
        local function Equal(a, b)
            for scope, modifiers in pairs(a) do
                for key, value in pairs(modifiers) do
                    if math.abs(value - (b[scope] and b[scope][key] or 0)) > 0.000000000001 then return false end
                end
            end
            return true
        end
        build.equipmentBonuses = snapshot
        if Equal(totals, previous) and Equal(previous, totals) then
            build.equipmentTotals = previous
            if hero ~= nil and build.appliedHero ~= hero then ApplyHeroStats(build, hero) end
            return false
        end
        build.equipmentTotals = totals
        SurvivorAugments.Recalculate(build, hero)
        return true
    end
end
