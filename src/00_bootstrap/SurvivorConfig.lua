-- Prototype values, not final game balance. Uses stock Blizzard object IDs.
SurvivorConfig = {
    autoStart = true, debugCommands = ANYAS_LONG_NIGHT_PROFILE ~= "release", playerId = 0,
    talents = assert(ANYAS_LONG_NIGHT_TALENTS, "Missing native talent catalog"),
    stages = 5, heroLife = 300, moveSpeed = 300, heroRegeneration = 0,
    stageTimings = {
        {bossStart = 120, duration = 180},
        {bossStart = 180, duration = 240},
        {bossStart = 240, duration = 300},
        {bossStart = 240, duration = 300},
        {bossStart = 240, duration = 300},
    },
    -- Shadow escape: a lethal hit instead leaves at least escapeLifeFloor of max HP.
    escapeDuration = 2.5, escapeDistances = {400, 240, 120}, escapeLifeFloor = 0.30,
    -- Search reward: heals this fraction of max HP; the overflow becomes a timed ward.
    searchRecovery = {fraction = 0.25, wardDuration = 12},
    -- Guardian elites shield nearby enemies; an active risk investigation hits harder and spawns more.
    eliteGuardian = {radius = 400, damageTaken = 0.70},
    riskChallenge = {enemyDamage = 1.25, spawnRate = 1.35},
    escapeDepartureModel = [[Abilities\Spells\NightElf\Blink\BlinkCaster.mdl]],
    escapeArrivalModel = [[Abilities\Spells\NightElf\Blink\BlinkTarget.mdl]],
    enemyLife = 100, enemyDamage = 8, enemyMoveSpeed = 220,
    -- Spare slots that own enemies in rotation; see SurvivorCombat NextEnemyOwner.
    enemyPlayerIds = {18, 19, 20, 21, 22, 23}, enemyPlayerName = "적",
    -- Chasers re-aim in this many staggered groups, one group per enemy update.
    enemyOrderGroups = 4,
    maxEnemies = 225, stageEnemyCaps = {180, 203, 225, 225, 225}, spawnInterval = 1.0, spawnDistance = 1500,
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
        speed = 190, range = 400, interval = 2.4, projectileSpeed = 420},
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
    -- Static 100x100 white plane, stretched to the exact lane or safe-boundary dimensions.
    warningPlaneModel = [[AnyasLongNightUI\WarningPlane.mdx]],
    warningColors = {danger = {255, 75, 65}, safe = {105, 255, 145}},
    bossWarningAlpha = 90, bossWarningFinalAlpha = 245, bossWarningBrightTime = 0.65,
    -- Elite arrows use a fixed offset/spacing; larger boss arrows evenly cover the path to its endpoint.
    dashArrowModel = [[abilities\spells\other\spellmarker\spellarrowred.mdl]], dashArrowScale = 1.2, dashArrowOffset = 150,
    dashArrowSpacing = 150, bossDashArrowScale = 1.6,
    -- A warned lane through the hero, then a block of chasers marches straight across it.
    -- Combat seconds per stage; no rush starts within bossMargin of the boss.
    swarmRush = {firstAt = 50, interval = 50, retry = 5, bossMargin = 15, warning = 2.5,
        rows = 3, columns = 6, spacing = 110, distance = 1500, minDistance = 1100,
        speed = 340, life = 12, hitRadius = 85, damage = 1.5,
        laneAlpha = 60, finalLaneAlpha = 120, edgeAlpha = 210, brightTime = 0.65, arrowSpacing = 300},
    -- Red screen-edge flash on hero damage; strength follows damage / max HP.
    -- Within the cooldown only a heavier hit relights it, so chip damage pulses instead of glowing.
    hitVignette = {texture = [[AnyasLongNightUI\HitVignette.tga]], minAlpha = 90, maxAlpha = 235,
        fullFraction = 0.12, cooldown = 0.6, fade = 0.5},
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
    -- Breakable supplies use combat time, separate from enemy kills and equipment drops.
    bonusProps = {firstSpawn = 20, intervalMin = 35, intervalMax = 50, retry = 5,
        limit = 2, lifetime = 60, distanceMin = 350, distanceMax = 650, hits = 2,
        healFraction = 0.20, experience = 250, pickupRadius = 140, itemLifetime = 60,
        unitId = FourCC("hsBC"), name = "낡은 보급 상자 · 파괴 시 무작위 보상", color = {220, 200, 150},
        purgeRadius = 700, purgeBossFraction = 0.10, timeStopDuration = 8, timeStopBossDuration = 8,
        timeStopBrightness = 0.45,
        timeStopFilter = {color = {145, 185, 225}, alpha = 13, fadeIn = 0.2, fadeOut = 0.3,
            texture = [[ReplaceableTextures\CameraMasks\White_mask.blp]]},
        drops = {{kind = "recovery", weight = 30}, {kind = "experienceProp", weight = 60},
            {kind = "purge", weight = 5}, {kind = "timeStop", weight = 5}},
        recovery = {itemId = FourCC("hsHR")}, experienceProp = {itemId = FourCC("hsEX")},
        purge = {itemId = FourCC("hsPU")}, timeStop = {itemId = FourCC("hsTS")}},
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
                .. "안야는 퓨트리스와 함께 그 흔적을 쫓아 불타는 시가지와 납골당, 로데론 수도의 하수구까지 긴 밤의 수색에 나선다."},
        putress = {name = "퓨트리스", unitId = FourCC("HsPu"), icon = [[ReplaceableTextures\CommandButtons\BTNPutress.blp]],
            previewSkin = FourCC("hsPP"), previewAnimation = "stand",
            text = "독·어둠·연금술 무기로 중독과 저주를 쌓아 반응으로 터뜨립니다.",
            story = "스트라솔름 폐허에서 스컬지 무리를 벗어난 언데드가 목격됐다.\n"
                .. "퓨트리스는 안야와 함께 그 흔적을 쫓아 불타는 시가지와 납골당, 로데론 수도의 하수구까지 긴 밤의 수색에 나선다.",
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
        "deathcoil", "plaguetrail", "soulchain", "acidvials", "corrosion", "plaguedart", "banshee", "shadowarcher", "plaguezombie", "experiment"},
    weapons = {
        firebolt = {hero = "anya", tags = {"유도"}, engine = "missile", element = "화염", projectile = true},
        flamefield = {hero = "anya", tags = {"장판"}, engine = "zone", element = "화염"},
        meteor = {hero = "anya", tags = {"낙하", "폭발"}, engine = "meteor", element = "화염"},
        chainlightning = {hero = "anya", tags = {"연쇄"}, engine = "chain", element = "번개"},
        monsoon = {hero = "anya", tags = {"낙하"}, engine = "strike", element = "번개"},
        thunderorb = {hero = "anya", tags = {"유도", "연쇄"}, engine = "orb", element = "번개", projectile = true},
        orbitblade = {hero = "anya", tags = {"근접"}, engine = "orbit", element = "칼날"},
        frontslash = {hero = "anya", tags = {"근접"}, engine = "cone", element = "칼날"},
        returnblade = {hero = "anya", tags = {"관통"}, engine = "boomerang", element = "칼날", projectile = true},
        frostshard = {hero = "anya", tags = {"관통"}, engine = "pierce", element = "얼음", projectile = true},
        frostnova = {hero = "anya", tags = {"폭발"}, engine = "nova", element = "얼음"},
        blizzard = {hero = "anya", tags = {"장판"}, engine = "field", element = "얼음"},
        -- Putress: per-level status tables (poison stacks, curse stacks, reaction multiplier).
        -- thrown = delivered by a Bezier arc that lands on the locked target point; throwModel/throwScale
        -- pick the flying model (default throw.model), model stays the landing/residue effect.
        -- modelScale enlarges a profile weapon's own model; opaque keeps it fully visible.
        -- tint overrides the school tint (a grey fog becomes a green poison pool); throwTint only the flying model.
        plaguedart = {hero = "putress", tags = {"관통"}, engine = "pierce", element = "독", projectile = true,
            poison = {2, 2, 3, 3, 3, 4, 4}, model = [[Abilities\Weapons\ChimaeraAcidMissile\ChimaeraAcidMissile.mdl]]},
        plaguetrail = {hero = "putress", tags = {"장판"}, engine = "zone", element = "독",
            poison = {1, 1, 1, 1, 1, 1, 1}, model = [[Units\Undead\PlagueCloud\PlagueCloud.mdl]]},
        corrosion = {hero = "putress", tags = {"근접"}, engine = "cone", element = "독",
            poison = {3, 3, 4, 4, 4, 5, 5}, model = [[Abilities\Weapons\GreenDragonMissile\GreenDragonMissile.mdl]],
            hitModel = [[abilities\spells\undead\minddeath\mindcontroldeath.mdl]]},
        plaguepool = {hero = "putress", tags = {"장판"}, engine = "field", element = "독", projectile = true, thrown = true,
            poison = {1, 1, 1, 1, 1, 1, 1}, model = [[Abilities\Spells\Other\CloudOfFog\CloudOfFog.mdl]], tint = {120, 255, 90},
            throwModel = [[abilities\weapons\blightweavermissile\blightweavermissile.mdl]], throwScale = 2.2},
        deathcoil = {hero = "putress", tags = {"유도"}, engine = "missile", element = "어둠", projectile = true,
            curse = {1, 1, 1, 1, 1, 1, 1}, model = [[Abilities\Spells\Undead\DeathCoil\DeathCoilMissile.mdl]]},
        soulchain = {hero = "putress", tags = {"연쇄"}, engine = "chain", element = "어둠",
            curse = {1, 1, 1, 1, 1, 1, 1}, lightning = "SPLK", model = [[Abilities\Spells\Undead\Curse\CurseTarget.mdl]]},
        wraithguard = {hero = "putress", tags = {"근접"}, engine = "orbit", element = "어둠",
            cursedBonus = {0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3}, model = [[Abilities\Weapons\AvengerMissile\AvengerMissile.mdl]]},
        shadowscythe = {hero = "putress", tags = {"관통"}, engine = "boomerang", element = "어둠", projectile = true,
            curse = {1, 1, 1, 1, 1, 1, 1}, returnBonus = {0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5},
            model = [[Abilities\Spells\NightElf\shadowstrike\shadowstrike.mdl]], modelScale = 1.6, opaque = true},
        plaguejar = {hero = "putress", tags = {"낙하", "폭발"}, engine = "meteor", element = "연금술", falling = true,
            poison = {1, 1, 1, 1, 1, 1, 1}, reaction = {1, 1, 1, 1, 1, 1, 1},
            throwModel = [[Abilities\Spells\Other\StrongDrink\BrewmasterMissile.mdl]], throwScale = 2.6, throwTint = {255, 0, 255}},
        catalyst = {hero = "putress", tags = {"폭발"}, engine = "nova", element = "연금술",
            reaction = {1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5}, model = [[abilities\spells\undead\shadownova\shadownova.mdl]]},
        boilingflask = {hero = "putress", tags = {"유도", "연쇄"}, engine = "orb", element = "연금술", projectile = true,
            reaction = {1, 1, 1, 1, 1, 1, 1}, model = [[Abilities\Weapons\RedDragonBreath\RedDragonMissile.mdl]], modelScale = 1.4},
        acidvials = {hero = "putress", tags = {"낙하"}, engine = "strike", element = "연금술", falling = true,
            reaction = {1, 1, 1, 1, 1, 1, 1}, model = [[Abilities\Spells\Other\AcidBomb\BottleImpact.mdl]],
            throwModel = [[Abilities\Spells\Other\AcidBomb\BottleMissile.mdl]]},
        banshee = {hero = "anya", tags = {"소환"}, engine = "summon", element = "얼음", summonKind = "banshee", opaque = true,
            model = [[Units\Undead\Banshee\Banshee.mdl]]},
        shadowarcher = {hero = "anya", tags = {"소환"}, engine = "summon", element = "칼날", summonKind = "archer", opaque = true,
            model = [[Units\Creeps\SkeletonArcher\SkeletonArcher.mdl]]},
        plaguezombie = {hero = "putress", tags = {"소환"}, engine = "summon", element = "독", summonKind = "zombie", opaque = true,
            poison = {1, 1, 2, 2, 2, 3, 3}, model = [[Units\Undead\Ghoul\Ghoul.mdl]]},
        experiment = {hero = "putress", tags = {"소환"}, engine = "summon", element = "연금술", summonKind = "brute", opaque = true,
            model = [[Units\Undead\Abomination\Abomination.mdl]]},
    },
    -- One colour per weapon school: UI tags use the hex colour; tint multiplies
    -- that school's effect models so poison (green), dark and alchemy stay apart.
    elements = {
        ["화염"] = {color = "ff8040"}, ["번개"] = {color = "80d0ff"}, ["칼날"] = {color = "d8d8e0"},
        ["얼음"] = {color = "6fa8ff", label = "냉기"}, ["독"] = {color = "80ff60"},
        ["어둠"] = {color = "b080ff", tint = {190, 130, 255}}, ["연금술"] = {color = "ffa040", tint = {255, 170, 70}},
    },
    -- Delivery tag text colours, shared by setup, growth cards and native tooltips.
    weaponTagColors = {
        ["유도"] = "ffb86b", ["관통"] = "64d8ff", ["근접"] = "ffa3b8", ["장판"] = "9cdb70",
        ["낙하"] = "b9b4ff", ["폭발"] = "ff786b", ["연쇄"] = "ffe66d", ["소환"] = "6ee7c7",
    },
    -- Status effects applied by Putress weapons (draft values).
    status = {poisonDamage = 6, poisonTick = 0.5, poisonMax = 12, poisonDuration = 4,
        curseAmp = 0.08, curseMax = 3, curseDuration = 4, reactionDamage = 18, reactionCooldown = 0.5},
    -- Blend with each enemy's original RGB; slow/freeze takes priority over poison, then curse.
    statusColors = {strength = 0.6, slow = {100, 175, 255}, poison = {130, 230, 120}, curse = {190, 140, 240}},
    -- Bezier throws: control point height = distance * arc (clamped); flight time grows with distance.
    throw = {arc = 0.35, minHeight = 120, maxHeight = 320, minFlight = 0.55, maxFlight = 0.8, flightRange = 800,
        model = [[Abilities\Spells\Other\AcidBomb\BottleMissile.mdl]]},
    -- Every weapon's derived stats live in stats.weapons[id] (SurvivorAugments.Calculate).
    -- A core engine has its own growth formulas and a base: its reference weapon (Anya's)
    -- uses the base as is and keeps the engine's default visuals; another weapon on that
    -- engine overrides some base keys in weaponBases. Profile engines grow every weapon
    -- from its weaponProfiles entry instead.
    -- cast = the SurvivorCombat function; single = the count reduced to 1 for each
    -- multicast extra attack; volley casts base and extra blades together (no snapshot);
    -- carry keeps overshoot time so zones never drift.
    -- rewardFields: the stats a boss reward must improve for this engine ("-" = lower is better);
    -- see SurvivorEquipment HelpfulBossIndex. damageLabel renames 피해 on growth cards.
    weaponEngines = {
        missile = {weapon = "firebolt", cast = "FireMissile", single = "count", rewardFields = {"damage", "count", "range", "-interval"},
            base = {interval = 0.8, damage = 40, speed = 850, range = 1000, lifetime = 5, hitRadius = 32}},
        zone = {weapon = "flamefield", cast = "CreateZone", carry = true, rewardFields = {"damage", "radius", "duration", "-interval"},
            base = {interval = 4.0, duration = 3.0, radius = 230, damage = 12, pulse = 0.5}},
        chain = {weapon = "chainlightning", cast = "CastChainLightning", rewardFields = {"damage", "targets", "range", "jumpRange", "-interval"},
            base = {interval = 2.2, damage = 45, range = 750, jumpRange = 350}},
        orbit = {weapon = "orbitblade", cast = "CastBlades", volley = true, rewardFields = {"damage", "count", "radius", "duration", "-interval"},
            base = {damage = 30, radius = 180, period = 2.4, hitRadius = 65, hitInterval = 0.45, interval = 5.0, duration = 3.0}},
        strike = {weapon = "monsoon", cast = "CastMonsoon", single = "count", rewardFields = {"damage", "count", "range", "radius", "-interval"},
            base = {interval = 3.2, damage = 55, range = 800, radius = 150}},
        cone = {weapon = "frontslash", cast = "CastFrontSlash", rewardFields = {"damage", "range", "angle", "duration", "-interval"},
            base = {interval = 1.8, damage = 65, range = 320, angle = 100}},
        pierce = {weapon = "frostshard", cast = "FireFrostShard", rewardFields = {"damage", "pierce", "slowDuration", "-interval"},
            base = {interval = 1.6, damage = 30, speed = 650, range = 900, lifetime = 2.0, hitRadius = 45, slow = 0.30, slowDuration = 2.0}},
        nova = {profile = true}, field = {profile = true},
        meteor = {profile = true, rewardFields = {"damage", "radius", "range", "-interval"}, damageLabel = "충돌 피해"},
        summon = {profile = true, damageLabel = "소환 피해"},
        orb = {profile = true}, boomerang = {profile = true},
    },
    -- Core-engine Putress weapons override their engine's base values.
    weaponBases = {
        plaguedart = {damage = 18, interval = 1.4, slow = 0, slowDuration = 0},
        plaguetrail = {damage = 6, interval = 4.0, radius = 200},
        corrosion = {damage = 30, interval = 2.0, range = 300},
        deathcoil = {damage = 34, interval = 1.0},
        soulchain = {damage = 36, interval = 2.4},
        wraithguard = {damage = 24},
        acidvials = {damage = 40, interval = 3.0, radius = 130},
    },
    -- World Z = terrain Z + current fly height + model-relative height.
    missileLaunchHeight = 70, missileImpactHeight = 60,
    -- Optional rawcode -> body aim height overrides for differently sized models.
    missileImpactHeightByType = {},
    warningModel = [[Abilities\Weapons\FireBallMissile\FireBallMissile.mdl]],
    meteorModel = [[Abilities\Weapons\FireBallMissile\FireBallMissile.mdl]],
    meteorImpactModel = [[Objects\Spawnmodels\Other\NeutralBuildingExplosion\NeutralBuildingExplosion.mdl]],
    missileModel = [[Abilities\Weapons\SearingArrow\SearingArrowMissile.mdl]],
    zoneModel = "Abilities\\Spells\\Human\\FlameStrike\\FlameStrike1.mdl",
    chainFalloff = 0.85,
    chainHitModel = [[Abilities\Weapons\Bolt\BoltImpact.mdl]],
    chainHitScale = 0.8, chainHitDuration = 0.45,
    bladeModel = "Abilities\\Weapons\\GlaiveMissile\\GlaiveMissile.mdl",
    monsoonModel = "Abilities\\Spells\\Other\\Monsoon\\MonsoonBoltTarget.mdl",
    slashModel = "Abilities\\Spells\\Other\\Cleave\\CleaveDamageTarget.mdl",
    -- Per-stage multipliers are explicit so balancing does not change weapon rules.
    stageLife = {1, 2.6, 5.0, 8.5, 13.0}, stageDamage = {1, 1.25, 1.5, 1.8, 2.1},
    stageSpawnRates = {1, 1.35, 1.75, 2.2, 2.7}, stageXP = {1, 1.15, 1.3, 1.45, 1.6},
    stageAttackSpeed = {1, 1.04, 1.08, 1.12, 1.16}, stageMoveSpeed = {1, 1.025, 1.05, 1.075, 1.10},
    stageBossLife = {1, 2.5, 4.5, 7.5, 11.0},
    -- Compositions change encounter roles without introducing unverified rawcodes.
    -- Per-stage rules. Combat, hazards, expedition and stage layout read these fields
    -- instead of branching on stage numbers:
    --   search: expedition point layout (count; angles/distance override the spiral; landmark = one study point)
    --   advantage: the boss mechanic softened by the stage's expedition finding (consumed once)
    --   riskReward: risk-chest offers (epicChance % per card; 100 = epic only)
    --   lava (hazard timing), meleeScale, enrage (boss life fraction, blast interval), bossSupport
    encounters = {
        {ranged = 15, flying = 0, rangedStart = 45, flyingStart = 90,
            meleeSpeed = 1, meleeLife = 1, meleeName = "폐허 배회자", rangedName = "썩은 활잡이", flyingName = "폐허 가고일", bossName = "시체 수집자", pattern = "target",
            search = {count = 3}, advantage = {pattern = "target", blastDelay = 1},
            riskReward = {label = "희귀 이상", epicChance = 20}},
        {ranged = 45, flying = 10, rangedStart = 15, flyingStart = 90,
            meleeSpeed = 1.15, meleeLife = 0.85, meleeName = "잿더미 구울", rangedName = "불씨 술사", flyingName = "잿빛 가고일", bossName = "불타는 도살자", pattern = "dash",
            search = {count = 4, angles = {2.95, 2.2, 0.95, 0.2}, distance = 1050}, advantage = {special = "dash", noTrail = true},
            riskReward = {label = "희귀 이상", epicChance = 20}, lava = {first = 35, interval = 22, delay = 1.8}},
        {ranged = 15, flying = 45, rangedStart = 20, flyingStart = 10,
            meleeSpeed = 1, meleeLife = 1, meleeName = "서리 망령", rangedName = "냉기 강령술사", flyingName = "서리날개 가고일", bossName = "납골당 파수꾼", pattern = "wave",
            search = {count = 1, landmark = true}, advantage = {special = "wave", gapWidth = math.pi},
            riskReward = {label = "영웅 등급", epicChance = 100}},
        {ranged = 30, flying = 20, rangedStart = 10, flyingStart = 30,
            meleeSpeed = 0.85, meleeLife = 1.6, meleeName = "해골 추적병", rangedName = "저주의 사수", flyingName = "비명 밴시", bossName = "추적대장", pattern = "cross",
            search = {count = 3}, advantage = {cancelsSupport = true}, meleeScale = 1.2,
            bossSupport = {every = 4, delay = 2, kinds = {"ranged", "ranged", "melee"}},
            riskReward = {label = "영웅 등급", epicChance = 100}},
        {ranged = 35, flying = 30, rangedStart = 0, flyingStart = 0,
            meleeSpeed = 1.1, meleeLife = 1.2, meleeName = "사슬 근위병", rangedName = "지배의 강령술사", flyingName = "하수구 망령", bossName = "사슬의 감시자", pattern = "cycle",
            search = {count = 3}, advantage = {special = "chains", openCenterLane = true}, enrage = {life = 0.5, blastInterval = 3.5},
            riskReward = {label = "영웅 등급", epicChance = 100}},
    },
    -- Profile-engine weapons: base values for the shared profile growth formulas.
    weaponProfiles = {
        banshee = {interval = 7.5, damage = 22, radius = 130, range = 600, duration = 6, speed = 300, pulse = 1.8, slow = 0.25, count = 1, cap = 3},
        shadowarcher = {interval = 7.5, damage = 30, radius = 24, range = 700, duration = 6, speed = 300, pulse = 1.1, slow = 0, count = 1, cap = 3},
        plaguezombie = {interval = 7.5, damage = 12, radius = 70, range = 550, duration = 6, speed = 280, pulse = 1.2, slow = 0, count = 2, cap = 4},
        experiment = {interval = 8, damage = 70, radius = 170, range = 550, duration = 6, speed = 240, pulse = 2.2, slow = 0, count = 1, countGrowth = 0, cap = 2},
        frostnova = {interval = 4, damage = 38, radius = 280, range = 280, duration = 2.5, speed = 1, pulse = 1, slow = 0.45},
        blizzard = {interval = 6, damage = 20, radius = 240, range = 750, duration = 3, speed = 1, pulse = 0.6, slow = 0.2},
        meteor = {interval = 5.5, damage = 110, radius = 220, range = 800, duration = 2, speed = 1, pulse = 0.5, slow = 0},
        thunderorb = {interval = 3, damage = 20, radius = 150, range = 850, duration = 2.5, speed = 400, pulse = 0.35, slow = 0, chainInterval = 0.8, chainRange = 260, chainFraction = 0.35},
        returnblade = {interval = 2.8, damage = 42, radius = 60, range = 650, duration = 3, speed = 650, pulse = 1, slow = 0},
        plaguepool = {interval = 5, damage = 8, radius = 220, range = 750, duration = 4, speed = 1, pulse = 0.5, slow = 0.15},
        plaguejar = {interval = 5, damage = 70, radius = 200, range = 800, duration = 2, speed = 1, pulse = 0.5, slow = 0},
        catalyst = {interval = 3.5, damage = 45, radius = 200, range = 650, duration = 0.5, speed = 1, pulse = 1, slow = 0},
        boilingflask = {interval = 3.5, damage = 14, radius = 140, range = 700, duration = 3, speed = 380, pulse = 0.4, slow = 0, chainInterval = 0.8, chainRange = 260, chainFraction = 0.35},
        shadowscythe = {interval = 3, damage = 38, radius = 60, range = 650, duration = 3, speed = 650, pulse = 1, slow = 0},
    },
    frostModel = "Abilities\\Spells\\Other\\FrostArrows\\NagaColdArrowMissile.mdl",
}

