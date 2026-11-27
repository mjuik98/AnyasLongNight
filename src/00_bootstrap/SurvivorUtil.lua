-- Shared runtime helpers for every module: the run owner and local-player guard, handle
-- existence checks, terrain height, non-fatal presentation calls and owner-only frame events.
-- Configuration data and its derived rules stay in SurvivorConfig.
SurvivorUtil = {}
do
    -- The playing hero's id and profile, read from its unit type (default hero otherwise).
    function SurvivorUtil.HeroOf(unit)
        local typeId = unit and GetUnitTypeId(unit)
        for _, id in ipairs(SurvivorConfig.heroOrder) do
            if SurvivorConfig.heroes[id].unitId == typeId then return id, SurvivorConfig.heroes[id] end
        end
        return SurvivorConfig.defaultHero, SurvivorConfig.heroes[SurvivorConfig.defaultHero]
    end
    -- The single human player who owns the run.
    function SurvivorUtil.Owner()
        return Player(SurvivorConfig.playerId)
    end
    -- Guards local-only presentation; reads GetLocalPlayer on every call rather than caching it.
    function SurvivorUtil.IsLocalPlayer()
        return GetLocalPlayer() == SurvivorUtil.Owner()
    end
    -- Frame lookups can return nil, 0 or a released handle.
    function SurvivorUtil.ValidFrame(frame)
        return frame ~= nil and frame ~= 0 and GetHandleId(frame) ~= 0
    end
    -- A unit handle that still refers to a unit (removed units report type 0).
    function SurvivorUtil.UnitExists(unit)
        return unit ~= nil and GetUnitTypeId(unit) ~= 0
    end
    function SurvivorUtil.UnitLive(unit)
        return SurvivorUtil.UnitExists(unit) and UnitAlive(unit)
    end
    -- An item handle that still refers to an item (removed items report type 0).
    function SurvivorUtil.ItemExists(item)
        return item ~= nil and GetItemTypeId(item) ~= 0
    end
    -- Callers that collect cleanup errors keep their own existence check outside or inside the attempt.
    function SurvivorUtil.RemoveItemIfPresent(item)
        if SurvivorUtil.ItemExists(item) then RemoveItem(item) end
    end
    -- Terrain height at a point. One map-lifetime probe serves every module; never remove it.
    local terrainProbe = nil
    function SurvivorUtil.TerrainZ(x, y)
        if terrainProbe == nil then terrainProbe = Location(x, y) else MoveLocation(terrainProbe, x, y) end
        return GetLocationZ(terrainProbe)
    end
    -- Presentation (cues, notices, speech, screen flashes) called from hit, death or
    -- pickup loops. Like the screen-effect reset in SurvivorUI.BeginRun, a failure is
    -- reported but never ends the run; gameplay state changes stay outside this call.
    function SurvivorUtil.Present(label, action, ...)
        local ok, message = pcall(action, ...)
        if not ok then print("[AnyasLongNight presentation] " .. label .. ": " .. tostring(message)) end
        return ok
    end
    -- Owner-only frame event. Bootstrap loads before the run owner, so the caller
    -- passes the failure handler (gameplay modules pass RunSession.Fail).
    function SurvivorUtil.BindFrameEvent(triggers, frame, event, callback, onError)
        assert(type(onError) == "function", "Frame events need a failure handler")
        local trigger = CreateTrigger()
        triggers[#triggers + 1] = trigger
        BlzTriggerRegisterFrameEvent(trigger, frame, event)
        TriggerAddAction(trigger, function()
            if GetTriggerPlayer() ~= SurvivorUtil.Owner() then return end
            local ok, message = pcall(callback)
            if not ok then onError(message) end
        end)
    end
end
