-- Enemy attacks the hero must dodge: ranged enemy shots, boss blasts and lava bursts,
-- boss/elite specials (dash, frost wave, chain lanes), the plague trait and the
-- swarm rush. Each warns first and pauses with every other hostile effect.
-- SurvivorCombat binds its object and damage primitives once and attaches each run.
SurvivorCombatHazards = {}
do
    local hero, units, objects, difficulty = nil, {}, {}, SurvivorConfig.difficulties.normal
    local Alive = SurvivorConfig.UnitLive
    local Height = SurvivorConfig.TerrainZ
    local Enemy, HostileStopped, SetUnitPause, UnitTime, ImpactPoint, FaceMissile, HurtHero
    local CreateObject, DestroyObject, TrackHostile, ZoneLifetime, WarningStrip, SegmentDistanceSquared, MoveEnemy
    local Stage, Boss, BossDefeated, Bounds, EnemyCount, ExtendWarning
    function SurvivorCombatHazards.Bind(combat)
        Enemy, HostileStopped = combat.Enemy, combat.HostileStopped
        SetUnitPause, UnitTime = combat.SetUnitPause, combat.UnitTime
        ImpactPoint, FaceMissile, HurtHero = combat.ImpactPoint, combat.FaceMissile, combat.HurtHero
        CreateObject, DestroyObject, TrackHostile = combat.CreateObject, combat.DestroyObject, combat.TrackHostile
        ZoneLifetime, WarningStrip, SegmentDistanceSquared = combat.ZoneLifetime, combat.WarningStrip, combat.SegmentDistanceSquared
        MoveEnemy = combat.MoveEnemy
        -- Values the combat owner changes during a run are read when needed.
        Stage, Boss, BossDefeated, Bounds = combat.Stage, combat.Boss, combat.BossDefeated, combat.Bounds
        EnemyCount, ExtendWarning = combat.EnemyCount, combat.ExtendWarning
    end
    -- A run's hero, unit records, owned objects and difficulty.
    function SurvivorCombatHazards.Attach(run)
        hero, units, objects, difficulty = run.hero, run.units, run.objects, run.difficulty
    end
    local function MoveEnemyMissile(missile)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or missile.cleaned then return dt end
        if not Alive(hero) or not Enemy(missile.source) then ALICE_Kill(missile); return dt end
        if HostileStopped(missile) then return dt end
        missile.life = missile.life - dt
        if missile.life <= 0 then ALICE_Kill(missile); return dt end
        local hx, hy, hz = ImpactPoint(hero)
        local dx, dy, dz = missile.vx * dt, missile.vy * dt, missile.vz * dt
        if not SurvivorStage.LineClear(missile.x, missile.y, missile.x + dx, missile.y + dy) then ALICE_Kill(missile); return dt end
        local length = dx * dx + dy * dy + dz * dz
        local t = length > 0 and math.max(0, math.min(1,
            ((hx - missile.x) * dx + (hy - missile.y) * dy + (hz - missile.z) * dz) / length)) or 0
        local rx, ry, rz = hx - missile.x - dx * t, hy - missile.y - dy * t, hz - missile.z - dz * t
        if rx * rx + ry * ry + rz * rz <= 45 * 45 then
            local source, damage = missile.source, missile.damage
            ALICE_Kill(missile)
            HurtHero(source, damage, "원거리 사격", "발사 방향의 옆으로 이동하거나 지형 뒤에서 사선을 끊으세요.")
            return dt
        end
        missile.x, missile.y, missile.z = missile.x + dx, missile.y + dy, missile.z + dz
        BlzSetSpecialEffectPosition(missile.visual, missile.x, missile.y, missile.z)
        return dt
    end
    local function FireEnemyMissile(source, profile)
        local x, y, z = ImpactPoint(source)
        local tx, ty, tz = ImpactPoint(hero)
        local dx, dy, dz = tx - x, ty - y, tz - z
        local distance = math.sqrt(dx * dx + dy * dy + dz * dz)
        if distance < 1 then return end
        local speed = profile.projectileSpeed / distance
        local missile = {identifier = "hsEnemyMissile", x = x, y = y, z = z,
            vx = dx * speed, vy = dy * speed, vz = dz * speed,
            source = source, damage = profile.damage * units[source].damageScale, life = 4, yaw = 0,
            isAnonymous = true, selfInteractions = MoveEnemyMissile}
        CreateObject(missile, SurvivorConfig.enemyProjectileModel, 0.95)
        BlzSetSpecialEffectColor(missile.visual, 255, 70, 180)
        FaceMissile(missile, dx, dy, dz)
        SetUnitAnimation(source, "attack")
    end
    local function ResolveBossBlast(blast)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or blast.cleaned then return dt end
        if (not blast.environment and not Enemy(blast.source)) or not Alive(hero) then ALICE_Kill(blast); return dt end
        if HostileStopped(blast) then return dt end
        blast.life = blast.life - dt
        if blast.life > 0 then
            local c = SurvivorConfig
            local fraction = 1 - math.min(1, blast.life / c.bossWarningBrightTime)
            local alpha = math.floor(c.bossWarningAlpha + (c.bossWarningFinalAlpha - c.bossWarningAlpha) * fraction)
            if blast.warningAlpha ~= alpha then
                BlzSetSpecialEffectAlpha(blast.markers[1], alpha)
                blast.warningAlpha = alpha
            end
            return dt
        end
        local source, x, y, z, radius, damage = blast.source, blast.x, blast.y, blast.z, blast.radius, blast.damage
        ALICE_Kill(blast)
        CreateObject({identifier = "hsBossImpact", x = x, y = y, z = z, life = 0.6,
            isAnonymous = true, selfInteractions = ZoneLifetime}, SurvivorConfig.bossImpactModel, radius / 240)
        local dx, dy = GetUnitX(hero) - x, GetUnitY(hero) - y
        if dx * dx + dy * dy <= radius * radius then
            HurtHero(source, damage, blast.environment and "지하 분출" or "보스 폭발", "폭발이 확정되기 전에 원 바깥으로 이동하세요.")
        end
        return dt
    end
    local function WarnBossBlast(x, y, radius, delay, environment)
        local stage = Stage()
        ExtendWarning(RunSession.GetElapsed() + delay)
        local blast = {identifier = "hsBossWarning", x = x, y = y, z = Height(x, y),
            source = environment and hero or Boss(), environment = environment,
            radius = radius, damage = (environment and 35 or SurvivorConfig.bossBlastDamage) * SurvivorConfig.stageDamage[stage] * difficulty.damage,
            life = delay, markers = {}, isStationary = true, isAnonymous = true,
            selfInteractions = ResolveBossBlast, destroy = DestroyObject}
        objects[blast] = true
        -- One red ground ring sized to the blast radius marks the whole danger area.
        local marker = AddSpecialEffect(SurvivorConfig.warningRingModel, x, y)
        blast.markers[1] = marker
        BlzSetSpecialEffectZ(marker, blast.z + 5)
        BlzSetSpecialEffectScale(marker, blast.radius / SurvivorConfig.warningRingRadius)
        local color = SurvivorConfig.warningColors.danger
        BlzSetSpecialEffectColor(marker, color[1], color[2], color[3])
        blast.warningAlpha = SurvivorConfig.bossWarningAlpha
        BlzSetSpecialEffectAlpha(marker, blast.warningAlpha)
        TrackHostile(blast)
        ALICE_Create(blast)
    end
    function SurvivorCombatHazards.WarnLava()
        local lava = SurvivorConfig.encounters[Stage()].lava
        if lava and RunSession.IsRunning() and Alive(hero) then
            for _, point in ipairs(SurvivorStage.LavaPoints()) do WarnBossBlast(point.x, point.y, point.radius, lava.delay, true) end
        end
    end
    -- Length of the ray from (x, y) along unit (dx, dy) that stays inside the arena.
    local function ArenaReach(x, y, dx, dy, length)
        local bounds = Bounds()
        local reach = length
        if dx > 0 then reach = math.min(reach, (bounds.maxX - 32 - x) / dx)
        elseif dx < 0 then reach = math.min(reach, (bounds.minX + 32 - x) / dx) end
        if dy > 0 then reach = math.min(reach, (bounds.maxY - 32 - y) / dy)
        elseif dy < 0 then reach = math.min(reach, (bounds.minY + 32 - y) / dy) end
        return math.max(0, reach)
    end
    local function SpawnRush(rush)
        local bounds = Bounds()
        local c = SurvivorConfig.swarmRush
        for row = 0, c.rows - 1 do
            for column = 0, c.columns - 1 do
                local along, side = -row * c.spacing, (column - (c.columns - 1) / 2) * c.spacing
                local x = rush.ax + rush.ca * along - rush.sa * side
                local y = rush.ay + rush.sa * along + rush.ca * side
                if x > bounds.minX and x < bounds.maxX and y > bounds.minY and y < bounds.maxY
                    and not IsTerrainPathable(x, y, PATHING_TYPE_WALKABILITY) then
                    local success, unit = SurvivorCombat.Spawn(false, "melee")
                    if not success then return end
                    local record = units[unit]
                    SetUnitX(unit, x); SetUnitY(unit, y)
                    SetUnitFacing(unit, rush.angle * bj_RADTODEG)
                    SetUnitMoveSpeed(unit, c.speed)
                    record.baseSpeed = GetUnitMoveSpeed(unit)
                    -- Every rank travels the lane's full length, so the block keeps its shape.
                    record.rush = {x = x, y = y, endX = x + rush.ca * rush.length, endY = y + rush.sa * rush.length}
                    record.rushExpires = UnitTime(record) + c.life
                    MoveEnemy(unit, record, record.rush.endX, record.rush.endY, 0, true)
                end
            end
        end
    end
    local function StepRushWarning(warning)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or warning.cleaned then return dt end
        if not Alive(hero) then ALICE_Kill(warning); return dt end
        if HostileStopped(warning) then return dt end
        warning.life = warning.life - dt
        if warning.life > 0 then
            local c = SurvivorConfig.swarmRush
            if not warning.bright and warning.life <= c.brightTime then
                warning.bright = true
                BlzSetSpecialEffectAlpha(warning.markers[1], c.finalLaneAlpha)
            end
            return dt
        end
        ALICE_Kill(warning)
        SpawnRush(warning)
        return dt
    end
    -- The lane passes through the hero's position at warning time; the block starts off screen behind it.
    function SurvivorCombatHazards.WarnRush()
        local stage = Stage()
        local c = SurvivorConfig.swarmRush
        if not RunSession.IsRunning() or not Alive(hero) or Boss() ~= nil or BossDefeated() then return false end
        local cap = math.min(SurvivorConfig.maxEnemies, SurvivorConfig.stageEnemyCaps[stage])
        if EnemyCount() + math.ceil(c.rows * c.columns / 2) >= cap then return false end
        local hx, hy, best = GetUnitX(hero), GetUnitY(hero), nil
        for _ = 1, 12 do
            local angle = GetRandomReal(0, 2 * math.pi)
            local ca, sa = math.cos(angle), math.sin(angle)
            local back = ArenaReach(hx, hy, -ca, -sa, c.distance)
            if back >= c.minDistance and not IsTerrainPathable(hx - ca * back, hy - sa * back, PATHING_TYPE_WALKABILITY)
                and (not best or back > best.back) then
                best = {angle = angle, back = back}
                if back >= c.distance - 1 then break end
            end
        end
        if not best then return false end
        local angle = best.angle
        local ca, sa = math.cos(angle), math.sin(angle)
        local forward = ArenaReach(hx, hy, ca, sa, c.distance)
        local ax, ay, bx, by = hx - ca * best.back, hy - sa * best.back, hx + ca * forward, hy + sa * forward
        local warning = {identifier = "hsEnemyRushWarning", x = hx, y = hy, z = Height(hx, hy),
            angle = angle, ca = ca, sa = sa, ax = ax, ay = ay, length = best.back + forward,
            life = c.warning, markers = {}, isStationary = true, isAnonymous = true,
            selfInteractions = StepRushWarning, destroy = DestroyObject}
        objects[warning] = true
        local danger, width = SurvivorConfig.warningColors.danger, (c.columns - 1) * c.spacing + 2 * c.hitRadius
        WarningStrip(warning, ax, ay, bx, by, width, danger, c.laneAlpha)
        for _, side in ipairs({-1, 1}) do
            local offset = (width / 2 - 2.5) * side
            local dx, dy = -sa * offset, ca * offset
            WarningStrip(warning, ax + dx, ay + dy, bx + dx, by + dy, 5, danger, c.edgeAlpha, 6)
        end
        -- Arrows along the lane show where the block comes from and where it heads.
        for distance = c.arrowSpacing / 2, warning.length, c.arrowSpacing do
            local px, py = ax + ca * distance, ay + sa * distance
            local arrow = AddSpecialEffect(SurvivorConfig.dashArrowModel, px, py)
            warning.markers[#warning.markers + 1] = arrow
            BlzSetSpecialEffectScale(arrow, SurvivorConfig.bossDashArrowScale)
            BlzSetSpecialEffectYaw(arrow, angle)
            BlzSetSpecialEffectZ(arrow, Height(px, py) + 5)
        end
        ExtendWarning(RunSession.GetElapsed() + c.warning)
        SurvivorUI.Alert(c.warning + 1, "|cffff7060무리 돌진|r · 붉은 통로 바깥으로 벗어나세요", 55, "rush")
        SurvivorUI.Cue("elite")
        TrackHostile(warning)
        ALICE_Create(warning)
        return true
    end
    local function ReleaseSpecial(self)
        local record = units[self.source]
        if record and record.special == self then
            record.special = nil
            SetUnitPause(self.source, record, "special", false, not Alive(self.source))
        end
    end
    local function SpecialMarker(self, x, y, green)
        -- Red spell markers outline danger; green ones mark the safe gaps.
        local effect = AddSpecialEffect(green and SurvivorConfig.specialSafeMarkerModel or SurvivorConfig.specialMarkerModel, x, y)
        self.markers[#self.markers + 1] = effect
        BlzSetSpecialEffectScale(effect, green and 0.55 or 0.38)
        BlzSetSpecialEffectZ(effect, Height(x, y) + 5)
        return effect
    end
    local function ClearMarkers(self)
        for _, effect in ipairs(self.markers) do DestroyEffect(effect) end
        self.markers = {}
    end
    local function DamageSpecial(self, factor)
        local name = self.kind == "dash" and (factor < 1 and "돌진 잔불" or "돌진") or "냉기 파동"
        HurtHero(self.source, self.damage * factor, name, self.kind == "dash" and "돌진 통로의 옆으로 피하고 잔불이 사라질 때까지 접근하지 마세요." or "초록색 표식 사이의 안전한 틈으로 이동하세요.")
    end
    local function StepSpecial(self)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or self.cleaned then return dt end
        if not Alive(hero) or not Enemy(self.source) then ALICE_Kill(self); return dt end
        if HostileStopped(self) then return dt end
        local sourceRecord = units[self.source]
        if sourceRecord.freezeUntil and sourceRecord.freezeUntil > RunSession.GetElapsed() then return dt end
        self.elapsed = self.elapsed + dt
        if self.elapsed < self.delay then return dt end
        local hx, hy = GetUnitX(hero), GetUnitY(hero)
        if self.kind == "dash" then
            if not self.trail then
                local fraction = math.min(1, (self.elapsed - self.delay) * 900 / self.distance)
                local nx, ny = self.ax + (self.bx - self.ax) * fraction, self.ay + (self.by - self.ay) * fraction
                if IsTerrainPathable(nx, ny, PATHING_TYPE_WALKABILITY) then
                    self.bx, self.by = GetUnitX(self.source), GetUnitY(self.source)
                    fraction = 1
                end
                local ox, oy = GetUnitX(self.source), GetUnitY(self.source)
                if fraction < 1 or not IsTerrainPathable(nx, ny, PATHING_TYPE_WALKABILITY) then
                    SetUnitX(self.source, nx); SetUnitY(self.source, ny)
                end
                if not self.dashHit and SegmentDistanceSquared(hx, hy, ox, oy, GetUnitX(self.source), GetUnitY(self.source)) <= self.width^2 then
                    self.dashHit = true; DamageSpecial(self, 1)
                    if self.cleaned or not Alive(hero) then return dt end
                end
                if fraction >= 1 then
                    if self.elite or self.noTrail then ALICE_Kill(self); return dt end
                    self.trail, self.expires = true, self.elapsed + 2
                    ReleaseSpecial(self)
                    ClearMarkers(self)
                    for i = 0, 7 do
                        local x, y = self.ax + (self.bx - self.ax) * i / 7, self.ay + (self.by - self.ay) * i / 7
                        local effect = AddSpecialEffect([[Abilities\Spells\NightElf\Immolation\ImmolationTarget.mdl]], x, y)
                        self.markers[#self.markers + 1] = effect
                        BlzSetSpecialEffectScale(effect, 1.3)
                    end
                end
            else
                if self.elapsed >= self.expires then ALICE_Kill(self); return dt end
                if not self.trailHit and SegmentDistanceSquared(hx, hy, self.ax, self.ay, self.bx, self.by) <= self.width^2 then
                    self.trailHit = true; DamageSpecial(self, 0.5)
                end
            end
        elseif self.kind == "wave" then
            local radius = 120 + (self.elapsed - self.delay) * 340
            if radius > self.waveMaxRadius then ALICE_Kill(self); return dt end
            for i, angle in ipairs(self.angles) do
                local x, y = self.ax + math.cos(angle) * radius, self.ay + math.sin(angle) * radius
                BlzSetSpecialEffectPosition(self.markers[i], x, y, Height(x, y) + 55)
            end
            local dx, dy = hx - self.ax, hy - self.ay
            local angle = Atan2(dy, dx) - self.gap
            local outsideGap = math.abs(Atan2(math.sin(angle), math.cos(angle))) > self.gapWidth / 2
            if not self.hit and outsideGap and math.abs(math.sqrt(dx * dx + dy * dy) - radius) <= self.width then
                self.hit = true; DamageSpecial(self, 1)
            end
        else -- Three warned chain lanes; the spaces between the lanes stay safe.
            local hit = false
            for _, lane in ipairs(self.lanes) do
                local dx, dy = lane.bx - lane.ax, lane.by - lane.ay
                local projection = (hx - lane.ax) * dx + (hy - lane.ay) * dy
                if projection >= 0 and projection <= dx * dx + dy * dy
                    and SegmentDistanceSquared(hx, hy, lane.ax, lane.ay, lane.bx, lane.by) <= self.width^2 then hit = true end
            end
            local source, damage = self.source, self.damage
            for _, lane in ipairs(self.lanes) do
                for i = 0, 4 do
                    local x, y = lane.ax + (lane.bx - lane.ax) * i / 4, lane.ay + (lane.by - lane.ay) * i / 4
                    CreateObject({identifier = "hsBossChain", x = x, y = y, z = Height(x, y), life = 0.55,
                        isAnonymous = true, selfInteractions = ZoneLifetime}, [[Doodads\Dungeon\Props\ChainPost\ChainPost.mdl]], 0.5)
                end
            end
            ALICE_Kill(self)
            if hit and Alive(hero) then HurtHero(source, damage, "사슬 봉쇄", "예고된 줄 사이로 이동하세요. 수색 완료 시 첫 봉쇄의 중앙 줄이 사라집니다.") end
        end
        return dt
    end
    local function StartSpecial(kind, record, source)
        local stage, bounds = Stage(), Bounds()
        source = source or Boss()
        local x, y, hx, hy = GetUnitX(source), GetUnitY(source), GetUnitX(hero), GetUnitY(hero)
        local angle = Atan2(hy - y, hx - x)
        local self = {identifier = "hsBossSpecial", kind = kind, source = source, elite = record.elite, ax = x, ay = y, x = x, y = y, z = Height(x, y),
            damage = SurvivorConfig.bossBlastDamage * SurvivorConfig.stageDamage[stage] * difficulty.damage,
            elapsed = 0, delay = SurvivorConfig.bossBlastDelay, width = kind == "dash" and 100 or 65,
            markers = {}, isAnonymous = true, selfInteractions = StepSpecial,
            destroy = function(object) ReleaseSpecial(object); DestroyObject(object) end}
        if record.elite then self.damage, self.delay, self.width = 26 * record.damageScale, 1.2, 75 end
        -- The stage's expedition finding softens one boss special (see encounters[].advantage).
        local advantage = SurvivorConfig.encounters[stage].advantage
        local informed = not record.elite and advantage ~= nil and advantage.special == kind
            and SurvivorExpedition.UseAdvantage(stage)
        self.noTrail = informed and advantage.noTrail == true
        ExtendWarning(RunSession.GetElapsed() + self.delay)
        record.special = self
        objects[self] = true
        IssueImmediateOrder(source, "stop")
        SetUnitPause(source, record, "special", true)
        SetUnitFacing(source, angle * bj_RADTODEG)
        if kind == "dash" then
            self.distance = math.max(200, math.min(750, math.sqrt((hx - x)^2 + (hy - y)^2)))
            self.bx = math.max(bounds.minX + 32, math.min(bounds.maxX - 32, x + math.cos(angle) * self.distance))
            self.by = math.max(bounds.minY + 32, math.min(bounds.maxY - 32, y + math.sin(angle) * self.distance))
            self.distance = math.max(1, math.sqrt((self.bx - x)^2 + (self.by - y)^2))
            -- Use the final, arena-clamped route so warnings never point beyond the real dash.
            local c, dx, dy = SurvivorConfig, self.bx - x, self.by - y
            local direction = Atan2(dy, dx)
            local count = record.elite and math.max(1, math.floor((self.distance - c.dashArrowOffset) / c.dashArrowSpacing) + 1)
                or math.max(1, math.ceil(self.distance / c.dashArrowSpacing))
            for i = 1, count do
                local distance = record.elite and math.min(self.distance, c.dashArrowOffset + (i - 1) * c.dashArrowSpacing)
                    or self.distance * i / count
                local px, py = x + dx * distance / self.distance, y + dy * distance / self.distance
                local arrow = AddSpecialEffect(c.dashArrowModel, px, py)
                self.markers[#self.markers + 1] = arrow
                BlzSetSpecialEffectScale(arrow, record.elite and c.dashArrowScale or c.bossDashArrowScale)
                BlzSetSpecialEffectYaw(arrow, direction)
                BlzSetSpecialEffectZ(arrow, Height(px, py) + 5)
            end
        elseif kind == "wave" then
            self.gap, self.gapWidth, self.angles = angle + math.pi / 2, math.pi / 2, {}
            self.waveMaxRadius = 900
            if informed and advantage.gapWidth then self.gapWidth = advantage.gapWidth end
            for i = 0, 17 do
                local a = self.gap + self.gapWidth / 2 + (2 * math.pi - self.gapWidth) * i / 17
                self.angles[#self.angles + 1] = a
                SpecialMarker(self, x + math.cos(a) * 120, y + math.sin(a) * 120, i == 0 or i == 17)
            end
            -- The two rays mark the full safe wedge, including the outer edge of the final wave.
            for _, side in ipairs({-1, 1}) do
                local a, reach = self.gap + side * self.gapWidth / 2, self.waveMaxRadius + self.width
                WarningStrip(self, x, y, x + math.cos(a) * reach, y + math.sin(a) * reach,
                    8, SurvivorConfig.warningColors.safe, 185, 8)
            end
        else
            self.lanes = {}
            for offset = -240, 240, 240 do
                if not (informed and advantage.openCenterLane and offset == 0) then
                    local cx, cy = hx - math.sin(angle) * offset, hy + math.cos(angle) * offset
                    local lane = {ax = cx - math.cos(angle) * 450, ay = cy - math.sin(angle) * 450,
                        bx = cx + math.cos(angle) * 450, by = cy + math.sin(angle) * 450}
                    self.lanes[#self.lanes + 1] = lane
                    local danger = SurvivorConfig.warningColors.danger
                    WarningStrip(self, lane.ax, lane.ay, lane.bx, lane.by, self.width * 2, danger, 80)
                    for _, side in ipairs({-1, 1}) do
                        local offset = (self.width - 2.5) * side
                        local dx, dy = -math.sin(angle) * offset, math.cos(angle) * offset
                        WarningStrip(self, lane.ax + dx, lane.ay + dy, lane.bx + dx, lane.by + dy, 5, danger, 220, 6)
                    end
                end
            end
        end
        ExtendWarning(RunSession.GetElapsed() + self.delay + 3)
        TrackHostile(self)
        ALICE_Create(self)
    end
    local function BossPattern(record)
        local stage = Stage()
        local encounter = SurvivorConfig.encounters[stage]
        local pattern, advantage, support = encounter.pattern, encounter.advantage, encounter.bossSupport
        record.patternCount = (record.patternCount or 0) + 1
        if pattern == "cycle" then pattern = ({"dash", "wave", "chains", "cross"})[(record.patternCount - 1) % 4 + 1] end
        local x, y, delay = GetUnitX(hero), GetUnitY(hero), SurvivorConfig.bossBlastDelay
        if support and (record.patternCount - 1) % support.every == 0 then
            local cancelled = advantage and advantage.cancelsSupport and SurvivorExpedition.UseAdvantage(stage)
            if not cancelled then record.supportAt = UnitTime(record) + support.delay end
        end
        if advantage and advantage.blastDelay and advantage.pattern == pattern and SurvivorExpedition.UseAdvantage(stage) then
            delay = delay + advantage.blastDelay
        end
        if pattern == "dash" or pattern == "wave" or pattern == "chains" then
            StartSpecial(pattern, record)
        elseif pattern == "target" then
            WarnBossBlast(x, y, SurvivorConfig.bossBlastRadius, delay)
        else
            WarnBossBlast(x, y, 150, delay)
            for i = 1, 4 do
                local angle = i * math.pi / 2
                WarnBossBlast(x + math.cos(angle) * 340, y + math.sin(angle) * 340, 150, delay + 0.4)
            end
        end
    end
    local function PlagueStep(self)
        local dt = ALICE_Config.MIN_INTERVAL
        if not RunSession.IsRunning() or self.cleaned then return dt end
        if not Enemy(self.source) or not Alive(hero) then ALICE_Kill(self); return dt end
        if HostileStopped(self) then return dt end
        self.elapsed = self.elapsed + dt
        if self.elapsed < 1.2 then return dt end
        if self.elapsed >= 6.2 then ALICE_Kill(self); return dt end
        if not self.visual then
            self.visual = AddSpecialEffect([[Abilities\Spells\Undead\PlagueCloud\PlagueCloudtarget.mdl]], self.x, self.y)
            BlzSetSpecialEffectScale(self.visual, 1.5)
        end
        if self.elapsed >= self.nextHit then
            self.nextHit = self.elapsed + 1
            if (GetUnitX(hero) - self.x)^2 + (GetUnitY(hero) - self.y)^2 <= 160^2 then
                HurtHero(self.source, self.damage, "역병 장판", "보라색 원 밖으로 이동하거나 역병술사를 먼저 처치하세요.")
            end
        end
        return dt
    end
    local function WarnPlague(source, record)
        local x, y = GetUnitX(hero), GetUnitY(hero)
        local self = {identifier = "hsEnemyPlague", source = source, x = x, y = y, z = Height(x, y),
            elapsed = 0, nextHit = 1.2, damage = 12 * record.damageScale, markers = {},
            isStationary = true, isAnonymous = true, selfInteractions = PlagueStep, destroy = DestroyObject}
        objects[self] = true
        for i = 1, 12 do
            local angle = i * 2 * math.pi / 12
            local marker = AddSpecialEffect(SurvivorConfig.warningModel, x + math.cos(angle) * 160, y + math.sin(angle) * 160)
            BlzSetSpecialEffectColor(marker, 230, 70, 220)
            BlzSetSpecialEffectScale(marker, 0.4)
            self.markers[#self.markers + 1] = marker
        end
        ExtendWarning(RunSession.GetElapsed() + 1.2)
        TrackHostile(self)
        ALICE_Create(self)
    end
    SurvivorCombatHazards.FireEnemyMissile = FireEnemyMissile
    SurvivorCombatHazards.StartSpecial = StartSpecial
    SurvivorCombatHazards.BossPattern = BossPattern
    SurvivorCombatHazards.WarnPlague = WarnPlague
end
