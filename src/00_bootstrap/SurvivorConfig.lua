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
    -- 3.0 DE-only hidden models keep enemy shots distinct from the meteor weapon.
    enemyProjectileModel = [[abilities\spells\undead\cultistflame\cultistflamemissile.mdl]],
    bossLife = 2400, bossDamage = 25,
    bossMoveSpeed = 210, bossBlastInterval = 5, bossBlastDelay = 1.25,
    bossBlastRadius = 240, bossBlastDamage = 75,
    bossImpactModel = [[abilities\spells\undead\darkhorizon\darkhorizoncasterred.mdl]],
    -- Boss/hazard blasts show one ground ring; its scale is radius / warningRingRadius.
    warningRingModel = [[abilities\spells\other\spellmarker\spellmarkerred.mdl]], warningRingRadius = 100,
    specialMarkerModel = [[abilities\spells\other\spellmarker\spellmarkerred.mdl]],
    specialSafeMarkerModel = [[abilities\spells\other\spellmarker\spellmarkergreen.mdl]],
    -- Elite dashes show only their direction: one arrow placed ahead of the elite.
    -- Arrows repeat every dashArrowSpacing from the first offset to the dash end.
    dashArrowModel = [[abilities\spells\other\spellmarker\spellarrowred.mdl]], dashArrowScale = 1.2, dashArrowOffset = 150,
    dashArrowSpacing = 150,
    -- One effect per role: weapon procs and set effects never share a model.
    fireBurstModel = [[abilities\spells\other\renault\firenova.mdl]],
    emberBurstModel = [[Abilities\Spells\Orc\WarStomp\WarStompCaster.mdl]],
    bladeProcModel = [[abilities\spells\orc\criticalstrike\criticalstriketarget.mdl]],
    reactionModel = [[doodads\underground\props\poisongas\poisonexplosion.mdl]], reactionScale = 0.08,
    residueModel = [[doodads\underground\props\poisongas\poisonrise.mdl]],
    jarExplosionModel = [[Objects\Spawnmodels\NightElf\NightElfLargeDeathExplode\NightElfLargeDeathExplode.mdl]],
    -- Shown above enemies while the plague jar residue keeps damaging them.
    jarMarkModel = [[Abilities\Spells\Undead\Curse\CurseTarget.mdl]],
    soulBurstModel = [[abilities\spells\undead\witheringfire\witheringfireimpact.mdl]],
    equipmentDropChance = 0.04, equipmentPityKills = 24,
    equipmentPickupRadius = 140, equipmentGroundLimit = 24, equipmentGroundLifetime = 60,
    weaponSlots = 6, trinketSlots = 6, growthMaxLevel = 7,
    rerollsPerRun = 3, rerollCapacity = 5, rerollsPerStage = 1,
    excludesPerRun = 3,
    startingTrinkets = {"power", "haste", "velocity", "magnitude", "reach", "longevity", "multicast", "vitality", "renewal", "stride", "armor"},
    startingWeapon = "firebolt",
    startingWeapons = {"firebolt", "chainlightning", "orbitblade", "frostshard"},
    -- Playable heroes. A locked hero would be listed in setup but could not start a run.
    -- story fills the setup description panel; previewSkin is the setup preview model
    -- (the story's portrait proxies carry the HeroAnya/Putress models).
    defaultHero = "anya", heroOrder = {"anya", "putress"},
    heroes = {
        anya = {name = "안야", unitId = FourCC("Uany"), icon = [[ReplaceableTextures\CommandButtons\BTNAnya.blp]],
            previewSkin = FourCC("hsPA"), previewAnimation = "cinematic stand 1",
            text = "화염·번개·칼날·얼음 무기로 몰려오는 적을 즉시 정리합니다.",
            story = "스트라솔름 폐허에서 스컬지 무리를 벗어난 언데드가 목격됐다.\n"
                .. "안야는 퓨트리스와 함께 그 흔적을 쫓아 불타는 시가지와 납골당, 로데론 수도의 하수구까지 긴 밤의 수색에 나선다.\n\n"
                .. "화염·번개·칼날·얼음 무기로 몰려오는 적을 정리하며 길을 연다."},
        putress = {name = "퓨트리스", unitId = FourCC("HsPu"), icon = [[ReplaceableTextures\CommandButtons\BTNPutress.blp]],
            previewSkin = FourCC("hsPP"), previewAnimation = "stand",
            text = "독·어둠·연금술 무기로 중독과 저주를 쌓아 반응으로 터뜨립니다.",
            story = "스트라솔름 폐허에서 스컬지 무리를 벗어난 언데드가 목격됐다.\n"
                .. "퓨트리스는 안야와 함께 그 흔적을 쫓아 불타는 시가지와 납골당, 로데론 수도의 하수구까지 긴 밤의 수색에 나선다.\n\n"
                .. "독·어둠·연금술 무기로 중독과 저주를 쌓고, 반응으로 한꺼번에 터뜨린다.",
            startingWeapons = {"plaguedart", "plaguetrail", "deathcoil", "plaguejar"}},
    },
    -- Setup preview shot: the hero floats lift above the ground at x/y (map center when nil)
    -- and the camera looks north from distance, pitch degrees down, with this field of view.
    -- height is the model point that lands in the middle of the preview window. The far clip
    -- plane sits clip past the hero, short of the ground, so only the hero shows on black sky.
    -- screenScale corrects the field-of-view screen-to-world conversion; two in-game shots at
    -- distances 500 and 420 both measured about 1.12 at 16:9.
    setupPreview = {distance = 420, pitch = 0, fov = 70, height = 45, lift = 1500, clip = 600, screenScale = 1.12},
    -- Weapon id -> owning hero, firing engine and catalog traits. weaponOrder is the cast order.
    weaponOrder = {"frostnova", "blizzard", "meteor", "thunderorb", "returnblade", "orbitblade",
        "firebolt", "flamefield", "chainlightning", "monsoon", "frontslash", "frostshard",
        "plaguepool", "plaguejar", "catalyst", "boilingflask", "shadowscythe", "wraithguard",
        "deathcoil", "plaguetrail", "soulchain", "acidvials", "corrosion", "plaguedart"},
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
        -- Putress: per-level status tables (poison stacks, curse stacks, reaction multiplier).
        -- thrown = delivered by a Bezier arc that lands on the locked target point; throwModel/throwScale
        -- pick the flying model (default throw.model), model stays the landing/residue effect.
        -- modelScale enlarges a profile weapon's own model; opaque keeps it fully visible.
        -- tint overrides the school tint (a grey fog becomes a green poison pool); throwTint only the flying model.
        plaguedart = {hero = "putress", engine = "pierce", element = "독", projectile = true,
            poison = {2, 2, 3, 3, 3, 4, 4}, model = [[Abilities\Weapons\ChimaeraAcidMissile\ChimaeraAcidMissile.mdl]]},
        plaguetrail = {hero = "putress", engine = "zone", element = "독",
            poison = {1, 1, 1, 1, 1, 1, 1}, model = [[Units\Undead\PlagueCloud\PlagueCloud.mdl]]},
        corrosion = {hero = "putress", engine = "cone", element = "독",
            poison = {3, 3, 4, 4, 4, 5, 5}, model = [[Abilities\Weapons\GreenDragonMissile\GreenDragonMissile.mdl]],
            hitModel = [[abilities\spells\undead\minddeath\mindcontroldeath.mdl]]},
        plaguepool = {hero = "putress", engine = "field", element = "독", projectile = true, thrown = true,
            poison = {1, 1, 1, 1, 1, 1, 1}, model = [[Abilities\Spells\Other\CloudOfFog\CloudOfFog.mdl]], tint = {120, 255, 90},
            throwModel = [[abilities\weapons\blightweavermissile\blightweavermissile.mdl]], throwScale = 2.2},
        deathcoil = {hero = "putress", engine = "missile", element = "어둠", projectile = true,
            curse = {1, 1, 1, 1, 1, 1, 1}, model = [[Abilities\Spells\Undead\DeathCoil\DeathCoilMissile.mdl]]},
        soulchain = {hero = "putress", engine = "chain", element = "어둠",
            curse = {1, 1, 1, 1, 1, 1, 1}, lightning = "SPLK", model = [[Abilities\Spells\Undead\Curse\CurseTarget.mdl]]},
        wraithguard = {hero = "putress", engine = "orbit", element = "어둠",
            cursedBonus = {0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3}, model = [[Abilities\Weapons\AvengerMissile\AvengerMissile.mdl]]},
        shadowscythe = {hero = "putress", engine = "boomerang", element = "어둠", projectile = true,
            curse = {1, 1, 1, 1, 1, 1, 1}, returnBonus = {0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5},
            model = [[Abilities\Spells\NightElf\shadowstrike\shadowstrike.mdl]], modelScale = 1.6, opaque = true},
        plaguejar = {hero = "putress", engine = "meteor", element = "연금술", projectile = true, thrown = true,
            reaction = {1, 1, 1, 1, 1, 1, 1}, residuePoison = 1,
            throwModel = [[Abilities\Spells\Other\StrongDrink\BrewmasterMissile.mdl]], throwScale = 2.6, throwTint = {255, 0, 255}},
        catalyst = {hero = "putress", engine = "nova", element = "연금술",
            reaction = {1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5}, model = [[abilities\spells\undead\shadownova\shadownova.mdl]]},
        boilingflask = {hero = "putress", engine = "orb", element = "연금술", projectile = true,
            reaction = {1, 1, 1, 1, 1, 1, 1}, model = [[Abilities\Weapons\RedDragonBreath\RedDragonMissile.mdl]], modelScale = 1.4},
        acidvials = {hero = "putress", engine = "strike", element = "연금술", projectile = true, thrown = true,
            reaction = {1, 1, 1, 1, 1, 1, 1}, model = [[Abilities\Spells\Other\AcidBomb\BottleImpact.mdl]],
            throwModel = [[Abilities\Spells\Other\AcidBomb\BottleMissile.mdl]]},
    },
    -- One colour per weapon school: UI tags use the hex colour; tint multiplies
    -- that school's effect models so poison (green), dark and alchemy stay apart.
    elements = {
        ["화염"] = {color = "ff8040"}, ["번개"] = {color = "80d0ff"}, ["칼날"] = {color = "d8d8e0"},
        ["얼음"] = {color = "6fa8ff", label = "냉기"}, ["독"] = {color = "80ff60"},
        ["어둠"] = {color = "b080ff", tint = {190, 130, 255}}, ["연금술"] = {color = "ffa040", tint = {255, 170, 70}},
    },
    -- Status effects applied by Putress weapons (draft values).
    status = {poisonDamage = 6, poisonTick = 0.5, poisonMax = 12, poisonDuration = 4,
        curseAmp = 0.08, curseMax = 3, curseDuration = 4, reactionDamage = 18, reactionCooldown = 0.5},
    -- Bezier throws: control point height = distance * arc (clamped); flight time grows with distance.
    throw = {arc = 0.35, minHeight = 120, maxHeight = 320, minFlight = 0.55, maxFlight = 0.8, flightRange = 800,
        model = [[Abilities\Spells\Other\AcidBomb\BottleMissile.mdl]]},
    -- Core-engine Putress weapons override the engine base values below.
    weaponBases = {
        plaguedart = {frostDamage = 18, frostInterval = 1.4, frostSlow = 0, frostSlowDuration = 0},
        plaguetrail = {zoneDamage = 6, zoneInterval = 4.0, zoneRadius = 200},
        corrosion = {slashDamage = 30, slashInterval = 2.0, slashRange = 300},
        deathcoil = {missileDamage = 34, missileInterval = 1.0},
        soulchain = {chainDamage = 36, chainInterval = 2.4},
        wraithguard = {bladeDamage = 24},
        acidvials = {monsoonDamage = 40, monsoonInterval = 3.0, monsoonRadius = 130},
    },
    -- Engines name the derived stats fields they read. Profile engines read
    -- stats.extraWeapons[id]; carry keeps overshoot time so zones never drift.
    -- weapon = the engine's own weapon whose fields live flat on stats; any other
    -- weapon on that engine reads the same field names from stats.views[id].
    -- single = the count field reduced to 1 for each multicast extra attack.
    weaponEngines = {
        missile = {weapon = "firebolt", cast = "FireMissile", enabled = "missileEnabled", interval = "missileInterval",
            damage = "missileDamage", single = "missileCount",
            fields = {"missileEnabled", "missileRange", "missileCount", "missileLifetime", "missileDamage", "missileSpeed", "missileHitRadius", "missileScale", "fireEvolution"}},
        zone = {weapon = "flamefield", cast = "CreateZone", enabled = "zoneEnabled", interval = "zoneInterval", damage = "zoneDamage", carry = true,
            fields = {"zoneEnabled", "zoneRadius", "zoneDuration", "zoneDamage", "zonePulse"}},
        chain = {weapon = "chainlightning", cast = "CastChainLightning", enabled = "chainEnabled", interval = "chainInterval", damage = "chainDamage",
            fields = {"chainEnabled", "chainDamage", "chainRange", "chainTargets", "chainJumpRange"}},
        -- Orbit casts its base and extra blades as one volley, so it has no snapshot.
        orbit = {weapon = "orbitblade", cast = "CastBlades", enabled = "bladeEnabled", interval = "bladeInterval", volley = true},
        strike = {weapon = "monsoon", cast = "CastMonsoon", enabled = "monsoonEnabled", interval = "monsoonInterval",
            damage = "monsoonDamage", single = "monsoonCount",
            fields = {"monsoonEnabled", "monsoonRange", "monsoonCount", "monsoonRadius", "monsoonDelay", "monsoonSpacing", "monsoonDamage"}},
        cone = {weapon = "frontslash", cast = "CastFrontSlash", enabled = "slashEnabled", interval = "slashInterval", damage = "slashDamage",
            fields = {"slashEnabled", "slashAngle", "slashRange", "slashSweepTime", "slashDuration", "slashScale", "slashDamage"}},
        pierce = {weapon = "frostshard", cast = "FireFrostShard", enabled = "frostEnabled", interval = "frostInterval", damage = "frostDamage",
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
        plaguepool = {interval = 5, damage = 8, radius = 220, range = 750, duration = 4, speed = 1, pulse = 0.5, slow = 0.15},
        plaguejar = {interval = 5, damage = 70, radius = 200, range = 800, duration = 2, speed = 1, pulse = 0.5, slow = 0},
        catalyst = {interval = 3.5, damage = 45, radius = 200, range = 650, duration = 0.5, speed = 1, pulse = 1, slow = 0},
        boilingflask = {interval = 3.5, damage = 14, radius = 140, range = 700, duration = 3, speed = 380, pulse = 0.4, slow = 0},
        shadowscythe = {interval = 3, damage = 38, radius = 60, range = 650, duration = 3, speed = 650, pulse = 1, slow = 0},
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
    for id, weapon in pairs(c.weapons) do
        local engine = c.weaponEngines[weapon.engine]
        assert((engine.profile == true) == (c.extraWeapons[id] ~= nil), "Profile engines need an extraWeapons profile " .. id)
        assert(engine.profile or engine.weapon == id or c.weaponBases[id], "Core-engine weapon needs base overrides " .. id)
    end
    for _, profile in pairs(c.heroes) do
        for _, id in ipairs(profile.startingWeapons) do
            assert(c.weapons[id] and c.heroes[c.weapons[id].hero] == profile, "Foreign starting weapon " .. id)
        end
    end
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
