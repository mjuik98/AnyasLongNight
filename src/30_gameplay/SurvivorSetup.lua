-- Map-lifetime setup choices: hero, difficulty, starting weapon and trinket, and the story
-- summary mode. They change only on the setup menu, outside a run; a run reads them.
SurvivorSetup = {}
do
    local selectedHero, selectedDifficulty, selectedWeapon, selectedTrinket, setupPhase = SurvivorConfig.defaultHero
    local storySummary = false
    local function Editable()
        local state = RunSession.GetState()
        return setupPhase == "MENU" and (state == "READY" or state == "FINISHED")
    end
    local function Allowed(list, id)
        for _, candidate in ipairs(list) do if candidate == id then return true end end
        return false
    end
    function SurvivorSetup.Hero() return selectedHero end
    function SurvivorSetup.Difficulty() return selectedDifficulty end
    function SurvivorSetup.Complete()
        return selectedDifficulty ~= nil and selectedWeapon ~= nil and selectedTrinket ~= nil
    end
    -- Opens the menu with the current choices.
    function SurvivorSetup.Show()
        setupPhase = "MENU"
        SurvivorSetupUI.ShowMenu(selectedDifficulty, selectedWeapon, selectedTrinket, selectedHero)
    end
    -- Closes the menu without showing anything (a run, a restart or a retry takes over).
    function SurvivorSetup.Close() setupPhase = nil end
    -- Reopens the menu state for a retry with the same choices, without drawing the menu.
    function SurvivorSetup.Reopen() setupPhase = "MENU" end
    -- Consumes the menu once for a run start: the weapon and trinket, or nil while incomplete.
    function SurvivorSetup.Consume()
        if not Editable() or not SurvivorSetup.Complete() then return nil end
        setupPhase = nil
        return selectedWeapon, selectedTrinket
    end
    function SurvivorSetup.IsStorySummary() return storySummary end
    function SurvivorSetup.ToggleStorySummary()
        if not Editable() then return false end
        storySummary = not storySummary
        SurvivorStory.SetSummaryMode(storySummary)
        SurvivorSetup.Show()
        return true
    end
    -- The setup screen shows every panel at once; opening a kind only switches its option list.
    function SurvivorSetup.Open(kind)
        if not Editable() then return false end
        if kind ~= "HERO" and kind ~= "DIFFICULTY" and kind ~= "WEAPON" and kind ~= "TRINKET" then return false end
        local selections = {HERO = selectedHero, DIFFICULTY = selectedDifficulty, WEAPON = selectedWeapon, TRINKET = selectedTrinket}
        SurvivorSetupUI.ShowOptions(kind, selections[kind], selectedHero)
        return true
    end
    function SurvivorSetup.Reset()
        if not Editable() then return false end
        selectedDifficulty, selectedWeapon, selectedTrinket = nil, nil, nil
        SurvivorSetup.Show()
        return true
    end
    function SurvivorSetup.Select(kind, id)
        if not Editable() then return false end
        local profile = SurvivorConfig.heroes[id]
        if kind == "HERO" and profile and not profile.locked then
            -- Starting weapons are per hero; trinkets and difficulty are shared.
            if id ~= selectedHero then selectedWeapon = nil end
            selectedHero = id
        elseif kind == "DIFFICULTY" and SurvivorConfig.difficulties[id] then selectedDifficulty = id
        elseif kind == "WEAPON" and Allowed(SurvivorConfig.heroes[selectedHero].startingWeapons, id) then selectedWeapon = id
        elseif kind == "TRINKET" and Allowed(SurvivorConfig.startingTrinkets, id) then selectedTrinket = id
        else return false end
        SurvivorSetup.Show()
        return true
    end
end
