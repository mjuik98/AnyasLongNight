-- Prototype values, not final game balance. Uses stock Blizzard object IDs.
SurvivorConfig = {
    autoStart = true, debugCommands = HERO_SURVIVOR_PROFILE ~= "release", playerId = 0,
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
    -- Playable heroes. A locked hero is listed in setup but cannot start a run yet.
    defaultHero = "anya", heroOrder = {"anya", "putress"},
    heroes = {
        anya = {name = "안야", unitId = FourCC("Uany"), icon = [[ReplaceableTextures\CommandButtons\BTNAnya.blp]],
            text = "화염·번개·칼날·얼음 무기로 몰려오는 적을 즉시 정리합니다."},
        putress = {name = "퓨트리스", icon = [[ReplaceableTextures\CommandButtons\BTNPutress.blp]], locked = true,
            text = "독·어둠·연금술 무기로 상태이상을 쌓아 터뜨립니다. (준비 중)", startingWeapons = {}},
    },
    -- Weapon id -> owning hero, firing engine and catalog traits. weaponOrder is the cast order.
    weaponOrder = {"frostnova", "blizzard", "meteor", "thunderorb", "returnblade", "orbitblade",
        "firebolt", "flamefield", "chainlightning", "monsoon", "frontslash", "frostshard"},
    weapons = {
        firebolt = {hero = "anya", engine = "missile", element = "화염", projectile = true},
        flamefield = {hero = "anya", engine = "zone", element = "화염"},
        meteor = {hero = "anya", engine = "meteor", element = "화염"},
        chainlightning = {hero = "anya", engine = "chain", element = "번개"},
        monsoon = {hero = "anya", engine = "strike", element = "번개"},
        thunderorb = {hero = "anya", engine = "orb", element = "번개", projectile = true},
        orbitblade = {hero = "anya", engine = "orbit", element = "칼날"},
        frontslash = {hero = "anya", engine = "cone", element = "칼날"},
        returnblade = {hero = "anya", engine = "boomerang", element = "칼날", projectile = true},
        frostshard = {hero = "anya", engine = "pierce", element = "얼음", projectile = true},
        frostnova = {hero = "anya", engine = "nova", element = "얼음"},
        blizzard = {hero = "anya", engine = "field", element = "얼음"},
    },
    -- Engines name the derived stats fields they read. Profile engines read
    -- stats.extraWeapons[id]; carry keeps overshoot time so zones never drift.
    -- single = the count field reduced to 1 for each multicast extra attack.
    weaponEngines = {
        missile = {cast = "FireMissile", enabled = "missileEnabled", interval = "missileInterval",
            damage = "missileDamage", single = "missileCount",
            fields = {"missileEnabled", "missileRange", "missileCount", "missileLifetime", "missileDamage", "missileSpeed", "missileHitRadius", "missileScale", "fireEvolution"}},
        zone = {cast = "CreateZone", enabled = "zoneEnabled", interval = "zoneInterval", damage = "zoneDamage", carry = true,
            fields = {"zoneEnabled", "zoneRadius", "zoneDuration", "zoneDamage", "zonePulse"}},
        chain = {cast = "CastChainLightning", enabled = "chainEnabled", interval = "chainInterval", damage = "chainDamage",
            fields = {"chainEnabled", "chainDamage", "chainRange", "chainTargets", "chainJumpRange"}},
        -- Orbit casts its base and extra blades as one volley, so it has no snapshot.
        orbit = {cast = "CastBlades", enabled = "bladeEnabled", interval = "bladeInterval", volley = true},
        strike = {cast = "CastMonsoon", enabled = "monsoonEnabled", interval = "monsoonInterval",
            damage = "monsoonDamage", single = "monsoonCount",
            fields = {"monsoonEnabled", "monsoonRange", "monsoonCount", "monsoonRadius", "monsoonDelay", "monsoonSpacing", "monsoonDamage"}},
        cone = {cast = "CastFrontSlash", enabled = "slashEnabled", interval = "slashInterval", damage = "slashDamage",
            fields = {"slashEnabled", "slashAngle", "slashRange", "slashSweepTime", "slashDuration", "slashScale", "slashDamage"}},
        pierce = {cast = "FireFrostShard", enabled = "frostEnabled", interval = "frostInterval", damage = "frostDamage",
            fields = {"frostEnabled", "frostRange", "frostSpeed", "frostLifetime", "frostHitRadius", "frostDamage", "frostPierce", "frostSlow", "frostSlowDuration", "frostEvolution", "frostScale"}},
        nova = {profile = true}, field = {profile = true}, meteor = {profile = true},
        orb = {profile = true}, boomerang = {profile = true},
    },
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

SurvivorConfig.heroes.anya.startingWeapons = SurvivorConfig.startingWeapons
do
    local c, listed = SurvivorConfig, {}
    for _, id in ipairs(c.weaponOrder) do
        local weapon = assert(c.weapons[id], "Unregistered weapon " .. id)
        assert(c.heroes[weapon.hero] and c.weaponEngines[weapon.engine], "Invalid weapon registry entry " .. id)
        listed[id] = true
    end
    for id in pairs(c.weapons) do assert(listed[id], "Weapon missing from cast order " .. id) end
    for id in pairs(c.extraWeapons) do assert(c.weaponEngines[c.weapons[id].engine].profile, "Profile weapon needs a profile engine " .. id) end
end

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
