-- Native Blizzard HUD visibility: the permanently hidden decorations (upper menu bar,
-- resources, clock, minimap) and the console containers a story scene or the setup
-- screen hides temporarily. Only stable Frame/SimpleFrame containers are touched,
-- never their enable state, anchors or size, and never an ancestor of the custom UI.
SurvivorNativeHUD = {}
do
    local hiddenFrames = {}
    local cinematicFrames, cinematicSaved, cinematicAncestors = {}, {}, {}
    local cinematicMode
    local ValidNativeFrame = SurvivorConfig.ValidFrame
    local function CacheHiddenFrame(frame)
        if ValidNativeFrame(frame) then hiddenFrames[#hiddenFrames + 1] = frame end
    end
    local function NativeChild(frame, index)
        if not BlzFrameGetChild or not BlzFrameGetChildrenCount or not ValidNativeFrame(frame) then return nil end
        if BlzFrameGetChildrenCount(frame) <= index then return nil end
        local child = BlzFrameGetChild(frame, index)
        return ValidNativeFrame(child) and child or nil
    end
    function SurvivorNativeHUD.HideDecorations()
        if not SurvivorConfig.IsLocalPlayer() then return end
        for _, frame in ipairs(hiddenFrames) do
            if ValidNativeFrame(frame) and BlzFrameIsVisible(frame) then BlzFrameSetVisible(frame, false) end
        end
    end
    local function CacheCinematicFrame(name, context, introOnly, origin, index)
        cinematicFrames[#cinematicFrames + 1] = {name = name, context = context or 0,
            introOnly = introOnly == true, origin = origin, index = index or 0}
    end
    local function AcquireCinematicFrames()
        -- Lookups can allocate handles: acquire on every client, before local visibility.
        for _, entry in ipairs(cinematicFrames) do
            if not ValidNativeFrame(entry.frame) then
                local frame = entry.name and BlzGetFrameByName(entry.name, entry.context)
                    or (entry.origin and BlzGetOriginFrame(entry.origin, entry.index))
                entry.frame = ValidNativeFrame(frame) and not cinematicAncestors[frame] and frame or nil
            end
        end
    end
    function SurvivorNativeHUD.Mode() return cinematicMode end
    -- Restores every container a scene hid; a failed native stays saved for a later retry.
    function SurvivorNativeHUD.Restore()
        cinematicMode = nil
        if not SurvivorConfig.IsLocalPlayer() then return end
        local pending, failures = cinematicSaved, {}
        cinematicSaved = {}
        for frame, state in pairs(pending) do
            if state.changed and ValidNativeFrame(frame) then
                local ok, message = pcall(BlzFrameSetVisible, frame, state.visible)
                if not ok then
                    cinematicSaved[frame] = state -- A later cleanup can retry a failed native.
                    failures[#failures + 1] = tostring(message)
                end
            end
        end
        if #failures > 0 then error(table.concat(failures, "\n")) end
    end
    -- mode "intro"/"setup" hides every listed container; "conversation" keeps the intro-only ones.
    function SurvivorNativeHUD.Apply(mode)
        AcquireCinematicFrames()
        cinematicMode = mode
        if not SurvivorConfig.IsLocalPlayer() then return end
        local hidden = {}
        for _, entry in ipairs(cinematicFrames) do
            if ValidNativeFrame(entry.frame) and (mode == "intro" or mode == "setup" or not entry.introOnly) then
                hidden[entry.frame] = true
            end
        end
        -- Capture every flag before hiding any parent; do not snapshot inherited invisibility.
        for frame in pairs(hidden) do
            if cinematicSaved[frame] == nil then
                cinematicSaved[frame] = {visible = BlzFrameIsVisible(frame), changed = false}
            end
        end
        for frame, state in pairs(cinematicSaved) do
            if not hidden[frame] then
                if state.changed then BlzFrameSetVisible(frame, state.visible) end
                cinematicSaved[frame] = nil
            end
        end
        for frame in pairs(hidden) do
            if BlzFrameIsVisible(frame) then
                cinematicSaved[frame].changed = true
                BlzFrameSetVisible(frame, false)
            end
        end
        -- No native enable/anchor/size/parent writes: hotkeys and original positions survive.
    end
    -- Re-applies the active scene's hiding (selection can reopen containers), or retries a restore.
    function SurvivorNativeHUD.Refresh()
        SurvivorNativeHUD.HideDecorations()
        if cinematicMode then SurvivorNativeHUD.Apply(cinematicMode)
        elseif next(cinematicSaved) ~= nil then SurvivorNativeHUD.Restore() end
    end
    local gameUI
    -- Caches and hides the permanent decorations once, before the custom UI is built.
    function SurvivorNativeHUD.CacheDecorations()
        -- Acquire native handles on every client before changing local visibility.
        -- Keep native button enable states: hiding the upper bar leaves F10 usable.
        CacheHiddenFrame(BlzGetFrameByName("UpperButtonBarFrame", 0))
        CacheHiddenFrame(BlzGetFrameByName("ResourceBarFrame", 0))
        -- Reforged 2.0 added separate top art. Do not hide the bottom console parents.
        CacheHiddenFrame(BlzGetFrameByName("ConsoleTopBar", 0))
        -- Tasyen's Big UI-Frame Tutorial (1.32.6+) identifies the clock at [5][0].
        -- Its parent also contains the minimap, so cache only the clock itself.
        gameUI = BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0)
        CacheHiddenFrame(NativeChild(NativeChild(gameUI, 5), 0))
        -- common.j defines the minimap origins; Tasyen lists buttons 0..4,
        -- MiniMapFrame and MinimapButtonBar. Leave the shared clock/minimap parent visible.
        CacheHiddenFrame(BlzGetOriginFrame(ORIGIN_FRAME_MINIMAP, 0))
        CacheHiddenFrame(BlzGetFrameByName("MiniMapFrame", 0))
        CacheHiddenFrame(BlzGetFrameByName("MinimapButtonBar", 0))
        for i = 0, 4 do CacheHiddenFrame(BlzGetOriginFrame(ORIGIN_FRAME_MINIMAP_BUTTON, i)) end
        SurvivorNativeHUD.HideDecorations()
    end
    -- Caches the scene-hidden containers once; parent is the custom UI's parent.
    function SurvivorNativeHUD.CacheContainers(parent)
        -- Never hide any ancestor of the custom UI, including the fallback GameUI.
        local ancestor = parent
        for _ = 1, 64 do
            if not ValidNativeFrame(ancestor) or cinematicAncestors[ancestor] then break end
            cinematicAncestors[ancestor] = true
            ancestor = BlzFrameGetParent and BlzFrameGetParent(ancestor) or nil
        end
        if ValidNativeFrame(gameUI) then cinematicAncestors[gameUI] = true end
        -- Visibility natives require a Frame/SimpleFrame container. Native String/Texture
        -- handles (InventoryText, SimpleNameValue, portrait HP/mana text) can crash the
        -- engine even when GetHandleId is valid; Lua pcall cannot catch that fault.
        -- Leave the inventory cover alone as well; hide the inventory's container.
        -- Unit-detail, stat, level, progress and buff panels are selection-owned.
        -- Restoring a hero's saved visibility while a non-hero portrait is selected
        -- can enter an invalid native state. Leave those panels and individual
        -- command/item buttons to the engine; only manage stable HUD containers.
        for _, name in ipairs({"CommandBarFrame", "SimpleInventoryBar",
            "ConsoleBottomBarOverlay", "ConsoleUIOverlay"}) do CacheCinematicFrame(name) end
        for _, name in ipairs({"ConsoleUI", "ConsoleBottomBar"}) do
            CacheCinematicFrame(name, 0, true)
        end
        -- Keep the speaker's portrait/name and Hero armor during dialogue, hiding combat clutter.
        for _, entry in ipairs({{ORIGIN_FRAME_HERO_BAR},
            {ORIGIN_FRAME_PORTRAIT, true},
            {ORIGIN_FRAME_TOOLTIP, true}, {ORIGIN_FRAME_UBERTOOLTIP, true}}) do
            if entry[1] then CacheCinematicFrame(nil, nil, entry[2], entry[1]) end
        end
        -- The opaque backdrop covers the world and its overlays. Leave renderer-owned
        -- origin frames and undocumented child indices alone when opening a modal UI.
        AcquireCinematicFrames()
    end
end
