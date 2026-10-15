-- Map-lifetime preparation UI. Gameplay owns the selections and start guard.
SurvivorSetupUI = {}
do
    local root, shade, title, footer, menu, options, startButton, back, previous, following, pageText
    local menuButtons, cards, triggers = {}, {}, {}
    local view, category, selectedId, page, entries, startingWeapon
    local openCallback, selectCallback, backCallback, startCallback
    local summaryToggle
    local labels = {DIFFICULTY = "난이도", WEAPON = "시작 무기", TRINKET = "시작 장신구"}
    local kinds = {"DIFFICULTY", "WEAPON", "TRINKET"}
    local function Text(parent, name, width, height, x, y)
        local text = BlzCreateFrameByType("TEXT", name, parent, "", 0)
        BlzFrameSetSize(text, width, height)
        BlzFrameSetPoint(text, FRAMEPOINT_TOP, parent, FRAMEPOINT_TOP, x, y)
        BlzFrameSetTextAlignment(text, TEXT_JUSTIFY_MIDDLE, TEXT_JUSTIFY_CENTER)
        BlzFrameSetEnable(text, false)
        return text
    end
    local function LeftText(parent, name, width, height, x, y)
        local frame = Text(parent, name, width, height, 0, 0)
        BlzFrameClearAllPoints(frame)
        BlzFrameSetPoint(frame, FRAMEPOINT_TOPLEFT, parent, FRAMEPOINT_TOPLEFT, x, y)
        BlzFrameSetTextAlignment(frame, TEXT_JUSTIFY_MIDDLE, TEXT_JUSTIFY_LEFT)
        return frame
    end
    local function Button(parent, name, width, height, x, y, callback)
        -- Native button artwork on a glue control, without command-button focus.
        -- Keep our own text children so icon rows and navigation share one helper.
        local button = BlzCreateFrameByType("GLUETEXTBUTTON", name, parent, "ScriptDialogButton", 0)
        BlzFrameSetText(button, "")
        BlzFrameSetSize(button, width, height)
        BlzFrameSetPoint(button, FRAMEPOINT_TOP, parent, FRAMEPOINT_TOP, x, y)
        BlzFrameSetLevel(button, 3)
        local text = Text(button, name .. "Label", width - 0.03, height - 0.018, 0, -0.009)
        local trigger = CreateTrigger()
        triggers[#triggers + 1] = trigger
        BlzTriggerRegisterFrameEvent(trigger, button, FRAMEEVENT_CONTROL_CLICK)
        TriggerAddAction(trigger, function()
            if GetTriggerPlayer() ~= Player(SurvivorConfig.playerId) then return end
            local ok, message = pcall(callback)
            if not ok then RunSession.Fail(message) end
        end)
        return {frame = button, button = button, text = text}
    end
    function SurvivorSetupUI.Hide()
        view = nil
        if root then BlzFrameSetVisible(root, false); BlzFrameSetVisible(shade, false) end
    end
    local function Show()
        SurvivorUI.HidePanel()
        SurvivorUI.ClearDamageBoard()
        BlzFrameSetVisible(root, true)
        BlzFrameSetVisible(shade, true)
        BlzFrameSetAlpha(shade, 255)
    end
    local function RenderOptions()
        local pages = math.ceil(#entries / 6)
        BlzFrameSetText(title, "|cffffcc00" .. labels[category] .. " 선택|r")
        BlzFrameSetText(footer, category == "DIFFICULTY" and "처치한 적만큼 경험치를 획득합니다."
            or "선택하면 준비 화면으로 돌아갑니다. 시작 전까지 변경할 수 있습니다.")
        BlzFrameSetText(pageText, string.format("%d / %d", page, pages))
        BlzFrameSetVisible(pageText, pages > 1)
        BlzFrameSetVisible(previous.frame, pages > 1)
        BlzFrameSetVisible(following.frame, pages > 1)
        BlzFrameSetEnable(previous.button, page > 1)
        BlzFrameSetEnable(following.button, page < pages)
        for i, card in ipairs(cards) do
            local id = entries[(page - 1) * 6 + i]
            card.id = id
            local wide = category == "DIFFICULTY"
            local width, height = wide and 0.60 or 0.30, 0.070
            BlzFrameSetSize(card.frame, width, height)
            BlzFrameClearAllPoints(card.frame)
            BlzFrameSetPoint(card.frame, FRAMEPOINT_TOP, options, FRAMEPOINT_TOP,
                wide and 0 or (i % 2 == 1 and -0.158 or 0.158),
                wide and (-0.062 - (i - 1) * 0.080) or (-0.062 - math.floor((i - 1) / 2) * 0.080))
            BlzFrameSetSize(card.name, width - 0.072, 0.021)
            BlzFrameSetSize(card.description, width - 0.072, 0.034)
            BlzFrameSetVisible(card.frame, id ~= nil)
            if id then
                local entry = category == "DIFFICULTY" and SurvivorConfig.difficulties[id] or SurvivorAugments.Get(id)
                BlzFrameSetTexture(card.icon, entry.icon, 0, true)
                BlzFrameSetText(card.name, (id == selectedId and "|cff80ff80[선택됨] " or "|cffffcc00") .. entry.name .. "|r")
                local text = entry.text
                if category == "DIFFICULTY" then
                    text = string.format("등장 %.0f%% · 생명력 %.0f%% · 공격력 %.0f%%\n공격 속도 %.0f%% · 이동 속도 %.0f%%",
                        entry.spawn * 100, entry.life * 100, entry.damage * 100, entry.attackSpeed * 100, entry.moveSpeed * 100)
                elseif category == "TRINKET" then
                    -- Universal modifier only; never a single weapon-specific example.
                    text = SurvivorAugments.Preview(id, SurvivorAugments.NewBuild(startingWeapon or SurvivorConfig.startingWeapon))
                end
                BlzFrameSetText(card.description, text)
            end
        end
    end
    function SurvivorSetupUI.Init(onOpen, onSelect, onBack, onStart)
        if root then return end
        openCallback, selectCallback, backCallback, startCallback = onOpen, onSelect, onBack, onStart
        local parent = BlzGetFrameByName("ConsoleUIBackdrop", 0)
        if parent == nil or parent == 0 or GetHandleId(parent) == 0 then parent = BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0) end
        shade = BlzCreateFrameByType("BACKDROP", "HeroSurvivorSetupShade", parent, "", 0)
        BlzFrameSetAbsPoint(shade, FRAMEPOINT_CENTER, 0.4, 0.3)
        -- Cover the world at ultrawide ratios while leaving every setup control
        -- above this disabled, opaque backdrop. Hide owns both frame siblings.
        BlzFrameSetSize(shade, 2.4, 0.6)
        BlzFrameSetTexture(shade, "HeroSurvivorUI\\Black.tga", 0, true)
        BlzFrameSetEnable(shade, false)
        BlzFrameSetLevel(shade, 10)
        root = BlzCreateFrameByType("FRAME", "HeroSurvivorSetupRoot", parent, "", 0)
        BlzFrameSetAbsPoint(root, FRAMEPOINT_TOP, 0.4, 0.57)
        BlzFrameSetSize(root, 0.66, 0.40)
        BlzFrameSetLevel(root, 11)
        local background = BlzCreateFrame("EscMenuBackdrop", root, 0, 800)
        BlzFrameSetAllPoints(background, root)
        BlzFrameSetEnable(background, false)
        BlzFrameSetLevel(background, 0)
        title = Text(root, "HeroSurvivorSetupTitle", 0.59, 0.024, 0, -0.022)
        BlzFrameSetLevel(title, 3)
        -- Keep this frame unscaled: scaling also shifts its anchored offset and
        -- previously pulled the footer over the start button and last option row.
        footer = Text(root, "HeroSurvivorSetupFooter", 0.59, 0.018, 0, -0.350)
        BlzFrameSetLevel(footer, 3)
        menu = BlzCreateFrameByType("FRAME", "HeroSurvivorSetupMenu", root, "", 0)
        BlzFrameSetAllPoints(menu, root)
        BlzFrameSetLevel(menu, 2)
        local notice = Text(menu, "HeroSurvivorSetupNotice", 0.59, 0.018, 0, -0.051)
        BlzFrameSetText(notice, SurvivorStory.notice .. " · DE 그래픽 권장")
        for i, kind in ipairs(kinds) do
            local choice = kind
            menuButtons[i] = Button(menu, "HeroSurvivorSetup" .. kind, 0.54, 0.052, 0, -0.080 - (i - 1) * 0.062, function()
                if view == "MENU" then openCallback(choice) end
            end)
            local row = menuButtons[i]
            BlzFrameSetVisible(row.text, false)
            row.label = LeftText(row.button, "HeroSurvivorSetup" .. kind .. "Heading", 0.15, 0.028, 0.020, -0.012)
            BlzFrameSetText(row.label, labels[kind] .. " 선택")
            row.icon = BlzCreateFrameByType("BACKDROP", "HeroSurvivorSetup" .. kind .. "Icon", row.button, "", 0)
            BlzFrameSetSize(row.icon, 0.032, 0.032)
            BlzFrameSetPoint(row.icon, FRAMEPOINT_TOPLEFT, row.button, FRAMEPOINT_TOPLEFT, 0.180, -0.010)
            BlzFrameSetEnable(row.icon, false)
            row.value = LeftText(row.button, "HeroSurvivorSetup" .. kind .. "Value", 0.29, 0.028, 0.224, -0.012)
        end
        summaryToggle = Button(menu, "HSSummaryToggle", 0.36, 0.032, 0, -0.268, function()
            if view == "MENU" then HeroSurvivor.ToggleStorySummary() end
        end)
        startButton = Button(menu, "HeroSurvivorSetupStart", 0.30, 0.040, 0, -0.306, function()
            if view ~= "MENU" or not startButton.ready then return end
            SurvivorSetupUI.Hide()
            startCallback()
        end)
        options = BlzCreateFrameByType("FRAME", "HeroSurvivorSetupOptions", root, "", 0)
        BlzFrameSetAllPoints(options, root)
        BlzFrameSetLevel(options, 2)
        for i = 1, 6 do
            local slot = i
            local card = Button(options, "HeroSurvivorSetupOption" .. i, 0.30, 0.070,
                i % 2 == 1 and -0.158 or 0.158, -0.062 - math.floor((i - 1) / 2) * 0.080, function()
                    if view ~= "OPTIONS" or not cards[slot].id then return end
                    local kind, id = category, cards[slot].id
                    view = nil -- A queued second click cannot select twice.
                    selectCallback(kind, id)
                end)
            BlzFrameSetVisible(card.text, false)
            card.icon = BlzCreateFrameByType("BACKDROP", "HeroSurvivorSetupIcon" .. i, card.button, "", 0)
            BlzFrameSetSize(card.icon, 0.032, 0.032)
            BlzFrameSetPoint(card.icon, FRAMEPOINT_TOPLEFT, card.button, FRAMEPOINT_TOPLEFT, 0.014, -0.012)
            BlzFrameSetEnable(card.icon, false)
            card.name = LeftText(card.button, "HeroSurvivorSetupName" .. i, 0.228, 0.021, 0.058, -0.010)
            card.description = LeftText(card.button, "HeroSurvivorSetupDescription" .. i, 0.228, 0.034, 0.058, -0.033)
            BlzFrameSetScale(card.description, 0.85)
            cards[i] = card
        end
        back = Button(options, "HeroSurvivorSetupBack", 0.13, 0.030, -0.245, -0.305, function()
            if view == "OPTIONS" then backCallback() end
        end)
        BlzFrameSetText(back.text, "준비 화면")
        previous = Button(options, "HeroSurvivorSetupPrevious", 0.115, 0.030, 0.080, -0.305, function()
            if view == "OPTIONS" and page > 1 then page = page - 1; RenderOptions() end
        end)
        following = Button(options, "HeroSurvivorSetupFollowing", 0.115, 0.030, 0.245, -0.305, function()
            if view == "OPTIONS" and page * 6 < #entries then page = page + 1; RenderOptions() end
        end)
        BlzFrameSetText(previous.text, "이전")
        BlzFrameSetText(following.text, "다음")
        pageText = Text(options, "HeroSurvivorSetupPage", 0.10, 0.027, -0.030, -0.306)
        SurvivorSetupUI.Hide()
    end
    function SurvivorSetupUI.ShowMenu(difficulty, weapon, trinket)
        startingWeapon = weapon
        Show()
        view = "MENU"
        BlzFrameSetVisible(menu, true)
        BlzFrameSetVisible(options, false)
        BlzFrameSetText(title, "|cffffcc00" .. SurvivorStory.title .. "|r")
        BlzFrameSetText(summaryToggle.text, HeroSurvivor.IsStorySummary() and "이미 본 대화: 요약 보기" or "이미 본 대화: 전체 보기")
        local selected = {difficulty, weapon, trinket}
        for i, kind in ipairs(kinds) do
            local id = selected[i]
            local entry = id and (kind == "DIFFICULTY" and SurvivorConfig.difficulties[id] or SurvivorAugments.Get(id))
            local row = menuButtons[i]
            BlzFrameSetVisible(row.icon, entry ~= nil)
            if entry then BlzFrameSetTexture(row.icon, entry.icon, 0, true) end
            BlzFrameSetText(row.value, entry and "|cff80ff80" .. entry.name .. "|r" or "|cffcccccc선택하세요|r")
        end
        startButton.ready = difficulty ~= nil and weapon ~= nil and trinket ~= nil
        BlzFrameSetEnable(startButton.button, startButton.ready)
        BlzFrameSetText(startButton.text, startButton.ready and "|cffffcc00게임 시작|r" or "|cff888888게임 시작|r")
        BlzFrameSetText(footer, startButton.ready and "선택한 무기와 장신구를 각각 Lv.1로 보유하고 시작합니다." or "난이도·시작 무기·시작 장신구를 모두 선택하세요.")
    end
    function SurvivorSetupUI.ShowOptions(kind, selected)
        Show()
        view, category, selectedId, page = "OPTIONS", kind, selected, 1
        entries = kind == "DIFFICULTY" and SurvivorConfig.difficultyOrder
            or kind == "WEAPON" and SurvivorConfig.startingWeapons or SurvivorConfig.startingTrinkets
        for i, id in ipairs(entries) do if id == selected then page = math.floor((i - 1) / 6) + 1 end end
        BlzFrameSetVisible(menu, false)
        BlzFrameSetVisible(options, true)
        RenderOptions()
    end
end
