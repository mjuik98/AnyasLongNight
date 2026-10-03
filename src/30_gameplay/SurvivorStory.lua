-- Original side story leading to the campaign meeting, not a canonical retelling.
SurvivorStory = {
    title = "포세이큰: 안야의 긴 밤",
    premise = "폐허에서 무리를 벗어난 언데드가 목격됐다.\n안야가 앞서 길을 열고, 퓨트리스는 뒤에서 흔적을 살핀다.\n그에게 아직 자아가 남아 있는지는 알 수 없다.",
    notice = "공식 캠페인의 첫 만남 이전을 상상한 창작 외전",
    heroModel = [[Units\Forsaken\HeroAnya\HeroAnya.mdl]],
    figureModel = [[Units\Creeps\Zombie\Zombie.mdl]],
    -- User-provided built-in Forsaken model; resolved from the game's own assets.
    putressModel = [[Units\Forsaken\Hero_Putress\Hero_Putress.mdl]],
    transportModel = [[Doodads\LordaeronSummer\Props\HayCart\HayCart.mdl]],
    supplyModel = [[Objects\InventoryItems\PotionGreen\PotionGreen.mdl]],
    -- Non-hero, non-commandable selection proxies; their native models own the portrait.
    portraitIds = {anya = FourCC("hsPA"), putress = FourCC("hsPP")},
    stages = {
        {clue = "무리와 다른 방향으로 이어진 발자국."},
        {clue = "불길을 피해 가장자리로 돌아간 흔적."},
        {clue = "부서지지 않은 문과 안쪽에서 풀린 빗장."},
        {clue = "같은 방향으로 이동한 적 수색대의 흔적."},
        {clue = "봉쇄 너머에서 쓰러진 언데드를 발견했다. 지하로 옮겼지만, 이름은 아직 알지 못한다."},
    },
}
do
    local clues, sceneEffects, hiddenHero, sceneLocation, camera = {}, {}, nil, nil, nil
    local portraitUnits, portraitHero = {}, nil
    local cameraBounds, cameraFocus, cameraGuardTimer = nil, nil, nil
    local currentStage, dialogue, remembered = 1, {}, {}
    -- These preferences survive a retry; the current run's transcript does not.
    local summaryMode, seenScenes = false, {}
    function SurvivorStory.SetSummaryMode(enabled) summaryMode = enabled == true end
    function SurvivorStory.SetStage(index) currentStage = index end
    function SurvivorStory.Remember(speaker, text)
        local key = currentStage .. ":" .. speaker .. ":" .. text
        if remembered[key] then return end
        remembered[key] = true
        dialogue[currentStage] = dialogue[currentStage] or {}
        dialogue[currentStage][#dialogue[currentStage] + 1] = {speaker = speaker, text = text}
    end
    local function SetBounds(minX, minY, maxX, maxY)
        -- Same native corner order as Blizzard.j's SetCameraBoundsToRect.
        SetCameraBounds(minX, minY, minX, maxY, maxX, maxY, maxX, minY)
    end
    local function StopCameraTransition()
        if not cameraGuardTimer then return end
        PauseTimer(cameraGuardTimer)
        DestroyTimer(cameraGuardTimer)
        cameraGuardTimer = nil
    end
    local function GuardCamera(x, y, duration)
        StopCameraTransition()
        if GetLocalPlayer() == Player(SurvivorConfig.playerId) and cameraBounds then
            -- Read the in-flight target too, so rapid page clicks do not cut an unfinished pan.
            local previous = duration > 0 and {x = GetCameraTargetPositionX(), y = GetCameraTargetPositionY()} or nil
            -- Keep the old and new targets available for the existing smooth pan.
            SetBounds(math.min(x, previous and previous.x or x) - 64,
                math.min(y, previous and previous.y or y) - 64,
                math.max(x, previous and previous.x or x) + 64,
                math.max(y, previous and previous.y or y) + 64)
            cameraFocus = {x = x, y = y}
        end
        if duration <= 0 then return end
        -- One synchronized timer per transition; it never advances dialogue.
        local timer = CreateTimer()
        cameraGuardTimer = timer
        TimerStart(timer, duration, false, function()
            if cameraGuardTimer ~= timer then return end -- A new page/cleanup cancelled this shot.
            cameraGuardTimer = nil
            PauseTimer(timer); DestroyTimer(timer)
            local ok, message = pcall(function()
                if GetLocalPlayer() == Player(SurvivorConfig.playerId) and cameraBounds then
                    SetBounds(x - 64, y - 64, x + 64, y + 64)
                end
            end)
            if not ok then SurvivorStory.Cleanup(); RunSession.Fail(message) end
        end)
    end
    local function FrameScene(x, y, distance, duration)
        -- Warcraft's 315 degrees looks down at 45 degrees; +45 looks up from underground.
        -- Aim slightly in front of the actors so they sit above the dialogue panel.
        GuardCamera(x, y - 220, duration)
        if GetLocalPlayer() ~= Player(SurvivorConfig.playerId) then return end
        if duration == 0 then SetCameraPosition(x, y - 220)
        else PanCameraToTimed(x, y - 220, duration) end
        SetCameraField(CAMERA_FIELD_TARGET_DISTANCE, distance, duration)
        SetCameraField(CAMERA_FIELD_ANGLE_OF_ATTACK, 315, duration)
        SetCameraField(CAMERA_FIELD_ROTATION, 90, duration)
        SetCameraField(CAMERA_FIELD_ZOFFSET, 60, duration)
        SetCameraField(CAMERA_FIELD_ROLL, 0, duration)
    end
    local function CaptureCamera()
        if GetLocalPlayer() ~= Player(SurvivorConfig.playerId) then return end
        camera = {}
        -- Native bounds already exclude camera margins; do not add those margins again.
        cameraBounds = {minX = GetCameraBoundMinX(), minY = GetCameraBoundMinY(),
            maxX = GetCameraBoundMaxX(), maxY = GetCameraBoundMaxY()}
        cameraFocus = {x = GetCameraTargetPositionX(), y = GetCameraTargetPositionY()}
        for _, field in ipairs({CAMERA_FIELD_TARGET_DISTANCE, CAMERA_FIELD_ANGLE_OF_ATTACK, CAMERA_FIELD_ROTATION,
            CAMERA_FIELD_ZOFFSET, CAMERA_FIELD_ROLL}) do
            camera[field] = GetCameraField(field)
            if field == CAMERA_FIELD_ANGLE_OF_ATTACK or field == CAMERA_FIELD_ROTATION or field == CAMERA_FIELD_ROLL then
                camera[field] = camera[field] * bj_RADTODEG
            end
        end
    end
    function SurvivorStory.Reset()
        SurvivorStory.Cleanup()
        clues, dialogue, remembered, currentStage = {}, {}, {}, 1
        SurvivorUI.ClearSpeech()
    end
    function SurvivorStory.Record(index)
        local entry = assert(SurvivorStory.stages[index], "Unknown story stage")
        clues[index] = {name = SurvivorStage.Get(index).name, text = entry.clue}
    end
    function SurvivorStory.JournalChapters()
        local chapters = {}
        for i = 1, #SurvivorStory.stages do
            local clue, extra, pages = clues[i], SurvivorExpedition.Journal(i), {}
            if clue or extra ~= "" then
                pages[#pages + 1] = (clue and clue.text or "주요 경로: 아직 확보하지 못함")
                    .. (extra ~= "" and "\n\n" .. extra or "")
            end
            for _, line in ipairs(dialogue[i] or {}) do
                pages[#pages + 1] = line.speaker .. "\n" .. line.text
            end
            if #pages > 0 then chapters[#chapters + 1] = {title = SurvivorStage.Get(i).name, pages = pages} end
        end
        return chapters
    end
    function SurvivorStory.Cleanup()
        StopCameraTransition()
        local restoreHero = hiddenHero or portraitHero
        if portraitHero and GetLocalPlayer() == Player(SurvivorConfig.playerId) then ClearSelection() end
        for _, unit in pairs(portraitUnits) do
            if GetUnitTypeId(unit) ~= 0 then RemoveUnit(unit) end
        end
        portraitUnits = {}
        for _, effect in ipairs(sceneEffects) do DestroyEffect(effect) end
        sceneEffects = {}
        if sceneLocation then RemoveLocation(sceneLocation); sceneLocation = nil end
        if hiddenHero and GetUnitTypeId(hiddenHero) ~= 0 then ShowUnit(hiddenHero, true) end
        if camera and GetLocalPlayer() == Player(SurvivorConfig.playerId) then
            if cameraBounds then SetBounds(cameraBounds.minX, cameraBounds.minY, cameraBounds.maxX, cameraBounds.maxY) end
            ResetToGameCamera(0)
            for field, value in pairs(camera) do SetCameraField(field, value, 0) end
            if restoreHero and GetUnitTypeId(restoreHero) ~= 0 and UnitAlive(restoreHero) then
                SetCameraPosition(GetUnitX(restoreHero), GetUnitY(restoreHero))
                SetCameraTargetController(restoreHero, 0, 0, false)
            end
        end
        if restoreHero and GetUnitTypeId(restoreHero) ~= 0 and UnitAlive(restoreHero)
            and GetLocalPlayer() == Player(SurvivorConfig.playerId) then
            ClearSelection()
            SelectUnit(restoreHero, true)
        end
        hiddenHero, portraitHero, camera, cameraBounds, cameraFocus = nil, nil, nil, nil, nil
    end
    local function BeginScene(hero)
        SurvivorStory.Cleanup()
        hiddenHero = hero
        ShowUnit(hero, false)
        local bounds = bj_mapInitialPlayableArea
        local point = SurvivorStage.ScenePoint and SurvivorStage.ScenePoint()
        local x, y = point and point.x or (GetRectMinX(bounds) + GetRectMaxX(bounds)) / 2,
            point and point.y or (GetRectMinY(bounds) + GetRectMaxY(bounds)) / 2
        sceneLocation = Location(x, y)
        CaptureCamera()
        if GetLocalPlayer() == Player(SurvivorConfig.playerId) then ResetToGameCamera(0) end
        FrameScene(x, y, 1350, 0)
        return x, y
    end
    local function BeginPortraits(hero, createUnits)
        if not hero then return end -- Compatibility for old text-only briefing callers.
        assert(GetUnitTypeId(hero) ~= 0 and UnitAlive(hero), "Story portraits need the live gameplay hero")
        portraitHero = hero
        if not camera then CaptureCamera() end
        -- The briefing keeps its current shot; later scenes are framed by FrameScene.
        if not sceneLocation then
            GuardCamera(cameraFocus and cameraFocus.x or GetUnitX(hero), cameraFocus and cameraFocus.y or GetUnitY(hero), 0)
        end
        if not createUnits then return end
        -- ALICE hooks CreateUnit itself; exclude these types before its automatic registration.
        if ALICE_ExcludeTypes then ALICE_ExcludeTypes(SurvivorStory.portraitIds.anya, SurvivorStory.portraitIds.putress) end
        local bounds = bj_mapInitialPlayableArea
        local focusX, focusY = sceneLocation and GetLocationX(sceneLocation) or GetUnitX(hero),
            sceneLocation and GetLocationY(sceneLocation) or GetUnitY(hero)
        local minX, maxX, minY, maxY = GetRectMinX(bounds) + 128, GetRectMaxX(bounds) - 128,
            GetRectMinY(bounds) + 128, GetRectMaxY(bounds) - 128
        local corner, distance = nil, -1
        for _, point in ipairs({{x = minX, y = minY, inward = 1}, {x = minX, y = maxY, inward = 1},
            {x = maxX, y = minY, inward = -1}, {x = maxX, y = maxY, inward = -1}}) do
            local score = (point.x - focusX)^2 + (point.y - focusY)^2
            if score > distance then corner, distance = point, score end
        end
        for i, entry in ipairs({{speaker = "안야", id = SurvivorStory.portraitIds.anya},
            {speaker = "퓨트리스", id = SurvivorStory.portraitIds.putress}}) do
            -- Kept visible at a far map corner: hiding/scaling the proxy can also hide its portrait.
            -- Red player ownership matches the actors; pause and stripped abilities prevent orders.
            local x, y = corner.x + (i - 1) * 64 * corner.inward, corner.y
            local unit = CreateUnit(Player(0), entry.id, x, y, 270)
            if unit then portraitUnits[entry.speaker] = unit end
            assert(unit and GetUnitTypeId(unit) == entry.id, "Missing story portrait unit " .. entry.speaker)
            SetUnitColor(unit, PLAYER_COLOR_RED)
            SetUnitInvulnerable(unit, true)
            SetUnitPathing(unit, false)
            -- Correct any engine spawn adjustment on a blocked editor corner after removing pathing.
            SetUnitX(unit, x); SetUnitY(unit, y)
            for _, ability in ipairs({"Amov", "Aatk", "AInv"}) do UnitRemoveAbility(unit, FourCC(ability)) end
            PauseUnit(unit, true)
        end
    end
    local function SelectSpeaker(speaker)
        if not portraitHero or GetLocalPlayer() ~= Player(SurvivorConfig.playerId) then return end
        ClearSelection()
        local unit = portraitUnits[speaker]
        if unit and GetUnitTypeId(unit) ~= 0 then SelectUnit(unit, true) end
        -- "수색 기록" and summary pages deliberately have a neutral, unselected portrait.
    end
    local function Actor(model, x, y, scale, colorPlayer)
        local effect = AddSpecialEffect(model, x, y)
        assert(effect, "Could not create story actor")
        sceneEffects[#sceneEffects + 1] = effect
        BlzSetSpecialEffectScale(effect, scale or 1)
        if colorPlayer then BlzSetSpecialEffectColorByPlayer(effect, colorPlayer) end
        return effect
    end
    local function Move(effect, x, y, height)
        MoveLocation(sceneLocation, x, y)
        BlzSetSpecialEffectPosition(effect, x, y, GetLocationZ(sceneLocation) + (height or 0))
    end
    local function Face(effect, x, y, targetX, targetY)
        BlzSetSpecialEffectYaw(effect, Atan2(targetY - y, targetX - x))
        BlzPlaySpecialEffect(effect, ANIM_TYPE_STAND)
    end
    local function Page(speaker, text) return {speaker = speaker, text = text} end
    local function RememberPages(pages)
        for _, page in ipairs(pages) do SurvivorStory.Remember(page.speaker, page.text) end
    end
    local function Conversation(key, title, pages, summary, onComplete, onPage, hero)
        -- Include the actual branch in the key: a newly discovered clue deserves its full scene.
        local parts = {key}
        for _, page in ipairs(pages) do parts[#parts + 1] = page.speaker .. ":" .. page.text end
        key = table.concat(parts, "\n")
        RememberPages(pages)
        local concise = summaryMode and seenScenes[key] == true
        local shown = concise and {Page("수색 기록", summary)} or pages
        local function RenderPage(page)
            local ok, message = pcall(function()
                SelectSpeaker(shown[page].speaker)
                if onPage then onPage(concise and #pages or page) end
            end)
            if not ok then SurvivorStory.Cleanup(); error(message) end
        end
        local ok, message = pcall(function()
            BeginPortraits(hero or hiddenHero, not concise)
            SurvivorUI.ShowConversation(title .. (concise and " · 요약" or ""), shown, function()
                seenScenes[key] = true
                SurvivorStory.Cleanup()
                onComplete()
            end, RenderPage)
        end)
        if not ok then SurvivorStory.Cleanup(); error(message) end
    end
    function SurvivorStory.ShowBriefing(hero, onComplete)
        if type(hero) == "function" and onComplete == nil then onComplete, hero = hero, nil end
        SurvivorStory.Cleanup()
        local pages = {
            Page("퓨트리스", "무리에서 떨어진 개체라… 명령이 끊긴 건지, 제 발로 벗어난 건지 확인해야겠군."),
            Page("안야", "내가 앞서 길을 열겠어. 뒤에서 흔적을 살펴 줘. 다음 길목에서 만나."),
            Page("퓨트리스", "발견하면 상태부터 살펴보겠네. 의식이 남아 있는지도 확인해야지."),
            Page("안야", "좋아. 말할 수 있다면, 무슨 일이 있었는지 먼저 들어 보겠어."),
        }
        Conversation("briefing", "수색을 시작하며", pages,
            "안야가 앞서 길을 열고, 퓨트리스는 뒤에서 흔적을 살피기로 했다.\n대상이 말할 수 있다면, 먼저 무슨 일이 있었는지 듣기로 했다.", onComplete, nil, hero)
    end
    local scenes = {
        {
            Page("퓨트리스", "묘지 입구까지는 무리와 함께 움직였네. 여기서 혼자 다른 길로 갔군."),
            Page("안야", "다른 놈들은 넘어진 묘비를 밟고 갔어. 그런데 이쪽은 묘비를 돌아갔군."),
            Page("퓨트리스", "그저 장애물을 피했을 수도 있지. 이것만으로는 단정하기 어렵네."),
            Page("안야", "그래. 흔적이 끊기기 전에 더 따라가 보겠어."),
        },
        {
            Page("퓨트리스", "불이 보급로를 따라 번졌군. 발자국은 열기가 가라앉은 가장자리로 이어지네."),
            Page("안야", "가까운 길을 두고 돌아갔어. 불길을 피한 모양이군."),
            Page("퓨트리스", "열기에 몸이 반응한 건지, 위험을 알고 피한 건지… 흔적을 더 봐야겠네."),
            Page("안야", "이쪽으로는 지나갈 수 있어. 조사가 끝나면 물건을 챙겨서 따라와."),
        },
        {
            Page("퓨트리스", "납골당에서 냉기가 새어 나오는군. 빗장은 안쪽에서 풀렸네."),
            Page("안야", "문을 부술 힘이 없었던 걸까? 아니면 여는 법을 기억한 걸까?"),
            Page("퓨트리스", "의식이 흐려져도 몸에 익은 동작은 남을 수 있지."),
            Page("안야", "그럴 수도 있겠지. 그래도 흔적만 보고 판단하고 싶진 않아."),
        },
        {
            Page("퓨트리스", "검문소 너머에도 수색대가 있네. 발자국이 이어진 쪽으로 갔군."),
            Page("안야", "그들보다 먼저 찾아야 해. 내가 마지막 길목을 열겠어."),
            Page("퓨트리스", "그럼 나는 돌아갈 길을 확보하겠네. 찾으면 바로 옮길 수 있게 준비해 두지."),
            Page("안야", "좋아. 저 사슬 너머에서 합류해."),
        },
    }
    function SurvivorStory.ShowInterlude(index, hero, onComplete)
        currentStage = index
        local source = assert(scenes[index], "Unknown interlude")
        local pages = {}
        for i, page in ipairs(source) do pages[i] = Page(page.speaker, page.text) end
        -- Optional discoveries change what Anya knows, never invent a completed search.
        local reply = SurvivorExpedition.GetReply(index)
        if reply then pages[4] = Page("안야", reply) end
        if index == 4 and SurvivorExpedition.GetFinding(index) then
            pages[1] = Page("퓨트리스", "가져온 명령서에 ‘이탈자’와 ‘회수’라고 적혀 있네. 이름은 없군.")
        end
        local x, y = BeginScene(hero)
        local anya = Actor(SurvivorStory.heroModel, x - 180, y + 80, 1, Player(0))
        local putress = Actor(SurvivorStory.putressModel, x + 150, y + 130, 0.95, Player(0))
        BlzSetSpecialEffectYaw(anya, 0)
        BlzSetSpecialEffectYaw(putress, math.pi)
        local gate, evidence, sample
        if index == 1 then
            for i = 1, 5 do
                local mark = Actor([[Objects\Spawnmodels\Other\IllidanFootprint\IllidanSpawnFootPrint0.mdl]], x + i * 55, y + 250 + i * 22, 0.4)
                BlzSetSpecialEffectColor(mark, 90, 95, 85)
            end
            Actor([[Doodads\Cityscape\Props\CityGrave\CityGrave0.mdl]], x - 300, y + 280, 0.65)
        elseif index == 2 then
            Actor([[Doodads\Ruins\Rocks\CliffRubble_Single\CliffRubble_Single0.mdl]], x + 350, y + 280, 0.65)
            Actor([[Doodads\Dungeon\Rocks\Cave_FieryCrator\Cave_FieryCrator.mdl]], x + 370, y + 330, 0.35)
            local cart = Actor(SurvivorStory.transportModel, x + 380, y + 350, 0.55)
            BlzSetSpecialEffectColor(cart, 95, 85, 75)
            sample = Actor(SurvivorStory.supplyModel, x + 260, y + 265, 0.45)
        elseif index == 3 then
            gate = Actor([[Doodads\LordaeronSummer\Terrain\Gate\Gate.mdl]], x + 340, y + 300, 0.65)
            BlzSetSpecialEffectColor(gate, 160, 190, 210)
        else
            for i = 1, 3 do
                local patrol = Actor([[Units\Undead\Skeleton\Skeleton.mdl]], x + 350 + i * 75, y + 430, 0.8)
                BlzSetSpecialEffectYaw(patrol, 0)
            end
            -- A recovered order is never shown when the courier search was not completed.
            if SurvivorExpedition.GetFinding(index) then
                evidence = Actor([[Objects\InventoryItems\tomeBrown\tomeBrown.mdl]], x + 210, y + 230, 0.45)
            end
        end
        local summaries = {
            "무리에서 갈라진 발자국을 확인했다. 단순히 장애물을 피한 것인지, 스스로 판단한 것인지는 아직 알 수 없다.",
            "불탄 보급로의 가장자리로 발자국이 이어졌다. 안야는 지나갈 길을 열고, 퓨트리스는 잔해를 살폈다.",
            "납골당의 문은 부서지지 않았고, 빗장은 안쪽에서 풀려 있었다. 흔적만으로는 그가 무엇을 기억하는지 알 수 없다.",
            SurvivorExpedition.GetFinding(index) and "회수한 명령서에 ‘이탈자’와 ‘회수’라는 말이 남아 있었다. 퓨트리스는 돌아갈 길을, 안야는 마지막 길목을 확보하기로 했다."
                or "적 수색대도 같은 방향으로 이동하고 있었다. 퓨트리스는 돌아갈 길을, 안야는 마지막 길목을 확보하기로 했다.",
        }
        local summary = summaries[index] .. (reply and "\n안야: " .. reply or "")
        Conversation("interlude" .. index, SurvivorStage.Get(index).name, pages, summary, function()
            SurvivorStory.Record(index)
            onComplete()
        end, function(page)
            -- Each click changes an inspection pose. No timed movement advances the story.
            local px, py = x + (page == 1 and 160 or page == 4 and 170 or 235), y + (page == 4 and 210 or 170)
            local ax, ay = x + (page >= 2 and -70 or -180), y + (page >= 2 and 145 or 80)
            Move(putress, px, py); Move(anya, ax, ay)
            Face(putress, px, py, page == 4 and ax or x + 320, page == 4 and ay or y + 295)
            Face(anya, ax, ay, page == 4 and x + 520 or px, page == 4 and y + 360 or py)
            if sample then BlzSetSpecialEffectAlpha(sample, page == 4 and 0 or 255) end
            if evidence then BlzSetSpecialEffectAlpha(evidence, page >= 3 and 0 or 255) end
            -- Keep the unlocked doorway intact; inspecting a latch should not destroy its gate.
            if gate then BlzSetSpecialEffectColor(gate, page >= 2 and 185 or 160, 200, 220) end
            FrameScene(x + (page % 2 == 0 and -20 or 100), y + 130, 1250, 0.45)
        end)
    end
    function SurvivorStory.ShowEnding(hero, onComplete)
        currentStage = 5
        local x, y = BeginScene(hero)
        local anya = Actor(SurvivorStory.heroModel, x - 180, y + 80, 1, Player(0))
        local putress = Actor(SurvivorStory.putressModel, x + 190, y + 130, 0.95, Player(0))
        local figure = Actor(SurvivorStory.figureModel, x + 40, y + 280)
        local cart = Actor(SurvivorStory.transportModel, x - 230, y + 350, 0.75)
        BlzSetSpecialEffectAlpha(cart, 0)
        local entrance = Actor([[Doodads\LordaeronSummer\Terrain\Gate\Gate.mdl]], x + 660, y + 670, 0.75)
        BlzSetSpecialEffectYaw(entrance, math.pi / 2)
        BlzSetSpecialEffectColor(entrance, 125, 135, 150)
        BlzSetSpecialEffectColor(figure, 100, 105, 100)
        BlzPlaySpecialEffect(figure, ANIM_TYPE_DEATH)
        BlzSetSpecialEffectTimeScale(figure, 0.5)
        BlzSetSpecialEffectYaw(anya, 0.8)
        BlzSetSpecialEffectYaw(putress, 2.4)
        local pages = {
            Page("안야", "여기야. 발자국이 이 사람까지 이어져 있어."),
            Page("퓨트리스", "아직 반응이 있네. 지금은 말할 수 없을 것 같군. 지하로 옮겨 상태를 살펴보지."),
            Page("안야", "이름은 깨어나면 직접 물어보겠어. 옮길 때는 조심해."),
            Page("퓨트리스", "알겠네. 돌아갈 길은 확보해 뒀으니, 함께 옮기지."),
            Page("수색 기록", "두 사람은 이름 모를 언데드를 지하로 옮겼다.\n그가 깨어난 뒤의 이야기는 본편에서 이어진다."),
        }
        Conversation("ending", "돌아갈 길", pages,
            "안야와 퓨트리스는 쓰러진 언데드에게 반응이 남아 있음을 확인하고, 함께 지하로 옮겼다.\n이름은 아직 알지 못한다. 그가 깨어난 뒤의 이야기는 본편으로 이어진다.", function()
            SurvivorStory.Record(5)
            onComplete()
        end, function(page)
            if page < 4 then
                local ax, ay = x + (page >= 2 and -70 or -180), y + (page >= 2 and 170 or 80)
                local px, py = x + (page >= 2 and 120 or 190), y + (page >= 2 and 225 or 130)
                Move(anya, ax, ay); Move(putress, px, py)
                Face(anya, ax, ay, x + 40, y + 280)
                Face(putress, px, py, x + 40, y + 280)
            else
                -- The preparation and departure are visible states reached only by clicking.
                local tx, ty = x + (page == 5 and 400 or 20), y + (page == 5 and 505 or 290)
                BlzSetSpecialEffectAlpha(cart, 255)
                Move(cart, tx, ty); Move(figure, tx + 15, ty + 10, 75)
                Move(anya, tx - 150, ty + 35); Move(putress, tx + 150, ty + 35)
                BlzSetSpecialEffectYaw(cart, Atan2(670 - (ty - y), 660 - (tx - x)))
                Face(anya, tx - 150, ty + 35, x + 660, y + 670)
                Face(putress, tx + 150, ty + 35, x + 660, y + 670)
            end
            FrameScene(x + (page == 5 and 320 or 20), y + (page == 5 and 420 or 180), page == 5 and 1450 or 1250, 0.5)
        end)
    end
end
