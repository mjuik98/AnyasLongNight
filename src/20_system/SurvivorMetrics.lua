-- Opt-in diagnostics. Measurements never control gameplay or cleanup budgets.
SurvivorMetrics = {}
do
    local enabled, counters, timings = false, {}, {}
    local clock = type(os) == "table" and type(os.clock) == "function" and os.clock or nil
    local function ReadClock()
        if not clock then return nil end
        local ok, value = pcall(clock)
        if not ok or type(value) ~= "number" or value ~= value or math.abs(value) == math.huge then
            clock = nil -- Diagnostics fall back to counts; gameplay never needs this clock.
            return nil
        end
        return value
    end
    function SurvivorMetrics.Enable(value)
        enabled = value == true
        if enabled then counters, timings = {}, {} end
        if type(ALICE_SetResumeObserver) == "function" then
            ALICE_SetResumeObserver(enabled and SurvivorMetrics.ResumeCycleBegin or nil,
                enabled and SurvivorMetrics.ResumeCycleEnd or nil)
        end
    end
    function SurvivorMetrics.Count(name, amount)
        if enabled then counters[name] = (counters[name] or 0) + (amount or 1) end
    end
    function SurvivorMetrics.Begin()
        if enabled then return ReadClock() end
    end
    function SurvivorMetrics.End(name, started)
        if not enabled or type(started) ~= "number" or started ~= started or math.abs(started) == math.huge then return end
        local finished = ReadClock()
        if not finished then return end
        local elapsed = math.max(0, finished - started) * 1000
        local row = timings[name] or {count = 0, total = 0, peak = 0}
        row.count, row.total, row.peak = row.count + 1, row.total + elapsed, math.max(row.peak, elapsed)
        timings[name] = row
    end
    function SurvivorMetrics.ResumeCycleBegin(backlog)
        SurvivorMetrics.Count("resume.cycles")
        SurvivorMetrics.Count("resume.backlogActors", backlog)
        return SurvivorMetrics.Begin()
    end
    function SurvivorMetrics.ResumeCycleEnd(started, actors, pairs)
        SurvivorMetrics.Count("resume.removedActors", actors)
        SurvivorMetrics.Count("resume.removedPairs", pairs)
        SurvivorMetrics.End("resume.cycle", started)
    end
    function SurvivorMetrics.Report()
        print("[HS performance] " .. (enabled and "ON" or "OFF") .. " / Lua CPU time; not frame time")
        if not clock then print("[HS performance] CPU clock unavailable; counters only") end
        local names = {}
        for name in pairs(counters) do names[#names + 1] = name end
        table.sort(names)
        for _, name in ipairs(names) do print(string.format("  %s = %d", name, counters[name])) end
        names = {}
        for name in pairs(timings) do names[#names + 1] = name end
        table.sort(names)
        for _, name in ipairs(names) do
            local row = timings[name]
            print(string.format("  %s: calls=%d mean=%.3fms peak=%.3fms total=%.3fms", name,
                row.count, row.total / row.count, row.peak, row.total))
        end
    end
end
