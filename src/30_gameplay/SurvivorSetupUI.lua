-- Map-lifetime preparation UI. Gameplay owns the selections and start guard.
-- Four panels: option list (left), hero/loadout summary and description (center),
-- hero preview (right top), reset/start (right bottom). Every choice stays visible.
SurvivorSetupUI = {}
do
    local root, shade, title, listTitle, heroName, description, descriptionTitle
    local status, startButton, resetButton, summaryToggle
    local heroButton, categoryButtons, cards, triggers = nil, {}, {}, {}
    local visible, category, hovered = false, "HERO", nil
    local selected = {}
    local openCallback, selectCallback, resetCallback, startCallback
    local previewUnit, previewSkin, previewSpot, previewTimer, savedBounds
    -- Opaque green frame: it sits behind the icon, slightly larger, so only its rim shows.
    local highlight = [[UI\Widgets\Console\Human\CommandButton\human-activebutton.blp]]
    local rim = 0.008
    local labels = {HERO = "영웅", DIFFICULTY = "난이도", WEAPON = "무기", TRINKET = "장신구"}
    local kinds = {"WEAPON", "TRINKET", "DIFFICULTY"}
    local listSize = 12
    -- Layout in 4:3 screen units. The console is hidden while setup is open, so the
    -- whole layout centers vertically below the upper menu bar.
    local rootTop, rootWidth, rootHeight = 0.515, 0.79, 0.43
    local panelTop, gap, listWidth, summaryWidth = -0.032, 0.005, 0.28, 0.28
    local previewX = listWidth + gap + summaryWidth + gap
    local previewWidth, previewHeight = rootWidth - previewX, 0.215
    local actionsTop = panelTop - previewHeight - gap
    local actionsHeight = rootHeight + actionsTop
    -- Text and controls stay this far inside a panel edge; the HD menu border is thick.
    local margin = 0.03
    local function Entry(kind, id)
        if id == nil then return nil end
        if kind == "HERO" then return SurvivorConfig.heroes[id] end
        if kind == "DIFFICULTY" then return SurvivorConfig.difficulties[id] end
        return SurvivorAugments.Get(id)
    end
    local function Entries(kind)
        return kind == "HERO" and SurvivorConfig.heroOrder or kind == "DIFFICULTY" and SurvivorConfig.difficultyOrder
            or kind == "WEAPON" and SurvivorConfig.startingWeapons or SurvivorConfig.startingTrinkets
    end
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
    local function Image(parent, name, width, height, texture)
        local image = BlzCreateFrameByType("BACKDROP", name, parent, "", 0)
        BlzFrameSetSize(image, width, height)
        BlzFrameSetTexture(image, texture, 0, true)
        BlzFrameSetEnable(image, false)
        return image
    end
    local function Listen(frame, event, callback)
        local trigger = CreateTrigger()
        triggers[#triggers + 1] = trigger
        BlzTriggerRegisterFrameEvent(trigger, frame, event)
        TriggerAddAction(trigger, function()
            if GetTriggerPlayer() ~= Player(SurvivorConfig.playerId) then return end
            local ok, message = pcall(callback)
            if not ok then RunSession.Fail(message) end
        end)
    end
    local function Button(parent, name, width, height, x, y, callback)
        -- Native button artwork on a glue control, without command-button focus.
        -- Keep our own text children so icon tiles and labeled buttons share one helper.
        local button = BlzCreateFrameByType("GLUETEXTBUTTON", name, parent, "ScriptDialogButton", 0)
        BlzFrameSetText(button, "")
        BlzFrameSetSize(button, width, height)
        BlzFrameSetPoint(button, FRAMEPOINT_TOP, parent, FRAMEPOINT_TOP, x, y)
        BlzFrameSetLevel(button, 3)
        local text = Text(button, name .. "Label", width - 0.012, height - 0.012, 0, -0.006)
        Listen(button, FRAMEEVENT_CONTROL_CLICK, function()
            -- A clicked glue button keeps focus, and hovering another button then flickers
            -- between the two highlights. Toggling enable on the clicker drops that focus.
            if GetLocalPlayer() == GetTriggerPlayer() and BlzFrameGetEnable(button) then
                BlzFrameSetEnable(button, false)
                BlzFrameSetEnable(button, true)
            end
            callback()
        end)
        return {frame = button, button = button, text = text}
    end
    -- A labeled button whose icon fills it; "?" stands in while nothing is chosen.
    local function IconButton(parent, name, size, iconSize, x, y, callback)
        local tile = Button(parent, name, size, size, x, y, callback)
        tile.active = Image(tile.button, name .. "Active", iconSize + rim, iconSize + rim, highlight)
        BlzFrameSetPoint(tile.active, FRAMEPOINT_CENTER, tile.button, FRAMEPOINT_CENTER, 0, 0)
        BlzFrameSetLevel(tile.active, 1)
        BlzFrameSetVisible(tile.active, false)
        tile.icon = Image(tile.button, name .. "Icon", iconSize, iconSize, highlight)
        BlzFrameSetPoint(tile.icon, FRAMEPOINT_CENTER, tile.button, FRAMEPOINT_CENTER, 0, 0)
        BlzFrameSetLevel(tile.icon, 2)
        BlzFrameClearAllPoints(tile.text)
        BlzFrameSetAllPoints(tile.text, tile.button)
        return tile
    end
    local function SetIcon(tile, entry)
        BlzFrameSetVisible(tile.icon, entry ~= nil)
        if entry then BlzFrameSetTexture(tile.icon, entry.icon, 0, true) end
        BlzFrameSetText(tile.text, entry and "" or "|cffffcc00?|r")
    end
    local function Panel(template, context, x, y, width, height)
        local panel = BlzCreateFrame(template, root, 0, context)
        BlzFrameSetSize(panel, width, height)
        BlzFrameSetPoint(panel, FRAMEPOINT_TOPLEFT, root, FRAMEPOINT_TOPLEFT, x, y)
        BlzFrameSetEnable(panel, false)
        BlzFrameSetLevel(panel, 1)
        return panel
    end

    -- Hero preview. Models in UI sprite frames get no scene lighting and render black, so
    -- the hero floats high above the map as a unit and a level camera frames it inside
    -- the preview window, the one hole in the black shade. The sky behind it is black and
    -- the far clip plane stops before the ground below, so only the hero shows.
    local function AimPreview()
        if GetLocalPlayer() ~= Player(SurvivorConfig.playerId) or not previewSpot then return end
        local shot = SurvivorConfig.setupPreview
        SetCameraPosition(previewSpot.cameraX, previewSpot.y)
        SetCameraField(CAMERA_FIELD_TARGET_DISTANCE, shot.distance, 0)
        SetCameraField(CAMERA_FIELD_ANGLE_OF_ATTACK, 360 - shot.pitch, 0)
        SetCameraField(CAMERA_FIELD_ROTATION, 90, 0)
        SetCameraField(CAMERA_FIELD_ZOFFSET, previewSpot.z, 0)
        SetCameraField(CAMERA_FIELD_ROLL, 0, 0)
        SetCameraField(CAMERA_FIELD_FIELD_OF_VIEW, shot.fov, 0)
        SetCameraField(CAMERA_FIELD_FARZ, shot.distance + shot.clip, 0)
    end
    local function StopPreview()
        if previewTimer then PauseTimer(previewTimer); DestroyTimer(previewTimer); previewTimer = nil end
        if previewUnit then
            -- Removal plays no death animation; hide first so nothing lingers when the shade lifts.
            ShowUnit(previewUnit, false)
            RemoveUnit(previewUnit)
            previewUnit, previewSkin = nil, nil
        end
        if previewSpot and GetLocalPlayer() == Player(SurvivorConfig.playerId) then
            SetCameraBounds(savedBounds.minX, savedBounds.minY, savedBounds.minX, savedBounds.maxY,
                savedBounds.maxX, savedBounds.maxY, savedBounds.maxX, savedBounds.minY)
            ResetToGameCamera(0)
            SetCameraPosition(previewSpot.cameraX, previewSpot.y)
        end
        previewSpot = nil
    end
    local function StartPreview(hero)
        if previewUnit and previewSkin == hero.previewSkin then return end
        StopPreview()
        local shot, area = SurvivorConfig.setupPreview, bj_mapInitialPlayableArea
        local x = shot.x or (GetRectMinX(area) + GetRectMaxX(area)) / 2
        local y = shot.y or (GetRectMinY(area) + GetRectMaxY(area)) / 2
        -- A unit, unlike an effect, can hide its hero glow. The hero's skin goes on a stock
        -- footman: the story's portrait proxy cannot move, so it never left the ground.
        -- ALICE hooks CreateUnit itself, so exclude the type first; locust keeps the unit out
        -- of selection and targeting, and without an attack it never acquires anything.
        local carrier = FourCC("hfoo")
        if ALICE_ExcludeTypes then ALICE_ExcludeTypes(carrier) end
        previewUnit = CreateUnit(Player(SurvivorConfig.playerId), carrier, x, y, 270) -- Faces the camera.
        assert(previewUnit and GetUnitTypeId(previewUnit) == carrier, "Could not create the hero preview")
        previewSkin = hero.previewSkin
        BlzSetUnitSkin(previewUnit, hero.previewSkin)
        UnitRemoveAbility(previewUnit, FourCC("Aatk"))
        UnitAddAbility(previewUnit, FourCC("Aloc"))
        SetUnitInvulnerable(previewUnit, true)
        SetUnitPathing(previewUnit, false)
        SetUnitX(previewUnit, x); SetUnitY(previewUnit, y)
        -- Adding and removing crow form lets a ground unit take a fly height.
        UnitAddAbility(previewUnit, FourCC("Amrf"))
        UnitRemoveAbility(previewUnit, FourCC("Amrf"))
        SetUnitFlyHeight(previewUnit, shot.lift, 0)
        BlzShowUnitTeamGlow(previewUnit, false)
        SetUnitAnimation(previewUnit, hero.previewAnimation)
        -- The camera, not the hero, moves so the hero lands at the window's screen position.
        -- The field of view spans the full screen width, so screen units convert to world
        -- units at the target distance through the local aspect ratio (camera only).
        local width = BlzGetLocalClientWidth and BlzGetLocalClientWidth() or 0
        local height = BlzGetLocalClientHeight and BlzGetLocalClientHeight() or 0
        local aspect = width > 0 and height > 0 and width / height or 4 / 3
        local scale = math.tan(math.rad(shot.fov) / 2) * shot.distance / (0.3 * aspect) * shot.screenScale
        local holeX = 0.4 - rootWidth / 2 + previewX + previewWidth / 2
        local holeY = rootTop + panelTop - previewHeight / 2
        previewSpot = {cameraX = x - (holeX - 0.4) * scale, y = y,
            z = shot.lift + shot.height - (holeY - 0.3) * scale}
        if GetLocalPlayer() == Player(SurvivorConfig.playerId) then
            savedBounds = {minX = GetCameraBoundMinX(), minY = GetCameraBoundMinY(),
                maxX = GetCameraBoundMaxX(), maxY = GetCameraBoundMaxY()}
            ResetToGameCamera(0)
            local cx = previewSpot.cameraX
            SetCameraBounds(cx - 1, y - 1, cx - 1, y + 1, cx + 1, y + 1, cx + 1, y - 1)
        end
        AimPreview()
        -- Edge scrolling and wheel zoom are undone while the window is open.
        previewTimer = CreateTimer()
        -- The skin swap reloads the model and brings its hero glow back, so hiding the
        -- glow once is not enough; the same tick keeps it hidden.
        TimerStart(previewTimer, 0.1, true, function()
            pcall(AimPreview)
            if previewUnit then pcall(BlzShowUnitTeamGlow, previewUnit, false) end
        end)
    end

    function SurvivorSetupUI.Hide()
        visible, hovered = false, nil
        if root then BlzFrameSetVisible(root, false); BlzFrameSetVisible(shade, false) end
        SurvivorUI.SetSetupCinematic(false)
        StopPreview()
    end
    local function Show()
        if not visible then
            SurvivorUI.HidePanel()
            SurvivorUI.ClearDamageBoard()
        end
        BlzFrameSetVisible(root, true)
        BlzFrameSetVisible(shade, true)
        BlzFrameSetAlpha(shade, 255)
        SurvivorUI.SetSetupCinematic(true)
        visible = true
    end
    -- Description for one entry, or a category guide when nothing is chosen yet.
    local function Describe(kind, id)
        local entry = Entry(kind, id)
        if kind == "HERO" then
            entry = entry or SurvivorConfig.heroes[SurvivorConfig.defaultHero]
            return entry.name, entry.story
        end
        if kind == "DIFFICULTY" then
            if not entry then return "난이도 선택", "처치한 적만큼 경험치를 획득합니다.\n왼쪽 목록에서 난이도를 고르세요." end
            return entry.name, entry.text .. "\n\n" .. string.format(
                "적 출현량 %.0f%%\n생명력 %.0f%% · 공격력 %.0f%%\n공격 속도 %.0f%% · 이동 속도 %.0f%%",
                entry.spawn * 100, entry.life * 100, entry.damage * 100, entry.attackSpeed * 100, entry.moveSpeed * 100)
                .. "\n\n처치한 적만큼 경험치를 획득합니다."
        end
        if not entry then
            return labels[kind] .. " 선택", "고른 " .. labels[kind] .. "를 Lv.1로 보유하고 시작합니다.\n왼쪽 목록에서 하나를 고르세요."
        end
        if kind == "TRINKET" then
            -- Universal modifier only; never a single weapon-specific example.
            local weapon = selected.WEAPON or SurvivorConfig.startingWeapon
            return entry.name, entry.text .. "\n\n" .. SurvivorAugments.Preview(id, SurvivorAugments.NewBuild(weapon))
                .. "\n\nLv.1로 보유하고 시작합니다."
        end
        return entry.name, entry.text .. "\n\nLv.1로 보유하고 시작합니다."
    end
    local function RenderDescription()
        local kind = hovered and hovered.kind or category
        local name, text = Describe(kind, hovered and hovered.id or selected[kind])
        BlzFrameSetText(descriptionTitle, "|cffffcc00" .. name .. "|r")
        BlzFrameSetText(description, text)
    end
    local function RenderList()
        local entries = Entries(category)
        BlzFrameSetText(listTitle, "|cffffcc00" .. labels[category] .. " 선택|r")
        for i, card in ipairs(cards) do
            local id = entries[i]
            card.id = id
            BlzFrameSetVisible(card.frame, id ~= nil)
            if id then
                local entry = Entry(category, id)
                local chosen = id == selected[category]
                BlzFrameSetTexture(card.icon, entry.icon, 0, true)
                BlzFrameSetVisible(card.active, chosen)
                BlzFrameSetText(card.name, (chosen and "|cff80ff80" or "|cffffffff") .. entry.name .. "|r")
            end
        end
    end
    local function Render()
        local hero = Entry("HERO", selected.HERO)
        SetIcon(heroButton, hero)
        BlzFrameSetVisible(heroButton.active, category == "HERO")
        BlzFrameSetText(heroName, "|cffffcc00" .. hero.name .. "|r")
        StartPreview(hero)
        for _, kind in ipairs(kinds) do
            local tile, entry = categoryButtons[kind], Entry(kind, selected[kind])
            SetIcon(tile, entry)
            BlzFrameSetVisible(tile.active, category == kind)
            BlzFrameSetText(tile.caption, (category == kind and "|cffffcc00" or "|cffffffff") .. labels[kind] .. "|r\n"
                .. (entry and "|cff80ff80" .. entry.name .. "|r" or "|cff999999미선택|r"))
        end
        RenderList()
        RenderDescription()
        BlzFrameSetText(summaryToggle.text, HeroSurvivor.IsStorySummary() and "이미 본 대화: 요약 보기" or "이미 본 대화: 전체 보기")
        startButton.ready = selected.DIFFICULTY ~= nil and selected.WEAPON ~= nil and selected.TRINKET ~= nil
        BlzFrameSetEnable(startButton.button, startButton.ready)
        BlzFrameSetText(startButton.text, startButton.ready and "|cffffcc00게임 시작|r" or "|cff888888게임 시작|r")
        BlzFrameSetText(status, startButton.ready and "준비 완료" or "무기·장신구·난이도를\n모두 선택하세요.")
    end
    function SurvivorSetupUI.Init(onOpen, onSelect, onReset, onStart)
        if root then return end
        openCallback, selectCallback, resetCallback, startCallback = onOpen, onSelect, onReset, onStart
        local parent = BlzGetFrameByName("ConsoleUIBackdrop", 0)
        if parent == nil or parent == 0 or GetHandleId(parent) == 0 then parent = BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0) end
        -- Layout groups carry no mouse surface; only their actual buttons take input.
        root = BlzCreateFrameByType("BACKDROP", "HeroSurvivorSetupRoot", parent, "", 0)
        BlzFrameSetTexture(root, "HeroSurvivorUI\\Transparent.tga", 0, true)
        BlzFrameSetAbsPoint(root, FRAMEPOINT_TOP, 0.4, rootTop)
        BlzFrameSetSize(root, rootWidth, rootHeight)
        BlzFrameSetLevel(root, 11)
        title = Text(root, "HeroSurvivorSetupTitle", rootWidth, 0.024, 0, -0.002)
        BlzFrameSetText(title, "|cffffcc00" .. SurvivorStory.title .. "|r   |cffaaaaaa"
            .. SurvivorStory.notice .. " · DE 그래픽 권장|r")
        local left = Panel("EscMenuBackdrop", 800, 0, panelTop, listWidth, rootHeight + panelTop)
        local center = Panel("EscMenuBackdrop", 801, listWidth + gap, panelTop, summaryWidth, rootHeight + panelTop)
        -- The preview window is clear so the world shows through. Retexturing a menu backdrop
        -- also drops its border and custom FDF paths rendered missing-texture green, so a thin
        -- gold outline from tinted strips frames it, like the choice cards' hover border.
        local preview = Image(root, "HeroSurvivorSetupPreview", previewWidth, previewHeight, "HeroSurvivorUI\\Transparent.tga")
        BlzFrameSetPoint(preview, FRAMEPOINT_TOPLEFT, root, FRAMEPOINT_TOPLEFT, previewX, panelTop)
        BlzFrameSetLevel(preview, 1)
        local line = 0.002
        for _, edge in ipairs({{"Top", FRAMEPOINT_TOPLEFT, previewWidth, line}, {"Bottom", FRAMEPOINT_BOTTOMLEFT, previewWidth, line},
            {"Left", FRAMEPOINT_TOPLEFT, line, previewHeight}, {"Right", FRAMEPOINT_TOPRIGHT, line, previewHeight}}) do
            local strip = Image(preview, "HeroSurvivorSetupPreview" .. edge[1], edge[3], edge[4], "HeroSurvivorUI\\Ready.tga")
            BlzFrameSetPoint(strip, edge[2], preview, edge[2], 0, 0)
            BlzFrameSetVertexColor(strip, BlzConvertColor(255, 255, 204, 0))
        end
        local actions = Panel("EscMenuBackdrop", 803, previewX, actionsTop, previewWidth, actionsHeight)

        -- The shade covers the world at ultrawide ratios, except for the preview window.
        -- Four disabled, opaque pieces surround that hole; Hide owns the container.
        shade = Image(parent, "HeroSurvivorSetupShade", 2.4, 0.6, "HeroSurvivorUI\\Transparent.tga")
        BlzFrameSetAbsPoint(shade, FRAMEPOINT_CENTER, 0.4, 0.3)
        BlzFrameSetLevel(shade, 10)
        local holeHeight = previewHeight
        local hole = Image(shade, "HeroSurvivorSetupHole", previewWidth, holeHeight, "HeroSurvivorUI\\Transparent.tga")
        BlzFrameSetPoint(hole, FRAMEPOINT_TOPLEFT, preview, FRAMEPOINT_TOPLEFT, 0, 0)
        for _, piece in ipairs({
            {"Top", 2.4, 0.6, FRAMEPOINT_BOTTOM, FRAMEPOINT_TOP},
            {"Bottom", 2.4, 0.6, FRAMEPOINT_TOP, FRAMEPOINT_BOTTOM},
            {"Left", 1.2, holeHeight, FRAMEPOINT_TOPRIGHT, FRAMEPOINT_TOPLEFT},
            {"Right", 1.2, holeHeight, FRAMEPOINT_TOPLEFT, FRAMEPOINT_TOPRIGHT}}) do
            local cover = Image(shade, "HeroSurvivorSetupShade" .. piece[1], piece[2], piece[3], "HeroSurvivorUI\\Black.tga")
            BlzFrameSetPoint(cover, piece[4], hole, piece[5], 0, 0)
        end

        listTitle = Text(left, "HeroSurvivorSetupListTitle", listWidth - 0.04, 0.022, 0, -0.016)
        local cardWidth = (listWidth - margin * 2 - 0.004) / 2
        for i = 1, listSize do
            local slot = i
            local card = Button(left, "HeroSurvivorSetupOption" .. i, cardWidth, 0.05,
                (i % 2 == 1 and -1 or 1) * (cardWidth + 0.004) / 2, -0.042 - math.floor((i - 1) / 2) * 0.057, function()
                    local id = cards[slot].id
                    if not visible or not id then return end
                    if category == "HERO" then selected.HERO = id; Render(); return end
                    selectCallback(category, id)
                end)
            BlzFrameSetVisible(card.text, false)
            card.active = Image(card.button, "HeroSurvivorSetupChosen" .. i, 0.03 + rim, 0.03 + rim, highlight)
            BlzFrameSetPoint(card.active, FRAMEPOINT_TOPLEFT, card.button, FRAMEPOINT_TOPLEFT, 0.009 - rim / 2, -0.01 + rim / 2)
            BlzFrameSetLevel(card.active, 1)
            card.icon = Image(card.button, "HeroSurvivorSetupIcon" .. i, 0.03, 0.03, highlight)
            BlzFrameSetPoint(card.icon, FRAMEPOINT_TOPLEFT, card.button, FRAMEPOINT_TOPLEFT, 0.009, -0.01)
            BlzFrameSetLevel(card.icon, 2)
            card.name = LeftText(card.button, "HeroSurvivorSetupName" .. i, cardWidth - 0.048, 0.034, 0.042, -0.008)
            Listen(card.button, FRAMEEVENT_MOUSE_ENTER, function()
                if visible and cards[slot].id then hovered = {kind = category, id = cards[slot].id}; RenderDescription() end
            end)
            Listen(card.button, FRAMEEVENT_MOUSE_LEAVE, function()
                if visible and hovered then hovered = nil; RenderDescription() end
            end)
            cards[i] = card
        end

        heroButton = IconButton(center, "HeroSurvivorSetupHERO", 0.064, 0.048, 0, -0.016, function()
            if visible then category, hovered = "HERO", nil; Render() end
        end)
        heroName = Text(center, "HeroSurvivorSetupHeroName", summaryWidth - 0.04, 0.018, 0, -0.082)
        local spacing = 0.08
        for i, kind in ipairs(kinds) do
            local choice = kind
            local tile = IconButton(center, "HeroSurvivorSetup" .. kind, 0.05, 0.036, (i - 2) * spacing, -0.106, function()
                if visible then openCallback(choice) end
            end)
            tile.caption = Text(center, "HeroSurvivorSetup" .. kind .. "Caption", spacing, 0.04, (i - 2) * spacing, -0.158)
            categoryButtons[kind] = tile
        end
        descriptionTitle = LeftText(center, "HeroSurvivorSetupDescriptionTitle", summaryWidth - margin * 2, 0.02, margin, -0.204)
        description = LeftText(center, "HeroSurvivorSetupDescription", summaryWidth - margin * 2, 0.15, margin, -0.226)
        BlzFrameSetTextAlignment(description, TEXT_JUSTIFY_TOP, TEXT_JUSTIFY_LEFT)

        local actionWidth = previewWidth - margin * 2
        local buttonWidth = (actionWidth - 0.006) / 2
        status = Text(actions, "HeroSurvivorSetupStatus", actionWidth, 0.03, 0, -margin)
        summaryToggle = Button(actions, "HSSummaryToggle", actionWidth, 0.032, 0, -0.064, function()
            if visible then HeroSurvivor.ToggleStorySummary() end
        end)
        resetButton = Button(actions, "HeroSurvivorSetupReset", buttonWidth, 0.046, -(buttonWidth + 0.006) / 2, -0.1, function()
            if visible then hovered = nil; resetCallback() end
        end)
        BlzFrameSetText(resetButton.text, "초기화")
        startButton = Button(actions, "HeroSurvivorSetupStart", buttonWidth, 0.046, (buttonWidth + 0.006) / 2, -0.1, function()
            if not visible or not startButton.ready then return end
            SurvivorSetupUI.Hide()
            startCallback()
        end)
        SurvivorSetupUI.Hide()
    end
    -- Refreshes every panel with gameplay's selections; the open list stays put.
    function SurvivorSetupUI.ShowMenu(difficulty, weapon, trinket)
        selected.DIFFICULTY, selected.WEAPON, selected.TRINKET = difficulty, weapon, trinket
        selected.HERO = selected.HERO or SurvivorConfig.defaultHero
        if not visible then category = "HERO" end
        hovered = nil
        Show()
        Render()
    end
    function SurvivorSetupUI.ShowOptions(kind, current)
        selected[kind] = current
        selected.HERO = selected.HERO or SurvivorConfig.defaultHero
        category, hovered = kind, nil
        Show()
        Render()
    end
end
