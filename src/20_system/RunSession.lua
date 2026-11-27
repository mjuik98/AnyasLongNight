-- One ALICE callback advances gameplay time. Units/effects belong to lifecycle hooks.
RunSession = {}
do
    local state, elapsed = "READY", 0.0
    local caller, hooks = nil, nil
    local generation = 0
    local haltedBySession = false
    local choosing, inventoryOpen, stageClear = false, false, false
    -- A teardown requested (RequestFinish/RequestFail) from inside a hit, death,
    -- pickup or item-loop callback waits for a session-owned callback (the gameplay
    -- step while running, the watchdog while paused), so no caller's state is
    -- cleaned under its own stack. Frame clicks, chat commands and story/UI timers
    -- run outside those loops and may call Fail/Finish directly as their last step.
    local pendingReason, pendingMessage = nil, nil
    -- Protected ALICE catches actor errors, disables only that pair and keeps the
    -- cycle running; its error observer reports them here. An error outside the
    -- protected regions halts the whole cycle instead, and this native timer
    -- notices that the gameplay clock stopped while still RUNNING. A pause that
    -- would begin on such a halted cycle fails the run instead (ApplyPauseReasons).
    local watchdog, watchedElapsed, stalledFor = nil, 0.0, 0.0
    local WATCHDOG_INTERVAL, WATCHDOG_LIMIT = 0.5, 3.0
    function RunSession.GetState() return state end
    function RunSession.GetElapsed() return elapsed end
    function RunSession.IsRunning() return state == "RUNNING" and pendingReason == nil end
    -- A paused state (CHOOSING/INVENTORY/STAGE_CLEAR) keeps its name until the
    -- watchdog consumes a pending teardown; player actions check this as well.
    function RunSession.IsPending() return pendingReason ~= nil end
    -- Player actions and deferred stage callbacks act only on this paused state, and only
    -- while no pending teardown is about to replace it.
    function RunSession.CanAct(expected) return state == expected and pendingReason == nil end
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
    -- Records a failure as "<label>: message"; a nil trigger is skipped.
    function RunSession.DestroyTrigger(errors, label, trigger)
        if trigger == nil then return end
        RunSession.Attempt(errors, label, function() DestroyTrigger(trigger) end)
    end
    -- Wraps a trigger action. DebugUtils' Debug.try would only print its error;
    -- unit and item events can fire inside hit or item loops, so teardown is deferred.
    function RunSession.TriggerAction(action)
        return function()
            local ok, message = pcall(action)
            if not ok then RunSession.RequestFail(message) end
        end
    end

    function RunSession.Finish(reason)
        if state == "FINISHED" or state == "READY" then return false end
        state = "FINISHED"
        generation = generation + 1
        choosing, inventoryOpen, stageClear = false, false, false
        -- A direct Fail/Finish can preempt a queued error; keep that root cause visible.
        local preempted = pendingMessage
        pendingReason, pendingMessage = nil, nil
        if preempted ~= nil then print("[AnyasLongNight] (earlier pending) " .. preempted) end
        -- Detach ownership before any native/callback can fail or re-enter Finish.
        local oldCaller, oldHooks, wasHalted, oldWatchdog = caller, hooks, haltedBySession, watchdog
        caller, hooks, haltedBySession, watchdog = nil, nil, false, nil
        local errors = {}
        local function Attempt(label, action) RunSession.Attempt(errors, label, action) end
        if oldCaller ~= nil then Attempt("disable callback", function() ALICE_DisableCallback(oldCaller) end) end
        if type(ALICE_SetErrorObserver) == "function" then Attempt("error observer", function() ALICE_SetErrorObserver(nil) end) end
        RunSession.CancelTimer(errors, "watchdog", oldWatchdog)
        if oldHooks and oldHooks.finish then Attempt("finish", function() oldHooks.finish(reason or "stopped") end) end
        -- Clean up while frozen, including when ending during a choice. A cycle that
        -- halted itself after an unprotected crash is resumed too, so actors released
        -- by cleanup drain now instead of piling up until the next run resumes ALICE.
        local haltedElsewhere = not wasHalted and type(ALICE_IsHalted) == "function" and ALICE_IsHalted()
        if wasHalted or haltedElsewhere then Attempt("resume ALICE", ALICE_Resume) end
        for _, message in ipairs(errors) do print("[AnyasLongNight cleanup] " .. message) end
        return true
    end
    function RunSession.Fail(message)
        local ended = RunSession.Finish("error")
        if state == "READY" then state = "FINISHED" end
        -- A failure with no live run (startup before hooks, or a late error after teardown).
        print("[AnyasLongNight] " .. (ended and "" or "(no active run) ") .. tostring(message))
    end
    -- For callbacks that may run inside a hit/death loop or inside a caller that keeps
    -- using module state after the call. The request is consumed by the session
    -- callback while running and by the watchdog while paused; an error replaces a
    -- pending finish.
    function RunSession.RequestFinish(reason, message)
        if state == "READY" or state == "FINISHED" then return false end
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
        -- No gameplay step runs while paused, so this timer consumes paused requests.
        if pendingReason ~= nil and state ~= "RUNNING" then ConsumePending(); return end
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
        -- Actor callbacks run inside hit loops, so their errors defer teardown.
        if type(ALICE_SetErrorObserver) == "function" then
            ALICE_SetErrorObserver(function(message)
                if generation == runGeneration then RunSession.RequestFail("ALICE actor error: " .. tostring(message)) end
            end)
        end
        return true
    end
    local function ApplyPauseReasons()
        if state == "READY" or state == "FINISHED" then return false end
        -- A requested finish wins over a new pause; the next callback consumes it.
        if pendingReason ~= nil then return false end
        local nextState = stageClear and "STAGE_CLEAR" or choosing and "CHOOSING" or inventoryOpen and "INVENTORY" or "RUNNING"
        if nextState == state then return true end
        -- A cycle halted by an unprotected actor crash must not be adopted as a session
        -- pause: the later resume would restart it silently and hide the crash from the
        -- watchdog, which only measures stalls while RUNNING.
        if state == "RUNNING" and not haltedBySession and type(ALICE_IsHalted) == "function" and ALICE_IsHalted() then
            RunSession.Fail("ALICE cycle halted after an actor error before " .. nextState)
            return false
        end
        state = nextState
        if nextState == "RUNNING" then
            local ok, message = pcall(hooks.resume)
            if not ok then RunSession.Fail(message); return false end
            if haltedBySession then
                haltedBySession = false
                local resumed, resumeError = pcall(ALICE_Resume)
                if not resumed then RunSession.Fail(resumeError); return false end
            end
        else
            -- Switching between two pause reasons never advances combat/time.
            local ok, message = pcall(hooks.pause, nextState)
            if not ok then RunSession.Fail(message); return false end
            -- Own the halt only after it succeeds, so Finish never resumes a cycle it did not stop.
            if not haltedBySession then
                local halted, haltError = pcall(ALICE_Halt, false)
                if not halted then RunSession.Fail(haltError); return false end
                haltedBySession = true
            end
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
