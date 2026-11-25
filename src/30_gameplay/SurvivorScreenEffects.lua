-- Local full-screen presentation: the time-stop world filter (a cine filter) and the
-- red hit vignette (a UI frame, so the two never share a native). Both fade on their
-- own timers; a failed fade stops and reports once. SurvivorUI exposes these calls.
SurvivorScreenEffects = {}
do
    local timeStopFilterTimer, timeStopFilterGeneration = nil, 0
    local timeStopFilterActive, timeStopFilterOwned, timeStopFilterAlpha = false, false, 0
    local hitVignette, hitTimer, hitTimerRunning = nil, nil, false
    local hitAlpha, hitPeak, hitHold, hitRate = 0, 0, 0, 0
    -- Attempt both natives through the shared helper, then raise every failure.
    local function StopTimer(timer)
        local errors = {}
        RunSession.CancelTimer(errors, "UI timer", timer)
        if #errors > 0 then error(table.concat(errors, "\n"), 0) end
    end
    local function CancelTimeStopFilterFade()
        timeStopFilterGeneration = timeStopFilterGeneration + 1
        local timer = timeStopFilterTimer
        timeStopFilterTimer = nil
        StopTimer(timer)
    end
    -- Cine filters tint the world render, without recoloring UI frames or consuming input.
    function SurvivorScreenEffects.SetTimeStopFilter(active, immediate)
        if not immediate and active == timeStopFilterActive then return end
        CancelTimeStopFilterFade()
        timeStopFilterActive = active
        if not active and not timeStopFilterOwned then return end
        local config = SurvivorConfig.bonusProps.timeStopFilter
        local target = active and config.alpha or 0
        if active then timeStopFilterOwned = true end
        local function Paint(alpha)
            timeStopFilterAlpha = alpha
            if SurvivorConfig.IsLocalPlayer() then
                local color, opacity = config.color, math.floor(alpha + 0.5)
                SetCineFilterDuration(0)
                SetCineFilterStartColor(color[1], color[2], color[3], opacity)
                SetCineFilterEndColor(color[1], color[2], color[3], opacity)
                DisplayCineFilter(opacity > 0)
            end
        end
        if SurvivorConfig.IsLocalPlayer() then
            SetCineFilterTexture(config.texture)
            SetCineFilterBlendMode(BLEND_MODE_BLEND)
            SetCineFilterTexMapFlags(TEXMAP_FLAG_NONE)
            SetCineFilterStartUV(0, 0, 1, 1)
            SetCineFilterEndUV(0, 0, 1, 1)
        end
        if immediate or timeStopFilterAlpha == target then
            Paint(target)
            timeStopFilterOwned = active
            return
        end
        local start, elapsed = timeStopFilterAlpha, 0
        local duration = active and config.fadeIn or config.fadeOut
        local timer, generation = CreateTimer(), timeStopFilterGeneration
        timeStopFilterTimer = timer
        TimerStart(timer, 0.02, true, function()
            if generation ~= timeStopFilterGeneration then return end
            -- Debug.try would only print here, every tick; stop the fade and report once.
            local ok, message = pcall(function()
                elapsed = elapsed + 0.02
                local fraction = math.min(1, (elapsed + 0.000001) / duration)
                Paint(start + (target - start) * fraction)
                if fraction == 1 then
                    timeStopFilterOwned = active
                    CancelTimeStopFilterFade()
                end
            end)
            if not ok then
                pcall(CancelTimeStopFilterFade)
                RunSession.RequestFail(message)
            end
        end)
    end
    -- Created first and display-only, so every HUD panel draws above the flash.
    function SurvivorScreenEffects.Init(parent)
        hitVignette = BlzCreateFrameByType("BACKDROP", "HSHitVignette", parent, "", 0)
        BlzFrameSetAbsPoint(hitVignette, FRAMEPOINT_CENTER, 0.4, 0.3)
        BlzFrameSetSize(hitVignette, 0.8, 0.6)
        BlzFrameSetTexture(hitVignette, SurvivorConfig.hitVignette.texture, 0, true)
        BlzFrameSetEnable(hitVignette, false)
        BlzFrameSetLevel(hitVignette, 1)
        BlzFrameSetVisible(hitVignette, false)
    end
    local function PaintHitVignette(alpha)
        hitAlpha = alpha
        if not hitVignette or not SurvivorConfig.IsLocalPlayer() then return end
        local opacity = math.floor(alpha + 0.5)
        if opacity > 0 then
            -- Stretch to the local screen so the red edges sit on its real borders.
            local width = BlzGetLocalClientWidth and BlzGetLocalClientWidth() or 0
            local height = BlzGetLocalClientHeight and BlzGetLocalClientHeight() or 0
            local aspect = width > 0 and height > 0 and width / height or 4 / 3
            BlzFrameSetSize(hitVignette, 0.6 * aspect, 0.6)
            BlzFrameSetAlpha(hitVignette, opacity)
        end
        BlzFrameSetVisible(hitVignette, opacity > 0)
    end
    local function StopHitVignette()
        local running = hitTimerRunning
        hitTimerRunning, hitPeak, hitHold, hitRate = false, 0, 0, 0
        if hitTimer and running then PauseTimer(hitTimer) end
        PaintHitVignette(0)
    end
    -- Strength follows damage / max HP; within the cooldown only a heavier hit relights it.
    function SurvivorScreenEffects.HitFlash(fraction)
        if not hitVignette then return end
        local c = SurvivorConfig.hitVignette
        local target = c.minAlpha + (c.maxAlpha - c.minAlpha) * math.max(0, math.min(1, fraction / c.fullFraction))
        if target <= hitAlpha or (hitHold > 0 and target <= hitPeak) then return end
        hitPeak, hitHold, hitRate = target, c.cooldown, target / c.fade
        PaintHitVignette(target)
        if hitTimerRunning then return end
        hitTimer = hitTimer or CreateTimer()
        hitTimerRunning = true
        TimerStart(hitTimer, 0.02, true, function()
            -- Debug.try would only print here, every tick; stop the fade and report once.
            local ok, message = pcall(function()
                hitHold = math.max(0, hitHold - 0.02)
                if hitAlpha > 0 then PaintHitVignette(math.max(0, hitAlpha - hitRate * 0.02)) end
                if hitAlpha == 0 and hitHold == 0 then StopHitVignette() end
            end)
            if not ok then
                hitAlpha = 0
                pcall(StopHitVignette)
                RunSession.RequestFail(message)
            end
        end)
    end
    -- Stops the time-stop filter and hit vignette; both are attempted, then failures raised.
    -- The run teardown list calls this so a fade never outlives its run over the result.
    function SurvivorScreenEffects.Reset()
        local failures = {}
        for _, reset in ipairs({{"time stop filter", function() SurvivorScreenEffects.SetTimeStopFilter(false, true) end},
            {"hit vignette", StopHitVignette}}) do
            local ok, message = pcall(reset[2])
            if not ok then failures[#failures + 1] = reset[1] .. ": " .. tostring(message) end
        end
        if #failures > 0 then error(table.concat(failures, "\n"), 0) end
    end
end
