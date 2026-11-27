-- Level rewards: a queue of hero levels the unit already reached, each consumed by one
-- growth choice. Not a second level/XP system; the hero unit owns both. Works on the
-- lifecycle's run record (AnyasLongNight's NewRun()), which Attach hands over; the queue
-- fields (queuedLevels, queueHead, observedLevel, rewardLevel, offers, rerollsRemaining,
-- choiceGrace, levelTrigger, firstEvolution) live there with the rest of the run.
SurvivorProgression = {}
do
    local record = nil
    -- The lifecycle's damage board refresh, called late so a replaced refresh applies.
    local onRefresh = function() end
    function SurvivorProgression.Attach(run) record = run end
    function SurvivorProgression.Bind(refresh) onRefresh = refresh end
    function SurvivorProgression.Pending() return #record.queuedLevels - record.queueHead + 1 end
    function SurvivorProgression.Clear()
        local oldTrigger = record.levelTrigger
        record.levelTrigger = nil
        record.queuedLevels, record.queueHead = {}, 1
        if oldTrigger ~= nil then DestroyTrigger(oldTrigger) end
    end
    function SurvivorProgression.Queue()
        local hero = record.hero
        if not SurvivorUtil.UnitExists(hero) then return end
        local actualLevel = GetHeroLevel(hero)
        for gained = record.observedLevel + 1, actualLevel do record.queuedLevels[#record.queuedLevels + 1] = gained end
        record.observedLevel = actualLevel
        -- Augments replace the standard skill-learning reward on every level.
        local points = GetHeroSkillPoints(hero)
        if points > 0 then UnitModifySkillPoints(hero, -points) end
    end
    function SurvivorProgression.AwardXP(amount)
        if not RunSession.IsRunning() or not SurvivorUtil.UnitLive(record.hero) then return end
        assert(type(amount) == "number" and amount >= 0, "Invalid XP reward")
        amount = math.floor(amount)
        if amount == 0 then return end
        -- Keep automatic kill XP suspended outside this synchronous native call.
        local recipient = record.hero
        SuspendHeroXP(recipient, false)
        local ok, message = pcall(AddHeroXP, recipient, amount, true)
        if SurvivorUtil.UnitExists(recipient) then SuspendHeroXP(recipient, true) end
        if not ok then error(message) end
        -- Also reconcile multi-level jumps; the event may fire once or repeatedly.
        SurvivorProgression.Queue()
    end
    -- Observes the hero's level-ups for this run; Clear destroys the trigger.
    function SurvivorProgression.Watch(hero)
        SuspendHeroXP(hero, true)
        record.observedLevel = GetHeroLevel(hero)
        SurvivorProgression.Queue()
        record.levelTrigger = CreateTrigger()
        TriggerRegisterPlayerUnitEvent(record.levelTrigger, SurvivorUtil.Owner(), EVENT_PLAYER_HERO_LEVEL, nil)
        -- AddHeroXP from a kill reward raises this event inside the same hit loop.
        TriggerAddAction(record.levelTrigger, RunSession.TriggerAction(function()
            if GetTriggerUnit() ~= record.hero then return end
            -- Defer the modal UI to Step, outside Warcraft's level-up/death event.
            SurvivorProgression.Queue()
        end))
    end
    -- A short pause before the next queued choice after a modal closes.
    function SurvivorProgression.HoldChoices() record.choiceGrace = 0.25 end
    function SurvivorProgression.GrantRerolls(count)
        record.rerollsRemaining = math.min(SurvivorConfig.rerollCapacity, record.rerollsRemaining + count)
    end
    local function ShowChoice()
        SurvivorUI.ShowChoices(record.offers, record.rewardLevel, record.build, SurvivorProgression.Pending(), record.rerollsRemaining)
    end
    local function BeginChoice()
        if record.queueHead > #record.queuedLevels then return end
        SurvivorEquipment.Reconcile()
        record.offers = SurvivorAugments.Roll(record.build)
        if RunSession.GetState() == "CHOOSING" or RunSession.BeginChoice() then
            record.rewardLevel = record.queuedLevels[record.queueHead]
            record.queueHead = record.queueHead + 1
            ShowChoice()
        else record.offers, record.rewardLevel = nil, nil end
    end
    -- One gameplay tick: reconcile levels and open the next queued choice once the grace
    -- ends. Returns true when a choice opened, so the tick stops before combat.
    function SurvivorProgression.Step(dt)
        SurvivorProgression.Queue()
        record.choiceGrace = math.max(0, record.choiceGrace - dt)
        if record.queueHead <= #record.queuedLevels and record.choiceGrace == 0 then
            BeginChoice()
            return true
        end
        return false
    end
    function SurvivorProgression.Reroll(index)
        if not RunSession.CanAct("CHOOSING") or record.offers == nil or record.rerollsRemaining <= 0 then return end
        if SurvivorAugments.Reroll(record.build, record.offers, index) then
            record.rerollsRemaining = record.rerollsRemaining - 1
        end
        -- No level reward is consumed and combat stays paused during the redraw.
        ShowChoice()
    end
    -- Returns whether the click consumed the choice; the UI keeps its cards otherwise.
    function SurvivorProgression.Choose(index)
        if not RunSession.CanAct("CHOOSING") or record.offers == nil or record.offers[index] == nil then return false end
        local selected = record.offers[index]
        record.offers, record.rewardLevel = nil, nil -- Consume once, before callbacks or combat resume.
        SurvivorAugments.Apply(selected, record.build, record.hero)
        if not record.firstEvolution and SurvivorAugments.Get(selected).kind == "evolution" then
            record.firstEvolution = {time = RunSession.GetElapsed(), level = GetHeroLevel(record.hero), name = SurvivorAugments.Get(selected).name}
            SurvivorUI.Cue("evolution")
        end
        SurvivorCombat.TrackWeapons(record.build.weapons)
        SurvivorNativeLoadout.Refresh()
        onRefresh()
        if record.queueHead <= #record.queuedLevels then
            -- Keep units, missiles and gameplay time frozen for all queued choices.
            BeginChoice()
            return true
        end
        record.queuedLevels, record.queueHead = {}, 1
        SurvivorUI.HidePanel()
        SurvivorProgression.HoldChoices()
        RunSession.EndChoice()
        return true
    end
    function SurvivorProgression.Exclude(index)
        if not RunSession.CanAct("CHOOSING") or record.offers == nil then return end
        SurvivorAugments.Exclude(record.build, record.offers, index)
        -- Excluding replaces only this card; no reroll or queued level is consumed.
        ShowChoice()
    end
end
