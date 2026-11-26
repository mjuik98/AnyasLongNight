-- Story presentation and the combat preparation step: full-screen narrative cards,
-- paged conversations with their reveal/return fades, the stage introduction, and the
-- "수색 시작" panel with its 3-second countdown. Everything here pauses combat by being
-- visible (SurvivorUI.IsNarrativeVisible). SurvivorUI binds its frame helpers at load
-- and exposes these functions under its own names.
SurvivorNarrativeUI = {}
do
    local NativeHUD, Speech = SurvivorNativeHUD, SurvivorSpeech
    local SetVisible, SetText, Text, FramedPanel, Bind, ReleaseFocus, StopTimer
    local DisplayDamageBoard, InventoryVisible, HideCombatOverlays
    function SurvivorNarrativeUI.Bind(ui)
        SetVisible, SetText, Text, FramedPanel = ui.SetVisible, ui.SetText, ui.Text, ui.FramedPanel
        Bind, ReleaseFocus, StopTimer = ui.Bind, ui.ReleaseFocus, ui.StopTimer
        DisplayDamageBoard, InventoryVisible, HideCombatOverlays = ui.DisplayDamageBoard, ui.InventoryVisible, ui.HideCombatOverlays
    end
    local conversation, conversationIndex, conversationAction, conversationTitle, sceneSkip, conversationClose
    local conversationFinishLabel
    local preparationRoot, preparationButton, preparationTitle, preparationMission
    local preparationHint, preparationFooter, preparationCountdown
    local preparationReady, preparationCheck, preparationTimer
    local preparationGeneration = 0
    local introRoot, introTitle, introText, introContent, introSkip, introReady, caption, introFooter, storyPosition
    local revealTimer, revealGeneration = nil, 0
    local returnShade, returnTimer, returnGeneration = nil, nil, 0
    local function CancelReturnReveal()
        returnGeneration = returnGeneration + 1
        local timer = returnTimer
        returnTimer = nil
        if returnShade then BlzFrameSetVisible(returnShade, false) end
        StopTimer(timer)
    end
    local function DialogueAmbience(enabled)
        if SurvivorStage and SurvivorStage.SetDialogueAmbience then
            pcall(SurvivorStage.SetDialogueAmbience, enabled, "ui")
        end
    end
    local function CancelReveal()
        revealGeneration = revealGeneration + 1
        local timer = revealTimer
        revealTimer = nil
        StopTimer(timer)
    end
    local function CancelPreparationCountdown()
        preparationGeneration = preparationGeneration + 1
        local timer = preparationTimer
        preparationTimer = nil
        StopTimer(timer)
    end
    local function RenderPreparationVisibility()
        local waiting = preparationReady ~= nil and preparationTimer == nil
        if waiting and preparationFooter and SurvivorNativeLoadout and SurvivorNativeLoadout.TalentStatus then
            local available, _, pending = SurvivorNativeLoadout.TalentStatus()
            SetText(preparationFooter, pending > 0 and "|cffffcc00특성 포인트 전달 대기 · 가방 확인|r"
                or available > 0 and ("|cffffcc00특성 " .. available .. "포인트 · 장비·특성에서 선택|r") or "")
        end
        if preparationRoot then SetVisible(preparationRoot, waiting and not InventoryVisible()) end
        if preparationButton then SetVisible(preparationButton, waiting and not InventoryVisible()) end
        if preparationCountdown then
            SetVisible(preparationCountdown, preparationTimer ~= nil and not InventoryVisible())
        end
    end
    local function StopPreparation()
        preparationReady, preparationCheck = nil, nil
        local ok, message = pcall(CancelPreparationCountdown)
        RenderPreparationVisibility()
        if not ok then error(message) end
    end
    local function StopIntro()
        local close = conversationClose
        conversationClose = nil -- Consume cleanup before native calls or reentrant close requests.
        conversation, conversationIndex, conversationAction, conversationFinishLabel = nil, nil, nil, nil
        introReady = nil
        local failures = {}
        local function Attempt(action, ...)
            local ok, message = pcall(action, ...)
            if not ok then failures[#failures + 1] = tostring(message) end
        end
        Attempt(CancelReveal)
        Attempt(CancelReturnReveal)
        Attempt(StopPreparation)
        -- Return selection to the gameplay hero while the native HUD is still hidden.
        -- A portrait proxy must not be selected when the gameplay containers reopen.
        if close then Attempt(close) end
        for _, frame in pairs({introRoot, introContent, introSkip, caption, sceneSkip, introFooter, storyPosition}) do
            Attempt(BlzFrameSetVisible, frame, false)
        end
        Attempt(NativeHUD.Restore)
        DialogueAmbience(false)
        if #failures > 0 then error(table.concat(failures, "\n")) end
    end
    local function NarrativeFailure(message)
        local ok, failure = pcall(StopIntro)
        if not ok then message = tostring(message) .. "\nUI cleanup: " .. tostring(failure) end
        error(message)
    end
    local function RevealScene()
        CancelReveal()
        BlzFrameSetAlpha(introRoot, 255)
        BlzFrameSetVisible(introRoot, true)
        local timer, generation, step = CreateTimer(), revealGeneration, 0
        revealTimer = timer
        TimerStart(timer, 0.03, true, function()
            if generation ~= revealGeneration or not conversation or not introReady then return end
            local ok, message = pcall(function()
                step = step + 1
                BlzFrameSetAlpha(introRoot, math.max(0, math.floor(255 * (1 - step / 15))))
                if step >= 15 then CancelReveal(); BlzFrameSetVisible(introRoot, false) end
            end)
            if not ok then
                local cleaned, failure = pcall(StopIntro)
                if not cleaned then message = tostring(message) .. "\nUI cleanup: " .. tostring(failure) end
                RunSession.Fail(message)
            end
        end)
        -- This synchronized 0.45-second timer only reveals the scene; it never advances a page.
    end
    local function RevealGameplay()
        CancelReturnReveal()
        BlzFrameSetAlpha(returnShade, 255)
        BlzFrameSetVisible(returnShade, true)
        local timer, generation, step = CreateTimer(), returnGeneration, 0
        returnTimer = timer
        TimerStart(timer, 0.02, true, function()
            if generation ~= returnGeneration then return end
            local ok, message = pcall(function()
                step = step + 1
                local progress = math.min(1, step / 30)
                local eased = progress * progress * (3 - 2 * progress)
                BlzFrameSetAlpha(returnShade, math.floor(255 * (1 - eased)))
                if step >= 30 then CancelReturnReveal() end
            end)
            if not ok then
                local cleaned, failure = pcall(StopIntro)
                if not cleaned then message = tostring(message) .. "\nUI cleanup: " .. tostring(failure) end
                RunSession.Fail(message)
            end
        end)
    end
    local function CompleteIntro()
        local callback = introReady
        local returning = conversation ~= nil
        StopIntro() -- Consume before callbacks, including a second click in the same tick.
        DisplayDamageBoard(true)
        if callback then callback() end
        if SurvivorLootUI then SurvivorLootUI.Refresh() end
        -- Cleanup, camera restoration and the next panel happen in this same tick,
        -- beneath an opaque cover. Reveal the restored view without delaying gameplay callbacks.
        if returning and not introReady then RevealGameplay() end
    end
    function SurvivorNarrativeUI.IsNarrativeVisible() return introReady ~= nil or preparationReady ~= nil end
    function SurvivorNarrativeUI.IsCombatPreparationVisible() return preparationReady ~= nil end
    function SurvivorNarrativeUI.InterruptCombatPreparation()
        if not preparationReady or not preparationTimer then return false end
        CancelPreparationCountdown()
        SetText(preparationFooter, "|cffffcc00준비 중단 · 가방을 닫아 주세요.|r\n그다음 ‘수색 시작’을 다시 눌러 주세요.")
        RenderPreparationVisibility()
        return true
    end
    function SurvivorNarrativeUI.BeginPreparedCombat()
        if not preparationReady or preparationTimer then return false end
        if preparationCheck and not preparationCheck() then
            SetText(preparationFooter, "|cffffcc00가방을 먼저 닫아 주세요.|r\n수색 시작 전까지 시간은 멈춥니다.")
            return false
        end
        local timer, generation, remaining = CreateTimer(), preparationGeneration, 3
        preparationTimer = timer
        SetText(preparationCountdown, "|cffffcc00수색 시작까지\n3|r")
        RenderPreparationVisibility()
        TimerStart(timer, 1, true, function()
            if preparationGeneration ~= generation or not preparationReady then return end
            local ok, message = pcall(function()
                if preparationCheck and not preparationCheck() then
                    SurvivorUI.InterruptCombatPreparation()
                    return
                end
                remaining = remaining - 1
                if remaining > 0 then
                    SetText(preparationCountdown, "|cffffcc00수색 시작까지\n" .. remaining .. "|r")
                else
                    local callback, check = preparationReady, preparationCheck
                    StopPreparation() -- Consume the callback before gameplay or a replacement screen.
                    DisplayDamageBoard(true)
                    if callback() == false and preparationReady == nil
                        and RunSession.GetState() == "STAGE_CLEAR" and not RunSession.IsPending() then
                        -- A refused start keeps the live panel; the player clicks again.
                        preparationReady, preparationCheck = callback, check
                        DisplayDamageBoard(false)
                        RenderPreparationVisibility()
                        SetText(preparationFooter, "|cffffcc00수색을 시작하지 못했습니다.|r\n‘수색 시작’을 다시 눌러 주세요.")
                        return
                    end
                    if SurvivorLootUI then SurvivorLootUI.Refresh() end
                end
            end)
            if not ok then RunSession.Fail(message) end
        end)
        return true
    end
    local function RenderConversation()
        local page = conversation[conversationIndex]
        local accent = page.speaker == "안야" and "|cff9bdbc0" or page.speaker == "퓨트리스" and "|cffc4b2df" or "|cffffcc00"
        BlzFrameSetText(introTitle, accent .. page.speaker .. "|r")
        BlzFrameSetText(storyPosition, string.format("|cffb2b2b2%s · %d/%d|r", conversationTitle, conversationIndex, #conversation))
        BlzFrameSetText(introText, page.text)
        BlzFrameSetText(introSkip, conversationIndex == #conversation and (conversationFinishLabel or "계속") or "다음 대사")
        if conversationAction then conversationAction(conversationIndex) end
        NativeHUD.Apply("conversation") -- Selection can make the command/inventory containers visible again.
    end
    function SurvivorNarrativeUI.AdvanceNarrative()
        if not introReady then return end
        local ok, message = pcall(function()
            if conversation and conversationIndex < #conversation then
                conversationIndex = conversationIndex + 1
                RenderConversation()
            else CompleteIntro() end
        end)
        if not ok then NarrativeFailure(message) end
    end
    function SurvivorNarrativeUI.SkipConversation()
        if conversation and introReady then CompleteIntro() end
    end
    -- Story scenes, the return shade and the combat preparation panel and countdown.
    function SurvivorNarrativeUI.Build(parent)
        introRoot = BlzCreateFrameByType("BACKDROP", "AnyasLongNightStageIntro", parent, "", 0)
        BlzFrameSetAbsPoint(introRoot, FRAMEPOINT_CENTER, 0.4, 0.3)
        BlzFrameSetSize(introRoot, 2.4, 0.6)
        BlzFrameSetTexture(introRoot, "AnyasLongNightUI\\Black.tga", 0, true)
        BlzFrameSetLevel(introRoot, 20)
        BlzFrameSetEnable(introRoot, false)
        returnShade = BlzCreateFrameByType("BACKDROP", "HSStoryReturnShade", parent, "", 0)
        BlzFrameSetAbsPoint(returnShade, FRAMEPOINT_CENTER, 0.4, 0.3)
        BlzFrameSetSize(returnShade, 2.4, 0.6)
        BlzFrameSetTexture(returnShade, "AnyasLongNightUI\\Black.tga", 0, true)
        BlzFrameSetLevel(returnShade, 30)
        BlzFrameSetEnable(returnShade, false)
        BlzFrameSetVisible(returnShade, false)
        -- Text/buttons are siblings: fading the backdrop must not fade the dialogue.
        introContent = BlzCreateFrameByType("BACKDROP", "AnyasLongNightStoryContent", parent, "", 0)
        BlzFrameSetTexture(introContent, "AnyasLongNightUI\\Transparent.tga", 0, true)
        BlzFrameSetAbsPoint(introContent, FRAMEPOINT_CENTER, 0.4, 0.3)
        BlzFrameSetSize(introContent, 0.8, 0.6)
        BlzFrameSetLevel(introContent, 22)
        caption = FramedPanel(parent, "AnyasLongNightCaption", 712, 0.54, 0.166)
        BlzFrameSetAbsPoint(caption, FRAMEPOINT_CENTER, 0.4, 0.30)
        BlzFrameSetLevel(caption, 21)
        BlzFrameSetEnable(caption, false)
        introTitle = Text(introContent, "AnyasLongNightStageTitle", 0.7, 0.05, 0, -0.11)
        introText = Text(introContent, "AnyasLongNightStageText", 0.7, 0.13, 0, -0.18)
        introFooter = Text(introContent, "HSStoryFooter", 0.70, 0.040, 0, -0.49)
        storyPosition = Text(introContent, "HSStoryPosition", 0.230, 0.019, 0, -0.11)
        introSkip = BlzCreateFrame("ScriptDialogButton", parent, 0, 700)
        BlzFrameSetAbsPoint(introSkip, FRAMEPOINT_CENTER, 0.4, 0.22)
        BlzFrameSetSize(introSkip, 0.15, 0.03)
        BlzFrameSetLevel(introSkip, 23)
        BlzFrameSetText(introSkip, "계속")
        Bind(introSkip, FRAMEEVENT_CONTROL_CLICK, function()
            if not introReady then return end
            ReleaseFocus(introSkip)
            SurvivorUI.AdvanceNarrative()
        end)
        sceneSkip = BlzCreateFrame("ScriptDialogButton", parent, 0, 701)
        BlzFrameSetAbsPoint(sceneSkip, FRAMEPOINT_CENTER, 0.51, 0.205)
        BlzFrameSetSize(sceneSkip, 0.17, 0.028)
        BlzFrameSetLevel(sceneSkip, 23)
        BlzFrameSetText(sceneSkip, "장면 건너뛰기")
        Bind(sceneSkip, FRAMEEVENT_CONTROL_CLICK, function()
            ReleaseFocus(sceneSkip)
            SurvivorUI.SkipConversation()
        end)
        -- A distinct action frame prevents a queued narrative click from starting combat.
        preparationRoot = FramedPanel(parent, "HSCombatPreparation", 714, 0.35, 0.235)
        BlzFrameSetAbsPoint(preparationRoot, FRAMEPOINT_CENTER, 0.4, 0.34)
        BlzFrameSetLevel(preparationRoot, 24)
        -- Only what the player has not just seen: goal, one zone tip and inventory warnings.
        preparationTitle = Text(preparationRoot, "HSCombatPreparationTitle", 0.31, 0.020, 0, -0.016)
        preparationMission = Text(preparationRoot, "HSCombatPreparationMission", 0.31, 0.046, 0, -0.048)
        preparationHint = Text(preparationRoot, "HSCombatPreparationHint", 0.31, 0.060, 0, -0.100)
        preparationFooter = Text(preparationRoot, "HSCombatPreparationFooter", 0.31, 0.022, 0, -0.165)
        for _, frame in ipairs({preparationTitle, preparationMission, preparationHint, preparationFooter}) do
            BlzFrameSetLevel(frame, 3)
            BlzFrameSetTextAlignment(frame, TEXT_JUSTIFY_TOP, TEXT_JUSTIFY_LEFT)
        end
        preparationButton = BlzCreateFrameByType("GLUETEXTBUTTON", "HSCombatPreparationStart", parent, "ScriptDialogButton", 0)
        BlzFrameSetPoint(preparationButton, FRAMEPOINT_TOP, preparationRoot, FRAMEPOINT_TOP, 0, -0.191)
        BlzFrameSetSize(preparationButton, 0.24, 0.034)
        BlzFrameSetLevel(preparationButton, 26)
        BlzFrameSetText(preparationButton, "수색 시작")
        Bind(preparationButton, FRAMEEVENT_CONTROL_CLICK, function()
            ReleaseFocus(preparationButton)
            SurvivorUI.BeginPreparedCombat()
        end)
        preparationCountdown = Text(parent, "HSCombatCountdown", 0.30, 0.076, 0, 0)
        BlzFrameClearAllPoints(preparationCountdown)
        BlzFrameSetAbsPoint(preparationCountdown, FRAMEPOINT_CENTER, 0.4, 0.49)
        BlzFrameSetScale(preparationCountdown, 1.5)
        BlzFrameSetLevel(preparationCountdown, 26)
    end
    local function PrepareNarrative(title, text, onReady, footer, buttonLabel)
        SurvivorUI.SetTimeStopFilter(false, true)
        SurvivorUI.HidePanel()
        SurvivorUI.ClearSpeech()
        DisplayDamageBoard(false)
        HideCombatOverlays()
        -- Native timed messages can render above the cinematic caption.
        if SurvivorConfig.IsLocalPlayer() then ClearTextMessages() end
        introReady = onReady
        DialogueAmbience(true)
        NativeHUD.Apply("intro")
        BlzFrameSetText(introTitle, "|cffffcc00" .. title .. "|r")
        BlzFrameClearAllPoints(introTitle)
        BlzFrameSetSize(introTitle, 0.70, 0.054)
        BlzFrameSetTextAlignment(introTitle, TEXT_JUSTIFY_MIDDLE, TEXT_JUSTIFY_CENTER)
        BlzFrameSetPoint(introTitle, FRAMEPOINT_TOP, introContent, FRAMEPOINT_TOP, 0, -0.12)
        BlzFrameClearAllPoints(introSkip)
        BlzFrameSetAbsPoint(introSkip, FRAMEPOINT_CENTER, 0.4, 0.232)
        BlzFrameSetSize(introSkip, 0.15, 0.032)
        BlzFrameSetText(introText, text)
        BlzFrameSetScale(introText, 1.0)
        BlzFrameSetTextAlignment(introText, TEXT_JUSTIFY_MIDDLE, TEXT_JUSTIFY_CENTER)
        BlzFrameClearAllPoints(introText)
        BlzFrameSetSize(introText, 0.64, 0.12)
        BlzFrameSetPoint(introText, FRAMEPOINT_TOP, introContent, FRAMEPOINT_TOP, 0, -0.206)
        BlzFrameClearAllPoints(introFooter)
        BlzFrameSetSize(introFooter, 0.70, 0.040)
        BlzFrameSetPoint(introFooter, FRAMEPOINT_TOP, introContent, FRAMEPOINT_TOP, 0, -0.487)
        BlzFrameSetText(introFooter, "|cff969696" .. (footer or "") .. "|r")
        BlzFrameSetVisible(introFooter, footer ~= nil and footer ~= "")
        BlzFrameSetVisible(storyPosition, false)
        BlzFrameSetVisible(caption, false)
        BlzFrameSetAlpha(introRoot, 255)
        BlzFrameSetVisible(introRoot, true)
        BlzFrameSetVisible(introContent, true)
        BlzFrameSetVisible(introSkip, true)
        BlzFrameSetText(introSkip, buttonLabel or "계속")
        if SurvivorLootUI then SurvivorLootUI.Refresh() end
    end
    function SurvivorNarrativeUI.ShowNarrative(title, text, onReady, footer, buttonLabel)
        local ok, message = pcall(PrepareNarrative, title, text, onReady, footer, buttonLabel)
        if not ok then NarrativeFailure(message) end
    end
    function SurvivorNarrativeUI.ShowConversation(title, pages, onReady, onPage, onClose, finishLabel)
        assert(#pages > 0, "Conversation needs a page")
        local ok, message = pcall(function()
            SurvivorUI.ShowNarrative(title, "", onReady)
            conversationClose = onClose
            conversationFinishLabel = finishLabel
            conversation, conversationIndex, conversationAction, conversationTitle = pages, 1, onPage, title
            BlzFrameSetAbsPoint(caption, FRAMEPOINT_CENTER, 0.4, 0.255)
            BlzFrameSetSize(caption, 0.54, 0.166)
            BlzFrameSetVisible(caption, true)
            BlzFrameClearAllPoints(introTitle)
            BlzFrameSetSize(introTitle, 0.230, 0.019)
            BlzFrameSetTextAlignment(introTitle, TEXT_JUSTIFY_MIDDLE, TEXT_JUSTIFY_LEFT)
            BlzFrameSetPoint(introTitle, FRAMEPOINT_TOP, caption, FRAMEPOINT_TOP, -0.126, -0.019)
            BlzFrameClearAllPoints(storyPosition)
            BlzFrameSetSize(storyPosition, 0.230, 0.019)
            BlzFrameSetPoint(storyPosition, FRAMEPOINT_TOP, caption, FRAMEPOINT_TOP, 0.126, -0.019)
            BlzFrameSetVisible(storyPosition, true)
            BlzFrameClearAllPoints(introText)
            -- Keep frame scale at 1: scaled offsets against the screen-sized root
            -- displaced the body below its background in the reported game capture.
            BlzFrameSetSize(introText, 0.492, 0.062)
            BlzFrameSetTextAlignment(introText, TEXT_JUSTIFY_TOP, TEXT_JUSTIFY_LEFT)
            BlzFrameSetPoint(introText, FRAMEPOINT_TOP, caption, FRAMEPOINT_TOP, 0, -0.045)
            BlzFrameClearAllPoints(introFooter)
            BlzFrameSetSize(introFooter, 0.492, 0.014)
            BlzFrameSetPoint(introFooter, FRAMEPOINT_TOP, caption, FRAMEPOINT_TOP, 0, -0.108)
            BlzFrameSetText(introFooter, "|cff969696대사는 직접 넘깁니다 · F10 메뉴|r")
            BlzFrameSetVisible(introFooter, true)
            BlzFrameClearAllPoints(introSkip)
            BlzFrameSetSize(introSkip, 0.16, 0.030)
            BlzFrameSetPoint(introSkip, FRAMEPOINT_TOP, caption, FRAMEPOINT_TOP, -0.105, -0.128)
            BlzFrameClearAllPoints(sceneSkip)
            BlzFrameSetSize(sceneSkip, 0.18, 0.030)
            BlzFrameSetPoint(sceneSkip, FRAMEPOINT_TOP, caption, FRAMEPOINT_TOP, 0.105, -0.128)
            BlzFrameSetVisible(sceneSkip, true)
            RenderConversation()
            RevealScene()
        end)
        if not ok then NarrativeFailure(message) end
    end
    function SurvivorNarrativeUI.ShowStageIntro(index, onReady, hero)
        SurvivorStory.SetStage(index)
        -- Later stages open on an arrival scene; its last button leads to the preparation panel,
        -- which already repeats the mission and hint the old text card showed.
        if index > 1 then return SurvivorStory.ShowArrival(index, hero, onReady) end
        SurvivorUI.ShowNarrative(string.format("%s\n%d / 5 · %s", SurvivorStory.title, index, SurvivorStage.Get(index).name),
            SurvivorStory.premise, function() SurvivorStory.ShowBriefing(hero, onReady) end,
            "우클릭 이동 · 무기는 자동 공격 · F10 메뉴\n" .. SurvivorStory.notice, "장면 보기")
    end
    function SurvivorNarrativeUI.ShowCombatPreparation(index, onReady, canStart)
        SurvivorUI.SetTimeStopFilter(false, true)
        assert(type(onReady) == "function", "Combat preparation needs a start callback")
        SurvivorUI.HidePanel()
        SurvivorUI.ClearSpeech()
        DisplayDamageBoard(false)
        local theme = SurvivorStage.Get(index)
        preparationReady, preparationCheck = onReady, canStart
        -- Fit the actual chapter text instead of retaining a large blank footer.
        local mission = "|cff9bdbc0이번 목표|r\n" .. theme.mission
        local hint = "|cffffcc00구역 안내|r\n" .. theme.hint
        local missionHeight = math.max(0.032, Speech.WrappedLines(mission) * 0.0125 + 0.005)
        local hintHeight = math.max(0.044, Speech.WrappedLines(hint) * 0.0125 + 0.005)
        local hintTop = 0.048 + missionHeight + 0.006
        local footerTop = hintTop + hintHeight + 0.005
        local buttonTop = footerTop + 0.026 + 0.008
        BlzFrameSetSize(preparationRoot, 0.35, buttonTop + 0.034 + 0.012)
        BlzFrameSetSize(preparationMission, 0.31, missionHeight)
        BlzFrameSetSize(preparationHint, 0.31, hintHeight)
        BlzFrameClearAllPoints(preparationHint)
        BlzFrameSetPoint(preparationHint, FRAMEPOINT_TOP, preparationRoot, FRAMEPOINT_TOP, 0, -hintTop)
        BlzFrameClearAllPoints(preparationFooter)
        BlzFrameSetSize(preparationFooter, 0.31, 0.026)
        BlzFrameSetPoint(preparationFooter, FRAMEPOINT_TOP, preparationRoot, FRAMEPOINT_TOP, 0, -footerTop)
        BlzFrameClearAllPoints(preparationButton)
        BlzFrameSetPoint(preparationButton, FRAMEPOINT_TOP, preparationRoot, FRAMEPOINT_TOP, 0, -buttonTop)
        SetText(preparationTitle, string.format("|cffffcc00%d / %d · %s|r", index, SurvivorConfig.stages, theme.name))
        SetText(preparationMission, mission)
        SetText(preparationHint, hint)
        SetText(preparationFooter, "") -- Reserved for inventory warnings; the countdown explains the start.
        RenderPreparationVisibility()
        if SurvivorLootUI then SurvivorLootUI.Refresh() end
    end
    SurvivorNarrativeUI.Stop = StopIntro
    -- Redraw the preparation panel after the native inventory opened or closed.
    function SurvivorNarrativeUI.RefreshPreparation()
        if preparationReady then RenderPreparationVisibility() end
    end
end
