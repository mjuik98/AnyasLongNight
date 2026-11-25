-- The native multiboard with per-weapon damage statistics. Handles are created and
-- released on every client; only text, display and folding run locally. The board
-- folds itself while a subtitle or urgent notice shows and restores the player's
-- choice afterwards; the native corner control otherwise owns folding.
SurvivorDamageBoard = {}
do
    local board = nil
    local cells, values, rowCount, build, title = {}, {}, nil, nil, nil
    local visible, expanded = nil, false
    local originalMinimized, quiet = nil, false
    local widths = {0.105, 0.048, 0.052, 0.037, 0.052, 0.046}
    local headings = {"무기", "이번 단계", "누적 피해", "DPS", "보스 누적", "둔화(초)"}
    function SurvivorDamageBoard.RestoreMinimize()
        local original = originalMinimized
        originalMinimized, quiet = nil, false
        if original == false and board and SurvivorConfig.IsLocalPlayer()
            and IsMultiboardMinimized(board) then
            MultiboardMinimize(board, false)
        end
    end
    function SurvivorDamageBoard.Clear()
        SurvivorDamageBoard.RestoreMinimize()
        for _, row in pairs(cells) do
            for _, item in pairs(row) do MultiboardReleaseItem(item) end
        end
        if board then DestroyMultiboard(board); board = nil end
        cells, values, rowCount, build, title = {}, {}, nil, nil, nil
        visible, expanded = nil, false
    end
    -- shown: the combat HUD is visible; quietly folds while a subtitle or urgent notice shows.
    function SurvivorDamageBoard.Display(shown, quietly)
        if not board or not SurvivorConfig.IsLocalPlayer() then return end
        if shown and quietly then
            -- Fold once on entry; subsequent native corner clicks belong to the player.
            if not quiet then
                quiet = true
                originalMinimized = IsMultiboardMinimized(board)
                if not originalMinimized then MultiboardMinimize(board, true) end
            elseif originalMinimized ~= nil and not IsMultiboardMinimized(board) then
                -- A manual expansion also cancels restoration, including later manual folding.
                originalMinimized = nil
            end
        else SurvivorDamageBoard.RestoreMinimize() end
        if visible ~= shown then MultiboardDisplay(board, shown); visible = shown end
    end
    local function PrepareCells(weaponCount)
        if rowCount == weaponCount + 1 then return end
        -- Allocate/release handles on every client, outside native local folding checks.
        for _, row in pairs(cells) do
            for _, item in pairs(row) do MultiboardReleaseItem(item) end
        end
        cells, values, rowCount = {}, {}, weaponCount + 1
        MultiboardSetRowCount(board, rowCount)
        for row = 0, weaponCount do
            cells[row], values[row] = {}, {}
            for column = 0, 5 do
                local item = MultiboardGetItem(board, row, column)
                cells[row][column] = item
                MultiboardSetItemStyle(item, true, row > 0 and column == 0)
                MultiboardSetItemWidth(item, widths[column + 1])
                MultiboardSetItemValueColor(item, 255, row == 0 and 210 or 255, row == 0 and 100 or 255, 255)
                if row == 0 then MultiboardSetItemValue(item, headings[column + 1]) end
            end
        end
    end
    local function RenderCells(rows)
        for row, data in ipairs(rows) do
            local items, cached = cells[row], values[row]
            if items then
                local entry = SurvivorAugments.Get(data.id)
                local texts = {entry.name .. (build.evolutions[data.id] and " *" or " " .. SurvivorAugments.Level(build, data.id)),
                    string.format("%.0f", data.stageDamage), string.format("%.0f", data.damage), string.format("%.1f", data.dps),
                    string.format("%.0f", data.bossDamage), string.format("%.1f", data.slowSeconds)}
                for column = 0, 5 do
                    if cached[column] ~= texts[column + 1] then
                        MultiboardSetItemValue(items[column], texts[column + 1]); cached[column] = texts[column + 1]
                    end
                end
                if cached.icon ~= entry.icon then MultiboardSetItemIcon(items[0], entry.icon); cached.icon = entry.icon end
            end
        end
    end
    -- refresh: redraw the rows even when the board was already expanded.
    function SurvivorDamageBoard.RefreshExpansion(refresh)
        if not SurvivorConfig.IsLocalPlayer() then return end
        local open = board ~= nil and build ~= nil and visible and not IsMultiboardMinimized(board)
        if open and (refresh or not expanded) then
            -- The 0.1-second UI observer fills newly expanded rows immediately.
            -- Only text setters run locally; cell handles were acquired synchronously.
            RenderCells(SurvivorCombat.DamageRows(build.weapons))
        end
        expanded = open == true
    end
    -- Creates the board on first use (folded), then publishes the build's rows and title.
    -- display(shown) is the owner's visibility rule for a newly created board.
    function SurvivorDamageBoard.Update(currentBuild, currentTitle, display)
        if not board then
            board = CreateMultiboard()
            MultiboardSetColumnCount(board, 6)
            -- The native corner control owns folding; no duplicate custom button.
            MultiboardMinimize(board, true)
            display()
        end
        build = currentBuild
        -- Gameplay registers every owned weapon before publishing this build.
        -- Row handles stay synchronized; dynamic statistics are read only when shown.
        PrepareCells(#currentBuild.weapons)
        if title ~= currentTitle then
            MultiboardSetTitleText(board, currentTitle); title = currentTitle
        end
    end
end
