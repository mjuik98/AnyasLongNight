-- Import at map script scope, before main() runs. TotalInitialization starts us.
-- Prototype: one human player, movement by right-click, autonomous Lua attacks.
HeroSurvivor = {}
do
    local initialized, hero = false, nil
    local build, stats, offers = nil, nil, nil
    local kills = 0
    local rewardLevel, rerollsRemaining = nil, 0
    -- This is a reward queue, not a second level/XP system. The unit owns both.
    local queuedLevels, queueHead, observedLevel = {}, 1, 1
    local levelTrigger
    local spawnBudget, enemyClock, hudClock, choiceGrace = 0, 0, 0, 0
    local debugTrigger
    local nextElite = 0
    local bossStarted = false
    local stage, stageStarted, bossEngagedAt = 1, 0, nil
    local weaponClocks = {}
    local boardClock = 0
    local selectedHero, selectedDifficulty, selectedWeapon, selectedTrinket, setupPhase = SurvivorConfig.defaultHero
    local storySummary = false
    local stageRecords, stageStartKills = {}, 0
    local gearOffers
    local eventOffers
    local stageTransition, nextHazard = false, 35
    local runSerial = 0
    local firstEvolution, peakEnemies, peakVisuals = nil, 0, 0

    local function RefreshDamageBoard()
        if build then SurvivorUI.UpdateDamageBoard(build, stage, RunSession.GetElapsed() - stageStarted, rerollsRemaining, selectedDifficulty) end
        SurvivorUI.UpdateExpedition()
    end

    local function ResultDetails(cleared)
        if not hero or not build or GetUnitTypeId(hero) == 0 then return nil end
        local elapsed, level = RunSession.GetElapsed(), GetHeroLevel(hero)
        if not stageRecords[stage] then
            stageRecords[stage] = {level = level, duration = elapsed - stageStarted,
                kills = kills - stageStartKills, bossTime = bossEngagedAt and elapsed - bossEngagedAt or nil,
                cleared = cleared, escapes = SurvivorCombat.StageEscapeUses(stage)}
        end
        -- Copy display values before finish removes the hero/build.
        local details = {difficulty = SurvivorConfig.difficulties[selectedDifficulty].name, level = level,
            stages = {}, weapons = {}, trinkets = {},
            journalChapters = SurvivorStory.JournalChapters(),
            firstEvolution = firstEvolution, peakEnemies = peakEnemies, peakVisuals = peakVisuals}
        local _, _, escapeUses = SurvivorCombat.EscapeStatus()
        details.escapeUses = escapeUses
        details.damageHistory, details.damageHint = SurvivorCombat.DamageHistory()
        for i, record in ipairs(stageRecords) do
            details.stages[i] = {level = record.level, duration = record.duration, kills = record.kills,
                bossTime = record.bossTime, cleared = record.cleared, escapes = record.escapes}
        end
        for _, id in ipairs(build.weapons) do
            local text = SurvivorAugments.Get(id).name .. " Lv." .. SurvivorAugments.Level(build, id)
            local evolution = build.evolutions[id]
            if evolution then text = text .. " → " .. SurvivorAugments.Get(evolution).name end
            details.weapons[#details.weapons + 1] = text
        end
        for _, id in ipairs(build.trinkets) do
            details.trinkets[#details.trinkets + 1] = SurvivorAugments.Get(id).name .. " Lv." .. SurvivorAugments.Level(build, id)
        end
        return details
    end

    local function ClearProgression()
        local oldTrigger = levelTrigger
        levelTrigger = nil
        queuedLevels, queueHead = {}, 1
        if oldTrigger ~= nil then DestroyTrigger(oldTrigger) end
    end
    local function Attempt(errors, label, action)
        local ok, result = pcall(action)
        if not ok then errors[#errors + 1] = label .. ": " .. tostring(result) end
        return ok, result
    end
    local function CleanupRun(errors)
        runSerial = runSerial + 1 -- Invalidate preparation callbacks before native cleanup.
        Attempt(errors, "progression", ClearProgression)
        Attempt(errors, "hide UI", SurvivorUI.HidePanel)
        Attempt(errors, "story", SurvivorStory.Cleanup)
        Attempt(errors, "inventory observer", SurvivorInventoryPause.Cleanup)
        -- Detach the camera before removing its target, even if scene cleanup failed.
        Attempt(errors, "camera", function()
            if GetLocalPlayer() == Player(SurvivorConfig.playerId) then ResetToGameCamera(0) end
        end)
        Attempt(errors, "native loadout", SurvivorNativeLoadout.Cleanup)
        Attempt(errors, "equipment", SurvivorEquipment.Cleanup)
        Attempt(errors, "combat", SurvivorCombat.Cleanup)
        Attempt(errors, "stage", SurvivorStage.Cleanup)
        hero, build, stats, offers = nil, nil, nil, nil
        rewardLevel, rerollsRemaining, stageTransition = nil, 0, false
    end
    local function QueueLevelRewards()
        if hero == nil or GetUnitTypeId(hero) == 0 then return end
        local actualLevel = GetHeroLevel(hero)
        for gained = observedLevel + 1, actualLevel do queuedLevels[#queuedLevels + 1] = gained end
        observedLevel = actualLevel
        -- Augments replace the standard skill-learning reward on every level.
        local points = GetHeroSkillPoints(hero)
        if points > 0 then UnitModifySkillPoints(hero, -points) end
    end
    local function AwardXP(amount)
        if not RunSession.IsRunning() or hero == nil or not UnitAlive(hero) then return end
        assert(type(amount) == "number" and amount >= 0, "Invalid XP reward")
        amount = math.floor(amount)
        if amount == 0 then return end
        -- Keep automatic kill XP suspended outside this synchronous native call.
        local recipient = hero
        SuspendHeroXP(recipient, false)
        local ok, message = pcall(AddHeroXP, recipient, amount, true)
        if GetUnitTypeId(recipient) ~= 0 then SuspendHeroXP(recipient, true) end
        if not ok then error(message) end
        -- Also reconcile multi-level jumps; the event may fire once or repeatedly.
        QueueLevelRewards()
    end
    local function Finish(reason)
        stageTransition = false
        gearOffers, eventOffers = nil, nil
        local errors, details, report = {}, nil, nil
        Attempt(errors, "expedition", SurvivorExpedition.EndStage)
        Attempt(errors, "damage board", RefreshDamageBoard)
        local ok, value = Attempt(errors, "result details", function() return ResultDetails(reason == "boss_defeated") end)
        if ok then details = value end
        ok, value = Attempt(errors, "damage report", SurvivorCombat.DamageReport)
        if ok then report = value end
        local bossTime = bossEngagedAt and RunSession.GetElapsed() - bossEngagedAt or nil
        CleanupRun(errors)
        Attempt(errors, "result UI", function()
            SurvivorUI.ShowResult(#errors > 0 and "error" or reason, RunSession.GetElapsed(), kills, stage, bossTime, report, details)
        end)
        -- Surface every failure only after all cleanup and the result fallback were tried.
        if #errors > 0 then error(table.concat(errors, "\n"), 0) end
    end
    local function ShowChoice()
        SurvivorUI.ShowChoices(offers, rewardLevel, build, #queuedLevels - queueHead + 1, rerollsRemaining)
    end
    local function BeginChoice()
        if queueHead > #queuedLevels then return end
        SurvivorEquipment.Reconcile()
        offers = SurvivorAugments.Roll(build)
        if RunSession.GetState() == "CHOOSING" or RunSession.BeginChoice() then
            rewardLevel = queuedLevels[queueHead]
            queueHead = queueHead + 1
            ShowChoice()
        else offers, rewardLevel = nil, nil end
    end
    local function Reroll(index)
        if RunSession.GetState() ~= "CHOOSING" or offers == nil or rerollsRemaining <= 0 then return end
        if SurvivorAugments.Reroll(build, offers, index) then
            rerollsRemaining = rerollsRemaining - 1
        end
        -- No level reward is consumed and combat stays paused during the redraw.
        ShowChoice()
    end
    local function Choose(index)
        if RunSession.GetState() ~= "CHOOSING" or offers == nil or offers[index] == nil then return end
        local selected = offers[index]
        offers, rewardLevel = nil, nil -- Consume once, before callbacks or combat resume.
        SurvivorAugments.Apply(selected, build, hero)
        if not firstEvolution and SurvivorAugments.Get(selected).kind == "evolution" then
            firstEvolution = {time = RunSession.GetElapsed(), level = GetHeroLevel(hero), name = SurvivorAugments.Get(selected).name}
            SurvivorUI.Cue("evolution")
        end
        SurvivorCombat.TrackWeapons(build.weapons)
        SurvivorNativeLoadout.Refresh()
        RefreshDamageBoard()
        if queueHead <= #queuedLevels then
            -- Keep units, missiles and gameplay time frozen for all queued choices.
            BeginChoice()
            return
        end
        queuedLevels, queueHead = {}, 1
        SurvivorUI.HidePanel()
        choiceGrace = 0.25
        RunSession.EndChoice()
    end
    local function Exclude(index)
        if RunSession.GetState() ~= "CHOOSING" or offers == nil then return end
        SurvivorAugments.Exclude(build, offers, index)
        -- Excluding replaces only this card; no reroll or queued level is consumed.
        ShowChoice()
    end
    local function SpawnWave(dt, stageElapsed)
        local rate = SurvivorConfig.SpawnRate(selectedDifficulty, stage, stageElapsed)
        if SurvivorExpedition.RiskActive() then rate = rate * 1.35 end
        if bossStarted or rate == 0 then spawnBudget = 0; return end
        spawnBudget = spawnBudget + rate * dt
        local whole = math.floor(spawnBudget)
        spawnBudget = spawnBudget - whole
        -- Never retain failed spawns, or release an accumulated wave after the actor cap clears.
        for _ = 1, math.min(4, whole) do
            if not SurvivorCombat.Spawn() then spawnBudget = 0; break end
        end
    end
    local function ChooseGear(index)
        if RunSession.GetState() ~= "STAGE_CLEAR" or not gearOffers or not gearOffers[index] then return end
        local id = gearOffers[index]
        gearOffers = nil -- Consume before granting the item; duplicate clicks cannot grant twice.
        assert(SurvivorEquipment.ClaimReward(id), "Boss reward could not be granted")
        SurvivorUI.HidePanel()
        local elapsed = RunSession.GetElapsed()
        SurvivorUI.ShowResult("stage_clear", elapsed, kills, stage,
            bossEngagedAt and elapsed - bossEngagedAt or nil, SurvivorCombat.DamageReport(), ResultDetails(true))
    end
    local function ChooseEventGear(index)
        if RunSession.GetState() ~= "CHOOSING" or not eventOffers or not eventOffers[index] then return end
        local id = eventOffers[index]
        eventOffers = nil
        assert(SurvivorEquipment.ClaimReward(id, "봉인 조사 보상"), "Risk reward could not be granted")
        SurvivorExpedition.RecordReward(id)
        SurvivorUI.HidePanel()
        choiceGrace = 0.25
        RunSession.EndChoice()
        RefreshDamageBoard()
    end
    local function ExpeditionReward(kind)
        if kind == "search" then
            rerollsRemaining = math.min(SurvivorConfig.rerollCapacity, rerollsRemaining + 1)
        elseif kind == "risk" then
            eventOffers = SurvivorEquipment.RollRiskReward()
            assert(RunSession.BeginChoice(), "Risk reward requires running session")
            SurvivorUI.ShowGearRewards(eventOffers, stage, ChooseEventGear, "봉인 경보 해제 · " .. (stage <= 2 and "희귀 이상" or "영웅 등급") .. " 장비 하나 선택")
        end
        RefreshDamageBoard()
    end
    local function Step(dt, elapsed)
        if SurvivorCombat.BossDefeated() then
            if stageTransition then return end
            if RunSession.BeginStageClear() then
                stageTransition = true
                SurvivorExpedition.EndStage()
                SurvivorCombat.ClearBattlefieldAsync(function()
                    if stage == SurvivorConfig.stages then
                        SurvivorInventoryPause.Cleanup()
                        SurvivorStory.ShowEnding(hero, function() RunSession.Finish("boss_defeated") end)
                    else
                        rerollsRemaining = math.min(SurvivorConfig.rerollCapacity, rerollsRemaining + SurvivorConfig.rerollsPerStage)
                        SurvivorEquipment.PrepareRest()
                        RefreshDamageBoard()
                        SurvivorStory.ShowInterlude(stage, hero, function()
                            stageTransition = false
                            gearOffers = SurvivorEquipment.RollBossReward()
                            SurvivorUI.ShowGearRewards(gearOffers, stage, ChooseGear)
                        end)
                    end
                end)
            end
            return
        end
        local stageElapsed = elapsed - stageStarted
        local timing = SurvivorConfig.StageTiming(stage)
        boardClock = boardClock + dt
        if boardClock >= 0.5 then
            boardClock = 0
            local enemies, _, visuals = SurvivorCombat.Counts()
            peakEnemies, peakVisuals = math.max(peakEnemies, enemies), math.max(peakVisuals, visuals)
            RefreshDamageBoard()
        end
        if stageElapsed >= timing.duration then RunSession.Finish("timeout"); return end
        SurvivorExpedition.Step(dt, elapsed)
        if not RunSession.IsRunning() then return end -- A risk reward owns the choice modal.
        if stage == 2 and not bossStarted and stageElapsed < timing.bossStart and stageElapsed >= nextHazard then
            nextHazard = stageElapsed + 22
            SurvivorCombat.WarnLava()
        end
        QueueLevelRewards()
        choiceGrace = math.max(0, choiceGrace - dt)
        if queueHead <= #queuedLevels and choiceGrace == 0 then
            BeginChoice()
            return
        end
        if not bossStarted and stageElapsed >= timing.bossStart then
            bossStarted = SurvivorCombat.SpawnBoss()
            if bossStarted then bossEngagedAt = elapsed end
        end
        -- An unowned weapon has no cooldown accumulation and cannot fire.
        local due = {}
        for _, id in ipairs(SurvivorConfig.weaponOrder) do
            local engine = SurvivorConfig.weaponEngines[SurvivorConfig.weapons[id].engine]
            -- An engine's own weapon is flat on stats; other weapons on it use stats.views.
            local profile = engine.profile and stats.extraWeapons[id]
            local view = not engine.profile and (engine.weapon == id and stats or stats.views and stats.views[id])
            local enabled = profile and profile.enabled or view and view[engine.enabled]
            local clock = enabled and (weaponClocks[id] or 0) + dt or 0
            local interval = enabled and (profile and profile.interval or view[engine.interval])
            if enabled and clock >= interval then
                clock = engine.carry and clock - interval or 0
                due[#due + 1] = id
            end
            weaponClocks[id] = clock
        end
        -- Profile weapons and volleys fire before status upkeep; the rest after this tick's spawns.
        local function Fire(early)
            for _, id in ipairs(due) do
                local engine = SurvivorConfig.weaponEngines[SurvivorConfig.weapons[id].engine]
                if (engine.profile or engine.volley or false) == early then SurvivorCombat.CastWeapon(id) end
            end
        end
        Fire(true)
        SurvivorCombat.UpdateWeapons(dt)
        enemyClock, hudClock = enemyClock + dt, hudClock + dt
        SpawnWave(dt, stageElapsed)
        Fire(false)
        if enemyClock >= 0.5 then
            enemyClock = 0
            SurvivorCombat.UpdateEnemies(elapsed)
            if not bossStarted and stageElapsed < timing.bossStart and stageElapsed >= nextElite then
                nextElite = (math.floor(stageElapsed / SurvivorConfig.eliteInterval) + 1) * SurvivorConfig.eliteInterval
                SurvivorCombat.Spawn(true)
            end
        end
        if hudClock >= 0.1 then
            hudClock = 0
            SurvivorEquipment.Step(elapsed)
            SurvivorNativeLoadout.Refresh()
        end
    end
    local function ShowStageIntroduction(startingWeapon, startingTrinket)
        local expectedHero, expectedStage, expectedRun = hero, stage, runSerial
        local prepared, resumed = false, false
        local function SameTransition()
            return not resumed and runSerial == expectedRun and hero == expectedHero and stage == expectedStage
                and stageTransition and RunSession.GetState() == "STAGE_CLEAR"
                and expectedHero ~= nil and GetUnitTypeId(expectedHero) ~= 0 and UnitAlive(expectedHero)
        end
        local function CanStart()
            return SameTransition() and not RunSession.IsInventoryOpen()
        end
        SurvivorUI.ShowStageIntro(expectedStage, function()
            if prepared or not SameTransition() then return end
            prepared = true -- An old intro completion cannot replace a live preparation/countdown.
            SurvivorNativeLoadout.GrantStageTalent(expectedStage)
            SurvivorUI.ShowCombatPreparation(expectedStage, function()
                    if not CanStart() then return false end
                    resumed = true
                    stageTransition = false -- Consume once, only after the preparation countdown completes.
                    if not RunSession.EndStageClear() or not RunSession.IsRunning() then return false end
                    if startingWeapon then
                        for _ = 1, 3 do SurvivorCombat.Spawn() end
                        SurvivorCombat.CastWeapon(startingWeapon)
                        SurvivorUI.Notify(SurvivorStage.Get(expectedStage).name)
                    else
                        SurvivorUI.Notify(SurvivorStage.Get(expectedStage).name .. " · 생명력 회복")
                    end
                    RefreshDamageBoard()
                    return true
                end, CanStart)
        end, expectedHero)
    end
    function HeroSurvivor.NextStage()
        if RunSession.GetState() ~= "STAGE_CLEAR" or stageTransition or gearOffers or stage >= SurvivorConfig.stages then return false end
        stageTransition, nextHazard = true, 35
        stage, stageStarted, bossEngagedAt = stage + 1, RunSession.GetElapsed(), nil
        stageStartKills = kills
        SurvivorEquipment.SetStage(stage)
        SurvivorEquipment.Reconcile()
        SurvivorNativeLoadout.Refresh()
        SurvivorCombat.BeginStage(stage, stageStarted)
        SurvivorStage.Apply(stage)
        SurvivorExpedition.BeginStage(hero, stage, stageStarted, ExpeditionReward)
        SurvivorEquipment.CarryGroundToStage()
        nextElite, bossStarted = SurvivorConfig.eliteInterval, false
        weaponClocks, spawnBudget, enemyClock, hudClock = {}, 0, 0, 0
        ShowStageIntroduction()
        return true
    end
    local function Start(startingWeapon, startingTrinket)
        runSerial = runSerial + 1
        stageTransition, nextHazard = false, 35
        gearOffers = nil
        RunSession.Finish("restarted")
        SurvivorUI.HidePanel()
        SurvivorUI.BeginRun()
        SurvivorStory.Reset()
        SurvivorExpedition.Reset()
        ClearProgression()
        SurvivorInventoryPause.Cleanup()
        SurvivorNativeLoadout.Cleanup()
        SurvivorEquipment.Cleanup()
        SurvivorCombat.Cleanup()
        SurvivorStage.Cleanup()
        local rect = bj_mapInitialPlayableArea -- Borrowed rect: never destroy it.
        local arena = {minX = GetRectMinX(rect) + 128, maxX = GetRectMaxX(rect) - 128,
            minY = GetRectMinY(rect) + 128, maxY = GetRectMaxY(rect) - 128}
        assert(arena.maxX - arena.minX > 2000 and arena.maxY - arena.minY > 2000,
            "Use a flat map of at least 64 x 64 terrain tiles")
        local x, y = (arena.minX + arena.maxX) / 2, (arena.minY + arena.maxY) / 2
        assert(not IsTerrainPathable(x, y, PATHING_TYPE_WALKABILITY), "Map center must be walkable")
        build = SurvivorAugments.NewBuild(startingWeapon, startingTrinket, selectedHero)
        for index = 1, SurvivorConfig.stages do
            local timing = SurvivorConfig.StageTiming(index)
            assert(timing.bossStart > 0 and timing.bossStart < timing.duration,
                "Boss must spawn before the stage deadline")
        end
        stats, offers = build.stats, nil
        SurvivorStage.Init(arena)
        SurvivorStage.Apply(1)
        assert(type(SurvivorConfig.rerollsPerRun) == "number" and SurvivorConfig.rerollsPerRun >= 0
            and SurvivorConfig.rerollsPerRun < math.huge and SurvivorConfig.rerollsPerRun % 1 == 0, "Invalid reroll limit")
        rewardLevel, rerollsRemaining = nil, SurvivorConfig.rerollsPerRun
        boardClock = 0
        kills = 0
        stageRecords, stageStartKills = {}, 0
        firstEvolution, peakEnemies, peakVisuals = nil, 0, 0
        stage, stageStarted, bossEngagedAt, weaponClocks = 1, 0, nil, {}
        nextElite = SurvivorConfig.eliteInterval
        bossStarted = false
        spawnBudget, enemyClock, hudClock, choiceGrace = 0, 0, 0, 0
        hero = CreateUnit(Player(SurvivorConfig.playerId), SurvivorConfig.heroes[selectedHero].unitId, x, y, 270)
        assert(hero ~= nil, "Hero object ID is missing")
        -- Combat takes ownership immediately, including during partial startup failure.
        SurvivorCombat.Init(hero, stats, arena, function(dead, elite, isBoss)
            local ok, message = pcall(function()
                kills = kills + 1
                if isBoss then return end -- Victory is handled by the next gameplay step.
                SurvivorExpedition.OnKill(dead, isBoss)
                AwardXP((elite and SurvivorConfig.eliteExperience
                    or SurvivorConfig.enemyExperienceByType[GetUnitTypeId(dead)] or SurvivorConfig.enemyExperience) * SurvivorConfig.stageXP[stage])
                SurvivorEquipment.OnKill(dead, elite)
            end)
            if not ok then RunSession.Fail(message) end
        end, function() RunSession.Finish("defeated") end, selectedDifficulty)
        BlzSetHeroProperName(hero, SurvivorConfig.heroes[selectedHero].name)
        SuspendHeroXP(hero, true)
        observedLevel = GetHeroLevel(hero)
        QueueLevelRewards()
        levelTrigger = CreateTrigger()
        TriggerRegisterPlayerUnitEvent(levelTrigger, Player(SurvivorConfig.playerId), EVENT_PLAYER_HERO_LEVEL, nil)
        TriggerAddAction(levelTrigger, function()
            if GetTriggerUnit() ~= hero then return end
            -- Defer the modal UI to Step, outside Warcraft's level-up/death event.
            local ok, message = pcall(QueueLevelRewards)
            if not ok then RunSession.Fail(message) end
        end)
        BlzUnitDisableAbility(hero, FourCC("Aatk"), true, true)
        BlzUnitDisableAbility(hero, FourCC("AHer"), true, true)
        BlzSetUnitMaxHP(hero, SurvivorConfig.heroLife)
        SetWidgetLife(hero, SurvivorConfig.heroLife)
        SetUnitMoveSpeed(hero, stats.moveSpeed)
        SurvivorEquipment.Init(hero, build)
        SetWidgetLife(hero, BlzGetUnitMaxHP(hero)) -- Start at full HP, including the chosen vitality trinket.
        SurvivorNativeLoadout.Init(hero, build)
        SurvivorExpedition.BeginStage(hero, 1, 0, ExpeditionReward)
        assert(RunSession.Start(Step, {
            pause = function(reason)
                SurvivorCombat.SetPaused(true, reason)
                SurvivorExpedition.SetPaused(true)
                SurvivorUI.UpdateExpedition()
            end,
            resume = function()
                SurvivorCombat.SetPaused(false)
                SurvivorExpedition.SetPaused(false)
                SurvivorUI.UpdateExpedition()
            end,
            finish = Finish,
        }), "Could not start run")
        SurvivorCombat.TrackWeapons(build.weapons)
        RefreshDamageBoard()
        SurvivorInventoryPause.Init()
        if GetLocalPlayer() == Player(SurvivorConfig.playerId) then
            ClearSelection()
            SelectUnit(hero, true)
            SetCameraPosition(x, y)
            SetCameraTargetController(hero, 0, 0, false)
        end
        stageTransition = true
        RunSession.BeginStageClear()
        ShowStageIntroduction(startingWeapon, startingTrinket)
        SurvivorNativeLoadout.Refresh()
    end
    local function CanSetup()
        local state = RunSession.GetState()
        return setupPhase ~= nil and (state == "READY" or state == "FINISHED")
    end
    local function Allowed(list, id)
        for _, candidate in ipairs(list) do if candidate == id then return true end end
        return false
    end
    local function ShowSetup()
        setupPhase = "MENU"
        SurvivorSetupUI.ShowMenu(selectedDifficulty, selectedWeapon, selectedTrinket, selectedHero)
    end
    function HeroSurvivor.Start()
        assert(initialized, "Start after HeroSurvivor.Init")
        setupPhase = nil
        RunSession.Finish("restarted")
        ShowSetup()
    end
    function HeroSurvivor.IsStorySummary() return storySummary end
    function HeroSurvivor.ToggleStorySummary()
        if not CanSetup() or setupPhase ~= "MENU" then return false end
        storySummary = not storySummary
        SurvivorStory.SetSummaryMode(storySummary)
        ShowSetup()
        return true
    end
    function HeroSurvivor.CanRetrySame()
        return RunSession.GetState() == "FINISHED" and selectedDifficulty ~= nil
            and selectedWeapon ~= nil and selectedTrinket ~= nil
    end
    function HeroSurvivor.RetrySame()
        if not HeroSurvivor.CanRetrySame() then return false end
        setupPhase = "MENU"
        return HeroSurvivor.BeginRun()
    end
    -- The setup screen shows every panel at once; opening a kind only switches its option list.
    function HeroSurvivor.OpenSetup(kind)
        if not CanSetup() or setupPhase ~= "MENU" then return false end
        if kind ~= "HERO" and kind ~= "DIFFICULTY" and kind ~= "WEAPON" and kind ~= "TRINKET" then return false end
        local selections = {HERO = selectedHero, DIFFICULTY = selectedDifficulty, WEAPON = selectedWeapon, TRINKET = selectedTrinket}
        local selected = selections[kind]
        SurvivorSetupUI.ShowOptions(kind, selected, selectedHero)
        return true
    end
    function HeroSurvivor.ResetSetup()
        if not CanSetup() or setupPhase ~= "MENU" then return false end
        selectedDifficulty, selectedWeapon, selectedTrinket = nil, nil, nil
        ShowSetup()
        return true
    end
    function HeroSurvivor.SelectSetup(kind, id)
        if not CanSetup() or setupPhase ~= "MENU" then return false end
        local profile = SurvivorConfig.heroes[id]
        if kind == "HERO" and profile and not profile.locked then
            -- Starting weapons are per hero; trinkets and difficulty are shared.
            if id ~= selectedHero then selectedWeapon = nil end
            selectedHero = id
        elseif kind == "DIFFICULTY" and SurvivorConfig.difficulties[id] then selectedDifficulty = id
        elseif kind == "WEAPON" and Allowed(SurvivorConfig.heroes[selectedHero].startingWeapons, id) then selectedWeapon = id
        elseif kind == "TRINKET" and Allowed(SurvivorConfig.startingTrinkets, id) then selectedTrinket = id
        else return false end
        ShowSetup()
        return true
    end
    function HeroSurvivor.BeginRun()
        assert(initialized, "Start after HeroSurvivor.Init")
        if not CanSetup() or setupPhase ~= "MENU" then return false end
        if not selectedDifficulty or not selectedWeapon or not selectedTrinket then return false end
        setupPhase = nil -- Consume setup once before native creation or callbacks.
        local ok, message = pcall(Start, selectedWeapon, selectedTrinket)
        if not ok then
            RunSession.Fail(message)
            -- Also covers errors before RunSession.Start has acquired its hooks.
            local errors = {}
            Attempt(errors, "expedition", SurvivorExpedition.EndStage)
            CleanupRun(errors)
            Attempt(errors, "result UI", function() SurvivorUI.ShowResult("error", RunSession.GetElapsed(), kills) end)
            for _, failure in ipairs(errors) do print("[HeroSurvivor cleanup] " .. failure) end
        end
        return ok
    end
    function HeroSurvivor.Init()
        if initialized then return end
        assert(ALICE_Initialized, "Initialize after ALICE")
        -- The solo arena remains fully visible during combat, pauses and stage changes.
        FogMaskEnable(false)
        FogEnable(false)
        SurvivorUI.Init(Choose, HeroSurvivor.Start, Reroll, HeroSurvivor.NextStage, Exclude)
        SurvivorSetupUI.Init(HeroSurvivor.OpenSetup, HeroSurvivor.SelectSetup, HeroSurvivor.ResetSetup, HeroSurvivor.BeginRun)
        if SurvivorConfig.debugCommands then
            debugTrigger = CreateTrigger() -- Map lifetime; registered once across restarts.
            TriggerRegisterPlayerChatEvent(debugTrigger, Player(SurvivorConfig.playerId), "-hs", false)
            TriggerAddAction(debugTrigger, function()
                local ok, message = pcall(function()
                    local text = GetEventPlayerChatString()
                    if text == "-hs restart" then HeroSurvivor.Start()
                    elseif text == "-hs perf on" then SurvivorMetrics.Enable(true); print("[HS performance] 측정 시작 / -hs perf 로 확인")
                    elseif text == "-hs perf off" then SurvivorMetrics.Enable(false); SurvivorMetrics.Report()
                    elseif text == "-hs perf" then SurvivorMetrics.Report()
                    elseif text == "-hs inventory" then SurvivorInventoryPause.DebugStatus()
                    elseif text == "-hs ui" then SurvivorUI.DebugStatus()
                    elseif text == "-hs loot" and RunSession.IsRunning() then SurvivorEquipment.DebugDrops()
                    elseif text == "-hs elite" and RunSession.IsRunning() then SurvivorCombat.Spawn(true)
                    elseif text == "-hs ranged" and RunSession.IsRunning() then SurvivorCombat.Spawn(false, "ranged")
                    elseif text == "-hs flying" and RunSession.IsRunning() then SurvivorCombat.Spawn(false, "flying")
                    elseif text == "-hs boss" and RunSession.IsRunning() and not bossStarted then
                        bossStarted = SurvivorCombat.SpawnBoss()
                        if bossStarted then bossEngagedAt = RunSession.GetElapsed() end
                    elseif (text == "-hs weapons" or text == "-hs newweapons" or text == "-hs ice" or text == "-hs additions") and RunSession.IsRunning() then
                        local list = text == "-hs newweapons" and {"monsoon", "frontslash", "frostshard"}
                            or text == "-hs ice" and {"frostshard", "frostnova", "blizzard"}
                            or text == "-hs additions" and {"meteor", "thunderorb", "returnblade"}
                            or {"flamefield", "chainlightning", "orbitblade"}
                        for _, id in ipairs(list) do
                            if SurvivorAugments.Level(build, id) == 0 and SurvivorAugments.CanChoose(id, build) then
                                SurvivorAugments.Apply(id, build, hero)
                            end
                        end
                        SurvivorCombat.TrackWeapons(build.weapons)
                        SurvivorNativeLoadout.Refresh()
                        RefreshDamageBoard()
                    elseif text == "-hs choice" and RunSession.IsRunning() then
                        local before = GetHeroLevel(hero)
                        SetHeroLevel(hero, before + 1, true)
                        QueueLevelRewards()
                        if GetHeroLevel(hero) == before then print("[HeroSurvivor] 맵의 최대 영웅 레벨에 도달했습니다.") end
                    elseif text == "-hs stats" then
                        local enemies, effects = SurvivorCombat.Counts()
                        print(string.format("[HeroSurvivor] %s / %.2fs / enemies=%d / effects=%d / pending=%d",
                            RunSession.GetState(), RunSession.GetElapsed(), enemies, effects, #queuedLevels - queueHead + 1))
                        if hero ~= nil then
                            print(string.format("[HeroSurvivor] stage=%d/%d / stage time=%.1f / hero level=%d / XP=%d", stage, SurvivorConfig.stages, RunSession.GetElapsed() - stageStarted, GetHeroLevel(hero), GetHeroXP(hero)))
                            print(SurvivorCombat.DamageReport())
                        end
                    else
                        local xp = tonumber(text:match("^%-hs xp (%d+)$"))
                        if xp and RunSession.IsRunning() then AwardXP(math.min(xp, 100000)); return end
                        local count = tonumber(text:match("^%-hs spawn (%d+)$"))
                        if count and RunSession.IsRunning() then
                            for _ = 1, math.min(count, SurvivorConfig.maxEnemies) do
                                if not SurvivorCombat.Spawn() then break end
                            end
                        end
                    end
                end)
                if not ok then RunSession.Fail(message) end
            end)
        end
        initialized = true
        if SurvivorConfig.autoStart then HeroSurvivor.Start() end
    end
    OnInit.final("HeroSurvivor", function(Require)
        Require "ALICE"
        HeroSurvivor.Init()
    end)
end
