-- One ALICE callback advances gameplay time. Units/effects belong to lifecycle hooks.
RunSession = {}
do
    local state, elapsed = "READY", 0.0
    local caller, hooks = nil, nil
    local generation = 0
    local haltedBySession = false
    local choosing, inventoryOpen, stageClear = false, false, false
    function RunSession.GetState() return state end
    function RunSession.GetElapsed() return elapsed end
    function RunSession.IsRunning() return state == "RUNNING" end

    function RunSession.Finish(reason)
        if state == "FINISHED" or state == "READY" then return false end
        state = "FINISHED"
        generation = generation + 1
        choosing, inventoryOpen, stageClear = false, false, false
        -- Detach ownership before any native/callback can fail or re-enter Finish.
        local oldCaller, oldHooks, wasHalted = caller, hooks, haltedBySession
        caller, hooks, haltedBySession = nil, nil, false
        local errors = {}
        local function Attempt(label, action)
            local ok, message = pcall(action)
            if not ok then errors[#errors + 1] = label .. ": " .. tostring(message) end
        end
        if oldCaller ~= nil then Attempt("disable callback", function() ALICE_DisableCallback(oldCaller) end) end
        if oldHooks and oldHooks.finish then Attempt("finish", function() oldHooks.finish(reason or "stopped") end) end
        -- Clean up while frozen, including when ending during a choice.
        if wasHalted then Attempt("resume ALICE", ALICE_Resume) end
        for _, message in ipairs(errors) do print("[HeroSurvivor cleanup] " .. message) end
        return true
    end
    function RunSession.Fail(message)
        RunSession.Finish("error")
        if state == "READY" then state = "FINISHED" end
        print("[HeroSurvivor] " .. tostring(message))
    end
    function RunSession.Start(stepCallback, lifecycle)
        if state ~= "READY" and state ~= "FINISHED" then return false end
        assert(ALICE_Initialized, "Start after ALICE initialization")
        assert(type(stepCallback) == "function", "Missing gameplay step")
        assert(type(lifecycle) == "table" and type(lifecycle.pause) == "function"
            and type(lifecycle.resume) == "function", "Missing pause lifecycle")
        elapsed, hooks, state = 0.0, lifecycle, "RUNNING"
        generation = generation + 1
        local runGeneration = generation
        choosing, inventoryOpen, stageClear = false, false, false
        local dt = ALICE_Config.MIN_INTERVAL
        caller = ALICE_CallPeriodic(function()
            if generation == runGeneration and state == "RUNNING" then
                elapsed = elapsed + dt
                local started = SurvivorMetrics.Begin()
                local ok, message = pcall(stepCallback, dt, elapsed)
                SurvivorMetrics.End("gameplay.step", started)
                if not ok then RunSession.Fail(message) end
            end
            return dt
        end, dt)
        return true
    end
    local function ApplyPauseReasons()
        if state == "READY" or state == "FINISHED" then return false end
        local nextState = stageClear and "STAGE_CLEAR" or choosing and "CHOOSING" or inventoryOpen and "INVENTORY" or "RUNNING"
        if nextState == state then return true end
        state = nextState
        if nextState == "RUNNING" then
            local ok, message = pcall(hooks.resume)
            if not ok then RunSession.Fail(message); return false end
            if haltedBySession then haltedBySession = false; ALICE_Resume() end
        else
            -- Switching between two pause reasons never advances combat/time.
            local ok, message = pcall(hooks.pause, nextState)
            if not ok then RunSession.Fail(message); return false end
            if not haltedBySession then haltedBySession = true; ALICE_Halt(false) end
        end
        return true
    end
    function RunSession.BeginChoice()
        if state ~= "RUNNING" then return false end
        choosing = true
        return ApplyPauseReasons()
    end
    function RunSession.EndChoice()
        if not choosing or state ~= "CHOOSING" then return false end
        choosing = false
        return ApplyPauseReasons()
    end
    function RunSession.BeginStageClear()
        if state ~= "RUNNING" then return false end
        stageClear = true
        return ApplyPauseReasons()
    end
    function RunSession.EndStageClear()
        if not stageClear then return false end
        stageClear = false
        return ApplyPauseReasons()
    end
    function RunSession.SetInventoryOpen(open)
        if state == "READY" or state == "FINISHED" then return false end
        inventoryOpen = open == true
        return ApplyPauseReasons()
    end
end