SurvivorConfig.heroes.anya.startingWeapons = SurvivorConfig.startingWeapons
do
    local c, listed = SurvivorConfig, {}
    -- Profile engines share one boss-reward stat list unless they name their own.
    for _, engine in pairs(c.weaponEngines) do
        engine.rewardFields = engine.rewardFields
            or {"damage", "radius", "range", "duration", "slowDurationBonus", "-interval"}
    end
    for _, id in ipairs(c.weaponOrder) do
        local weapon = assert(c.weapons[id], "Unregistered weapon " .. id)
        assert(c.heroes[weapon.hero] and c.weaponEngines[weapon.engine], "Invalid weapon registry entry " .. id)
        listed[id] = true
    end
    for id in pairs(c.weapons) do assert(listed[id], "Weapon missing from cast order " .. id) end
    for id, weapon in pairs(c.weapons) do
        local engine = c.weaponEngines[weapon.engine]
        assert((engine.profile == true) == (c.weaponProfiles[id] ~= nil), "Profile engines need a weaponProfiles entry " .. id)
        assert(engine.profile or engine.weapon == id or c.weaponBases[id], "Core-engine weapon needs base overrides " .. id)
    end
    for id, overrides in pairs(c.weaponBases) do
        local engine = c.weaponEngines[c.weapons[id].engine]
        assert(not engine.profile and engine.weapon ~= id, "Base overrides belong to a secondary core-engine weapon " .. id)
        for key in pairs(overrides) do assert(engine.base[key] ~= nil, "Unknown base override " .. id .. "." .. key) end
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

