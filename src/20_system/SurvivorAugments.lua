-- Level-up weapons/trinkets are owned skills, separate from physical dropped gear.
-- Derived stats are rebuilt from levels and equipment bonuses, never incrementally stacked.
SurvivorAugments = {}
do
    local icons = [[ReplaceableTextures\CommandButtons\]]
    local order = {"firebolt", "flamefield", "chainlightning", "orbitblade", "monsoon", "frontslash", "frostshard", "frostnova", "blizzard", "meteor", "thunderorb", "returnblade",
        "plaguedart", "plaguetrail", "corrosion", "plaguepool", "deathcoil", "soulchain", "wraithguard", "shadowscythe",
        "plaguejar", "catalyst", "boilingflask", "acidvials",
        "power", "haste", "velocity", "magnitude", "reach", "longevity", "multicast", "vitality", "renewal", "stride", "armor"}
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
        blizzard = {kind = "weapon", name = "납골당의 눈보라", icon = icons .. "BTNBlizzard.blp", text = "적 위치에 눈보라·둔화 · 지상·공중"},
        meteor = {kind = "weapon", name = "잿불 낙성", icon = icons .. "BTNInfernal.blp", text = "적 위치에 운석·잔불 · 지상·공중"},
        thunderorb = {kind = "weapon", name = "폭풍 구슬", icon = icons .. "BTNLightningShield.blp", text = "전진 후 머무는 지속 타격 구체 · 지상·공중"},
        returnblade = {kind = "weapon", name = "귀환 칼날", icon = icons .. "BTNGlaiveThrower.blp", text = "왕복 칼날 · 구간별 1회 타격 · 지상"},
        plaguedart = {kind = "weapon", name = "역병 침", icon = icons .. "BTNEnvenomedSpear.blp", text = "관통 투사체·중독 · 지상·공중"},
        plaguetrail = {kind = "weapon", name = "역병 발자취", icon = icons .. "BTNPlagueCloud.blp", text = "발밑 독구름·중독 · 지상"},
        corrosion = {kind = "weapon", name = "부식의 숨결", icon = icons .. "BTNCorrosiveBreath.blp", text = "전방 부채꼴·중독 · 지상"},
        plaguepool = {kind = "weapon", name = "역병 웅덩이", icon = icons .. "BTNOrbOfVenom.blp", text = "포물선 투척 후 독 웅덩이·중독·둔화 · 지상·공중"},
        deathcoil = {kind = "weapon", name = "죽음의 고리", icon = icons .. "BTNDeathCoil.blp", text = "추적 투사체·저주 · 지상·공중"},
        soulchain = {kind = "weapon", name = "영혼 사슬", icon = icons .. "BTNCurse.blp", text = "연쇄 공격·저주 · 지상·공중"},
        wraithguard = {kind = "weapon", name = "망령의 호위", icon = icons .. "BTNUnholyFrenzy.blp", text = "회전 망령·저주 대상 추가 피해 · 지상"},
        shadowscythe = {kind = "weapon", name = "그림자 낫", icon = icons .. "BTNDarkRitual.blp", text = "왕복 낫·저주 · 지상"},
        plaguejar = {kind = "weapon", name = "역병 단지", icon = icons .. "BTNAcidBomb.blp", text = "포물선 투척 범위·반응·중독 잔여물 · 지상·공중"},
        catalyst = {kind = "weapon", name = "휘발성 촉매", icon = icons .. "BTNTransmute.blp", text = "무작위 적 위치 폭발·강한 반응 · 지상·공중"},
        boilingflask = {kind = "weapon", name = "끓어오르는 플라스크", icon = icons .. "BTNHealingSpray.blp", text = "전진 후 머무는 구체·반응 · 지상·공중"},
        acidvials = {kind = "weapon", name = "산성 약병 산포", icon = icons .. "BTNChemicalRage.blp", text = "무작위 포물선 투척·반응 · 지상·공중"},
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
        armor = {kind = "trinket", name = "수호의 인장", icon = icons .. "BTNHumanArmorUpOne.blp",
            text = "방어력 증가", statName = "방어력", amount = 2, unit = ""},
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
        blizzard = "얼어붙은 납골당의 겨울이 다시 깨어난다.",
        plaguedart = "작은 상처 하나면 충분하다.",
        plaguetrail = "지나간 자리마다 역병이 남는다.",
        corrosion = "숨 한 번에 갑옷도 살도 무르게 녹는다.",
        plaguepool = "던진 약병이 깨지면 땅이 앓기 시작한다.",
        deathcoil = "죽음은 망설이는 자부터 고른다.",
        soulchain = "끊어진 영혼은 다음 영혼을 붙든다.",
        wraithguard = "저주받은 자에게 망령은 더 가까이 다가선다.",
        shadowscythe = "낫은 거둔 것을 주인에게 되돌린다.",
        plaguejar = "봉인을 깨면 실험은 시작된다.",
        catalyst = "한 방울로 고여 있던 독을 깨운다.",
        boilingflask = "끓어 넘친 약액은 식을 줄 모른다.",
        acidvials = "흩뿌린 약병마다 다른 실험 결과.",
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
        armor = "무너진 성벽 대신 스스로를 지킨다.",
    }
    for id, text in pairs(flavor) do catalog[id].flavor = text end
    for id, weapon in pairs(SurvivorConfig.weapons) do
        assert(catalog[id] and catalog[id].kind == "weapon", "Registered weapon missing from catalog " .. id)
        catalog[id].element, catalog[id].hero = weapon.element, weapon.hero
    end
    local multiCounts, multiDamage = {1, 1, 2, 2, 2, 3, 3}, {0.30, 0.45, 0.30, 0.40, 0.50, 0.35, 0.45}
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
        -- Putress. Element 7 adjusts status: poison/curse add stacks, reactionMul multiplies,
        -- other keys set flags read by combat. mode reuses an Anya engine branch.
        {"plaguedart", "역병 산탄", "발사 수 +2 · 피해 -15% · 관통 +2", {frostDamage = 0.85}, {frostCount = 2, frostPierce = 2}},
        {"plaguedart", "괴사 주입", "피해 +100% · 관통 1명 · 중독 +4스택", {frostDamage = 2}, {}, {frostPierce = 1}, {poison = 4}},
        {"plaguetrail", "역병 행렬", "반경 +45% · 피해 -10%", {zoneRadius = 1.45, zoneDamage = 0.9}},
        {"plaguetrail", "농축 독무", "타격 간격 -35% · 반경 -15% · 중독 +1스택", {zonePulse = 0.65, zoneRadius = 0.85}, {}, {}, {poison = 1}},
        {"corrosion", "부식 폭풍", "각도 180도 · 거리 +35%", {slashRange = 1.35}, {}, {slashAngle = 180}},
        {"corrosion", "녹아내림", "피해 +100% · 각도 60도 고정 · 중독 +2스택", {slashDamage = 2}, {}, {slashAngle = 60}, {poison = 2}},
        {"plaguepool", "늪지 범람", "반경 +40% · 지속 +30%", {radius = 1.4, duration = 1.3}},
        {"plaguepool", "맹독 샘", "피해 +50% · 타격 간격 -20% · 반경 -20%", {damage = 1.5, pulse = 0.8, radius = 0.8}},
        {"deathcoil", "망자의 합창", "발사 수 +2 · 피해 -15% · 저주 +1스택", {missileDamage = 0.85}, {missileCount = 2}, {}, {curse = 1}},
        {"deathcoil", "최후의 선고", "피해 +80% · 쿨다운 20% 증가 · 저주 3스택 대상 피해 +60%", {missileDamage = 1.8, missileInterval = 1.2}, {}, {}, {maxCurseBonus = 0.6}},
        {"soulchain", "망령의 그물", "연쇄 대상 +4 · 전이 거리 +35%", {chainJumpRange = 1.35}, {chainTargets = 4}},
        {"soulchain", "영혼 착취", "피해 +100% · 연쇄 3명 고정 · 저주 +1스택 · 연쇄 증가 효과는 피해 배율로 전환", {chainDamage = 2}, {}, {chainTargets = 3}, {curse = 1}},
        {"wraithguard", "망령 군단", "망령 +2 · 3초마다 바깥으로 퍼졌다가 돌아옴(최대 반경 165%)", {}, {bladeCount = 2}, {}, {}, "evolution7"},
        {"wraithguard", "수의 칼날", "전방에 망령을 모아 왕복 베기 · 후방 노출 · 타격 간격 -40% · 반경 -20%", {bladeHitInterval = 0.6, bladeRadius = 0.8}, {}, {}, {}, "evolution8"},
        {"shadowscythe", "수확의 원", "지속 +80% · 투사체 속도 +20%", {duration = 1.8, speed = 1.2}},
        {"shadowscythe", "사신의 낫", "피해 +70% · 타격 크기 +50% · 투사체 속도 -20%", {damage = 1.7, radius = 1.5, size = 1.5, speed = 0.8}},
        {"plaguejar", "연쇄 폭발", "착탄 후 주변 2곳에 작은 단지(피해 40%)", {}, {}, {}, {splitJars = 2}},
        {"plaguejar", "대역병", "반경 +40% · 잔여물 지속 +100%", {radius = 1.4, duration = 2}},
        {"catalyst", "불안정 혼합물", "쿨다운 40% 감소 · 반경 -15%", {interval = 0.6, radius = 0.85}},
        {"catalyst", "임계 반응", "반응 시 중독 전부 소모 · 소모 스택당 피해 +30%", {}, {}, {}, {reactionAll = true, reactionMul = 1.3}},
        {"boilingflask", "증기 구름", "반경 +45% · 지속 +50% · 투사체 속도 -25%", {radius = 1.45, duration = 1.5, speed = 0.75}},
        {"boilingflask", "과열", "타격 간격 -40% · 피해 +20%", {pulse = 0.6, damage = 1.2}},
        {"acidvials", "약병 폭우", "약병 +2개 · 범위 +20%", {monsoonRadius = 1.2}, {monsoonCount = 2}},
        {"acidvials", "농축 산성", "피해 +300% · 약병 1개 고정 · 개수 증가 효과는 피해 배율로 전환", {monsoonDamage = 4}, {}, {monsoonCount = 1}},
    }
    for i, definition in ipairs(evolutions) do
        local weapon, id = definition[1], "evolution" .. i
        catalog[id] = {kind = "evolution", weapon = weapon, name = definition[2], text = definition[3],
            icon = catalog[weapon].icon, element = catalog[weapon].element,
            multiply = definition[4], add = definition[5] or {}, set = definition[6] or {},
            status = definition[7] or {}, mode = definition[8]}
        order[#order + 1] = id
    end
    -- Growth tables cover levels 1..7; the seventh level unlocks evolution.
    local missilePower = {1, 1.25, 1.5, 1.875, 2.25, 2.6, 3}
    local missileCount = {1, 1, 2, 2, 3, 3, 4}
    local zonePower = {1, 1.3, 1.6, 2, 2.5, 2.9, 3.4}
    local zoneRadius = {1, 1, 1.15, 1.15, 1.3, 1.3, 1.45}
    local zoneDuration = {0, 0, 0, 1, 1, 1, 1.5}
    local chainPower = {1, 1.3, 1.6, 1.9, 2.3, 2.6, 3}
    local chainTargets = {3, 4, 5, 6, 7, 8, 9}
    local bladePower = {1, 1.3, 1.6, 2, 2.5, 2.9, 3.4}
    local bladeCount = {2, 2, 3, 3, 4, 4, 5}
    local monsoonPower, monsoonCount = {1, 1.3, 1.6, 1.9, 2.3, 2.6, 3}, {1, 1, 2, 2, 3, 3, 4}
    local slashPower = {1, 1.3, 1.6, 2, 2.5, 2.9, 3.4}
    local frostPower, frostPierce = {1, 1.3, 1.6, 2, 2.5, 2.9, 3.4}, {2, 3, 3, 4, 5, 5, 6}
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
    for id in pairs(SurvivorConfig.weaponBases) do
        bonusKeys[id] = {damagePct = true, speedPct = true, areaPct = true, duration = true, extraProjectiles = true,
            extraStrikes = true, extraPierce = true, angle = true}
    end

    for id in pairs(SurvivorConfig.extraWeapons) do
        bonusKeys[id] = {damagePct = true, speedPct = true, areaPct = true, duration = true, slowDuration = true}
    end
    function SurvivorAugments.Get(id) return catalog[id] end
    function SurvivorAugments.Level(build, id) return build.levels[id] or 0 end
    -- Trailing zeros are dropped so 30.0 reads as 30 and 2.40 as 2.4.
    local function StatNumber(value, decimals)
        local text = string.format("%." .. decimals .. "f", value)
        if decimals > 0 then text = (text:gsub("0+$", ""):gsub("%.$", "")) end
        return text
    end
    -- Rows are {label, value, decimals, suffix}; zero values are omitted rather than shown blank.
    local function StatLines(lines, rows)
        for _, row in ipairs(rows) do
            local value = row[2]
            if type(value) == "string" or value > 0 then
                if type(value) ~= "string" then value = StatNumber(value, row[3] or 0) .. (row[4] or "") end
                lines[#lines + 1] = "|cffffcc00" .. row[1] .. ":|r " .. value
            end
        end
    end
    -- Weapons list shared stats in a fixed order (count, damage, range, area, duration, cooldown),
    -- followed by weapon-specific stats and notes.
    local function WeaponTooltip(id, entry, stats)
        local kind, target = entry.text:match("^(.*) · (지상.*)$")
        assert(kind, "Weapon text must end with its target type")
        local hit = " (" .. target .. ")"
        local rows, notes
        local weapon = SurvivorConfig.weapons[id]
        local engine, v = weapon.engine, stats.views and stats.views[id] or stats
        if engine == "missile" then
            rows = {{"투사체 수", v.missileCount}, {"피해", v.missileDamage, 1, hit},
                {"거리", v.missileRange}, {"범위", v.missileHitRadius},
                {"지속 시간", v.missileLifetime, 2, "초"}, {"쿨다운", v.missileInterval, 2, "초"},
                {"투사체 속도", v.missileSpeed}}
        elseif engine == "zone" then
            rows = {{"피해", v.zoneDamage, 1, hit}, {"범위", v.zoneRadius},
                {"지속 시간", v.zoneDuration, 2, "초"}, {"쿨다운", v.zoneInterval, 2, "초"},
                {"타격 간격", v.zonePulse, 2, "초"}}
        elseif engine == "chain" then
            rows = {{"최대 대상", v.chainTargets}, {"피해", v.chainDamage, 1, hit},
                {"거리", v.chainRange}, {"쿨다운", v.chainInterval, 2, "초"},
                {"연쇄 거리", v.chainJumpRange}}
            notes = {"전이마다 피해 -15%"}
        elseif engine == "orbit" then
            rows = {{"투사체 수", v.bladeCount}, {"피해", v.bladeDamage, 1, hit},
                {"범위", v.bladeRadius}, {"지속 시간", v.bladeDuration, 2, "초"},
                {"쿨다운", v.bladeInterval, 2, "초"}, {"타격 간격", v.bladeHitInterval, 2, "초"}}
            notes = {id == "orbitblade" and "새 칼날은 기존 칼날과 중첩" or "새 망령은 기존 망령과 중첩"}
        elseif engine == "strike" then
            rows = {{weapon.thrown and "약병 수" or "낙뢰 수", v.monsoonCount}, {"피해", v.monsoonDamage, 1, hit},
                {"거리", v.monsoonRange}, {"범위", v.monsoonRadius}, {"쿨다운", v.monsoonInterval, 2, "초"}}
        elseif engine == "cone" then
            rows = {{"피해", v.slashDamage, 1, hit}, {"거리", v.slashRange},
                {"지속 시간", v.slashDuration, 2, "초"}, {"쿨다운", v.slashInterval, 2, "초"},
                {"각도", v.slashAngle, 0, "도"}}
            notes = {"대상별 1회 타격"}
        elseif engine == "pierce" then
            rows = {{"투사체 수", (v.frostCount or 1) > 1 and v.frostCount or 0},
                {"최대 관통", v.frostPierce}, {"피해", v.frostDamage, 1, hit},
                {"거리", v.frostRange}, {"범위", v.frostHitRadius},
                {"지속 시간", v.frostLifetime, 2, "초"}, {"쿨다운", v.frostInterval, 2, "초"},
                {"투사체 속도", v.frostSpeed}}
            if v.frostSlow > 0 then
                rows[#rows + 1] = {"둔화", string.format("-%.0f%% · %s초", v.frostSlow * 100, StatNumber(v.frostSlowDuration, 2))}
            end
        else
            local w = stats.extraWeapons[id]
            rows = {{"피해", w.damage, 1, hit}, {"거리", w.range}, {"범위", w.radius},
                {"지속 시간", w.duration, 2, "초"}, {"쿨다운", w.interval, 2, "초"}}
            if id == "meteor" then notes = {"잔불: 충돌 피해 20%/타격"}
            elseif id == "plaguejar" then notes = {"잔여물: 충돌 피해 20%/타격"}
            elseif engine == "boomerang" then notes = {"귀환 후 남은 시간 동안 재발사"} end
        end
        local status = stats.status and stats.status[id]
        if status then
            rows[#rows + 1] = {"중독", status.poison, 0, "스택/타격"}
            rows[#rows + 1] = {"저주", status.curse, 0, "스택/타격"}
            rows[#rows + 1] = {"반응 피해", status.reaction * 100, 0, "%"}
            rows[#rows + 1] = {"저주 대상 추가 피해", status.cursedBonus * 100, 0, "%"}
            rows[#rows + 1] = {"귀환 시 저주 대상 추가 피해", status.returnBonus * 100, 0, "%"}
            if status.reaction > 0 then
                notes = notes or {}
                notes[#notes + 1] = status.reactionAll and "반응: 중독 전부 소모" or "반응: 중독 절반 소모"
            end
        end
        if stats.multiCount > 0 then
            rows[#rows + 1] = {"추가 공격", string.format("%d회 (개별 피해 %.0f%%)", stats.multiCount, stats.multiDamage * 100)}
        end
        local lines = {kind}
        StatLines(lines, rows)
        for _, note in ipairs(notes or {}) do lines[#lines + 1] = "※ " .. note end
        return table.concat(lines, "\n")
    end
    function SurvivorAugments.OwnedTooltip(id, build)
        local entry, stats = catalog[id], build.stats
        local level = SurvivorAugments.Level(build, id)
        local description = entry.text
        if entry.kind == "weapon" then
            description = WeaponTooltip(id, entry, stats)
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
        local evolved = build.evolutions and build.evolutions[id]
        if evolved then description = description .. "\n|cffffcc00진화: " .. catalog[evolved].name .. "|r\n" .. catalog[evolved].text end
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
    local bases = {}
    for id, overrides in pairs(SurvivorConfig.weaponBases) do
        bases[id] = setmetatable({}, {__index = function(_, key)
            local value = overrides[key]
            if value == nil then value = SurvivorConfig[key] end
            return value
        end})
    end
    local function Calculate(build)
        if not build.equipmentTotals then
            build = {levels = build.levels, evolutions = build.evolutions,
                equipmentTotals = EquipmentTotals(build.equipmentBonuses), talentTotals = build.talentTotals}
        end
        local c, levels = SurvivorConfig, build.levels
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
        -- Core engines: one formula set serves each engine's own weapon (flat on stats)
        -- and every other weapon on that engine (stats.views[id]).
        local function EngineFields(engine, id, level, b)
            local on = level > 0
            local damage = math.max(0.1, 1 + power + Bonus(build, id, "damagePct"))
            local haste = math.max(0.1, 1 + speed + Bonus(build, id, "speedPct"))
            local areaBonus = math.max(0.1, 1 + area + Bonus(build, id, "areaPct"))
            if engine == "missile" then
                return {missileEnabled = on,
                    missileSpeed = math.min(4000, b.missileSpeed * projectileSpeed),
                    missileScale = 0.8 * projectileSize, missileHitRadius = b.missileHitRadius * projectileSize,
                    missileLifetime = math.min(20, b.missileLifetime * projectileLife),
                    missileDamage = on and b.missileDamage * missilePower[level] * damage or 0,
                    missileInterval = math.max(0.15, b.missileInterval / haste),
                    missileCount = on and math.min(12, math.max(1, missileCount[level]
                        + math.floor(Bonus(build, "all", "extraProjectiles") + Bonus(build, id, "extraProjectiles")))) or 0,
                    missileRange = math.min(2500, b.missileRange * projectileRange * areaBonus)}
            elseif engine == "zone" then
                return {zoneEnabled = on,
                    zoneDamage = on and b.zoneDamage * zonePower[level] * damage or 0,
                    zoneInterval = math.max(0.5, b.zoneInterval / haste),
                    zonePulse = math.max(0.1, b.zonePulse),
                    zoneRadius = math.min(900, b.zoneRadius * weaponSize * weaponRange * (on and zoneRadius[level] or 1) * areaBonus),
                    zoneDuration = math.max(0.5, (b.zoneDuration + (on and zoneDuration[level] or 0)
                        + Bonus(build, "all", "duration") + Bonus(build, id, "duration")) * weaponLife)}
            elseif engine == "chain" then
                return {chainEnabled = on,
                    chainDamage = on and b.chainDamage * chainPower[level] * damage or 0,
                    chainTargets = on and math.min(20, math.ceil(chainTargets[level] * weaponLife)) or 0,
                    chainInterval = math.max(0.4, b.chainInterval / haste),
                    chainRange = math.min(2500, b.chainRange * weaponRange * areaBonus),
                    chainJumpRange = math.min(1200, b.chainJumpRange * weaponSize * weaponRange * areaBonus)}
            elseif engine == "orbit" then
                return {bladeEnabled = on,
                    bladeDamage = on and b.bladeDamage * bladePower[level] * damage or 0,
                    bladeCount = on and bladeCount[level] or 0,
                    bladeHitRadius = b.bladeHitRadius * weaponSize, bladeScale = 0.85 * weaponSize,
                    bladeHitInterval = b.bladeHitInterval,
                    bladeInterval = math.max(1, b.bladeInterval / haste),
                    bladeDuration = b.bladeDuration * weaponLife,
                    bladeRadius = math.min(450, b.bladeRadius * weaponRange * areaBonus),
                    bladePeriod = math.max(0.6, b.bladePeriod)}
            elseif engine == "strike" then
                return {monsoonEnabled = on,
                    monsoonDamage = on and b.monsoonDamage * monsoonPower[level] * damage or 0,
                    monsoonCount = on and math.min(8, math.max(1, math.ceil((monsoonCount[level]
                        + math.floor(Bonus(build, id, "extraStrikes"))) * weaponLife))) or 0,
                    monsoonInterval = math.max(0.5, b.monsoonInterval / haste),
                    monsoonDelay = 0.12, monsoonSpacing = 0.18,
                    monsoonRange = math.min(2500, b.monsoonRange * weaponRange * areaBonus),
                    monsoonRadius = math.min(600, b.monsoonRadius * weaponSize * areaBonus)}
            elseif engine == "cone" then
                return {slashEnabled = on,
                    slashDamage = on and b.slashDamage * slashPower[level] * damage or 0,
                    slashInterval = math.max(0.3, b.slashInterval / haste),
                    slashScale = weaponSize, slashSweepTime = 0.24,
                    slashDuration = math.max(0, 0.6 * (weaponLife - 1)),
                    slashRange = math.min(750, b.slashRange * weaponSize * weaponRange * areaBonus),
                    slashAngle = math.min(180, math.max(20, b.slashAngle + math.max(0, level - 1) * 10 + Bonus(build, id, "angle")))}
            end
            assert(engine == "pierce", "Unknown core engine")
            return {frostEnabled = on,
                frostDamage = on and b.frostDamage * frostPower[level] * damage or 0,
                frostPierce = on and math.min(12, math.max(1, frostPierce[level] + math.floor(Bonus(build, id, "extraPierce")))) or 0,
                frostInterval = math.max(0.25, b.frostInterval / haste),
                frostSpeed = math.min(4000, b.frostSpeed * projectileSpeed), frostScale = projectileSize,
                frostRange = math.min(2500, b.frostRange * projectileRange), frostHitRadius = b.frostHitRadius * projectileSize,
                frostLifetime = math.min(20, b.frostLifetime * projectileLife), frostSlow = b.frostSlow, frostCount = 1,
                frostSlowDuration = math.max(0.1, (b.frostSlowDuration + Bonus(build, id, "slowDuration")) * weaponLife)}
        end
        local result = {
            multiCount = multiCounts[levels.multicast or 0] or 0, multiDamage = multiDamage[levels.multicast or 0] or 0,
            moveSpeed = math.min(500, math.max(100, c.moveSpeed + Bonus(build, "all", "moveSpeed") + (levels.stride or 0) * catalog.stride.amount)),
            equipmentLife = math.floor(Bonus(build, "all", "maxLife") + (levels.vitality or 0) * catalog.vitality.amount),
            regeneration = c.heroRegeneration + (levels.renewal or 0) * catalog.renewal.amount + Bonus(build, "all", "regeneration"),
            armorBonus = (levels.armor or 0) * catalog.armor.amount,
            commonCooldownReduction = 1 - 1 / math.max(0.1, 1 + speed),
            -- ASde rows: only bonuses every weapon (or every projectile) receives.
            commonDamageBonus = power, commonAreaBonus = area,
            commonSizeBonus = weaponSize - 1, commonRangeBonus = weaponRange - 1,
            commonDurationBonus = weaponLife - 1, commonProjectileSpeedBonus = projectileSpeed - 1,
            sets = {ember = Bonus(build, "set", "ember") >= 1, storm = Bonus(build, "set", "storm") >= 1,
                frost = Bonus(build, "set", "frost") >= 1, blade = Bonus(build, "set", "blade") >= 1},
        }
        for engine, definition in pairs(c.weaponEngines) do
            if definition.weapon then
                local fields = EngineFields(engine, definition.weapon, levels[definition.weapon] or 0, c)
                for key, value in pairs(fields) do result[key] = value end
            end
        end
        result.views = {}
        for id, base in pairs(bases) do
            local weapon = c.weapons[id]
            local view = EngineFields(weapon.engine, id, levels[id] or 0, base)
            view.weaponId, view.model, view.thrown, view.lightning = id, weapon.model, weapon.thrown, weapon.lightning
            view.throwSpeed = weapon.thrown and projectileSpeed or nil
            result.views[id] = view
        end
        -- Putress status per owned weapon; evolutions below may adjust it.
        result.status = {}
        result.poisonDamage = c.status.poisonDamage * math.max(0.1, 1 + power)
        for id, weapon in pairs(c.weapons) do
            local level = levels[id] or 0
            if level > 0 and weapon.hero == "putress" then
                local function At(list) return list and list[level] or 0 end
                result.status[id] = {poison = At(weapon.poison), curse = At(weapon.curse), reaction = At(weapon.reaction),
                    cursedBonus = At(weapon.cursedBonus), returnBonus = At(weapon.returnBonus),
                    residuePoison = weapon.residuePoison or 0, maxCurseBonus = 0}
            end
        end
        result.extraWeapons = {}
        for id, profile in pairs(c.extraWeapons) do
            local level = levels[id] or 0
            local size = math.max(0.1, weaponSize * (1 + area + Bonus(build, id, "areaPct")))
            result.extraWeapons[id] = {
                enabled = level > 0,
                damage = level > 0 and profile.damage * (1 + 0.35 * (level - 1)) * math.max(0.1, 1 + power + Bonus(build, id, "damagePct")) or 0,
                interval = math.max(0.5, profile.interval / math.max(0.1, 1 + speed + Bonus(build, id, "speedPct"))),
                radius = math.min(900, profile.radius * size * (c.weapons[id].engine == "nova" and weaponRange or 1)),
                range = math.min(2500, profile.range * weaponRange), size = weaponSize,
                duration = math.min(20, math.max(0.1, profile.duration + Bonus(build, "all", "duration") + Bonus(build, id, "duration")) * weaponLife),
                speed = profile.speed * (c.weapons[id].projectile and projectileSpeed or 1),
                model = c.weapons[id].model, thrown = c.weapons[id].thrown,
                pulse = math.max(0.1, profile.pulse),
                slow = profile.slow, delay = 0.8,
                slowDurationBonus = Bonus(build, id, "slowDuration"),
            }
        end
        for weapon, id in pairs(build.evolutions or {}) do
            local entry = catalog[id]
            local target = result.extraWeapons[weapon] or result.views[weapon] or result
            for key, value in pairs(entry.multiply) do target[key] = target[key] * value end
            for key, value in pairs(entry.add) do target[key] = target[key] + value end
            -- Fixed-count branches retain the value of duration/count bonuses as damage.
            if entry.set.chainTargets then target.chainDamage = target.chainDamage * target.chainTargets / chainTargets[levels[weapon]] end
            if entry.set.monsoonCount then target.monsoonDamage = target.monsoonDamage * target.monsoonCount / monsoonCount[levels[weapon]] end
            for key, value in pairs(entry.set) do target[key] = value end
            if entry.mode then target.bladeEvolution = entry.mode end
            local status = result.status[weapon]
            for key, value in pairs(entry.status) do
                if key == "poison" or key == "curse" then status[key] = status[key] + value
                elseif key == "reactionMul" then status.reaction = status.reaction * value
                else status[key] = value end
            end
        end
        result.fireEvolution = build.evolutions and build.evolutions.firebolt
        result.bladeEvolution = build.evolutions and build.evolutions.orbitblade
        result.frostEvolution = build.evolutions and build.evolutions.frostshard
        return result
    end
    function SurvivorAugments.ApplyHeroRegeneration(hero, stats)
        -- Combat suppresses regeneration for full unit pauses and teardown.
        -- Interactive panels retain this rate for ASde and freeze HP separately.
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
            -- Native armor also mitigates scripted hits (normal damage type).
            local previousArmor = build.appliedHero == hero and (build.appliedArmor or 0) or 0
            if previousArmor ~= build.stats.armorBonus then
                BlzSetUnitArmor(hero, BlzGetUnitArmor(hero) - previousArmor + build.stats.armorBonus)
            end
            build.appliedArmor = build.stats.armorBonus
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
    function SurvivorAugments.NewBuild(startingWeapon, startingTrinket, heroId)
        assert(SurvivorConfig.growthMaxLevel >= 1 and SurvivorConfig.growthMaxLevel <= #chainTargets, "Growth tables support levels 1..7")
        assert(SurvivorConfig.weaponSlots >= 1 and SurvivorConfig.weaponSlots <= 6
            and SurvivorConfig.trinketSlots >= 1 and SurvivorConfig.trinketSlots <= 6, "Growth UI supports 1..6 slots per category")
        local first, owner = startingWeapon or SurvivorConfig.startingWeapon, heroId or SurvivorConfig.defaultHero
        assert(catalog[first] and catalog[first].kind == "weapon", "Invalid starting weapon")
        assert(catalog[first].hero == owner, "Starting weapon belongs to another hero")
        local build = {hero = owner, levels = {[first] = 1}, weapons = {first}, trinkets = {}, stats = {}, equipmentBonuses = {},
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
            if SurvivorConfig.weapons[id].projectile then return true end
        end
        return false
    end
    function SurvivorAugments.CanChoose(id, build)
        local entry = catalog[id]
        if not entry or entry.kind == "recovery" or build.excluded[id] then return false end
        local heroId = build.hero or SurvivorConfig.defaultHero
        if id == "velocity" and not SurvivorAugments.HasProjectileWeapon(build) then
            if #build.weapons >= SurvivorConfig.weaponSlots then return false end
            local future = false
            for weapon, profile in pairs(SurvivorConfig.weapons) do
                if profile.projectile and profile.hero == heroId and not build.excluded[weapon] then future = true end
            end
            if not future then return false end
        end
        -- Weapons and their evolutions belong to one hero; trinkets are shared.
        local owner = entry.kind == "evolution" and catalog[entry.weapon].hero or entry.hero
        if owner and owner ~= heroId then return false end
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
        local engine = SurvivorConfig.weapons[id].engine
        if SurvivorConfig.extraWeapons[id] then
            local a, b = old.extraWeapons[id], new.extraWeapons[id]
            return Delta("피해", a.damage, b.damage, 1) .. "\n" .. string.format("쿨다운 %.2f초 · 지속 %.1f초", b.interval, b.duration)
        end
        old, new = old.views and old.views[id] or old, new.views[id] or new
        if engine == "missile" then
            return Delta("피해", old.missileDamage, new.missileDamage, 1) .. "\n"
                .. Delta("발사 수", old.missileCount, new.missileCount)
        elseif engine == "zone" then
            if SurvivorAugments.Level(build, id) == 0 then
                return string.format("피해 %.1f / 반경 %.0f\n%.1f초 지속 · 쿨다운 %.2f초", new.zoneDamage, new.zoneRadius, new.zoneDuration, new.zoneInterval)
            end
            return Delta("피해", old.zoneDamage, new.zoneDamage, 1) .. "\n"
                .. Delta("반경", old.zoneRadius, new.zoneRadius) .. "\n"
                .. Delta("지속", old.zoneDuration, new.zoneDuration, 1, "초")
        elseif engine == "chain" then
            return Delta("첫 피해", old.chainDamage, new.chainDamage, 1) .. "\n"
                .. Delta("최대 대상", old.chainTargets, new.chainTargets) .. "\n대상별 1회 타격"
        elseif engine == "orbit" then
            return Delta("피해", old.bladeDamage, new.bladeDamage, 1) .. "\n"
                .. Delta(id == "orbitblade" and "칼날 수" or "망령 수", old.bladeCount, new.bladeCount) .. "\n영웅과 함께 이동"
        elseif engine == "strike" then
            return Delta("피해", old.monsoonDamage, new.monsoonDamage, 1) .. "\n"
                .. Delta(SurvivorConfig.weapons[id].thrown and "약병 수" or "낙뢰 수", old.monsoonCount, new.monsoonCount)
        elseif engine == "cone" then
            return Delta("피해", old.slashDamage, new.slashDamage, 1) .. "\n"
                .. Delta("베기 각도", old.slashAngle, new.slashAngle, 0, "도")
        elseif engine == "pierce" then
            return Delta("피해", old.frostDamage, new.frostDamage, 1) .. "\n"
                .. Delta("최대 관통", old.frostPierce, new.frostPierce)
                .. (new.frostSlow > 0 and "\n이동 속도 30% 감소" or "")
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
