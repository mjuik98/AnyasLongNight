-- Original side story leading to the campaign meeting, not a canonical retelling.
SurvivorStory = {
    title = "포세이큰: 안야의 긴 밤",
    premise = "스트라솔름 폐허에서 스컬지 무리를 벗어난 언데드가 목격됐다.\n안야가 길을 여는 동안, 퓨트리스는 그가 남긴 흔적을 살핀다.\n그가 왜 홀로 서쪽으로 걷는지는 아직 모른다.",
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
        {clue = "스컬지 무리와 다른 방향으로 이어진 발자국.",
            nextGoal = "불타는 스트라솔름 시가지로 이어지는 발자국을 따라간다."},
        {clue = "불붙은 큰길을 피해 담장 가장자리로 돌아간 흔적.",
            nextGoal = "스트라솔름 납골당에서 냉기의 출처와 이어지는 흔적을 확인한다."},
        {clue = "부서지지 않은 문과 안쪽에서 풀린 빗장. 발자국은 서쪽으로 향했다.",
            nextGoal = "로데론 수도 성문을 넘어 흔적의 주인을 계속 추적한다."},
        {clue = "같은 방향으로 이동한 스컬지 수색대의 흔적.",
            nextGoal = "로데론 수도 하수구의 사슬 관문을 넘어 대상을 찾고, 퓨트리스와 함께 옮길 준비를 한다."},
        {clue = "하수구 봉쇄 너머에서 쓰러진 언데드를 발견했다. 지하 묘실로 옮겼지만, 이름은 아직 알지 못한다."},
    },
}
do
    local clues, sceneEffects, hiddenHero, sceneLocation, camera = {}, {}, nil, nil, nil
    local portraitUnits, portraitHero = {}, nil
    local cameraBounds, cameraFocus, cameraGuardTimer = nil, nil, nil
    local actorStates, motion, sceneSounds, sceneSoundCache = {}, nil, {}, {}
    local sceneGeneration = 0
    local StopMotion
    local currentStage, dialogue, remembered = 1, {}, {}
    -- These preferences survive a retry; the current run's transcript does not.
    local summaryMode, seenScenes = false, {}
    local function Attempt(errors, label, action)
        local ok, message = pcall(action)
        if not ok then errors[#errors + 1] = label .. ": " .. tostring(message) end
    end
    local function CancelTimer(timer, errors, label)
        if not timer then return end
        Attempt(errors, label .. " pause", function() PauseTimer(timer) end)
        Attempt(errors, label .. " destroy", function() DestroyTimer(timer) end)
    end
    local function StopAudio(release)
        local sounds = sceneSounds
        if release then sceneSounds, sceneSoundCache = {}, {} end
        -- Optional local cues must never stop a scene or its gameplay cleanup.
        for _, sound in ipairs(sounds) do pcall(StopSound, sound, release == true, false) end
    end
    local function SceneError(message)
        local ok, cleanup = pcall(SurvivorStory.Cleanup)
        if not ok then message = tostring(message) .. "\nStory cleanup: " .. tostring(cleanup) end
        return message
    end
    local function SceneTimerError(message)
        message = SceneError(message)
        if RunSession and RunSession.Fail then RunSession.Fail(message) else error(message) end
    end
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
    local function StopCameraTransition(errors)
        if not cameraGuardTimer then return end
        local timer = cameraGuardTimer
        cameraGuardTimer = nil
        local ownErrors = errors == nil
        errors = errors or {}
        CancelTimer(timer, errors, "story camera timer")
        if ownErrors and #errors > 0 then error(table.concat(errors, "\n")) end
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
            local ok, message = pcall(function()
                StopCameraTransition()
                if GetLocalPlayer() == Player(SurvivorConfig.playerId) and cameraBounds then
                    SetBounds(x - 64, y - 64, x + 64, y + 64)
                end
            end)
            if not ok then SceneTimerError(message) end
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
        clues[index] = {name = SurvivorStage.Get(index).name,
            text = entry.clue .. (entry.nextGoal and "\n다음 목표: " .. entry.nextGoal or "")}
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
        sceneGeneration = sceneGeneration + 1
        local errors = {}
        -- Invalidate every visual callback before destroying the objects it can reach.
        if StopMotion then StopMotion(false, errors) end
        StopCameraTransition(errors)
        StopAudio(true)
        if SurvivorStage.SetDialogueAmbience then pcall(SurvivorStage.SetDialogueAmbience, false) end
        local hero, restoreHero = hiddenHero, hiddenHero or portraitHero
        local units, effects, states, location = portraitUnits, sceneEffects, actorStates, sceneLocation
        local restoreCamera, restoreBounds, hadPortrait = camera, cameraBounds, portraitHero ~= nil
        portraitUnits, sceneEffects, actorStates, sceneLocation = {}, {}, {}, nil
        hiddenHero, portraitHero, camera, cameraBounds, cameraFocus = nil, nil, nil, nil, nil
        if hadPortrait then Attempt(errors, "portrait selection", function()
            if GetLocalPlayer() == Player(SurvivorConfig.playerId) then ClearSelection() end
        end) end
        if hero then Attempt(errors, "hero visibility", function()
            if GetUnitTypeId(hero) ~= 0 then ShowUnit(hero, true) end
        end) end
        if restoreHero then Attempt(errors, "hero selection", function()
            if GetUnitTypeId(restoreHero) ~= 0 and UnitAlive(restoreHero)
                and GetLocalPlayer() == Player(SurvivorConfig.playerId) then
                ClearSelection()
                SelectUnit(restoreHero, true)
            end
        end) end
        -- Detach the native portrait from the proxy before removing that unit.
        -- SurvivorUI restores its HUD containers only after this cleanup returns.
        for _, unit in pairs(units) do
            Attempt(errors, "portrait visibility", function()
                if GetUnitTypeId(unit) ~= 0 then ShowUnit(unit, false) end
            end)
            Attempt(errors, "portrait unit", function()
                if GetUnitTypeId(unit) ~= 0 then RemoveUnit(unit) end
            end)
        end
        for _, effect in ipairs(effects) do
            -- DestroyEffect can leave the model's death animation on screen.
            -- Hide geometry and move any lingering emitters below the terrain first.
            Attempt(errors, "story effect visibility", function() BlzSetSpecialEffectAlpha(effect, 0) end)
            local state = states[effect]
            if state then Attempt(errors, "story effect position", function()
                BlzSetSpecialEffectPosition(effect, state.x, state.y, -10000)
            end) end
            -- Each operation is independent: a failed hide must not prevent removal.
            Attempt(errors, "story effect", function() DestroyEffect(effect) end)
        end
        if location then Attempt(errors, "story location", function() RemoveLocation(location) end) end
        if restoreCamera and GetLocalPlayer() == Player(SurvivorConfig.playerId) then
            if restoreBounds then Attempt(errors, "camera bounds", function()
                SetBounds(restoreBounds.minX, restoreBounds.minY, restoreBounds.maxX, restoreBounds.maxY)
            end) end
            Attempt(errors, "game camera", function() ResetToGameCamera(0) end)
            for field, value in pairs(restoreCamera) do Attempt(errors, "camera field", function()
                SetCameraField(field, value, 0)
            end) end
            Attempt(errors, "hero camera", function()
                if restoreHero and GetUnitTypeId(restoreHero) ~= 0 and UnitAlive(restoreHero) then
                    SetCameraPosition(GetUnitX(restoreHero), GetUnitY(restoreHero))
                    SetCameraTargetController(restoreHero, 0, 0, false)
                end
            end)
        end
        if #errors > 0 then error(table.concat(errors, "\n")) end
    end
    local function BeginScene(hero)
        SurvivorStory.Cleanup()
        assert(hero and GetUnitTypeId(hero) ~= 0 and UnitAlive(hero), "Story scene needs the live gameplay hero")
        hiddenHero = hero
        ShowUnit(hero, false)
        if SurvivorStage.SetDialogueAmbience then pcall(SurvivorStage.SetDialogueAmbience, true) end
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
        -- Text-only compatibility callers retain their current shot.
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
        actorStates[effect] = {x = x, y = y, height = 0, yaw = 0}
        BlzSetSpecialEffectScale(effect, scale or 1)
        if colorPlayer then BlzSetSpecialEffectColorByPlayer(effect, colorPlayer) end
        return effect
    end
    local function Scenery(key, model, x, y, scale, angle, tint)
        -- Landmarks belong to the stage; scene cleanup only removes actors and picked-up props.
        -- Text-only/presentation callers can omit the optional stage scenery API.
        if SurvivorStage.SceneProp then return SurvivorStage.SceneProp(key, model, x, y, scale, angle, tint) end
    end
    local function Move(effect, x, y, height)
        MoveLocation(sceneLocation, x, y)
        BlzSetSpecialEffectPosition(effect, x, y, GetLocationZ(sceneLocation) + (height or 0))
        local state = assert(actorStates[effect], "Missing story actor state")
        state.x, state.y, state.height = x, y, height or 0
    end
    local function Yaw(effect, angle)
        BlzSetSpecialEffectYaw(effect, angle)
        assert(actorStates[effect], "Missing story actor state").yaw = angle
    end
    local function Animation(effect, animation)
        -- Native call failures fall back to idle; the engine must confirm each model's actual sequences.
        if animation and animation ~= ANIM_TYPE_STAND then
            if pcall(BlzPlaySpecialEffect, effect, animation) then return end
        end
        BlzPlaySpecialEffect(effect, ANIM_TYPE_STAND)
    end
    -- Built-in path evidence: https://gist.github.com/Frotty/a622509439dbf29c609a0292a3ccd893
    local cuePaths = {
        step1 = [[Sound\Units\Footsteps\HeroStep1.wav]],
        step2 = [[Sound\Units\Footsteps\HeroStep2.wav]],
        inspect = [[Sound\Interface\PickUpItem.wav]],
    }
    local function Cue(kind)
        if GetLocalPlayer() ~= Player(SurvivorConfig.playerId) or type(CreateSound) ~= "function" then return end
        local sound = sceneSoundCache[kind]
        local ok = pcall(function()
            if not sound then
                sound = CreateSound(cuePaths[kind], false, false, false, 0, 0, "DefaultEAXON")
                if not sound or sound == 0 then return end
                sceneSoundCache[kind] = sound
                sceneSounds[#sceneSounds + 1] = sound
            else
                StopSound(sound, false, false)
            end
            SetSoundVolume(sound, kind == "inspect" and 14 or 18)
            StartSound(sound)
        end)
        if not ok and sound then pcall(StopSound, sound, false, false) end
    end
    local function Pose(effect, x, y, targetX, targetY, options)
        options = options or {}
        return {effect = effect, x = x, y = y, height = options.height or 0,
            yaw = Atan2(targetY - y, targetX - x), gesture = options.gesture,
            animated = options.animated ~= false}
    end
    StopMotion = function(snap, errors)
        local previous = motion
        motion = nil -- A saved callback cannot reach either the old or the next page.
        StopAudio()
        if not previous then return end
        local ownErrors = errors == nil
        errors = errors or {}
        CancelTimer(previous.timer, errors, "story motion timer")
        if snap then Attempt(errors, "story final pose", previous.finish) end
        if ownErrors and #errors > 0 then error(table.concat(errors, "\n")) end
    end
    local function Choreograph(targets, duration, instant, cue, after)
        StopMotion(true)
        local function Finish()
            for _, target in ipairs(targets) do
                Move(target.effect, target.x, target.y, target.height)
                Yaw(target.effect, target.yaw)
                if target.animated then Animation(target.effect, ANIM_TYPE_STAND) end
            end
            if after then after() end
        end
        if instant then Finish(); return end
        local transitions, walking = {}, false
        for _, target in ipairs(targets) do
            local state = assert(actorStates[target.effect], "Missing story actor state")
            local moving = (target.x - state.x)^2 + (target.y - state.y)^2 > 1
            transitions[#transitions + 1] = {target = target, x = state.x, y = state.y, height = state.height,
                yaw = state.yaw, turn = (target.yaw - state.yaw + math.pi) % (2 * math.pi) - math.pi}
            if target.animated then
                Animation(target.effect, moving and ANIM_TYPE_WALK or target.gesture or ANIM_TYPE_STAND)
                walking = walking or moving
            end
        end
        local cues = cue == "steps" and walking
            and {{at = duration * 0.22, kind = "step1"}, {at = duration * 0.65, kind = "step2"}}
            or cue == "inspect" and {{at = duration * 0.25, kind = "inspect"}} or {}
        local timer = CreateTimer()
        local current = {timer = timer, finish = Finish, elapsed = 0}
        motion = current
        -- Native visual time runs while the session/ALICE clocks remain paused. It never advances a page.
        TimerStart(timer, 0.03, true, function()
            if motion ~= current then return end
            local ok, message = pcall(function()
                current.elapsed = math.min(duration, current.elapsed + 0.03)
                local progress = current.elapsed / duration
                local eased = progress * progress * (3 - 2 * progress)
                for _, entry in ipairs(transitions) do
                    local target = entry.target
                    Move(target.effect, entry.x + (target.x - entry.x) * eased,
                        entry.y + (target.y - entry.y) * eased, entry.height + (target.height - entry.height) * eased)
                    Yaw(target.effect, entry.yaw + entry.turn * eased)
                end
                for _, pending in ipairs(cues) do
                    if not pending.played and current.elapsed >= pending.at then
                        pending.played = true
                        Cue(pending.kind)
                    end
                end
                if current.elapsed >= duration then
                    motion = nil
                    local errors = {}
                    CancelTimer(timer, errors, "story motion timer")
                    Finish()
                    if #errors > 0 then error(table.concat(errors, "\n")) end
                end
            end)
            if not ok then SceneTimerError(message) end
        end)
    end
    local function CreateScene(action)
        local ok, message = pcall(action)
        if not ok then error(SceneError(message)) end
    end
    local function Page(speaker, text) return {speaker = speaker, text = text} end
    local function RememberPages(pages)
        for _, page in ipairs(pages) do SurvivorStory.Remember(page.speaker, page.text) end
    end
    local function Conversation(key, title, pages, summary, onComplete, onPage, hero, finishLabel)
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
                if onPage then onPage(concise and #pages or page, concise) end
            end)
            if not ok then error(SceneError(message)) end
        end
        local ok, message = pcall(function()
            BeginPortraits(hero or hiddenHero, not concise)
            local generation = sceneGeneration
            SurvivorUI.ShowConversation(title .. (concise and " · 요약" or ""), shown, function()
                seenScenes[key] = true
                onComplete()
            end, RenderPage, function()
                -- A replaced UI can still hold an older close hook. It must not
                -- remove the actors or camera state of a newer story scene.
                if sceneGeneration == generation then SurvivorStory.Cleanup() end
            end, finishLabel)
        end)
        if not ok then error(SceneError(message)) end
    end
    function SurvivorStory.ShowBriefing(hero, onComplete)
        if type(hero) == "function" and onComplete == nil then onComplete, hero = hero, nil end
        SurvivorStory.Cleanup()
        local pages = {
            Page("퓨트리스", "스트라솔름 폐허에서 스컬지 무리를 벗어난 언데드가 있다더군. 여왕님께서 데려오라 하셨네."),
            Page("안야", "내가 길을 열게. 넌 흔적을 살피면서 따라와."),
            Page("퓨트리스", "리치왕의 목소리를 떨쳐 냈다면 꽤 흥미롭겠군. 연구소에서 살펴볼 만하겠어."),
            Page("안야", "연구 얘긴 만나고 나서 해. 무슨 일이 있었는지부터 들어 보자."),
        }
        CreateScene(function()
            local render
            if hero then
                local x, y = BeginScene(hero)
                local anya = Actor(SurvivorStory.heroModel, x - 160, y + 95, 1, Player(0))
                local putress = Actor(SurvivorStory.putressModel, x + 125, y + 165, 0.95, Player(0))
                Yaw(anya, Atan2(70, 285)); Yaw(putress, Atan2(100, 190))
                Animation(anya, ANIM_TYPE_STAND); Animation(putress, ANIM_TYPE_STAND)
                Scenery("briefing-grave", [[Doodads\Cityscape\Props\CityGrave\CityGrave0.mdl]], x - 285, y + 315, 0.6)
                for i = 1, 3 do
                    Scenery("briefing-footprint-" .. i, [[Objects\Spawnmodels\Other\IllidanFootprint\IllidanSpawnFootPrint0.mdl]],
                        x + 245 + i * 55, y + 270 + i * 24, 0.4, nil, {90, 95, 85})
                end
                render = function(page, concise)
                    if page == 1 then
                        Choreograph({Pose(putress, x + 125, y + 165, x - 160, y + 95)}, 0.36, concise)
                    elseif page == 2 then
                        Choreograph({Pose(anya, x - 70, y + 165, x + 340, y + 330)}, 0.54, concise, "steps")
                    elseif page == 3 then
                        Choreograph({Pose(putress, x + 125, y + 165, x + 355, y + 325,
                            {gesture = ANIM_TYPE_SPELL})}, 0.48, concise, "inspect")
                    else
                        Choreograph({Pose(anya, x + 80, y + 220, x + 500, y + 380),
                            Pose(putress, x + 125, y + 165, x + 80, y + 220)}, 0.66, concise, "steps")
                    end
                    if page == 1 or page == 4 then
                        FrameScene(x + (page == 4 and 110 or 20), y + (page == 4 and 210 or 160),
                            page == 4 and 1320 or 1280, concise and 0 or 0.48)
                    end
                end
            end
            Conversation("briefing", "수색을 시작하며", pages,
                "어둠의 여왕의 명으로 안야와 퓨트리스가 스트라솔름 폐허로 수색에 나섰다. 안야는 앞서 길을 열고, 퓨트리스는 흔적을 살피기로 했다.\n안야는 찾아낸 언데드에게 먼저 말을 걸어 볼 생각이었다.",
                onComplete, render, hero, "수색 준비")
        end)
    end
    local scenes = {
        {
            Page("퓨트리스", "여기서 무리와 갈라졌군. 다른 놈들은 폐허를 맴도는데, 혼자 묘지를 빠져나갔어."),
            Page("안야", "우리가 찾는 건 혼자 걸어간 쪽이겠네."),
            Page("퓨트리스", "그렇겠지. 정신까지 온전할지는 두고 봐야겠지만."),
            Page("안야", "일단 따라가 보자. 불타는 스트라솔름 시가지로 이어져."),
        },
        {
            Page("퓨트리스", "불붙은 큰길을 두고 담장 가장자리로 꺾였군. 불길을 피해 갔어."),
            Page("안야", "돌아가면 한참 멀 텐데. 급하게 도망친 건 아닌가 봐."),
            Page("퓨트리스", "불이 두려운 걸지도 모르지. 이 도시가 불타던 날을 기억한다면 말이야."),
            Page("안야", "계속 따라가 보자. 저 앞이 스트라솔름 납골당이야."),
        },
        {
            Page("퓨트리스", "문은 부수지 않았네. 안쪽에서 빗장을 풀고 나갔어."),
            Page("안야", "문을 여는 법은 기억한 걸까?"),
            Page("퓨트리스", "머리보다 손이 먼저 움직인 걸지도 모르지. 문단속이 몸에 밴 자였나 보군."),
            Page("안야", "발자국은 서쪽, 로데론 수도로 가. 어디로 가는지 아는 거야."),
        },
        {
            Page("퓨트리스", "스컬지 수색대가 성문을 지나갔군. 우리와 같은 쪽이야."),
            Page("안야", "하수구로 내려갔다면 성 안 길을 아는 사람이야. 저놈들이 먼저 찾게 둘 순 없어."),
            Page("퓨트리스", "나는 돌아갈 길을 열어 두겠네. 수레도 끌고 가지."),
            Page("안야", "좋아. 로데론 수도 하수구의 사슬 관문에서 만나. 내가 먼저 가 볼게."),
        },
    }
    local optionalObservations = {
        "자네가 본 발자국 말이야. 쓰러진 묘비를 돌아갔군. 나머지는 그대로 밟고 갔고.",
        "자네가 찾아낸 길로 계속 갔군. 재가 식은 담장 밑만 밟고 지나갔어.",
        "빗장에 손가락 자국이 남았군. 자네가 찾은 흔적이 이거였나.",
        "명령서엔 ‘이탈자 회수’라… 이름은 한 줄도 없군.",
    }
    function SurvivorStory.ShowInterlude(index, hero, onComplete)
        currentStage = index
        local source = assert(scenes[index], "Unknown interlude")
        local pages = {}
        for i, page in ipairs(source) do pages[i] = Page(page.speaker, page.text) end
        -- Optional discoveries change what Anya knows, never invent a completed search.
        local finding, reply = SurvivorExpedition.GetFinding(index), SurvivorExpedition.GetReply(index)
        if finding then pages[1] = Page("퓨트리스", optionalObservations[index]) end
        if reply then pages[2] = Page("안야", reply) end
        -- Every discovery branch closes on the same concrete route and shared task.
        CreateScene(function()
            local x, y = BeginScene(hero)
            local anya = Actor(SurvivorStory.heroModel, x - 180, y + 80, 1, Player(0))
            local putress = Actor(SurvivorStory.putressModel, x + 150, y + 130, 0.95, Player(0))
            Yaw(anya, 0); Yaw(putress, math.pi)
            Animation(anya, ANIM_TYPE_STAND); Animation(putress, ANIM_TYPE_STAND)
            local gate, evidence, sample
            if index == 1 then
                for i = 1, 5 do
                    Scenery("interlude1-footprint-" .. i, [[Objects\Spawnmodels\Other\IllidanFootprint\IllidanSpawnFootPrint0.mdl]],
                        x + i * 55, y + 250 + i * 22, 0.4, nil, {90, 95, 85})
                end
                Scenery("interlude1-grave", [[Doodads\Cityscape\Props\CityGrave\CityGrave0.mdl]], x - 300, y + 280, 0.65)
            elseif index == 2 then
                Scenery("interlude2-rubble", [[Doodads\Ruins\Rocks\CliffRubble_Single\CliffRubble_Single0.mdl]], x + 350, y + 280, 0.65)
                Scenery("interlude2-crater", [[Doodads\Dungeon\Rocks\Cave_FieryCrator\Cave_FieryCrator.mdl]], x + 370, y + 330, 0.35)
                Scenery("interlude2-cart", SurvivorStory.transportModel, x + 380, y + 350, 0.55, nil, {95, 85, 75})
                sample = Actor(SurvivorStory.supplyModel, x + 260, y + 265, 0.45)
            elseif index == 3 then
                gate = Scenery("interlude3-gate", [[Doodads\LordaeronSummer\Terrain\Gate\Gate.mdl]],
                    x + 340, y + 300, 0.65, nil, {160, 190, 210})
            else
                for i = 1, 3 do
                    local patrol = Actor([[Units\Undead\Skeleton\Skeleton.mdl]], x + 350 + i * 75, y + 430, 0.8)
                    BlzSetSpecialEffectYaw(patrol, 0)
                end
                -- A recovered order is never shown when the courier search was not completed.
                if finding then
                    evidence = Actor([[Objects\InventoryItems\tomeBrown\tomeBrown.mdl]], x + 210, y + 230, 0.45)
                end
            end
            local summaries = {
                "스트라솔름 폐허에서 무리와 갈라진 발자국을 확인했다. 단순히 장애물을 피한 것인지, 스스로 판단한 것인지는 아직 알 수 없다.",
                "불타는 시가지의 큰길 대신 담장 가장자리로 발자국이 이어졌다. 안야는 지나갈 길을 열고, 퓨트리스는 잔해를 살폈다.",
                "납골당의 문은 부서지지 않았고, 빗장은 안쪽에서 풀려 있었다. 발자국은 서쪽으로, 로데론 수도를 향해 이어졌다.",
                "스컬지 수색대도 같은 방향으로 이동하고 있었다. 퓨트리스는 돌아갈 길을, 안야는 하수구의 마지막 봉쇄를 넘을 길을 확보하기로 했다.",
            }
            local summary = (finding or summaries[index]) .. (reply and "\n안야: " .. reply or "")
                .. "\n다음 목표: " .. SurvivorStory.stages[index].nextGoal
            Conversation("interlude" .. index, SurvivorStage.Get(index).name, pages, summary, function()
                SurvivorStory.Record(index)
                onComplete()
            end, function(page, concise)
                local function Props()
                    if sample then BlzSetSpecialEffectAlpha(sample, page == 4 and 0 or 255) end
                    if evidence then BlzSetSpecialEffectAlpha(evidence, page >= 3 and 0 or 255) end
                    -- Inspection leaves the unlocked doorway intact.
                    if gate then BlzSetSpecialEffectColor(gate, page >= 2 and 185 or 160, 200, 220) end
                end
                if page == 1 then
                    Choreograph({Pose(putress, x + 235, y + 170, x + 320, y + 295)}, 0.54, concise, "steps", Props)
                elseif page == 2 then
                    Choreograph({Pose(anya, x - 70, y + 145, x + 320, y + 295)}, 0.54, concise, "steps", Props)
                elseif page == 3 then
                    local detailX, detailY = index == 2 and x + 260 or index == 4 and x + 210 or x + 340,
                        index == 2 and y + 265 or index == 4 and y + 230 or y + 300
                    Choreograph({Pose(putress, x + 235, y + 170, detailX, detailY,
                        {gesture = ANIM_TYPE_SPELL})}, 0.48, concise, "inspect", Props)
                else
                    Choreograph({Pose(anya, x + 10, y + 220, x + 520, y + 360),
                        Pose(putress, x + 170, y + 210, x + 10, y + 220)}, 0.66, concise, "steps", Props)
                end
                if page == 1 or page == 2 or page == 4 then
                    FrameScene(x + (page == 4 and 160 or page == 2 and 105 or 70),
                        y + (page == 4 and 230 or page == 2 and 210 or 160), page == 2 and 1120 or 1320,
                        concise and 0 or 0.48)
                end
            end, hero, "보상 선택")
        end)
    end
    function SurvivorStory.ShowEnding(hero, onComplete)
        currentStage = 5
        CreateScene(function()
            local x, y = BeginScene(hero)
            local anya = Actor(SurvivorStory.heroModel, x - 180, y + 80, 1, Player(0))
            local putress = Actor(SurvivorStory.putressModel, x + 190, y + 130, 0.95, Player(0))
            local figure = Actor(SurvivorStory.figureModel, x + 40, y + 280)
            local cart = Actor(SurvivorStory.transportModel, x - 230, y + 350, 0.75)
            BlzSetSpecialEffectAlpha(cart, 0)
            Scenery("ending-gate", [[Doodads\LordaeronSummer\Terrain\Gate\Gate.mdl]],
                x + 660, y + 670, 0.75, math.pi / 2, {125, 135, 150})
            BlzSetSpecialEffectColor(figure, 100, 105, 100)
            BlzPlaySpecialEffect(figure, ANIM_TYPE_DEATH)
            BlzSetSpecialEffectTimeScale(figure, 0.5)
            Yaw(anya, 0.8); Yaw(putress, 2.4)
            Animation(anya, ANIM_TYPE_STAND); Animation(putress, ANIM_TYPE_STAND)
            local pages = {
                Page("안야", "여기 있어. 발자국이 이 사람한테서 끊겼어. 경비대 휘장을 달고 있네."),
                Page("퓨트리스", "수도 경비대였군. 그래서 하수구 길을 알았어. 반응은 있지만… 언제 깨어날진 모르겠네."),
                Page("안야", "스트라솔름에서 여기까지 혼자 돌아온 거야. 이름은 깨어나면 물어보자."),
                Page("퓨트리스", "수레는 준비됐네. 자, 반대쪽을 잡게."),
                Page("수색 기록", "두 사람은 그를 하수구 아래 로데론 지하 묘실로 옮겼다.\n이름을 묻는 일은 그가 눈을 뜬 뒤로 미뤘다."),
            }
            Conversation("ending", "돌아갈 길", pages,
                "안야와 퓨트리스는 하수구에서 쓰러진 언데드를 로데론 지하 묘실로 옮겼다.\n그가 깨어나면 이름을 묻기로 했다.", function()
                SurvivorStory.Record(5)
                onComplete()
            end, function(page, concise)
                if page == 1 then
                    Choreograph({Pose(anya, x - 70, y + 170, x + 40, y + 280)}, 0.54, concise, "steps")
                elseif page == 2 then
                    Choreograph({Pose(putress, x + 120, y + 225, x + 40, y + 280)}, 0.54, concise, "steps")
                elseif page == 3 then
                    Choreograph({Pose(putress, x + 120, y + 225, x + 40, y + 280,
                        {gesture = ANIM_TYPE_SPELL})}, 0.48, concise, "inspect")
                else
                    -- Loading and departure are separate actions reached only by a manual page click.
                    local tx, ty = x + (page == 5 and 400 or 20), y + (page == 5 and 505 or 290)
                    BlzSetSpecialEffectAlpha(cart, 255)
                    Choreograph({Pose(cart, tx, ty, x + 660, y + 670, {animated = false}),
                        Pose(figure, tx + 15, ty + 10, x + 660, y + 670, {height = 75, animated = false}),
                        Pose(anya, tx - 150, ty + 35, x + 660, y + 670),
                        Pose(putress, tx + 150, ty + 35, x + 660, y + 670)}, 0.66, concise, "steps")
                end
                if page == 1 or page == 2 or page == 5 then
                    FrameScene(x + (page == 5 and 320 or 20), y + (page == 5 and 420 or 180),
                        page == 5 and 1450 or page == 2 and 1120 or 1250, concise and 0 or 0.48)
                end
            end, hero, "결과 보기")
        end)
    end
end
