-- Combat subtitles and notices: a bounded speaker queue, ordinary notices that
-- expire, and prioritized alerts that take over the notice box. Reading time follows
-- the synchronized run clock; local panel visibility only decides what is drawn.
-- SurvivorUI binds its cached frame setters and builds these frames in its HUD.
SurvivorSpeech = {}
do
    local speechRoot, speechName, speechText, noticeRoot, noticeText
    local queue, speech, notice, clock, speaking = {}, nil, nil, 0, false
    local deferredNotice
    local alerts, alertSerial = {}, 0
    local heightText, heightUrgent, height
    local SetVisible, SetText, SetSize, SetAbsPoint, Text, FramedPanel
    function SurvivorSpeech.Bind(frames)
        SetVisible, SetText, SetSize, SetAbsPoint = frames.SetVisible, frames.SetText, frames.SetSize, frames.SetAbsPoint
        Text, FramedPanel = frames.Text, frames.FramedPanel
    end
    function SurvivorSpeech.Build(parent)
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
    end
    function SurvivorSpeech.Clear()
        queue, speech, notice, deferredNotice = {}, nil, nil, nil
        alerts = {}
        clock = RunSession.GetElapsed()
        if speechRoot then SetVisible(speechRoot, false) end
        if noticeRoot then SetVisible(noticeRoot, false) end
    end
    function SurvivorSpeech.Say(speaker, text)
        if SurvivorStory then SurvivorStory.Remember(speaker, text) end
        -- Bound transient notifications; every line remains in the search journal.
        if #queue >= 6 then table.remove(queue, 1) end
        queue[#queue + 1] = {speaker = speaker, text = text, remaining = 7}
    end
    function SurvivorSpeech.Notify(text)
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
    -- A newer alert with the same key replaces the old one; the two most important show.
    function SurvivorSpeech.Alert(seconds, text, priority, key)
        if notice and not notice.urgent then deferredNotice = notice end
        key = key or text
        for i = #alerts, 1, -1 do if alerts[i].key == key then table.remove(alerts, i) end end
        alertSerial = alertSerial + 1
        alerts[#alerts + 1] = {text = text, priority = priority or 60, key = key,
            expires = RunSession.GetElapsed() + seconds, serial = alertSerial}
        RenderAlerts()
        while #alerts > 8 do table.remove(alerts) end
    end
    function SurvivorSpeech.WrappedLines(text)
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
        if heightText ~= text or heightUrgent ~= urgent then
            heightText, heightUrgent = text, urgent
            height = math.max(0.042, math.min(urgent and 0.132 or 0.094,
                0.028 + SurvivorSpeech.WrappedLines(text) * 0.0125))
        end
        return height
    end
    -- The top edge for a panel placed below the notice box.
    function SurvivorSpeech.BelowNotice()
        return notice and math.max(0.36, 0.515 - NoticeHeight() - 0.012) or 0.515
    end
    -- Whether a subtitle was drawn on the last render.
    function SurvivorSpeech.IsSpeaking() return speaking end
    -- Advances reading time; running = the synchronized run clock is advancing.
    function SurvivorSpeech.Advance(running)
        local elapsed = RunSession.GetElapsed()
        local dt = math.max(0, elapsed - clock)
        clock = elapsed
        -- Reading time and queues advance only from synchronized state; local native
        -- panel visibility decides only what is drawn (an open bag is a synced pause).
        if running then
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
            if not speech and #queue > 0 and not (notice and notice.urgent) then
                speech = table.remove(queue, 1)
                BlzFrameSetText(speechName, "|cffffcc00" .. speech.speaker .. "|r")
                BlzFrameSetText(speechText, speech.text)
            end
        end
    end
    -- active = the combat HUD is visible. Returns whether a subtitle shows and whether
    -- the multiboard should fold quietly (a subtitle or an urgent notice is up).
    function SurvivorSpeech.Visibility(active)
        local visible = active and speech ~= nil and not (notice and notice.urgent)
        return visible, visible or (active and notice ~= nil and notice.urgent == true)
    end
    function SurvivorSpeech.Render(active, visible)
        speaking = visible
        if speechRoot then SetVisible(speechRoot, visible) end
        if noticeRoot then SetVisible(noticeRoot, active and notice ~= nil) end
        if noticeRoot then
            local noticeHeight = NoticeHeight()
            SetAbsPoint(noticeRoot, FRAMEPOINT_TOPLEFT, 0.025, 0.515)
            SetSize(noticeRoot, 0.29, noticeHeight)
            SetSize(noticeText, 0.254, noticeHeight - 0.028)
        end
    end
end
