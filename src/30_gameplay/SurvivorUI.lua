-- Map-lifetime frames using stock Blizzard templates and background textures.
-- Screen effects (SurvivorScreenEffects), native HUD visibility (SurvivorNativeHUD),
-- the damage multiboard (SurvivorDamageBoard) and subtitles/notices (SurvivorSpeech)
-- live in their own modules.
SurvivorUI = {}
do
    local Board, NativeHUD, Speech = SurvivorDamageBoard, SurvivorNativeHUD, SurvivorSpeech
    local initialized, choosing = false, false
    local panel, shade, heading, note, restartButton, resultBackdrop
    local cards, triggers = {}, {}
    local chooseCallback, restartCallback, rerollCallback
    local parentName, resultHeading, resultNote, nextCallback
    local resultSummaryInfo, resultSummaryDamage, resultSummaryRest
    local restVisible = false
    local nativeInventoryVisible = false
    local rerollCounter, rerollPips = nil, {}
    local excludeCallback
    -- Injected by the run owner; the global lookup only serves isolated UI fixtures.
    local retryCallback, canRetryCallback
    local gearCallback
    local expeditionRoot, expeditionText
    local actionFeedback, actionTooltip, actionTooltipText = {}, nil, nil
    local ResetActionFeedback
    local essentialRoot, bossName, bossTrack, bossFill, riskAccept
    local wardText, wardTextCache, essentialLayout
    local bossSnapshot
    local retrySame, journalPrevious, journalNext, chapterPrevious, chapterNext, journalPosition
    local conversation, conversationIndex, conversationAction, conversationTitle, sceneSkip, conversationClose
    local conversationFinishLabel
    local preparationRoot, preparationButton, preparationTitle, preparationMission
    local preparationHint, preparationFooter, preparationCountdown
    local preparationReady, preparationCheck, preparationTimer
    local preparationGeneration = 0
    local speechTimer, speechTimerPaused
    local frameCache = {}
    -- Attempt both natives through the shared helper, then raise every failure.
    local function StopTimer(timer)
        local errors = {}
        RunSession.CancelTimer(errors, "UI timer", timer)
        if #errors > 0 then error(table.concat(errors, "\n"), 0) end
    end
    SurvivorUI.SetTimeStopFilter = SurvivorScreenEffects.SetTimeStopFilter
    SurvivorUI.HitFlash = SurvivorScreenEffects.HitFlash
    SurvivorUI.ResetScreenEffects = SurvivorScreenEffects.Reset
    SurvivorUI.Say, SurvivorUI.Notify, SurvivorUI.Alert = Speech.Say, Speech.Notify, Speech.Alert
    local function FrameState(frame)
        local state = frameCache[frame]
        if not state then state = {}; frameCache[frame] = state end
        return state
    end
    local function SetVisible(frame, visible)
        local state = FrameState(frame)
        if state.visible ~= visible then BlzFrameSetVisible(frame, visible); state.visible = visible end
    end
    local function SetText(frame, text)
        local state = FrameState(frame)
        if state.text ~= text then BlzFrameSetText(frame, text); state.text = text end
    end
    local function SetSize(frame, width, height)
        local state = FrameState(frame)
        if state.width ~= width or state.height ~= height then
            BlzFrameSetSize(frame, width, height); state.width, state.height = width, height
        end
    end
    local function SetAbsPoint(frame, point, x, y)
        local state = FrameState(frame)
        if state.point ~= point or state.x ~= x or state.y ~= y then
            BlzFrameClearAllPoints(frame)
            BlzFrameSetAbsPoint(frame, point, x, y); state.point, state.x, state.y = point, x, y
        end
    end
    function SurvivorUI.ClearSpeech()
        Board.RestoreMinimize()
        Speech.Clear()
        if expeditionRoot then SetVisible(expeditionRoot, false); SetVisible(expeditionText, false) end
    end
    function SurvivorUI.Cue(kind)
        -- Borrow initialized Blizzard GUI sounds; do not create per-hit sound handles.
        local sound = kind == "elite" and bj_questWarningSound or kind == "escape" and bj_questHintSound
            or kind == "evolution" and bj_questCompletedSound or kind == "clue" and bj_questItemAcquiredSound
        if sound then StartSound(sound) end
    end
    local journalPages, journalIndex, currentResultPage = {}, 1, 1
    local journalChapters, journalChapter = {}, 1
    local ValidNativeFrame = SurvivorConfig.ValidFrame
    -- The setup screen hides the whole console like an intro; it only lifts its own mode.
    function SurvivorUI.SetSetupCinematic(active)
        if active then SurvivorUI.SetTimeStopFilter(false, true) end
        if active then NativeHUD.Apply("setup")
        elseif NativeHUD.Mode() == "setup" then NativeHUD.Restore() end
    end
    function SurvivorUI.UpdateExpedition()
        if not expeditionText then return end
        local visible = RunSession.IsRunning() and not choosing and not restVisible
            and not nativeInventoryVisible and not SurvivorUI.IsNarrativeVisible()
            and not (SurvivorLootUI and SurvivorLootUI.IsExpanded())
            and (not Speech.IsSpeaking() or SurvivorExpedition.HasRiskNotice())
        local text = visible and SurvivorExpedition.Status(Speech.IsSpeaking()) or ""
        visible = visible and text ~= ""
        local top = Speech.BelowNotice()
        local cached = FrameState(expeditionText)
        if cached.wrapText ~= text then
            cached.wrapText = text
            cached.wrapHeight = math.min(0.128, math.max(0.041, Speech.WrappedLines(text) * 0.0125 + 0.006))
        end
        local height = cached.wrapHeight
        SetAbsPoint(expeditionRoot, FRAMEPOINT_TOPLEFT, 0.025, top)
        SetSize(expeditionRoot, 0.29, height + 0.028)
        SetSize(expeditionText, 0.254, height)
        SetVisible(expeditionRoot, visible)
        SetVisible(expeditionText, visible)
        if visible then SetText(expeditionText, text) end
        if riskAccept then
            SetAbsPoint(riskAccept, FRAMEPOINT_TOP, 0.072, top - height - 0.028 - 0.010)
            SetVisible(riskAccept, visible and not choosing and not SurvivorUI.IsNarrativeVisible()
                and SurvivorExpedition.RiskOffer() ~= nil)
        end
    end
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
        if preparationRoot then SetVisible(preparationRoot, waiting and not nativeInventoryVisible) end
        if preparationButton then SetVisible(preparationButton, waiting and not nativeInventoryVisible) end
        if preparationCountdown then
            SetVisible(preparationCountdown, preparationTimer ~= nil and not nativeInventoryVisible)
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
    local resultTabs, resultPages = {}, {}
    -- Leave room for the tall Reforged console decorations below the choice controls.
    local cardTop, cardHeight = -0.045, 0.29

    function SurvivorUI.ClearDamageBoard()
        Board.Clear()
        bossSnapshot = nil
        wardTextCache = nil
        essentialLayout = nil
        if essentialRoot then SetVisible(essentialRoot, false) end
    end
    local function CombatHUDVisible()
        return RunSession.IsRunning() and not nativeInventoryVisible and not choosing and not SurvivorUI.IsNarrativeVisible()
            and not (SurvivorLootUI and SurvivorLootUI.IsExpanded())
    end
    local function SpeechClockRunning()
        return RunSession.IsRunning() and not choosing and not SurvivorUI.IsNarrativeVisible()
    end
    -- The boss HUD and the multiboard show only with the combat HUD.
    local function DisplayDamageBoard(visible, quiet)
        local shown = visible and CombatHUDVisible()
        if essentialRoot and not shown then SetVisible(essentialRoot, false) end
        Board.Display(shown, quiet)
    end
    local function UpdateBossHUD(active)
        if not essentialRoot then return end
        bossSnapshot = SurvivorCombat.BossStatus()
        if not active then SetVisible(essentialRoot, false); return end
        local hasBoss = bossSnapshot ~= nil
        local ward, wardRemaining = SurvivorCombat.WardStatus()
        local hasWard = ward > 0 and wardRemaining > 0
        SetVisible(essentialRoot, hasBoss or hasWard)
        SetVisible(bossName, hasBoss)
        SetVisible(bossTrack, hasBoss)
        SetVisible(bossFill, hasBoss and bossSnapshot.current > 0)
        if hasBoss then
            local ratio = math.max(0, math.min(1, bossSnapshot.current / math.max(1, bossSnapshot.max)))
            SetText(bossName, string.format("%s · %.0f%% %s", bossSnapshot.name, ratio * 100,
                bossSnapshot.enraged and "|cffff8060광폭화|r" or ""))
            SetSize(bossFill, math.max(0.0001, 0.234 * ratio), 0.006)
        end
        local shield = hasWard and string.format("|cff70e6cc수색 보호막 %.0f · %d초|r", ward, math.ceil(wardRemaining)) or ""
        if wardTextCache ~= shield then BlzFrameSetText(wardText, shield); wardTextCache = shield end
        SetVisible(wardText, hasWard)
        local layout = (hasBoss and 2 or 0) + (hasWard and 1 or 0)
        if essentialLayout ~= layout then
            essentialLayout = layout
            local top = hasBoss and -0.041 or -0.009
            BlzFrameClearAllPoints(wardText)
            BlzFrameSetPoint(wardText, FRAMEPOINT_TOP, essentialRoot, FRAMEPOINT_TOP, 0, top)
            -- Reserve only the active boss/ward rows in the existing narrow HUD.
            SetSize(essentialRoot, 0.26, hasBoss and (hasWard and 0.064 or 0.042) or 0.032)
        end
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
    function SurvivorUI.IsNarrativeVisible() return introReady ~= nil or preparationReady ~= nil end
    function SurvivorUI.IsChoiceVisible() return choosing or gearCallback ~= nil end
    function SurvivorUI.IsCombatPreparationVisible() return preparationReady ~= nil end
    function SurvivorUI.InterruptCombatPreparation()
        if not preparationReady or not preparationTimer then return false end
        CancelPreparationCountdown()
        SetText(preparationFooter, "|cffffcc00준비 중단 · 가방을 닫아 주세요.|r\n그다음 ‘수색 시작’을 다시 눌러 주세요.")
        RenderPreparationVisibility()
        return true
    end
    function SurvivorUI.BeginPreparedCombat()
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
    function SurvivorUI.AdvanceNarrative()
        if not introReady then return end
        local ok, message = pcall(function()
            if conversation and conversationIndex < #conversation then
                conversationIndex = conversationIndex + 1
                RenderConversation()
            else CompleteIntro() end
        end)
        if not ok then NarrativeFailure(message) end
    end
    function SurvivorUI.SkipConversation()
        if conversation and introReady then CompleteIntro() end
    end
    -- redrawOnly: called from the local native-panel observer, so it must not
    -- advance the shared reading clock or queues; it only redraws them.
    function SurvivorUI.UpdateSpeech(redrawOnly)
        NativeHUD.Refresh()
        if not redrawOnly then Speech.Advance(SpeechClockRunning()) end
        local active = CombatHUDVisible()
        local visible, quiet = Speech.Visibility(active)
        DisplayDamageBoard(active, quiet)
        Speech.Render(active, visible)
        UpdateBossHUD(active)
        SurvivorUI.UpdateExpedition()
        Board.RefreshExpansion()
    end
    function SurvivorUI.UpdateDamageBoard(build, stage, stageElapsed, rerolls, difficultyId)
        local remaining = math.max(0, SurvivorConfig.StageTiming(stage).duration - stageElapsed)
        local difficulty = SurvivorConfig.difficulties[difficultyId or "normal"]
        local title = string.format("%s S%d/%d · %d:%02d · 리롤 %d/%d", difficulty.name, stage, SurvivorConfig.stages,
            math.floor(remaining / 60), math.floor(remaining % 60), rerolls, SurvivorConfig.rerollCapacity)
        Board.Update(build, title, function() DisplayDamageBoard(true) end)
        UpdateBossHUD(CombatHUDVisible())
        Board.RefreshExpansion(true)
    end

    local function Text(parent, name, width, height, x, y)
        local frame = BlzCreateFrameByType("TEXT", name, parent, "", 0)
        BlzFrameSetSize(frame, width, height)
        BlzFrameSetPoint(frame, FRAMEPOINT_TOP, parent, FRAMEPOINT_TOP, x, y)
        BlzFrameSetTextAlignment(frame, TEXT_JUSTIFY_MIDDLE, TEXT_JUSTIFY_CENTER)
        BlzFrameSetEnable(frame, false) -- Decorative children must not intercept card input.
        return frame
    end
    local function Bind(frame, event, callback)
        SurvivorConfig.BindFrameEvent(triggers, frame, event, callback, function(message) RunSession.Fail(message) end)
    end
    local function ReleaseFocus(frame)
        BlzFrameSetEnable(frame, false)
        BlzFrameSetEnable(frame, true)
    end
    local function ChoiceButton(parent, name)
        -- Invisible mouse hit area; keep decorative children display-only.
        local button = BlzCreateFrameByType("GLUEBUTTON", name, parent, "", 0)
        BlzFrameSetLevel(button, 3)
        return button
    end
    local function Backdrop(parent, template, context, width, height)
        -- The backdrop owns its geometry and the clickable content, as in the
        -- original visible panel. Do not put it under a BUTTON at frame level 0.
        local skin = BlzCreateFrame(template, parent, 0, context)
        assert(SurvivorConfig.ValidFrame(skin), "Missing UI backdrop: " .. template)
        BlzFrameSetSize(skin, width, height)
        BlzFrameSetAlpha(skin, 255)
        BlzFrameSetLevel(skin, 2)
        BlzFrameSetVisible(skin, true)
        return skin
    end
    local function FramedPanel(parent, name, context, width, height)
        -- A fully transparent BACKDROP groups the panel without a mouse surface.
        local frame = BlzCreateFrameByType("BACKDROP", name, parent, "", 0)
        BlzFrameSetTexture(frame, "AnyasLongNightUI\\Transparent.tga", 0, true)
        BlzFrameSetSize(frame, width, height)
        BlzFrameSetEnable(frame, false)
        local skin = Backdrop(frame, "CustomTooltipBackgroundTemplate", context, width, height)
        BlzFrameSetAllPoints(skin, frame)
        BlzFrameSetLevel(skin, 1)
        BlzFrameSetEnable(skin, false)
        return frame
    end
    local function ActionAvailable(control)
        if control.key == "available" then return (choosing or gearCallback ~= nil) and control.card.available end
        return choosing and control.card.available and control.card[control.key]
    end
    local function RenderActionFeedback(control)
        local amount = control.pressed and 1 or control.amount
        local color = control.color
        BlzFrameSetAlpha(control.glow, math.floor(amount * (control.pressed and 110 or 230)))
        if control.background then
            BlzFrameSetVertexColor(control.background, BlzConvertColor(255,
                control.pressed and 165 or 255, control.pressed and 165 or 255, control.pressed and 165 or 255))
        end
        if control.label then
            BlzFrameSetTextColor(control.label, BlzConvertColor(255,
                math.floor(255 + (color[1] - 255) * amount),
                math.floor(255 + (color[2] - 255) * amount),
                math.floor(255 + (color[3] - 255) * amount)))
        end
    end
    ResetActionFeedback = function()
        -- Mouse events only restyle local frames and never touch gameplay state.
        for _, control in ipairs(actionFeedback) do
            control.hovered, control.pressed, control.amount = false, false, 0
            RenderActionFeedback(control)
        end
        if actionTooltip then BlzFrameSetVisible(actionTooltip, false) end
    end
    local function AnimateActionFeedback()
        for _, control in ipairs(actionFeedback) do
            local target = control.hovered and ActionAvailable(control) and 1 or 0
            if not ActionAvailable(control) then control.hovered, control.pressed = false, false end
            if control.amount ~= target then
                control.amount = target
                RenderActionFeedback(control)
            end
        end
    end
    -- Hover feedback switches once per enter/leave. A 0.02-second fade rewrote the
    -- frames under the cursor 50 times a second and made the cursor flicker to the
    -- screen's top-right corner while it rested on a card.
    local function StartActionAnimation()
        local ok, message = pcall(AnimateActionFeedback)
        if not ok then
            pcall(ResetActionFeedback)
            print("[AnyasLongNight] Button feedback: " .. tostring(message))
        end
    end
    local function BindActionFeedback(card, key, button, background, label, name, color, tooltip)
        -- A transparent FRAME still has a mouse surface over its parent button.
        -- BACKDROP keeps the border's shared geometry/alpha without an input surface.
        local glow = BlzCreateFrameByType("BACKDROP", name, button, "", 0)
        BlzFrameSetTexture(glow, "AnyasLongNightUI\\Transparent.tga", 0, true)
        BlzFrameSetAllPoints(glow, button)
        BlzFrameSetLevel(glow, 1)
        BlzFrameSetEnable(glow, false)
        BlzFrameSetAlpha(glow, 0)
        -- Existing UI textures are solid swatches, so draw a hollow border from
        -- four strips instead of placing a filled rectangle over the button.
        local isCard = key == "available"
        local width = isCard and 0.212 or key == "rerollAvailable" and 0.108 or 0.09
        local height, inset, thickness = isCard and cardHeight or 0.03, isCard and 0.008 or 0.002,
            isCard and 0.0025 or 0.0015
        for _, edge in ipairs({{"Top", FRAMEPOINT_TOPLEFT, inset, -inset, width - 2 * inset, thickness},
            {"Bottom", FRAMEPOINT_BOTTOMLEFT, inset, inset, width - 2 * inset, thickness},
            {"Left", FRAMEPOINT_TOPLEFT, inset, -inset, thickness, height - 2 * inset},
            {"Right", FRAMEPOINT_TOPRIGHT, -inset, -inset, thickness, height - 2 * inset}}) do
            local strip = BlzCreateFrameByType("BACKDROP", name .. edge[1], glow, "", 0)
            BlzFrameSetPoint(strip, edge[2], glow, edge[2], edge[3], edge[4])
            BlzFrameSetSize(strip, edge[5], edge[6])
            BlzFrameSetTexture(strip, "AnyasLongNightUI\\Ready.tga", 0, true)
            BlzFrameSetVertexColor(strip, BlzConvertColor(255, 255,
                key == "excludeAvailable" and 190 or 255, key == "excludeAvailable" and 120 or 255))
            BlzFrameSetEnable(strip, false)
        end
        if label then BlzFrameSetLevel(label, 2) end
        local control = {card = card, key = key, button = button, background = background, label = label,
            glow = glow, color = color, amount = 0, hovered = false, pressed = false}
        actionFeedback[#actionFeedback + 1] = control
        local function LocalEvent(event, action)
            Bind(button, event, function()
                if SurvivorConfig.IsLocalPlayer() then action() end
            end)
        end
        LocalEvent(FRAMEEVENT_MOUSE_ENTER, function()
            if not ActionAvailable(control) then return end
            -- A direct move between siblings must not retain the old pressed state.
            for _, other in ipairs(actionFeedback) do
                local wasPressed = other.pressed
                other.hovered, other.pressed = false, false
                if wasPressed then RenderActionFeedback(other) end
            end
            control.hovered = true
            if tooltip then
                BlzFrameClearAllPoints(actionTooltip)
                BlzFrameSetPoint(actionTooltip, FRAMEPOINT_BOTTOM, button, FRAMEPOINT_TOP, 0, 0.008)
                BlzFrameSetText(actionTooltipText, tooltip)
            end
            BlzFrameSetVisible(actionTooltip, tooltip ~= nil)
            StartActionAnimation()
        end)
        LocalEvent(FRAMEEVENT_MOUSE_LEAVE, function()
            local wasHovered = control.hovered
            control.hovered, control.pressed = false, false
            RenderActionFeedback(control)
            if wasHovered then BlzFrameSetVisible(actionTooltip, false) end
            StartActionAnimation()
        end)
        LocalEvent(FRAMEEVENT_MOUSE_DOWN, function()
            if not ActionAvailable(control) then return end
            control.pressed = true; RenderActionFeedback(control)
        end)
        LocalEvent(FRAMEEVENT_MOUSE_UP, function()
            control.pressed = false; RenderActionFeedback(control)
        end)
    end
    local function RenderResultPage(index)
        if not resultPages[index] then return end
        if index == 5 and #journalChapters > 0 then
            journalPages = journalChapters[journalChapter].pages
            journalIndex = math.min(journalIndex, #journalPages)
            resultPages[5] = "|cffffcc00" .. journalChapters[journalChapter].title .. "|r\n\n" .. journalPages[journalIndex]
        end
        currentResultPage = index
        local summary = index == 1
        BlzFrameSetVisible(resultNote, not summary)
        for _, frame in ipairs({resultSummaryInfo, resultSummaryDamage, resultSummaryRest}) do
            BlzFrameSetVisible(frame, summary)
        end
        BlzFrameSetTextAlignment(resultNote, TEXT_JUSTIFY_TOP, TEXT_JUSTIFY_LEFT)
        BlzFrameSetSize(resultNote, 0.55, index == 5 and 0.160 or 0.195)
        BlzFrameSetText(resultNote, resultPages[index])
        if journalPosition then
            local visible = index == 5 and #journalChapters > 0
            for _, frame in ipairs({journalPrevious, journalNext, chapterPrevious, chapterNext, journalPosition}) do
                BlzFrameSetVisible(frame, visible)
            end
            if visible then
                BlzFrameSetText(journalPosition, string.format("%d/%d장 · %d/%d쪽", journalChapter, #journalChapters, journalIndex, #journalPages))
                BlzFrameSetEnable(journalPrevious, journalIndex > 1)
                BlzFrameSetEnable(journalNext, journalIndex < #journalPages)
                BlzFrameSetEnable(chapterPrevious, journalChapter > 1)
                BlzFrameSetEnable(chapterNext, journalChapter < #journalChapters)
            end
        end
        for i, tab in ipairs(resultTabs) do
            BlzFrameSetText(tab.frame, (i == index and "|cffffcc00" or "|cffffffff") .. tab.label .. "|r")
        end
    end
    function SurvivorUI.NavigateJournal(pageDelta, chapterDelta)
        if currentResultPage ~= 5 or #journalChapters == 0 then return end
        if chapterDelta ~= 0 then
            journalChapter = math.max(1, math.min(#journalChapters, journalChapter + chapterDelta))
            journalIndex = 1
        else journalIndex = math.max(1, math.min(#journalChapters[journalChapter].pages, journalIndex + pageDelta)) end
        RenderResultPage(5)
    end
    local function SpeechTick()
        local ok, message = pcall(SurvivorUI.UpdateSpeech)
        if not ok then
            PauseTimer(speechTimer)
            speechTimerPaused = true
            local cleared, failure = pcall(SurvivorUI.ClearSpeech)
            if not cleared then message = tostring(message) .. "\nUI cleanup: " .. tostring(failure) end
            RunSession.Fail(message)
        end
    end
    function SurvivorUI.BeginRun()
        -- Screen effects are local presentation; a failed reset is reported, not fatal to the run.
        local ok, message = pcall(SurvivorUI.ResetScreenEffects)
        if not ok then print("[AnyasLongNight cleanup] " .. tostring(message)) end
        if not initialized then return end
        -- Reuse the one map-lifetime handle after a failed run; never duplicate it.
        if speechTimer == nil then speechTimer = CreateTimer(); speechTimerPaused = true end
        if speechTimerPaused then
            frameCache = {}
            TimerStart(speechTimer, 0.1, true, SpeechTick)
            speechTimerPaused = false
        end
    end
    Speech.Bind({SetVisible = SetVisible, SetText = SetText, SetSize = SetSize, SetAbsPoint = SetAbsPoint,
        Text = Text, FramedPanel = FramedPanel})
    -- Expedition status, subtitles, notices, the boss/ward HUD and the risk button.
    local function BuildCombatHUD(parent)
        expeditionRoot = FramedPanel(parent, "HSExpedition", 715, 0.29, 0.069)
        BlzFrameSetAbsPoint(expeditionRoot, FRAMEPOINT_TOPLEFT, 0.025, 0.515)
        BlzFrameSetLevel(expeditionRoot, 15)
        expeditionText = Text(expeditionRoot, "AnyasLongNightExpedition", 0.254, 0.041, 0, -0.014)
        BlzFrameSetLevel(expeditionText, 3)
        BlzFrameSetTextAlignment(expeditionText, TEXT_JUSTIFY_TOP, TEXT_JUSTIFY_LEFT)
        BlzFrameSetEnable(expeditionText, false)
        BlzFrameSetVisible(expeditionText, false)
        BlzFrameSetVisible(expeditionRoot, false)
        Speech.Build(parent)
        -- Reserve the menu/resource strip and the Undead time-of-day ornament.
        -- Keep a separate column from notifications so both remain readable.
        essentialRoot = FramedPanel(parent, "HSEssentialHUD", 713, 0.26, 0.042)
        BlzFrameSetAbsPoint(essentialRoot, FRAMEPOINT_TOP, 0.455, 0.535)
        BlzFrameSetLevel(essentialRoot, 16)
        bossName = Text(essentialRoot, "HSBossName", 0.234, 0.015, 0, -0.008)
        BlzFrameSetLevel(bossName, 3)
        bossTrack = BlzCreateFrameByType("BACKDROP", "HSBossTrack", essentialRoot, "", 0)
        BlzFrameSetPoint(bossTrack, FRAMEPOINT_TOPLEFT, essentialRoot, FRAMEPOINT_TOPLEFT, 0.013, -0.027)
        BlzFrameSetSize(bossTrack, 0.234, 0.006)
        BlzFrameSetTexture(bossTrack, "UI\\Widgets\\ToolTips\\Human\\human-tooltip-background.blp", 0, true)
        bossFill = BlzCreateFrameByType("BACKDROP", "HSBossFill", essentialRoot, "", 0)
        BlzFrameSetPoint(bossFill, FRAMEPOINT_TOPLEFT, bossTrack, FRAMEPOINT_TOPLEFT, 0, 0)
        BlzFrameSetSize(bossFill, 0.234, 0.006)
        BlzFrameSetTexture(bossFill, "ReplaceableTextures\\TeamColor\\TeamColor00.blp", 0, true)
        BlzFrameSetLevel(bossTrack, 2)
        BlzFrameSetLevel(bossFill, 3)
        BlzFrameSetEnable(bossTrack, false)
        BlzFrameSetEnable(bossFill, false)
        wardText = Text(essentialRoot, "HSWardState", 0.234, 0.014, 0, -0.009)
        BlzFrameSetLevel(wardText, 3)
        SetVisible(wardText, false)
        SetVisible(essentialRoot, false)
        riskAccept = BlzCreateFrame("ScriptDialogButton", parent, 0, 715)
        BlzFrameSetAbsPoint(riskAccept, FRAMEPOINT_TOP, 0.072, 0.272)
        BlzFrameSetSize(riskAccept, 0.094, 0.030)
        BlzFrameSetLevel(riskAccept, 17)
        BlzFrameSetText(riskAccept, "조사 수락")
        Bind(riskAccept, FRAMEEVENT_CONTROL_CLICK, function()
            ReleaseFocus(riskAccept)
            SurvivorExpedition.AcceptRisk()
            SurvivorUI.UpdateSpeech()
        end)
        SetVisible(riskAccept, false)
        SurvivorUI.ClearSpeech()
    end
    -- The modal shade and panel, the result backdrop with its tabs and the journal controls.
    local function BuildResultPanel(parent)
        shade = BlzCreateFrameByType("BACKDROP", "AnyasLongNightShade", parent, "", 0)
        BlzFrameSetAbsPoint(shade, FRAMEPOINT_CENTER, 0.4, 0.3)
        BlzFrameSetSize(shade, 1.6, 0.6)
        BlzFrameSetTexture(shade, "UI\\Widgets\\ToolTips\\Human\\human-tooltip-background.blp", 0, true)
        BlzFrameSetEnable(shade, false)
        BlzFrameSetLevel(shade, 9)
        -- Transparent layout root: each choice has its own separate card background.
        panel = BlzCreateFrameByType("BACKDROP", "AnyasLongNightChoiceRoot", parent, "", 0)
        BlzFrameSetTexture(panel, "AnyasLongNightUI\\Transparent.tga", 0, true)
        BlzFrameSetAbsPoint(panel, FRAMEPOINT_CENTER, 0.4, 0.35)
        BlzFrameSetSize(panel, 0.74, 0.50)
        BlzFrameSetLevel(panel, 10)
        resultBackdrop = Backdrop(panel, "CustomTooltipBackgroundTemplate", 0, 0.60, 0.35)
        BlzFrameSetPoint(resultBackdrop, FRAMEPOINT_CENTER, panel, FRAMEPOINT_CENTER, 0, 0)
        BlzFrameSetLevel(resultBackdrop, 1)
        SetVisible(resultBackdrop, false)
        resultHeading = Text(resultBackdrop, "AnyasLongNightResultHeading", 0.55, 0.028, 0, -0.020)
        resultNote = Text(resultBackdrop, "AnyasLongNightResultNote", 0.55, 0.165, 0, -0.082)
        BlzFrameSetLevel(resultHeading, 3)
        BlzFrameSetLevel(resultNote, 3)
        resultSummaryInfo = Text(resultBackdrop, "HSResultSummaryInfo", 0.255, 0.145, -0.145, -0.092)
        resultSummaryDamage = Text(resultBackdrop, "HSResultSummaryDamage", 0.255, 0.145, 0.145, -0.092)
        resultSummaryRest = Text(resultBackdrop, "HSResultSummaryRest", 0.55, 0.040, 0, -0.242)
        for _, frame in ipairs({resultSummaryInfo, resultSummaryDamage, resultSummaryRest}) do
            BlzFrameSetTextAlignment(frame, TEXT_JUSTIFY_TOP, TEXT_JUSTIFY_LEFT)
            BlzFrameSetLevel(frame, 3)
        end
        for i, label in ipairs({"요약", "무기", "장신구", "기록", "수색", "피격"}) do
            local index = i
            local tab = BlzCreateFrame("ScriptDialogButton", resultBackdrop, 0, 500 + i)
            BlzFrameSetSize(tab, 0.078, 0.027)
            BlzFrameSetPoint(tab, FRAMEPOINT_TOP, resultBackdrop, FRAMEPOINT_TOP, (i - 3.5) * 0.087, -0.050)
            BlzFrameSetLevel(tab, 3)
            resultTabs[i] = {frame = tab, label = label}
            Bind(tab, FRAMEEVENT_CONTROL_CLICK, function()
                local state = RunSession.GetState()
                if state ~= "FINISHED" and state ~= "STAGE_CLEAR" then return end
                ReleaseFocus(tab)
                RenderResultPage(index)
            end)
        end
        local function JournalButton(context, x, label, pageDelta, chapterDelta)
            local button = BlzCreateFrame("ScriptDialogButton", resultBackdrop, 0, context)
            BlzFrameSetPoint(button, FRAMEPOINT_TOP, resultBackdrop, FRAMEPOINT_TOP, x, -0.250)
            BlzFrameSetSize(button, 0.074, 0.027)
            BlzFrameSetLevel(button, 3)
            BlzFrameSetText(button, label)
            Bind(button, FRAMEEVENT_CONTROL_CLICK, function()
                local state = RunSession.GetState()
                if state ~= "FINISHED" and state ~= "STAGE_CLEAR" then return end
                ReleaseFocus(button)
                SurvivorUI.NavigateJournal(pageDelta, chapterDelta)
            end)
            BlzFrameSetVisible(button, false)
            return button
        end
        chapterPrevious = JournalButton(723, -0.226, "이전 장", 0, -1)
        journalPrevious = JournalButton(721, -0.140, "이전 쪽", -1, 0)
        journalNext = JournalButton(722, 0.140, "다음 쪽", 1, 0)
        chapterNext = JournalButton(724, 0.226, "다음 장", 0, 1)
        journalPosition = Text(resultBackdrop, "HSJournalPosition", 0.18, 0.022, 0, -0.253)
        BlzFrameSetLevel(journalPosition, 3)
    end
    -- Growth/gear cards with reroll and exclude buttons, and the result action buttons.
    local function BuildChoiceCards(parent)
        heading = Text(panel, "AnyasLongNightHeading", 0.68, 0.04, 0, -0.005)
        note = Text(panel, "AnyasLongNightNote", 0.70, 0.016, 0, -0.405)
        rerollCounter = Text(panel, "AnyasLongNightRerollCount", 0.26, 0.021, -0.065, -0.378)
        BlzFrameSetLevel(rerollCounter, 5)
        for i = 1, SurvivorConfig.rerollCapacity do
            local pip = BlzCreateFrameByType("BACKDROP", "AnyasLongNightRerollPip" .. i, panel, "", 0)
            BlzFrameSetSize(pip, 0.011, 0.011)
            BlzFrameSetPoint(pip, FRAMEPOINT_TOP, panel, FRAMEPOINT_TOP, 0.08 + (i - 1) * 0.016, -0.382)
            BlzFrameSetTexture(pip, "ReplaceableTextures\\CommandButtons\\BTNReplay-Loop.blp", 0, true)
            BlzFrameSetEnable(pip, false)
            BlzFrameSetLevel(pip, 5)
            rerollPips[i] = pip
        end
        BlzFrameSetLevel(heading, 5)
        BlzFrameSetLevel(note, 5)
        actionTooltip = FramedPanel(parent, "HSChoiceActionTooltip", 716, 0.23, 0.060)
        BlzFrameSetLevel(actionTooltip, 30)
        actionTooltipText = Text(actionTooltip, "HSChoiceActionTooltipText", 0.194, 0.032, 0, -0.014)
        BlzFrameSetLevel(actionTooltipText, 3)
        BlzFrameSetVisible(actionTooltip, false)
        for i = 1, 3 do
            local slot = i
            local frame = Backdrop(panel, "EscMenuBackdrop", 100 + i, 0.212, cardHeight)
            BlzFrameSetPoint(frame, FRAMEPOINT_TOP, panel, FRAMEPOINT_TOP, (i - 2) * 0.23, cardTop)
            local button = ChoiceButton(frame, "AnyasLongNightCard" .. i)
            BlzFrameSetSize(button, 0.212, cardHeight)
            BlzFrameSetPoint(button, FRAMEPOINT_CENTER, frame, FRAMEPOINT_CENTER, 0, 0)
            -- A shared local feedback control supplies the card's mouse-over border.
            local icon = BlzCreateFrameByType("BACKDROP", "AnyasLongNightIcon" .. i, button, "", 0)
            BlzFrameSetSize(icon, 0.06, 0.06)
            BlzFrameSetPoint(icon, FRAMEPOINT_TOP, button, FRAMEPOINT_TOP, 0, -0.018)
            BlzFrameSetEnable(icon, false)
            -- Sibling buttons stay outside the card's selection hit area.
            local rerollFrame = Backdrop(panel, "QuestButtonBaseTemplate", 200 + i, 0.108, 0.03)
            BlzFrameSetPoint(rerollFrame, FRAMEPOINT_TOP, frame, FRAMEPOINT_BOTTOM, -0.052, -0.01)
            local reroll = ChoiceButton(rerollFrame, "AnyasLongNightReroll" .. i)
            BlzFrameSetSize(reroll, 0.108, 0.03)
            BlzFrameSetPoint(reroll, FRAMEPOINT_CENTER, rerollFrame, FRAMEPOINT_CENTER, 0, 0)
            local excludeFrame = Backdrop(panel, "QuestButtonBaseTemplate", 400 + i, 0.09, 0.03)
            BlzFrameSetPoint(excludeFrame, FRAMEPOINT_TOP, frame, FRAMEPOINT_BOTTOM, 0.059, -0.01)
            local exclude = ChoiceButton(excludeFrame, "AnyasLongNightExclude" .. i)
            BlzFrameSetAllPoints(exclude, excludeFrame)
            cards[i] = {frame = frame, button = button, icon = icon, rerollFrame = rerollFrame,
                excludeFrame = excludeFrame, exclude = exclude,
                excludeText = Text(exclude, "AnyasLongNightExcludeText" .. i, 0.082, 0.03, 0, 0),
                title = Text(button, "AnyasLongNightTitle" .. i, 0.185, 0.041, 0, -0.083),
                description = Text(button, "AnyasLongNightDescription" .. i, 0.178, 0.075, 0, -0.132),
                preview = Text(button, "AnyasLongNightPreview" .. i, 0.18, 0.032, 0, -0.209),
                hint = Text(button, "AnyasLongNightHint" .. i, 0.18, 0.015, 0, -0.249),
                reroll = reroll,
                rerollText = Text(reroll, "AnyasLongNightRerollText" .. i, 0.10, 0.03, 0, 0)}
            BindActionFeedback(cards[i], "available", button, nil, nil,
                "HSCardHover" .. i, {255, 220, 105}, nil)
            BindActionFeedback(cards[i], "rerollAvailable", reroll, rerollFrame, cards[i].rerollText,
                "HSRerollHover" .. i, {255, 220, 105}, "|cffffdc69이 후보를 다시 추첨|r\n리롤 기회 1회를 사용합니다.")
            BindActionFeedback(cards[i], "excludeAvailable", exclude, excludeFrame, cards[i].excludeText,
                "HSExcludeHover" .. i, {255, 165, 75}, "|cffffa54b이번 판에서 제외|r\n다시 등장하지 않습니다.")
            Bind(button, FRAMEEVENT_CONTROL_CLICK, function()
                if gearCallback and cards[slot].available then
                    ResetActionFeedback()
                    local callback = gearCallback
                    gearCallback = nil
                    ReleaseFocus(button)
                    -- A rejected click leaves the run modal open; keep its cards usable.
                    if callback(slot) == false and gearCallback == nil then gearCallback = callback end
                    return
                end
                if not choosing or not cards[slot].available then return end
                choosing = false
                ResetActionFeedback()
                ReleaseFocus(button)
                if chooseCallback(slot) == false then choosing = true end
            end)
            Bind(reroll, FRAMEEVENT_CONTROL_CLICK, function()
                if not choosing or not cards[slot].rerollAvailable then return end
                ResetActionFeedback()
                ReleaseFocus(reroll)
                rerollCallback(slot)
            end)
            Bind(exclude, FRAMEEVENT_CONTROL_CLICK, function()
                if not choosing or not cards[slot].excludeAvailable then return end
                ResetActionFeedback()
                ReleaseFocus(exclude)
                excludeCallback(slot)
            end)
        end
        -- Keep the button inside its backdrop so the opaque result skin cannot cover it.
        restartButton = BlzCreateFrame("ScriptDialogButton", resultBackdrop, 0, 4)
        BlzFrameSetLevel(restartButton, 3)
        BlzFrameSetAlpha(restartButton, 255)
        BlzFrameSetSize(restartButton, 0.16, 0.036)
        BlzFrameSetPoint(restartButton, FRAMEPOINT_TOP, resultBackdrop, FRAMEPOINT_TOP, 0.14, -0.290)
        BlzFrameSetText(restartButton, "설정 변경")
        Bind(restartButton, FRAMEEVENT_CONTROL_CLICK, function()
            ReleaseFocus(restartButton)
            if RunSession.GetState() == "FINISHED" then restartCallback()
            elseif RunSession.GetState() == "STAGE_CLEAR" then nextCallback() end
        end)
        retrySame = BlzCreateFrame("ScriptDialogButton", resultBackdrop, 0, 720)
        BlzFrameSetSize(retrySame, 0.23, 0.036)
        BlzFrameSetPoint(retrySame, FRAMEPOINT_TOP, resultBackdrop, FRAMEPOINT_TOP, -0.08, -0.290)
        BlzFrameSetLevel(retrySame, 3)
        BlzFrameSetText(retrySame, "같은 설정으로 재도전")
        Bind(retrySame, FRAMEEVENT_CONTROL_CLICK, function()
            ReleaseFocus(retrySame)
            if RunSession.GetState() == "FINISHED" then retryCallback() end
        end)
        BlzFrameSetVisible(retrySame, false)
        BlzFrameSetVisible(panel, false)
        BlzFrameSetVisible(shade, false)
    end
    -- Story scenes, the return shade and the combat preparation panel and countdown.
    local function BuildNarrative(parent)
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
    function SurvivorUI.Init(onChoose, onRestart, onReroll, onNextStage, onExclude, onRetrySame, canRetrySame)
        if initialized then return end
        retryCallback = onRetrySame or function() return AnyasLongNight.RetrySame() end
        canRetryCallback = canRetrySame or function() return AnyasLongNight.CanRetrySame() end
        assert(BlzLoadTOCFile("CustomTooltip.toc"), "Missing tooltip panel templates")
        NativeHUD.CacheDecorations()
        chooseCallback, restartCallback, rerollCallback, nextCallback = onChoose, onRestart, onReroll, onNextStage
        excludeCallback = onExclude
        -- ConsoleUIBackdrop is above world HP bars; GameUI children can be below them.
        local parent = BlzGetFrameByName("ConsoleUIBackdrop", 0)
        parentName = "ConsoleUIBackdrop"
        if not ValidNativeFrame(parent) then
            parent = BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0)
            parentName = "GameUI"
        end
        NativeHUD.CacheContainers(parent)
        SurvivorScreenEffects.Init(parent)
        -- Creation order is draw order within a level; keep these in sequence.
        BuildCombatHUD(parent)
        BuildResultPanel(parent)
        BuildChoiceCards(parent)
        BuildNarrative(parent)
        StopIntro()
        initialized = true
        -- One map-lifetime UI timer. Reading duration follows the paused run clock.
        SurvivorUI.BeginRun()
    end
    local function PrepareNarrative(title, text, onReady, footer, buttonLabel)
        SurvivorUI.SetTimeStopFilter(false, true)
        SurvivorUI.HidePanel()
        SurvivorUI.ClearSpeech()
        DisplayDamageBoard(false)
        if essentialRoot then SetVisible(essentialRoot, false) end
        if riskAccept then SetVisible(riskAccept, false) end
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
    function SurvivorUI.ShowNarrative(title, text, onReady, footer, buttonLabel)
        local ok, message = pcall(PrepareNarrative, title, text, onReady, footer, buttonLabel)
        if not ok then NarrativeFailure(message) end
    end
    function SurvivorUI.ShowConversation(title, pages, onReady, onPage, onClose, finishLabel)
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
    function SurvivorUI.ShowStageIntro(index, onReady, hero)
        SurvivorStory.SetStage(index)
        -- Later stages open on an arrival scene; its last button leads to the preparation panel,
        -- which already repeats the mission and hint the old text card showed.
        if index > 1 then return SurvivorStory.ShowArrival(index, hero, onReady) end
        SurvivorUI.ShowNarrative(string.format("%s\n%d / 5 · %s", SurvivorStory.title, index, SurvivorStage.Get(index).name),
            SurvivorStory.premise, function() SurvivorStory.ShowBriefing(hero, onReady) end,
            "우클릭 이동 · 무기는 자동 공격 · F10 메뉴\n" .. SurvivorStory.notice, "장면 보기")
    end
    function SurvivorUI.ShowCombatPreparation(index, onReady, canStart)
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
    function SurvivorUI.HidePanel()
        -- Release the modal state first: a failed native step must not leave the
        -- choice reported as visible, which hides the HUD and blocks loot controls.
        gearCallback = nil
        choosing, restVisible = false, false
        local failures = {}
        local function Attempt(action, ...)
            local ok, message = pcall(action, ...)
            if not ok then failures[#failures + 1] = tostring(message) end
        end
        Attempt(ResetActionFeedback)
        if expeditionRoot then Attempt(function() SetVisible(expeditionRoot, false); SetVisible(expeditionText, false) end) end
        if SurvivorSetupUI then Attempt(SurvivorSetupUI.Hide) end
        Attempt(StopIntro)
        if initialized then
            Attempt(BlzFrameSetVisible, panel, false)
            Attempt(BlzFrameSetVisible, shade, false)
        end
        Attempt(DisplayDamageBoard, true)
        if #failures > 0 then error(table.concat(failures, "\n"), 0) end
    end
    local function SetRerollsVisible(visible)
        BlzFrameSetVisible(rerollCounter, visible)
        for _, pip in ipairs(rerollPips) do BlzFrameSetVisible(pip, visible) end
    end
    -- Gear cards show three set lines (element/name, thresholds, linked weapons).
    local function LayoutCardText(card, evolution, gear, upgrade)
        BlzFrameSetSize(card.description, 0.178, evolution and 0.085 or gear and 0.069 or upgrade and 0.03 or 0.047)
        BlzFrameClearAllPoints(card.preview)
        BlzFrameSetSize(card.preview, 0.18, evolution and 0.022 or gear and 0.044 or upgrade and 0.077 or 0.06)
        BlzFrameSetPoint(card.preview, FRAMEPOINT_TOP, card.button, FRAMEPOINT_TOP, 0, evolution and -0.219 or gear and -0.203 or upgrade and -0.168 or -0.184)
    end
    function SurvivorUI.ShowGearRewards(offers, stage, callback, title)
        SurvivorUI.HidePanel()
        DisplayDamageBoard(false)
        SetVisible(resultBackdrop, false)
        SetRerollsVisible(false)
        BlzFrameSetVisible(heading, true)
        BlzFrameSetVisible(note, true)
        BlzFrameSetText(heading, "|cffffcc00" .. (title or string.format("경로 확보 %d/5 · 회수한 장비 중 하나 선택", stage)) .. "|r")
        BlzFrameSetText(note, "보유 무기 연계·장비 교체 후보 우선 · 선택한 장비는 확장 인벤토리에서 장착")
        for i = 1, 3 do
            local card, entry = cards[i], SurvivorEquipment.Get(offers[i])
            card.available, card.rerollAvailable, card.excludeAvailable = entry ~= nil, false, false
            BlzFrameSetVisible(card.frame, entry ~= nil)
            BlzFrameSetVisible(card.rerollFrame, false)
            BlzFrameSetVisible(card.excludeFrame, false)
            if entry then
                LayoutCardText(card, false, true)
                local summary, setSummary = SurvivorEquipment.Summary(entry.id)
                BlzFrameClearAllPoints(card.frame)
                BlzFrameSetPoint(card.frame, FRAMEPOINT_TOP, panel, FRAMEPOINT_TOP, (i - 2) * 0.23, cardTop)
                BlzFrameSetTexture(card.icon, entry.icon, 0, true)
                BlzFrameSetText(card.title, SurvivorEquipment.Name(entry.id))
                BlzFrameSetText(card.description, summary .. "\n" .. entry.description)
                BlzFrameSetText(card.preview, setSummary)
                BlzFrameSetText(card.hint, "클릭하여 장비 획득")
            end
        end
        gearCallback = callback
        BlzFrameSetVisible(panel, not nativeInventoryVisible)
        BlzFrameSetVisible(shade, not nativeInventoryVisible)
        BlzFrameSetAlpha(shade, 185)
        SurvivorUI.UpdateSpeech()
        if SurvivorLootUI then SurvivorLootUI.Refresh() end
    end
    function SurvivorUI.SetRestInventoryVisible(open)
        local changed = nativeInventoryVisible ~= (open == true)
        nativeInventoryVisible = open == true
        -- Let the native close/tab controls own input until the panel is closed.
        -- Keep the queued choice intact and restore its buttons afterwards.
        if changed and (choosing or gearCallback ~= nil) then
            ResetActionFeedback()
            BlzFrameSetVisible(panel, not nativeInventoryVisible)
            BlzFrameSetVisible(shade, not nativeInventoryVisible)
        end
        if preparationReady then RenderPreparationVisibility() end
        -- Hide local HUD immediately even while the synchronized pause is still in flight.
        if nativeInventoryVisible and essentialRoot then SetVisible(essentialRoot, false) end
        -- Local observer: redraw only; the speech queue advances on the synchronized timer.
        if changed and initialized then SurvivorUI.UpdateSpeech(true) end
        if not restVisible then return end
        -- Only presentation follows local native panel visibility; the rest pause stays synchronized.
        SetVisible(resultBackdrop, not open)
    end
    function SurvivorUI.ShowChoices(offers, rewardLevel, build, remaining, rerollsRemaining)
        ResetActionFeedback()
        if expeditionRoot then SetVisible(expeditionRoot, false); SetVisible(expeditionText, false) end
        gearCallback = nil
        restVisible = false
        DisplayDamageBoard(false)
        BlzFrameSetVisible(heading, true)
        BlzFrameSetVisible(note, true)
        local full = #build.weapons >= SurvivorConfig.weaponSlots and " · 신규 무기 획득 불가" or ""
        BlzFrameSetText(heading, string.format("|cffffcc00레벨 %d · 무기 %d/%d · 장신구 %d/%d%s|r",
            rewardLevel, #build.weapons, SurvivorConfig.weaponSlots, #build.trinkets, SurvivorConfig.trinketSlots, full))
        local extra = remaining > 0 and (" · 이후 선택 " .. remaining .. "회") or ""
        if not build.evolutionOffer then extra = extra .. " · 강화·신규 후보 각 1장 보장" end
        if build.evolutionOffer then extra = extra .. " · 최고 레벨 무기 진화" end
        BlzFrameSetText(note, "제외: 새 후보·진화만 · 이번 판 재등장 없음" .. extra)
        SetRerollsVisible(true)
        BlzFrameSetText(rerollCounter, string.format("|cffffcc00리롤 %d/%d · 제외 %d/%d|r", rerollsRemaining, SurvivorConfig.rerollCapacity, build.excludesRemaining, SurvivorConfig.excludesPerRun))
        for i, pip in ipairs(rerollPips) do
            BlzFrameSetAlpha(pip, i <= rerollsRemaining and 255 or 45)
        end
        SetVisible(resultBackdrop, false)
        BlzFrameSetVisible(restartButton, false)
        for i = 1, 3 do
            local id, card = offers[i], cards[i]
            card.available = id ~= nil
            card.rerollAvailable = id ~= nil and rerollsRemaining > 0 and SurvivorAugments.CanReroll(build, offers, i)
            card.excludeAvailable = SurvivorAugments.CanExclude(build, offers, i)
            BlzFrameSetVisible(card.frame, id ~= nil)
            BlzFrameSetVisible(card.rerollFrame, id ~= nil)
            BlzFrameSetVisible(card.excludeFrame, id ~= nil)
            BlzFrameSetEnable(card.exclude, card.excludeAvailable)
            BlzFrameSetAlpha(card.excludeFrame, card.excludeAvailable and 255 or 100)
            BlzFrameSetText(card.excludeText, card.excludeAvailable and ("제외 (" .. build.excludesRemaining .. ")") or "제외 불가")
            BlzFrameSetEnable(card.reroll, card.rerollAvailable)
            BlzFrameSetAlpha(card.rerollFrame, card.rerollAvailable and 255 or 120)
            BlzFrameSetText(card.rerollText, card.rerollAvailable and ("리롤 (" .. rerollsRemaining .. ")") or rerollsRemaining <= 0 and "횟수 소진" or "후보 없음")
            if id ~= nil then
                local augment = SurvivorAugments.Get(id)
                BlzFrameClearAllPoints(card.frame)
                BlzFrameSetPoint(card.frame, FRAMEPOINT_TOP, panel, FRAMEPOINT_TOP, (i - (#offers + 1) / 2) * 0.23, cardTop)
                local weapon = augment.kind == "weapon" or augment.kind == "evolution"
                local upgrade = augment.kind == "weapon" and SurvivorAugments.Level(build, id) > 0
                LayoutCardText(card, augment.kind == "evolution", false, upgrade)
                BlzFrameSetTexture(card.icon, augment.icon, 0, true)
                local kind = weapon and (augment.kind == "evolution" and "[무기 진화]" or "[무기]")
                    or augment.kind == "trinket" and "[장신구]" or "[회복]"
                local color = weapon and "|cffffd77d" or "|cff8adbe8"
                BlzFrameSetText(card.title, color .. kind .. "|r\n"
                    .. (augment.element and (SurvivorAugments.ElementTag(augment.element) .. " ") or "") .. color .. augment.name .. "|r")
                BlzFrameSetText(card.description, SurvivorAugments.ChoiceLabel(id, build) .. "\n"
                    .. (upgrade and SurvivorAugments.WeaponTags(id) or SurvivorAugments.Description(id)))
                BlzFrameSetText(card.preview, augment.kind == "evolution" and "진화 선택 후 변경 불가" or SurvivorAugments.Preview(id, build))
                BlzFrameSetText(card.hint, "클릭하여 선택")
            end
        end
        choosing = true
        BlzFrameSetVisible(shade, not nativeInventoryVisible)
        BlzFrameSetAlpha(shade, 185)
        BlzFrameSetVisible(panel, not nativeInventoryVisible)
        -- Hide the previous HUD in this event, before either native UI observer
        -- ticks. Its higher-level loot/speech frames can overlap a card's edge.
        SurvivorUI.UpdateSpeech()
        if SurvivorLootUI then SurvivorLootUI.Refresh() end
    end
    function SurvivorUI.ShowResult(reason, elapsed, kills, stage, bossTime, report, details)
        SurvivorUI.SetTimeStopFilter(false, true)
        ResetActionFeedback()
        StopIntro()
        SurvivorUI.ClearSpeech()
        journalPages, journalIndex, currentResultPage = {}, 1, 1
        journalChapters, journalChapter = {}, 1
        resultTabs[5].label = "수색"
        gearCallback = nil
        choosing, restVisible = false, reason == "stage_clear"
        SetRerollsVisible(false)
        DisplayDamageBoard(true)
        local title = reason == "defeated" and "흔적이 끊겼다 · 다시 도전해 보세요" or "플레이 종료"
        if reason == "boss_defeated" then title = "수색 완료 · 이름 모를 언데드" end
        if reason == "stage_clear" then title = "경로 확보 · " .. SurvivorStage.Get(stage).name end
        if reason == "timeout" then title = "시간 초과 · 흔적이 식어 버렸다" end
        if reason == "error" then title = "실행 오류 · 게임 메시지를 확인하세요" end
        BlzFrameSetVisible(heading, false)
        BlzFrameSetVisible(note, false)
        BlzFrameSetText(resultHeading, "|cffffcc00" .. title .. "|r")
        local summary = {"|cffffcc00진행 기록|r", string.format("스테이지  %d / %d", stage or 1, SurvivorConfig.stages)}
        if details then summary[#summary + 1] = details.difficulty .. " · " .. (restVisible and "현재 레벨 " or "종료 레벨 ") .. details.level end
        summary[#summary + 1] = string.format("총 전투 시간  %d:%02d", math.floor(elapsed / 60), math.floor(elapsed % 60))
        summary[#summary + 1] = string.format("처치  %d", kills)
        if bossTime then summary[#summary + 1] = string.format("보스 전투  %.1f초", bossTime) end
        local info = table.concat(summary, "\n\n  ")
        local damage = (report and report ~= "" and report or "누적 유효 피해: 없음")
            :gsub("^누적 유효 피해", "|cffffcc00누적 유효 피해|r"):gsub("\n", "\n\n  ")
        local rest = restVisible and "|cffffcc00휴식 안내|r · 확장 인벤토리에서 장비를 정리하세요.\n남은 장비는 다음 시작 지점에 보존 · 리롤 +1 (최대 5)" or ""
        BlzFrameSetText(resultSummaryInfo, info)
        BlzFrameSetText(resultSummaryDamage, damage)
        BlzFrameSetText(resultSummaryRest, rest)
        resultPages = {info .. "\n\n" .. damage .. (rest ~= "" and "\n\n" .. rest or "")}
        if details then
            local lines = {"|cffffcc00무기·진화|r"}
            for _, text in ipairs(details.weapons) do lines[#lines + 1] = text end
            resultPages[2] = table.concat(lines, "\n")
            lines = {"|cffffcc00장신구|r"}
            if #details.trinkets == 0 then lines[#lines + 1] = "없음" end
            for _, text in ipairs(details.trinkets) do lines[#lines + 1] = text end
            resultPages[3] = table.concat(lines, "\n")
            lines = {"단계 / 레벨 / 처치 / 시간 / 보스전 / 탈출 발동"}
            for i, record in ipairs(details.stages) do
                lines[#lines + 1] = string.format("%d%s · Lv.%d · %d처치 · %d:%02d · %s · %d회", i, record.cleared and " 완료" or " 실패",
                    record.level, record.kills, math.floor(record.duration / 60), math.floor(record.duration % 60),
                    record.bossTime and string.format("%.1f초", record.bossTime) or "미등장", record.escapes or 0)
            end
            local first = details.firstEvolution
            lines[#lines + 1] = first and string.format("첫 진화 %d:%02d · Lv.%d · %s", math.floor(first.time / 60), math.floor(first.time % 60), first.level, first.name) or "첫 진화: 없음"
            lines[#lines + 1] = string.format("최대 관측: 적 %d · 전투 효과 %d (0.5초 간격) · 정지 시간 제외", details.peakEnemies or 0, details.peakVisuals or 0)
            resultPages[4] = table.concat(lines, "\n")
            journalPages, journalIndex, currentResultPage = {}, 1, 1
            journalChapters = details.journalChapters or {}
            if #journalChapters == 0 then
                journalPages[1] = "아직 확인한 단서가 없습니다."
                journalChapters = {{title = "수색 기록", pages = journalPages}}
            end
            resultPages[5] = journalChapters[1].pages[1]
            resultPages[4] = resultPages[4] .. "\n그림자 탈출 발동 " .. (details.escapeUses or 0) .. "회"
            resultPages[6] = "|cffffcc00최근 8초 · 최대 5회 피격|r\n" .. (details.damageHistory and details.damageHistory ~= "" and details.damageHistory or "기록된 피해 없음")
                .. "\n\n" .. (details.damageHint or "")
        end
        for i, tab in ipairs(resultTabs) do BlzFrameSetEnable(tab.frame, resultPages[i] ~= nil) end
        RenderResultPage(reason == "defeated" and resultPages[6] and 6 or 1)
        BlzFrameClearAllPoints(restartButton)
        BlzFrameSetPoint(restartButton, FRAMEPOINT_TOP, resultBackdrop, FRAMEPOINT_TOP, reason == "stage_clear" and 0 or 0.14, -0.290)
        BlzFrameSetText(restartButton, reason == "stage_clear" and "다음 스테이지" or "설정 변경")
        BlzFrameSetVisible(retrySame, reason ~= "stage_clear" and canRetryCallback ~= nil and canRetryCallback())
        for i = 1, 3 do
            cards[i].available, cards[i].rerollAvailable = false, false
            BlzFrameSetVisible(cards[i].frame, false)
            BlzFrameSetVisible(cards[i].rerollFrame, false)
            BlzFrameSetVisible(cards[i].excludeFrame, false)
        end
        SetVisible(resultBackdrop, true)
        BlzFrameSetEnable(restartButton, true)
        BlzFrameSetAlpha(restartButton, 255)
        BlzFrameSetVisible(restartButton, true)
        BlzFrameSetVisible(shade, not restVisible)
        BlzFrameSetAlpha(shade, 185)
        BlzFrameSetVisible(panel, true)
    end
    function SurvivorUI.DebugStatus()
        if not initialized or not SurvivorConfig.IsLocalPlayer() then return end
        print(string.format("[AnyasLongNight UI difficulty-v7] parent=%s visible=%s choosing=%s",
            parentName, tostring(BlzFrameIsVisible(panel)), tostring(choosing)))
        for i, card in ipairs(cards) do
            print(string.format("[card %d] visible=%s size=%.3fx%.3f alpha=%d",
                i, tostring(BlzFrameIsVisible(card.frame)), BlzFrameGetWidth(card.frame),
                BlzFrameGetHeight(card.frame), BlzFrameGetAlpha(card.frame)))
        end
    end
end
