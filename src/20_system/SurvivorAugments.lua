-- Level-up weapons/trinkets are owned skills, separate from physical dropped gear.
-- Derived stats are rebuilt from levels and equipment bonuses, never incrementally stacked.
SurvivorAugments = {}
do
    local icons = [[ReplaceableTextures\CommandButtons\]]
    local order = {"firebolt", "flamefield", "chainlightning", "orbitblade", "monsoon", "frontslash", "frostshard", "frostnova", "blizzard", "meteor", "thunderorb", "returnblade",
        "plaguedart", "plaguetrail", "corrosion", "plaguepool", "deathcoil", "soulchain", "wraithguard", "shadowscythe",
        "plaguejar", "catalyst", "boilingflask", "acidvials", "banshee", "shadowarcher", "plaguezombie", "experiment",
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
        meteor = {kind = "weapon", name = "잿불 낙성", icon = icons .. "BTNInfernal.blp", text = "적 위치에 운석 충돌 · 지상·공중"},
        thunderorb = {kind = "weapon", name = "폭풍 구슬", icon = icons .. "BTNLightningShield.blp", text = "적을 추적하는 구체·주변 1회 전이 · 지상·공중"},
        returnblade = {kind = "weapon", name = "귀환 칼날", icon = icons .. "BTNGlaiveThrower.blp", text = "왕복 칼날 · 구간별 1회 타격 · 지상"},
        plaguedart = {kind = "weapon", name = "역병 침", icon = icons .. "BTNEnvenomedSpear.blp", text = "관통 투사체·중독 · 지상·공중"},
        plaguetrail = {kind = "weapon", name = "역병 발자취", icon = icons .. "BTNPlagueCloud.blp", text = "발밑 독구름·중독 · 지상"},
        corrosion = {kind = "weapon", name = "부식의 숨결", icon = icons .. "BTNCorrosiveBreath.blp", text = "전방 부채꼴·중독 · 지상"},
        plaguepool = {kind = "weapon", name = "역병 웅덩이", icon = icons .. "BTNOrbOfVenom.blp", text = "포물선 투척 후 독 웅덩이·중독·둔화 · 지상·공중"},
        deathcoil = {kind = "weapon", name = "죽음의 고리", icon = icons .. "BTNDeathCoil.blp", text = "추적 투사체·저주 · 지상·공중"},
        soulchain = {kind = "weapon", name = "영혼 사슬", icon = icons .. "BTNCurse.blp", text = "연쇄 공격·저주 · 지상·공중"},
        wraithguard = {kind = "weapon", name = "망령의 호위", icon = icons .. "BTNUnholyFrenzy.blp", text = "회전 망령·저주 대상 추가 피해 · 지상"},
        shadowscythe = {kind = "weapon", name = "그림자 낫", icon = icons .. "BTNShadowStrike.blp", text = "왕복 낫·저주 · 지상"},
        plaguejar = {kind = "weapon", name = "역병 단지", icon = icons .. "BTNUnstableConcoction.blp", text = "낙하 단지·착탄 범위 폭발·중독·반응 · 지상·공중"},
        catalyst = {kind = "weapon", name = "휘발성 촉매", icon = icons .. "BTNRejuvenationPotion.blp", text = "무작위 적 위치 폭발·강한 반응 · 지상·공중"},
        boilingflask = {kind = "weapon", name = "끓어오르는 플라스크", icon = icons .. "BTNChemicalRage.blp", text = "적을 추적하는 구체·주변 1회 전이·반응 · 지상·공중"},
        acidvials = {kind = "weapon", name = "산성 약병 산포", icon = icons .. "BTNHealingSalve.blp", text = "여러 적 위치에 약병 낙하·반응 · 지상·공중"},
        banshee = {kind = "weapon", name = "울부짖는 밴시", icon = icons .. "BTNBanshee.blp", text = "밴시 소환·범위 비명·둔화 · 지상·공중"},
        shadowarcher = {kind = "weapon", name = "그림자 궁수", icon = icons .. "BTNSkeletonArcher.blp", text = "궁수 소환·원거리 집중 사격 · 지상·공중"},
        plaguezombie = {kind = "weapon", name = "역병 좀비", icon = icons .. "BTNGhoul.blp", text = "좀비 무리 소환·근접 중독 · 지상"},
        experiment = {kind = "weapon", name = "봉합 실험체", icon = icons .. "BTNAbomination.blp", text = "실험체 소환·범위 내려찍기 · 지상"},
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
        banshee = "사라진 이들의 목소리가 수색 길에 함께한다.",
        shadowarcher = "잊힌 순찰병의 화살은 아직 길을 지킨다.",
        plaguezombie = "실험이 끝나도 역병은 걸음을 멈추지 않는다.",
        experiment = "봉합한 육신에 마지막 명령을 새긴다.",
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
    -- The id is "<weapon>_<key>". multiply/add/set change stats.weapons[weapon] fields;
    -- status adjusts Putress status (poison/curse add stacks, reactionMul multiplies,
    -- other keys set flags read by combat). mode names a combat behaviour that
    -- SurvivorCombat reads from the weapon's evolution field (a weapon on the same
    -- engine may reuse its reference weapon's mode); modeValues holds that behaviour's
    -- numbers (stats.weapons[weapon].modeValues), and its damage counts for the weapon:
    --   burst: explosion radius, max targets, damage fraction of the hit
    --   focus: max stacks, damage per stack, stack duration (s)
    --   shatter: shard search range, shard count, damage fraction, retrigger cooldown (s),
    --     shard life (s), hit radius, slow duration (s) and model scale
    --   lance: hits on one enemy that freeze it, freeze duration (s)
    local evolutions = {
        {weapon = "firebolt", key = "burst", name = "폭렬 화살", text = "발사 수 +2 · 피해 -15% · 적중 시 주변 범위에 30% 폭발 피해(최대 12명)",
            multiply = {damage = 0.85}, add = {count = 2}, mode = "burst", modeValues = {radius = 140, targets = 12, damage = 0.30}},
        {weapon = "firebolt", key = "judgment", name = "심판의 불꽃", text = "피해 +25% · 쿨다운 20% 증가 · 같은 적 연속 적중 시 피해 +15%씩 최대 60%(3초 유지)",
            multiply = {damage = 1.25, interval = 1.2}, mode = "focus", modeValues = {stacks = 4, damage = 0.15, duration = 3}},
        {weapon = "flamefield", key = "inferno", name = "불바다", text = "반경 +45% · 피해 -10%", multiply = {radius = 1.45, damage = 0.9}},
        {weapon = "flamefield", key = "furnace", name = "지옥의 화로", text = "타격 간격 -35% · 반경 -15%", multiply = {pulse = 0.65, radius = 0.85}},
        {weapon = "chainlightning", key = "stormnet", name = "폭풍 그물", text = "연쇄 대상 +4 · 전이 거리 +35%",
            multiply = {jumpRange = 1.35}, add = {targets = 4}},
        {weapon = "chainlightning", key = "thunderbolt", name = "뇌격", text = "피해 +100% · 연쇄 3명 고정 · 연쇄 증가 효과는 피해 배율로 전환",
            multiply = {damage = 2}, set = {targets = 3}},
        {weapon = "orbitblade", key = "constellation", name = "칼날 성좌", text = "칼날 +2 · 3초마다 바깥으로 퍼졌다가 돌아옴(최대 반경 165%)",
            add = {count = 2}, mode = "pulse"},
        {weapon = "orbitblade", key = "guard", name = "그림자 호위", text = "전방에 칼날을 모아 왕복 베기 · 후방 노출 · 타격 간격 -40% · 반경 -20%",
            multiply = {hitInterval = 0.6, radius = 0.8}, mode = "guard"},
        {weapon = "monsoon", key = "stormfront", name = "폭풍 전선", text = "낙뢰 +2회 · 타격 반경 +20%", multiply = {radius = 1.2}, add = {count = 2}},
        {weapon = "monsoon", key = "wrath", name = "천벌", text = "피해 +300% · 낙뢰 1회 고정 · 횟수 증가 효과는 피해 배율로 전환",
            multiply = {damage = 4}, set = {count = 1}},
        {weapon = "frontslash", key = "crescent", name = "반월참", text = "각도 180도 · 베기 거리 +35%", multiply = {range = 1.35}, set = {angle = 180}},
        {weapon = "frontslash", key = "focus", name = "집중 일섬", text = "피해 +100% · 각도 60도 고정", multiply = {damage = 2}, set = {angle = 60}},
        {weapon = "frostshard", key = "glacier", name = "빙하 관통", text = "관통 +4 · 크기 +25% · 둔화된 적 처치 시 파편 3개(35% 피해) · 파편 연쇄 생성 없음",
            multiply = {hitRadius = 1.25, scale = 1.25}, add = {pierce = 4}, mode = "shatter",
            modeValues = {range = 450, targets = 3, damage = 0.35, cooldown = 0.12,
                life = 1.5, hitRadius = 28, slowDuration = 1, scale = 0.7}},
        {weapon = "frostshard", key = "lance", name = "서리 창", text = "피해 +140% · 관통 1명 · 같은 적 3회 적중 시 빙결 0.8초(보스 0.35초/면역 8초)",
            multiply = {damage = 2.4}, set = {pierce = 1}, mode = "lance", modeValues = {hits = 3, freeze = 0.8}},
        {weapon = "frostnova", key = "ring", name = "혹한의 고리", text = "반경 +40% · 둔화 지속 +50%", multiply = {radius = 1.4, duration = 1.5}},
        {weapon = "frostnova", key = "pulse", name = "빙결 파동", text = "쿨다운 40% 감소 · 반경 -15%", multiply = {interval = 0.6, radius = 0.85}},
        {weapon = "blizzard", key = "whiteout", name = "백색 폭풍", text = "반경 +40% · 지속 +30%", multiply = {radius = 1.4, duration = 1.3}},
        {weapon = "blizzard", key = "hail", name = "우박 세례", text = "피해 +50% · 타격 간격 -20% · 반경 -20%", multiply = {damage = 1.5, pulse = 0.8, radius = 0.8}},
        {weapon = "meteor", key = "cataclysm", name = "재앙의 운석", text = "충돌 피해 +80% · 쿨다운 20% 증가", multiply = {damage = 1.8, interval = 1.2}},
        {weapon = "meteor", key = "crater", name = "잿불 분화구", text = "반경 +40% · 충돌 피해 +40%", multiply = {radius = 1.4, damage = 1.4}},
        {weapon = "thunderorb", key = "cloud", name = "뇌운 구체", text = "반경 +45% · 지속 +50% · 투사체 속도 -25%",
            multiply = {radius = 1.45, duration = 1.5, speed = 0.75}},
        {weapon = "thunderorb", key = "overload", name = "과부하", text = "타격 간격 -40% · 피해 +20%", multiply = {pulse = 0.6, damage = 1.2}},
        {weapon = "returnblade", key = "cycle", name = "윤회 칼날", text = "지속 +80% · 투사체 속도 +20%", multiply = {duration = 1.8, speed = 1.2}},
        {weapon = "returnblade", key = "giant", name = "거인 절단검", text = "피해 +70% · 타격 크기 +50% · 투사체 속도 -20%",
            multiply = {damage = 1.7, radius = 1.5, size = 1.5, speed = 0.8}},
        {weapon = "plaguedart", key = "buckshot", name = "역병 산탄", text = "발사 수 +2 · 피해 -15% · 관통 +2",
            multiply = {damage = 0.85}, add = {count = 2, pierce = 2}},
        {weapon = "plaguedart", key = "necrosis", name = "괴사 주입", text = "피해 +100% · 관통 1명 · 중독 +4스택",
            multiply = {damage = 2}, set = {pierce = 1}, status = {poison = 4}},
        {weapon = "plaguetrail", key = "procession", name = "역병 행렬", text = "반경 +45% · 피해 -10%", multiply = {radius = 1.45, damage = 0.9}},
        {weapon = "plaguetrail", key = "miasma", name = "농축 독무", text = "타격 간격 -35% · 반경 -15% · 중독 +1스택",
            multiply = {pulse = 0.65, radius = 0.85}, status = {poison = 1}},
        {weapon = "corrosion", key = "storm", name = "부식 폭풍", text = "각도 180도 · 거리 +35%", multiply = {range = 1.35}, set = {angle = 180}},
        {weapon = "corrosion", key = "melt", name = "녹아내림", text = "피해 +100% · 각도 60도 고정 · 중독 +2스택",
            multiply = {damage = 2}, set = {angle = 60}, status = {poison = 2}},
        {weapon = "plaguepool", key = "flood", name = "늪지 범람", text = "반경 +40% · 지속 +30%", multiply = {radius = 1.4, duration = 1.3}},
        {weapon = "plaguepool", key = "venom", name = "맹독 샘", text = "피해 +50% · 타격 간격 -20% · 반경 -20%", multiply = {damage = 1.5, pulse = 0.8, radius = 0.8}},
        {weapon = "deathcoil", key = "chorus", name = "망자의 합창", text = "발사 수 +2 · 피해 -15% · 저주 +1스택",
            multiply = {damage = 0.85}, add = {count = 2}, status = {curse = 1}},
        {weapon = "deathcoil", key = "verdict", name = "최후의 선고", text = "피해 +80% · 쿨다운 20% 증가 · 저주 3스택 대상 피해 +60%",
            multiply = {damage = 1.8, interval = 1.2}, status = {maxCurseBonus = 0.6}},
        {weapon = "soulchain", key = "net", name = "망령의 그물", text = "연쇄 대상 +4 · 전이 거리 +35%", multiply = {jumpRange = 1.35}, add = {targets = 4}},
        {weapon = "soulchain", key = "harvest", name = "영혼 착취", text = "피해 +100% · 연쇄 3명 고정 · 저주 +1스택 · 연쇄 증가 효과는 피해 배율로 전환",
            multiply = {damage = 2}, set = {targets = 3}, status = {curse = 1}},
        {weapon = "wraithguard", key = "legion", name = "망령 군단", text = "망령 +2 · 3초마다 바깥으로 퍼졌다가 돌아옴(최대 반경 165%)",
            add = {count = 2}, mode = "pulse"},
        {weapon = "wraithguard", key = "shroud", name = "수의 칼날", text = "전방에 망령을 모아 왕복 베기 · 후방 노출 · 타격 간격 -40% · 반경 -20%",
            multiply = {hitInterval = 0.6, radius = 0.8}, mode = "guard"},
        {weapon = "shadowscythe", key = "circle", name = "수확의 원", text = "지속 +80% · 투사체 속도 +20%", multiply = {duration = 1.8, speed = 1.2}},
        {weapon = "shadowscythe", key = "reaper", name = "사신의 낫", text = "피해 +70% · 타격 크기 +50% · 투사체 속도 -20%",
            multiply = {damage = 1.7, radius = 1.5, size = 1.5, speed = 0.8}},
        {weapon = "plaguejar", key = "cascade", name = "연쇄 폭발", text = "착탄 후 주변 2곳에 작은 단지(피해 40%)", status = {splitJars = 2}},
        {weapon = "plaguejar", key = "pandemic", name = "대역병", text = "반경 +40% · 착탄 피해 +40%", multiply = {radius = 1.4, damage = 1.4}},
        {weapon = "catalyst", key = "unstable", name = "불안정 혼합물", text = "쿨다운 40% 감소 · 반경 -15%", multiply = {interval = 0.6, radius = 0.85}},
        {weapon = "catalyst", key = "critical", name = "임계 반응", text = "반응 시 중독 전부 소모 · 소모 스택당 피해 +30%",
            status = {reactionAll = true, reactionMul = 1.3}},
        {weapon = "boilingflask", key = "steam", name = "증기 구름", text = "반경 +45% · 지속 +50% · 투사체 속도 -25%",
            multiply = {radius = 1.45, duration = 1.5, speed = 0.75}},
        {weapon = "boilingflask", key = "overheat", name = "과열", text = "타격 간격 -40% · 피해 +20%", multiply = {pulse = 0.6, damage = 1.2}},
        {weapon = "acidvials", key = "deluge", name = "약병 폭우", text = "약병 +2개 · 범위 +20%", multiply = {radius = 1.2}, add = {count = 2}},
        {weapon = "acidvials", key = "concentrate", name = "농축 산성", text = "피해 +300% · 약병 1개 고정 · 개수 증가 효과는 피해 배율로 전환",
            multiply = {damage = 4}, set = {count = 1}},
        {weapon = "banshee", key = "chorus", name = "비명의 합창", text = "소환 수 +1 · 지속 +40%", multiply = {duration = 1.4}, add = {count = 1}},
        {weapon = "banshee", key = "lament", name = "혹한의 애가", text = "피해 +50% · 비명 반경 +40%", multiply = {damage = 1.5, radius = 1.4}},
        {weapon = "shadowarcher", key = "patrol", name = "잊힌 순찰대", text = "소환 수 +1 · 지속 +40%", multiply = {duration = 1.4}, add = {count = 1}},
        {weapon = "shadowarcher", key = "sniper", name = "침묵의 사수", text = "사격 간격 -30% · 피해 +30%", multiply = {pulse = 0.7, damage = 1.3}},
        {weapon = "plaguezombie", key = "march", name = "역병 행진", text = "소환 수 +1 · 지속 +40%", multiply = {duration = 1.4}, add = {count = 1}},
        {weapon = "plaguezombie", key = "colony", name = "괴사 군체", text = "피해 +50% · 중독 +2스택", multiply = {damage = 1.5}, status = {poison = 2}},
        {weapon = "experiment", key = "twin", name = "이중 실험", text = "소환 수 +1 · 피해 -20%", multiply = {damage = 0.8}, add = {count = 1}},
        {weapon = "experiment", key = "perfect", name = "완성된 괴물", text = "피해 +70% · 타격 반경 +30%", multiply = {damage = 1.7, radius = 1.3}},
    }
    local evolutionIds = {}
    for _, definition in ipairs(evolutions) do
        local weapon = definition.weapon
        local id = weapon .. "_" .. definition.key
        assert(catalog[weapon] and catalog[weapon].kind == "weapon" and not catalog[id], "Invalid evolution " .. id)
        catalog[id] = {kind = "evolution", weapon = weapon, name = definition.name, text = definition.text,
            icon = catalog[weapon].icon, element = catalog[weapon].element,
            multiply = definition.multiply or {}, add = definition.add or {}, set = definition.set or {},
            status = definition.status or {}, mode = definition.mode, modeValues = definition.modeValues}
        order[#order + 1] = id
        evolutionIds[weapon] = evolutionIds[weapon] or {}
        table.insert(evolutionIds[weapon], id)
    end
    for id in pairs(SurvivorConfig.weapons) do
        assert(evolutionIds[id] and #evolutionIds[id] == 2, "Every weapon needs two evolutions " .. id)
    end
    -- The weapon's two evolution ids in catalog order.
    function SurvivorAugments.Evolutions(weapon)
        local ids = assert(evolutionIds[weapon], "Unknown evolution weapon")
        return {ids[1], ids[2]}
    end
    -- Engine growth tables (SurvivorConfig.weaponEngines[engine].levels) cover levels 1..7;
    -- the seventh level unlocks evolution.
    local engines = SurvivorConfig.weaponEngines
    local bonusKeys = {
        set = {ember = true, storm = true, frost = true, blade = true, apothecary = true, gravewarden = true, apprentice = true,
            commander = true, bombardier = true, destroyer = true, tracker = true,
            pursuer = true, bulwark = true, mire = true, conductor = true},
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

    for id in pairs(SurvivorConfig.weaponProfiles) do
        bonusKeys[id] = {damagePct = true, speedPct = true, areaPct = true, duration = true, slowDuration = true}
    end
    -- Putress gear may also add poison stacks or reaction damage to one weapon.
    for id, weapon in pairs(SurvivorConfig.weapons) do
        if weapon.hero == "putress" then bonusKeys[id].poison, bonusKeys[id].reactionPct = true, true end
    end
    function SurvivorAugments.Get(id) return catalog[id] end
    -- Coloured school tag, e.g. "[독]" in green. labelled: use the gear wording (냉기).
    function SurvivorAugments.ElementTag(element, labelled)
        local school = SurvivorConfig.elements[element]
        return "|cff" .. school.color .. "[" .. (labelled and school.label or element) .. "]|r"
    end
    function SurvivorAugments.AttackTag(tag)
        local color = assert(SurvivorConfig.weaponTagColors[tag], "Unknown weapon tag color")
        return "|cff" .. color .. "[" .. tag .. "]|r"
    end
    function SurvivorAugments.WeaponTags(id)
        local weapon = assert(SurvivorConfig.weapons[id], "Unknown weapon tags")
        local tags = {SurvivorAugments.ElementTag(weapon.element, true)}
        for _, tag in ipairs(weapon.tags) do
            tags[#tags + 1] = SurvivorAugments.AttackTag(tag)
        end
        return table.concat(tags, " ")
    end
    function SurvivorAugments.Description(id)
        local entry = catalog[id]
        return entry.kind == "weapon" and SurvivorAugments.WeaponTags(id) .. "\n" .. entry.text or entry.text
    end
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
    -- followed by weapon-specific stats and notes. engines[name].rows(w, hit, weapon, id)
    -- returns the engine's rows and notes; hit is the target-type suffix for damage.
    function engines.missile.rows(w, hit)
        return {{"투사체 수", w.count}, {"피해", w.damage, 1, hit},
            {"거리", w.range}, {"범위", w.hitRadius},
            {"지속 시간", w.lifetime, 2, "초"}, {"쿨다운", w.interval, 2, "초"},
            {"투사체 속도", w.speed}}
    end
    function engines.zone.rows(w, hit)
        return {{"피해", w.damage, 1, hit}, {"범위", w.radius},
            {"지속 시간", w.duration, 2, "초"}, {"쿨다운", w.interval, 2, "초"},
            {"타격 간격", w.pulse, 2, "초"}}
    end
    function engines.chain.rows(w, hit)
        return {{"최대 대상", w.targets}, {"피해", w.damage, 1, hit},
            {"거리", w.range}, {"쿨다운", w.interval, 2, "초"},
            {"연쇄 거리", w.jumpRange}}, {"전이마다 피해 -15%"}
    end
    function engines.orbit.rows(w, hit, _, id)
        return {{"투사체 수", w.count}, {"피해", w.damage, 1, hit},
            {"범위", w.radius}, {"지속 시간", w.duration, 2, "초"},
            {"쿨다운", w.interval, 2, "초"}, {"타격 간격", w.hitInterval, 2, "초"}},
            {id == engines.orbit.weapon and "새 칼날은 기존 칼날과 중첩" or "새 망령은 기존 망령과 중첩"}
    end
    function engines.strike.rows(w, hit, weapon)
        return {{weapon.thrown and "약병 수" or "낙뢰 수", w.count}, {"피해", w.damage, 1, hit},
            {"거리", w.range}, {"범위", w.radius}, {"쿨다운", w.interval, 2, "초"}}
    end
    function engines.cone.rows(w, hit)
        return {{"피해", w.damage, 1, hit}, {"거리", w.range},
            {"지속 시간", w.duration, 2, "초"}, {"쿨다운", w.interval, 2, "초"},
            {"각도", w.angle, 0, "도"}}, {"대상별 1회 타격"}
    end
    function engines.pierce.rows(w, hit)
        local rows = {{"투사체 수", (w.count or 1) > 1 and w.count or 0},
            {"최대 관통", w.pierce}, {"피해", w.damage, 1, hit},
            {"거리", w.range}, {"범위", w.hitRadius},
            {"지속 시간", w.lifetime, 2, "초"}, {"쿨다운", w.interval, 2, "초"},
            {"투사체 속도", w.speed}}
        if w.slow > 0 then
            rows[#rows + 1] = {"둔화", string.format("-%.0f%% · %s초", w.slow * 100, StatNumber(w.slowDuration, 2))}
        end
        return rows
    end
    -- Profile engines share damage, range, area, duration (unless instant) and cooldown rows.
    local function ProfileRows(w, hit, instant)
        local rows = {{"피해", w.damage, 1, hit}, {"거리", w.range}, {"범위", w.radius}}
        if not instant then rows[#rows + 1] = {"지속 시간", w.duration, 2, "초"} end
        rows[#rows + 1] = {"쿨다운", w.interval, 2, "초"}
        return rows
    end
    function engines.nova.rows(w, hit) return ProfileRows(w, hit) end
    function engines.field.rows(w, hit) return ProfileRows(w, hit) end
    function engines.meteor.rows(w, hit) return ProfileRows(w, hit, true) end
    function engines.summon.rows(w, hit)
        local rows = ProfileRows(w, hit)
        rows[#rows + 1] = {"소환 수", math.min(w.cap, w.count)}
        rows[#rows + 1] = {"소환 상한", w.cap}
        rows[#rows + 1] = {"공격 간격", w.pulse, 2, "초"}
        return rows
    end
    function engines.orb.rows(w, hit)
        return ProfileRows(w, hit),
            {string.format("전이: 피해 %.0f%% · 주변 적 1명 · 간격 %.1f초 · 재전이 없음", w.chainFraction * 100, w.chainInterval)}
    end
    function engines.boomerang.rows(w, hit) return ProfileRows(w, hit), {"귀환 후 남은 시간 동안 재발사"} end
    local function WeaponRows(id, entry, stats)
        local kind, target = entry.text:match("^(.*) · (지상.*)$")
        assert(kind, "Weapon text must end with its target type")
        local weapon = SurvivorConfig.weapons[id]
        local rows, notes = engines[weapon.engine].rows(stats.weapons[id], " (" .. target .. ")", weapon, id)
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
        return rows, notes, kind
    end
    local function WeaponTooltip(id, entry, stats)
        local rows, notes, kind = WeaponRows(id, entry, stats)
        local lines = {SurvivorAugments.WeaponTags(id), kind}
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
    -- Core-engine weapon bases: the engine base with any secondary weapon's overrides.
    local bases = {}
    for id, weapon in pairs(SurvivorConfig.weapons) do
        local engine = SurvivorConfig.weaponEngines[weapon.engine]
        if not engine.profile then
            local base = {}
            for key, value in pairs(engine.base) do base[key] = value end
            for key, value in pairs(SurvivorConfig.weaponBases[id] or {}) do base[key] = value end
            bases[id] = base
        end
    end
    -- Engine growth: engines[name].fields(g, id, level, base) builds stats.weapons[id] from
    -- the weapon's base (core) or weaponProfiles entry (profile). g is one Calculate call's
    -- growth context: the build plus its shared multipliers.
    -- Core engines also scale damage, cooldown and area by the weapon's own bonuses.
    local function CoreScales(g, id)
        return math.max(0.1, 1 + g.power + Bonus(g.build, id, "damagePct")),
            math.max(0.1, 1 + g.speed + Bonus(g.build, id, "speedPct")),
            math.max(0.1, 1 + g.area + Bonus(g.build, id, "areaPct"))
    end
    function engines.missile.fields(g, id, level, b)
        local on, grow = level > 0, engines.missile.levels
        local damageScale, haste, areaBonus = CoreScales(g, id)
        return {enabled = on,
            speed = math.min(4000, b.speed * g.projectileSpeed),
            scale = 0.8 * g.projectileSize, hitRadius = b.hitRadius * g.projectileSize,
            lifetime = math.min(20, b.lifetime * g.projectileLife),
            damage = on and b.damage * grow.power[level] * damageScale or 0,
            interval = math.max(0.15, b.interval / haste),
            count = on and math.min(12, math.max(1, grow.count[level]
                + math.floor(Bonus(g.build, "all", "extraProjectiles") + Bonus(g.build, id, "extraProjectiles")))) or 0,
            range = math.min(2500, b.range * g.projectileRange * areaBonus)}
    end
    function engines.zone.fields(g, id, level, b)
        local on, grow = level > 0, engines.zone.levels
        local damageScale, haste, areaBonus = CoreScales(g, id)
        return {enabled = on,
            damage = on and b.damage * grow.power[level] * damageScale or 0,
            interval = math.max(0.5, b.interval / haste),
            pulse = math.max(0.1, b.pulse),
            radius = math.min(900, b.radius * g.weaponSize * g.weaponRange * (on and grow.radius[level] or 1) * areaBonus),
            duration = math.max(0.5, (b.duration + (on and grow.duration[level] or 0)
                + Bonus(g.build, "all", "duration") + Bonus(g.build, id, "duration")) * g.weaponLife)}
    end
    function engines.chain.fields(g, id, level, b)
        local on, grow = level > 0, engines.chain.levels
        local damageScale, haste, areaBonus = CoreScales(g, id)
        return {enabled = on,
            damage = on and b.damage * grow.power[level] * damageScale or 0,
            targets = on and math.min(20, math.ceil(grow.targets[level] * g.weaponLife)) or 0,
            interval = math.max(0.4, b.interval / haste),
            range = math.min(2500, b.range * g.weaponRange * areaBonus),
            jumpRange = math.min(1200, b.jumpRange * g.weaponSize * g.weaponRange * areaBonus)}
    end
    function engines.orbit.fields(g, id, level, b)
        local on, grow = level > 0, engines.orbit.levels
        local damageScale, haste, areaBonus = CoreScales(g, id)
        return {enabled = on,
            damage = on and b.damage * grow.power[level] * damageScale or 0,
            count = on and grow.count[level] or 0,
            hitRadius = b.hitRadius * g.weaponSize, scale = 0.85 * g.weaponSize,
            hitInterval = b.hitInterval,
            interval = math.max(1, b.interval / haste),
            duration = b.duration * g.weaponLife,
            radius = math.min(450, b.radius * g.weaponRange * areaBonus),
            period = math.max(0.6, b.period)}
    end
    function engines.strike.fields(g, id, level, b)
        local on, grow = level > 0, engines.strike.levels
        local damageScale, haste, areaBonus = CoreScales(g, id)
        return {enabled = on,
            damage = on and b.damage * grow.power[level] * damageScale or 0,
            count = on and math.min(8, math.max(1, math.ceil((grow.count[level]
                + math.floor(Bonus(g.build, id, "extraStrikes"))) * g.weaponLife))) or 0,
            interval = math.max(0.5, b.interval / haste),
            delay = 0.12, spacing = 0.18,
            range = math.min(2500, b.range * g.weaponRange * areaBonus),
            radius = math.min(600, b.radius * g.weaponSize * areaBonus)}
    end
    function engines.cone.fields(g, id, level, b)
        local on, grow = level > 0, engines.cone.levels
        local damageScale, haste, areaBonus = CoreScales(g, id)
        return {enabled = on,
            damage = on and b.damage * grow.power[level] * damageScale or 0,
            interval = math.max(0.3, b.interval / haste),
            scale = g.weaponSize, sweepTime = 0.24,
            duration = math.max(0, 0.6 * (g.weaponLife - 1)),
            range = math.min(750, b.range * g.weaponSize * g.weaponRange * areaBonus),
            angle = math.min(180, math.max(20, b.angle + math.max(0, level - 1) * 10 + Bonus(g.build, id, "angle")))}
    end
    function engines.pierce.fields(g, id, level, b)
        local on, grow = level > 0, engines.pierce.levels
        local damageScale, haste = CoreScales(g, id)
        return {enabled = on,
            damage = on and b.damage * grow.power[level] * damageScale or 0,
            pierce = on and math.min(12, math.max(1, grow.pierce[level] + math.floor(Bonus(g.build, id, "extraPierce")))) or 0,
            interval = math.max(0.25, b.interval / haste),
            speed = math.min(4000, b.speed * g.projectileSpeed), scale = g.projectileSize,
            range = math.min(2500, b.range * g.projectileRange), hitRadius = b.hitRadius * g.projectileSize,
            lifetime = math.min(20, b.lifetime * g.projectileLife), slow = b.slow, count = 1,
            slowDuration = math.max(0.1, (b.slowDuration + Bonus(g.build, id, "slowDuration")) * g.weaponLife)}
    end
    -- Profile engines: shared growth from each weapon's weaponProfiles entry.
    local function ProfileFields(g, id, level, profile)
        local weapon = SurvivorConfig.weapons[id]
        local engine = engines[weapon.engine]
        local size = math.max(0.1, g.weaponSize * (1 + g.area + Bonus(g.build, id, "areaPct")))
        return {
            enabled = level > 0,
            damage = level > 0 and profile.damage * (1 + 0.35 * (level - 1)) * math.max(0.1, 1 + g.power + Bonus(g.build, id, "damagePct")) or 0,
            interval = math.max(0.5, profile.interval / math.max(0.1, 1 + g.speed + Bonus(g.build, id, "speedPct"))),
            radius = math.min(900, profile.radius * size * (engine.radiusRange and g.weaponRange or 1)),
            range = math.min(2500, profile.range * g.weaponRange), size = g.weaponSize,
            duration = math.min(20, math.max(0.1, profile.duration + Bonus(g.build, "all", "duration") + Bonus(g.build, id, "duration")) * g.weaponLife),
            speed = profile.speed * (weapon.projectile and g.projectileSpeed or 1),
            summonKind = weapon.summonKind,
            count = profile.count and math.min(profile.cap, profile.count + (profile.countGrowth or 1) * math.floor(math.max(0, level - 1) / 6)) or 0,
            cap = profile.cap or 0,
            chainInterval = profile.chainInterval, chainRange = profile.chainRange, chainFraction = profile.chainFraction,
            modelScale = weapon.modelScale, opaque = weapon.opaque,
            pulse = math.max(0.1, profile.pulse / (engine.pulseHaste and math.max(0.1, 1 + g.speed + Bonus(g.build, id, "speedPct")) or 1)),
            slow = profile.slow, delay = 0.8,
            slowDurationBonus = Bonus(g.build, id, "slowDuration"),
        }
    end
    for name, engine in pairs(engines) do
        if engine.profile then engine.fields = ProfileFields end
        assert(engine.fields and engine.rows, "Weapon engine needs growth fields and tooltip rows " .. name)
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
        local g = {build = build, power = power, speed = speed, area = area,
            weaponSize = weaponSize, weaponRange = weaponRange, weaponLife = weaponLife,
            projectileSpeed = projectileSpeed, projectileSize = projectileSize,
            projectileRange = projectileRange, projectileLife = projectileLife}
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
            sets = {}, weapons = {},
        }
        for set in pairs(bonusKeys.set) do result.sets[set] = Bonus(build, "set", set) >= 1 end
        for id, weapon in pairs(c.weapons) do
            local level = levels[id] or 0
            local fields = engines[weapon.engine].fields(g, id, level, bases[id] or c.weaponProfiles[id])
            fields.weaponId, fields.model, fields.thrown, fields.lightning = id, weapon.model, weapon.thrown, weapon.lightning
            fields.falling, fields.hitModel = weapon.falling, weapon.hitModel
            fields.throwModel, fields.throwScale = weapon.throwModel, weapon.throwScale
            if bases[id] then fields.throwSpeed = weapon.thrown and projectileSpeed or nil end
            result.weapons[id] = fields
        end
        -- Putress status per owned weapon; evolutions below may adjust it.
        result.status = {}
        result.poisonDamage = c.status.poisonDamage * math.max(0.1, 1 + power)
        for id, weapon in pairs(c.weapons) do
            local level = levels[id] or 0
            if level > 0 and weapon.hero == "putress" then
                local function At(list) return list and list[level] or 0 end
                local poison = At(weapon.poison)
                if poison > 0 then poison = poison + math.floor(Bonus(build, id, "poison")) end
                -- tickPower: poison ticks scale with this weapon's own damage bonuses.
                result.status[id] = {poison = poison, curse = At(weapon.curse),
                    reaction = At(weapon.reaction) * math.max(0.1, 1 + Bonus(build, id, "reactionPct")),
                    cursedBonus = At(weapon.cursedBonus), returnBonus = At(weapon.returnBonus),
                    residuePoison = weapon.residuePoison or 0, maxCurseBonus = 0,
                    tickPower = math.max(0.1, 1 + power + Bonus(build, id, "damagePct"))}
            end
        end
        for weapon, id in pairs(build.evolutions or {}) do
            local entry, target, engine = catalog[id], result.weapons[weapon], engines[c.weapons[weapon].engine]
            for key, value in pairs(entry.multiply) do target[key] = target[key] * value end
            for key, value in pairs(entry.add) do target[key] = target[key] + value end
            -- Fixed-count branches retain the value of duration/count bonuses as damage.
            local fixed = engine.fixed
            if fixed and entry.set[fixed] then target.damage = target.damage * target[fixed] / engine.levels[fixed][levels[weapon]] end
            for key, value in pairs(entry.set) do target[key] = value end
            if target.cap and target.cap > 0 then target.count = math.min(target.cap, target.count) end
            -- mode names the combat behaviour; modeValues holds its numbers.
            target.evolution, target.modeValues = entry.mode, entry.modeValues
            local status = result.status[weapon]
            for key, value in pairs(entry.status) do
                if key == "poison" or key == "curse" then status[key] = status[key] + value
                elseif key == "reactionMul" then status.reaction = status.reaction * value
                else status[key] = value end
            end
        end
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
    -- SurvivorCombat owns these pause flags on the shared stats table; every
    -- other key is derived here and must disappear when Calculate omits it.
    local runtimeStatKeys = {nativeRegenerationPaused = true, combatPaused = true}
    function SurvivorAugments.Recalculate(build, hero)
        local derived = Calculate(build)
        -- Preserve this table's identity: combat holds the same stats reference.
        local stale = {}
        for key in pairs(build.stats) do
            if derived[key] == nil and not runtimeStatKeys[key] then stale[#stale + 1] = key end
        end
        for _, key in ipairs(stale) do build.stats[key] = nil end
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
        assert(SurvivorConfig.growthMaxLevel >= 1 and SurvivorConfig.growthMaxLevel <= #engines.chain.levels.targets, "Growth tables support levels 1..7")
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
    local function Delta(label, before, after, decimals, suffix, relative)
        decimals, suffix = decimals or 0, suffix or ""
        -- Preserve small real changes instead of rounding both sides to the same value.
        while decimals < 4 and string.format("%." .. decimals .. "f", before) == string.format("%." .. decimals .. "f", after)
            and before ~= after do decimals = decimals + 1 end
        local change = relative and before > 0 and string.format(" (%+.1f%%)", (after / before - 1) * 100) or ""
        change = change:gsub("%.0%%", "%%")
        return label .. " " .. StatNumber(before, decimals) .. suffix .. " → |cff80ff80"
            .. StatNumber(after, decimals) .. suffix .. change .. "|r"
    end
    function SurvivorAugments.Preview(id, build)
        if id == "recovery" then return "생명력 30% 회복\n무기·장신구 슬롯을 사용하지 않습니다." end
        local entry = catalog[id]
        if entry.kind == "evolution" then return "진화 선택 후 변경 불가" end
        if id == "multicast" then
            local level, lines = SurvivorAugments.Level(build, id) + 1, {}
            if build.stats.multiCount ~= multiCounts[level] then
                lines[#lines + 1] = Delta("추가 공격", build.stats.multiCount, multiCounts[level], 0, "회")
            end
            if build.stats.multiDamage ~= multiDamage[level] then
                lines[#lines + 1] = Delta("추가 공격 피해", build.stats.multiDamage * 100, multiDamage[level] * 100, 0, "%")
            end
            return table.concat(lines, "\n")
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
        local preview = {levels = {}, equipmentBonuses = build.equipmentBonuses,
            talentTotals = build.talentTotals, evolutions = build.evolutions}
        for key, value in pairs(build.levels) do preview.levels[key] = value end
        local level = SurvivorAugments.Level(build, id)
        preview.levels[id] = level + 1
        local old, new = WeaponRows(id, entry, build.stats), WeaponRows(id, entry, Calculate(preview))
        local before, lines = {}, {}
        for _, row in ipairs(old) do before[row[1]] = row[2] end
        -- First acquisition shows core performance; existing weapons show only real differences.
        local core = { ["피해"] = true, ["투사체 수"] = true, ["최대 대상"] = true,
            ["최대 관통"] = true, ["약병 수"] = true, ["낙뢰 수"] = true, ["소환 수"] = true,
            ["쿨다운"] = true }
        for _, row in ipairs(new) do
            local label, value, decimals, suffix = row[1], row[2], row[3] or 0, row[4] or ""
            if label == "피해" then
                suffix = ""
                label = SurvivorConfig.weaponEngines[SurvivorConfig.weapons[id].engine].damageLabel or label
            end
            if level == 0 then
                if core[row[1]] and type(value) == "number" and value > 0 then
                    lines[#lines + 1] = label .. " " .. StatNumber(value, decimals) .. suffix
                end
            else
                local previous = before[row[1]]
                if type(value) == "number" then
                    previous = previous or 0
                    if math.abs(value - previous) > 0.0000001 then
                        lines[#lines + 1] = Delta(label, previous, value, decimals, suffix, row[1] == "피해")
                    end
                elseif value ~= previous then
                    lines[#lines + 1] = label .. " " .. tostring(previous or "없음") .. " → |cff80ff80" .. value .. "|r"
                end
            end
        end
        return #lines > 0 and table.concat(lines, "\n") or "현재 적용 수치 변화 없음"
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
