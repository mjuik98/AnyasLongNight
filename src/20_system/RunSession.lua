-- One ALICE callback advances gameplay time. Units/effects belong to lifecycle hooks.
RunSession = {}
do
    local state, elapsed = "READY", 0.0
    local caller, hooks = nil, nil
    local generation = 0
    local haltedBySession = false
    local choosing, inventoryOpen, stageClear = false, false, false
    -- A teardown requested from inside a hit, death or pickup callback waits for
    -- the session's own callback, so combat is never cleaned under its own loop.
    local pendingReason, pendingMessage = nil, nil
    -- ALICE stops its whole cycle after an uncaught actor error and only prints it.
    -- A native timer notices that the gameplay clock stopped while still RUNNING.
    local watchdog, watchedElapsed, stalledFor = nil, 0.0, 0.0
    local WATCHDOG_INTERVAL, WATCHDOG_LIMIT = 0.5, 3.0
    function RunSession.GetState() return state end
    function RunSession.GetElapsed() return elapsed end
    function RunSession.IsRunning() return state == "RUNNING" and pendingReason == nil end
    function RunSession.IsInventoryOpen() return inventoryOpen end
    -- Cleanup steps keep running after a failure; each failure is recorded as "label: message".
    function RunSession.Attempt(errors, label, action)
        local ok, result = pcall(action)
        if not ok then errors[#errors + 1] = label .. ": " .. tostring(result) end
        return ok, result
    end
    -- Attempts both timer natives; failures are recorded as "<label> pause/destroy: message".
    function RunSession.CancelTimer(errors, label, timer)
        if not timer then return end
        RunSession.Attempt(errors, label .. " pause", function() PauseTimer(timer) end)
        RunSession.Attempt(errors, label .. " destroy", function() DestroyTimer(timer) end)
    end

    function RunSession.Finish(reason)
        if state == "FINISHED" or state == "READY" then return false end
        state = "FINISHED"
        generation = generation + 1
        choosing, inventoryOpen, stageClear = false, false, false
        pendingReason, pendingMessage = nil, nil
        -- Detach ownership before any native/callback can fail or re-enter Finish.
        local oldCaller, oldHooks, wasHalted, oldWatchdog = caller, hooks, haltedBySession, watchdog
        caller, hooks, haltedBySession, watchdog = nil, nil, false, nil
        local errors = {}
        local function Attempt(label, action) RunSession.Attempt(errors, label, action) end
        if oldCaller ~= nil then Attempt("disable callback", function() ALICE_DisableCallback(oldCaller) end) end
        RunSession.CancelTimer(errors, "watchdog", oldWatchdog)
        if oldHooks and oldHooks.finish then Attempt("finish", function() oldHooks.finish(reason or "stopped") end) end
        -- Clean up while frozen, including when ending during a choice.
        if wasHalted then Attempt("resume ALICE", ALICE_Resume) end
        for _, message in ipairs(errors) do print("[AnyasLongNight cleanup] " .. message) end
        return true
    end
    function RunSession.Fail(message)
        RunSession.Finish("error")
        if state == "READY" then state = "FINISHED" end
        print("[AnyasLongNight] " .. tostring(message))
    end
    -- For callbacks that can run inside a hit/death loop. While paused no such loop
    -- runs, so the request is handled at once; an error replaces a pending finish.
    function RunSession.RequestFinish(reason, message)
        if state == "READY" or state == "FINISHED" then return false end
        if state ~= "RUNNING" then
            if message ~= nil then RunSession.Fail(message) else RunSession.Finish(reason) end
            return true
        end
        if pendingReason == nil or (message ~= nil and pendingMessage == nil) then
            pendingReason, pendingMessage = reason, message
        end
        return true
    end
    function RunSession.RequestFail(message)
        if not RunSession.RequestFinish("error", tostring(message)) then RunSession.Fail(message) end
    end
    local function ConsumePending()
        if pendingReason == nil then return false end
        local reason, message = pendingReason, pendingMessage
        pendingReason, pendingMessage = nil, nil
        if message ~= nil then RunSession.Fail(message) else RunSession.Finish(reason) end
        return true
    end
    local function Watch(runGeneration)
        if generation ~= runGeneration then return end
        if state ~= "RUNNING" or elapsed ~= watchedElapsed then
            watchedElapsed, stalledFor = elapsed, 0.0
            return
        end
        stalledFor = stalledFor + WATCHDOG_INTERVAL
        if pendingReason ~= nil then ConsumePending()
        elseif stalledFor >= WATCHDOG_LIMIT then
            RunSession.Fail("Gameplay clock stopped while running (ALICE cycle halted after an actor error)")
        end
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
        pendingReason, pendingMessage = nil, nil
        watchedElapsed, stalledFor = 0.0, 0.0
        local dt = ALICE_Config.MIN_INTERVAL
        caller = ALICE_CallPeriodic(function()
            if generation == runGeneration and state == "RUNNING" and not ConsumePending() then
                elapsed = elapsed + dt
                local started = SurvivorMetrics.Begin()
                local ok, message = pcall(stepCallback, dt, elapsed)
                SurvivorMetrics.End("gameplay.step", started)
                if not ok then RunSession.Fail(message)
                elseif generation == runGeneration then ConsumePending() end
            end
            return dt
        end, dt)
        local timer = CreateTimer()
        watchdog = timer
        TimerStart(timer, WATCHDOG_INTERVAL, true, function()
            local ok, message = pcall(Watch, runGeneration)
            if not ok then RunSession.Fail(message) end
        end)
        return true
    end
    local function ApplyPauseReasons()
        if state == "READY" or state == "FINISHED" then return false end
        -- A requested finish wins over a new pause; the next callback consumes it.
        if pendingReason ~= nil then return false end
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
        if not RunSession.IsRunning() then return false end
        choosing = true
        return ApplyPauseReasons()
    end
    function RunSession.EndChoice()
        if not choosing or state ~= "CHOOSING" then return false end
        choosing = false
        return ApplyPauseReasons()
    end
    function RunSession.BeginStageClear()
        if not RunSession.IsRunning() then return false end
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
        local previous = inventoryOpen
        inventoryOpen = open == true
        if previous ~= inventoryOpen and state == "CHOOSING" then
            -- The cards remain paused, but ASde needs its visible regeneration
            -- and frozen-vitals policy refreshed when a native panel opens/closes.
            local ok, message = pcall(hooks.pause, state)
            if not ok then RunSession.Fail(message); return false end
        end
        return ApplyPauseReasons()
    end
end
