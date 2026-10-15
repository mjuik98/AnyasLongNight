-- Observe WC3's own panels; create no inventory button or overlay.
-- These SIMPLEFRAME names occur in the installed 3.0.0.24268 client.
-- UI visibility is local, so only synchronized transitions change simulation state.
SurvivorInventoryPause = {}
do
    local frameNames = {"SimpleEquipmentInventoryPanel", "SimpleEquipmentPanel", "SimpleTalentsPanel"}
    local frames = {}
    local timer, syncTrigger
    local generation, sentSequence, receivedSequence = 0, 0, 0
    local activeGeneration
    local lastSentOpen = false
    local prefix = "HSInventory"

    local function ValidFrame(frame)
        return frame ~= nil and frame ~= 0 and GetHandleId(frame) ~= 0
    end
    local function ReadLocalPanels()
        local open, found = false, 0
        for _, name in ipairs(frameNames) do
            -- Some client frames are created lazily on their first opening.
            local frame = frames[name]
            if not ValidFrame(frame) then
                frame = BlzGetFrameByName(name, 0)
                -- Never cache an unavailable frame: native panels may appear later.
                frames[name] = ValidFrame(frame) and frame or nil
            end
            if ValidFrame(frame) then
                found = found + 1
                if BlzFrameIsVisible(frame) then open = true end
            end
        end
        return open, found
    end
    local function Tick()
        local state = RunSession.GetState()
        if state == "READY" or state == "FINISHED" then return end
        local revision
        -- This native timer keeps running while ALICE and the gameplay clock halt.
        if state == "INVENTORY" or state == "CHOOSING" or state == "STAGE_CLEAR" then
            SurvivorCombat.MaintainInventoryPause()
            if not SurvivorCombat.IsClearing() then
                local _
                if state == "STAGE_CLEAR" then _, revision = SurvivorEquipment.CollectRest()
                else _, revision = SurvivorEquipment.Reconcile() end
                -- Indicator recovery can remove an item displaced into the native bag.
                -- Only those transactions invalidate the already observed snapshot.
                if SurvivorNativeLoadout.Refresh() then revision = nil end
            end
        end
        -- Bag observation updates equipment metadata, so it runs on every client.
        -- The local renderer receives this revision instead of observing again.
        if revision == nil and SurvivorEquipment.UIRevision then revision = SurvivorEquipment.UIRevision() end
        if GetLocalPlayer() == Player(SurvivorConfig.playerId) then
            local open = ReadLocalPanels()
            SurvivorUI.SetRestInventoryVisible(open)
            SurvivorLootUI.SetInventoryVisible(open, revision)
            if open ~= lastSentOpen then
                sentSequence = sentSequence + 1
                if BlzSendSyncData(prefix, generation .. ":" .. sentSequence .. ":" .. (open and "1" or "0")) then
                    lastSentOpen = open
                end
            end
        end
    end
    function SurvivorInventoryPause.Init()
        assert(timer == nil and syncTrigger == nil, "Clean inventory observer before initialization")
        generation = generation + 1
        local runGeneration = generation
        activeGeneration = runGeneration
        SurvivorLootUI.Init()
        SurvivorLootUI.Reset()
        sentSequence, receivedSequence, lastSentOpen, frames = 0, 0, false, {}
        syncTrigger = CreateTrigger()
        BlzTriggerRegisterPlayerSyncEvent(syncTrigger, Player(SurvivorConfig.playerId), prefix, false)
        TriggerAddAction(syncTrigger, function()
            if activeGeneration ~= runGeneration then return end
            if GetTriggerPlayer() ~= Player(SurvivorConfig.playerId) then return end
            local state = RunSession.GetState()
            if state == "READY" or state == "FINISHED" then return end
            local data = BlzGetTriggerSyncData()
            if type(data) ~= "string" then return end
            local run, sequence, value = data:match("^(%d+):(%d+):([01])$")
            run, sequence = tonumber(run), tonumber(sequence)
            if run ~= runGeneration or not sequence or sequence <= receivedSequence then return end
            receivedSequence = sequence
            local ok, message = pcall(function()
                -- Apply any last native gear transaction before resuming attacks.
                SurvivorEquipment.Reconcile()
                RunSession.SetInventoryOpen(value == "1")
                -- Interrupt on the synchronized open event even if the bag closes
                -- again before the preparation countdown's next timer tick.
                if value == "1" and SurvivorUI.InterruptCombatPreparation then
                    SurvivorUI.InterruptCombatPreparation()
                end
                SurvivorNativeLoadout.Refresh()
            end)
            if not ok then RunSession.Fail(message) end
        end)
        timer = CreateTimer()
        local runTimer = timer
        TimerStart(runTimer, 0.05, true, function()
            if activeGeneration ~= runGeneration or timer ~= runTimer then return end
            local ok, message = pcall(Tick)
            if not ok then RunSession.Fail(message) end
        end)
    end
    function SurvivorInventoryPause.DebugStatus()
        if GetLocalPlayer() ~= Player(SurvivorConfig.playerId) then return end
        local open, found = ReadLocalPanels()
        print(string.format("[HeroSurvivor inventory] native panels=%d / visible=%s / state=%s",
            found, tostring(open), RunSession.GetState()))
    end
    function SurvivorInventoryPause.Cleanup()
        activeGeneration = nil -- Reject callbacks already queued before native teardown.
        if GetLocalPlayer() == Player(SurvivorConfig.playerId) then SurvivorUI.SetRestInventoryVisible(false) end
        SurvivorLootUI.Reset()
        if timer ~= nil then PauseTimer(timer); DestroyTimer(timer); timer = nil end
        if syncTrigger ~= nil then DestroyTrigger(syncTrigger); syncTrigger = nil end
        frames, lastSentOpen = {}, false
    end
end
