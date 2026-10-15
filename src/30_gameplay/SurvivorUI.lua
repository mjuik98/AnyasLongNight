-- Map-lifetime frames using stock Blizzard templates and background textures.
SurvivorUI = {}
do
    local initialized, choosing = false, false
    local panel, shade, heading, note, restartButton, resultBackdrop
    local cards, triggers = {}, {}
    local chooseCallback, restartCallback, rerollCallback
    local parentName, resultHeading, resultNote, nextCallback
    local restVisible, damageBoard = false, nil
    local nativeInventoryVisible = false
    local rerollCounter, rerollPips = nil, {}
    local excludeCallback
    local gearCallback
    local expeditionText
    local speechRoot, speechName, speechText, noticeRoot, noticeText
    local speechQueue, speech, notice, speechClock, speechVisible = {}, nil, nil, 0, false
    local deferredNotice
    local alerts, alertSerial = {}, 0
    local essentialRoot, bossName, bossTrack, bossFill, riskAccept
    local wardText, wardTextCache, essentialLayout
    local bossSnapshot
    local nativeHiddenFrames = {}
    local cinematicFrames, cinematicSaved, cinematicAncestors = {}, {}, {}
    local cinematicMode
    local damageBoardOriginalMinimized
    local retrySame, journalPrevious, journalNext, chapterPrevious, chapterNext, journalPosition
    local conversation, conversationIndex, conversationAction, conversationTitle, sceneSkip, conversationClose
    local conversationFinishLabel
    local preparationRoot, preparationButton, preparationTitle, preparationMission, preparationRecord
    local preparationHint, preparationLoadout, preparationFooter, preparationCountdown
    local preparationReady, preparationCheck, preparationTimer
    local preparationGeneration = 0
    local speechTimer, speechTimerPaused
    local frameCache = {}
    local damageCells, damageValues, damageRowCount, damageBuild, damageTitle = {}, {}, nil, nil, nil
    local damageBoardVisible, damageBoardExpanded = nil, false
    local noticeHeightText, noticeHeightUrgent, noticeHeight
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
    local function RestoreDamageBoardMinimize()
        if damageBoardOriginalMinimized == nil then return end
        local original = damageBoardOriginalMinimized
        damageBoardOriginalMinimized = nil
        if damageBoard and GetLocalPlayer() == Player(SurvivorConfig.playerId) then
            MultiboardMinimize(damageBoard, original)
        end
    end
    function SurvivorUI.ClearSpeech()
        RestoreDamageBoardMinimize()
        speechQueue, speech, notice, deferredNotice = {}, nil, nil, nil
        alerts = {}
        speechClock = RunSession.GetElapsed()
        if speechRoot then SetVisible(speechRoot, false) end
        if noticeRoot then SetVisible(noticeRoot, false) end
    end
    function SurvivorUI.Say(speaker, text)
        if SurvivorStory then SurvivorStory.Remember(speaker, text) end
        -- Bound transient notifications; every line remains in the search journal.
        if #speechQueue >= 6 then table.remove(speechQueue, 1) end
        speechQueue[#speechQueue + 1] = {speaker = speaker, text = text, remaining = 7}
    end
    function SurvivorUI.Notify(text)
        local entry = {text = text, remaining = 7}
        if notice and notice.urgent then deferredNotice = entry; return end
        notice = entry
        if noticeText then SetText(noticeText, text) end
    end
    local function RenderAlerts()
        if #alerts == 0 then return end
        table.sort(alerts, function(a, b)
            return a.priority > b.priority or (a.priority == b.priority and a.serial > b.serial)
        end)
        local lines = {}
        for i = 1, math.min(2, #alerts) do lines[i] = alerts[i].text end
        notice = {text = table.concat(lines, "\n"), urgent = true}
        if noticeText then SetText(noticeText, "|cffffb070" .. notice.text .. "|r") end
    end
    function SurvivorUI.Alert(seconds, text, priority, key)
        if notice and not notice.urgent then deferredNotice = notice end
        key = key or text
        for i = #alerts, 1, -1 do if alerts[i].key == key then table.remove(alerts, i) end end
        alertSerial = alertSerial + 1
        alerts[#alerts + 1] = {text = text, priority = priority or 60, key = key,
            expires = RunSession.GetElapsed() + seconds, serial = alertSerial}
        RenderAlerts()
        while #alerts > 8 do table.remove(alerts) end
    end
    function SurvivorUI.Cue(kind)
        -- Borrow initialized Blizzard GUI sounds; do not create per-hit sound handles.
        local sound = kind == "elite" and bj_questWarningSound or kind == "escape" and bj_questHintSound
            or kind == "evolution" and bj_questCompletedSound or kind == "clue" and bj_questItemAcquiredSound
        if sound then StartSound(sound) end
    end
    local journalPages, journalIndex, currentResultPage = {}, 1, 1
    local journalChapters, journalChapter = {}, 1
    local function WrappedLines(text)
        -- Estimate stock-font wrapping without counting Warcraft color escapes.
        -- Korean glyphs need more room than Latin letters; explicit breaks still count.
        text = (text or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""):gsub("|n", "\n")
        local lines = 0
        for line in (text .. "\n"):gmatch("([^\n]*)\n") do
            local width = 0
            for i = 1, #line do
                local byte = line:byte(i)
                if byte < 128 then width = width + 0.55
                elseif byte >= 192 then width = width + 1 end -- Count UTF-8 leading bytes only.
            end
            lines = lines + math.max(1, math.ceil(width / 29))
        end
        return math.max(1, lines)
    end
    local function NoticeHeight()
        local text, urgent = notice and notice.text or "", notice and notice.urgent or false
        if noticeHeightText ~= text or noticeHeightUrgent ~= urgent then
            noticeHeightText, noticeHeightUrgent = text, urgent
            noticeHeight = math.max(0.042, math.min(urgent and 0.132 or 0.094,
                0.028 + WrappedLines(text) * 0.0125))
        end
        return noticeHeight
    end
    local function ValidNativeFrame(frame)
        return frame ~= nil and frame ~= 0 and GetHandleId(frame) ~= 0
    end
    local function CacheHiddenNativeFrame(frame)
        if ValidNativeFrame(frame) then nativeHiddenFrames[#nativeHiddenFrames + 1] = frame end
    end
    local function NativeChild(frame, index)
        if not BlzFrameGetChild or not BlzFrameGetChildrenCount or not ValidNativeFrame(frame) then return nil end
        if BlzFrameGetChildrenCount(frame) <= index then return nil end
        local child = BlzFrameGetChild(frame, index)
        return ValidNativeFrame(child) and child or nil
    end
    local function HideNativeHUD()
        if GetLocalPlayer() ~= Player(SurvivorConfig.playerId) then return end
        for _, frame in ipairs(nativeHiddenFrames) do
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
    local function RestoreCinematicFrames()
        cinematicMode = nil
        if GetLocalPlayer() ~= Player(SurvivorConfig.playerId) then return end
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
    local function ApplyCinematicFrames(mode)
        AcquireCinematicFrames()
        cinematicMode = mode
        if GetLocalPlayer() ~= Player(SurvivorConfig.playerId) then return end
        local hidden = {}
        for _, entry in ipairs(cinematicFrames) do
            if ValidNativeFrame(entry.frame) and (mode == "intro" or not entry.introOnly) then
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
    function SurvivorUI.UpdateExpedition()
        if not expeditionText then return end
        local visible = RunSession.IsRunning() and not nativeInventoryVisible and not SurvivorUI.IsNarrativeVisible()
            and not (SurvivorLootUI and SurvivorLootUI.IsExpanded())
            and (not speechVisible or SurvivorExpedition.HasRiskNotice())
        local text = visible and SurvivorExpedition.Status(speechVisible) or ""
        visible = visible and text ~= ""
        local top = notice and math.max(0.36, 0.515 - NoticeHeight() - 0.012) or 0.515
        local cached = FrameState(expeditionText)
        if cached.wrapText ~= text then
            cached.wrapText = text
            cached.wrapHeight = math.min(0.128, math.max(0.041, WrappedLines(text) * 0.0125 + 0.006))
        end
        local height = cached.wrapHeight
        SetAbsPoint(expeditionText, FRAMEPOINT_TOPLEFT, 0.025, top)
        SetSize(expeditionText, 0.255, height)
        SetVisible(expeditionText, visible)
        if visible then SetText(expeditionText, text) end
        if riskAccept then
            SetAbsPoint(riskAccept, FRAMEPOINT_TOP, 0.072, top - height - 0.010)
            SetVisible(riskAccept, visible and not choosing and not SurvivorUI.IsNarrativeVisible()
                and SurvivorExpedition.RiskOffer() ~= nil)
        end
    end
    local introRoot, introTitle, introText, introContent, introSkip, introReady, caption, introFooter, storyPosition
    local revealTimer, revealGeneration = nil, 0
    local function DialogueAmbience(enabled)
        if SurvivorStage and SurvivorStage.SetDialogueAmbience then
            pcall(SurvivorStage.SetDialogueAmbience, enabled, "ui")
        end
    end
    local function CancelReveal()
        revealGeneration = revealGeneration + 1
        local timer = revealTimer
        revealTimer = nil
        if timer then
            local paused, pauseError = pcall(PauseTimer, timer)
            local destroyed, destroyError = pcall(DestroyTimer, timer)
            if not paused or not destroyed then error(tostring(pauseError or destroyError)) end
        end
    end
    local function CancelPreparationCountdown()
        preparationGeneration = preparationGeneration + 1
        local timer = preparationTimer
        preparationTimer = nil
        if timer then
            local paused, pauseError = pcall(PauseTimer, timer)
            local destroyed, destroyError = pcall(DestroyTimer, timer)
            if not paused or not destroyed then error(tostring(pauseError or destroyError)) end
        end
    end
    local function RenderPreparationVisibility()
        local waiting = preparationReady ~= nil and preparationTimer == nil
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
        Attempt(StopPreparation)
        -- Return selection to the gameplay hero while the native HUD is still hidden.
        -- A portrait proxy must not be selected when the gameplay containers reopen.
        if close then Attempt(close) end
        for _, frame in pairs({introRoot, introContent, introSkip, caption, sceneSkip, introFooter, storyPosition}) do
            Attempt(BlzFrameSetVisible, frame, false)
        end
        Attempt(RestoreCinematicFrames)
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
            if revealTimer ~= timer or generation ~= revealGeneration or not conversation or not introReady then return end
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
    local resultTabs, resultPages = {}, {}
    -- Leave room for the tall Reforged console decorations below the choice controls.
    local cardTop, cardHeight = -0.043, 0.24

    function SurvivorUI.ClearDamageBoard()
        RestoreDamageBoardMinimize()
        for _, row in pairs(damageCells) do
            for _, item in pairs(row) do MultiboardReleaseItem(item) end
        end
        if damageBoard then DestroyMultiboard(damageBoard); damageBoard = nil end
        damageCells, damageValues, damageRowCount, damageBuild, damageTitle = {}, {}, nil, nil, nil
        damageBoardVisible, damageBoardExpanded = nil, false
        bossSnapshot = nil
        wardTextCache = nil
        essentialLayout = nil
        if essentialRoot then SetVisible(essentialRoot, false) end
    end
    local function CombatHUDVisible()
        return RunSession.IsRunning() and not nativeInventoryVisible and not choosing and not SurvivorUI.IsNarrativeVisible()
            and not (SurvivorLootUI and SurvivorLootUI.IsExpanded())
    end
    local function DisplayDamageBoard(visible, quiet)
        if essentialRoot and not (visible and CombatHUDVisible()) then SetVisible(essentialRoot, false) end
        if damageBoard and GetLocalPlayer() == Player(SurvivorConfig.playerId) then
            local shown = visible and CombatHUDVisible()
            if shown and quiet then
                -- Read the user's native corner toggle once, including false.
                if damageBoardOriginalMinimized == nil then
                    damageBoardOriginalMinimized = IsMultiboardMinimized(damageBoard)
                end
                if not IsMultiboardMinimized(damageBoard) then MultiboardMinimize(damageBoard, true) end
            else RestoreDamageBoardMinimize() end
            if damageBoardVisible ~= shown then MultiboardDisplay(damageBoard, shown); damageBoardVisible = shown end
        end
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
        StopIntro() -- Consume before callbacks, including a second click in the same tick.
        DisplayDamageBoard(true)
        if callback then callback() end
        if SurvivorLootUI then SurvivorLootUI.Refresh() end
    end
    function SurvivorUI.IsNarrativeVisible() return introReady ~= nil or preparationReady ~= nil end
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
            if preparationTimer ~= timer or preparationGeneration ~= generation or not preparationReady then return end
            local ok, message = pcall(function()
                if preparationCheck and not preparationCheck() then
                    SurvivorUI.InterruptCombatPreparation()
                    return
                end
                remaining = remaining - 1
                if remaining > 0 then
                    SetText(preparationCountdown, "|cffffcc00수색 시작까지\n" .. remaining .. "|r")
                else
                    local callback = preparationReady
                    StopPreparation() -- Consume the callback before gameplay or a replacement screen.
                    DisplayDamageBoard(true)
                    callback()
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
        ApplyCinematicFrames("conversation") -- Selection can make the command/inventory containers visible again.
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
    local widths = {0.105, 0.048, 0.052, 0.037, 0.052, 0.046}
    local headings = {"무기", "이번 단계", "누적 피해", "DPS", "보스 누적", "둔화(초)"}
    local function PrepareDamageCells(weaponCount)
        if damageRowCount == weaponCount + 1 then return end
        -- Allocate/release handles on every client, outside native local folding checks.
        for _, row in pairs(damageCells) do
            for _, item in pairs(row) do MultiboardReleaseItem(item) end
        end
        damageCells, damageValues, damageRowCount = {}, {}, weaponCount + 1
        MultiboardSetRowCount(damageBoard, damageRowCount)
        for row = 0, weaponCount do
            damageCells[row], damageValues[row] = {}, {}
            for column = 0, 5 do
                local item = MultiboardGetItem(damageBoard, row, column)
                damageCells[row][column] = item
                MultiboardSetItemStyle(item, true, row > 0 and column == 0)
                MultiboardSetItemWidth(item, widths[column + 1])
                MultiboardSetItemValueColor(item, 255, row == 0 and 210 or 255, row == 0 and 100 or 255, 255)
                if row == 0 then MultiboardSetItemValue(item, headings[column + 1]) end
            end
        end
    end
    local function RenderDamageCells(rows)
        for row, data in ipairs(rows) do
            local cells, cached = damageCells[row], damageValues[row]
            if cells then
                local entry = SurvivorAugments.Get(data.id)
                local values = {entry.name .. (damageBuild.evolutions[data.id] and " *" or " " .. SurvivorAugments.Level(damageBuild, data.id)),
                    string.format("%.0f", data.stageDamage), string.format("%.0f", data.damage), string.format("%.1f", data.dps),
                    string.format("%.0f", data.bossDamage), string.format("%.1f", data.slowSeconds)}
                for column = 0, 5 do
                    if cached[column] ~= values[column + 1] then
                        MultiboardSetItemValue(cells[column], values[column + 1]); cached[column] = values[column + 1]
                    end
                end
                if cached.icon ~= entry.icon then MultiboardSetItemIcon(cells[0], entry.icon); cached.icon = entry.icon end
            end
        end
    end
    local function RefreshDamageExpansion(refresh)
        if GetLocalPlayer() ~= Player(SurvivorConfig.playerId) then return end
        local expanded = damageBoard ~= nil and damageBuild ~= nil and damageBoardVisible and not IsMultiboardMinimized(damageBoard)
        if expanded and (refresh or not damageBoardExpanded) then
            -- The 0.1-second UI observer fills newly expanded rows immediately.
            -- Only text setters run locally; cell handles were acquired synchronously.
            RenderDamageCells(SurvivorCombat.DamageRows(damageBuild.weapons))
        end
        damageBoardExpanded = expanded == true
    end
    function SurvivorUI.UpdateSpeech()
        HideNativeHUD()
        if cinematicMode then ApplyCinematicFrames(cinematicMode)
        elseif next(cinematicSaved) ~= nil then RestoreCinematicFrames() end
        local elapsed = RunSession.GetElapsed()
        local dt = math.max(0, elapsed - speechClock)
        speechClock = elapsed
        local active = CombatHUDVisible()
        if active then
            local oldAlertCount = #alerts
            for i = #alerts, 1, -1 do if alerts[i].expires <= elapsed then table.remove(alerts, i) end end
            if #alerts > 0 and #alerts ~= oldAlertCount then RenderAlerts()
            elseif #alerts == 0 and oldAlertCount > 0 then
                notice, deferredNotice = deferredNotice, nil
                if notice then SetText(noticeText, notice.text) end
            end
            if notice and not notice.urgent then
                notice.remaining = notice.remaining - dt
                if notice.remaining <= 0 then
                    notice, deferredNotice = deferredNotice, nil
                    if notice then SetText(noticeText, notice.text) end
                end
            end
            if speech and not (notice and notice.urgent) then
                speech.remaining = speech.remaining - dt
                if speech.remaining <= 0 then speech = nil end
            end
            if not speech and #speechQueue > 0 and not (notice and notice.urgent) then
                speech = table.remove(speechQueue, 1)
                BlzFrameSetText(speechName, "|cffffcc00" .. speech.speaker .. "|r")
                BlzFrameSetText(speechText, speech.text)
            end
        end
        local visible = active and speech ~= nil and not (notice and notice.urgent)
        local quiet = visible or (active and notice ~= nil and notice.urgent == true)
        speechVisible = visible
        DisplayDamageBoard(active, quiet)
        if speechRoot then SetVisible(speechRoot, visible) end
        if noticeRoot then SetVisible(noticeRoot, active and notice ~= nil) end
        if noticeRoot then
            local height = NoticeHeight()
            SetAbsPoint(noticeRoot, FRAMEPOINT_TOPLEFT, 0.025, 0.515)
            SetSize(noticeRoot, 0.29, height)
            SetSize(noticeText, 0.254, height - 0.028)
        end
        UpdateBossHUD(active)
        SurvivorUI.UpdateExpedition()
        RefreshDamageExpansion()
    end
    function SurvivorUI.UpdateDamageBoard(build, stage, stageElapsed, rerolls, difficultyId)
        if not damageBoard then
            damageBoard = CreateMultiboard()
            MultiboardSetColumnCount(damageBoard, 6)
            -- The native corner control owns folding; no duplicate custom button.
            MultiboardMinimize(damageBoard, true)
            DisplayDamageBoard(true)
        end
        damageBuild = build
        -- Gameplay registers every owned weapon before publishing this build.
        -- Row handles stay synchronized; dynamic statistics are read only when shown.
        PrepareDamageCells(#build.weapons)
        local remaining = math.max(0, SurvivorConfig.duration - stageElapsed)
        local difficulty = SurvivorConfig.difficulties[difficultyId or "normal"]
        UpdateBossHUD(CombatHUDVisible())
        local title = string.format("%s S%d/%d · %d:%02d · 리롤 %d/%d", difficulty.name, stage, SurvivorConfig.stages,
            math.floor(remaining / 60), math.floor(remaining % 60), rerolls, SurvivorConfig.rerollCapacity)
        if damageTitle ~= title then
            MultiboardSetTitleText(damageBoard, title); damageTitle = title
        end
        RefreshDamageExpansion(true)
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
        local trigger = CreateTrigger()
        triggers[#triggers + 1] = trigger
        BlzTriggerRegisterFrameEvent(trigger, frame, event)
        TriggerAddAction(trigger, function()
            if GetTriggerPlayer() ~= Player(SurvivorConfig.playerId) then return end
            local ok, message = pcall(callback)
            if not ok then RunSession.Fail(message) end
        end)
    end
    local function ReleaseFocus(frame)
        BlzFrameSetEnable(frame, false)
        BlzFrameSetEnable(frame, true)
    end
    local function Backdrop(parent, template, context, width, height)
        -- The backdrop owns its geometry and the clickable content, as in the
        -- original visible panel. Do not put it under a BUTTON at frame level 0.
        local skin = BlzCreateFrame(template, parent, 0, context)
        assert(skin ~= nil and GetHandleId(skin) ~= 0, "Missing UI backdrop: " .. template)
        BlzFrameSetSize(skin, width, height)
        BlzFrameSetAlpha(skin, 255)
        BlzFrameSetLevel(skin, 2)
        BlzFrameSetVisible(skin, true)
        return skin
    end
    local function FramedPanel(parent, name, context, width, height)
        local frame = BlzCreateFrameByType("FRAME", name, parent, "", 0)
        BlzFrameSetSize(frame, width, height)
        BlzFrameSetEnable(frame, false)
        local skin = Backdrop(frame, "CustomTooltipBackgroundTemplate", context, width, height)
        BlzFrameSetAllPoints(skin, frame)
        BlzFrameSetLevel(skin, 1)
        BlzFrameSetEnable(skin, false)
        return frame
    end
    local function RenderResultPage(index)
        if not resultPages[index] then return end
        if index == 5 and #journalChapters > 0 then
            journalPages = journalChapters[journalChapter].pages
            journalIndex = math.min(journalIndex, #journalPages)
            resultPages[5] = "|cffffcc00" .. journalChapters[journalChapter].title .. "|r\n\n" .. journalPages[journalIndex]
        end
        currentResultPage = index
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
        if not initialized then return end
        -- Reuse the one map-lifetime handle after a failed run; never duplicate it.
        if speechTimer == nil then speechTimer = CreateTimer(); speechTimerPaused = true end
        if speechTimerPaused then
            frameCache = {}
            TimerStart(speechTimer, 0.1, true, SpeechTick)
            speechTimerPaused = false
        end
    end
    function SurvivorUI.Init(onChoose, onRestart, onReroll, onNextStage, onExclude)
        if initialized then return end
        assert(BlzLoadTOCFile("CustomTooltip.toc"), "Missing tooltip panel templates")
        -- Acquire native handles on every client before changing local visibility.
        -- Keep native button enable states: hiding the upper bar leaves F10 usable.
        CacheHiddenNativeFrame(BlzGetFrameByName("UpperButtonBarFrame", 0))
        CacheHiddenNativeFrame(BlzGetFrameByName("ResourceBarFrame", 0))
        -- Reforged 2.0 added separate top art. Do not hide the bottom console parents.
        CacheHiddenNativeFrame(BlzGetFrameByName("ConsoleTopBar", 0))
        -- Tasyen's Big UI-Frame Tutorial (1.32.6+) identifies the clock at [5][0].
        -- Its parent also contains the minimap, so cache only the clock itself.
        local gameUI = BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0)
        CacheHiddenNativeFrame(NativeChild(NativeChild(gameUI, 5), 0))
        -- common.j defines the minimap origins; Tasyen lists buttons 0..4,
        -- MiniMapFrame and MinimapButtonBar. Leave the shared clock/minimap parent visible.
        CacheHiddenNativeFrame(BlzGetOriginFrame(ORIGIN_FRAME_MINIMAP, 0))
        CacheHiddenNativeFrame(BlzGetFrameByName("MiniMapFrame", 0))
        CacheHiddenNativeFrame(BlzGetFrameByName("MinimapButtonBar", 0))
        for i = 0, 4 do CacheHiddenNativeFrame(BlzGetOriginFrame(ORIGIN_FRAME_MINIMAP_BUTTON, i)) end
        HideNativeHUD()
        chooseCallback, restartCallback, rerollCallback, nextCallback = onChoose, onRestart, onReroll, onNextStage
        excludeCallback = onExclude
        -- ConsoleUIBackdrop is above world HP bars; GameUI children can be below them.
        local parent = BlzGetFrameByName("ConsoleUIBackdrop", 0)
        parentName = "ConsoleUIBackdrop"
        if not ValidNativeFrame(parent) then
            parent = BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0)
            parentName = "GameUI"
        end
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
        expeditionText = BlzCreateFrameByType("TEXT", "HeroSurvivorExpedition", parent, "", 0)
        BlzFrameSetAbsPoint(expeditionText, FRAMEPOINT_TOPLEFT, 0.025, 0.515)
        BlzFrameSetSize(expeditionText, 0.255, 0.041)
        BlzFrameSetTextAlignment(expeditionText, TEXT_JUSTIFY_TOP, TEXT_JUSTIFY_LEFT)
        BlzFrameSetEnable(expeditionText, false)
        BlzFrameSetVisible(expeditionText, false)
        speechRoot = FramedPanel(parent, "HSSpeech", 710, 0.54, 0.084)
        BlzFrameSetAbsPoint(speechRoot, FRAMEPOINT_CENTER, 0.4, 0.235)
        BlzFrameSetSize(speechRoot, 0.54, 0.084)
        BlzFrameSetLevel(speechRoot, 18)
        BlzFrameSetEnable(speechRoot, false)
        speechName = Text(speechRoot, "HSSpeechName", 0.492, 0.019, 0, -0.014)
        speechText = Text(speechRoot, "HSSpeechText", 0.492, 0.035, 0, -0.035)
        BlzFrameSetLevel(speechName, 3)
        BlzFrameSetLevel(speechText, 3)
        BlzFrameSetTextAlignment(speechText, TEXT_JUSTIFY_TOP, TEXT_JUSTIFY_LEFT)
        noticeRoot = FramedPanel(parent, "HSNotice", 711, 0.29, 0.042)
        BlzFrameSetAbsPoint(noticeRoot, FRAMEPOINT_TOPLEFT, 0.025, 0.515)
        BlzFrameSetLevel(noticeRoot, 15)
        BlzFrameSetEnable(noticeRoot, false)
        noticeText = Text(noticeRoot, "HSNoticeText", 0.254, 0.014, 0, -0.014)
        BlzFrameSetLevel(noticeText, 3)
        BlzFrameSetTextAlignment(noticeText, TEXT_JUSTIFY_TOP, TEXT_JUSTIFY_LEFT)
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
        shade = BlzCreateFrameByType("BACKDROP", "HeroSurvivorShade", parent, "", 0)
        BlzFrameSetAbsPoint(shade, FRAMEPOINT_CENTER, 0.4, 0.3)
        BlzFrameSetSize(shade, 1.6, 0.6)
        BlzFrameSetTexture(shade, "UI\\Widgets\\ToolTips\\Human\\human-tooltip-background.blp", 0, true)
        BlzFrameSetEnable(shade, false)
        BlzFrameSetLevel(shade, 9)
        -- Transparent layout root: each choice has its own separate card background.
        panel = BlzCreateFrameByType("FRAME", "HeroSurvivorChoiceRoot", parent, "", 0)
        BlzFrameSetAbsPoint(panel, FRAMEPOINT_CENTER, 0.4, 0.34)
        BlzFrameSetSize(panel, 0.74, 0.46)
        BlzFrameSetLevel(panel, 10)
        resultBackdrop = Backdrop(panel, "CustomTooltipBackgroundTemplate", 0, 0.60, 0.35)
        BlzFrameSetPoint(resultBackdrop, FRAMEPOINT_CENTER, panel, FRAMEPOINT_CENTER, 0, 0)
        BlzFrameSetLevel(resultBackdrop, 1)
        SetVisible(resultBackdrop, false)
        resultHeading = Text(resultBackdrop, "HeroSurvivorResultHeading", 0.55, 0.028, 0, -0.020)
        resultNote = Text(resultBackdrop, "HeroSurvivorResultNote", 0.55, 0.165, 0, -0.082)
        BlzFrameSetLevel(resultHeading, 3)
        BlzFrameSetLevel(resultNote, 3)
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
        heading = Text(panel, "HeroSurvivorHeading", 0.68, 0.04, 0, -0.005)
        note = Text(panel, "HeroSurvivorNote", 0.70, 0.016, 0, -0.355)
        rerollCounter = Text(panel, "HeroSurvivorRerollCount", 0.26, 0.021, -0.065, -0.328)
        BlzFrameSetLevel(rerollCounter, 5)
        for i = 1, SurvivorConfig.rerollCapacity do
            local pip = BlzCreateFrameByType("BACKDROP", "HeroSurvivorRerollPip" .. i, panel, "", 0)
            BlzFrameSetSize(pip, 0.011, 0.011)
            BlzFrameSetPoint(pip, FRAMEPOINT_TOP, panel, FRAMEPOINT_TOP, 0.08 + (i - 1) * 0.016, -0.332)
            BlzFrameSetTexture(pip, "ReplaceableTextures\\CommandButtons\\BTNReincarnation.blp", 0, true)
            BlzFrameSetEnable(pip, false)
            BlzFrameSetLevel(pip, 5)
            rerollPips[i] = pip
        end
        BlzFrameSetLevel(heading, 5)
        BlzFrameSetLevel(note, 5)
        for i = 1, 3 do
            local slot = i
            local frame = Backdrop(panel, "EscMenuBackdrop", 100 + i, 0.212, cardHeight)
            BlzFrameSetPoint(frame, FRAMEPOINT_TOP, panel, FRAMEPOINT_TOP, (i - 2) * 0.23, cardTop)
            local button = BlzCreateFrameByType("BUTTON", "HeroSurvivorCard" .. i, frame, "", 0)
            BlzFrameSetSize(button, 0.212, cardHeight)
            BlzFrameSetPoint(button, FRAMEPOINT_CENTER, frame, FRAMEPOINT_CENTER, 0, 0)
            -- A plain BUTTON has no template-provided mouse-over glow.
            local icon = BlzCreateFrameByType("BACKDROP", "HeroSurvivorIcon" .. i, button, "", 0)
            BlzFrameSetSize(icon, 0.06, 0.06)
            BlzFrameSetPoint(icon, FRAMEPOINT_TOP, button, FRAMEPOINT_TOP, 0, -0.018)
            BlzFrameSetEnable(icon, false)
            -- Sibling buttons stay outside the card's selection hit area.
            local rerollFrame = Backdrop(panel, "QuestButtonBaseTemplate", 200 + i, 0.108, 0.03)
            BlzFrameSetPoint(rerollFrame, FRAMEPOINT_TOP, frame, FRAMEPOINT_BOTTOM, -0.052, -0.01)
            local reroll = BlzCreateFrameByType("BUTTON", "HeroSurvivorReroll" .. i, rerollFrame, "", 0)
            BlzFrameSetSize(reroll, 0.108, 0.03)
            BlzFrameSetPoint(reroll, FRAMEPOINT_CENTER, rerollFrame, FRAMEPOINT_CENTER, 0, 0)
            local excludeFrame = Backdrop(panel, "QuestButtonBaseTemplate", 400 + i, 0.09, 0.03)
            BlzFrameSetPoint(excludeFrame, FRAMEPOINT_TOP, frame, FRAMEPOINT_BOTTOM, 0.059, -0.01)
            local exclude = BlzCreateFrameByType("BUTTON", "HeroSurvivorExclude" .. i, excludeFrame, "", 0)
            BlzFrameSetAllPoints(exclude, excludeFrame)
            cards[i] = {frame = frame, button = button, icon = icon, rerollFrame = rerollFrame,
                excludeFrame = excludeFrame, exclude = exclude,
                excludeText = Text(exclude, "HeroSurvivorExcludeText" .. i, 0.082, 0.03, 0, 0),
                title = Text(button, "HeroSurvivorTitle" .. i, 0.185, 0.023, 0, -0.083),
                description = Text(button, "HeroSurvivorDescription" .. i, 0.178, 0.045, 0, -0.108),
                preview = Text(button, "HeroSurvivorPreview" .. i, 0.18, 0.035, 0, -0.157),
                hint = Text(button, "HeroSurvivorHint" .. i, 0.18, 0.015, 0, -0.197),
                reroll = reroll,
                rerollText = Text(reroll, "HeroSurvivorRerollText" .. i, 0.10, 0.03, 0, 0)}
            Bind(button, FRAMEEVENT_CONTROL_CLICK, function()
                if gearCallback and cards[slot].available then
                    local callback = gearCallback
                    gearCallback = nil
                    ReleaseFocus(button)
                    callback(slot)
                    return
                end
                if not choosing or not cards[slot].available then return end
                choosing = false
                ReleaseFocus(button)
                chooseCallback(slot)
            end)
            Bind(reroll, FRAMEEVENT_CONTROL_CLICK, function()
                if not choosing or not cards[slot].rerollAvailable then return end
                ReleaseFocus(reroll)
                rerollCallback(slot)
            end)
            Bind(exclude, FRAMEEVENT_CONTROL_CLICK, function()
                if not choosing or not cards[slot].excludeAvailable then return end
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
            if RunSession.GetState() == "FINISHED" then HeroSurvivor.RetrySame() end
        end)
        BlzFrameSetVisible(retrySame, false)
        BlzFrameSetVisible(panel, false)
        BlzFrameSetVisible(shade, false)
        introRoot = BlzCreateFrameByType("BACKDROP", "HeroSurvivorStageIntro", parent, "", 0)
        BlzFrameSetAbsPoint(introRoot, FRAMEPOINT_CENTER, 0.4, 0.3)
        BlzFrameSetSize(introRoot, 2.4, 0.6)
        BlzFrameSetTexture(introRoot, "HeroSurvivorUI\\Black.tga", 0, true)
        BlzFrameSetLevel(introRoot, 20)
        BlzFrameSetEnable(introRoot, false)
        -- Text/buttons are siblings: fading the backdrop must not fade the dialogue.
        introContent = BlzCreateFrameByType("FRAME", "HeroSurvivorStoryContent", parent, "", 0)
        BlzFrameSetAbsPoint(introContent, FRAMEPOINT_CENTER, 0.4, 0.3)
        BlzFrameSetSize(introContent, 0.8, 0.6)
        BlzFrameSetLevel(introContent, 22)
        caption = FramedPanel(parent, "HeroSurvivorCaption", 712, 0.54, 0.166)
        BlzFrameSetAbsPoint(caption, FRAMEPOINT_CENTER, 0.4, 0.30)
        BlzFrameSetLevel(caption, 21)
        BlzFrameSetEnable(caption, false)
        introTitle = Text(introContent, "HeroSurvivorStageTitle", 0.7, 0.05, 0, -0.11)
        introText = Text(introContent, "HeroSurvivorStageText", 0.7, 0.13, 0, -0.18)
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
        -- Keep the live hero and the arena visible to the left of this preparation panel.
        preparationRoot = FramedPanel(parent, "HSCombatPreparation", 714, 0.35, 0.40)
        BlzFrameSetAbsPoint(preparationRoot, FRAMEPOINT_TOPRIGHT, 0.78, 0.585)
        BlzFrameSetLevel(preparationRoot, 24)
        preparationTitle = Text(preparationRoot, "HSCombatPreparationTitle", 0.31, 0.033, 0, -0.016)
        preparationMission = Text(preparationRoot, "HSCombatPreparationMission", 0.31, 0.046, 0, -0.056)
        preparationRecord = Text(preparationRoot, "HSCombatPreparationRecord", 0.31, 0.049, 0, -0.106)
        preparationHint = Text(preparationRoot, "HSCombatPreparationHint", 0.31, 0.072, 0, -0.160)
        preparationLoadout = Text(preparationRoot, "HSCombatPreparationLoadout", 0.31, 0.049, 0, -0.237)
        preparationFooter = Text(preparationRoot, "HSCombatPreparationFooter", 0.31, 0.049, 0, -0.291)
        for _, frame in ipairs({preparationTitle, preparationMission, preparationRecord,
            preparationHint, preparationLoadout, preparationFooter}) do
            BlzFrameSetLevel(frame, 3)
            BlzFrameSetTextAlignment(frame, TEXT_JUSTIFY_TOP, TEXT_JUSTIFY_LEFT)
        end
        preparationButton = BlzCreateFrameByType("GLUETEXTBUTTON", "HSCombatPreparationStart", parent, "ScriptDialogButton", 0)
        BlzFrameSetPoint(preparationButton, FRAMEPOINT_TOP, preparationRoot, FRAMEPOINT_TOP, 0, -0.353)
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
        StopIntro()
        initialized = true
        -- One map-lifetime UI timer. Reading duration follows the paused run clock.
        SurvivorUI.BeginRun()
    end
    local function PrepareNarrative(title, text, onReady, footer, buttonLabel)
        SurvivorUI.HidePanel()
        SurvivorUI.ClearSpeech()
        DisplayDamageBoard(false)
        if essentialRoot then SetVisible(essentialRoot, false) end
        if riskAccept then SetVisible(riskAccept, false) end
        -- Native timed messages can render above the cinematic caption.
        if GetLocalPlayer() == Player(SurvivorConfig.playerId) then ClearTextMessages() end
        introReady = onReady
        DialogueAmbience(true)
        ApplyCinematicFrames("intro")
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
        local theme = SurvivorStage.Get(index)
        local text = index == 1 and SurvivorStory.premise or theme.mission
        local footer = index == 1 and ("우클릭 이동 · 무기는 자동 공격 · F10 메뉴\n" .. SurvivorStory.notice) or theme.hint
        SurvivorUI.ShowNarrative(string.format("%s\n%d / 5 · %s", SurvivorStory.title, index, theme.name),
            text, index == 1 and function()
                SurvivorStory.ShowBriefing(hero, onReady)
            end or onReady, footer, index == 1 and "장면 보기" or "수색 준비")
    end
    function SurvivorUI.ShowCombatPreparation(index, details, onReady, canStart)
        assert(type(onReady) == "function", "Combat preparation needs a start callback")
        SurvivorUI.HidePanel()
        SurvivorUI.ClearSpeech()
        DisplayDamageBoard(false)
        local theme = SurvivorStage.Get(index)
        details = details or {}
        preparationReady, preparationCheck = onReady, canStart
        SetText(preparationTitle, string.format("|cffffcc00%d / %d · %s\n수색 준비|r", index, SurvivorConfig.stages, theme.name))
        SetText(preparationMission, "|cff9bdbc0이번 목표|r\n" .. theme.mission)
        SetText(preparationRecord, "|cffc4b2df수색 기록|r\n" .. (details.record or "흔적을 따라 다음 길목으로 향합니다."))
        SetText(preparationHint, "|cffffcc00구역 안내|r\n" .. theme.hint)
        SetText(preparationLoadout, details.loadout or "우클릭 이동 · 무기는 자동 공격")
        SetText(preparationFooter, "‘수색 시작’을 누르기 전까지 전투와 시간이 멈춥니다.\n누른 뒤 3초 동안 주변을 살펴보세요.")
        RenderPreparationVisibility()
        if SurvivorLootUI then SurvivorLootUI.Refresh() end
    end
    function SurvivorUI.HidePanel()
        if SurvivorSetupUI then SurvivorSetupUI.Hide() end
        StopIntro()
        gearCallback = nil
        choosing, restVisible = false, false
        if initialized then
            BlzFrameSetVisible(panel, false)
            BlzFrameSetVisible(shade, false)
        end
        DisplayDamageBoard(true)
    end
    local function SetRerollsVisible(visible)
        BlzFrameSetVisible(rerollCounter, visible)
        for _, pip in ipairs(rerollPips) do BlzFrameSetVisible(pip, visible) end
    end
    local function LayoutCardText(card, evolution)
        BlzFrameSetSize(card.description, 0.178, evolution and 0.065 or 0.045)
        BlzFrameClearAllPoints(card.preview)
        BlzFrameSetSize(card.preview, 0.18, evolution and 0.015 or 0.035)
        BlzFrameSetPoint(card.preview, FRAMEPOINT_TOP, card.button, FRAMEPOINT_TOP, 0, evolution and -0.177 or -0.157)
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
                LayoutCardText(card, false)
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
        BlzFrameSetVisible(panel, true)
        BlzFrameSetVisible(shade, true)
        BlzFrameSetAlpha(shade, 185)
    end
    function SurvivorUI.SetRestInventoryVisible(open)
        nativeInventoryVisible = open == true
        if preparationReady then RenderPreparationVisibility() end
        -- Hide local HUD immediately even while the synchronized pause is still in flight.
        if nativeInventoryVisible and essentialRoot then SetVisible(essentialRoot, false) end
        if not restVisible then return end
        -- Only presentation follows local native panel visibility; the rest pause stays synchronized.
        SetVisible(resultBackdrop, not open)
    end
    function SurvivorUI.ShowChoices(offers, rewardLevel, build, remaining, rerollsRemaining)
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
                LayoutCardText(card, augment.kind == "evolution")
                BlzFrameSetTexture(card.icon, augment.icon, 0, true)
                BlzFrameSetText(card.title, (weapon and "|cffffd77d" or "|cff8adbe8") .. (augment.element and ("[" .. augment.element .. "] ") or "") .. augment.name .. "|r")
                BlzFrameSetText(card.description, SurvivorAugments.ChoiceLabel(id, build) .. "\n" .. augment.text)
                BlzFrameSetText(card.preview, augment.kind == "evolution" and "추가 슬롯 필요 없음 · 선택 후 변경 불가" or SurvivorAugments.Preview(id, build))
                BlzFrameSetText(card.hint, "클릭하여 선택")
            end
        end
        choosing = true
        BlzFrameSetVisible(shade, true)
        BlzFrameSetAlpha(shade, 185)
        BlzFrameSetVisible(panel, true)
    end
    function SurvivorUI.ShowResult(reason, elapsed, kills, stage, bossTime, report, details)
        StopIntro()
        SurvivorUI.ClearSpeech()
        journalPages, journalIndex, currentResultPage = {}, 1, 1
        journalChapters, journalChapter = {}, 1
        resultTabs[5].label = "수색"
        choosing, restVisible = false, reason == "stage_clear"
        SetRerollsVisible(false)
        DisplayDamageBoard(true)
        local title = reason == "survived" and "생존 성공!" or reason == "defeated" and "다시 도전해 보세요" or "플레이 종료"
        if reason == "boss_defeated" then title = "수색 완료 · 이름 없는 생존자" end
        if reason == "stage_clear" then title = "경로 확보 · " .. SurvivorStage.Get(stage).name end
        if reason == "timeout" then title = "시간 초과 · 스테이지 보스 미처치" end
        if reason == "error" then title = "실행 오류 · 게임 메시지를 확인하세요" end
        BlzFrameSetVisible(heading, false)
        BlzFrameSetVisible(note, false)
        BlzFrameSetText(resultHeading, "|cffffcc00" .. title .. "|r")
        local summary = string.format("스테이지 %d/%d · 총 시간 %d:%02d · 처치 %d", stage or 1, SurvivorConfig.stages, math.floor(elapsed / 60), math.floor(elapsed % 60), kills)
        if details then summary = details.difficulty .. " · 종료 레벨 " .. details.level .. "\n" .. summary end
        if reason == "stage_clear" then summary = summary .. "\n휴식: 확장 인벤토리에서 장비 정리\n남은 장비는 다음 시작 지점에 보존 · 리롤 +1(최대 5)" end
        if bossTime then summary = summary .. string.format("\n보스 전투 %.1f초", bossTime) end
        resultPages = {summary .. "\n" .. (report or "")}
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
        BlzFrameSetVisible(retrySame, reason ~= "stage_clear" and HeroSurvivor.CanRetrySame())
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
        if not initialized or GetLocalPlayer() ~= Player(SurvivorConfig.playerId) then return end
        print(string.format("[HeroSurvivor UI difficulty-v7] parent=%s visible=%s choosing=%s",
            parentName, tostring(BlzFrameIsVisible(panel)), tostring(choosing)))
        for i, card in ipairs(cards) do
            print(string.format("[card %d] visible=%s size=%.3fx%.3f alpha=%d",
                i, tostring(BlzFrameIsVisible(card.frame)), BlzFrameGetWidth(card.frame),
                BlzFrameGetHeight(card.frame), BlzFrameGetAlpha(card.frame)))
        end
    end
end
