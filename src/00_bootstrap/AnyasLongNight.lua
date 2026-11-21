-- Import at map script scope, before main() runs. TotalInitialization starts us.
-- Prototype: one human player, movement by right-click, autonomous Lua attacks.
AnyasLongNight = {}
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
    local nextRush = SurvivorConfig.swarmRush.firstAt
    local runSerial = 0
    local firstEvolution, peakEnemies, peakVisuals = nil, 0, 0

    local function RefreshDamageBoard()
        if build then SurvivorUI.UpdateDamageBoard(build, stage, RunSession.GetElapsed() - stageStarted, rerollsRemaining, selectedDifficulty) end
        SurvivorUI.UpdateExpedition()
    end

    local function ResultDetails(cleared)
        if not SurvivorConfig.UnitExists(hero) or not build then return nil end
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
    local Attempt = RunSession.Attempt
    -- Player actions and deferred stage callbacks act only on a paused state that
    -- no pending teardown is about to replace (see RunSession.IsPending).
    local function Acting(state) return RunSession.GetState() == state and not RunSession.IsPending() end
    -- The one subsystem teardown list for finish, failed startup and restart. Every
    -- step is attempted; a restart also clears the per-run story and expedition records.
    -- Finish ends the expedition earlier for its result details; EndStage is idempotent.
    local function TeardownSubsystems(errors, restart)
        Attempt(errors, "progression", ClearProgression)
        Attempt(errors, "hide UI", SurvivorUI.HidePanel)
        Attempt(errors, "screen effects", SurvivorUI.ResetScreenEffects)
        Attempt(errors, "story", restart and SurvivorStory.Reset or SurvivorStory.Cleanup)
        -- Before combat cleanup: the expedition releases its courier through the combat port.
        Attempt(errors, "expedition", restart and SurvivorExpedition.Reset or SurvivorExpedition.EndStage)
        Attempt(errors, "inventory observer", SurvivorInventoryPause.Cleanup)
        -- Detach the camera before removing its target, even if scene cleanup failed.
        Attempt(errors, "camera", function()
            if SurvivorConfig.IsLocalPlayer() then ResetToGameCamera(0) end
        end)
        Attempt(errors, "native loadout", SurvivorNativeLoadout.Cleanup)
        Attempt(errors, "equipment", SurvivorEquipment.Cleanup)
        Attempt(errors, "combat", SurvivorCombat.Cleanup)
        Attempt(errors, "stage", SurvivorStage.Cleanup)
    end
    local function CleanupRun(errors)
        runSerial = runSerial + 1 -- Invalidate preparation callbacks before native cleanup.
        TeardownSubsystems(errors, false)
        hero, build, stats, offers = nil, nil, nil, nil
        rewardLevel, rerollsRemaining, stageTransition = nil, 0, false
    end
    local function QueueLevelRewards()
        if not SurvivorConfig.UnitExists(hero) then return end
        local actualLevel = GetHeroLevel(hero)
        for gained = observedLevel + 1, actualLevel do queuedLevels[#queuedLevels + 1] = gained end
        observedLevel = actualLevel
        -- Augments replace the standard skill-learning reward on every level.
        local points = GetHeroSkillPoints(hero)
        if points > 0 then UnitModifySkillPoints(hero, -points) end
    end
    local function AwardXP(amount)
        if not RunSession.IsRunning() or not SurvivorConfig.UnitLive(hero) then return end
        assert(type(amount) == "number" and amount >= 0, "Invalid XP reward")
        amount = math.floor(amount)
        if amount == 0 then return end
        -- Keep automatic kill XP suspended outside this synchronous native call.
        local recipient = hero
        SuspendHeroXP(recipient, false)
        local ok, message = pcall(AddHeroXP, recipient, amount, true)
        if SurvivorConfig.UnitExists(recipient) then SuspendHeroXP(recipient, true) end
        if not ok then error(message) end
        -- Also reconcile multi-level jumps; the event may fire once or repeatedly.
        QueueLevelRewards()
    end
    local function BonusReward(kind)
        local ok, message = pcall(function()
            if not RunSession.IsRunning() or not SurvivorConfig.UnitLive(hero) then return end
            local config = SurvivorConfig.bonusProps
            if kind == "recovery" then
                local maximum, before = BlzGetUnitMaxHP(hero), GetWidgetLife(hero)
                local after = math.min(maximum, before + maximum * config.healFraction)
                SetWidgetLife(hero, after)
                SurvivorConfig.Present("bonus notice", SurvivorUI.Notify, "|cff88ff99회복의 룬 · 생명력 +" .. math.floor(after - before) .. "|r")
            elseif kind == "experienceProp" then
                local amount = math.floor(config.experience * SurvivorConfig.stageXP[stage])
                AwardXP(amount)
                SurvivorConfig.Present("bonus notice", SurvivorUI.Notify, "|cffbbaaff경험치의 서 · 경험치 +" .. amount .. "|r")
            elseif kind == "purge" then
                local count = SurvivorCombat.PurgeNearby()
                SurvivorConfig.Present("bonus notice", SurvivorUI.Notify, "|cffffcc88소멸의 룬 · 주변 적 " .. count .. " 처치|r")
            elseif kind == "timeStop" then
                SurvivorCombat.StopTime()
                SurvivorConfig.Present("bonus notice", SurvivorUI.Notify, "|cff88ddff정지의 룬 · 적과 적 투사체 8초 정지|r")
            end
        end)
        -- Purge kills run inside this pickup event; teardown waits for the session callback.
        if not ok then RunSession.RequestFail(message) end
    end
    local function Finish(reason)
        stageTransition = false
        gearOffers, eventOffers = nil, nil
        local errors, details, report = {}, nil, nil
        -- End the expedition before the details so an interrupted risk is recorded;
        -- TeardownSubsystems repeats this idempotent step as part of the shared list.
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
        if not Acting("CHOOSING") or offers == nil or rerollsRemaining <= 0 then return end
        if SurvivorAugments.Reroll(build, offers, index) then
            rerollsRemaining = rerollsRemaining - 1
        end
        -- No level reward is consumed and combat stays paused during the redraw.
        ShowChoice()
    end
    -- Returns whether the click consumed the choice; the UI keeps its cards otherwise.
    local function Choose(index)
        if not Acting("CHOOSING") or offers == nil or offers[index] == nil then return false end
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
            return true
        end
        queuedLevels, queueHead = {}, 1
        SurvivorUI.HidePanel()
        choiceGrace = 0.25
        RunSession.EndChoice()
        return true
    end
    local function Exclude(index)
        if not Acting("CHOOSING") or offers == nil then return end
        SurvivorAugments.Exclude(build, offers, index)
        -- Excluding replaces only this card; no reroll or queued level is consumed.
        ShowChoice()
    end
    local function StartBoss(elapsed)
        bossStarted = SurvivorCombat.SpawnBoss()
        if bossStarted then bossEngagedAt = elapsed end
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
        if not Acting("STAGE_CLEAR") or not gearOffers or not gearOffers[index] then return false end
        local id = gearOffers[index]
        gearOffers = nil -- Consume before granting the item; duplicate clicks cannot grant twice.
        assert(SurvivorEquipment.ClaimReward(id), "Boss reward could not be granted")
        SurvivorUI.HidePanel()
        local elapsed = RunSession.GetElapsed()
        SurvivorUI.ShowResult("stage_clear", elapsed, kills, stage,
            bossEngagedAt and elapsed - bossEngagedAt or nil, SurvivorCombat.DamageReport(), ResultDetails(true))
        return true
    end
    local function ChooseEventGear(index)
        if not Acting("CHOOSING") or not eventOffers or not eventOffers[index] then return false end
        local id = eventOffers[index]
        eventOffers = nil
        assert(SurvivorEquipment.ClaimReward(id, "봉인 조사 보상"), "Risk reward could not be granted")
        SurvivorExpedition.RecordReward(id)
        SurvivorUI.HidePanel()
        choiceGrace = 0.25
        -- A failed resume hook already finished the run; do not refresh its torn-down board.
        if RunSession.EndChoice() then RefreshDamageBoard() end
        return true
    end
    local function ExpeditionReward(kind)
        if kind == "search" then
            rerollsRemaining = math.min(SurvivorConfig.rerollCapacity, rerollsRemaining + 1)
        elseif kind == "risk" then
            eventOffers = SurvivorEquipment.RollRiskReward()
            -- Step runs only while RUNNING, so a refusal means a failed pause hook
            -- already reported and finished the run.
            if not RunSession.BeginChoice() then eventOffers = nil; return end
            SurvivorUI.ShowGearRewards(eventOffers, stage, ChooseEventGear, "봉인 경보 해제 · " .. (stage <= 2 and "희귀 이상" or "영웅 등급") .. " 장비 하나 선택")
        end
        RefreshDamageBoard()
    end
    -- Expedition reaches combat only through this port; combat already queries it.
    local expeditionCombat = {
        grantRecovery = function() return SurvivorCombat.GrantSearchRecovery() end,
        spawnCourier = function(points) return SurvivorCombat.SpawnCourier(points) end,
        releaseCourier = function(unit) return SurvivorCombat.ReleaseCourier(unit) end,
    }
    local function Step(dt, elapsed)
        if SurvivorCombat.BossDefeated() then
            if stageTransition then return end
            if RunSession.BeginStageClear() then
                stageTransition = true
                SurvivorExpedition.EndStage()
                -- Deferred cleanup/story callbacks act only on the run and stage that started them.
                local expectedRun, expectedStage = runSerial, stage
                local function SameClear()
                    return runSerial == expectedRun and stage == expectedStage and Acting("STAGE_CLEAR")
                end
                SurvivorCombat.ClearBattlefieldAsync(function()
                    if not SameClear() then return end
                    if stage == SurvivorConfig.stages then
                        -- Stop observing the bag for the ending. CleanupRun still owns the
                        -- teardown; an observer failure must not turn the victory into an error.
                        local errors = {}
                        Attempt(errors, "inventory observer", SurvivorInventoryPause.Cleanup)
                        Attempt(errors, "inventory pause", function() RunSession.SetInventoryOpen(false) end)
                        for _, message in ipairs(errors) do print("[AnyasLongNight cleanup] " .. message) end
                        SurvivorStory.ShowEnding(hero, function()
                            if SameClear() then RunSession.Finish("boss_defeated") end
                        end)
                    else
                        rerollsRemaining = math.min(SurvivorConfig.rerollCapacity, rerollsRemaining + SurvivorConfig.rerollsPerStage)
                        SurvivorEquipment.PrepareRest()
                        RefreshDamageBoard()
                        SurvivorStory.ShowInterlude(stage, hero, function()
                            if not SameClear() then return end
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
        if not bossStarted and stageElapsed >= nextRush then
            local rush = SurvivorConfig.swarmRush
            -- A blocked rush (crowded field, wall behind the hero) retries shortly instead of skipping its turn.
            local warned = stageElapsed < timing.bossStart - rush.bossMargin and SurvivorCombat.WarnRush()
            nextRush = stageElapsed + (warned and rush.interval or rush.retry)
        end
        QueueLevelRewards()
        choiceGrace = math.max(0, choiceGrace - dt)
        if queueHead <= #queuedLevels and choiceGrace == 0 then
            BeginChoice()
            return
        end
        if not bossStarted and stageElapsed >= timing.bossStart then StartBoss(elapsed) end
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
        -- A kill/death callback can request teardown mid-tick; stop advancing this tick.
        Fire(true)
        if not RunSession.IsRunning() then return end
        SurvivorCombat.UpdateWeapons(dt)
        if not RunSession.IsRunning() then return end
        enemyClock, hudClock = enemyClock + dt, hudClock + dt
        SpawnWave(dt, stageElapsed)
        Fire(false)
        if not RunSession.IsRunning() then return end
        if enemyClock >= 0.5 then
            enemyClock = 0
            SurvivorCombat.UpdateEnemies(elapsed)
            if not RunSession.IsRunning() then return end
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
                and stageTransition and Acting("STAGE_CLEAR")
                and SurvivorConfig.UnitLive(expectedHero)
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
    function AnyasLongNight.NextStage()
        if not Acting("STAGE_CLEAR") or stageTransition or gearOffers or stage >= SurvivorConfig.stages then return false end
        stageTransition, nextHazard, nextRush = true, 35, SurvivorConfig.swarmRush.firstAt
        stage, stageStarted, bossEngagedAt = stage + 1, RunSession.GetElapsed(), nil
        stageStartKills = kills
        SurvivorEquipment.SetStage(stage)
        SurvivorEquipment.Reconcile()
        SurvivorNativeLoadout.Refresh()
        SurvivorCombat.BeginStage(stage, stageStarted)
        SurvivorStage.Apply(stage)
        SurvivorExpedition.BeginStage(hero, stage, stageStarted, ExpeditionReward, expeditionCombat)
        SurvivorEquipment.CarryGroundToStage()
        nextElite, bossStarted = SurvivorConfig.eliteInterval, false
        weaponClocks, spawnBudget, enemyClock, hudClock = {}, 0, 0, 0
        ShowStageIntroduction()
        return true
    end
    local function Start(startingWeapon, startingTrinket)
        runSerial = runSerial + 1
        stageTransition, nextHazard, nextRush = false, 35, SurvivorConfig.swarmRush.firstAt
        gearOffers, eventOffers = nil, nil
        -- BeginRun reaches here only from READY/FINISHED; AnyasLongNight.Start ends a live run.
        kills = 0 -- A failed startup must not report the previous run's kills.
        -- One failing teardown must not leave the later subsystems still owned.
        local cleanupErrors = {}
        TeardownSubsystems(cleanupErrors, true)
        -- Every cleanup detaches ownership before its native calls, and each Init
        -- asserts that its module was released. A failed presentation refresh
        -- (panel, speech, ambience) is reported but must not block every new run.
        for _, failure in ipairs(cleanupErrors) do print("[AnyasLongNight cleanup] " .. failure) end
        SurvivorUI.BeginRun()
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
        hero = CreateUnit(SurvivorConfig.Owner(), SurvivorConfig.heroes[selectedHero].unitId, x, y, 270)
        assert(hero ~= nil, "Hero object ID is missing")
        -- Combat takes ownership immediately, including during partial startup failure.
        SurvivorCombat.Init(hero, stats, arena, function(dead, elite, isBoss)
            local ok, message = pcall(function()
                kills = kills + 1
                if isBoss then return end -- Victory is handled by the next gameplay step.
                -- A kill in the same tick as a pending defeat still counts, without rewards.
                if not RunSession.IsRunning() then return end
                SurvivorExpedition.OnKill(dead, isBoss)
                AwardXP((elite and SurvivorConfig.eliteExperience
                    or SurvivorConfig.enemyExperienceByType[GetUnitTypeId(dead)] or SurvivorConfig.enemyExperience) * SurvivorConfig.stageXP[stage])
                SurvivorEquipment.OnKill(dead, elite)
            end)
            -- Kills fire inside weapon hit loops; RunSession tears down after the loop.
            if not ok then RunSession.RequestFail(message) end
        end, function()
            -- Defer teardown: the death can fire inside a weapon or enemy callback.
            RunSession.RequestFinish("defeated")
        end, selectedDifficulty, BonusReward)
        BlzSetHeroProperName(hero, SurvivorConfig.heroes[selectedHero].name)
        SuspendHeroXP(hero, true)
        observedLevel = GetHeroLevel(hero)
        QueueLevelRewards()
        levelTrigger = CreateTrigger()
        TriggerRegisterPlayerUnitEvent(levelTrigger, SurvivorConfig.Owner(), EVENT_PLAYER_HERO_LEVEL, nil)
        TriggerAddAction(levelTrigger, function()
            if GetTriggerUnit() ~= hero then return end
            -- Defer the modal UI to Step, outside Warcraft's level-up/death event.
            local ok, message = pcall(QueueLevelRewards)
            -- AddHeroXP from a kill reward raises this event inside the same hit loop.
            if not ok then RunSession.RequestFail(message) end
        end)
        BlzUnitDisableAbility(hero, FourCC("Aatk"), true, true)
        BlzUnitDisableAbility(hero, FourCC("AHer"), true, true)
        BlzSetUnitMaxHP(hero, SurvivorConfig.heroLife)
        SetWidgetLife(hero, SurvivorConfig.heroLife)
        SetUnitMoveSpeed(hero, stats.moveSpeed)
        -- Listener order: Combat.Init above created the supply pickup trigger first,
        -- so EVENT_PLAYER_UNIT_PICKUP_ITEM reaches Combat (bonus items) before
        -- Equipment (catalog gear). Their item sets are disjoint; keep them so.
        SurvivorEquipment.Init(hero, build, SurvivorUI.Notify)
        SetWidgetLife(hero, BlzGetUnitMaxHP(hero)) -- Start at full HP, including the chosen vitality trinket.
        SurvivorNativeLoadout.Init(hero, build)
        SurvivorExpedition.BeginStage(hero, 1, 0, ExpeditionReward, expeditionCombat)
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
        if SurvivorConfig.IsLocalPlayer() then
            ClearSelection()
            SelectUnit(hero, true)
            SetCameraPosition(x, y)
            SetCameraTargetController(hero, 0, 0, false)
        end
        stageTransition = true
        -- A failed pause hook already ran Finish and showed the error result; an
        -- introduction opened now would hide that result behind a dead run.
        if not RunSession.BeginStageClear() or RunSession.GetState() ~= "STAGE_CLEAR" then return end
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
    function AnyasLongNight.Start()
        assert(initialized, "Start after AnyasLongNight.Init")
        setupPhase = nil
        RunSession.Finish("restarted")
        ShowSetup()
    end
    function AnyasLongNight.IsStorySummary() return storySummary end
    function AnyasLongNight.ToggleStorySummary()
        if not CanSetup() or setupPhase ~= "MENU" then return false end
        storySummary = not storySummary
        SurvivorStory.SetSummaryMode(storySummary)
        ShowSetup()
        return true
    end
    function AnyasLongNight.CanRetrySame()
        return RunSession.GetState() == "FINISHED" and selectedDifficulty ~= nil
            and selectedWeapon ~= nil and selectedTrinket ~= nil
    end
    function AnyasLongNight.RetrySame()
        if not AnyasLongNight.CanRetrySame() then return false end
        setupPhase = "MENU"
        return AnyasLongNight.BeginRun()
    end
    -- The setup screen shows every panel at once; opening a kind only switches its option list.
    function AnyasLongNight.OpenSetup(kind)
        if not CanSetup() or setupPhase ~= "MENU" then return false end
        if kind ~= "HERO" and kind ~= "DIFFICULTY" and kind ~= "WEAPON" and kind ~= "TRINKET" then return false end
        local selections = {HERO = selectedHero, DIFFICULTY = selectedDifficulty, WEAPON = selectedWeapon, TRINKET = selectedTrinket}
        local selected = selections[kind]
        SurvivorSetupUI.ShowOptions(kind, selected, selectedHero)
        return true
    end
    function AnyasLongNight.ResetSetup()
        if not CanSetup() or setupPhase ~= "MENU" then return false end
        selectedDifficulty, selectedWeapon, selectedTrinket = nil, nil, nil
        ShowSetup()
        return true
    end
    function AnyasLongNight.SelectSetup(kind, id)
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
    function AnyasLongNight.BeginRun()
        assert(initialized, "Start after AnyasLongNight.Init")
        if not CanSetup() or setupPhase ~= "MENU" then return false end
        if not selectedDifficulty or not selectedWeapon or not selectedTrinket then return false end
        setupPhase = nil -- Consume setup once before native creation or callbacks.
        local ok, message = pcall(Start, selectedWeapon, selectedTrinket)
        if not ok then
            -- Once RunSession.Start has acquired the hooks, Fail runs Finish, which already
            -- cleans every subsystem and shows the detailed result; do not repeat it.
            local state = RunSession.GetState()
            local hooked = state ~= "READY" and state ~= "FINISHED"
            RunSession.Fail(message)
            if hooked then return ok end
            -- Errors before RunSession.Start acquired its hooks need explicit cleanup.
            local errors = {}
            CleanupRun(errors)
            Attempt(errors, "result UI", function() SurvivorUI.ShowResult("error", RunSession.GetElapsed(), kills) end)
            for _, failure in ipairs(errors) do print("[AnyasLongNight cleanup] " .. failure) end
        end
        return ok
    end
    function AnyasLongNight.Init()
        if initialized then return end
        assert(ALICE_Initialized, "Initialize after ALICE")
        -- The solo arena remains fully visible during combat, pauses and stage changes.
        FogMaskEnable(false)
        FogEnable(false)
        SurvivorUI.Init(Choose, AnyasLongNight.Start, Reroll, AnyasLongNight.NextStage, Exclude,
            AnyasLongNight.RetrySame, AnyasLongNight.CanRetrySame)
        SurvivorSetupUI.Init(AnyasLongNight.OpenSetup, AnyasLongNight.SelectSetup, AnyasLongNight.ResetSetup, AnyasLongNight.BeginRun,
            AnyasLongNight.IsStorySummary, AnyasLongNight.ToggleStorySummary)
        if SurvivorConfig.debugCommands then
            debugTrigger = CreateTrigger() -- Map lifetime; registered once across restarts.
            TriggerRegisterPlayerChatEvent(debugTrigger, SurvivorConfig.Owner(), "-hs", false)
            TriggerAddAction(debugTrigger, function()
                local ok, message = pcall(function()
                    local text = GetEventPlayerChatString()
                    if text == "-hs restart" then AnyasLongNight.Start()
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
                        StartBoss(RunSession.GetElapsed())
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
                        if GetHeroLevel(hero) == before then print("[AnyasLongNight] 맵의 최대 영웅 레벨에 도달했습니다.") end
                    elseif text == "-hs stats" then
                        local enemies, effects = SurvivorCombat.Counts()
                        print(string.format("[AnyasLongNight] %s / %.2fs / enemies=%d / effects=%d / pending=%d",
                            RunSession.GetState(), RunSession.GetElapsed(), enemies, effects, #queuedLevels - queueHead + 1))
                        if hero ~= nil then
                            print(string.format("[AnyasLongNight] stage=%d/%d / stage time=%.1f / hero level=%d / XP=%d", stage, SurvivorConfig.stages, RunSession.GetElapsed() - stageStarted, GetHeroLevel(hero), GetHeroXP(hero)))
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
        if SurvivorConfig.autoStart then AnyasLongNight.Start() end
    end
    OnInit.final("AnyasLongNight", function(Require)
        Require "ALICE"
        AnyasLongNight.Init()
    end)
end