-- The playing hero's id and profile, read from its unit type (default hero otherwise).
function SurvivorConfig.HeroOf(unit)
    local typeId = unit and GetUnitTypeId(unit)
    for _, id in ipairs(SurvivorConfig.heroOrder) do
        if SurvivorConfig.heroes[id].unitId == typeId then return id, SurvivorConfig.heroes[id] end
    end
    return SurvivorConfig.defaultHero, SurvivorConfig.heroes[SurvivorConfig.defaultHero]
end
-- The single human player who owns the run.
function SurvivorConfig.Owner()
    return Player(SurvivorConfig.playerId)
end
-- Guards local-only presentation; reads GetLocalPlayer on every call rather than caching it.
function SurvivorConfig.IsLocalPlayer()
    return GetLocalPlayer() == SurvivorConfig.Owner()
end
-- Frame lookups can return nil, 0 or a released handle.
function SurvivorConfig.ValidFrame(frame)
    return frame ~= nil and frame ~= 0 and GetHandleId(frame) ~= 0
end
-- A unit handle that still refers to a unit (removed units report type 0).
function SurvivorConfig.UnitExists(unit)
    return unit ~= nil and GetUnitTypeId(unit) ~= 0
end
function SurvivorConfig.UnitLive(unit)
    return SurvivorConfig.UnitExists(unit) and UnitAlive(unit)
