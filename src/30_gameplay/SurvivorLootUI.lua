-- Small solo loot controls; native inventory remains responsible for equipment.
SurvivorLootUI = {}
do
    local root, modeButton, manageButton, panel, status, confirm, cancel, previous, following
    local pendingNotice, lastPending
    local rows, triggers = {}, {}
    local familyIndex, familyButton = 1, nil
    local page, expanded, inventoryOpen, preview = 1, false, false, nil
    local nativeDetailsVisible = false
    local rendered, lastRevision, bagList, bagCount, bagCapacity = {}, nil, {}, 0, 0
    local expeditionView
    function SurvivorLootUI.IsExpanded() return expanded end
    local function ValidFrame(frame)
        return frame ~= nil and frame ~= 0 and GetHandleId(frame) ~= 0
    end
    local function Set(frame, property, value)
        local cached = rendered[frame]
        if not cached then cached = {}; rendered[frame] = cached end
        if cached[property] == value then return end
        if property == "text" then BlzFrameSetText(frame, value)
        elseif property == "visible" then BlzFrameSetVisible(frame, value)
        else BlzFrameSetEnable(frame, value) end
        cached[property] = value
    end
    local function Text(parent, name, width, height, x, y)
        local frame = BlzCreateFrameByType("TEXT", name, parent, "", 0)
        BlzFrameSetSize(frame, width, height)
        BlzFrameSetPoint(frame, FRAMEPOINT_TOPLEFT, parent, FRAMEPOINT_TOPLEFT, x, y)
        BlzFrameSetTextAlignment(frame, TEXT_JUSTIFY_MIDDLE, TEXT_JUSTIFY_CENTER)
        BlzFrameSetEnable(frame, false)
        return frame
    end
    local function ModalVisible()
        return nativeDetailsVisible or SurvivorUI.IsNarrativeVisible()
            or (SurvivorUI.IsChoiceVisible and SurvivorUI.IsChoiceVisible())
    end
    local function Button(parent, context, width, x, y, text, action)
        local frame = BlzCreateFrame("ScriptDialogButton", parent, 0, context)
        BlzFrameSetSize(frame, width, 0.026)
        BlzFrameSetPoint(frame, FRAMEPOINT_TOPLEFT, parent, FRAMEPOINT_TOPLEFT, x, y)
        BlzFrameSetText(frame, text)
        local trigger = CreateTrigger()
        triggers[#triggers + 1] = trigger -- Map lifetime: Init runs only once.
        BlzTriggerRegisterFrameEvent(trigger, frame, FRAMEEVENT_CONTROL_CLICK)
        TriggerAddAction(trigger, function()
            if GetTriggerPlayer() ~= Player(SurvivorConfig.playerId) then return end
            BlzFrameSetEnable(frame, false); BlzFrameSetEnable(frame, true)
            if rendered[frame] then rendered[frame].enabled = nil end
            local state = RunSession.GetState()
            if ModalVisible() then return end
            if state ~= "RUNNING" and state ~= "INVENTORY" and state ~= "STAGE_CLEAR" then return end
            local ok, message = pcall(action)
            if not ok then RunSession.Fail(message) end
            SurvivorLootUI.Refresh()
        end)
        return frame
    end
    local function CanManage()
        local state = RunSession.GetState()
        return not ModalVisible() and inventoryOpen and (state == "INVENTORY" or state == "STAGE_CLEAR")
    end
    function SurvivorLootUI.Init()
        if root then return end
        local parent = BlzGetFrameByName("ConsoleUIBackdrop", 0)
        if not ValidFrame(parent) then parent = BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0) end
        assert(ValidFrame(parent), "Missing game UI parent for loot controls")
        -- Do not leave a transparent input region when the manage button is hidden.
        root = BlzCreateFrameByType("BACKDROP", "HSLootRoot", parent, "", 0)
        BlzFrameSetTexture(root, "HeroSurvivorUI\\Transparent.tga", 0, true)
        BlzFrameSetSize(root, 0.28, 0.026)
        BlzFrameSetAbsPoint(root, FRAMEPOINT_TOPLEFT, 0.02, 0.55)
        BlzFrameSetLevel(root, 12)
        pendingNotice = Text(root, "HSPendingRewards", 0.28, 0.025, 0, 0.026)
        BlzFrameSetScale(pendingNotice, 0.85)
        BlzFrameSetVisible(pendingNotice, false)
        modeButton = Button(root, 810, 0.14, 0, 0, "줍기: 전체", function() SurvivorEquipment.CyclePickup(); preview = nil end)
        manageButton = Button(root, 811, 0.14, 0.14, 0, "가방 정리", function()
            if CanManage() then expanded, preview = not expanded, nil end
        end)
        panel = BlzCreateFrame("QuestButtonBaseTemplate", root, 0, 812)
        BlzFrameClearAllPoints(panel)
        BlzFrameSetSize(panel, 0.28, 0.322)
        BlzFrameSetPoint(panel, FRAMEPOINT_TOPLEFT, root, FRAMEPOINT_BOTTOMLEFT, 0, -0.003)
        local label = Text(panel, "HSLootHelp", 0.258, 0.04, 0.011, -0.008)
        BlzFrameSetText(label, "가방 장비 클릭: 보관 잠금 / 해제\n장착·잠금 장비는 삭제되지 않습니다.")
        BlzFrameSetScale(label, 0.85)
        for i = 1, 6 do
            local row = {}
            rows[i] = row
            row.frame = Button(panel, 820 + i, 0.252, 0.014, -0.05 - (i - 1) * 0.025, "", function()
                if CanManage() and expanded and row.item then
                    SurvivorEquipment.ToggleLock(row.item); preview = nil
                end
            end)
        end
        previous = Button(panel, 840, 0.055, 0.014, -0.203, "이전", function()
            if CanManage() then page, preview = math.max(1, page - 1), nil end
        end)
        following = Button(panel, 841, 0.055, 0.211, -0.203, "다음", function()
            if CanManage() then page, preview = page + 1, nil end
        end)
        status = Text(panel, "HSLootStatus", 0.14, 0.025, 0.07, -0.203)
        Button(panel, 842, 0.126, 0.014, -0.230, "일반 정리", function()
            if CanManage() and expanded then preview = SurvivorEquipment.PreviewCleanup("common") end
        end)
        Button(panel, 843, 0.126, 0.14, -0.230, "중복 정리", function()
            if CanManage() and expanded then preview = SurvivorEquipment.PreviewCleanup("duplicate") end
        end)
        familyButton = Button(panel, 846, 0.126, 0.014, -0.258, "보존: 화염", function()
            if CanManage() and expanded then
                familyIndex = familyIndex % #SurvivorEquipment.CleanupFamilies() + 1
                preview = nil
            end
        end)
        Button(panel, 847, 0.126, 0.14, -0.258, "나머지 정리", function()
            if CanManage() and expanded then
                preview = SurvivorEquipment.PreviewCleanup("family", SurvivorEquipment.CleanupFamilies()[familyIndex])
            end
        end)
        confirm = Button(panel, 844, 0.18, 0.014, -0.286, "", function()
            if CanManage() and expanded and preview then SurvivorEquipment.ConfirmCleanup(preview); preview = nil end
        end)
        cancel = Button(panel, 845, 0.07, 0.196, -0.286, "취소", function() preview = nil end)
        SurvivorLootUI.Reset()
    end
    function SurvivorLootUI.Refresh(observedRevision)
        if not root then return end
        local state = RunSession.GetState()
        local active = not ModalVisible() and (state == "RUNNING" or state == "INVENTORY" or state == "STAGE_CLEAR")
        local manage = CanManage()
        local view = tostring(active) .. ":" .. tostring(manage) .. ":" .. tostring(expanded) .. ":" .. tostring(inventoryOpen)
        if expeditionView ~= view then
            expeditionView = view
            SurvivorUI.UpdateExpedition()
        end
        Set(root, "visible", active)
        Set(manageButton, "visible", manage)
        Set(panel, "visible", manage and expanded)
        if not active then return end
        -- UIRevision still observes native bag transactions, even without item events.
        local revision = observedRevision
        if revision == nil and SurvivorEquipment.UIRevision then revision = SurvivorEquipment.UIRevision() end
        local changed = revision == nil or revision ~= lastRevision
        local pending = changed and SurvivorEquipment.PendingRewardCount() or lastPending or 0
        Set(pendingNotice, "visible", pending > 0)
        if lastPending ~= pending then
            lastPending = pending
            Set(pendingNotice, "text", string.format("|cffffcc00미수령 보상 %d개 · 자동 소멸 없음|r", pending))
        end
        Set(modeButton, "text", "줍기: " .. SurvivorEquipment.PickupMode())
        if changed then
            bagList = nil
            lastRevision = revision
        end
        if not manage or not expanded then return end
        Set(familyButton, "text", "보존: " .. SurvivorEquipment.CleanupFamilies()[familyIndex])
        if not bagList then
            bagList, bagCount, bagCapacity = SurvivorEquipment.BagEntries()
            -- Preserve compatibility with other providers that return only the list.
            if bagCount == nil then bagCount, bagCapacity = SurvivorEquipment.BagCount() end
        end
        local list = bagList
        local pages = math.max(1, math.ceil(#list / 6))
        page = math.min(page, pages)
        Set(status, "text", string.format("%d/%d쪽 · %d/%d칸", page, pages, bagCount, bagCapacity))
        Set(previous, "enabled", page > 1)
        Set(following, "enabled", page < pages)
        for i, row in ipairs(rows) do
            local entry = list[(page - 1) * 6 + i]
            row.item = entry and entry.item or nil
            Set(row.frame, "visible", entry ~= nil)
            if entry then Set(row.frame, "text", (entry.locked and "[잠금] " or "[보관] ") .. SurvivorEquipment.Name(entry.id)) end
        end
        Set(confirm, "visible", preview ~= nil)
        Set(cancel, "visible", preview ~= nil)
        if preview then
            Set(confirm, "text", string.format("%s %d개 삭제", preview.kind == "family" and (preview.keepFamily .. " 외") or preview.kind == "common" and "일반" or "중복", #preview.items))
            Set(confirm, "enabled", #preview.items > 0)
        end
    end
    function SurvivorLootUI.SetInventoryVisible(open, observedRevision, detailsOpen)
        inventoryOpen = open
        nativeDetailsVisible = detailsOpen == true
        if not open then expanded, preview = false, nil end
        SurvivorLootUI.Refresh(observedRevision)
    end
    function SurvivorLootUI.Reset()
        page, expanded, inventoryOpen, preview = 1, false, false, nil
        nativeDetailsVisible = false
        familyIndex = 1
        lastPending = nil
        rendered, lastRevision, bagList, expeditionView = {}, nil, nil, nil
        for _, row in ipairs(rows) do row.item = nil end
        if root then Set(root, "visible", false) end
    end
end
