-- "-hs" chat commands for playtest builds (SurvivorConfig.debugCommands). The trigger is
-- map-lifetime and registered once across restarts; the lifecycle passes a port for the
-- run record, the restart, the boss start and the damage board refresh.
SurvivorDebugCommands = {}
do
    local trigger = nil
    local weaponSets = {
        ["-hs weapons"] = {"flamefield", "chainlightning", "orbitblade"},
        ["-hs newweapons"] = {"monsoon", "frontslash", "frostshard"},
        ["-hs ice"] = {"frostshard", "frostnova", "blizzard"},
        ["-hs additions"] = {"meteor", "thunderorb", "returnblade"},
    }
    local function Run(port, text)
        local run = port.run()
        if text == "-hs restart" then port.restart()
        elseif text == "-hs perf on" then SurvivorMetrics.Enable(true); print("[HS performance] 측정 시작 / -hs perf 로 확인")
        elseif text == "-hs perf off" then SurvivorMetrics.Enable(false); SurvivorMetrics.Report()
        elseif text == "-hs perf" then SurvivorMetrics.Report()
        elseif text == "-hs inventory" then SurvivorInventoryPause.DebugStatus()
        elseif text == "-hs ui" then SurvivorUI.DebugStatus()
        elseif text == "-hs loot" and RunSession.IsRunning() then SurvivorEquipment.DebugDrops()
        elseif text == "-hs elite" and RunSession.IsRunning() then SurvivorCombat.Spawn(true)
        elseif text == "-hs ranged" and RunSession.IsRunning() then SurvivorCombat.Spawn(false, "ranged")
        elseif text == "-hs flying" and RunSession.IsRunning() then SurvivorCombat.Spawn(false, "flying")
        elseif text == "-hs boss" and RunSession.IsRunning() and not run.bossStarted then
            port.startBoss(RunSession.GetElapsed())
        elseif weaponSets[text] and RunSession.IsRunning() then
            for _, id in ipairs(weaponSets[text]) do
                if SurvivorAugments.Level(run.build, id) == 0 and SurvivorAugments.CanChoose(id, run.build) then
                    SurvivorAugments.Apply(id, run.build, run.hero)
                end
            end
            SurvivorCombat.TrackWeapons(run.build.weapons)
            SurvivorNativeLoadout.Refresh()
            port.refreshBoard()
        elseif text == "-hs choice" and RunSession.IsRunning() then
            local before = GetHeroLevel(run.hero)
            SetHeroLevel(run.hero, before + 1, true)
            SurvivorProgression.Queue()
            if GetHeroLevel(run.hero) == before then print("[AnyasLongNight] 맵의 최대 영웅 레벨에 도달했습니다.") end
        elseif text == "-hs stats" then
            local enemies, effects = SurvivorCombat.Counts()
            print(string.format("[AnyasLongNight] %s / %.2fs / enemies=%d / effects=%d / pending=%d",
                RunSession.GetState(), RunSession.GetElapsed(), enemies, effects, SurvivorProgression.Pending()))
            if run.hero ~= nil then
                print(string.format("[AnyasLongNight] stage=%d/%d / stage time=%.1f / hero level=%d / XP=%d", run.stage, SurvivorConfig.stages, RunSession.GetElapsed() - run.stageStarted, GetHeroLevel(run.hero), GetHeroXP(run.hero)))
                print(SurvivorCombat.DamageReport())
            end
        else
            local xp = tonumber(text:match("^%-hs xp (%d+)$"))
            if xp and RunSession.IsRunning() then SurvivorProgression.AwardXP(math.min(xp, 100000)); return end
            local count = tonumber(text:match("^%-hs spawn (%d+)$"))
            if count and RunSession.IsRunning() then
                for _ = 1, math.min(count, SurvivorConfig.maxEnemies) do
                    if not SurvivorCombat.Spawn() then break end
                end
            end
        end
    end
    function SurvivorDebugCommands.Init(port)
        if trigger ~= nil or not SurvivorConfig.debugCommands then return end
        trigger = CreateTrigger()
        TriggerRegisterPlayerChatEvent(trigger, SurvivorUtil.Owner(), "-hs", false)
        TriggerAddAction(trigger, function()
            local ok, message = pcall(Run, port, GetEventPlayerChatString())
            if not ok then RunSession.Fail(message) end
        end)
    end
end
