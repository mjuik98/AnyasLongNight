-- Enemy spawning and steering: wave/elite/boss/courier spawns on reachable ground away
-- from the hero, owner rotation for pathing, the periodic enemy scan (chasers, ranged
-- shooters, couriers, swarm-rush marchers, elite traits, boss patterns) and releases
-- without a kill. SurvivorCombat binds its primitives once and attaches each run table.
SurvivorCombatEnemies = {}
do
    local run = nil
    local Status, Hazards = SurvivorCombatStatus, SurvivorCombatHazards
    local Alive = SurvivorUtil.UnitLive
    local Enemy, UnitTime, UnitTimeStopped, StopUnitTime, SegmentDistanceSquared, HurtHero
    -- Rotation state survives runs: owner slots are configured once per map.
    local enemyOwners, enemyOwnerSerial = nil, 0
    local orderSerial, orderPhase = 0, 0
    local moveOrder, attackOrder -- Constant order ids, read once on attach instead of every enemy tick.
    function SurvivorCombatEnemies.Bind(combat)
        Enemy, UnitTime, UnitTimeStopped = combat.Enemy, combat.UnitTime, combat.UnitTimeStopped
        StopUnitTime, SegmentDistanceSquared, HurtHero = combat.StopUnitTime, combat.SegmentDistanceSquared, combat.HurtHero
    end
    -- The run table owned by SurvivorCombat (hero, units, stage, boss, enemyCount, ...).
    function SurvivorCombatEnemies.Attach(state)
        run = state
        if state.hero then moveOrder, attackOrder = OrderId("move"), OrderId("attack") end
    end
    -- Warcraft queues pathing per player, so one owner with hundreds of units stutters.
    -- Spread enemies over allied slots that borrow Neutral Hostile's color; all share one display name.
    local function NextEnemyOwner()
        if not enemyOwners then
            local template, heroOwner = Player(PLAYER_NEUTRAL_AGGRESSIVE), SurvivorUtil.Owner()
            enemyOwners = {}
            for _, id in ipairs(SurvivorConfig.enemyPlayerIds) do enemyOwners[#enemyOwners + 1] = Player(id) end
            for _, owner in ipairs(enemyOwners) do
                SetPlayerColor(owner, GetPlayerColor(template))
                SetPlayerName(owner, SurvivorConfig.enemyPlayerName)
                SetPlayerAlliance(owner, heroOwner, ALLIANCE_PASSIVE, false)
                SetPlayerAlliance(heroOwner, owner, ALLIANCE_PASSIVE, false)
                SetPlayerAlliance(owner, template, ALLIANCE_PASSIVE, true)
                SetPlayerAlliance(template, owner, ALLIANCE_PASSIVE, true)
                for _, other in ipairs(enemyOwners) do
                    if other ~= owner then SetPlayerAlliance(owner, other, ALLIANCE_PASSIVE, true) end
                end
            end
        end
        enemyOwnerSerial = enemyOwnerSerial % #enemyOwners + 1
        return enemyOwners[enemyOwnerSerial]
    end
    -- Each move order repaths; skip it while the unit already heads near the same point.
    -- A unit still moving re-aims only on its due tick; a lost order is replaced at once.
    local function Move(unit, record, x, y, slack, due)
        local ox, oy = record.moveX, record.moveY
        if ox and GetUnitCurrentOrder(unit) == moveOrder
            and (not due or (ox - x)^2 + (oy - y)^2 <= slack * slack) then return end
        record.moveX, record.moveY = x, y
        IssuePointOrder(unit, "move", x, y)
    end
    local eliteTraits = {
        {id = "tracker", name = "추격자", color = {255, 145, 70}, model = [[Abilities\Spells\Orc\Bloodlust\BloodlustTarget.mdl]]},
        {id = "guardian", name = "결계지기", color = {90, 160, 255}, model = [[Abilities\Spells\Human\ManaShield\ManaShieldTarget.mdl]]},
        {id = "plague", name = "역병술사", color = {200, 100, 230}, model = [[Abilities\Spells\Undead\DiseaseCloud\DiseaseCloudTarget.mdl]]},
    }
    function SurvivorCombatEnemies.Spawn(elite, kind)
        local c, elapsed = SurvivorConfig, RunSession.GetElapsed() - run.stageStarted
        local encounter = c.encounters[run.stage]
        if not RunSession.IsRunning() or not Alive(run.hero) then return false end
        local isBoss = kind == "boss"
        if isBoss and (run.boss ~= nil or run.bossDefeated) then return false end
        -- Reserve one actor slot so a full wave cannot block the final boss.
        local cap = math.min(c.maxEnemies, c.stageEnemyCaps[run.stage])
        if run.enemyCount >= cap - (isBoss and 0 or 1) then return false end
        if not kind then
            local roll = GetRandomInt(1, 100)
            local flying = elapsed >= encounter.flyingStart and encounter.flying or 0
            kind = not elite and roll <= flying and "flying"
                or not elite and elapsed >= encounter.rangedStart and roll <= flying + encounter.ranged and "ranged" or "melee"
        end
        local profile = kind == "ranged" and c.rangedEnemy or kind == "flying" and c.flyingEnemy or nil
        local scaling = c.EnemyScaling(run.stage, elapsed, isBoss)
        local theme = SurvivorStage.Get(run.stage)
        local id = theme.ids[isBoss and "boss" or kind == "courier" and "ranged" or kind]
        local heroX, heroY, distance = GetUnitX(run.hero), GetUnitY(run.hero), c.spawnDistance
        local enemy
        for _ = 1, 16 do
            local angle = GetRandomReal(0, 2 * math.pi)
            local x, y = heroX + math.cos(angle) * distance, heroY + math.sin(angle) * distance
            if x > run.bounds.minX and x < run.bounds.maxX and y > run.bounds.minY and y < run.bounds.maxY
                and not IsTerrainPathable(x, y, PATHING_TYPE_WALKABILITY) then
                enemy = CreateUnit(NextEnemyOwner(), id, x, y, 0)
                assert(enemy ~= nil and GetUnitTypeId(enemy) == id, "Enemy object ID is missing")
                -- Native pathing may relocate a unit; never accept a closer spawn.
                local actualX, actualY = GetUnitX(enemy), GetUnitY(enemy)
                local dx, dy = actualX - heroX, actualY - heroY
                if dx * dx + dy * dy + 0.01 >= distance * distance
                    and actualX > run.bounds.minX and actualX < run.bounds.maxX
                    and actualY > run.bounds.minY and actualY < run.bounds.maxY
                    and not IsTerrainPathable(actualX, actualY, PATHING_TYPE_WALKABILITY) then break end
                RemoveUnit(enemy)
                enemy = nil
            end
        end
        if not enemy then return false end
        run.units[enemy] = {enemy = true, alive = true, elite = elite == true, boss = isBoss,
            profile = profile, damageScale = scaling.damage * run.difficulty.damage,
            attackSpeed = scaling.attackSpeed * run.difficulty.attackSpeed,
            nextShot = RunSession.GetElapsed() + 1.2, nextBlast = RunSession.GetElapsed() + 2.0}
        run.enemyCount = run.enemyCount + 1
        SetUnitCreepGuard(enemy, false)
        RemoveGuardPosition(enemy)
        local life = (isBoss and c.bossLife or (profile and profile.life or c.enemyLife * encounter.meleeLife)
            * (elite and c.eliteLifeMultiplier or 1)) * scaling.life * run.difficulty.life
        -- Stage/profile multipliers produce reals; the max-HP native requires an integer.
        life = math.max(1, math.floor(life + 0.5))
        BlzSetUnitMaxHP(enemy, life)
        SetWidgetLife(enemy, life)
        BlzSetUnitBaseDamage(enemy, math.floor((isBoss and c.bossDamage or c.enemyDamage * (elite and c.eliteDamageMultiplier or 1)) * run.units[enemy].damageScale), 0)
        if not profile then
            -- Native melee swings and Lua ranged shots each use their own cooldown source.
            local cooldown = BlzGetUnitAttackCooldown(enemy, 0)
            if cooldown > 0 then BlzSetUnitAttackCooldown(enemy, cooldown / run.units[enemy].attackSpeed, 0) end
        end
        if isBoss then
            run.boss = enemy
            if theme.burningBoss then
                run.units[enemy].cosmetic = AddSpecialEffectTarget("Abilities\\Spells\\NightElf\\Immolation\\ImmolationTarget.mdl", enemy, "origin")
            end
            BlzSetUnitName(enemy, run.stage .. "단계 보스 · " .. encounter.bossName)
            SetUnitScale(enemy, 1.6, 1.6, 1.6)
        elseif profile then
            BlzSetUnitName(enemy, kind == "flying" and encounter.flyingName or encounter.rangedName)
            -- Lua projectiles can freeze with the same ALICE clock as our weapons.
            BlzUnitDisableAbility(enemy, FourCC("Aatk"), true, true)
        elseif elite then
            SetUnitScale(enemy, 1.35, 1.35, 1.35)
            BlzSetUnitName(enemy, "정예 · " .. encounter.meleeName)
        else
            BlzSetUnitName(enemy, encounter.meleeName)
            local scale = encounter.meleeScale
            if scale then SetUnitScale(enemy, scale, scale, scale) end
        end
        local color = theme.color
        if elite and not isBoss then
            run.eliteSerial = run.eliteSerial + 1
            local trait = eliteTraits[(run.eliteSerial - 1) % #eliteTraits + 1]
            local record = run.units[enemy]
            record.trait, record.nextTrait = trait.id, UnitTime(record) + 3
            record.cosmetic = AddSpecialEffectTarget(trait.model, enemy, "origin")
            BlzSetUnitName(enemy, "정예 " .. trait.name .. " · " .. encounter.meleeName)
            color = trait.color
        end
        run.units[enemy].baseColor = {color[1], color[2], color[3], 255}
        Status.Color(enemy, run.units[enemy])
        SetUnitMoveSpeed(enemy, math.min(330, (isBoss and c.bossMoveSpeed or profile and profile.speed or c.enemyMoveSpeed * encounter.meleeSpeed)
            * scaling.moveSpeed * run.difficulty.moveSpeed))
        run.units[enemy].baseSpeed = GetUnitMoveSpeed(enemy)
        ALICE_AddIdentifier(enemy, "hsEnemy", "unit")
        orderSerial = orderSerial % SurvivorConfig.enemyOrderGroups + 1
        run.units[enemy].orderGroup = orderSerial
        StopUnitTime(enemy, run.units[enemy], isBoss and run.timeStopBossUntil or run.timeStopUntil)
        if profile then Move(enemy, run.units[enemy], GetUnitX(run.hero), GetUnitY(run.hero), 0, true)
        else IssueTargetOrder(enemy, "attack", run.hero) end
        return true, enemy
    end
    function SurvivorCombatEnemies.SpawnCourier(points)
        local success, unit = SurvivorCombatEnemies.Spawn(false, "courier")
        if not success then return nil end
        local record = run.units[unit]
        record.courier, record.waypoint = points, 2
        SetUnitX(unit, points[1].x); SetUnitY(unit, points[1].y)
        SetUnitMoveSpeed(unit, 260); record.baseSpeed = 260
        BlzSetUnitName(unit, "수색 명령을 지닌 전령")
        record.baseColor = {235, 210, 100, 255}
        Status.Color(unit, record)
        BlzUnitDisableAbility(unit, FourCC("Aatk"), true, true)
        Move(unit, record, points[2].x, points[2].y, 0, true)
        return unit
    end
    -- Removes a living enemy without a kill: no XP, drops or death effects.
    function SurvivorCombatEnemies.Release(unit)
        local record = run.units[unit]
        if not record then return end
        Status.Forget(unit)
        if record.alive then run.enemyCount = run.enemyCount - 1; ALICE_RemoveIdentifier(unit, "hsEnemy") end
        if record.cosmetic then DestroyEffect(record.cosmetic) end
        run.units[unit] = nil
        RemoveUnit(unit)
    end
    function SurvivorCombatEnemies.SpawnBoss()
        return SurvivorCombatEnemies.Spawn(false, "boss")
    end
    -- One enemy scan (every 0.5 s): guardian shields, elite traits, couriers, rush marchers,
    -- ranged shooters, melee orders and boss patterns. Run time is the elapsed argument.
    function SurvivorCombatEnemies.Update(elapsed)
        orderPhase = orderPhase % SurvivorConfig.enemyOrderGroups + 1
        local guardians, rushHits = {}, {}
        for u, record in pairs(run.units) do
            if record.trait == "guardian" and Enemy(u) then
                guardians[#guardians + 1] = {unit = u, x = GetUnitX(u), y = GetUnitY(u)}
            end
        end
        for u, record in pairs(run.units) do
            if record.enemy then
                record.shieldSource = nil
                if #guardians > 0 and record.alive and not record.boss and record.trait ~= "guardian" then
                    local x, y = GetUnitX(u), GetUnitY(u)
                    for _, guardian in ipairs(guardians) do
                        if (guardian.x - x)^2 + (guardian.y - y)^2 <= 400^2 then
                            record.shieldSource = guardian.unit; break
                        end
                    end
                end
                if record.alive and not record.special and not UnitTimeStopped(u, elapsed)
                    and not (record.freezeUntil and record.freezeUntil > elapsed) then
                    local clock = UnitTime(record, elapsed)
                    if record.trait and clock >= record.nextTrait then
                        record.nextTrait = clock + 8
                        if record.trait == "tracker" then Hazards.StartSpecial("dash", record, u)
                        elseif record.trait == "plague" then Hazards.WarnPlague(u, record) end
                    end
                    if record.courier then
                        local point = record.courier[record.waypoint]
                        if (GetUnitX(u) - point.x)^2 + (GetUnitY(u) - point.y)^2 < 140^2 then
                            record.waypoint = record.waypoint % #record.courier + 1
                            point = record.courier[record.waypoint]
                        end
                        Move(u, record, point.x, point.y, 0, true)
                    elseif record.rush then
                        -- Straight marchers never re-aim; each one hurts at most once when its path crosses the hero.
                        local rush, x, y, crossed = record.rush, GetUnitX(u), GetUnitY(u), false
                        if not rush.hit and SegmentDistanceSquared(GetUnitX(run.hero), GetUnitY(run.hero), rush.x, rush.y, x, y)
                            <= SurvivorConfig.swarmRush.hitRadius^2 then
                            rush.hit, crossed = true, true
                            rushHits[#rushHits + 1] = u
                        end
                        rush.x, rush.y = x, y
                        if clock >= record.rushExpires or (x - rush.endX)^2 + (y - rush.endY)^2 < 60^2 then
                            -- A marcher hitting on this scan stays until its damage source is used below.
                            if crossed then record.releaseRush = true else SurvivorCombatEnemies.Release(u) end
                        else Move(u, record, rush.endX, rush.endY, 0, true) end
                    elseif record.profile then
                        local profile = record.profile
                        local dx, dy = GetUnitX(run.hero) - GetUnitX(u), GetUnitY(run.hero) - GetUnitY(u)
                        local distanceSq = dx * dx + dy * dy
                        if distanceSq > profile.range * profile.range or not SurvivorStage.LineClear(GetUnitX(u), GetUnitY(u), GetUnitX(run.hero), GetUnitY(run.hero)) then
                            -- Far chasers tolerate a staler target; close ones re-aim sooner.
                            Move(u, record, GetUnitX(run.hero), GetUnitY(run.hero), math.max(128, math.sqrt(distanceSq) * 0.25),
                                record.orderGroup == orderPhase)
                        else
                            if GetUnitCurrentOrder(u) ~= 0 then IssueImmediateOrder(u, "stop") end
                            if clock >= record.nextShot then
                                record.nextShot = clock + profile.interval / record.attackSpeed
                                SetUnitFacing(u, Atan2(dy, dx) * bj_RADTODEG)
                                Hazards.FireEnemyMissile(u, profile)
                            end
                        end
                    else
                        -- Reissuing an attack during its windup can interrupt the hit.
                        if GetUnitCurrentOrder(u) ~= attackOrder then IssueTargetOrder(u, "attack", run.hero) end
                    end
                    if record.boss and clock >= record.nextBlast then
                        local enrage = SurvivorConfig.encounters[run.stage].enrage
                        local enraged = enrage and GetWidgetLife(u) <= BlzGetUnitMaxHP(u) * enrage.life
                        record.nextBlast = clock + (enraged and enrage.blastInterval or SurvivorConfig.bossBlastInterval) / record.attackSpeed
                        Hazards.BossPattern(record)
                    end
                    if record.boss and record.supportAt and clock >= record.supportAt then
                        record.supportAt = nil
                        for _, kind in ipairs(SurvivorConfig.encounters[run.stage].bossSupport.kinds) do SurvivorCombatEnemies.Spawn(false, kind) end
                    end
                elseif not record.alive and record.removeAt and elapsed >= record.removeAt then run.units[u] = nil; RemoveUnit(u) end
            end
        end
        -- Damage after the scan: a lethal hit may finish the run and replace the unit table.
        for _, u in ipairs(rushHits) do
            local record = run.units[u]
            if record and Enemy(u) then
                HurtHero(u, SurvivorConfig.enemyDamage * record.damageScale * SurvivorConfig.swarmRush.damage, "무리 돌진",
                    "붉은 통로가 표시되면 화살표와 수직으로 벗어나세요.")
                if not RunSession.IsRunning() or not Alive(run.hero) then return end
            end
            if run.units[u] and run.units[u].releaseRush then SurvivorCombatEnemies.Release(u) end
        end
    end
    SurvivorCombatEnemies.Move = Move
end
