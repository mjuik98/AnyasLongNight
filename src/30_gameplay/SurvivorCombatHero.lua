-- Hero survival: damage taken by the hero (risk, set guard, search ward), the shadow
-- escape that replaces one lethal hit per stage, and the recent damage log shown on
-- defeat. SurvivorCombat binds its primitives once and attaches each run table.
SurvivorCombatHero = {}
do
    local run = nil
    local Alive = SurvivorUtil.UnitLive
    local Height = SurvivorUtil.TerrainZ
    local CleanupCall = RunSession.Attempt
    local Enemy, UnitTimeStopped, CreateObject, ZoneLifetime, HeroYaw, MeleeGuard, Outside
    -- Per hero and stage; the playing hero speaks its own escape line.
    local escapeLines = {
        anya = {"위험했네… 여기서 벗어나자.", "불길이 코앞이었어. 빠지자.", "냉기가 스며들기 전에 물러나자.",
            "포위됐어. 길을 다시 열자.", "물길로 빠지자. 아직 끝나지 않았어."},
        putress = {"이미 썩은 몸이라도 여기서 끝날 순 없지.", "불길은 시약까지 태워 버려. 일단 물러나지.", "약병이 얼기 전에 자리를 옮기지.",
            "포위라… 계산이 틀렸군. 다시 길을 내지.", "물길로 빠진다. 아직 데려갈 자가 남았어."},
    }
    function SurvivorCombatHero.Bind(combat)
        Enemy, UnitTimeStopped = combat.Enemy, combat.UnitTimeStopped
        CreateObject, ZoneLifetime, HeroYaw, MeleeGuard = combat.CreateObject, combat.ZoneLifetime, combat.HeroYaw, combat.MeleeGuard
        Outside = combat.Outside -- Presentation and expedition state (SurvivorCombat's outside port).
    end
    -- The run table owned by SurvivorCombat (hero, units, bounds, escape/ward/damage log fields).
    function SurvivorCombatHero.Attach(state) run = state end

    -- Enemy hazards name the damage they deal; the damage event reads it for the log.
    function SurvivorCombatHero.HurtHero(source, amount, name, hint)
        local previous = run.damageContext
        run.damageContext = {name = name, hint = hint}
        local ok, message = pcall(UnitDamageTarget, source, run.hero, amount, false, false, ATTACK_TYPE_NORMAL, DAMAGE_TYPE_NORMAL, WEAPON_TYPE_WHOKNOWS)
        run.damageContext = previous
        if not ok then error(message) end
    end
    function SurvivorCombatHero.WardStatus()
        return RunSession.GetElapsed() < run.wardUntil and run.ward or 0, math.max(0, run.wardUntil - RunSession.GetElapsed())
    end
    function SurvivorCombatHero.GrantSearchRecovery()
        local config = SurvivorConfig.searchRecovery
        local maximum, before = BlzGetUnitMaxHP(run.hero), GetWidgetLife(run.hero)
        local heal = math.min(maximum * config.fraction, math.max(0, maximum - before))
        SetWidgetLife(run.hero, before + heal)
        run.ward = maximum * config.fraction - heal
        run.wardUntil = run.ward > 0 and RunSession.GetElapsed() + config.wardDuration or 0
        return string.format("생명력 %.0f 회복", heal)
            .. (run.ward > 0 and string.format(" / 초과분 보호막 %.0f (%d초)", run.ward, config.wardDuration) or "")
    end
    function SurvivorCombatHero.StageEscapeUses(index) return run.stageEscapeUses[index] or 0 end
    function SurvivorCombatHero.DamageHistory()
        local lines, now = {}, RunSession.GetElapsed()
        for _, entry in ipairs(run.recentDamage) do
            if now - entry.time <= 8 then
                lines[#lines + 1] = string.format("%.1f초 전 · %s · %s", now - entry.time, entry.name,
                    entry.escaped and "그림자 탈출" or string.format("피해 %.0f", entry.damage))
            end
        end
        local last = run.recentDamage[#run.recentDamage]
        return table.concat(lines, "\n"), last and last.hint or "위험 표식 바깥으로 이동하고 장비·성장 구성을 점검하세요."
    end
    function SurvivorCombatHero.EscapeStatus()
        return run.escapeReady, math.max(0, run.escapeUntil - RunSession.GetElapsed()), run.escapeUses
    end
    function SurvivorCombatHero.ClearEscape()
        local effect, release = run.escapeEffect, run.escapeOwnsInvulnerability
        run.escapeEffect, run.escapeOwnsInvulnerability = nil, false
        run.escapeUntil = 0
        local errors = {}
        if release and SurvivorUtil.UnitExists(run.hero) then
            CleanupCall(errors, "escape invulnerability", function() SetUnitInvulnerable(run.hero, false) end)
        end
        if effect then CleanupCall(errors, "escape effect", function() DestroyEffect(effect) end) end
        if #errors > 0 then error(table.concat(errors, "\n"), 0) end
    end
    local function EscapeLanding(source)
        local x, y = GetUnitX(run.hero), GetUnitY(run.hero)
        local hasSource = source ~= run.hero and SurvivorUtil.UnitExists(source)
        local angle = hasSource and Atan2(y - GetUnitY(source), x - GetUnitX(source))
            or HeroYaw()
        local enemies = {}
        for u in pairs(run.units) do
            if Enemy(u) then enemies[#enemies + 1] = {GetUnitX(u), GetUnitY(u)} end
        end
        local bounds = run.bounds
        local function Walkable(px, py)
            if px < bounds.minX + 32 or px > bounds.maxX - 32
                or py < bounds.minY + 32 or py > bounds.maxY - 32 then return false end
            -- Check the hero's footprint, not just an empty center pixel.
            for ox = -32, 32, 32 do
                for oy = -32, 32, 32 do
                    if IsTerrainPathable(px + ox, py + oy, PATHING_TYPE_WALKABILITY) then return false end
                end
            end
            return true
        end
        local bestX, bestY, bestScore = x, y, -math.huge
        for _, distance in ipairs(SurvivorConfig.escapeDistances) do
            for _, offset in ipairs({0, 1, -1, 2, -2, 3, -3, 4}) do
                local direction = angle + offset * math.pi / 4
                local tx, ty = x + math.cos(direction) * distance, y + math.sin(direction) * distance
                local clear = Walkable(tx, ty) and SurvivorStage.LineClear(x, y, tx, ty)
                -- Do not cross cliffs, trees or narrow gaps into an isolated pocket.
                local steps = math.ceil(distance / 32)
                for step = 1, steps - 1 do
                    if not clear then break end
                    clear = Walkable(x + (tx - x) * step / steps, y + (ty - y) * step / steps)
                end
                if clear then
                    local score = distance - math.abs(offset) * 20
                    for _, enemy in ipairs(enemies) do
                        local separation = math.sqrt((tx - enemy[1])^2 + (ty - enemy[2])^2)
                        score = score - math.max(0, 320 - separation) * 3 - math.max(0, 96 - separation) * 10
                    end
                    if score > bestScore then bestX, bestY, bestScore = tx, ty, score end
                end
            end
        end
        return bestX, bestY
    end
    local function EscapeBlink(source)
        local x, y = GetUnitX(run.hero), GetUnitY(run.hero)
        local tx, ty = EscapeLanding(source)
        CreateObject({identifier = "hsEscapeDeparture", x = x, y = y, z = Height(x, y), life = 0.7,
            isStationary = true, isAnonymous = true, selfInteractions = ZoneLifetime}, SurvivorConfig.escapeDepartureModel, 1.5)
        SetUnitX(run.hero, tx)
        SetUnitY(run.hero, ty)
        CreateObject({identifier = "hsEscapeArrival", x = tx, y = ty, z = Height(tx, ty), life = 0.9,
            isStationary = true, isAnonymous = true, selfInteractions = ZoneLifetime}, SurvivorConfig.escapeArrivalModel, 1.8)
        return (tx - x)^2 + (ty - y)^2 > 1
    end
    -- Replaces one lethal hit per stage: keeps the hero alive, blinks away and grants
    -- brief invulnerability. Called inside the damage event, before HP subtraction.
    local function Escape(source, now, entry)
        local hero = run.hero
        run.escapeReady, run.escapeUntil, run.escapeUses = false, now + SurvivorConfig.escapeDuration, run.escapeUses + 1
        BlzSetEventDamage(0)
        SetWidgetLife(hero, math.max(GetWidgetLife(hero), BlzGetUnitMaxHP(hero) * SurvivorConfig.escapeLifeFloor))
        run.escapeOwnsInvulnerability = not BlzIsUnitInvulnerable(hero)
        if run.escapeOwnsInvulnerability then SetUnitInvulnerable(hero, true) end
        local moved = EscapeBlink(source)
        run.escapeEffect = AddSpecialEffectTarget([[Abilities\Spells\Undead\AntiMagicShell\AntiMagicShell.mdl]], hero, "origin")
        BlzSetSpecialEffectScale(run.escapeEffect, 1.2)
        BlzSetSpecialEffectColor(run.escapeEffect, 185, 135, 255)
        run.stageEscapeUses[run.stage] = (run.stageEscapeUses[run.stage] or 0) + 1
        entry.escaped, entry.damage = true, 0
        -- The escape is already applied; its cue, notice and line are presentation only.
        SurvivorUtil.Present("escape cue", Outside.Cue, "escape")
        SurvivorUtil.Present("escape alert", Outside.Alert, 6,
            "|cffbbaaff그림자 탈출 · " .. (moved and "순간 이동" or "제자리 보호")
            .. string.format("|r\n생명력 최소 %d%% · %g초 무적\n다음 스테이지에서 재충전",
                math.floor(SurvivorConfig.escapeLifeFloor * 100 + 0.5), SurvivorConfig.escapeDuration), 50, "escape")
        local heroId, profile = SurvivorUtil.HeroOf(hero)
        local lines = escapeLines[heroId] or escapeLines.anya
        SurvivorUtil.Present("escape line", Outside.Say, profile.name, lines[run.stage] or lines[1])
    end
    -- The hero's damage event: post-mitigation, before HP subtraction; catches native melee too.
    function SurvivorCombatHero.OnDamaged(damage)
        -- The damage source and the session clock stay fixed for the whole event.
        local hero, source, now = run.hero, GetEventDamageSource(), RunSession.GetElapsed()
        if not RunSession.IsRunning() or now < run.escapeUntil then BlzSetEventDamage(0); return end
        if UnitTimeStopped(source) then BlzSetEventDamage(0); return end
        if Outside.RiskActive() and Enemy(source) then damage = damage * SurvivorConfig.riskChallenge.enemyDamage end
        if MeleeGuard(now) then damage = damage * 0.85 end
        if run.ward > 0 and now < run.wardUntil then
            local absorbed = math.min(run.ward, damage)
            run.ward, damage = run.ward - absorbed, damage - absorbed
        end
        local sourceName = source ~= hero and SurvivorUtil.UnitExists(source) and GetUnitName(source) or "환경"
        local context = run.damageContext
        local entry = {time = now, damage = math.min(damage, GetWidgetLife(hero)),
            name = sourceName .. " / " .. (context and context.name or "일반 공격"),
            hint = context and context.hint or "근접 적에게 포위되지 않도록 넓은 쪽으로 이동하세요."}
        if run.escapeReady and damage >= GetWidgetLife(hero) - 0.405 then Escape(source, now, entry)
        else BlzSetEventDamage(damage) end
        if damage > 0 then
            if #run.recentDamage == 5 then table.remove(run.recentDamage, 1) end
            run.recentDamage[#run.recentDamage + 1] = entry
            if not entry.escaped then
                SurvivorUtil.Present("hit vignette", Outside.HitFlash, damage / BlzGetUnitMaxHP(hero))
            end
        end
    end
end
