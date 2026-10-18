-- Prototype values, not final game balance. Uses stock Blizzard object IDs.
SurvivorConfig = {
    autoStart = true, debugCommands = HERO_SURVIVOR_PROFILE ~= "release", playerId = 0,
    heroId = FourCC("Uany"),
    talents = assert(HERO_SURVIVOR_TALENTS, "Missing native talent catalog"),
    stages = 5, heroLife = 300, moveSpeed = 300, heroRegeneration = 0,
    stageTimings = {
        {bossStart = 120, duration = 180},
        {bossStart = 180, duration = 240},
        {bossStart = 240, duration = 300},
        {bossStart = 240, duration = 300},
        {bossStart = 240, duration = 300},
    },
    escapeDuration = 2.5, escapeDistances = {400, 240, 120},
    escapeDepartureModel = [[Abilities\Spells\NightElf\Blink\BlinkCaster.mdl]],
    escapeArrivalModel = [[Abilities\Spells\NightElf\Blink\BlinkTarget.mdl]],
    enemyLife = 100, enemyDamage = 8, enemyMoveSpeed = 220,
    -- Spare slots that own enemies in rotation; see SurvivorCombat NextEnemyOwner.
    enemyPlayerIds = {18, 19, 20, 21, 22, 23}, enemyPlayerName = "적",
    -- Chasers re-aim in this many staggered groups, one group per enemy update.
    enemyOrderGroups = 4,
    maxEnemies = 225, stageEnemyCaps = {180, 203, 225, 225, 225}, spawnInterval = 1.0, spawnDistance = 750,
    spawnRateMultiplier = 1.5,
    battlefieldCleanupBudget = 24, battlefieldCleanupInterval = 0.02,
    battlefieldAliceCleanupBudget = 24,
    difficultyOrder = {"easy", "normal", "hard"},
    difficulties = {
        easy = {name = "쉬움", spawn = 0.8, life = 0.75, damage = 0.60, attackSpeed = 0.85, moveSpeed = 0.90,
            text = "이동과 성장 선택을 익히기 좋은 난이도", icon = [[ReplaceableTextures\CommandButtons\BTNPotionGreenSmall.blp]]},
        normal = {name = "보통", spawn = 1, life = 1, damage = 1, attackSpeed = 1, moveSpeed = 1,
            text = "기본 전투 속도로 빌드를 완성하는 난이도", icon = [[ReplaceableTextures\CommandButtons\BTNFireBolt.blp]]},
        hard = {name = "어려움", spawn = 1.1, life = 1.60, damage = 1.60, attackSpeed = 1.25, moveSpeed = 1.10,
            text = "강인한 적과 빠른 공격을 상대하는 난이도", icon = [[ReplaceableTextures\CommandButtons\BTNInfernal.blp]]},
    },
    spawnTimeRates = {1, 1.60, 2.40, 3.40},
    -- Combat minutes only; each newly spawned enemy keeps its creation-time stats.
    enemyTimeLife = {1, 1.12, 1.28, 1.48}, enemyTimeDamage = {1, 1.08, 1.16, 1.25},
    enemyTimeAttackSpeed = {1, 1.03, 1.06, 1.10}, enemyTimeMoveSpeed = {1, 1.02, 1.04, 1.06},
    -- Actual hero XP uses the map's Gameplay Constants (curve and max level).
    -- assets/war3map.w3u sets Anya's base attributes and all native gains to 0.
    -- Lua weapon damage grows through augments and equipment.
    -- Native automatic kill XP is suspended; only AwardXP grants rewards.
    enemyExperience = 50, enemyExperienceByType = {},
    -- assets/war3mapMisc.txt sets native max level 70 and cumulative XP thresholds.
    -- Levels 2..5 keep the opening pace; each later step costs 200 XP more.
    -- The complete native table, including the late curve, lives in that asset.
    eliteInterval = 45.0, eliteLifeMultiplier = 4, eliteDamageMultiplier = 2,
    eliteExperience = 150,
    rangedEnemy = {life = 85, damage = 12,
        speed = 190, range = 550, interval = 2.4, projectileSpeed = 420},
    flyingEnemy = {life = 75, damage = 10,
        speed = 245, range = 400, interval = 2.0, projectileSpeed = 380},
    enemyProjectileModel = "Abilities\\Weapons\\FireBallMissile\\FireBallMissile.mdl",
    bossLife = 2400, bossDamage = 25,
    bossMoveSpeed = 210, bossBlastInterval = 5, bossBlastDelay = 1.25,
    bossBlastRadius = 240, bossBlastDamage = 75,
    bossImpactModel = "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl",
    equipmentDropChance = 0.04, equipmentPityKills = 24,
    equipmentPickupRadius = 140, equipmentGroundLimit = 24, equipmentGroundLifetime = 60,
    weaponSlots = 6, trinketSlots = 6, growthMaxLevel = 7,
    rerollsPerRun = 3, rerollCapacity = 5, rerollsPerStage = 1,
    excludesPerRun = 3,
    startingTrinkets = {"power", "haste", "velocity", "magnitude", "reach", "longevity", "multicast", "vitality", "renewal", "stride", "armor"},
    startingWeapon = "firebolt",
    startingWeapons = {"firebolt", "chainlightning", "orbitblade", "frostshard"},
    -- Setup screen hero profiles. story fills the description panel; previewSkin is the preview model.
    defaultHero = "anya", heroOrder = {"anya"},
    heroes = {
        anya = {name = "안야", unitId = FourCC("Uany"), icon = [[ReplaceableTextures\CommandButtons\BTNAnya.blp]],
            -- The story's portrait proxy carries the HeroAnya model for the setup preview skin.
            previewSkin = FourCC("hsPA"), previewAnimation = "cinematic stand 1",
            text = "화염·번개·칼날·얼음 무기로 몰려오는 적을 즉시 정리합니다.",
            story = "스트라솔름 폐허에서 스컬지 무리를 벗어난 언데드가 목격됐다.\n"
                .. "안야는 퓨트리스와 함께 그 흔적을 쫓아 불타는 시가지와 납골당, 로데론 수도의 하수구까지 긴 밤의 수색에 나선다.\n\n"
                .. "화염·번개·칼날·얼음 무기로 몰려오는 적을 정리하며 길을 연다."},
    },
    -- Setup preview shot: the hero floats lift above the ground at x/y (map center when nil)
    -- and the camera looks north from distance, pitch degrees down, with this field of view.
    -- height is the model point that lands in the middle of the preview window. The far clip
    -- plane sits clip past the hero, short of the ground, so only the hero shows on black sky.
    -- screenScale corrects the field-of-view screen-to-world conversion; two in-game shots at
    -- distances 500 and 420 both measured about 1.12 at 16:9.
    setupPreview = {distance = 420, pitch = 0, fov = 70, height = 45, lift = 1500, clip = 600, screenScale = 1.12},
    missileInterval = 0.8, missileDamage = 40, missileSpeed = 850, missileRange = 1000,
    missileLifetime = 5,
    -- World Z = terrain Z + current fly height + model-relative height.
    missileLaunchHeight = 70, missileImpactHeight = 60, missileHitRadius = 32,
    -- Optional rawcode -> body aim height overrides for differently sized models.
    missileImpactHeightByType = {},
    warningModel = [[Abilities\Weapons\FireBallMissile\FireBallMissile.mdl]],
    meteorModel = [[Abilities\Weapons\FireBallMissile\FireBallMissile.mdl]],
    meteorImpactModel = [[Objects\Spawnmodels\Other\NeutralBuildingExplosion\NeutralBuildingExplosion.mdl]],
    missileModel = [[Abilities\Weapons\SearingArrow\SearingArrowMissile.mdl]],
    zoneInterval = 4.0, zoneDuration = 3.0, zoneRadius = 230, zoneDamage = 12, zonePulse = 0.5,
    zoneModel = "Abilities\\Spells\\Human\\FlameStrike\\FlameStrike1.mdl",
    chainInterval = 2.2, chainDamage = 45, chainRange = 750, chainJumpRange = 350,
    chainFalloff = 0.85,
    chainHitModel = [[Abilities\Weapons\Bolt\BoltImpact.mdl]],
    chainHitScale = 0.8, chainHitDuration = 0.45,
    bladeDamage = 30, bladeRadius = 180, bladePeriod = 2.4, bladeHitRadius = 65,
    bladeHitInterval = 0.45, bladeInterval = 5.0, bladeDuration = 3.0,
    bladeModel = "Abilities\\Weapons\\GlaiveMissile\\GlaiveMissile.mdl",
    monsoonInterval = 3.2, monsoonDamage = 55, monsoonRange = 800, monsoonRadius = 150,
    monsoonModel = "Abilities\\Spells\\Other\\Monsoon\\MonsoonBoltTarget.mdl",
    slashInterval = 1.8, slashDamage = 65, slashRange = 320, slashAngle = 100,
    slashModel = "Abilities\\Spells\\Other\\Cleave\\CleaveDamageTarget.mdl",
    frostInterval = 1.6, frostDamage = 30, frostSpeed = 650, frostRange = 900,
    frostLifetime = 2.0, frostHitRadius = 45, frostSlow = 0.30, frostSlowDuration = 2.0,
    -- Per-stage multipliers are explicit so balancing does not change weapon rules.
    stageLife = {1, 2.6, 5.0, 8.5, 13.0}, stageDamage = {1, 1.25, 1.5, 1.8, 2.1},
    stageSpawnRates = {1, 1.35, 1.75, 2.2, 2.7}, stageXP = {1, 1.15, 1.3, 1.45, 1.6},
    stageAttackSpeed = {1, 1.04, 1.08, 1.12, 1.16}, stageMoveSpeed = {1, 1.025, 1.05, 1.075, 1.10},
    stageBossLife = {1, 2.5, 4.5, 7.5, 11.0},
    -- Compositions change encounter roles without introducing unverified rawcodes.
    encounters = {
        {ranged = 15, flying = 0, rangedStart = 45, flyingStart = 90,
            meleeSpeed = 1, meleeLife = 1, meleeName = "폐허 배회자", rangedName = "썩은 활잡이", flyingName = "폐허 가고일", bossName = "시체 수집자", pattern = "target"},
        {ranged = 45, flying = 10, rangedStart = 15, flyingStart = 90,
            meleeSpeed = 1.15, meleeLife = 0.85, meleeName = "잿더미 구울", rangedName = "불씨 술사", flyingName = "잿빛 가고일", bossName = "불타는 도살자", pattern = "dash"},
        {ranged = 15, flying = 45, rangedStart = 20, flyingStart = 10,
            meleeSpeed = 1, meleeLife = 1, meleeName = "서리 망령", rangedName = "냉기 강령술사", flyingName = "서리날개 가고일", bossName = "납골당 파수꾼", pattern = "wave"},
        {ranged = 30, flying = 20, rangedStart = 10, flyingStart = 30,
            meleeSpeed = 0.85, meleeLife = 1.6, meleeName = "해골 추적병", rangedName = "저주의 사수", flyingName = "비명 밴시", bossName = "추적대장", pattern = "cross"},
        {ranged = 35, flying = 30, rangedStart = 0, flyingStart = 0,
            meleeSpeed = 1.1, meleeLife = 1.2, meleeName = "사슬 근위병", rangedName = "지배의 강령술사", flyingName = "하수구 망령", bossName = "사슬의 감시자", pattern = "cycle"},
    },
    extraWeapons = {
        frostnova = {interval = 4, damage = 38, radius = 280, range = 280, duration = 2.5, speed = 1, pulse = 1, slow = 0.45},
        blizzard = {interval = 6, damage = 20, radius = 240, range = 750, duration = 3, speed = 1, pulse = 0.6, slow = 0.2},
        meteor = {interval = 5.5, damage = 110, radius = 220, range = 800, duration = 2, speed = 1, pulse = 0.5, slow = 0},
        thunderorb = {interval = 3, damage = 20, radius = 150, range = 850, duration = 2.5, speed = 400, pulse = 0.35, slow = 0},
        returnblade = {interval = 2.8, damage = 42, radius = 60, range = 650, duration = 3, speed = 650, pulse = 1, slow = 0},
    },
    frostModel = "Abilities\\Spells\\Other\\FrostArrows\\NagaColdArrowMissile.mdl",
}

