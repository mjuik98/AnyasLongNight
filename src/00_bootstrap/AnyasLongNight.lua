-- Import at map script scope, before main() runs. TotalInitialization starts us.
-- Prototype: one human player, movement by right-click, autonomous Lua attacks.
-- The run lifecycle: start, gameplay step, stage transitions and finish. Setup choices
-- live in SurvivorSetup, level rewards in SurvivorProgression, chat commands in
-- SurvivorDebugCommands.
AnyasLongNight = {}
do
    local initialized = false
    -- Clocks and schedules that restart with every stage (run start and NextStage).
    -- nextHazard nil: the stage's first lava warning is still ahead (encounters[stage].lava.first).
    -- Weapon cooldown clocks belong to combat (SurvivorCombat.TickWeapons, reset by BeginStage).
    local function ResetStageClocks(state)
        state.nextElite, state.bossStarted = SurvivorConfig.eliteInterval, false
        state.nextHazard, state.nextRush = nil, SurvivorConfig.swarmRush.firstAt
        state.spawnBudget, state.enemyClock, state.hudClock = 0, 0, 0
    end
    -- Everything one run owns. Start replaces the whole table after the previous run's
    -- teardown; CleanupRun only drops the handles, so the result screen keeps its record.
    local function NewRun()
        local state = {
            hero = nil, build = nil, stats = nil, offers = nil, levelTrigger = nil,
            kills = 0, stage = 1, stageStarted = 0, bossEngagedAt = nil, stageRecords = {}, stageStartKills = 0,
            -- Level rewards (SurvivorProgression): a reward queue, not a second level/XP system.
            queuedLevels = {}, queueHead = 1, observedLevel = 1, rewardLevel = nil, rerollsRemaining = 0, choiceGrace = 0,
            gearOffers = nil, eventOffers = nil,
            -- Stage transition phase and the ticket of its sequence (see BeginTransition).
            transition = nil, transitionTicket = nil,
            boardClock = 0, firstEvolution = nil, peakEnemies = 0, peakVisuals = 0,
        }
        ResetStageClocks(state)
        return state
    end
    local run = NewRun()
    SurvivorProgression.Attach(run)
    local function RefreshDamageBoard()
        if run.build then SurvivorUI.UpdateDamageBoard(run.build, run.stage, RunSession.GetElapsed() - run.stageStarted, run.rerollsRemaining, SurvivorSetup.Difficulty()) end
        SurvivorUI.UpdateExpedition()
    end
    -- Late-bound, so a replaced refresh also applies to progression's choices.
    SurvivorProgression.Bind(function() RefreshDamageBoard() end)

    -- Stage transitions walk these phases while the session is paused in STAGE_CLEAR:
    --   boss clear:  clearing -> interlude -> reward -> result   (last stage: clearing -> ending)
    --   stage start: intro -> preparing -> nil (combat resumes)  (run start and NextStage)
    -- Every sequence gets a fresh ticket. A deferred callback (cleanup timer, story, intro,
    -- countdown) acts only while its own ticket and phase are current, so callbacks of an
    -- older run, stage or step stay inert; CleanupRun and the countdown end the sequence.
    local function BeginTransition(phase)
        local ticket = {}
        run.transition, run.transitionTicket = phase, ticket
        return ticket
    end
    local function EndTransition() run.transition, run.transitionTicket = nil, nil end
    local function InPhase(ticket, phase)
        return run.transitionTicket == ticket and run.transition == phase and RunSession.CanAct("STAGE_CLEAR")
    end

    local function ResultDetails(cleared)
        if not SurvivorUtil.UnitExists(run.hero) or not run.build then return nil end
        local elapsed, level = RunSession.GetElapsed(), GetHeroLevel(run.hero)
        if not run.stageRecords[run.stage] then
            run.stageRecords[run.stage] = {level = level, duration = elapsed - run.stageStarted,
                kills = run.kills - run.stageStartKills, bossTime = run.bossEngagedAt and elapsed - run.bossEngagedAt or nil,
                cleared = cleared, escapes = SurvivorCombat.StageEscapeUses(run.stage)}
        end
        -- Copy display values before finish removes the hero/build.
        local details = {difficulty = SurvivorConfig.difficulties[SurvivorSetup.Difficulty()].name, level = level,
            stages = {}, weapons = {}, trinkets = {},
            journalChapters = SurvivorStory.JournalChapters(),
            firstEvolution = run.firstEvolution, peakEnemies = run.peakEnemies, peakVisuals = run.peakVisuals}
        local _, _, escapeUses = SurvivorCombat.EscapeStatus()
        details.escapeUses = escapeUses
        details.damageHistory, details.damageHint = SurvivorCombat.DamageHistory()
        for i, record in ipairs(run.stageRecords) do
            details.stages[i] = {level = record.level, duration = record.duration, kills = record.kills,
                bossTime = record.bossTime, cleared = record.cleared, escapes = record.escapes}
        end
        for _, id in ipairs(run.build.weapons) do
            local text = SurvivorAugments.Get(id).name .. " Lv." .. SurvivorAugments.Level(run.build, id)
            local evolution = run.build.evolutions[id]
            if evolution then text = text .. " → " .. SurvivorAugments.Get(evolution).name end
            details.weapons[#details.weapons + 1] = text
        end
        for _, id in ipairs(run.build.trinkets) do
            details.trinkets[#details.trinkets + 1] = SurvivorAugments.Get(id).name .. " Lv." .. SurvivorAugments.Level(run.build, id)
        end
        return details
    end

    local Attempt = RunSession.Attempt
    -- The one subsystem teardown list for finish, failed startup and restart. Every
    -- step is attempted; a restart also clears the per-run story and expedition records.
    -- Finish ends the expedition earlier for its result details; EndStage is idempotent.
    local function TeardownSubsystems(errors, restart)
        Attempt(errors, "progression", SurvivorProgression.Clear)
        Attempt(errors, "hide UI", SurvivorUI.HidePanel)
        Attempt(errors, "screen effects", SurvivorUI.ResetScreenEffects)
        Attempt(errors, "story", restart and SurvivorStory.Reset or SurvivorStory.Cleanup)
        -- Before combat cleanup: the expedition releases its courier through the combat port.
        Attempt(errors, "expedition", restart and SurvivorExpedition.Reset or SurvivorExpedition.EndStage)
        Attempt(errors, "inventory observer", SurvivorInventoryPause.Cleanup)
        -- Detach the camera before removing its target, even if scene cleanup failed.
        Attempt(errors, "camera", function()
            if SurvivorUtil.IsLocalPlayer() then ResetToGameCamera(0) end
        end)
        -- Equipment first: its item trigger is gone before the loadout removes carried
        -- items, whose immediate drop events would otherwise reach a live listener.
        Attempt(errors, "equipment", SurvivorEquipment.Cleanup)
        Attempt(errors, "native loadout", SurvivorNativeLoadout.Cleanup)
        Attempt(errors, "combat", SurvivorCombat.Cleanup)
        Attempt(errors, "stage", SurvivorStage.Cleanup)
    end
    local function CleanupRun(errors)
        EndTransition() -- Invalidate transition callbacks before native cleanup.
        TeardownSubsystems(errors, false)
        run.hero, run.build, run.stats, run.offers = nil, nil, nil, nil
        run.rewardLevel, run.rerollsRemaining = nil, 0
    end
    local function BonusReward(kind)
        local ok, message = pcall(function()
            if not RunSession.IsRunning() or not SurvivorUtil.UnitLive(run.hero) then return end
            local config = SurvivorConfig.bonusProps
            if kind == "recovery" then
                local maximum, before = BlzGetUnitMaxHP(run.hero), GetWidgetLife(run.hero)
                local after = math.min(maximum, before + maximum * config.healFraction)
                SetWidgetLife(run.hero, after)
                SurvivorUtil.Present("bonus notice", SurvivorUI.Notify, "|cff88ff99회복의 룬 · 생명력 +" .. math.floor(after - before) .. "|r")
            elseif kind == "experienceProp" then
                local amount = math.floor(config.experience * SurvivorConfig.stageXP[run.stage])
                SurvivorProgression.AwardXP(amount)
                SurvivorUtil.Present("bonus notice", SurvivorUI.Notify, "|cffbbaaff경험치의 서 · 경험치 +" .. amount .. "|r")
            elseif kind == "purge" then
                local count = SurvivorCombat.PurgeNearby()
                SurvivorUtil.Present("bonus notice", SurvivorUI.Notify, "|cffffcc88소멸의 룬 · 주변 적 " .. count .. " 처치|r")
            elseif kind == "timeStop" then
                SurvivorCombat.StopTime()
                SurvivorUtil.Present("bonus notice", SurvivorUI.Notify, "|cff88ddff정지의 룬 · 적과 적 투사체 8초 정지|r")
            end
        end)
        -- Purge kills run inside this pickup event; teardown waits for the session callback.
        if not ok then RunSession.RequestFail(message) end
    end
    local function Finish(reason)
        EndTransition()
        run.gearOffers, run.eventOffers = nil, nil
        local errors, details, report = {}, nil, nil
        -- End the expedition before the details so an interrupted risk is recorded;
        -- TeardownSubsystems repeats this idempotent step as part of the shared list.
        Attempt(errors, "expedition", SurvivorExpedition.EndStage)
        Attempt(errors, "damage board", RefreshDamageBoard)
        local ok, value = Attempt(errors, "result details", function() return ResultDetails(reason == "boss_defeated") end)
        if ok then details = value end
        ok, value = Attempt(errors, "damage report", SurvivorCombat.DamageReport)
        if ok then report = value end
        local bossTime = run.bossEngagedAt and RunSession.GetElapsed() - run.bossEngagedAt or nil
        CleanupRun(errors)
        Attempt(errors, "result UI", function()
            SurvivorUI.ShowResult(#errors > 0 and "error" or reason, RunSession.GetElapsed(), run.kills, run.stage, bossTime, report, details)
        end)
        -- Surface every failure only after all cleanup and the result fallback were tried.
        if #errors > 0 then error(table.concat(errors, "\n"), 0) end
    end
    local function StartBoss(elapsed)
        run.bossStarted = SurvivorCombat.SpawnBoss()
        if run.bossStarted then run.bossEngagedAt = elapsed end
    end
    local function SpawnWave(dt, stageElapsed)
        local rate = SurvivorConfig.SpawnRate(SurvivorSetup.Difficulty(), run.stage, stageElapsed)
        if SurvivorExpedition.RiskActive() then rate = rate * SurvivorConfig.riskChallenge.spawnRate end
        if run.bossStarted or rate == 0 then run.spawnBudget = 0; return end
        run.spawnBudget = run.spawnBudget + rate * dt
        local whole = math.floor(run.spawnBudget)
        run.spawnBudget = run.spawnBudget - whole
        -- Never retain failed spawns, or release an accumulated wave after the actor cap clears.
        for _ = 1, math.min(4, whole) do
            if not SurvivorCombat.Spawn() then run.spawnBudget = 0; break end
        end
    end
    local function ChooseGear(index)
        if not RunSession.CanAct("STAGE_CLEAR") or run.transition ~= "reward"
            or not run.gearOffers or not run.gearOffers[index] then return false end
        local id = run.gearOffers[index]
        run.gearOffers = nil -- Consume before granting the item; duplicate clicks cannot grant twice.
        assert(SurvivorEquipment.ClaimReward(id), "Boss reward could not be granted")
        run.transition = "result" -- The result screen's next-stage action continues the sequence.
        SurvivorUI.HidePanel()
        local elapsed = RunSession.GetElapsed()
        SurvivorUI.ShowResult("stage_clear", elapsed, run.kills, run.stage,
            run.bossEngagedAt and elapsed - run.bossEngagedAt or nil, SurvivorCombat.DamageReport(), ResultDetails(true))
        return true
    end
    local function ChooseEventGear(index)
        if not RunSession.CanAct("CHOOSING") or not run.eventOffers or not run.eventOffers[index] then return false end
        local id = run.eventOffers[index]
        run.eventOffers = nil
        assert(SurvivorEquipment.ClaimReward(id, "봉인 조사 보상"), "Risk reward could not be granted")
        SurvivorExpedition.RecordReward(id)
        SurvivorUI.HidePanel()
        SurvivorProgression.HoldChoices()
        -- A failed resume hook already finished the run; do not refresh its torn-down board.
        if RunSession.EndChoice() then RefreshDamageBoard() end
        return true
    end
    local function ExpeditionReward(kind)
        if kind == "search" then
            SurvivorProgression.GrantRerolls(1)
        elseif kind == "risk" then
            run.eventOffers = SurvivorEquipment.RollRiskReward()
            -- A refusal means a failed pause hook already finished the run, or a kill in
            -- this step requested teardown; either way the risk reward is dropped.
            if not RunSession.BeginChoice() then run.eventOffers = nil; return end
            SurvivorUI.ShowGearRewards(run.eventOffers, run.stage, ChooseEventGear, "봉인 경보 해제 · " .. SurvivorConfig.encounters[run.stage].riskReward.label .. " 장비 하나 선택")
        end
        -- A search reward can arrive from a kill inside a weapon hit loop; the board is presentation.
        SurvivorUtil.Present("damage board", RefreshDamageBoard)
    end
    -- Expedition reaches combat only through this port; combat already queries it.
    local expeditionCombat = {
        grantRecovery = function() return SurvivorCombat.GrantSearchRecovery() end,
        spawnCourier = function(points) return SurvivorCombat.SpawnCourier(points) end,
        releaseCourier = function(unit) return SurvivorCombat.ReleaseCourier(unit) end,
    }
    -- The defeated boss pauses the session and starts the clear sequence.
    local function BeginStageClear()
        if run.transition or not RunSession.BeginStageClear() then return end
        local ticket = BeginTransition("clearing")
        SurvivorExpedition.EndStage()
        SurvivorCombat.ClearBattlefieldAsync(function()
            if not InPhase(ticket, "clearing") then return end
            if run.stage == SurvivorConfig.stages then
                run.transition = "ending"
                -- Stop observing the bag for the ending. CleanupRun still owns the
                -- teardown; an observer failure must not turn the victory into an error.
                local errors = {}
                Attempt(errors, "inventory observer", SurvivorInventoryPause.Cleanup)
                Attempt(errors, "inventory pause", function() RunSession.SetInventoryOpen(false) end)
                for _, message in ipairs(errors) do print("[AnyasLongNight cleanup] " .. message) end
                -- The ending's last click keeps running after this callback (loot UI,
                -- reveal fade), so request the finish; the paused-state watchdog owns it.
                SurvivorStory.ShowEnding(run.hero, function()
                    if InPhase(ticket, "ending") then RunSession.RequestFinish("boss_defeated") end
                end)
                return
            end
            run.transition = "interlude"
            SurvivorProgression.GrantRerolls(SurvivorConfig.rerollsPerStage)
            SurvivorEquipment.PrepareRest()
            RefreshDamageBoard()
            SurvivorStory.ShowInterlude(run.stage, run.hero, function()
                if not InPhase(ticket, "interlude") then return end
                run.transition = "reward"
                run.gearOffers = SurvivorEquipment.RollBossReward()
                SurvivorUI.ShowGearRewards(run.gearOffers, run.stage, ChooseGear)
            end)
        end)
    end
    local function Step(dt, elapsed)
        if SurvivorCombat.BossDefeated() then BeginStageClear(); return end
        local stageElapsed = elapsed - run.stageStarted
        local timing = SurvivorConfig.StageTiming(run.stage)
        run.boardClock = run.boardClock + dt
        if run.boardClock >= 0.5 then
            run.boardClock = 0
            local enemies, _, visuals = SurvivorCombat.Counts()
            run.peakEnemies, run.peakVisuals = math.max(run.peakEnemies, enemies), math.max(run.peakVisuals, visuals)
            RefreshDamageBoard()
        end
        if stageElapsed >= timing.duration then RunSession.Finish("timeout"); return end
        SurvivorExpedition.Step(dt, elapsed)
        if not RunSession.IsRunning() then return end -- A risk reward owns the choice modal.
        local lava = SurvivorConfig.encounters[run.stage].lava
        if lava and not run.bossStarted and stageElapsed < timing.bossStart and stageElapsed >= (run.nextHazard or lava.first) then
            run.nextHazard = stageElapsed + lava.interval
            SurvivorCombat.WarnLava()
        end
        if not run.bossStarted and stageElapsed >= run.nextRush then
            local rush = SurvivorConfig.swarmRush
            -- A blocked rush (crowded field, wall behind the hero) retries shortly instead of skipping its turn.
            local warned = stageElapsed < timing.bossStart - rush.bossMargin and SurvivorCombat.WarnRush()
            run.nextRush = stageElapsed + (warned and rush.interval or rush.retry)
        end
        if SurvivorProgression.Step(dt) then return end
        if not run.bossStarted and stageElapsed >= timing.bossStart then StartBoss(elapsed) end
        -- Weapon cooldowns advance only on ticks that reach combat. Early-phase weapons
        -- fire before status upkeep; late-phase ones after this tick's spawns.
        local early, late = SurvivorCombat.TickWeapons(dt)
        -- A kill/death callback can request teardown mid-tick; stop advancing this tick.
        SurvivorCombat.CastWeapons(early)
        if not RunSession.IsRunning() then return end
        SurvivorCombat.UpdateStatus(dt)
        if not RunSession.IsRunning() then return end
        run.enemyClock, run.hudClock = run.enemyClock + dt, run.hudClock + dt
        SpawnWave(dt, stageElapsed)
        SurvivorCombat.CastWeapons(late)
        if not RunSession.IsRunning() then return end
        if run.enemyClock >= 0.5 then
            run.enemyClock = 0
            SurvivorCombat.UpdateEnemies(elapsed)
            if not RunSession.IsRunning() then return end
            if not run.bossStarted and stageElapsed < timing.bossStart and stageElapsed >= run.nextElite then
                run.nextElite = (math.floor(stageElapsed / SurvivorConfig.eliteInterval) + 1) * SurvivorConfig.eliteInterval
                SurvivorCombat.Spawn(true)
            end
        end
        if run.hudClock >= 0.1 then
            run.hudClock = 0
            SurvivorEquipment.Step(elapsed)
            -- A pickup in that loop may have requested teardown; grant no talent item then.
            if not RunSession.IsRunning() then return end
            SurvivorNativeLoadout.Refresh()
        end
    end
    -- The stage-start sequence (phase "intro" already begun): introduction, preparation,
    -- countdown, then combat resumes. startingWeapon is set only for the run's first stage.
    local function ShowStageIntroduction(ticket, startingWeapon)
        local hero, stage = run.hero, run.stage
        local function Current(phase) return InPhase(ticket, phase) and SurvivorUtil.UnitLive(hero) end
        local function CanStart() return Current("preparing") and not RunSession.IsInventoryOpen() end
        SurvivorUI.ShowStageIntro(stage, function()
            -- An old intro completion cannot replace a live preparation/countdown.
            if not Current("intro") then return end
            run.transition = "preparing"
            SurvivorNativeLoadout.GrantStageTalent(stage)
            SurvivorUI.ShowCombatPreparation(stage, function()
                    if not CanStart() then return false end
                    EndTransition() -- Consume once, only after the preparation countdown completes.
                    if not RunSession.EndStageClear() or not RunSession.IsRunning() then return false end
                    if startingWeapon then
                        for _ = 1, 3 do SurvivorCombat.Spawn() end
                        SurvivorCombat.CastWeapon(startingWeapon)
                        SurvivorUI.Notify(SurvivorStage.Get(stage).name)
                    else
                        SurvivorUI.Notify(SurvivorStage.Get(stage).name .. " · 생명력 회복")
                    end
                    RefreshDamageBoard()
                    return true
                end, CanStart)
        end, hero)
    end
    function AnyasLongNight.NextStage()
        if not RunSession.CanAct("STAGE_CLEAR") or run.transition ~= "result" or run.stage >= SurvivorConfig.stages then return false end
        local ticket = BeginTransition("intro")
        run.bossEngagedAt = nil
        -- Commit the stage number only after every subsystem accepted it: a failure
        -- here reports the cleared stage, not an empty record for the next one.
        local nextStage, started = run.stage + 1, RunSession.GetElapsed()
        SurvivorEquipment.SetStage(nextStage)
        SurvivorEquipment.Reconcile()
        SurvivorNativeLoadout.Refresh()
        SurvivorCombat.BeginStage(nextStage, started)
        SurvivorStage.Apply(nextStage)
        SurvivorExpedition.BeginStage(run.hero, nextStage, started, ExpeditionReward, expeditionCombat)
        SurvivorEquipment.CarryGroundToStage()
        run.stage, run.stageStarted, run.stageStartKills = nextStage, started, run.kills
        ResetStageClocks(run)
        ShowStageIntroduction(ticket)
        return true
    end
    local function Start(startingWeapon, startingTrinket)
        EndTransition()
        run.gearOffers, run.eventOffers = nil, nil
        -- BeginRun reaches here only from READY/FINISHED; AnyasLongNight.Start ends a live run.
        run.kills = 0 -- A failed startup must not report the previous run's kills.
        -- One failing teardown must not leave the later subsystems still owned.
        local cleanupErrors = {}
        TeardownSubsystems(cleanupErrors, true)
        -- Every cleanup detaches ownership before its native calls, and each Init
        -- asserts that its module was released. A failed presentation refresh
        -- (panel, speech, ambience) is reported but must not block every new run.
        for _, failure in ipairs(cleanupErrors) do print("[AnyasLongNight cleanup] " .. failure) end
        -- The previous run is released; this run starts from a fresh record.
        run = NewRun()
        SurvivorProgression.Attach(run)
        SurvivorUI.BeginRun()
        local rect = bj_mapInitialPlayableArea -- Borrowed rect: never destroy it.
        local arena = {minX = GetRectMinX(rect) + 128, maxX = GetRectMaxX(rect) - 128,
            minY = GetRectMinY(rect) + 128, maxY = GetRectMaxY(rect) - 128}
        assert(arena.maxX - arena.minX > 2000 and arena.maxY - arena.minY > 2000,
            "Use a flat map of at least 64 x 64 terrain tiles")
        local x, y = (arena.minX + arena.maxX) / 2, (arena.minY + arena.maxY) / 2
        assert(not IsTerrainPathable(x, y, PATHING_TYPE_WALKABILITY), "Map center must be walkable")
        local heroId, difficulty = SurvivorSetup.Hero(), SurvivorSetup.Difficulty()
        run.build = SurvivorAugments.NewBuild(startingWeapon, startingTrinket, heroId)
        for index = 1, SurvivorConfig.stages do
            local timing = SurvivorConfig.StageTiming(index)
            assert(timing.bossStart > 0 and timing.bossStart < timing.duration,
                "Boss must spawn before the stage deadline")
        end
        run.stats, run.offers = run.build.stats, nil
        SurvivorStage.Init(arena)
        SurvivorStage.Apply(1)
        assert(type(SurvivorConfig.rerollsPerRun) == "number" and SurvivorConfig.rerollsPerRun >= 0
            and SurvivorConfig.rerollsPerRun < math.huge and SurvivorConfig.rerollsPerRun % 1 == 0, "Invalid reroll limit")
        run.rerollsRemaining = SurvivorConfig.rerollsPerRun
        run.hero = CreateUnit(SurvivorUtil.Owner(), SurvivorConfig.heroes[heroId].unitId, x, y, 270)
        assert(run.hero ~= nil, "Hero object ID is missing")
        -- Combat takes ownership immediately, including during partial startup failure.
        SurvivorCombat.Init(run.hero, run.stats, arena, function(dead, elite, isBoss)
            local ok, message = pcall(function()
                run.kills = run.kills + 1
                if isBoss then return end -- Victory is handled by the next gameplay step.
                -- A kill in the same tick as a pending defeat still counts, without rewards.
                if not RunSession.IsRunning() then return end
                SurvivorExpedition.OnKill(dead, isBoss)
                SurvivorProgression.AwardXP((elite and SurvivorConfig.eliteExperience
                    or SurvivorConfig.enemyExperienceByType[GetUnitTypeId(dead)] or SurvivorConfig.enemyExperience) * SurvivorConfig.stageXP[run.stage])
                SurvivorEquipment.OnKill(dead, elite)
            end)
            -- Kills fire inside weapon hit loops; RunSession tears down after the loop.
            if not ok then RunSession.RequestFail(message) end
        end, function()
            -- Defer teardown: the death can fire inside a weapon or enemy callback.
            RunSession.RequestFinish("defeated")
        end, difficulty, BonusReward)
        BlzSetHeroProperName(run.hero, SurvivorConfig.heroes[heroId].name)
        SurvivorProgression.Watch(run.hero)
        BlzUnitDisableAbility(run.hero, FourCC("Aatk"), true, true)
        BlzUnitDisableAbility(run.hero, FourCC("AHer"), true, true)
        BlzSetUnitMaxHP(run.hero, SurvivorConfig.heroLife)
        SetWidgetLife(run.hero, SurvivorConfig.heroLife)
        SetUnitMoveSpeed(run.hero, run.stats.moveSpeed)
        -- Listener order: Combat.Init above created the supply pickup trigger first,
        -- so EVENT_PLAYER_UNIT_PICKUP_ITEM reaches Combat (bonus items) before
        -- Equipment (catalog gear). Their item sets are disjoint; keep them so.
        SurvivorEquipment.Init(run.hero, run.build, SurvivorUI.Notify)
        SetWidgetLife(run.hero, BlzGetUnitMaxHP(run.hero)) -- Start at full HP, including the chosen vitality trinket.
        SurvivorNativeLoadout.Init(run.hero, run.build)
        SurvivorExpedition.BeginStage(run.hero, 1, 0, ExpeditionReward, expeditionCombat)
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
        SurvivorCombat.TrackWeapons(run.build.weapons)
        RefreshDamageBoard()
        SurvivorInventoryPause.Init()
        if SurvivorUtil.IsLocalPlayer() then
            ClearSelection()
            SelectUnit(run.hero, true)
            SetCameraPosition(x, y)
            SetCameraTargetController(run.hero, 0, 0, false)
        end
        local ticket = BeginTransition("intro")
        -- A failed pause hook already ran Finish and showed the error result; an
        -- introduction opened now would hide that result behind a dead run.
        if not RunSession.BeginStageClear() or RunSession.GetState() ~= "STAGE_CLEAR" then return end
        ShowStageIntroduction(ticket, startingWeapon)
        SurvivorNativeLoadout.Refresh()
    end
    function AnyasLongNight.Start()
        assert(initialized, "Start after AnyasLongNight.Init")
        SurvivorSetup.Close()
        RunSession.Finish("restarted")
        SurvivorSetup.Show()
    end
    AnyasLongNight.IsStorySummary, AnyasLongNight.ToggleStorySummary = SurvivorSetup.IsStorySummary, SurvivorSetup.ToggleStorySummary
    AnyasLongNight.OpenSetup, AnyasLongNight.ResetSetup, AnyasLongNight.SelectSetup = SurvivorSetup.Open, SurvivorSetup.Reset, SurvivorSetup.Select
    function AnyasLongNight.CanRetrySame()
        return RunSession.GetState() == "FINISHED" and SurvivorSetup.Complete()
    end
    function AnyasLongNight.RetrySame()
        if not AnyasLongNight.CanRetrySame() then return false end
        SurvivorSetup.Reopen()
        return AnyasLongNight.BeginRun()
    end
    function AnyasLongNight.BeginRun()
        assert(initialized, "Start after AnyasLongNight.Init")
        -- Consume setup once before native creation or callbacks.
        local weapon, trinket = SurvivorSetup.Consume()
        if not weapon then return false end
        local ok, message = pcall(Start, weapon, trinket)
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
            Attempt(errors, "result UI", function() SurvivorUI.ShowResult("error", RunSession.GetElapsed(), run.kills) end)
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
        SurvivorUI.Init(SurvivorProgression.Choose, AnyasLongNight.Start, SurvivorProgression.Reroll, AnyasLongNight.NextStage,
            SurvivorProgression.Exclude, AnyasLongNight.RetrySame, AnyasLongNight.CanRetrySame)
        SurvivorSetupUI.Init(AnyasLongNight.OpenSetup, AnyasLongNight.SelectSetup, AnyasLongNight.ResetSetup, AnyasLongNight.BeginRun,
            AnyasLongNight.IsStorySummary, AnyasLongNight.ToggleStorySummary)
        SurvivorDebugCommands.Init({
            run = function() return run end, restart = AnyasLongNight.Start, startBoss = StartBoss,
            refreshBoard = function() RefreshDamageBoard() end,
        })
        initialized = true
        if SurvivorConfig.autoStart then AnyasLongNight.Start() end
    end
    OnInit.final("AnyasLongNight", function(Require)
        Require "ALICE"
        AnyasLongNight.Init()
    end)
end
