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
            relic = "이름 없는 묘의 봉인", riskLine = "묘지가 깨어난다. 챙기고 버티자.", temptation = "묘비 아래에서 쇠붙이가 울린다. 봉인을 건드리면 묘지가 깨어날 것이다."},
        {name = "재 속의 우회로", action = "불길 바깥의 표식 네 곳을 통과", mode = "route", count = 4,
            beats = {"이쪽은 식었어.", "가까운 길엔 아직 불이 남았네.", "좀 돌아가도 발자국은 이어져.", "불길 없는 길은 여기뿐이네."},
            advantage = "도살자의 첫 돌진 잔불 제거", insight = "불길 밖으로! 아까 본 길로 빠지자.",
            finding = "재가 얇게 쌓인 담장 가장자리로 발자국이 이어졌다. 불길 쪽으로 되돌아간 흔적은 없었다.",
            reply = "무작정 헤맨 것 같진 않아. 계속 한쪽으로 가고 있어.",
            sceneReply = "불길을 피해 돌아가면서도 방향은 잃지 않았어.",
            relic = "잿불 속의 봉인함", riskLine = "열기가 번진다. 빨리 챙기고 빠지자.", temptation = "불길 속에 남은 봉인함이 열기를 뿜는다. 여는 동안 추격자들이 냄새를 맡을 것이다."},
        {name = "얼어붙은 빗장", action = "주변에서 누적 8초 조사 · 근처 적 처치 시 가속", mode = "study", count = 1, seconds = 8,
            beats = {"문 안쪽으로 피할 수 있겠어. 기억해 둬야겠네."},
            advantage = "파수꾼의 첫 냉기 파동 안전 각도 2배", insight = "냉기가 온다. 아까 그 문 쪽으로!",
            finding = "빗장을 덮은 서리에 손가락 자국이 남아 있었다. 문을 부순 흔적은 없었다.",
            reply = "빗장을 잡을 줄은 알았네. 어디로 나가는지도 알았을까?",
            sceneReply = "빗장을 직접 풀었네. 나갈 곳이 정해져 있었던 걸까?",
            relic = "서리에 잠긴 성물", riskLine = "얼음이 깨졌어. 몰려오기 전에 버텨야 해.", temptation = "얼음 아래 성물이 희미하게 떨린다. 얼음을 깨면 납골당의 망령들이 몰려올 것이다."},
        {name = "수색대의 전령", action = "이동하는 전령을 추격해 처치", mode = "courier", count = 3,
            beats = {"지원 요청이었네. 이젠 전해질 일 없겠어."},
            advantage = "추적대장의 첫 지원병 호출 차단", insight = "헛수고야. 그 전령은 돌아오지 않아.",
            finding = "전령의 명령서에 ‘이탈자’와 ‘회수’라는 말이 남아 있었다. 이름은 없었다. 지원 요청은 전달되지 않았다.",
            reply = "저놈들 손에 넘어가게 둘 순 없지. 서둘러야겠어.",
            sceneReply = "이름도 모르면서 쫓는 거네. 저놈들보다 먼저 찾아야 해.",
            relic = "수색대의 압수품", riskLine = "경보가 울렸어. 챙기고 바로 빠지자.", temptation = "봉인된 압수품에 감시의 마력이 남아 있다. 손을 대면 경보가 울릴 것이다."},
        {name = "끊어진 사슬", action = "봉인 세 곳에서 각각 누적 2초 해제", mode = "seals", count = 3, seconds = 2,
            beats = {"하나 풀렸어. 아직 사슬이 팽팽하네.", "이것도 같은 사슬이네.", "가운데가 느슨해졌어. 저쪽으로 빠질 수 있겠네."},
            advantage = "감시자의 첫 사슬 봉쇄에서 중앙 줄 제거", insight = "가운데로! 풀어 둔 사슬 쪽이야.",
            finding = "풀린 사슬의 끝이 하수구 바닥에 놓여 있었다. 그 너머 물길을 따라 한 사람의 발자국만 이어졌다.",
            reply = "이쪽이야. 이제 얼마 안 남았어.",
            relic = "감시자의 예비 봉인", riskLine = "감시자들이 눈치챘어. 조금만 버티자.", temptation = "마지막 봉인이 길목을 감시한다. 부수면 힘을 얻겠지만, 감시자들을 자극할 것이다."},
    }
    local hero, stage, started, rewardCallback
    local objective, risk, records = nil, nil, {}
    local pulse = 0
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
        return SurvivorStage.FindPoint(angle, 1000, objective and objective.points or {})
    end
    local function Say(text)
        SurvivorUI.Notify(text)
    end
    local function Locate(point)
        local dx, dy = point.x - GetUnitX(hero), point.y - GetUnitY(hero)
        local direction = math.abs(dx) > math.abs(dy) and (dx > 0 and "동쪽" or "서쪽") or (dy > 0 and "북쪽" or "남쪽")
        return direction .. " " .. math.floor(math.sqrt(dx * dx + dy * dy))
    end
    function SurvivorExpedition.RiskActive() return risk ~= nil and risk.state == "active" end
    function SurvivorExpedition.HasRiskNotice() return risk ~= nil and (risk.state == "offered" or risk.state == "active") end
    local function RiskWindow()
        -- Keep a full 30-second challenge before the boss, with time to accept it.
        local closes = math.min(180, SurvivorConfig.StageTiming(stage).bossStart - 30)
        return math.min(95, closes - 60), closes
    end
    function SurvivorExpedition.RiskOffer()
        if not hero or GetUnitTypeId(hero) == 0 or not UnitAlive(hero) or not RunSession.IsRunning()
            or not risk or risk.state ~= "offered" then return nil end
        local age = RunSession.GetElapsed() - started
        local opens, closes = RiskWindow()
        if age < opens or age >= closes or not Near(hero, risk, 140) then return nil end
        local chapter = chapters[stage]
        local reward = stage <= 2 and "희귀 이상" or "영웅 등급"
        return {name = chapter.relic, remaining = math.ceil(closes - age), seconds = 30,
            text = chapter.relic .. "\n30초 생존: " .. reward .. " 장비 택 1\n적 피해 +25% · 출현량 +35%\n장소를 벗어나도 도전은 유지됩니다."}
    end
    function SurvivorExpedition.AcceptRisk()
        if not SurvivorExpedition.RiskOffer() then return false end
        -- Recheck live offer, position and run state when the explicit action arrives.
        risk.state, risk.untilTime = "active", RunSession.GetElapsed() + 30
        records[stage].risk = "도전 중"
        RemoveMarker(risk)
        SurvivorUI.Say("안야", chapters[stage].riskLine)
        return true
    end
    function SurvivorExpedition.SearchRemaining()
        if not hero or not objective or objective.state ~= "search" then return nil end
        return math.max(0, SurvivorConfig.StageTiming(stage).bossStart - (RunSession.GetElapsed() - started))
    end
    function SurvivorExpedition.GetFinding(index) return records[index] and records[index].finding end
    function SurvivorExpedition.GetReply(index) return records[index] and records[index].reply end
    -- The interlude answers the finding again; it must not repeat the combat subtitle word for word.
    function SurvivorExpedition.GetSceneReply(index)
        return records[index] and records[index].reply and chapters[index].sceneReply or nil
    end
    function SurvivorExpedition.HasAdvantage(index) return records[index] ~= nil and records[index].finding ~= nil end
    function SurvivorExpedition.UseAdvantage(index)
        if not SurvivorExpedition.HasAdvantage(index) or records[index].used then return false end
        records[index].used = true
        SurvivorUI.Say("안야", chapters[index].insight)
        return true
    end
    function SurvivorExpedition.RecordReward(id)
        if records[stage] then records[stage].risk = "성공 · " .. SurvivorEquipment.Name(id) end
    end
    function SurvivorExpedition.Journal(index)
        local record = records[index]
        if not record then return "" end
        return (record.finding and "추가 단서: " .. record.finding or "추가 수색: 미확인")
            .. (record.finding and ("\n공략 정보: " .. chapters[index].advantage .. (record.used and " · 활용" or " · 확보")) or "")
            .. "\n봉인 조사: " .. (record.risk or "미참여")
    end
    function SurvivorExpedition.BeginStage(unit, index, elapsed, callback)
        SurvivorExpedition.EndStage()
        hero, stage, started, rewardCallback = unit, index, elapsed, callback
        pulse = 0
        records[stage] = {risk = "미참여"}
        local chapter = chapters[stage]
        local points = SurvivorStage.SearchPoints and SurvivorStage.SearchPoints(stage) or {}
        if #points ~= chapter.count then
            points = {}
            for i = 1, chapter.count do
                local angle = stage == 2 and ({2.95, 2.2, 0.95, 0.2})[i] or math.pi / 4 + (stage - 1) * math.pi / 2 + (i - 1) * 0.85
                local point = chapter.mode == "study" and SurvivorStage.LandmarkApproach(points)
                    or SurvivorStage.FindPoint(angle, stage == 2 and 1050 or 650 + (i - 1) * 200, points)
                if point then points[#points + 1] = point end
            end
        end
        objective = #points == chapter.count and {points = points, index = 1, x = points[1].x, y = points[1].y} or nil
        risk = Place(math.pi * 1.25 + (stage - 1) * math.pi / 2)
        if objective then objective.progress, objective.state = 0, "waiting" end
        if risk then risk.state = "waiting" end
    end
    local function CompleteSearch()
        objective.state = "complete"
        RemoveMarker(objective)
        local chapter = chapters[stage]
        records[stage].finding, records[stage].reply = chapter.finding, chapter.reply
        local healthReward = SurvivorCombat.GrantSearchRecovery()
        rewardCallback("search")
        SurvivorUI.Cue("clue")
        Say("|cff70e6cc수색 완료 · 리롤 보충|r\n" .. healthReward)
        SurvivorUI.Say("안야", chapter.reply)
    end
    local function AdvanceSearch()
        local chapter = chapters[stage]
        SurvivorUI.Say("안야", chapter.beats[objective.index])
        RemoveMarker(objective)
        if objective.index == #objective.points then CompleteSearch(); return end
        objective.index, objective.progress = objective.index + 1, 0
        local point = objective.points[objective.index]
        objective.x, objective.y = point.x, point.y
        Marker(objective, "수색 · " .. chapter.name .. " " .. objective.index .. "/" .. #objective.points, 90, 230, 200)
        PingMinimapEx(point.x, point.y, 4, 90, 230, 200, false)
    end
    function SurvivorExpedition.OnKill(dead, isBoss)
        if isBoss or not hero or not objective or objective.state ~= "search" then return end
        local chapter = chapters[stage]
        if chapter.mode == "courier" and dead == objective.courier then
            objective.courier = nil
            SurvivorUI.Say("안야", chapter.beats[1])
            CompleteSearch()
        elseif chapter.mode == "study" and Near(hero, objective, 320) and Near(dead, objective, 450) then
            objective.progress = objective.progress + 0.6
            if objective.progress >= chapter.seconds then AdvanceSearch() end
        end
    end
    function SurvivorExpedition.Step(dt, elapsed)
        if not hero or not RunSession.IsRunning() then return end
        local age, chapter = elapsed - started, chapters[stage]
        if age >= SurvivorConfig.StageTiming(stage).bossStart then
            if objective and objective.state ~= "complete" then
                objective.state = "closed"; RemoveMarker(objective)
                if objective.courier then SurvivorCombat.ReleaseCourier(objective.courier); objective.courier = nil end
            end
            if risk and risk.state ~= "complete" then risk.state = "closed"; RemoveMarker(risk) end
            return
        end
        pulse = pulse + dt
        if objective and objective.state == "waiting" and age >= 20 and elapsed >= (objective.retry or 0) then
            if chapter.mode == "courier" then
                objective.courier = SurvivorCombat.SpawnCourier(objective.points)
                objective.retry = elapsed + 0.5
            end
            if chapter.mode ~= "courier" or objective.courier then
                objective.state = "search"
                Marker(objective, "수색 · " .. chapter.name, 90, 230, 200)
                PingMinimapEx(objective.x, objective.y, 4, 90, 230, 200, false)
            end
        end
        if objective and objective.state == "search" then
            local remaining = SurvivorExpedition.SearchRemaining()
            if remaining <= 30 and not objective.deadlineWarned then
                objective.deadlineWarned = true
                Say(string.format("|cff70e6cc수색 종료까지 %d초|r", math.ceil(remaining)))
            end
            if chapter.mode == "courier" and objective.courier then
                objective.x, objective.y = GetUnitX(objective.courier), GetUnitY(objective.courier)
                SetTextTagPos(objective.tag, objective.x, objective.y, 90)
            elseif chapter.seconds then
                if Near(hero, objective, chapter.mode == "study" and 260 or 180) then objective.progress = objective.progress + dt end
                if objective.progress >= chapter.seconds then AdvanceSearch() end
            elseif Near(hero, objective, 180) then AdvanceSearch() end
        end
        local riskOpens, riskCloses = RiskWindow()
        if risk and risk.state == "waiting" and age >= riskOpens then
            risk.state = "offered"
            Marker(risk, "위험 · " .. chapter.relic .. " (접근 후 수락)", 235, 130, 245)
            PingMinimapEx(risk.x, risk.y, 4, 235, 130, 245, false)
            SurvivorUI.Say("수색 기록", chapter.temptation)
        end
        if risk and risk.state == "offered" then
            if age >= riskCloses then risk.state = "closed"; RemoveMarker(risk) end
        elseif risk and risk.state == "active" and elapsed >= risk.untilTime then
            risk.state = "complete" -- Consume before a modal callback; no duplicate rewards.
            records[stage].risk = "생존 성공 · 장비 회수"
            SurvivorUI.Say("안야", "챙겼어. 이제 빠지자.")
            rewardCallback("risk")
        end
        if pulse >= 15 then
            pulse = 0
            local point = objective and objective.state == "search" and objective or risk and risk.state == "offered" and risk
            if point then PingMinimapEx(point.x, point.y, 2, point == objective and 90 or 235, 180, 220, false) end
        end
    end
    function SurvivorExpedition.Status(riskOnly)
        if not hero then return "" end
        local chapter, lines = chapters[stage], {}
        if not riskOnly and objective and objective.state == "search" then
            lines[#lines + 1] = "|cff70e6cc선택 수색: " .. chapter.name .. "|r · " .. Locate(objective)
            lines[#lines + 1] = string.format("보스 등장 시 수색 종료 · |cffffcc00남은 %d초|r", math.ceil(SurvivorExpedition.SearchRemaining()))
            lines[#lines + 1] = chapter.action .. (chapter.seconds and string.format(" (%.1f/%.0f초)", math.min(objective.progress, chapter.seconds), chapter.seconds)
                or chapter.mode ~= "courier" and (" (" .. (objective.index - 1) .. "/" .. #objective.points .. ")") or "")
        end
        if risk and risk.state == "offered" then
            local _, closes = RiskWindow()
            lines[#lines + 1] = "|cffeb82f5위험: " .. chapter.relic .. "|r · " .. Locate(risk)
            lines[#lines + 1] = string.format("접근 후 ‘조사 수락’ · 종료 %d초 · %s 장비", math.ceil(math.max(0, closes - (RunSession.GetElapsed() - started))), stage <= 2 and "희귀 이상" or "영웅 등급")
            lines[#lines + 1] = "수락 후 30초: 적 피해 +25% · 출현량 +35%"
            lines[#lines + 1] = "장소를 벗어나도 도전은 유지됩니다."
        elseif SurvivorExpedition.RiskActive() then
            lines[#lines + 1] = string.format("|cffeb82f5봉인 경보 %d초|r · 적 피해 +25%% / 출현량 +35%%", math.ceil(math.max(0, risk.untilTime - RunSession.GetElapsed())))
        end
        return table.concat(lines, "\n")
    end
    function SurvivorExpedition.SetPaused(paused)
        for _, point in pairs({objective, risk}) do if point.effect then BlzSetSpecialEffectTimeScale(point.effect, paused and 0 or 1) end end
    end
    function SurvivorExpedition.EndStage()
        if risk and risk.state == "active" and records[stage] then records[stage].risk = "중단 · 보상 없음" end
        RemoveMarker(objective); RemoveMarker(risk)
        if objective and objective.courier then SurvivorCombat.ReleaseCourier(objective.courier) end
        objective, risk, hero, rewardCallback = nil, nil, nil, nil
    end
    function SurvivorExpedition.Reset() SurvivorExpedition.EndStage(); records = {} end
end