function SurvivorConfig.EnemyScaling(stage, stageElapsed, isBoss)
    local c = SurvivorConfig
    assert(c.stageLife[stage], "Invalid enemy stage")
    -- Bosses use their own stage HP curve, without a second minute-based bonus.
    local minute = isBoss and 1 or math.min(#c.enemyTimeLife, math.max(1, math.floor(stageElapsed / 60) + 1))
    return {
        life = isBoss and c.stageBossLife[stage] or c.stageLife[stage] * c.enemyTimeLife[minute],
        damage = c.stageDamage[stage] * c.enemyTimeDamage[minute],
        attackSpeed = c.stageAttackSpeed[stage] * c.enemyTimeAttackSpeed[minute],
        moveSpeed = c.stageMoveSpeed[stage] * c.enemyTimeMoveSpeed[minute],
    }
end

function SurvivorConfig.StageTiming(stage)
    return assert(SurvivorConfig.stageTimings[stage], "Invalid stage timing")
end

function SurvivorConfig.SpawnRate(difficultyId, stage, stageElapsed)
    local difficulty = SurvivorConfig.difficulties[difficultyId]
    assert(difficulty and SurvivorConfig.stageSpawnRates[stage], "Invalid spawn profile")
    if stageElapsed >= SurvivorConfig.StageTiming(stage).bossStart then return 0 end
    local minute = math.min(#SurvivorConfig.spawnTimeRates, math.max(1, math.floor(stageElapsed / 60) + 1))
    return SurvivorConfig.spawnRateMultiplier * difficulty.spawn * SurvivorConfig.stageSpawnRates[stage]
        * SurvivorConfig.spawnTimeRates[minute] / SurvivorConfig.spawnInterval
end

-- Update the existing table before ALICE's final initializer runs.
-- Actor debug UI is disabled; the optional vendor FDF/TOC is not needed.
ALICE_Config.ENABLE_DEBUG_MODE = false
ALICE_Config.PROTECTED_MODE = true
ALICE_Config.STORE_TRACEBACK_ON_CALLBACKS = false
ALICE_Config.NO_DESTRUCTABLE_ACTOR = true
ALICE_Config.NO_ITEM_ACTOR = true
