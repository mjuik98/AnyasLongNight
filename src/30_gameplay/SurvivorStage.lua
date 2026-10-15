-- Stage presentation owns reversible terrain/path patches, scenery, weather, sound and rectangle.
-- Tile IDs are also registered in the packaged war3map.w3e palette.
SurvivorStage = {}
do
    local themes = {
        {name = "스트라솔름 폐허", mission = "무너진 외곽 묘지에서 스컬지 무리를 벗어난 발자국을 찾으세요.", landmark = "무너진 외곽 묘지 입구",
            hint = "발자국 세 곳을 따라가면 첫 보스 공격을 더 일찍 알아챌 수 있습니다.\n2분에 보스 등장 · 제한 시간 3분", tiles = {"Ldro", "Ldrt", "Lgrd", "Lrok"}, blight = true, light = "Lordaeron", hour = 19,
            sound = [[Sound\Ambient\WindLoopStereo.wav]],
            color = {180, 220, 185}, warning = {255, 80, 40},
            melee = [[Units\Undead\Ghoul\Ghoul.mdl]], ranged = [[Units\Creeps\SkeletonArcher\SkeletonArcher.mdl]],
            boss = [[Units\Undead\Abomination\Abomination.mdl]]},
        {name = "불타는 스트라솔름", mission = "아직 불타는 시가지에서 식은 담장 가장자리를 따라 퓨트리스와 합류하세요.", landmark = "불탄 시가지의 잔해",
            hint = "가까운 양옆 통로에서 주기적으로 불길이 솟습니다. 위쪽 우회로의 흔적을 따라가 보세요.\n밝은 원은 공격 예고 · 장식용 불길은 피해 없음", tiles = {"Ddrt", "Ldrt", "Ddkr", "Dlvc"}, light = "Lordaeron", hour = 22,
            sound = [[Sound\Ambient\DoodadEffects\BlueFireBurstLoop.wav]],
            color = {255, 165, 100}, warning = {70, 230, 255},
            melee = [[Units\Undead\Ghoul\Ghoul.mdl]], ranged = [[Units\Undead\SkeletonMage\SkeletonMage.mdl]],
            boss = [[Units\Undead\Abomination\Abomination.mdl]], burningBoss = true},
        {name = "스트라솔름 납골당", mission = "서리 낀 납골당에서 새어 나오는 냉기를 헤치고, 안쪽에서 빗장이 풀린 문을 살피세요.", landmark = "얼어붙은 납골당 문",
            hint = "폐허 뒤에서 원거리 사선을 끊으세요. 빗장 조사는 자리를 떠나도 진행도가 유지됩니다.\n첫 파동을 피할 틈을 확보하세요 · 공중 적 주의", tiles = {"Nsnw", "Nice", "Nsnr"}, light = "Lordaeron", hour = 0, weather = "SNls",
            sound = [[Sound\Ambient\BattleNetWindStereoLoop1.wav]],
            color = {145, 200, 255}, warning = {255, 80, 30},
            melee = [[Units\Creeps\Revenant\Revenant.mdl]], ranged = [[Units\Undead\Necromancer\Necromancer.mdl]],
            boss = [[Units\Creeps\Revenant\Revenant.mdl]]},
        {name = "로데론 수도 성문", mission = "성문 앞 스컬지 수색대의 검문소를 돌파하고 하수구로 가는 이송 경로를 확보하세요.", landmark = "성문 앞 수색대 검문소",
            hint = "연결된 길목으로 포위를 벗어나세요. 전령의 명령서를 회수하면 첫 지원 요청을 막을 수 있습니다.\n추적대장은 주기적으로 지원병을 부릅니다.", tiles = {"Ybtl", "Yrtl", "Ldrt", "Lrok"}, light = "Dalaran", hour = 2, weather = "RAlr",
            sound = [[Sound\Ambient\RainAmbience.wav]],
            color = {170, 190, 235}, warning = {255, 180, 40},
            melee = [[Units\Undead\Skeleton\Skeleton.mdl]], ranged = [[Units\Creeps\SkeletonArcher\SkeletonArcher.mdl]],
            flying = [[Units\Undead\Banshee\Banshee.mdl]],
            boss = [[Units\Creeps\RevenantOfTheWaves\RevenantOfTheWaves.mdl]]},
        {name = "로데론 수도 하수구", mission = "사슬의 감시자를 처치하고 퓨트리스와 하수구의 마지막 봉쇄를 넘으세요.", landmark = "사슬로 막힌 하수구 관문",
            hint = "외곽 봉인 세 곳을 풀면 첫 사슬 봉쇄의 중앙 줄이 사라집니다.\n중앙은 넓은 결전 공간 · 돌진·파동·사슬·십자 공격에 대비하세요.", tiles = {"Xbtl", "Ddkr", "Lrok", "Dlvc"}, blight = true, light = "Dalaran", hour = 4,
            sound = [[Sound\Ambient\DoodadEffects\CityScapeMagicRunesLoop1.wav]],
            color = {190, 165, 225}, warning = {255, 190, 60},
            melee = [[Units\Undead\Skeleton\Skeleton.mdl]], ranged = [[Units\Undead\Necromancer\Necromancer.mdl]],
            flying = [[Units\Undead\Banshee\Banshee.mdl]],
            boss = [[Units\Undead\HeroLich\HeroLich.mdl]]},
    }
    for i, theme in ipairs(themes) do
        theme.ids = {melee = FourCC("sm0" .. i), ranged = FourCC("sr0" .. i), flying = FourCC("sf0" .. i), boss = FourCC("sb0" .. i)}
        theme.flying = theme.flying or [[Units\Undead\Gargoyle\Gargoyle.mdl]]
    end
    local effects, weather, sound, rect, arena = {}, nil, nil, nil, nil
    local sceneProps, paintBounds, currentTheme = {}, nil, nil
    local dialogueAudioOwners, soundVolume = {}, nil
    local function RefreshAmbienceVolume()
        local volume = next(dialogueAudioOwners) and 8 or 18
        if sound and soundVolume ~= volume then
            -- This is our loop's gain, independent of the player's master sound setting.
            local ok = pcall(SetSoundVolume, sound, volume)
            if ok then soundVolume = volume end
        end
    end
    function SurvivorStage.SetDialogueAmbience(enabled, owner)
        owner = owner or "story"
        dialogueAudioOwners[owner] = enabled and true or nil
        RefreshAmbienceVolume()
    end
    local painted, paintedCells, heightLocation = {}, {}, nil
    local cells, walls, reachable, lava = {}, {}, {}, {}
    -- Stock assets, resolved through the player's graphics mode. No imported model overrides.
    local grave = [[Doodads\Cityscape\Props\CityGrave\CityGrave]]
    local column = [[Doodads\Cityscape\Structures\City_ColumnSingle]]
    local ice = [[Doodads\Northrend\Rocks\North_IceClaw\North_IceClaw]]
    local rock = [[Doodads\Northrend\Rocks\North_Rocks\North_Rocks]]
    local bone = [[Doodads\Northrend\Props\North_Bones\North_Bones]]
    local broken = [[Doodads\Ashenvale\Structures\AshenBrokenColumn\AshenBrokenColumn]]
    local rubble = [[Doodads\Ruins\Rocks\CliffRubble_Single\CliffRubble_Single]]
    local footprint = [[Objects\Spawnmodels\Other\IllidanFootprint\IllidanSpawnFootPrint0.mdl]]
    local cart = [[Doodads\LordaeronSummer\Props\HayCart\HayCart.mdl]]
    local vial = [[Objects\InventoryItems\PotionGreen\PotionGreen.mdl]]
    local pools = {
        {grave .. "0.mdl", grave .. "1.mdl", grave .. "3.mdl", broken .. "1.mdl", bone .. "2.mdl"},
        {rock .. "1.mdl", rock .. "4.mdl", rubble .. "0.mdl", rubble .. "2.mdl", bone .. "4.mdl"},
        {ice .. "0.mdl", ice .. "3.mdl", rock .. "2.mdl", column .. "2_Ruined\\City_ColumnSingle2_Ruined.mdl", ice .. "7.mdl"},
        {column .. "1_Ruined\\City_ColumnSingle1_Ruined.mdl", column .. "2_Ruined\\City_ColumnSingle2_Ruined.mdl",
            rubble .. "1.mdl", broken .. "0.mdl", bone .. "3.mdl"},
        {broken .. "0.mdl", broken .. "1.mdl", rubble .. "2.mdl",
            [[Doodads\Ashenvale\Props\AshenBrokenObilisk\AshenBrokenObilisk0.mdl]], bone .. "1.mdl"},
    }
    local sceneryColors = {{175, 185, 150}, {125, 100, 90}, {190, 215, 245}, {155, 165, 185}, {160, 145, 175}}
    local function Variation(seed, salt)
        -- Local deterministic variation never consumes combat/loot random numbers.
        local value = math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453
        return value - math.floor(value)
    end
    local function Inside(x, y, margin)
        margin = margin or 128
        return arena and x >= arena.minX + margin and x <= arena.maxX - margin
            and y >= arena.minY + margin and y <= arena.maxY - margin
    end
    local function InClearing(x, y)
        local cx, cy = (arena.minX + arena.maxX) / 2, (arena.minY + arena.maxY) / 2
        return (x - cx)^2 + (y - cy)^2 < 420^2
    end
    local function OnOwnedWall(x, y)
        for _, wall in ipairs(walls) do
            if x >= wall.x1 and x <= wall.x2 and y >= wall.y1 and y <= wall.y2 then return true end
        end
        return false
    end
    local function Terrain(index, x, y, tile, blighted, background)
        -- Own a single terrain cell, including its authored variation and blight.
        -- Background texture includes blocked ground; height, water, cliffs and pathing stay authored.
        x, y = math.floor(x / 128) * 128 + 64, math.floor(y / 128) * 128 + 64
        if background then
            if x < paintBounds.minX or x > paintBounds.maxX or y < paintBounds.minY or y > paintBounds.maxY then return end
        elseif not Inside(x, y) or (IsTerrainPathable(x, y, PATHING_TYPE_WALKABILITY) and not OnOwnedWall(x, y)) then
            return
        end
        local key = x .. ":" .. y
        if not paintedCells[key] then
            local cell = {x = x, y = y, tile = GetTerrainType(x, y),
                variation = GetTerrainVariance(x, y), blighted = IsPointBlighted(x, y)}
            painted[#painted + 1], paintedCells[key] = cell, cell
        end
        local variant = math.floor(Variation(math.floor(x / 128) * 31 + math.floor(y / 128) * 17, index) * 4)
        SetTerrainType(x, y, FourCC(tile), variant, 1, 1)
        if blighted ~= nil then SetBlightPoint(Player(SurvivorConfig.playerId), x, y, blighted) end
    end
    local function RestoreTerrain()
        for _, cell in ipairs(painted) do
            SetTerrainType(cell.x, cell.y, cell.tile, cell.variation, 1, 1)
            SetBlightPoint(Player(SurvivorConfig.playerId), cell.x, cell.y, cell.blighted)
        end
        painted, paintedCells = {}, {}
    end
    local function Ground(effect, x, y)
        MoveLocation(heightLocation, x, y)
        BlzSetSpecialEffectZ(effect, GetLocationZ(heightLocation))
    end
    local function Scenery(model, x, y, scale, angle, color)
        local effect = AddSpecialEffect(model, x, y)
        if not effect then return end
        effects[#effects + 1] = effect
        Ground(effect, x, y)
        BlzSetSpecialEffectScale(effect, scale or 1)
        BlzSetSpecialEffectYaw(effect, angle or 0)
        BlzSetSpecialEffectColor(effect, color[1], color[2], color[3])
        -- Place persistent scenery in its idle sequence instead of a transient spawn sequence.
        BlzPlaySpecialEffect(effect, ANIM_TYPE_STAND)
        return effect
    end
    function SurvivorStage.SceneProp(key, model, x, y, scale, angle, tint)
        assert(currentTheme and heightLocation, "Initialize stage presentation before scene scenery")
        if sceneProps[key] then return sceneProps[key] end
        if #effects >= 96 or not Inside(x, y, 32) then return end
        local effect = Scenery(model, x, y, scale, angle, tint or sceneryColors[currentTheme])
        sceneProps[key] = effect
        return effect
    end
    local function Prop(index, model, x, y, scale, angle, tint)
        -- Reserve room for the same scenery viewed during the dialogue scene.
        if #effects >= 80 or x < arena.minX + 128 or x > arena.maxX - 128
            or y < arena.minY + 128 or y > arena.maxY - 128 or InClearing(x, y) then return end
        if IsTerrainPathable(x, y, PATHING_TYPE_WALKABILITY) and not OnOwnedWall(x, y) then return end
        return Scenery(model, x, y, scale, angle, tint or sceneryColors[index])
    end
    local function Decorate(index, x, y, scale, seed, solid)
        if #effects >= 80 or x < arena.minX + 128 or x > arena.maxX - 128
            or y < arena.minY + 128 or y > arena.maxY - 128 or InClearing(x, y) then return end
        if not solid and IsTerrainPathable(x, y, PATHING_TYPE_WALKABILITY) then return end
        local models = pools[index]
        local choice = 1 + math.floor(Variation(seed, 4) * #models)
        if solid and index ~= 3 and choice == #models then choice = 1 end -- Bones do not describe a solid wall.
        local model = models[choice]
        local color, shade = sceneryColors[index], 0.9 + Variation(seed, 7) * 0.1
        local effect = Scenery(model, x, y, scale, Variation(seed, 5) * math.pi * 2,
            {math.floor(color[1] * shade), math.floor(color[2] * shade), math.floor(color[3] * shade)})
        if effect then BlzSetSpecialEffectRoll(effect, (Variation(seed, 6) - 0.5) * (solid and 0.10 or 0.20)) end
    end
    local function TileAt(index, x, y)
        local patch = math.sin(x / 360 + index) + math.cos(y / 480 - index) + 0.35 * math.sin((x - y) / 190)
        local distance = math.sqrt(x * x + y * y)
        if index == 1 then
            if distance < 340 then return "Ldrt" end
            if math.abs(distance - 440) < 65 then return patch > 0.6 and "Lrok" or "Ldro" end
            return patch > 0.15 and "Lgrd" or patch < -1.1 and "Lrok" or "Ldro"
        elseif index == 2 then
            -- Burnt road in Lordaeron, with isolated hot debris rather than a lava biome.
            local edge = math.abs(y - math.sin(x / 550) * 80)
            local detour = math.abs(y - 950 - math.sin(x / 700) * 90) < 190
            if edge < 185 or detour then return "Ddrt" end
            if edge < 315 then return "Ldrt" end
            if math.abs(math.abs(x) - 780) < 160 and math.abs(math.abs(y) - 430) < 120 then return "Dlvc" end
            return patch > -0.15 and "Ddkr" or patch < -1.15 and "Ldrt" or "Ddrt"
        elseif index == 3 then
            -- Snow remains continuous across the playable district and its visible border.
            local frozenChannel = math.abs(x - math.sin(y / 760) * 390) < 160
            return (frozenChannel or (distance > 400 and patch > 1.2)) and "Nice"
                or patch < -0.45 and "Nsnr" or "Nsnw"
        elseif index == 4 then
            local street = math.abs(x - math.sin(y / 900) * 60) < 230 or math.abs(y + 180) < 160
            if distance < 320 then return patch > 1.0 and "Yrtl" or "Ybtl" end
            if street then return patch < -1.15 and "Ldrt" or patch > 0.2 and "Yrtl" or "Ybtl" end
            return patch > 0.65 and "Lrok" or patch < -0.15 and "Ldrt" or "Yrtl"
        end
        if distance < 330 then return "Xbtl" end
        if math.abs(distance - 510) < 75 or math.abs(distance - 980) < 100 then
            return patch < -0.7 and "Lrok" or "Xbtl"
        end
        return patch > 1.25 and distance > 1100 and "Dlvc" or patch < -0.45 and "Lrok" or "Ddkr"
    end
    local function PaintTerrain(index, cx, cy)
        -- Follow the real movement area, with a bounded sight buffer beyond it. A small
        -- central disc leaves the editor biome exposed as soon as the hero walks away.
        local minX, minY = math.ceil((paintBounds.minX - 64) / 128) * 128 + 64,
            math.ceil((paintBounds.minY - 64) / 128) * 128 + 64
        for x = minX, paintBounds.maxX, 128 do
            for y = minY, paintBounds.maxY, 128 do
                local dx, dy = x - cx, y - cy
                local edge = math.min(x - paintBounds.minX, paintBounds.maxX - x,
                    y - paintBounds.minY, paintBounds.maxY - y)
                -- Frosted rock forms a natural snowy border rather than revealing bare dirt.
                local tile = index == 3 and edge < 512 and "Nsnr" or TileAt(index, dx, dy)
                local blighted = themes[index].blight == true and dx * dx + dy * dy > 1000^2 and OnOwnedWall(x, y)
                Terrain(index, x, y, tile, blighted, true)
            end
        end
    end
    local function PaintConnectedPaths(index)
        local floor = ({"Ldrt", "Ddrt", "Nice", "Yrtl", "Xbtl"})[index]
        local verge = ({"Ldro", "Ldrt", "Nsnr", "Ybtl", "Lrok"})[index]
        local targets = SurvivorStage.SearchPoints(index)
        local approach = SurvivorStage.LandmarkApproach()
        if approach then targets[#targets + 1] = approach end
        local visited = {}
        for _, point in ipairs(targets) do
            local node
            for _, candidate in ipairs(reachable) do
                if candidate.x == point.x and candidate.y == point.y then node = candidate; break end
            end
            while node do
                local key = node.ix .. ":" .. node.iy
                if visited[key] then break end
                visited[key] = true
                Terrain(index, node.x, node.y, floor, false)
                if (node.ix + node.iy) % 3 == 0 then
                    Terrain(index, node.x + 128, node.y, verge, false)
                    Terrain(index, node.x, node.y - 128, verge, false)
                end
                node = node.parent
            end
        end
    end
    local function DressLandmark(index)
        -- The dominant silhouette occupies an already blocked wall. It cannot create
        -- invisible new obstacles or narrow the routes used by search objectives.
        local wall = walls[1]
        local x, y = (wall.x1 + wall.x2) / 2, (wall.y1 + wall.y2) / 2
        local gate = [[Doodads\LordaeronSummer\Terrain\Gate\Gate.mdl]]
        local mainModels = {grave .. "0.mdl", cart, gate,
            column .. "1_Ruined\\City_ColumnSingle1_Ruined.mdl", gate}
        local function LandmarkProp(model, px, py, scale, angle, tint) return Prop(index, model, px, py, scale, angle, tint) end
        local vertical = wall.y2 - wall.y1 > wall.x2 - wall.x1
        LandmarkProp(mainModels[index], x, y, index == 1 and 0.85 or 0.65, vertical and math.pi / 2 or 0)
        for _, direction in ipairs({-1, 1}) do
            local px, py = x + (vertical and 0 or direction * 190), y + (vertical and direction * 190 or 0)
            if index == 1 then px, py = x + direction * 55, y + direction * 35 end
            LandmarkProp(index == 3 and ice .. "0.mdl" or broken .. "0.mdl", px, py, 0.40, direction * 0.35)
        end
        if index == 2 then
            LandmarkProp([[Doodads\Dungeon\Rocks\Cave_FieryCrator\Cave_FieryCrator.mdl]], x + 80, y, 0.30)
            LandmarkProp(vial, x - 40, y - 70, 0.45, 0, {125, 145, 105})
            LandmarkProp(rubble .. "0.mdl", x + 90, y + 40, 0.40)
        elseif index == 4 then
            -- The order itself belongs to the courier. These remain unexamined checkpoint supplies.
            LandmarkProp(cart, x + 70, y + 30, 0.40, 0.35)
        elseif index == 5 then
            LandmarkProp(cart, x + 20, y + 60, 0.45, vertical and math.pi / 2 or 0)
        end
        -- A small forecourt and worn threshold tie the landmark to the surrounding ground.
        -- Terrain texture only: preserve editor height, water, cliffs and pathing.
        local floor = ({"Ldro", "Ddrt", "Nice", "Yrtl", "Xbtl"})[index]
        for a = -2, 2 do
            for b = 1, 3 do
                local px = x + (vertical and b * 128 or a * 128)
                local py = y + (vertical and a * 128 or -b * 128)
                if px > arena.minX + 128 and px < arena.maxX - 128 and py > arena.minY + 128 and py < arena.maxY - 128 then
                    Terrain(index, px, py, floor, false)
                end
            end
        end
        -- Low details stay beside the wall rather than hiding enemies in the clearing.
        local floorDetails = {bone .. "2.mdl", rubble .. "0.mdl", ice .. "3.mdl", rubble .. "1.mdl", bone .. "1.mdl"}
        for i = 1, 4 do
            LandmarkProp(floorDetails[index], x + (vertical and 95 or (i - 2.5) * 85),
                y + (vertical and (i - 2.5) * 85 or -100), 0.16 + i * 0.025, i * 1.3)
        end
    end
    local function DressSearchRoute(index)
        -- Use the same reachable points as gameplay, rather than a competing decorative trail.
        -- Only low, nonblocking details occupy the open route; tall carts stay in existing walls.
        for i, point in ipairs(SurvivorStage.SearchPoints(index)) do
            if index == 1 or index == 2 or index == 5 then
                for j = 1, 2 do
                    Prop(index, footprint, point.x - 40 + j * 36, point.y - 45 + j * 23,
                        0.28, index == 2 and 0 or 0.65, {100, 110, 100})
                end
            end
            if index == 1 then
                Prop(index, bone .. "2.mdl", point.x + 105, point.y + 80, 0.20, i * 0.65)
                Prop(index, bone .. "3.mdl", point.x - 135, point.y + 50, 0.14, i * 0.9)
            elseif index == 2 then
                Prop(index, rubble .. "0.mdl", point.x + 115, point.y + 100, 0.18, i * 0.75)
                Prop(index, rubble .. "2.mdl", point.x - 150, point.y + 70, 0.14, i * 1.1, {95, 85, 80})
            elseif index == 3 then
                Prop(index, ice .. "0.mdl", point.x + 155, point.y + 110, 0.24, 0.8)
                Prop(index, footprint, point.x + 50, point.y + 30, 0.25, 0.7, {135, 170, 200})
                Prop(index, ice .. "3.mdl", point.x - 135, point.y + 80, 0.18, 2.4)
            elseif index == 4 then
                -- A worn street and low debris outline the courier's connected patrol route.
                Prop(index, rubble .. "1.mdl", point.x + 130, point.y + 90, 0.20, i)
                Prop(index, rubble .. "2.mdl", point.x - 150, point.y + 65, 0.15, i * 0.8)
                Terrain(index, point.x, point.y, "Yrtl", false)
            else
                Prop(index, bone .. "1.mdl", point.x + 115, point.y + 85, 0.20, i)
                Prop(index, rubble .. "2.mdl", point.x - 140, point.y + 60, 0.16, i * 1.25)
                Terrain(index, point.x, point.y, "Xbtl", false)
            end
            -- Broken patches around each real clue distinguish it from the connecting road.
            local floor, edge = ({"Ldro", "Ldrt", "Nice", "Ybtl", "Xbtl"})[index],
                ({"Lrok", "Ddkr", "Nsnr", "Ldrt", "Lrok"})[index]
            for a = -2, 2 do
                for b = -2, 2 do
                    if a * a + b * b <= 5 then
                        Terrain(index, point.x + a * 128, point.y + b * 128,
                            a * a + b * b <= 1 and floor or edge, false)
                    end
                end
            end
        end
    end
    local function DressStage(index, cx, cy)
        -- Asymmetric clusters suggest burial plots, collapsed shelves and old courtyards.
        -- Tall silhouettes are restricted to blocked geometry and the outer scenery belt.
        local anchors = {{-1650, 780}, {1380, 1130}, {-1280, -1460}, {1720, -820}, {420, 1850}, {-620, -1920}}
        local scale = math.min(1, (arena.maxX - arena.minX - 512) / 4200, (arena.maxY - arena.minY - 512) / 4200)
        for group, point in ipairs(anchors) do
            local ax = cx + (point[1] + (Variation(index * 37 + group, 1) - 0.5) * 160) * scale
            local ay = cy + (point[2] + (Variation(index * 37 + group, 2) - 0.5) * 160) * scale
            if (ax - cx)^2 + (ay - cy)^2 > 1150^2 then
                local count = 2 + (group + index) % 2
                for i = 1, count do
                    local seed = index * 1000 + group * 20 + i
                    local angle, radius = Variation(seed, 8) * 2 * math.pi, math.sqrt(Variation(seed, 9)) * 200
                    Decorate(index, ax + math.cos(angle) * radius, ay + math.sin(angle) * radius,
                        i == 1 and 0.55 or 0.25 + Variation(seed, 3) * 0.25, seed, false)
                end
            end
        end
        -- The outer map already has the editor's town, trees and cliffs. Keep those silhouettes.
    end
    -- Only cells owned by this stage are changed. Restore their original pathing on exit.
    local function ClearGeometry()
        for _, cell in ipairs(cells) do SetTerrainPathable(cell.x, cell.y, PATHING_TYPE_WALKABILITY, cell.walkable) end
        cells, walls, reachable, lava = {}, {}, {}, {}
    end
    function SurvivorStage.LineClear(ax, ay, bx, by)
        for _, wall in ipairs(walls) do
            local low, high = 0, 1
            for axis = 1, 2 do
                local origin, delta = axis == 1 and ax or ay, axis == 1 and bx - ax or by - ay
                local lo, hi = axis == 1 and wall.x1 or wall.y1, axis == 1 and wall.x2 or wall.y2
                if math.abs(delta) < 0.001 then
                    if origin < lo or origin > hi then low = 2; break end
                else
                    local a, b = (lo - origin) / delta, (hi - origin) / delta
                    if a > b then a, b = b, a end
                    low, high = math.max(low, a), math.min(high, b)
                end
            end
            if low <= high then return false end
        end
        return true
    end
    local function BuildReachable(cx, cy)
        local queue, visited, head = {{x = cx, y = cy, ix = 0, iy = 0}}, {["0:0"] = true}, 1
        -- Geometry is fixed throughout this synchronous flood. Share overlapping
        -- margin/edge reads only within this build, before any later pathing edits.
        local pathing, reads = {}, 0
        local offsets = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}}
        local margins = {{0, 0}, {32, 0}, {-32, 0}, {0, 32}, {0, -32}}
        local function Blocked(x, y)
            local column = pathing[x]
            if not column then column = {}; pathing[x] = column end
            if column[y] == nil then
                column[y] = IsTerrainPathable(x, y, PATHING_TYPE_WALKABILITY)
                reads = reads + 1
            end
            return column[y]
        end
        while head <= #queue do
            local p = queue[head]; head = head + 1
            reachable[#reachable + 1] = p
            for _, offset in ipairs(offsets) do
                local ix, iy = p.ix + offset[1], p.iy + offset[2]
                local key, x, y = ix .. ":" .. iy, cx + ix * 128, cy + iy * 128
                if not visited[key] and math.abs(ix) <= 12 and math.abs(iy) <= 12 then
                    local valid = x > arena.minX + 96 and x < arena.maxX - 96 and y > arena.minY + 96 and y < arena.maxY - 96
                    -- A hero-sized margin at the node plus a continuous walkable edge.
                    for _, d in ipairs(margins) do
                        if not valid then break end
                        if Blocked(x + d[1], y + d[2]) then valid = false end
                    end
                    for i = 1, 4 do
                        if not valid then break end
                        if Blocked(p.x + (x - p.x) * i / 4, p.y + (y - p.y) * i / 4) then valid = false end
                    end
                    if valid then visited[key] = true; queue[#queue + 1] = {x = x, y = y, ix = ix, iy = iy, parent = p} end
                end
            end
        end
        SurvivorMetrics.Count("stage.reachability.pathingReads", reads)
        SurvivorMetrics.Count("stage.reachability.nodes", #reachable)
    end
    function SurvivorStage.FindPoint(angle, distance, avoid)
        if not arena then return nil end
        local cx, cy = (arena.minX + arena.maxX) / 2, (arena.minY + arena.maxY) / 2
        local tx, ty, best, score = cx + math.cos(angle) * distance, cy + math.sin(angle) * distance, nil, math.huge
        for _, p in ipairs(reachable) do
            local valid = (p.x - cx)^2 + (p.y - cy)^2 >= 400^2
            for _, q in ipairs(avoid or {}) do if (p.x - q.x)^2 + (p.y - q.y)^2 < 320^2 then valid = false end end
            local value = (p.x - tx)^2 + (p.y - ty)^2
            if valid and value < score then best, score = p, value end
        end
        return best and {x = best.x, y = best.y} or nil
    end
    function SurvivorStage.LavaPoints() return lava end
    function SurvivorStage.LandmarkApproach(avoid)
        if not arena or not walls[1] then return nil end
        local wall = walls[1]
        local cx, cy = (arena.minX + arena.maxX) / 2, (arena.minY + arena.maxY) / 2
        local vertical = wall.y2 - wall.y1 > wall.x2 - wall.x1
        local x = vertical and wall.x2 + 192 or (wall.x1 + wall.x2) / 2
        local y = vertical and (wall.y1 + wall.y2) / 2 or wall.y1 - 192
        return SurvivorStage.FindPoint(Atan2(y - cy, x - cx), math.sqrt((x - cx)^2 + (y - cy)^2), avoid)
    end
    function SurvivorStage.SearchPoints(index)
        local points, count = {}, ({3, 4, 1, 3, 3})[index]
        if not count then return points end
        for i = 1, count do
            local angle = index == 2 and ({2.95, 2.2, 0.95, 0.2})[i]
                or math.pi / 4 + (index - 1) * math.pi / 2 + (i - 1) * 0.85
            local point = index == 3 and SurvivorStage.LandmarkApproach(points)
                or SurvivorStage.FindPoint(angle, index == 2 and 1050 or 650 + (i - 1) * 200, points)
            if point then points[#points + 1] = point end
        end
        return points
    end
    function SurvivorStage.ScenePoint()
        local point = SurvivorStage.LandmarkApproach()
        if not point or not arena then return nil end
        -- Leave space for the two actors and the final departure shot, even on a small arena.
        local margin = math.min(900, (arena.maxX - arena.minX) / 3, (arena.maxY - arena.minY) / 3)
        return {x = math.max(arena.minX + margin, math.min(arena.maxX - margin, point.x)),
            y = math.max(arena.minY + margin, math.min(arena.maxY - margin, point.y))}
    end
    local function BuildGeometry(index, cx, cy)
        local scale = math.min(1, (arena.maxX - arena.minX - 384) / 2600, (arena.maxY - arena.minY - 384) / 2600)
        local layouts = {
            {{-900,-450,-700,-250},{650,250,850,450},{-350,850,-150,1050},{350,-1050,550,-850}},
            {{-1000,350,-350,510},{350,350,1000,510},{-1000,-510,-350,-350},{350,-510,1000,-350}},
            {{-1000,500,-350,660},{350,500,1000,660},{-660,-1000,-500,-350},{500,-1000,660,-350}},
            {{-1100,450,-450,610},{450,-610,1100,-450},{-610,-1100,-450,-450},{450,450,610,1100}},
            {{-1200,-500,-1040,200},{1040,-200,1200,500},{-500,1040,200,1200},{-200,-1200,500,-1040}},
        }
        local seen = {}
        for _, box in ipairs(layouts[index]) do
            local x1, y1 = math.floor((cx + box[1] * scale) / 32) * 32, math.floor((cy + box[2] * scale) / 32) * 32
            local x2, y2 = math.ceil((cx + box[3] * scale) / 32) * 32, math.ceil((cy + box[4] * scale) / 32) * 32
            walls[#walls + 1] = {x1 = x1, y1 = y1, x2 = x2, y2 = y2}
            for x = x1 + 16, x2 - 16, 32 do
                for y = y1 + 16, y2 - 16, 32 do
                    local key = x .. ":" .. y
                    if not seen[key] then
                        seen[key] = true
                        cells[#cells + 1] = {x = x, y = y, walkable = not IsTerrainPathable(x, y, PATHING_TYPE_WALKABILITY)}
                        SetTerrainPathable(x, y, PATHING_TYPE_WALKABILITY, false)
                    end
                end
            end
            -- Mixed silhouettes stay inside the existing blocked footprints.
            local length, vertical = math.max(x2 - x1, y2 - y1), y2 - y1 > x2 - x1
            local count = math.max(2, math.ceil(length / 150))
            for i = 1, count do
                local seed = index * 100 + #walls * 11 + i
                local x, y = (x1 + x2) / 2, (y1 + y2) / 2
                if vertical then y = y1 + (y2 - y1) * (i - 0.5) / count
                else x = x1 + (x2 - x1) * (i - 0.5) / count end
                if #walls ~= 1 or math.abs(i - (count + 1) / 2) > 1 then
                    Decorate(index, x + (Variation(seed, 1) - 0.5) * 28, y + (Variation(seed, 2) - 0.5) * 28,
                        0.65 + Variation(seed, 3) * 0.25, seed, true)
                end
            end
        end
        if index == 2 then
            for _, x in ipairs({-780, 780}) do lava[#lava + 1] = {x = cx + x * scale, y = cy, radius = 190 * scale} end
        end
        BuildReachable(cx, cy)
        assert(#reachable >= 40, "Stage paths must connect to the starting clearing")
    end
    function SurvivorStage.Get(index) return assert(themes[index], "Invalid stage theme") end
    local function ClearPresentation()
        ClearGeometry()
        RestoreTerrain()
        for _, effect in ipairs(effects) do DestroyEffect(effect) end
        effects, sceneProps, currentTheme = {}, {}, nil
        if weather then EnableWeatherEffect(weather, false); RemoveWeatherEffect(weather); weather = nil end
        if sound then StopSound(sound, true, false); sound = nil end
        soundVolume = nil
    end
    function SurvivorStage.Cleanup()
        dialogueAudioOwners = {}
        RefreshAmbienceVolume()
        ClearPresentation()
        if rect then RemoveRect(rect); rect = nil end
        if heightLocation then RemoveLocation(heightLocation); heightLocation = nil end
        arena, paintBounds = nil, nil
    end
    function SurvivorStage.Init(bounds)
        SurvivorStage.Cleanup()
        arena = bounds
        -- GetWorldBounds returns a new rectangle. Snapshot and release it immediately.
        local world = GetWorldBounds()
        paintBounds = {minX = math.max(bounds.minX - 1024, GetRectMinX(world) + 64),
            maxX = math.min(bounds.maxX + 1024, GetRectMaxX(world) - 64),
            minY = math.max(bounds.minY - 1024, GetRectMinY(world) + 64),
            maxY = math.min(bounds.maxY + 1024, GetRectMaxY(world) - 64)}
        RemoveRect(world)
        rect = Rect(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY)
        heightLocation = Location((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2)
    end
    function SurvivorStage.Apply(index)
        assert(rect ~= nil, "Initialize stage arena first")
        local started, phase = SurvivorMetrics.Begin(), SurvivorMetrics.Begin()
        SurvivorMetrics.Count("stage.calls")
        ClearPresentation()
        SurvivorMetrics.End("stage.clear", phase)
        local theme = SurvivorStage.Get(index)
        currentTheme = index
        local cx, cy = (arena.minX + arena.maxX) / 2, (arena.minY + arena.maxY) / 2
        phase = SurvivorMetrics.Begin()
        BuildGeometry(index, cx, cy)
        SurvivorMetrics.Count("stage.geometry.cells", #cells)
        SurvivorMetrics.End("stage.geometry", phase)
        phase = SurvivorMetrics.Begin()
        PaintTerrain(index, cx, cy)
        PaintConnectedPaths(index)
        SurvivorMetrics.End("stage.terrain", phase)
        phase = SurvivorMetrics.Begin()
        DressLandmark(index)
        DressSearchRoute(index)
        DressStage(index, cx, cy)
        SurvivorMetrics.Count("stage.terrain.cells", #painted)
        SurvivorMetrics.Count("stage.scenery.effects", #effects)
        SurvivorMetrics.End("stage.scenery", phase)
        local dnc = "Environment\\DNC\\DNC" .. theme.light .. "\\DNC" .. theme.light
        SetDayNightModels(dnc .. "Terrain\\DNC" .. theme.light .. "Terrain.mdl", dnc .. "Unit\\DNC" .. theme.light .. "Unit.mdl")
        SuspendTimeOfDay(true)
        SetFloatGameState(GAME_STATE_TIME_OF_DAY, theme.hour)
        FogMaskEnable(false)
        FogEnable(false)
        ResetTerrainFog()
        if theme.weather then weather = AddWeatherEffect(rect, FourCC(theme.weather)); EnableWeatherEffect(weather, true) end
        sound = CreateSound(theme.sound, true, false, false, 500, 500, "DefaultEAXON")
        if sound then RefreshAmbienceVolume(); StartSound(sound) end
        SurvivorMetrics.End("stage.apply", started)
    end
end