end
-- An item handle that still refers to an item (removed items report type 0).
function SurvivorConfig.ItemExists(item)
    return item ~= nil and GetItemTypeId(item) ~= 0
end
-- Callers that collect cleanup errors keep their own existence check outside or inside the attempt.
function SurvivorConfig.RemoveItemIfPresent(item)
    if SurvivorConfig.ItemExists(item) then RemoveItem(item) end
end
-- Terrain height at a point. One map-lifetime probe serves every module; never remove it.
local terrainProbe = nil
function SurvivorConfig.TerrainZ(x, y)
    if terrainProbe == nil then terrainProbe = Location(x, y) else MoveLocation(terrainProbe, x, y) end
    return GetLocationZ(terrainProbe)
end
-- Presentation (cues, notices, speech, screen flashes) called from hit, death or
-- pickup loops. Like the screen-effect reset in SurvivorUI.BeginRun, a failure is
-- reported but never ends the run; gameplay state changes stay outside this call.
function SurvivorConfig.Present(label, action, ...)
    local ok, message = pcall(action, ...)
    if not ok then print("[AnyasLongNight presentation] " .. label .. ": " .. tostring(message)) end
    return ok
end
-- Owner-only frame event. Bootstrap loads before the run owner, so the caller
-- passes the failure handler (gameplay modules pass RunSession.Fail).
function SurvivorConfig.BindFrameEvent(triggers, frame, event, callback, onError)
    assert(type(onError) == "function", "Frame events need a failure handler")
    local trigger = CreateTrigger()
    triggers[#triggers + 1] = trigger
    BlzTriggerRegisterFrameEvent(trigger, frame, event)
    TriggerAddAction(trigger, function()
        if GetTriggerPlayer() ~= SurvivorConfig.Owner() then return end
        local ok, message = pcall(callback)
        if not ok then onError(message) end
    end)
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
