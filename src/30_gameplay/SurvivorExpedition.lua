-- Optional discoveries share the run clock. They never gate the main story.
SurvivorExpedition = {}
do
    local chapters = {
        {name = "묘비 뒤의 발자국", action = "발자국 세 곳을 차례로 통과", mode = "trail", count = 3,
            beats = {"여기선 걸음이 느려졌어.", "이쪽이네. 여기서 무리와 떨어졌어.", "묘비를 돌아갔네. 다른 놈들은 그냥 밟고 지나갔는데."},
            advantage = "시체 수집자의 첫 폭발 예고 +1초", insight = "터지겠어. 뒤로 빠져!",
            finding = "발자국은 쓰러진 묘비를 돌아갔지만, 무리는 그 위를 밟고 지나갔다.",
            reply = "피해 갈 줄은 알았네. 아무렇게나 걷는 건 아니야.",
            sceneReply = "그럼 피할 줄은 안다는 거네.",
            relic = "이름 없는 묘의 봉인", riskLine = "묘지가 깨어난다. 챙기고 버티자.", temptation = "묘비 아래에서 쇠붙이가 울린다. 봉인을 건드리면 묘지가 깨어날 것이다.",
            putress = {beats = {"보폭이 줄었군. 여기서 망설였어.", "여기서 무리와 갈라졌어. 리치왕의 부름을 뿌리친 건가.", "묘비를 피해 돌아갔군. 다른 시체들은 그냥 짓밟았는데."},
                insight = "부패 가스가 찼군. 터지기 전에 물러나!", reply = "장애물을 보고 피했어. 판단력이 남아 있다는 뜻이지.",
                riskLine = "봉인이 풀렸군. 시체들이 몰려오기 전에 챙겨 두지."}},
        {name = "재 속의 우회로", action = "불길 바깥의 표식 네 곳을 통과", mode = "route", count = 4,
            beats = {"이쪽은 식었어.", "가까운 길엔 아직 불이 남았네.", "좀 돌아가도 발자국은 이어져.", "불길 없는 길은 여기뿐이네."},
            advantage = "도살자의 첫 돌진 잔불 제거", insight = "불길 밖으로! 아까 본 길로 빠지자.",
            finding = "재가 얇게 쌓인 담장 가장자리로 발자국이 이어졌다. 불길 쪽으로 되돌아간 흔적은 없었다.",
            reply = "무작정 헤맨 것 같진 않아. 계속 한쪽으로 가고 있어.",
            sceneReply = "불길을 피해 돌아가면서도 방향은 잃지 않았어.",
            relic = "잿불 속의 봉인함", riskLine = "열기가 번진다. 빨리 챙기고 빠지자.", temptation = "불길 속에 남은 봉인함이 열기를 뿜는다. 여는 동안 추격자들이 냄새를 맡을 것이다.",
            putress = {beats = {"재가 식었군. 이쪽은 지나갈 만해.", "지름길은 아직 타고 있어. 저긴 피했겠지.", "멀리 돌았지만 발자국은 끊기지 않았군.", "불길 없는 길은 이것 하나. 우연은 아니야."},
                insight = "불길 밖으로! 아까 확인한 길로 빠지지.", reply = "헤맨 게 아니야. 줄곧 한 방향을 고집하고 있어.",
                riskLine = "열기가 번지는군. 시료가 타기 전에 챙기지."}},
        {name = "얼어붙은 빗장", action = "주변에서 누적 8초 조사 · 근처 적 처치 시 가속", mode = "study", count = 1, seconds = 8,
            beats = {"문 안쪽으로 피할 수 있겠어. 기억해 둬야겠네."},
            advantage = "파수꾼의 첫 냉기 파동 안전 각도 2배", insight = "냉기가 온다. 아까 그 문 쪽으로!",
            finding = "빗장을 덮은 서리에 손가락 자국이 남아 있었다. 문을 부순 흔적은 없었다.",
            reply = "빗장을 잡을 줄은 알았네. 어디로 나가는지도 알았을까?",
            sceneReply = "빗장을 직접 풀었네. 나갈 곳이 정해져 있었던 걸까?",
            relic = "서리에 잠긴 성물", riskLine = "얼음이 깨졌어. 몰려오기 전에 버텨야 해.", temptation = "얼음 아래 성물이 희미하게 떨린다. 얼음을 깨면 납골당의 망령들이 몰려올 것이다.",
            putress = {beats = {"문 안쪽은 냉기가 덜 닿겠군. 기억해 두지."},
                insight = "냉기 파동이다. 아까 그 문 안쪽으로!", reply = "손으로 빗장을 풀었군. 행선지까지 기억하고 있었을까.",
                riskLine = "얼음이 깨졌군. 망령들이 몰려온다. 버텨."}},
        {name = "수색대의 전령", action = "이동하는 전령을 추격해 처치", mode = "courier", count = 3,
            beats = {"지원 요청이었네. 이젠 전해질 일 없겠어."},
            advantage = "추적대장의 첫 지원병 호출 차단", insight = "헛수고야. 그 전령은 돌아오지 않아.",
            finding = "전령의 명령서에 ‘이탈자’와 ‘회수’라는 말이 남아 있었다. 이름은 없었다. 지원 요청은 전달되지 않았다.",
            reply = "저놈들 손에 넘어가게 둘 순 없지. 서둘러야겠어.",
            sceneReply = "이름도 모르면서 쫓는 거네. 저놈들보다 먼저 찾아야 해.",
            relic = "수색대의 압수품", riskLine = "경보가 울렸어. 챙기고 바로 빠지자.", temptation = "봉인된 압수품에 감시의 마력이 남아 있다. 손을 대면 경보가 울릴 것이다.",
            putress = {beats = {"지원 요청서군. 이제 받아 볼 자는 없겠지."},
                insight = "헛수고다. 네 전령은 벌써 썩어 가고 있어.", reply = "스컬지에게 넘겨줄 순 없지. 그자는 여왕님께 데려간다.",
                riskLine = "경보 마법이군. 챙기고 바로 빠지지."}},
        {name = "끊어진 사슬", action = "봉인 세 곳에서 각각 누적 2초 해제", mode = "seals", count = 3, seconds = 2,
            beats = {"하나 풀렸어. 아직 사슬이 팽팽하네.", "이것도 같은 사슬이네.", "가운데가 느슨해졌어. 저쪽으로 빠질 수 있겠네."},
            advantage = "감시자의 첫 사슬 봉쇄에서 중앙 줄 제거", insight = "가운데로! 풀어 둔 사슬 쪽이야.",
            finding = "풀린 사슬의 끝이 하수구 바닥에 놓여 있었다. 그 너머 물길을 따라 한 사람의 발자국만 이어졌다.",
            reply = "이쪽이야. 이제 얼마 안 남았어.",
            relic = "감시자의 예비 봉인", riskLine = "감시자들이 눈치챘어. 조금만 버티자.", temptation = "마지막 봉인이 길목을 감시한다. 부수면 힘을 얻겠지만, 감시자들을 자극할 것이다.",
            putress = {beats = {"하나 풀었군. 사슬은 아직 팽팽해.", "같은 주문으로 묶인 사슬이야.", "가운데가 느슨해졌어. 저리로 빠져나갈 수 있겠군."},
                insight = "가운데로! 풀어 둔 사슬 쪽이다.", reply = "발자국이 하나뿐이군. 거의 다 따라잡았어.",
                riskLine = "감시자들이 눈치챘군. 조금만 버티면 돼."}},
    }
    -- The route layout lives in encounters[].search; each chapter's text and mode must match it.
    for index, chapter in ipairs(chapters) do
        local search = assert(SurvivorConfig.encounters[index].search, "Missing search layout for chapter " .. index)
        assert(search.count == chapter.count and (search.landmark == true) == (chapter.mode == "study"),
            "Chapter " .. index .. " disagrees with its search layout")
    end
    -- Risk challenge text, e.g. "적 피해 +25% · 출현량 +35%" (SurvivorConfig.riskChallenge).
    local function RiskPenalty(separator)
        local challenge = SurvivorConfig.riskChallenge
        local function Percent(multiplier) return math.floor((multiplier - 1) * 100 + 0.5) end
        return string.format("적 피해 +%d%%%s출현량 +%d%%", Percent(challenge.enemyDamage), separator, Percent(challenge.spawnRate))
    end
    -- Lines outside a chapter, per hero; a hero without an entry speaks the Anya text.
    local heroLines = {anya = {riskDone = "챙겼어. 이제 빠지자."}, putress = {riskDone = "회수했다. 이제 물러나지."}}
    -- combat is the run owner's port {grantRecovery, spawnCourier, releaseCourier};
    -- this module never reaches into SurvivorCombat, which already queries it.
    -- Everything one run owns: the journal records per stage, then the current stage's
    -- hero, clock, ports and markers. Reset swaps in a fresh NewRun(); EndStage swaps in
    -- one that carries only the journal and stage index forward (RecordReward and the
    -- journal still read them), so a new field needs no second reset list.
    local function NewRun(records, stage)
        return {
            records = records or {}, stage = stage,
            hero = nil, started = nil, rewardCallback = nil, combat = nil,
            objective = nil, risk = nil, pulse = 0,
        }
    end
    local run = NewRun()
    local function Near(unit, point, radius)
        return (GetUnitX(unit) - point.x)^2 + (GetUnitY(unit) - point.y)^2 <= radius^2
    end
    local function RemoveMarker(point)
        if not point then return end
        if point.effect then DestroyEffect(point.effect); point.effect = nil end
        if point.tag then DestroyTextTag(point.tag); point.tag = nil end
    end
    local function Marker(point, text, red, green, blue)
        point.effect = point.courier and AddSpecialEffectTarget([[Abilities\Spells\Other\TalkToMe\TalkToMe.mdl]], point.courier, "overhead")
            or AddSpecialEffect([[Abilities\Spells\Other\GeneralAuraTarget\GeneralAuraTarget.mdl]], point.x, point.y)
        BlzSetSpecialEffectScale(point.effect, 1.5)
        BlzSetSpecialEffectColor(point.effect, red, green, blue)
        point.tag = CreateTextTag()
        SetTextTagText(point.tag, text, 0.022)
        SetTextTagPos(point.tag, point.x, point.y, 90)
        SetTextTagColor(point.tag, red, green, blue, 255)
        SetTextTagPermanent(point.tag, true)
    end
    local function Place(angle)
        return SurvivorStage.FindPoint(angle, 1000, run.objective and run.objective.points or {})
    end
    local function Say(text)
        -- Presentation: also reached from kill callbacks inside weapon hit loops.
        SurvivorUtil.Present("expedition notice", SurvivorUI.Notify, text)
    end
    -- The playing hero speaks its own line; chapter[heroId] overrides the Anya text.
    -- records[stage].reply keeps the Anya text because story scenes reuse it.
    local function Speak(chapter, key, index)
        local id, profile = SurvivorUtil.HeroOf(run.hero)
        local lines = chapter and chapter[id] or heroLines[id]
        local text = lines and lines[key]
        if index then text = text and text[index] end
        if text == nil then
            text = chapter and chapter[key] or heroLines.anya[key]
            if index then text = text[index] end
        end
        SurvivorUtil.Present("expedition line", SurvivorUI.Say, profile.name, text)
    end
    local function Locate(point)
        local dx, dy = point.x - GetUnitX(run.hero), point.y - GetUnitY(run.hero)
        local direction = math.abs(dx) > math.abs(dy) and (dx > 0 and "동쪽" or "서쪽") or (dy > 0 and "북쪽" or "남쪽")
        return direction .. " " .. math.floor(math.sqrt(dx * dx + dy * dy))
    end
    function SurvivorExpedition.RiskActive() return run.risk ~= nil and run.risk.state == "active" end
    function SurvivorExpedition.HasRiskNotice() return run.risk ~= nil and (run.risk.state == "offered" or run.risk.state == "active") end
    local function RiskWindow()
        -- Keep a full 30-second challenge before the boss, with time to accept it.
        local closes = math.min(180, SurvivorConfig.StageTiming(run.stage).bossStart - 30)
        return math.min(95, closes - 60), closes
    end
    function SurvivorExpedition.RiskOffer()
        if not SurvivorUtil.UnitLive(run.hero) or not RunSession.IsRunning()
            or not run.risk or run.risk.state ~= "offered" then return nil end
        local age = RunSession.GetElapsed() - run.started
        local opens, closes = RiskWindow()
        if age < opens or age >= closes or not Near(run.hero, run.risk, 140) then return nil end
        local chapter = chapters[run.stage]
        local reward = SurvivorConfig.encounters[run.stage].riskReward.label
        return {name = chapter.relic, remaining = math.ceil(closes - age), seconds = 30,
            text = chapter.relic .. "\n30초 생존: " .. reward .. " 장비 택 1\n" .. RiskPenalty(" · ") .. "\n장소를 벗어나도 도전은 유지됩니다."}
    end
    function SurvivorExpedition.AcceptRisk()
        if not SurvivorExpedition.RiskOffer() then return false end
        -- Recheck live offer, position and run state when the explicit action arrives.
        run.risk.state, run.risk.untilTime = "active", RunSession.GetElapsed() + 30
        run.records[run.stage].risk = "도전 중"
        RemoveMarker(run.risk)
        Speak(chapters[run.stage], "riskLine")
        return true
    end
    function SurvivorExpedition.SearchRemaining()
        if not run.hero or not run.objective or run.objective.state ~= "search" then return nil end
        return math.max(0, SurvivorConfig.StageTiming(run.stage).bossStart - (RunSession.GetElapsed() - run.started))
    end
    function SurvivorExpedition.GetFinding(index) return run.records[index] and run.records[index].finding end
    function SurvivorExpedition.GetReply(index) return run.records[index] and run.records[index].reply end
    -- The interlude answers the finding again; it must not repeat the combat subtitle word for word.
    function SurvivorExpedition.GetSceneReply(index)
        return run.records[index] and run.records[index].reply and chapters[index].sceneReply or nil
    end
    function SurvivorExpedition.HasAdvantage(index) return run.records[index] ~= nil and run.records[index].finding ~= nil end
    function SurvivorExpedition.UseAdvantage(index)
        if not SurvivorExpedition.HasAdvantage(index) or run.records[index].used then return false end
        run.records[index].used = true
        Speak(chapters[index], "insight")
        return true
    end
    function SurvivorExpedition.RecordReward(id)
        if run.records[run.stage] then run.records[run.stage].risk = "성공 · " .. SurvivorEquipment.Name(id) end
    end
    function SurvivorExpedition.Journal(index)
        local record = run.records[index]
        if not record then return "" end
        return (record.finding and "추가 단서: " .. record.finding or "추가 수색: 미확인")
            .. (record.finding and ("\n공략 정보: " .. chapters[index].advantage .. (record.used and " · 활용" or " · 확보")) or "")
            .. "\n봉인 조사: " .. (record.risk or "미참여")
    end
    function SurvivorExpedition.BeginStage(unit, index, elapsed, callback, combatPort)
        -- EndStage leaves a run with only the journal, so every stage field starts fresh.
        SurvivorExpedition.EndStage()
        assert(type(combatPort) == "table", "Expedition needs the combat port")
        run.hero, run.stage, run.started, run.rewardCallback, run.combat = unit, index, elapsed, callback, combatPort
        run.records[run.stage] = {risk = "미참여"}
        local chapter = chapters[run.stage]
        local points = SurvivorStage.SearchPoints(run.stage)
        run.objective = #points == chapter.count and {points = points, index = 1, x = points[1].x, y = points[1].y} or nil
        run.risk = Place(math.pi * 1.25 + (run.stage - 1) * math.pi / 2)
        if run.objective then run.objective.progress, run.objective.state = 0, "waiting" end
        if run.risk then run.risk.state = "waiting" end
    end
    local function CompleteSearch()
        run.objective.state = "complete"
        RemoveMarker(run.objective)
        local chapter = chapters[run.stage]
        run.records[run.stage].finding, run.records[run.stage].reply = chapter.finding, chapter.reply
        local healthReward = run.combat.grantRecovery()
        run.rewardCallback("search")
        SurvivorUtil.Present("clue cue", SurvivorUI.Cue, "clue")
        Say("|cff70e6cc수색 완료 · 리롤 보충|r\n" .. healthReward)
        Speak(chapter, "reply")
    end
    local function AdvanceSearch()
        local chapter = chapters[run.stage]
        Speak(chapter, "beats", run.objective.index)
        RemoveMarker(run.objective)
        if run.objective.index == #run.objective.points then CompleteSearch(); return end
        run.objective.index, run.objective.progress = run.objective.index + 1, 0
        local point = run.objective.points[run.objective.index]
        run.objective.x, run.objective.y = point.x, point.y
        Marker(run.objective, "수색 · " .. chapter.name .. " " .. run.objective.index .. "/" .. #run.objective.points, 90, 230, 200)
        PingMinimapEx(point.x, point.y, 4, 90, 230, 200, false)
    end
    function SurvivorExpedition.OnKill(dead, isBoss)
        if isBoss or not run.hero or not run.objective or run.objective.state ~= "search" then return end
        local chapter = chapters[run.stage]
        if chapter.mode == "courier" and dead == run.objective.courier then
            run.objective.courier = nil
            Speak(chapter, "beats", 1)
            CompleteSearch()
        elseif chapter.mode == "study" and Near(run.hero, run.objective, 320) and Near(dead, run.objective, 450) then
            run.objective.progress = run.objective.progress + 0.6
            if run.objective.progress >= chapter.seconds then AdvanceSearch() end
        end
    end
    function SurvivorExpedition.Step(dt, elapsed)
        if not run.hero or not RunSession.IsRunning() then return end
        local age, chapter = elapsed - run.started, chapters[run.stage]
        if age >= SurvivorConfig.StageTiming(run.stage).bossStart then
            if run.objective and run.objective.state ~= "complete" then
                run.objective.state = "closed"; RemoveMarker(run.objective)
                if run.objective.courier then run.combat.releaseCourier(run.objective.courier); run.objective.courier = nil end
            end
            if run.risk and run.risk.state ~= "complete" then run.risk.state = "closed"; RemoveMarker(run.risk) end
            return
        end
        run.pulse = run.pulse + dt
        if run.objective and run.objective.state == "waiting" and age >= 20 and elapsed >= (run.objective.retry or 0) then
            if chapter.mode == "courier" then
                run.objective.courier = run.combat.spawnCourier(run.objective.points)
                run.objective.retry = elapsed + 0.5
            end
            if chapter.mode ~= "courier" or run.objective.courier then
                run.objective.state = "search"
                Marker(run.objective, "수색 · " .. chapter.name, 90, 230, 200)
                PingMinimapEx(run.objective.x, run.objective.y, 4, 90, 230, 200, false)
            end
        end
        if run.objective and run.objective.state == "search" then
            local remaining = SurvivorExpedition.SearchRemaining()
            if remaining <= 30 and not run.objective.deadlineWarned then
                run.objective.deadlineWarned = true
                Say(string.format("|cff70e6cc수색 종료까지 %d초|r", math.ceil(remaining)))
            end
            if chapter.mode == "courier" and run.objective.courier then
                run.objective.x, run.objective.y = GetUnitX(run.objective.courier), GetUnitY(run.objective.courier)
                SetTextTagPos(run.objective.tag, run.objective.x, run.objective.y, 90)
            elseif chapter.seconds then
                if Near(run.hero, run.objective, chapter.mode == "study" and 260 or 180) then run.objective.progress = run.objective.progress + dt end
                if run.objective.progress >= chapter.seconds then AdvanceSearch() end
            elseif Near(run.hero, run.objective, 180) then AdvanceSearch() end
        end
        local riskOpens, riskCloses = RiskWindow()
        if run.risk and run.risk.state == "waiting" and age >= riskOpens then
            run.risk.state = "offered"
            Marker(run.risk, "위험 · " .. chapter.relic .. " (접근 후 수락)", 235, 130, 245)
            PingMinimapEx(run.risk.x, run.risk.y, 4, 235, 130, 245, false)
            SurvivorUtil.Present("risk line", SurvivorUI.Say, "수색 기록", chapter.temptation)
        end
        if run.risk and run.risk.state == "offered" then
            if age >= riskCloses then run.risk.state = "closed"; RemoveMarker(run.risk) end
        elseif run.risk and run.risk.state == "active" and elapsed >= run.risk.untilTime then
            run.risk.state = "complete" -- Consume before a modal callback; no duplicate rewards.
            run.records[run.stage].risk = "생존 성공 · 장비 회수"
            Speak(nil, "riskDone")
            run.rewardCallback("risk")
        end
        if run.pulse >= 15 then
            run.pulse = 0
            local point = run.objective and run.objective.state == "search" and run.objective or run.risk and run.risk.state == "offered" and run.risk
            if point then PingMinimapEx(point.x, point.y, 2, point == run.objective and 90 or 235, 180, 220, false) end
        end
    end
    function SurvivorExpedition.Status(riskOnly)
        if not run.hero then return "" end
        local chapter, lines = chapters[run.stage], {}
        if not riskOnly and run.objective and run.objective.state == "search" then
            lines[#lines + 1] = "|cff70e6cc선택 수색: " .. chapter.name .. "|r · " .. Locate(run.objective)
            lines[#lines + 1] = string.format("보스 등장 시 수색 종료 · |cffffcc00남은 %d초|r", math.ceil(SurvivorExpedition.SearchRemaining()))
            lines[#lines + 1] = chapter.action .. (chapter.seconds and string.format(" (%.1f/%.0f초)", math.min(run.objective.progress, chapter.seconds), chapter.seconds)
                or chapter.mode ~= "courier" and (" (" .. (run.objective.index - 1) .. "/" .. #run.objective.points .. ")") or "")
        end
        if run.risk and run.risk.state == "offered" then
            local _, closes = RiskWindow()
            lines[#lines + 1] = "|cffeb82f5위험: " .. chapter.relic .. "|r · " .. Locate(run.risk)
            lines[#lines + 1] = string.format("접근 후 ‘조사 수락’ · 종료 %d초 · %s 장비", math.ceil(math.max(0, closes - (RunSession.GetElapsed() - run.started))), SurvivorConfig.encounters[run.stage].riskReward.label)
            lines[#lines + 1] = "수락 후 30초: " .. RiskPenalty(" · ")
            lines[#lines + 1] = "장소를 벗어나도 도전은 유지됩니다."
        elseif SurvivorExpedition.RiskActive() then
            lines[#lines + 1] = string.format("|cffeb82f5봉인 경보 %d초|r · %s", math.ceil(math.max(0, run.risk.untilTime - RunSession.GetElapsed())),
                RiskPenalty(" / "))
        end
        return table.concat(lines, "\n")
    end
    function SurvivorExpedition.SetPaused(paused)
        for _, point in ipairs({run.objective or false, run.risk or false}) do
            if point and point.effect then BlzSetSpecialEffectTimeScale(point.effect, paused and 0 or 1) end
        end
    end
    function SurvivorExpedition.EndStage()
        if run.risk and run.risk.state == "active" and run.records[run.stage] then run.records[run.stage].risk = "중단 · 보상 없음" end
        -- Detach ownership before native calls; a failed removal must not keep
        -- the old markers or block the next BeginStage/Reset.
        local old = run
        run = NewRun(old.records, old.stage)
        local oldObjective, oldRisk, oldCombat = old.objective, old.risk, old.combat
        local errors = {}
        local function Release(label, point)
            if not point then return end
            local effect, tag = point.effect, point.tag
            point.effect, point.tag = nil, nil
            if effect then RunSession.Attempt(errors, label .. " effect", function() DestroyEffect(effect) end) end
            if tag then RunSession.Attempt(errors, label .. " text", function() DestroyTextTag(tag) end) end
        end
        Release("objective", oldObjective)
        Release("risk", oldRisk)
        local courier = oldObjective and oldObjective.courier
        if courier and oldCombat then
            oldObjective.courier = nil
            RunSession.Attempt(errors, "courier", function() oldCombat.releaseCourier(courier) end)
        end
        if #errors > 0 then error(table.concat(errors, "\n"), 0) end
    end
    function SurvivorExpedition.Reset()
        local ok, message = pcall(SurvivorExpedition.EndStage)
        run = NewRun()
        if not ok then error(message, 0) end
    end
end
