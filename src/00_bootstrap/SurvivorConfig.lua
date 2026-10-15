-- Prototype values, not final game balance. Uses stock Blizzard object IDs.
SurvivorConfig = {
    autoStart = true, debugCommands = HERO_SURVIVOR_PROFILE ~= "release", playerId = 0,
    heroId = FourCC("Uany"),
    duration = 300.0, stages = 5, heroLife = 600, moveSpeed = 300, heroRegeneration = 1,
    enemyLife = 100, enemyDamage = 8, enemyMoveSpeed = 220,
    maxEnemies = 150, stageEnemyCaps = {120, 135, 150, 150, 150}, spawnInterval = 1.0, spawnDistance = 750,
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
    -- assets/war3map.w3u sets Anya's native gains to STR 1 / AGI 0 / INT 0.
    -- Lua weapon damage grows through augments and equipment.
    -- Native automatic kill XP is suspended; only AwardXP grants rewards.
    enemyExperience = 40, enemyExperienceByType = {},
    -- assets/war3mapMisc.txt sets native max level 70 and cumulative XP thresholds.
    -- First levels take 3, 4, 5... normal kills; no separate Lua XP counter.
    eliteInterval = 45.0, eliteLifeMultiplier = 4, eliteDamageMultiplier = 2,
    eliteExperience = 120,
    rangedEnemy = {life = 85, damage = 12,
        speed = 190, range = 550, interval = 2.4, projectileSpeed = 420},
    flyingEnemy = {life = 75, damage = 10,
        speed = 245, range = 400, interval = 2.0, projectileSpeed = 380},
    enemyProjectileModel = "Abilities\\Weapons\\FireBallMissile\\FireBallMissile.mdl",
    bossStart = 240, bossLife = 2400, bossDamage = 25,
    bossMoveSpeed = 210, bossBlastInterval = 5, bossBlastDelay = 1.25,
    bossBlastRadius = 240, bossBlastDamage = 75,
    bossImpactModel = "Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdl",
    equipmentDropChance = 0.04, equipmentPityKills = 24,
    equipmentPickupRadius = 140, equipmentGroundLimit = 24, equipmentGroundLifetime = 60,
    weaponSlots = 6, trinketSlots = 6, growthMaxLevel = 5,
    rerollsPerRun = 3, rerollCapacity = 5, rerollsPerStage = 1,
    excludesPerRun = 3,
    startingTrinkets = {"power", "haste", "velocity", "magnitude", "reach", "longevity", "multicast", "vitality", "renewal", "stride"},
    startingWeapon = "firebolt",
    startingWeapons = {"firebolt", "chainlightning", "orbitblade", "frostshard"},
    missileInterval = 0.8, missileDamage = 40, missileSpeed = 850, missileRange = 1000,
    missileLifetime = 5,
    -- World Z = terrain Z + current fly height + model-relative height.
    missileLaunchHeight = 70, missileImpactHeight = 60, missileHitRadius = 32,
    -- Optional rawcode -> body aim height overrides for differently sized models.
    missileImpactHeightByType = {},
    warningModel = [[Abilities\Weapons\FireBallMissile\FireBallMissile.mdl]],
    meteorModel = [[Abilities\Weapons\FireBallMissile\FireBallMissile.mdl]],
    missileModel = [[Abilities\Weapons\SearingArrow\SearingArrowMissile.mdl]],
    zoneInterval = 4.0, zoneDuration = 3.0, zoneRadius = 230, zoneDamage = 12, zonePulse = 0.5,
    zoneModel = "Abilities\\Spells\\Human\\FlameStrike\\FlameStrike1.mdl",
    chainInterval = 2.2, chainDamage = 45, chainRange = 750, chainJumpRange = 350,
    chainFalloff = 0.85,
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
        {name = "침묵의 묘역", ranged = 15, flying = 0, rangedStart = 45, flyingStart = 90,
            meleeSpeed = 1, meleeLife = 1, meleeName = "묘역 배회자", rangedName = "썩은 활잡이", flyingName = "묘역 가고일", bossName = "시체 수집자", pattern = "target"},
        {name = "불타는 보급로", ranged = 45, flying = 10, rangedStart = 15, flyingStart = 90,
            meleeSpeed = 1.15, meleeLife = 0.85, meleeName = "잿더미 구울", rangedName = "불씨 술사", flyingName = "잿빛 가고일", bossName = "불타는 도살자", pattern = "dash"},
        {name = "서리 낀 납골당", ranged = 15, flying = 45, rangedStart = 20, flyingStart = 10,
            meleeSpeed = 1, meleeLife = 1, meleeName = "서리 망령", rangedName = "냉기 강령술사", flyingName = "서리날개 가고일", bossName = "납골당 파수꾼", pattern = "wave"},
        {name = "폐허의 검문소", ranged = 30, flying = 20, rangedStart = 10, flyingStart = 30,
            meleeSpeed = 0.85, meleeLife = 1.6, meleeName = "해골 추적병", rangedName = "저주의 사수", flyingName = "비명 밴시", bossName = "추적대장", pattern = "cross"},
        {name = "지하로 가는 길", ranged = 35, flying = 30, rangedStart = 0, flyingStart = 0,
            meleeSpeed = 1.1, meleeLife = 1.2, meleeName = "사슬 근위병", rangedName = "지배의 강령술사", flyingName = "속박된 망령", bossName = "사슬의 감시자", pattern = "cycle"},
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

function SurvivorConfig.SpawnRate(difficultyId, stage, stageElapsed)
    local difficulty = SurvivorConfig.difficulties[difficultyId]
    assert(difficulty and SurvivorConfig.stageSpawnRates[stage], "Invalid spawn profile")
    if stageElapsed >= SurvivorConfig.bossStart then return 0 end
    local minute = math.min(#SurvivorConfig.spawnTimeRates, math.max(1, math.floor(stageElapsed / 60) + 1))
    return difficulty.spawn * SurvivorConfig.stageSpawnRates[stage] * SurvivorConfig.spawnTimeRates[minute] / SurvivorConfig.spawnInterval
end

-- Update the existing table before ALICE's final initializer runs.
-- Actor debug UI is disabled; the optional vendor FDF/TOC is not needed.
ALICE_Config.ENABLE_DEBUG_MODE = false
ALICE_Config.PROTECTED_MODE = true
ALICE_Config.STORE_TRACEBACK_ON_CALLBACKS = false
ALICE_Config.NO_DESTRUCTABLE_ACTOR = true
ALICE_Config.NO_ITEM_ACTOR = true
