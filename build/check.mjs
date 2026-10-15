// Behavioral regression checks with Lua 5.3 and explicit Warcraft native mocks.
// This does not emulate Warcraft rendering, its spatial-index cost, or ALICE timing.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fengari from 'fengari';
import {collectSources, replaceBundle, verifyPreserved, refreshBase, terrainInfo, mapInfo,
    parseUnits, serializeUnits, installPortraitUnits, portraitUnits, validatePortraitObjects, publishTransaction, editorBundle,
    parseObjectData, serializeObjectData, installStatDetails, prepareStatDetails, installInterfaceTooltip, installHeroRegeneration,
    prepareHeroRegeneration, validateStrengthRegeneration, loadTalentCatalog, talentLua, installNativeTalents,
    prepareNativeTalents, loadItemTooltipCatalog, loadWeaponTooltipCatalog, cleanWeaponTooltipEntries,
    cleanItemTooltipText, cleanItemTooltipEntries, prepareItemTooltipCleanup,
    removeGoldObjectData, removeGoldStrings, removeGoldMisc,
    prepareGoldRemoval, validateGoldRemoval, installExperienceCurve, prepareUIResources, root, baseMapPath} from './build.mjs';
import {openMap} from './mpq.mjs';
const {lua, lauxlib, lualib, to_luastring, to_jsstring} = fengari;
const talentCatalog = loadTalentCatalog();
function suite(name, before, files, after) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    try {
        for (const [label, source] of [['talents',talentLua(talentCatalog)],['mocks', before], ...files.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]), ['assertions', after]]) {
            let status = lauxlib.luaL_loadbuffer(L, to_luastring(source), null, to_luastring(label));
            if (status === lua.LUA_OK) status = lua.lua_pcall(L, 0, 0, 0);
            if (status !== lua.LUA_OK) throw new Error(name + ': ' + to_jsstring(lua.lua_tostring(L, -1)));
        }
        console.log('PASS', name);
    } finally { lua.lua_close(L); }
}

const mocks = String.raw`
world, actors, timers, hits, triggers = {}, {}, {}, {}, {}
now, state, serial, removed = 0, "RUNNING", 0, 0
ALICE_Config = {MIN_INTERVAL = 0.02}
ALICE_Initialized = true
bj_DEGTORAD, bj_RADTODEG = math.pi / 180, 180 / math.pi
UNIT_TYPE_FLYING, EVENT_PLAYER_UNIT_DEATH, EVENT_PLAYER_UNIT_DAMAGED = "flying", "death", "damage"
UNIT_STATE_MANA, UNIT_STATE_MAX_MANA = "mana", "maxMana"
UNIT_RF_HIT_POINTS_REGENERATION_RATE = 'uhpr'
function FourCC(x) return x end
function Player(x) return x end
function CreateUnit(owner, id, x, y, facing)
    serial = serial + 1
    local u = {owner=owner,id=id,x=x,y=y,facing=facing,life=100000,maxLife=100000,handle=serial,abilities={},inventory={},speed=300}
    world[#world+1] = u; return u
end
function GetUnitTypeId(u) return u and not u.removed and u.id or 0 end
function UnitAlive(u) return not u.removed and u.life > 0 end
function GetUnitX(u) return u.x end
function GetUnitY(u) return u.y end
function SetUnitX(u,x) u.x=x end
function SetUnitY(u,y) u.y=y end
function GetUnitFacing(u) return u.facing end
function GetUnitFlyHeight(u) return u.flyHeight or 0 end
function IsUnitType(u,t) return t == "flying" and u.flying == true end
function GetWidgetLife(u) return u.life end
function SetWidgetLife(u,v) u.life=v end
function BlzGetUnitMaxHP(u) return u.maxLife end
function BlzSetUnitMaxHP(u,v) u.maxLife=v end
function BlzSetUnitRealField(u,field,value)
    assert(not u.removed);u.realFields=u.realFields or {};u.realFields[field]=value;return true
end
function BlzGetUnitRealField(u,field)return u.realFields and u.realFields[field] or 0 end
function GetHandleId(u) return u.handle end
function GetOwningPlayer(u) return u.owner end
function GetUnitName(u) return u.id end
function SetUnitMoveSpeed(u,v) u.speed=v end
function GetUnitMoveSpeed(u) return u.speed end
function PauseUnit(u,v) u.paused=v end
function IsUnitPaused(u) return u.paused == true end
function GetUnitState(u,k) return u[k] or 0 end
function SetUnitState(u,k,v) u[k]=v end
function Location(x,y) return {x=x,y=y} end
function MoveLocation(l,x,y) l.x,l.y=x,y end
function GetLocationZ(l) return terrain and terrain(l.x,l.y) or 0 end
function RemoveLocation(l) l.removed=true end
function Atan2(y,x) return math.atan(y,x) end
function CreateGroup() return {} end
function GroupClear(g) for i=#g,1,-1 do g[i]=nil end end
function DestroyGroup(g) GroupClear(g); g.destroyed=true end
function GroupEnumUnitsInRange(g,x,y,r)
    assert(not g.destroyed); GroupClear(g)
    for _,u in ipairs(world) do if not u.removed and (u.x-x)^2+(u.y-y)^2 <= r*r then g[#g+1]=u end end
end
function BlzGroupGetSize(g) return #g end
function BlzGroupUnitAt(g,i) return g[i+1] end
function CreateTrigger() local t={}; triggers[#triggers+1]=t; return t end
function TriggerRegisterAnyUnitEventBJ(t,e) t.event=e end
function TriggerAddAction(t,f) t.action=f end
function DestroyTrigger(t) t.destroyed=true end
function RemoveUnit(u) assert(not u.removed); u.removed=true; removed=removed+1 end
function CreateTimer() local t={}; timers[#timers+1]=t; return t end
function TimerStart(t,dt,repeated,f) t.dt,t.repeated,t.callback,t.running=dt,repeated,f,true end
function PauseTimer(t) t.running=false end
function DestroyTimer(t) t.running=false; t.destroyed=true end
function TickTimers()
    local list={}; for _,t in ipairs(timers) do if t.running then list[#list+1]=t end end
    for _,t in ipairs(list) do if t.running then t.callback() end end
end
function AddSpecialEffect(model,x,y) return {model=model,x=x,y=y} end
function AddSpecialEffectTarget(model,u) return AddSpecialEffect(model,u.x,u.y) end
function DestroyEffect(e) assert(not e.destroyed); e.destroyed=true end
function DestroyLightning(e) assert(not e.destroyed); e.destroyed=true end
function ALICE_Create(o) actors[#actors+1]=o end
function ALICE_Kill(o) if o.destroy then o:destroy() end end
function ALICE_RemoveIdentifier() end
function ALICE_GetClosestObject(x,y,identifier,range,condition)
    local best, distance=nil,range*range
    for _,u in ipairs(world) do
        local d=(u.x-x)^2+(u.y-y)^2
        if not u.removed and (not condition or condition(u)) and d<distance then best,distance=u,d end
    end
    return best
end
function UnitDamageTarget(source,u,amount)
    hits[#hits+1]={unit=u,damage=amount}; u.life=math.max(0,u.life-amount)
    if onDamage then onDamage(u) end
end
for _,name in ipairs({"BlzSetSpecialEffectScale","BlzSetSpecialEffectZ","BlzSetSpecialEffectAlpha",
    "BlzSetSpecialEffectColor","BlzSetSpecialEffectPosition","BlzSetSpecialEffectOrientation","BlzSetSpecialEffectYaw",
    "BlzSetSpecialEffectTimeScale","SetUnitTimeScale","IssueImmediateOrder","BlzUnitDisableAbility",
    "UnitMakeAbilityPermanent","BlzSetAbilityPosX","BlzSetAbilityPosY","BlzSetItemName","BlzSetItemTooltip",
    "BlzSetItemExtendedTooltip","BlzSetItemDescription","SetItemDroppable","SetItemPawnable","SetItemDropOnDeath"}) do _G[name]=function() end end
function GetUnitAbilityLevel(u,id) return u.abilities[id] or 0 end
function UnitAddAbility(u,id) u.abilities[id]=1; return true end
function UnitRemoveAbility(u,id) u.abilities[id]=nil end
function SetUnitAbilityLevel(u,id,level) u.abilities[id]=level end
abilityWrites,abilityTooltips,abilityExtendedTooltips=0,{},{}
function BlzGetAbilityTooltip(id)return abilityTooltips[id] or ('native '..id)end
function BlzGetAbilityExtendedTooltip(id)return abilityExtendedTooltips[id] or ('native details '..id)end
function BlzSetAbilityTooltip(id,text)abilityTooltips[id]=text end
function BlzSetAbilityExtendedTooltip(id,text)abilityWrites=abilityWrites+1;abilityExtendedTooltips[id]=text end
function UnitInventorySize() return 6 end
function UnitItemInSlot(u,i) return u.inventory[i+1] end
function GetItemTypeId(i) return i and not i.removed and i.id or 0 end
function CreateItem(id,x,y) return {id=id,x=x,y=y} end
function RemoveItem(i) i.removed=true end
function SetItemCharges(i,v) i.charges=v end
function UnitAddItem(u,item)
    if item.id=='ttal'then u.talentPoints=(u.talentPoints or 0)+1;RemoveItem(item);return true end
    for i=1,6 do if not u.inventory[i] or u.inventory[i].removed then u.inventory[i]=item; return true end end
    return false
end
RunSession = {GetElapsed=function() return now end, IsRunning=function() return state=="RUNNING" end,
    GetState=function() return state end, Fail=function(message) error(message) end}
SurvivorStage = {LineClear=function() return true end}
SurvivorExpedition = {RiskActive=function() return false end}
SurvivorUI = {Notify=function(text) lastMessage=text end, Alert=function(seconds,text) lastMessage=text end,
    Say=function()end, Cue=function()end}
-- Locate closed-over state only in tests; production exposes no mutation API.
function Up(fn,key,seen)
    seen=seen or {}; if seen[fn] then return end; seen[fn]=true
    local children={}
    for i=1,100 do
        local name,value=debug.getupvalue(fn,i); if not name then break end
        if name==key then return value,fn,i end
        if type(value)=="function" and name~="_ENV" then children[#children+1]=value end
    end
    for _,child in ipairs(children) do local v,f,i=Up(child,key,seen); if f then return v,f,i end end
end
function Local(fn,key) local v,f=Up(fn,key); assert(f,"Missing upvalue "..key); return v end
function SetLocal(fn,key,v) local _,f,i=Up(fn,key); assert(f,"Missing upvalue "..key); debug.setupvalue(f,i,v) end
function NewCombat(weapon)
    world,actors,hits={}, {}, {}; state="RUNNING"; now=0
    local hero=CreateUnit(0,"hero",0,0,0)
    local build=SurvivorAugments.NewBuild(weapon)
    SurvivorCombat.Init(hero,build.stats,{minX=-5000,maxX=5000,minY=-5000,maxY=5000},nil,nil,"normal")
    SurvivorCombat.TrackWeapons({weapon})
    return hero,build,Local(SurvivorCombat.Init,"units")
end
function EnemyAt(units,x,y,fly)
    local u=CreateUnit(12,"enemy",x,y,0); u.flying=fly; u.flyHeight=fly and 300 or 0
    units[u]={enemy=true,alive=true,baseSpeed=220}
    SetLocal(SurvivorCombat.Counts,"enemyCount",select(1,SurvivorCombat.Counts())+1)
    return u
end
`;
const config = 'src/00_bootstrap/SurvivorConfig.lua';
const metrics = 'src/20_system/SurvivorMetrics.lua';
const augments = 'src/20_system/SurvivorAugments.lua';
const combat = 'src/30_gameplay/SurvivorCombat.lua';

suite('each stage spawns its boss at the configured minute and times out one minute later', mocks + String.raw`
OnInit={final=function()end}
function GetHeroLevel()return 1 end
function GetHeroSkillPoints()return 0 end
RunSession.Finish=function(reason)finishedReason=reason;state='FINISHED'end
RunSession.BeginStageClear=function()state='STAGE_CLEAR';return true end
SurvivorExpedition.Step=function()end
SurvivorEquipment={Step=function()end}
SurvivorNativeLoadout={Refresh=function()end}
bossSpawns,regularSpawns=0,0
SurvivorCombat={BossDefeated=function()return false end,Counts=function()return 0,0,0 end,
    SpawnBoss=function()bossSpawns=bossSpawns+1;return true end,
    Spawn=function()regularSpawns=regularSpawns+1;return true end,
    UpdateWeapons=function()end,UpdateEnemies=function()end,WarnLava=function()end}
`, [config,'src/00_bootstrap/HeroSurvivor.lua'], String.raw`
local step=Local(HeroSurvivor.BeginRun,'Step')
SetLocal(step,'hero',CreateUnit(0,'hero',0,0,0))
SetLocal(step,'stats',{extraWeapons={}})
SetLocal(step,'selectedDifficulty','normal')
SetLocal(step,'RefreshDamageBoard',function()end)
for index,expected in ipairs({{120,180},{180,240},{240,300},{240,300},{240,300}})do
    local timing=SurvivorConfig.StageTiming(index)
    assert(timing.bossStart==expected[1] and timing.duration==expected[2])
    SetLocal(step,'stage',index);SetLocal(step,'stageStarted',1000)
    SetLocal(step,'bossStarted',false);SetLocal(step,'nextElite',45)
    state,finishedReason,bossSpawns='RUNNING',nil,0
    now=1000+expected[1]-.02;step(.02,now)
    assert(bossSpawns==0 and SurvivorConfig.SpawnRate('normal',index,expected[1]-.02)>0)
    now=1000+expected[1];step(.02,now)
    assert(bossSpawns==1 and SurvivorConfig.SpawnRate('normal',index,expected[1])==0)
    local spawns=regularSpawns
    now=1000+expected[2]-.02;step(.02,now)
    assert(not finishedReason and bossSpawns==1 and regularSpawns==spawns,
        'The boss minute permits combat while regular and elite spawning remain stopped')
    now=1000+expected[2];step(.02,now)
    assert(finishedReason=='timeout','Each deadline is relative to the current stage start')
end
local wave=Local(HeroSurvivor.BeginRun,'SpawnWave')
local oldStageRates,oldMinuteRates={1,1.35,1.75,2.2,2.7},{1,1.6,2.4,3.4}
for difficulty,weight in pairs({easy=.8,normal=1,hard=1.1})do
    SetLocal(wave,'selectedDifficulty',difficulty)
    for index,stageWeight in ipairs(oldStageRates)do
        SetLocal(wave,'stage',index);SetLocal(wave,'bossStarted',false)
        for minute,timeWeight in ipairs(oldMinuteRates)do
            local elapsed=(minute-1)*60
            if elapsed<SurvivorConfig.StageTiming(index).bossStart then
                SetLocal(wave,'spawnBudget',0);regularSpawns=0
                for tick=1,500 do wave(.02,elapsed+(tick-1)*.02)end
                local expected=10*weight*stageWeight*timeWeight*1.5
                assert(math.abs(regularSpawns-expected)<1.00001,
                    'Actual wave accumulation must deliver 1.5 times the old rate across every difficulty, stage and minute')
            end
        end
    end
end
`);

suite('growth offers preserve guarantees, evolution priority, exclusion fallbacks and exhausted recovery', mocks,
    [config,augments], String.raw`
GetRandomInt=function(a,b)return a end
local b=SurvivorAugments.NewBuild('firebolt');local o=SurvivorAugments.Roll(b)
assert(o[1]=='firebolt' and b.choiceKinds[1]=='upgrade' and b.choiceKinds[2]=='new' and #o==3)
assert(not SurvivorAugments.CanReroll(b,o,1) and not SurvivorAugments.CanExclude(b,o,1))
assert(SurvivorAugments.Reroll(b,o,2) and SurvivorAugments.Level(b,o[2])==0)
b.levels.firebolt=SurvivorConfig.growthMaxLevel;o=SurvivorAugments.Roll(b)
assert(o[1]=='evolution1' and o[2]=='evolution2' and b.evolutionOffer)
assert(SurvivorAugments.Exclude(b,o,1) and b.excluded.evolution1 and b.excludesRemaining==SurvivorConfig.excludesPerRun-1)
o=SurvivorAugments.Roll(b);assert(o[1]=='evolution2' and b.evolutionOffer)
local originalWeapons,originalTrinkets=SurvivorConfig.weaponSlots,SurvivorConfig.trinketSlots
local function Restricted(weapons)
    SurvivorConfig.weaponSlots,SurvivorConfig.trinketSlots=#weapons,1
    local build=SurvivorAugments.NewBuild('firebolt');build.weapons=weapons
    for _,id in ipairs(weapons)do build.levels[id]=1 end
    for _,id in ipairs(SurvivorConfig.startingTrinkets)do if id~='power' then build.excluded[id]=true end end
    return build
end
b=Restricted({'firebolt','flamefield','chainlightning'});o=SurvivorAugments.Roll(b)
assert(o[1]=='firebolt' and o[2]=='power' and o[3]=='flamefield')
assert(SurvivorAugments.Exclude(b,o,2) and o[2]=='chainlightning' and b.choiceKinds[2]==nil and #o==3)
b=Restricted({'firebolt','flamefield'});o=SurvivorAugments.Roll(b)
assert(SurvivorAugments.Exclude(b,o,2) and #o==2 and o[1]=='firebolt' and o[2]=='flamefield')
assert(b.choiceKinds[1]=='upgrade' and b.choiceKinds[2]==nil)
SurvivorConfig.weaponSlots,SurvivorConfig.trinketSlots=originalWeapons,originalTrinkets
b=SurvivorAugments.NewBuild('firebolt')
b.weapons={'firebolt','flamefield','chainlightning','orbitblade','monsoon','frontslash'}
b.trinkets={'power','haste','reach','magnitude','longevity','vitality'}
for _,ids in ipairs({b.weapons,b.trinkets})do for _,id in ipairs(ids)do b.levels[id]=SurvivorConfig.growthMaxLevel end end
b.evolutions={flamefield='evolution3',chainlightning='evolution5',orbitblade='evolution7',monsoon='evolution9',frontslash='evolution11'}
b.excluded.evolution2=true;o=SurvivorAugments.Roll(b)
assert(#o==1 and o[1]=='evolution1')
assert(SurvivorAugments.Exclude(b,o,1) and #o==1 and o[1]=='recovery')
local hero=CreateUnit(0,'hero',0,0,0);hero.life=100
local before,revision=hero.life,b.revision
SurvivorAugments.Apply('recovery',b,hero)
assert(hero.life==before+hero.maxLife*.3 and b.revision==revision and #b.weapons==6 and #b.trinkets==6)
assert(not SurvivorAugments.CanReroll(b,o,1) and not SurvivorAugments.CanExclude(b,o,1))
`);

suite('spatial candidates preserve swept 2D/3D hits and isolate nested queries', mocks, [config, metrics, augments, combat], String.raw`
local hero,build,units=NewCombat("orbitblade")
local candidates=Local(SurvivorCombat.CastBlades,"Candidates")
local release=Local(SurvivorCombat.CastBlades,"ReleaseCandidates")
local expectedChecks,actualChecks=0,0
for i=1,150 do EnemyAt(units,(i%15-7)*200,(math.floor(i/15)-5)*200,i%7==0) end
local function distance(px,py,pz,ax,ay,az,bx,by,bz)
    local dx,dy,dz=bx-ax,by-ay,bz-az; local length=dx*dx+dy*dy+dz*dz
    local t=length>0 and math.max(0,math.min(1,((px-ax)*dx+(py-ay)*dy+(pz-az)*dz)/length)) or 0
    return (px-ax-t*dx)^2+(py-ay-t*dy)^2+(pz-az-t*dz)^2
end
for sample=1,180 do
    local ax,ay=math.sin(sample)*900,math.cos(sample*3)*900
    local bx,by=ax+math.sin(sample*2)*800,ay+math.cos(sample*7)*800
    if sample%9==0 then bx,by=ax,ay end
    local radius=sample%70+1
    local list=candidates(ax,ay,bx,by,radius,"test"); local found={}
    for _,u in ipairs(list) do found[u]=true end
    for u,record in pairs(units) do if record.enemy then
        local z=GetUnitFlyHeight(u)+60
        if distance(u.x,u.y,0,ax,ay,0,bx,by,0)<=radius^2 then assert(found[u],"Missed 2D hit") end
        if distance(u.x,u.y,z,ax,ay,60,bx,by,360)<=radius^2 then assert(found[u],"Missed 3D hit") end
    end end
    expectedChecks,actualChecks=expectedChecks+150,actualChecks+#list
    local nested=candidates(0,0,0,0,150,"nested")
    for _,u in ipairs(list) do assert(found[u],"Nested query corrupted snapshot") end
    release(nested); release(list)
end
local boundary=EnemyAt(units,0,45,false)
local list=candidates(0,0,0,0,45,"boundary");local found=false
for _,u in ipairs(list) do if u==boundary then found=true end end
assert(found,"Exact boundary omitted"); release(list)
assert(actualChecks<expectedChecks*0.20,"Sparse candidates should be substantially smaller")
print(string.format("  synthetic broad phase: %d -> %d candidate checks",expectedChecks,actualChecks))
SurvivorCombat.Cleanup()

-- Exercise actual frost callback: nearest-first pierces, flying height and dead targets.
hero,build,units=NewCombat("frostshard")
local near=EnemyAt(units,20,0,false);local far=EnemyAt(units,80,0,false)
local above=EnemyAt(units,25,0,true);local dead=EnemyAt(units,10,0,false);dead.life=0
SurvivorCombat.FireFrostShard(); local shard=actors[#actors]
shard.x,shard.y,shard.z,shard.dx,shard.dy,shard.dz=0,0,60,1,0,0
shard.speed,shard.hitRadius,shard.pierces=6000,1,1
shard.selfInteractions(shard)
assert(#hits==1 and hits[1].unit==near and shard.cleaned,"Pierce must hit nearest living target")
assert(above.life==100000 and far.life==100000)
SurvivorCombat.Cleanup()

-- Actual blade callback preserves per-target cooldown and excludes flying enemies.
hero,build,units=NewCombat("orbitblade")
local target=EnemyAt(units,0,0,false);local flying=EnemyAt(units,0,0,true)
SurvivorCombat.CastBlades();local blade=actors[1]
blade.orbit,blade.x,blade.y,blade.hitRadius=0,0,0,65
blade.selfInteractions(blade);blade.selfInteractions(blade)
assert(#hits==1 and hits[1].unit==target)
now=blade.hitInterval;blade.selfInteractions(blade);assert(#hits==2)
SurvivorCombat.Cleanup()

-- Return blade remembers each leg independently; a paused callback does no work.
hero,build,units=NewCombat("returnblade")
target=EnemyAt(units,20,0,false)
SurvivorCombat.CastExtra("returnblade");blade=actors[1]
blade.speed,blade.radius=5000,5
blade.selfInteractions(blade);assert(#hits==1)
state="CHOOSING";local life=blade.life;blade.selfInteractions(blade);assert(blade.life==life and #hits==1)
state="RUNNING";blade.returning=true;blade.leg=2;blade.selfInteractions(blade);assert(#hits==2)
SurvivorCombat.Cleanup()

-- Lingering slash can hit newly arriving enemies, but never the same enemy twice.
hero,build,units=NewCombat("frontslash")
build.stats.slashDuration=0.5
target=EnemyAt(units,50,0,false);local behind=EnemyAt(units,-50,0,false)
SurvivorCombat.CastFrontSlash(); local area
for _,a in ipairs(actors) do if a.identifier=="hsSlashArea" then area=a end end
assert(area);area.selfInteractions(area);assert(#hits==1 and hits[1].unit==target)
behind.x=60;area.selfInteractions(area);assert(#hits==2 and hits[2].unit==behind)
SurvivorCombat.Cleanup()

-- Warning visibility changes update existing visuals once; new visuals inherit it.
hero,build,units=NewCombat("orbitblade")
local alphaWrites=0
BlzSetSpecialEffectAlpha=function(effect,value) effect.alpha=value;alphaWrites=alphaWrites+1 end
BlzSetSpecialEffectColor=function(effect,r,g,b)effect.color={r,g,b}end
SurvivorCombat.CastBlades();blade=actors[1];assert(blade.visual.alpha==255)
assert(blade.visual.color[1]==235 and blade.visual.color[2]==245 and blade.visual.color[3]==255)
SetLocal(SurvivorCombat.UpdateWeapons,"warningUntil",10)
SurvivorCombat.UpdateWeapons(0.02);assert(blade.visual.alpha==150)
local writes=alphaWrites
for i=1,100 do SurvivorCombat.UpdateWeapons(0.02) end
assert(alphaWrites==writes)
SurvivorCombat.CastBlades();assert(actors[#actors].visual.alpha==150)
now=11;SurvivorCombat.UpdateWeapons(0.02)
for _,a in ipairs(actors) do assert(a.visual.alpha==255) end
SurvivorCombat.Cleanup()
hero,build,units=NewCombat('frontslash');target=EnemyAt(units,50,0,false)
SurvivorCombat.CastFrontSlash()
for _,a in ipairs(actors)do
    if a.identifier=='hsSlash'or a.identifier=='hsSlashHit'then assert(a.visual.alpha==255)end
end
SetLocal(SurvivorCombat.UpdateWeapons,'warningUntil',10);SurvivorCombat.UpdateWeapons(.02)
for _,a in ipairs(actors)do
    if a.identifier=='hsSlash'or a.identifier=='hsSlashHit'then assert(a.visual.alpha==150)end
end
SurvivorCombat.Cleanup()
hero,build,units=NewCombat('returnblade');EnemyAt(units,100,0,false);SurvivorCombat.CastExtra('returnblade')
assert(actors[1].visual.alpha==140,'Unrelated blade weapons keep their existing visibility policy')
SurvivorCombat.Cleanup()
`);

suite('chain lightning adds one attached impact per hit, preserves damage and cleans paused or expired visuals', mocks + String.raw`
function AddLightningEx(kind,visible,x,y,z,tx,ty,tz)return {kind=kind,x=x,y=y,z=z,tx=tx,ty=ty,tz=tz}end
function AddSpecialEffectTarget(model,unit,point)return {model=model,unit=unit,point=point}end
function BlzSetSpecialEffectZ(effect,z)assert(not effect.unit,'Attached effects must use native attachment height');effect.z=z end
function BlzSetSpecialEffectScale(effect,value)effect.scale=value end
function BlzSetSpecialEffectAlpha(effect,value)effect.alpha=value end
`, [config, metrics, augments, combat], String.raw`
local hero,build,units=NewCombat('chainlightning')
build.stats.chainTargets=4
local targets={EnemyAt(units,100,0,false),EnemyAt(units,200,0,true),EnemyAt(units,300,0,false)}
EnemyAt(units,2000,0,false);targets[1].life=10
SurvivorCombat.CastChainLightning()
assert(#hits==3 and #actors==6,'One beam and one impact for each distinct target in reach')
local impacts,beams={},{}
for _,actor in ipairs(actors)do
    if actor.identifier=='hsChainHit'then impacts[#impacts+1]=actor else beams[#beams+1]=actor end
end
for i,target in ipairs(targets)do
    assert(hits[i].unit==target and math.abs(hits[i].damage-build.stats.chainDamage*SurvivorConfig.chainFalloff^(i-1))<.00001)
    assert(impacts[i].visual.unit==target and impacts[i].visual.point=='chest'
        and impacts[i].visual.model==SurvivorConfig.chainHitModel and impacts[i].visual.scale>1
        and impacts[i].visual.alpha==255,'Ground, flying and lethally hit units all receive a bright native attachment')
end
local impact=impacts[2];local life=impact.life
state='CHOOSING';impact.selfInteractions(impact);assert(impact.life==life)
state='RUNNING';SetLocal(SurvivorCombat.UpdateWeapons,'warningUntil',10)
SurvivorCombat.UpdateWeapons(.02)
for _,entry in ipairs(impacts)do assert(entry.visual.alpha==110)end
now=11;SurvivorCombat.UpdateWeapons(.02)
for _,entry in ipairs(impacts)do
    assert(entry.visual.alpha==255)
    local visual=entry.visual
    for _=1,30 do if not entry.cleaned then entry.selfInteractions(entry)end end
    assert(entry.cleaned and visual.destroyed and entry.target==nil,'Expiration releases effects and target references')
end
SurvivorCombat.Cleanup()
for _,entry in ipairs(beams)do assert(entry.cleaned and entry.lightning==nil)end
`);

suite('shadow escape blinks through walkable routes, protects once per stage and releases native invulnerability', mocks + String.raw`
PATHING_TYPE_WALKABILITY='walk'
function IsTerrainPathable()return false end
function BlzIsUnitInvulnerable(u)return u.invulnerable==true end
function SetUnitInvulnerable(u,value)u.invulnerable=value end
function BlzSetEventDamage(value)eventDamage=value end
function GetEventDamage()return eventDamage end
function GetEventDamageSource()return eventSource end
function GetTriggerUnit()return eventTarget end
function Receive(hero,source,damage)
    eventTarget,eventSource,eventDamage=hero,source,damage
    Local(SurvivorCombat.Init,'damageTrigger').action()
    return eventDamage
end
`, [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('firebolt')
hero.maxLife,hero.life=1000,100
local source=EnemyAt(units,100,0,false)
EnemyAt(units,-400,0,false)
assert(Receive(hero,source,20)==20 and hero.x==0 and not hero.invulnerable and SurvivorCombat.EscapeStatus())
assert(Receive(hero,source,100)==0 and hero.life==300 and hero.invulnerable)
assert(hero.x<0 and math.abs(hero.y)>100 and math.abs(hero.x^2+hero.y^2-400^2)<.001,
    'Prefer an open diagonal over blinking directly into an enemy')
local ready,remaining,uses=SurvivorCombat.EscapeStatus()
assert(not ready and remaining==2.5 and uses==1 and SurvivorCombat.StageEscapeUses(1)==1)
assert(#actors==2 and actors[1].visual.model==SurvivorConfig.escapeDepartureModel
    and actors[2].visual.model==SurvivorConfig.escapeArrivalModel
    and actors[1].x==0 and actors[2].x==hero.x and actors[2].y==hero.y)
local shell=Local(SurvivorCombat.Init,'escapeEffect')
local x,y=hero.x,hero.y
assert(Receive(hero,source,1000)==0 and hero.life==300 and hero.x==x and hero.y==y and #actors==2)
state='CHOOSING';SurvivorCombat.UpdateWeapons(10)
assert(hero.invulnerable and select(2,SurvivorCombat.EscapeStatus())==2.5 and not shell.destroyed)
state='RUNNING';now=2.49;SurvivorCombat.UpdateWeapons(.02);assert(hero.invulnerable)
now=2.5;SurvivorCombat.UpdateWeapons(.02)
assert(not hero.invulnerable and shell.destroyed and select(2,SurvivorCombat.EscapeStatus())==0)
assert(Receive(hero,source,400)==400 and select(3,SurvivorCombat.EscapeStatus())==1,
    'The spent escape cannot trigger again in the same stage')
SurvivorCombat.BeginStage(2,now);assert(SurvivorCombat.EscapeStatus())
hero.life=100;assert(Receive(hero,nil,100)==0 and hero.invulnerable and SurvivorCombat.StageEscapeUses(2)==1)
SurvivorCombat.BeginStage(3,now);assert(not hero.invulnerable and SurvivorCombat.EscapeStatus())
SurvivorCombat.Cleanup()

hero,build,units=NewCombat('firebolt');hero.maxLife,hero.life=1000,100
source=EnemyAt(units,100,0,false)
-- Both distant endpoints are clear; only the route to the left crosses a wall.
IsTerrainPathable=function(x,y)return math.abs(y)>32.001 or (x < -48 and x > -80)end
assert(Receive(hero,source,100)==0 and hero.x>0 and math.abs(hero.y)<.001,
    'Do not blink across an impassable strip into an otherwise clear landing')
SurvivorCombat.Cleanup();assert(not hero.invulnerable)

hero,build,units=NewCombat('firebolt');hero.maxLife,hero.life=1000,100
SetLocal(SurvivorCombat.Init,'bounds',{minX=-64,maxX=64,minY=-64,maxY=64})
IsTerrainPathable=function()return false end
assert(Receive(hero,nil,100)==0 and hero.x==0 and hero.y==0 and hero.invulnerable
    and lastMessage:find('제자리 보호'),'No in-bounds landing still grants full protection')
state='STAGE_CLEAR';SurvivorCombat.ClearBattlefieldAsync(function()end)
assert(not hero.invulnerable,'Stage clearing releases protection before removing actors')
SurvivorCombat.Cleanup()

hero,build,units=NewCombat('firebolt');hero.maxLife,hero.life=1000,100
IsTerrainPathable=function()return true end
hero.invulnerable=true
Receive(hero,nil,100)
assert(hero.x==0 and hero.y==0)
SurvivorCombat.ClearBattlefield();assert(hero.invulnerable,'Do not remove pre-existing invulnerability')
SurvivorCombat.Cleanup()
`);

suite('bounded cleanup, frozen time, completion once, and restart cancellation', mocks, [config, metrics, augments, combat], String.raw`
local hero,build,units=NewCombat("orbitblade")
for i=1,150 do EnemyAt(units,i*10,300,false) end
for i=1,40 do SurvivorCombat.CastBlades() end
state="STAGE_CLEAR";local done,ticks=0,0;local before=now
SurvivorCombat.ClearBattlefieldAsync(function() done=done+1 end)
assert(SurvivorCombat.IsClearing() and removed==0)
while SurvivorCombat.IsClearing() do
    local unitsBefore,objectsBefore=SurvivorCombat.Counts()
    TickTimers();ticks=ticks+1
    local unitsAfter,objectsAfter=SurvivorCombat.Counts()
    assert(unitsBefore-unitsAfter+objectsBefore-objectsAfter<=SurvivorConfig.battlefieldCleanupBudget)
    assert(now==before and state=="STAGE_CLEAR" and not hero.removed)
    assert(ticks<100)
end
TickTimers();assert(done==1 and ticks>1)
local enemies,objects=SurvivorCombat.Counts();assert(enemies==0 and objects==0)
print(string.format("  removed 150 enemies + 80 blades across %d native timer ticks",ticks))
SurvivorCombat.Cleanup()
hero,build,units=NewCombat("orbitblade")
for i=1,100 do EnemyAt(units,i,300,false) end
state="STAGE_CLEAR";done=0
SurvivorCombat.ClearBattlefieldAsync(function() done=done+1 end)
local stale=timers[#timers].callback;TickTimers();SurvivorCombat.Cleanup()
hero,build,units=NewCombat("orbitblade");local survivor=EnemyAt(units,100,0,false)
stale();TickTimers();assert(done==0 and not survivor.removed and not SurvivorCombat.IsClearing())
SurvivorCombat.Cleanup()
-- Errors end the timer before delegating to the run's failure handler.
hero,build,units=NewCombat("orbitblade");state="STAGE_CLEAR"
local failed=false;RunSession.Fail=function() failed=true end
SurvivorCombat.ClearBattlefieldAsync(function() error("intentional completion failure") end)
TickTimers();assert(failed and not SurvivorCombat.IsClearing())
SurvivorCombat.Cleanup()
`);

suite('combat teardown continues after native failures and permits a fresh initialization', mocks, [config,metrics,augments,combat], String.raw`
for _,failureKind in ipairs({'DestroyTrigger','DestroyEffect','ALICE_Kill','RemoveUnit','PauseTimer','DestroyGroup'})do
    local hero,build,units=NewCombat('orbitblade')
    for i=1,3 do EnemyAt(units,i*50,0,false)end
    SurvivorCombat.CastBlades()
    local object=actors[1];object.markers={AddSpecialEffect('marker',0,0),AddSpecialEffect('marker',0,0)}
    local markers=object.markers
    local height=Local(SurvivorCombat.Init,'heightLocation');local group=Local(SurvivorCombat.Init,'queryGroup')
    state='STAGE_CLEAR';SurvivorCombat.ClearBattlefieldAsync(function()error('stale completion')end)
    local timer=timers[#timers];local stale=timer.callback
    local realFunction=_G[failureKind];local first=true;local calls=0
    _G[failureKind]=function(...)
        calls=calls+1
        if first then first=false;error('injected '..failureKind..' failure')end
        return realFunction(...)
    end
    local ok,message=pcall(SurvivorCombat.Cleanup)
    _G[failureKind]=realFunction
    assert(not ok and tostring(message):find('injected '..failureKind..' failure'))
    assert(timer.destroyed and not SurvivorCombat.IsClearing() and height.removed)
    if failureKind~='DestroyGroup' then assert(group.destroyed)end
    assert(Local(SurvivorCombat.Init,'hero')==nil and Local(SurvivorCombat.Init,'queryGroup')==nil)
    assert(Local(SurvivorCombat.Init,'damageTrigger')==nil and Local(SurvivorCombat.Init,'deathTrigger')==nil)
    assert(object.cleaned and object.markers==nil and markers[1].destroyed and markers[2].destroyed,
        'An effect/actor failure cannot skip the remaining markers')
    assert(select(1,SurvivorCombat.Counts())==0 and select(2,SurvivorCombat.Counts())==0)
    stale();assert(not SurvivorCombat.IsClearing(),'A detached cleanup timer cannot run its completion')
    hero,build,units=NewCombat('firebolt');assert(hero and select(1,SurvivorCombat.Counts())==0)
    SurvivorCombat.Cleanup()
end
`);

suite('range damage preserves target order, 3D hits, slow effects and nested queries while reducing native checks', mocks,
    [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('blizzard')
local areaHit=Local(SurvivorCombat.CastExtra,'AreaHit')
local ground=EnemyAt(units,100,0,false)
local boundary=EnemyAt(units,200,0,false)
local flying=EnemyAt(units,0,0,true)
local outside=EnemyAt(units,201.5,0,false)
for i=1,100 do EnemyAt(units,2000+i,1000,false)end
local expected={}
for u,record in pairs(units)do
    if record.enemy and (u.x*u.x+u.y*u.y)<=200^2 then expected[#expected+1]=u end
end
SurvivorMetrics.Enable(true)
areaHit({x=0,y=0,z=60,radius=200,weapon='blizzard',slow=.2,slowDuration=2},20)
assert(#hits==#expected)
for i,u in ipairs(expected)do assert(hits[i].unit==u and math.abs(u.speed-176)<.001 and units[u].slows.blizzard.expires==2)end
local counters=Local(SurvivorMetrics.Report,'counters')
assert(counters['blizzard.area.calls']==1 and counters['blizzard.area.distanceChecks']<=#expected+1)
assert(counters['blizzard.area.orderScans']>counters['blizzard.area.distanceChecks'],
    'Retain table order scans while avoiding far-away native distance/height checks')
hits={};areaHit({x=0,y=0,z=60,radius=200,spherical=true,weapon='blizzard',slow=0},10)
assert(#hits==2)
for _,hit in ipairs(hits)do assert(hit.unit~=flying and hit.unit~=outside)end
hits={};local nested=false
onDamage=function(u)
    if not nested then
        nested=true
        areaHit({x=2000,y=1000,z=60,radius=20,weapon='meteor',slow=0},5)
    end
end
areaHit({x=0,y=0,z=60,radius=200,weapon='blizzard',slow=0},10)
onDamage=nil
local outer={};for _,hit in ipairs(hits)do if hit.damage==10 then outer[#outer+1]=hit.unit end end
assert(#outer==#expected)
for i,u in ipairs(expected)do assert(outer[i]==u,'A nested query must not rewrite the outer target snapshot')end
state='INVENTORY';local hitCount=#hits
SurvivorCombat.UpdateWeapons(.02);assert(#hits==hitCount)
state='RUNNING';SurvivorCombat.UpdateWeapons(.02)
assert(counters['status.calls']==1 and counters['status.unitChecks']>0)
SurvivorMetrics.Enable(false);SurvivorCombat.Cleanup()
`);

suite('active status tracking skips unaffected units and preserves pause, expiry, ties and frost resets', mocks,
    [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('frostshard')
for i=1,150 do EnemyAt(units,2000+i,0,false)end
local target=EnemyAt(units,100,0,false);local other=EnemyAt(units,120,0,false)
local slow=Local(SurvivorCombat.CastExtra,'Slow');local freeze=Local(SurvivorCombat.FireFrostShard,'Freeze')
local statuses=Local(SurvivorCombat.UpdateWeapons,'statusUnits')
SurvivorCombat.TrackWeapons({'blizzard','frostshard'})
SurvivorMetrics.Enable(true);SurvivorCombat.UpdateWeapons(.02)
local counters=Local(SurvivorMetrics.Report,'counters')
assert(counters['status.unitChecks']==0,'Unaffected enemies must not enter the 50Hz status traversal')
slow(target,.2,1,'blizzard');slow(target,.2,2,'frostshard');assert(freeze(target,.6))
slow(other,.4,.8,'frostshard')
now=.5;SurvivorCombat.UpdateWeapons(.1)
assert(counters['status.unitChecks']==2 and target.paused and target.speed==176)
local ledger=Local(SurvivorCombat.DamageRows,'damageTotals')
assert(ledger.blizzard.slowSeconds==.1 and ledger.frostshard.slowSeconds==.1,'Equal slows credit the lexical source once per target')
state='INVENTORY';local checks=counters['status.unitChecks'];SurvivorCombat.UpdateWeapons(.1)
assert(counters['status.unitChecks']==checks and ledger.blizzard.slowSeconds==.1 and target.paused)
state='RUNNING';now=.8;SurvivorCombat.UpdateWeapons(.1)
assert(not target.paused and other.speed==220 and statuses[other]==nil)
now=1;SurvivorCombat.UpdateWeapons(.1)
assert(math.abs(ledger.frostshard.slowSeconds-.2)<.00001 and target.speed==176)
now=2;SurvivorCombat.UpdateWeapons(.1)
assert(target.speed==220 and target.speed==units[target].baseSpeed and statuses[target]==nil and next(statuses)==nil)
build.stats.sets.frost=true;now=3;slow(target,.3,2,'frostshard')
local setHit=Local(SurvivorCombat.FireFrostShard,'SetHit');setHit(target,10,'frostshard')
assert(units[target].frostHits==1 and statuses[target])
build.stats.sets.frost=false;SurvivorCombat.UpdateWeapons(.02);assert(units[target].frostHits==0)
now=5;SurvivorCombat.UpdateWeapons(.02);assert(next(statuses)==nil)
slow(other,.2,3,'blizzard');GetTriggerUnit=function()return other end
for _,trigger in ipairs(triggers)do if trigger.event=='death' and not trigger.destroyed then trigger.action()end end
assert(statuses[other]==nil,'Deaths detach active status ownership immediately')
SurvivorCombat.Cleanup();SurvivorMetrics.Enable(false)
hero,build,units=NewCombat('frostshard');assert(next(Local(SurvivorCombat.UpdateWeapons,'statusUnits'))==nil)
SurvivorCombat.Cleanup()
`);

suite('passive frost stacks preserve accumulation without polling expired states and clear on unequip or death', mocks,
    [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('frostshard');build.stats.sets.frost=true
local target=EnemyAt(units,100,0,false)
local slow=Local(SurvivorCombat.CastExtra,'Slow');local setHit=Local(SurvivorCombat.FireFrostShard,'SetHit')
local statuses=Local(SurvivorCombat.UpdateWeapons,'statusUnits');local stacks=Local(SurvivorCombat.UpdateWeapons,'frostStackUnits')
slow(target,.3,2,'frostshard');setHit(target,10,'frostshard');now=3;SurvivorCombat.UpdateWeapons(.02)
assert(units[target].slows==nil and statuses[target]==nil and units[target].frostHits==1 and stacks[target])
SurvivorMetrics.Enable(true);for i=1,1500 do now=now+.02;SurvivorCombat.UpdateWeapons(.02)end
assert(Local(SurvivorMetrics.Report,'counters')['status.unitChecks']==0)
slow(target,.3,2,'frostshard');setHit(target,10,'frostshard');assert(units[target].frostHits==2)
now=now+3;SurvivorCombat.UpdateWeapons(.02);assert(statuses[target]==nil and stacks[target])
build.stats.sets.frost=false;SurvivorCombat.UpdateWeapons(.02);assert(units[target].frostHits==0 and next(stacks)==nil)
build.stats.sets.frost=true;slow(target,.3,2,'frostshard');setHit(target,10,'frostshard');assert(units[target].frostHits==1)
GetTriggerUnit=function()return target end
for _,t in ipairs(triggers)do if t.event=='death' and not t.destroyed then t.action()end end
assert(stacks[target]==nil and statuses[target]==nil);SurvivorCombat.Cleanup()
assert(next(Local(SurvivorCombat.UpdateWeapons,'frostStackUnits'))==nil)
SurvivorMetrics.Enable(false)
print('  expired frost: 1500 updates, 0 status unit checks')
`);

suite('secondary range queries preserve damage and random order and choose cached nearest shards', mocks + String.raw`
function GetRandomInt(a,b)randomBounds[#randomBounds+1]=b;return b end
`, [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('frostnova')
local first=EnemyAt(units,100,0,false);local tie=EnemyAt(units,-100,0,false)
local edge=EnemyAt(units,200,0,true);local far=EnemyAt(units,2500,0,false)
build.stats.extraWeapons.frostnova.range=200;randomBounds={}
local expected={};for u,record in pairs(units)do if record.enemy and u.x*u.x+u.y*u.y<=200^2 then expected[#expected+1]=u end end
SurvivorCombat.CastExtra('frostnova')
assert(#randomBounds==#expected);for i,b in ipairs(randomBounds)do assert(i==b,'Reservoir random bounds must retain the original units order')end
local nova;for _,a in ipairs(actors)do if a.identifier=='hsNova' then nova=a end end
assert(nova.x==expected[1].x and nova.y==expected[1].y,'Preserve the random-selected target in table order')
build.stats.sets.ember=true;hits={}
local expire=Local(SurvivorCombat.CreateZone,'ExpireEmber')
local nested=false;local areaHit=Local(SurvivorCombat.CastExtra,'AreaHit')
onDamage=function()if not nested then nested=true;areaHit({x=far.x,y=far.y,z=60,radius=1,weapon='meteor',slow=0},1)end end
expire({x=0,y=0,z=0,radius=200,damage=5});onDamage=nil
local outer={};for _,hit in ipairs(hits)do if hit.damage==10 then outer[#outer+1]=hit.unit end end
local groundExpected={};for _,u in ipairs(expected)do if not u.flying then groundExpected[#groundExpected+1]=u end end
assert(#outer==#groundExpected);for i,u in ipairs(outer)do assert(u==groundExpected[i],'Secondary nested queries preserve the outer damage order')end
SurvivorCombat.Cleanup()
hero,build,units=NewCombat('frostshard');build.stats.frostEvolution='evolution13'
local dead=EnemyAt(units,0,0,false);units[dead].alive=false;dead.life=0
local close=EnemyAt(units,60,0,false);local equalFirst=EnemyAt(units,100,0,false)
local equalSecond=EnemyAt(units,0,100,false);local rejected=EnemyAt(units,0,-100,false)
for i=1,100 do EnemyAt(units,3000+i,0,false)end
units[dead].slows={frostshard={amount=.3,expires=2}}
SurvivorStage.LineClear=function(ax,ay,bx,by)return by>=0 end
local xReads,yReads=0,0;local oldX,oldY=GetUnitX,GetUnitY
GetUnitX=function(u)xReads=xReads+1;return oldX(u)end;GetUnitY=function(u)yReads=yReads+1;return oldY(u)end
SurvivorMetrics.Enable(true)
Local(SurvivorCombat.Init,'Shatter')(dead,units[dead])
assert(#actors==3 and xReads<=5 and yReads<=5,'Nearby coordinates are read once and top-three selection skips distant native reads')
assert(actors[1].dx==1 and actors[1].dy==0 and actors[2].dx==1 and actors[2].dy==0 and actors[3].dx==0 and actors[3].dy==1,
    'Shatter retains distance then handle ordering, including ties and line-of-sight exclusions')
assert((Local(SurvivorMetrics.Report,'counters')['shatter.area.orderScans']or 0)==0,
    'Independent nearest ordering does not need the full enemy table traversal')
GetUnitX,GetUnitY=oldX,oldY;SurvivorCombat.Cleanup();SurvivorMetrics.Enable(false)
`);

suite('firebolt explosions preserve handle order, primary exclusion and target cap with unordered candidates', mocks,
    [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('firebolt');build.stats.fireEvolution='evolution1';build.stats.missileCount=1
local primary=EnemyAt(units,100,0,false);local nearby,far={},{}
for i=1,14 do nearby[i]=EnemyAt(units,100+i,0,false)end
for i=1,100 do far[i]=EnemyAt(units,3000+i,0,false)end
local enumerate=GroupEnumUnitsInRange
GroupEnumUnitsInRange=function(group,...)
    enumerate(group,...)
    for i=1,math.floor(#group/2)do local j=#group-i+1;group[i],group[j]=group[j],group[i]end
end
SurvivorMetrics.Enable(true);SurvivorCombat.FireMissile()
local missile=actors[1];assert(missile.target==primary);missile.speed=50000;missile.selfInteractions(missile)
GroupEnumUnitsInRange=enumerate
assert(#hits==13 and hits[1].unit==primary and hits[1].damage==build.stats.missileDamage)
for i=1,12 do assert(hits[i+1].unit==nearby[i] and hits[i+1].damage==build.stats.missileDamage*.30,
    'Explosion must retain handle order after a reversed native candidate enumeration')end
assert(primary.life==100000-build.stats.missileDamage,'The primary is excluded from secondary explosion damage')
assert(nearby[13].life==100000 and nearby[14].life==100000,'Explosion keeps its twelve-target cap')
for _,u in ipairs(far)do assert(u.life==100000)end
local counters=Local(SurvivorMetrics.Report,'counters')
assert((counters['firebolt.area.orderScans']or 0)==0 and counters['firebolt.area.queries']==1)
SurvivorCombat.Cleanup();SurvivorMetrics.Enable(false)
`);

suite('guardian updates cache each coordinate once and preserve shield choice and damage reduction', mocks,
    [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('firebolt');local targets,guardians={},{}
for i=1,140 do local u=EnemyAt(units,(i%14-7)*120,(math.floor(i/14)-5)*120,false);units[u].special={};targets[#targets+1]=u end
for _,point in ipairs({{0,0},{400,0},{-400,0},{0,600}})do
    local u=EnemyAt(units,point[1],point[2],false);units[u].trait='guardian';units[u].special={};guardians[#guardians+1]=u
end
local boss=EnemyAt(units,0,0,false);units[boss].boss=true;units[boss].special={}
local dead=EnemyAt(units,0,0,false);units[dead].trait='guardian';units[dead].alive=false
local expected={};local ordered={}
for u,record in pairs(units)do if record.trait=='guardian' and record.alive then ordered[#ordered+1]=u end end
for _,u in ipairs(targets)do for _,guardian in ipairs(ordered)do
    if (guardian.x-u.x)^2+(guardian.y-u.y)^2<=400^2 then expected[u]=guardian;break end
end end
local reads={};local oldX,oldY=GetUnitX,GetUnitY
GetUnitX=function(u)reads[u]=reads[u]or{x=0,y=0};reads[u].x=reads[u].x+1;return oldX(u)end
GetUnitY=function(u)reads[u]=reads[u]or{x=0,y=0};reads[u].y=reads[u].y+1;return oldY(u)end
SurvivorCombat.UpdateEnemies(0)
for _,u in ipairs(targets)do assert(units[u].shieldSource==expected[u] and reads[u].x==1 and reads[u].y==1)end
for _,u in ipairs(guardians)do assert(units[u].shieldSource==nil and reads[u].x==1 and reads[u].y==1)end
assert(units[boss].shieldSource==nil and reads[boss]==nil and reads[dead]==nil)
GetUnitX,GetUnitY=oldX,oldY
local shielded;for _,u in ipairs(targets)do if units[u].shieldSource then shielded=u;break end end;assert(shielded)
local eventDamage;GetTriggerUnit=function()return shielded end;GetEventDamage=function()return 100 end
BlzSetEventDamage=function(amount)eventDamage=amount end
for _,trigger in ipairs(triggers)do if trigger.event=='damage' and not trigger.destroyed then trigger.action()end end
assert(eventDamage==70,'Caching must preserve native incoming damage reduction')
for _,u in ipairs(guardians)do u.x=4000 end
SurvivorCombat.UpdateEnemies(.5);assert(units[shielded].shieldSource==nil)
SurvivorCombat.Cleanup()
`);

suite('meteor impact replaces the flame column while preserving impact damage and lingering pulses', mocks,
    [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('meteor')
local target=EnemyAt(units,100,0,false)
SurvivorCombat.CastWeapon('meteor')
local meteor=actors[#actors]
assert(meteor.identifier=='hsMeteor' and meteor.visual.model==SurvivorConfig.meteorModel)
local w=meteor.profile
meteor.life=.001;meteor.selfInteractions(meteor)
local zone=actors[#actors]
assert(meteor.cleaned and zone.weapon=='meteor'
    and zone.visual.model==[[Objects\Spawnmodels\Other\NeutralBuildingExplosion\NeutralBuildingExplosion.mdl]])
assert(zone.life==w.duration and zone.damage==w.damage*.2 and zone.radius==w.radius)
assert(#hits==1 and hits[1].damage==w.damage,'Landing still deals its full impact damage')
zone.selfInteractions(zone)
assert(#hits==2 and hits[2].damage==w.damage*.2,'The impact effect retains the lingering damage callback')
Local(meteor.selfInteractions,'NewZone')('flamefield',0,0,w,w.damage)
assert(actors[#actors].visual.model==SurvivorConfig.zoneModel,'Other flame zones retain their own effect')
SurvivorCombat.Cleanup()
`);

suite('multicast snapshots contain only the selected weapon and retain cast-time values', mocks + String.raw`
function AddLightningEx()return {}end
function GetRandomInt()return 1 end
`, [config,metrics,augments,combat], String.raw`
for _,weapon in ipairs({'firebolt','flamefield','chainlightning','monsoon','frontslash','frostshard','frostnova','blizzard','meteor','thunderorb','returnblade'})do
    local hero,build,units=NewCombat(weapon);EnemyAt(units,100,0,false)
    build.stats.multiCount,build.stats.multiDamage=2,.4
    SurvivorCombat.CastWeapon(weapon)
    local pending={};for _,actor in ipairs(actors)do if actor.identifier=='hsExtraAttack' then pending[#pending+1]=actor end end
    assert(#pending==2 and pending[1].shot.stats==pending[2].shot.stats)
    local snapshot=pending[1].shot.stats
    assert(snapshot.sets==nil and snapshot.regeneration==nil and snapshot.bladeDamage==nil and snapshot.bladeCount==nil,
        'Unrelated global and blade profiles are not copied')
    if snapshot.extraWeapons then
        local count=0;for id,profile in pairs(snapshot.extraWeapons)do assert(id==weapon);count=count+1 end;assert(count==1)
        local damage=snapshot.extraWeapons[weapon].damage
        build.stats.extraWeapons[weapon].damage=99999
        assert(snapshot.extraWeapons[weapon].damage==damage and snapshot.extraWeapons[weapon]~=build.stats.extraWeapons[weapon])
    else
        assert(snapshot.extraWeapons==nil and snapshot[Local(SurvivorCombat.CastWeapon,'enabledFields')[weapon]])
        local key=Local(SurvivorCombat.CastWeapon,'snapshotDamage')[weapon];local damage=snapshot[key]
        build.stats[key]=99999;assert(snapshot[key]==damage)
    end
    for _,actor in ipairs(pending)do actor.life=.001;actor.selfInteractions(actor);assert(actor.cleaned)end
    SurvivorCombat.Cleanup()
end
`);

suite('tooltip cache invalidation, paused acquisition, and item recreation', mocks, [config, metrics, augments, combat, 'src/30_gameplay/SurvivorNativeLoadout.lua'], String.raw`
local hero,build=NewCombat("firebolt")
local positions={}
function BlzSetAbilityPosX(id,x) positions[id]=positions[id]or{};positions[id].x=x end
function BlzSetAbilityPosY(id,y) positions[id]=positions[id]or{};positions[id].y=y end
local calls=0;local original=SurvivorAugments.OwnedTooltip
SurvivorAugments.OwnedTooltip=function(...) calls=calls+1;return original(...) end
SurvivorNativeLoadout.Init(hero,build);assert(calls==1)
for i=1,200 do SurvivorNativeLoadout.Refresh() end
assert(calls==1,"Unchanged descriptions regenerated")
SurvivorAugments.Apply("power",build,hero);hero.paused=true
SurvivorNativeLoadout.Refresh();assert(calls==2 and hero.inventory[1]==nil)
hero.paused=false;SurvivorNativeLoadout.Refresh();assert(calls==3 and hero.inventory[1])
local item=hero.inventory[1];hero.inventory[1]=nil
SurvivorNativeLoadout.Refresh();assert(item.removed and hero.inventory[1]~=item and calls==3)
SurvivorAugments.SetEquipmentBonuses(build,{test={all={damagePct=0.25}}},hero)
SurvivorNativeLoadout.Refresh();assert(calls==5)
local revision=build.revision
assert(SurvivorAugments.SetEquipmentBonuses(build,{renamed={all={damagePct=0.25}}},hero)==false)
SurvivorNativeLoadout.Refresh()
assert(build.revision==revision and calls==5,'Equivalent gear must retain native description caches')
for i=1,200 do SurvivorNativeLoadout.Refresh() end
assert(calls==5)
for _,id in ipairs({"flamefield","chainlightning","orbitblade","monsoon","frontslash"})do
    SurvivorAugments.Apply(id,build,hero)
end
SurvivorNativeLoadout.Refresh()
local occupied={["1:1"]="HsAE"}
for _,id in ipairs({"HsW1","HsW2","HsW3","HsW4","HsW5","HsW6"})do
    local point=assert(positions[id],"Every learned weapon needs a native command position")
    local key=point.x..":"..point.y
    assert(not occupied[key],"Six weapons must not overlap each other or the escape button")
    occupied[key]=id
end
local expectedPositions={{0,2},{1,2},{2,2},{3,2},{2,1},{3,1}}
for slot,id in ipairs({"HsW1","HsW2","HsW3","HsW4","HsW5","HsW6"})do
    assert(positions[id].x==expectedPositions[slot][1] and positions[id].y==expectedPositions[slot][2],
        "Weapons must follow the requested command-card order")
end
SurvivorNativeLoadout.Cleanup();SurvivorCombat.Cleanup()
print("  400 unchanged refreshes: 0 repeated description builds")
`);

suite('trinket pickup, upgrades, recreation and restart use only concise current-level descriptions', mocks + String.raw`
SurvivorCombat={EscapeStatus=function()return true,0 end,WardStatus=function()return 0,0 end}
function BlzSetItemName(item,text)item.name=text end
function BlzSetItemTooltip(item,text)item.tooltip=text end
function BlzSetItemExtendedTooltip(item,text)item.extended=text end
function BlzSetItemDescription(item,text)item.description=text end
function SetItemDroppable(item,value)item.droppable=value end
function SetItemPawnable(item,value)item.pawnable=value end
local add=UnitAddItem
function UnitAddItem(u,item)
    if item.id:match('^HsT')then
        assert(item.description and item.extended==item.description and item.charges,
            'The native pickup must see the current description before insertion')
        assert(not item.description:find('자동 적용')and not item.description:find('레벨업 선택으로 강화')
            and not item.description:find('|cffaaaaaa'),'No long suffix or flavor during pickup')
    end
    return add(u,item)
end
`, [config,metrics,augments,'src/30_gameplay/SurvivorNativeLoadout.lua'], String.raw`
for _,id in ipairs(SurvivorConfig.startingTrinkets)do
    local hero=CreateUnit(0,'hero',0,0,0);local build=SurvivorAugments.NewBuild('firebolt',id)
    SurvivorNativeLoadout.Init(hero,build)
    for level=1,5 do
        if level>1 then SurvivorAugments.Apply(id,build,hero);SurvivorNativeLoadout.Refresh()end
        local item=hero.inventory[1]
        local expected=SurvivorAugments.OwnedTooltip(id,build):gsub('\n','|n')
        assert(item.description==expected and item.extended==expected and item.charges==level)
        assert(not expected:find('단독 기준')and not expected:find('합산')and not expected:find('|cffaaaaaa'))
        assert(item.droppable==false and item.pawnable==false,'Description cleanup must retain item restrictions')
        if id=='haste'then assert(expected==string.format('모든 무기 쿨다운 -%.1f%%',(1-1/(1+level*.1))*100))end
        if id=='multicast'then assert(expected:find('추가 공격 피해',1,true))end
        assert(SurvivorAugments.Preview(id,SurvivorAugments.NewBuild('firebolt')):find('→',1,true))
    end
    local item=hero.inventory[1];hero.inventory[1]=nil;RemoveItem(item);hero.paused=true
    SurvivorNativeLoadout.Refresh();assert(hero.inventory[1]==nil and build.levels[id]==5)
    hero.paused=false;SurvivorNativeLoadout.Refresh()
    assert(hero.inventory[1]~=item and hero.inventory[1].charges==5)
    assert(hero.inventory[1].description==SurvivorAugments.OwnedTooltip(id,build):gsub('\n','|n'))
    SurvivorNativeLoadout.Cleanup();build=SurvivorAugments.NewBuild('firebolt',id)
    SurvivorNativeLoadout.Init(hero,build);assert(hero.inventory[1].charges==1)
    assert(hero.inventory[1].description==SurvivorAugments.OwnedTooltip(id,build):gsub('\n','|n'))
    SurvivorNativeLoadout.Cleanup()
end
`);

suite('weapon tooltips stay concise through five levels, all evolutions and native refreshes', mocks + String.raw`
SurvivorCombat={EscapeStatus=function()return true,0 end,WardStatus=function()return 0,0 end}
weaponText={}
local write=BlzSetAbilityExtendedTooltip
function BlzSetAbilityExtendedTooltip(id,text,level)
    weaponText[id..':'..level]=text;return write(id,text,level)
end
`, [config,metrics,augments,'src/30_gameplay/SurvivorNativeLoadout.lua'], String.raw`
local ids={firebolt='HsW1',flamefield='HsW2',chainlightning='HsW3',orbitblade='HsW4',monsoon='HsW5',frontslash='HsW6',frostshard='HsW7',frostnova='HsW8',blizzard='HsW9',meteor='HsWA',thunderorb='HsWB',returnblade='HsWC'}
local function Check(id,build)
    local level=build.levels[id];local text=weaponText[ids[id]..':'..(level-1)]
    assert(text==SurvivorAugments.OwnedTooltip(id,build):gsub('\n','|n'))
    assert(not text:find('자동 적용')and not text:find('레벨업 선택으로 강화')and not text:find('|cffaaaaaa'))
    assert(text:find('쿨다운',1,true)and text:find('피해',1,true),'Keep current numerical combat information')
    if id=='chainlightning'then assert(text:find('전이마다 피해 -15%',1,true))end
    if id=='frontslash'then assert(text:find('대상별 1회 타격',1,true))end
end
for id in pairs(ids)do
    local hero=CreateUnit(0,'hero',0,0,0);local build=SurvivorAugments.NewBuild(id)
    SurvivorNativeLoadout.Init(hero,build)
    for level=1,5 do
        if level>1 then SurvivorAugments.Apply(id,build,hero);SurvivorNativeLoadout.Refresh()end
        Check(id,build)
        assert(BlzGetAbilityTooltip(ids[id])==SurvivorAugments.Get(id).name..' · '..(level==5 and 'MAX'or'Lv.'..level))
    end
    local writes=abilityWrites;for _=1,20 do SurvivorNativeLoadout.Refresh()end
    assert(abilityWrites==writes,'Unchanged weapon tooltips must not be rewritten every tick')
    SurvivorNativeLoadout.Cleanup()
end
for i=1,24 do
    local evolution='evolution'..i;local entry=SurvivorAugments.Get(evolution)
    local hero=CreateUnit(0,'hero',0,0,0);local build=SurvivorAugments.NewBuild(entry.weapon)
    build.levels[entry.weapon]=5;SurvivorAugments.Recalculate(build,hero)
    SurvivorNativeLoadout.Init(hero,build);SurvivorAugments.Apply(evolution,build,hero);SurvivorNativeLoadout.Refresh()
    Check(entry.weapon,build)
    assert(weaponText[ids[entry.weapon]..':4']:find(entry.text,1,true),'Keep every evolution effect and condition')
    assert(BlzGetAbilityTooltip(ids[entry.weapon])==entry.name..' · 진화')
    assert(SurvivorAugments.Preview(evolution,build)=='진화 선택 후 변경 불가')
    SurvivorNativeLoadout.Cleanup()
end
`);

suite('native stat details attaches once without command slots and restores pre-existing ability ownership', mocks + String.raw`
SurvivorCombat={EscapeStatus=function()return true,0 end,WardStatus=function()return 0,0 end}
`, [config,metrics,augments,'src/30_gameplay/SurvivorNativeLoadout.lua'], String.raw`
for _,preexisting in ipairs({false,true})do
    local hero=CreateUnit(0,'hero',0,0,0);local build=SurvivorAugments.NewBuild('firebolt')
    if preexisting then hero.abilities.ASde=1 end
    local additions,positionWrites=0,0;local add=UnitAddAbility;local position=BlzSetAbilityPosX
    UnitAddAbility=function(u,id)if id=='ASde'then additions=additions+1 end;return add(u,id)end
    BlzSetAbilityPosX=function(id,...)assert(id~='ASde'and id~='ASpc','Native details must not occupy a weapon slot');positionWrites=positionWrites+1;position(id,...)end
    SurvivorNativeLoadout.Init(hero,build)
    local menuText=BlzGetAbilityExtendedTooltip('ASpc')
    assert(select(2,menuText:gsub('|n',''))==2,'Shared menu tooltip contains only points, delivery status and regeneration')
    assert(not menuText:find('각 구역 수색 준비에서',1,true)and not menuText:find('단계마다 셋 중 하나 선택',1,true)
        and not menuText:find('상세 정보를 확인합니다',1,true),'The shared menu must not restore the long help text')
    for _=1,20 do SurvivorNativeLoadout.Refresh()end
    assert(GetUnitAbilityLevel(hero,'ASde')==1 and additions==(preexisting and 0 or 1))
    SurvivorNativeLoadout.Cleanup()
    assert(GetUnitAbilityLevel(hero,'ASde')==(preexisting and 1 or 0))
    UnitAddAbility,BlzSetAbilityPosX=add,position
end
`);

suite('native trinket snapshots share static slot reads and verify moves, restoration and rejected insertion', mocks + String.raw`
SurvivorCombat={EscapeStatus=function()return true,0 end,WardStatus=function()return 0,0 end}
`, [config,metrics,augments,'src/30_gameplay/SurvivorNativeLoadout.lua'], String.raw`
local hero=CreateUnit(0,'hero',0,0,0);local build=SurvivorAugments.NewBuild('firebolt')
for _,id in ipairs({'power','haste','reach','velocity','magnitude','longevity'})do SurvivorAugments.Apply(id,build,hero)end
SurvivorNativeLoadout.Init(hero,build)
local reads=0;local readSlot=UnitItemInSlot
UnitItemInSlot=function(...)reads=reads+1;return readSlot(...)end
local writes=abilityWrites
assert(SurvivorNativeLoadout.Refresh()==false and reads==6 and abilityWrites==writes)
hero.inventory[1],hero.inventory[6]=hero.inventory[6],hero.inventory[1]
reads=0;assert(SurvivorNativeLoadout.Refresh()==false and reads==6)
local displaced=hero.inventory[1];hero.inventory[1]=nil
reads=0;assert(SurvivorNativeLoadout.Refresh()==true and reads==12 and displaced.removed and hero.inventory[1]~=displaced)
local inserted;local add=UnitAddItem;displaced=hero.inventory[1];hero.inventory[1]=nil
UnitAddItem=function(u,item)inserted=item;u.bag={item};return true end
assert(SurvivorNativeLoadout.Refresh()==true and displaced.removed and inserted.removed and hero.inventory[1]==nil)
UnitAddItem=add;assert(SurvivorNativeLoadout.Refresh()==true and hero.inventory[1])
SurvivorNativeLoadout.Cleanup()
`);

suite('engine regeneration preserves renewal values, pauses every lifecycle and never stacks Lua healing', mocks + String.raw`
function ALICE_CallPeriodic(fn)periodic=fn;return fn end
function ALICE_DisableCallback()periodic=nil end
function ALICE_Halt()halted=true end
function ALICE_Resume()halted=false end
-- Deliberately regenerate even on paused units: interactive inventory heroes
-- cannot rely on PauseUnit to freeze HP. The native field must actually be zero.
function AdvanceEngine(seconds)
    for _,u in ipairs(world)do
        if not u.removed and u.life>0 then
            u.life=math.min(u.maxLife,u.life+BlzGetUnitRealField(u,UNIT_RF_HIT_POINTS_REGENERATION_RATE)*seconds)
        end
    end
end
`, [config,metrics,augments,combat,'src/20_system/RunSession.lua','src/30_gameplay/SurvivorNativeLoadout.lua'], String.raw`
local hero,build=NewCombat('firebolt')
hero.life,hero.maxLife=100,600
local function Rate()return BlzGetUnitRealField(hero,UNIT_RF_HIT_POINTS_REGENERATION_RATE)end
local hpWrites=0;local write=SetWidgetLife
SetWidgetLife=function(...)hpWrites=hpWrites+1;return write(...)end
assert(SurvivorCombat.Regenerate==nil and Rate()==0,'Base regeneration is zero and only the engine owns periodic healing')
AdvanceEngine(10);assert(hero.life==100 and hpWrites==0,'Anya does not recover HP without regeneration bonuses')
SurvivorAugments.Apply('renewal',build,hero)
assert(Rate()==1 and hpWrites==0)
AdvanceEngine(5);assert(hero.life==105,'Renewal contributes once, not on top of another Lua heal')
local oldTitle,oldText=BlzGetAbilityTooltip('ASpc'),BlzGetAbilityExtendedTooltip('ASpc')
SurvivorNativeLoadout.Init(hero,build)
assert(BlzGetAbilityExtendedTooltip('ASpc'):find('초당 1.00',1,true))
local calls=abilityWrites
for _=1,20 do SurvivorNativeLoadout.Refresh()end
assert(abilityWrites==calls,'Unchanged regeneration tooltips do not rewrite the native interface')
assert(RunSession.Start(function()end,{pause=function(reason)SurvivorCombat.SetPaused(true,reason)end,
    resume=function()SurvivorCombat.SetPaused(false)end,finish=function()SurvivorNativeLoadout.Cleanup();SurvivorCombat.Cleanup()end}))
assert(RunSession.BeginChoice()and Rate()==0 and hero.paused)
SurvivorAugments.Apply('renewal',build,hero)
assert(build.stats.regeneration==2 and Rate()==0,'Learning renewal while choosing must not enable regeneration')
SurvivorNativeLoadout.Refresh()
assert(BlzGetAbilityExtendedTooltip('ASpc'):find('초당 2.00',1,true)
    and BlzGetAbilityExtendedTooltip('ASpc'):find('정지 중 0',1,true))
AdvanceEngine(60);assert(hero.life==105)
RunSession.SetInventoryOpen(true);RunSession.EndChoice()
assert(RunSession.GetState()=='INVENTORY'and not hero.paused and Rate()==0)
SurvivorAugments.SetEquipmentBonuses(build,{gear={all={maxLife=50,moveSpeed=10}}},hero)
assert(hero.life==105 and Rate()==0,'Equipment recalculation while paused must not heal or restart native regeneration')
AdvanceEngine(60);SurvivorCombat.MaintainInventoryPause();assert(hero.life==105)
RunSession.SetInventoryOpen(false);assert(RunSession.IsRunning()and Rate()==2)
AdvanceEngine(5);assert(hero.life==115)
RunSession.BeginStageClear();assert(Rate()==0)
AdvanceEngine(60);assert(hero.life==115,'Story and search preparation remain frozen')
RunSession.SetInventoryOpen(true)
SurvivorCombat.BeginStage(2,RunSession.GetElapsed())
SurvivorAugments.Apply('renewal',build,hero)
assert(build.stats.regeneration==3 and Rate()==0,'Stage changes and paused upgrades cannot bypass the pause gate')
RunSession.EndStageClear();assert(RunSession.GetState()=='INVENTORY'and Rate()==0)
RunSession.SetInventoryOpen(false);assert(Rate()==3)
hero.life=200;AdvanceEngine(.25);assert(hero.life==200.75)
hero.life=hero.maxLife-1;AdvanceEngine(30);assert(hero.life==hero.maxLife)
RunSession.Finish('test')
assert(hero.removed and Rate()==0 and BlzGetAbilityTooltip('ASpc')==oldTitle and BlzGetAbilityExtendedTooltip('ASpc')==oldText)
hero,build=NewCombat('firebolt');assert(Rate()==0,'Restart uses the fresh build with no base regeneration')
SurvivorCombat.Cleanup()
local partial=CreateUnit(0,'hero',0,0,0);build=SurvivorAugments.NewBuild('firebolt')
local native=BlzSetUnitRealField;BlzSetUnitRealField=function()return false end
local ok,message=pcall(SurvivorCombat.Init,partial,build.stats,{minX=-5000,maxX=5000,minY=-5000,maxY=5000})
BlzSetUnitRealField=native
assert(not ok and tostring(message):find('native hero regeneration'))
SurvivorCombat.Cleanup();assert(partial.removed,'A failed native setup still owns and removes the partially initialized hero')
`);

suite('native talents award five points, reconcile hidden abilities once and survive paused equipment transactions', mocks,
    [config,metrics,augments,combat,'src/30_gameplay/SurvivorNativeLoadout.lua'], String.raw`
local hero,build=NewCombat('firebolt');hero.maxLife,hero.life=600,250
for _,id in ipairs({'power','haste','reach','renewal','stride','vitality'})do SurvivorAugments.Apply(id,build,hero)end
hero.abilities.ATua=3
local talentWrites=0
for tier,entries in ipairs(SurvivorConfig.talents.tiers)do for _,entry in ipairs(entries)do
    abilityExtendedTooltips[entry.id]=entry.text..'|n|n'..tier..'단계 특성 · 셋 중 하나 선택 · 이번 수색 동안 유지'
end end
local writeTooltip=BlzSetAbilityExtendedTooltip
BlzSetAbilityExtendedTooltip=function(id,text,level)
    if id:match('^Ht[1-5][ABC]$')then talentWrites=talentWrites+1;assert(level==0)end
    return writeTooltip(id,text,level)
end
SurvivorNativeLoadout.Init(hero,build)
for _,entries in ipairs(SurvivorConfig.talents.tiers)do for _,entry in ipairs(entries)do
    assert(BlzGetAbilityExtendedTooltip(entry.id,0)==entry.text,'Initialization must replace a stale talent footer')
end end
assert(talentWrites==15,'Each talent cache is initialized exactly once per run')
assert(GetUnitAbilityLevel(hero,'HsTL')==1 and GetUnitAbilityLevel(hero,'ATua')==0)
local slots={};for i=1,6 do slots[i]=hero.inventory[i]end
local life,maximum,damage,regen=hero.life,hero.maxLife,build.stats.missileDamage,build.stats.regeneration
SurvivorCombat.SetPaused(true,'STAGE_CLEAR')
assert(SurvivorNativeLoadout.GrantStageTalent(1)and not SurvivorNativeLoadout.GrantStageTalent(1))
assert(hero.talentPoints==1 and select(1,SurvivorNativeLoadout.TalentStatus())==1)
for i=1,6 do assert(hero.inventory[i]==slots[i],'A native powerup must not displace a full classic inventory')end
-- The engine grants an ability, not an event callback we can invent for ATal.
hero.talentPoints=hero.talentPoints-1;UnitAddAbility(hero,'Ht1C')
assert(SurvivorNativeLoadout.Refresh()and hero.life==life and hero.maxLife==maximum+100)
assert(BlzGetUnitRealField(hero,UNIT_RF_HIT_POINTS_REGENERATION_RATE)==0)
local revision=build.revision
for _=1,100 do assert(not SurvivorNativeLoadout.Refresh())end
assert(build.revision==revision and hero.maxLife==maximum+100,'Repeated native polls must not stack a talent')
assert(talentWrites==15,'Refreshes must not append text or keep rewriting the native talent cache')
assert(SurvivorNativeLoadout.GrantStageTalent(2))
hero.talentPoints=hero.talentPoints-1;UnitAddAbility(hero,'Ht2B');SurvivorNativeLoadout.Refresh()
assert(build.talentTotals.all.rangePct==.12 and build.stats.regeneration==regen
    and BlzGetUnitRealField(hero,UNIT_RF_HIT_POINTS_REGENERATION_RATE)==0)
SurvivorAugments.SetEquipmentBonuses(build,{gear={all={maxLife=50,damagePct=.20}}},hero)
assert(hero.maxLife==maximum+150 and hero.life==life and build.stats.regeneration==regen)
local preview=SurvivorAugments.PreviewEquipment(build,{})
assert(preview.equipmentLife==build.stats.equipmentLife-50 and preview.regeneration==build.stats.regeneration,
    'Equipment comparisons must retain the current talent build')
for stage=3,5 do assert(SurvivorNativeLoadout.GrantStageTalent(stage))end
assert(hero.talentPoints==3 and not SurvivorNativeLoadout.GrantStageTalent(5))
for _,id in ipairs({'Ht3A','Ht4C','Ht5C'})do UnitAddAbility(hero,id);hero.talentPoints=hero.talentPoints-1 end
assert(SurvivorNativeLoadout.Refresh())
assert(select(1,SurvivorNativeLoadout.TalentStatus())==0 and select(2,SurvivorNativeLoadout.TalentStatus())==5)
assert(hero.maxLife==maximum+350 and hero.life==life and build.stats.regeneration==regen)
local before=build.stats.missileDamage
SurvivorAugments.SetEquipmentBonuses(build,{},hero)
assert(hero.maxLife==maximum+300 and build.stats.missileDamage<before and build.talentChoices[3]=='Ht3A')
SurvivorCombat.SetPaused(false)
assert(BlzGetUnitRealField(hero,UNIT_RF_HIT_POINTS_REGENERATION_RATE)==regen)
local ok=pcall(SurvivorNativeLoadout.GrantStageTalent,6);assert(not ok,'No sixth point beyond the five-stage run')
SurvivorNativeLoadout.Cleanup()
assert(GetUnitAbilityLevel(hero,'ATua')==3 and GetUnitAbilityLevel(hero,'HsTL')==0)
for _,tier in ipairs(SurvivorConfig.talents.tiers)do for _,entry in ipairs(tier)do assert(GetUnitAbilityLevel(hero,entry.id)==0)end end
SurvivorCombat.Cleanup()

hero,build=NewCombat('firebolt');SurvivorNativeLoadout.Init(hero,build)
assert(select(2,SurvivorNativeLoadout.TalentStatus())==0 and not build.talentChoices,'Restart has no previous talents or credits')
local add,attempts=UnitAddItem,0
UnitAddItem=function(u,item)if item.id=='ttal'then attempts=attempts+1;return false end;return add(u,item)end
SurvivorNativeLoadout.GrantStageTalent(1)
assert(attempts==1 and select(3,SurvivorNativeLoadout.TalentStatus())==1)
for _=1,10 do SurvivorNativeLoadout.Refresh()end
assert(attempts==1,'Rejected powerups must not spin on every refresh')
local nested=false
UnitAddItem=function(u,item)
    if item.id=='ttal'and not nested then nested=true;SurvivorNativeLoadout.Refresh()end
    return add(u,item)
end
for _=1,30 do SurvivorNativeLoadout.Refresh()end
assert(hero.talentPoints==1 and select(3,SurvivorNativeLoadout.TalentStatus())==0,
    'A later successful pickup and reentrant native callbacks grant exactly one point')
UnitAddItem=add
SurvivorNativeLoadout.Cleanup();SurvivorCombat.Cleanup()
`);

suite('talent damage, cooldown, size, range and duration share growth formulas without losing gear or previews', mocks,
    [config,metrics,augments], String.raw`
local hero=CreateUnit(0,'hero',0,0,0)
local build=SurvivorAugments.NewBuild('firebolt')
build.levels.chainlightning=1;build.levels.flamefield=1;build.levels.frostshard=1
SurvivorAugments.Recalculate(build,hero)
local base={damage=build.stats.missileDamage,interval=build.stats.missileInterval,size=build.stats.missileHitRadius,
    range=build.stats.missileRange,life=build.stats.missileLifetime,zone=build.stats.zoneDuration}
assert(SurvivorAugments.SetTalents(build,{[1]='Ht1A',[2]='Ht2A',[3]='Ht3B',[4]='Ht4B',[5]='Ht5B'},hero))
assert(math.abs(build.stats.missileDamage/base.damage-1.12)<.00001)
assert(math.abs(build.stats.missileInterval/base.interval-1/1.35)<.00001)
assert(math.abs(build.stats.missileHitRadius/base.size-1.12)<.00001)
assert(math.abs(build.stats.missileRange/base.range-1.15)<.00001)
local revision=build.revision
assert(not SurvivorAugments.SetTalents(build,build.talentChoices,hero)and build.revision==revision)
SurvivorAugments.SetTalents(build,{[4]='Ht4C'},hero)
assert(math.abs(build.stats.missileLifetime/base.life-1.15)<.00001
    and math.abs(build.stats.zoneDuration/base.zone-1.15)<.00001)
SurvivorAugments.SetTalents(build,{[2]='Ht2C',[4]='Ht4C'},hero)
assert(math.abs(build.stats.missileLifetime/base.life-1.27)<.00001)
SurvivorAugments.SetTalents(build,{[2]='Ht2A',[4]='Ht4A'},hero)
assert(math.abs(build.stats.missileHitRadius/base.size-1.30)<.00001)
assert(not pcall(SurvivorAugments.SetTalents,build,{[2]='Ht1A'},hero),'A talent cannot be assigned to another tier')
SurvivorAugments.SetEquipmentBonuses(build,{gear={all={damagePct=.1,speedPct=.1}}},hero)
SurvivorAugments.SetTalents(build,{[1]='Ht1A',[3]='Ht3A',[5]='Ht5A'},hero)
assert(math.abs(build.stats.missileDamage/base.damage-1.65)<.00001)
assert(math.abs(build.stats.missileInterval/base.interval-1/1.1)<.00001)
local preview=SurvivorAugments.PreviewEquipment(build,{})
assert(math.abs(preview.missileDamage/base.damage-1.55)<.00001)
`);

suite('all five boss transitions wait for cleanup and explicit story continuation', mocks + String.raw`
function ALICE_CallPeriodic(fn) periodic=fn;return fn end
function ALICE_DisableCallback() periodic=nil end
function ALICE_Halt() halted=true end
function ALICE_Resume() halted=false end
OnInit={final=function() end}
SurvivorEquipment={PrepareRest=function() restCalls=restCalls+1 end,RollBossReward=function() return {"reward"} end}
SurvivorInventoryPause={Cleanup=function() inventoryStops=inventoryStops+1 end}
SurvivorUI={UpdateDamageBoard=function() end,UpdateExpedition=function() end,
    ShowGearRewards=function() rewards=rewards+1 end}
SurvivorExpedition.EndStage=function() end
SurvivorStory={ShowInterlude=function(index,hero,callback)
    assert(not SurvivorCombat.IsClearing());story=callback;storyStage=index
end,ShowEnding=function(hero,callback)
    assert(not SurvivorCombat.IsClearing());story=callback;storyStage=5
end}
`, [config, metrics, augments, combat, 'src/20_system/RunSession.lua', 'src/00_bootstrap/HeroSurvivor.lua'], String.raw`
local step=Local(HeroSurvivor.BeginRun,"Step")
for stage=1,5 do
    local hero,build,units=NewCombat("orbitblade")
    story,storyStage,rewards,restCalls,inventoryStops=nil,nil,0,0,0
    SetLocal(step,"stage",stage);SetLocal(step,"stageTransition",false)
    SetLocal(step,"hero",hero);SetLocal(step,"build",build);SetLocal(step,"stats",build.stats)
    SetLocal(step,"selectedDifficulty","normal");SetLocal(step,"rerollsRemaining",0)
    SetLocal(SurvivorCombat.BossDefeated,"bossDefeated",true)
    for i=1,80 do EnemyAt(units,i,300,false) end
    local finished=false
    assert(RunSession.Start(step,{pause=function(reason) SurvivorCombat.SetPaused(true,reason) end,
        resume=function() SurvivorCombat.SetPaused(false) end,finish=function() finished=true end}))
    periodic();assert(RunSession.GetState()=="STAGE_CLEAR" and halted)
    assert(SurvivorCombat.IsClearing() and not story and restCalls==0)
    assert(not HeroSurvivor.NextStage(),"Next stage bypassed cleanup")
    local elapsed=RunSession.GetElapsed()
    for i=1,20 do TickTimers() end
    assert(story and storyStage==stage and RunSession.GetElapsed()==elapsed)
    assert(not finished and rewards==0,"Story continued without player input")
    assert(not HeroSurvivor.NextStage(),"Next stage bypassed story")
    story()
    if stage<5 then
        assert(rewards==1 and restCalls==1 and inventoryStops==0 and not finished)
        RunSession.Finish("test")
    else assert(finished and restCalls==0 and inventoryStops==1) end
    SurvivorCombat.Cleanup()
end
`);

suite('boss HUD reports live health and half-health state without separate monster popups', mocks,
    [config, metrics, augments, combat], String.raw`
local hero,build,units=NewCombat('orbitblade')
assert(SurvivorCombat.BossStatus()==nil,'No boss status before a boss exists')
local unit=EnemyAt(units,500,0,false)
units[unit].boss=true;units[unit].special={}
SetLocal(SurvivorCombat.BossStatus,'boss',unit)
local alerts={}
SurvivorUI.Alert=function(seconds,text,priority,key)alerts[#alerts+1]={text=text,priority=priority,key=key}end
for stage=1,5 do
    SetLocal(SurvivorCombat.BossStatus,'stage',stage)
    unit.life=unit.maxLife*.51
    local status=SurvivorCombat.BossStatus()
    assert(status.name==SurvivorConfig.encounters[stage].bossName and status.current==unit.life and status.max==unit.maxLife)
    assert(not status.enraged)
    unit.life=unit.maxLife*.5
    assert(SurvivorCombat.BossStatus().enraged==(stage==5),'Only the final boss has a half-health phase')
    for i=1,10 do SurvivorCombat.UpdateEnemies(i)end
end
assert(#alerts==0,'Monster patterns and half-health transitions must not open separate notices')
unit.life=0;assert(SurvivorCombat.BossStatus()==nil,'Defeated boss must disappear from the HUD')
SurvivorCombat.Cleanup();assert(SurvivorCombat.BossStatus()==nil)
`);

suite('elite traits and boss spawning retain their visible actors without instructional notices or cues', mocks + String.raw`
PATHING_TYPE_WALKABILITY,PLAYER_NEUTRAL_AGGRESSIVE='walk',12
function GetRandomInt(a,b)return a end
function GetRandomReal(a,b)return a end
function IsTerrainPathable()return false end
function BlzSetUnitName(unit,name)unit.name=name end
function BlzSetUnitBaseDamage(unit,value)unit.damage=value end
function BlzGetUnitAttackCooldown()return 1.5 end
function BlzSetUnitAttackCooldown(unit,value)unit.attackCooldown=value end
function SetUnitScale(unit,x)unit.scale=x end
function SetUnitVertexColor(unit,r,g,b)unit.color={r,g,b}end
function IssueTargetOrder(unit,order)unit.order=order end
function ALICE_AddIdentifier()end
function SetUnitCreepGuard()end
function RemoveGuardPosition()end
SurvivorStage.Get=function(index)return {ids={melee='sm0'..index,ranged='sr0'..index,flying='sf0'..index,boss='sb0'..index},
    color={180,220,185}}end
alerts,cues={},{ }
SurvivorUI.Alert=function(...)alerts[#alerts+1]={...}end
SurvivorUI.Cue=function(kind)cues[#cues+1]=kind end
`, [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('orbitblade')
for index,trait in ipairs({'tracker','guardian','plague'})do
    local ok,unit=SurvivorCombat.Spawn(true,'melee')
    assert(ok and units[unit].trait==trait and units[unit].cosmetic and unit.name:find('정예'),
        'Elite identity remains visible in the unit name and model effect')
end
assert(SurvivorCombat.SpawnBoss() and SurvivorCombat.BossStatus(),'Boss actor and essential health state still appear')
assert(#alerts==0 and #cues==0,'Monster spawning must not interrupt the screen with a panel or an alert sound')
SurvivorCombat.Cleanup()
for index,cap in ipairs({180,203,225,225,225})do
    hero,build,units=NewCombat('orbitblade')
    SetLocal(SurvivorCombat.Spawn,'stage',index)
    for count=1,cap-1 do assert(SurvivorCombat.Spawn(false,'melee'))end
    assert(not SurvivorCombat.Spawn(false,'melee'),'The enlarged regular wave still respects its stage cap')
    assert(SurvivorCombat.SpawnBoss(),'A full wave must leave one reserved slot for its boss')
    assert(SurvivorCombat.Counts()==cap and not SurvivorCombat.SpawnBoss(),'A single boss fills the reserved slot without exceeding the cap')
    SurvivorCombat.Cleanup()
end
`);

suite('risk investigations require explicit live acceptance and search deadlines use paused run time', mocks + String.raw`
function CreateTextTag()return {}end
function DestroyTextTag(tag)assert(not tag.destroyed);tag.destroyed=true end
function SetTextTagText(tag,text)tag.text=text end
for _,name in ipairs({'SetTextTagPos','SetTextTagColor','SetTextTagPermanent','PingMinimapEx'})do _G[name]=function()end end
SurvivorStage.FindPoint=function(angle,radius)return {x=math.cos(angle)*radius,y=math.sin(angle)*radius}end
SurvivorStage.LandmarkApproach=function()return {x=1000,y=0}end
SurvivorCombat={ReleaseCourier=function()end,GrantSearchRecovery=function()return '회복'end,
    SpawnCourier=function(points)return CreateUnit(12,'courier',points[1].x,points[1].y,0)end}
notifications={}
SurvivorUI.Notify=function(text)notifications[#notifications+1]=text end
`, [config,'src/30_gameplay/SurvivorExpedition.lua'], String.raw`
local hero=CreateUnit(0,'hero',0,0,0)
local rewards={}
local function Begin(index,start)
    now=start;state='RUNNING'
    SurvivorExpedition.BeginStage(hero,index,start,
        function(kind)rewards[#rewards+1]=kind end)
end
Begin(1,1000)
now=1030;SurvivorExpedition.Step(0.02,now)
local risk=Local(SurvivorExpedition.Step,'risk')
assert(risk.state=='offered' and SurvivorExpedition.RiskOffer()==nil)
assert(not SurvivorExpedition.AcceptRisk(),'A distant stale click cannot begin a challenge')
hero.x,hero.y=risk.x,risk.y
for i=1,100 do SurvivorExpedition.Step(.02,now)end
assert(risk.state=='offered' and not SurvivorExpedition.RiskActive(),'Standing near a marker never automatically accepts risk')
local offer=SurvivorExpedition.RiskOffer()
assert(offer and offer.seconds==30 and offer.remaining==60 and offer.text:find('25%%') and offer.text:find('35%%'))
local terms=SurvivorExpedition.Status();local lineCount=1
for _ in terms:gmatch('\n')do lineCount=lineCount+1 end
assert(terms:find('조사 수락') and terms:find('장소를 벗어나도') and lineCount==7,'Display every term before acceptance alongside the active search')
state='INVENTORY';assert(not SurvivorExpedition.RiskOffer() and not SurvivorExpedition.AcceptRisk(),'Acceptance is blocked while paused')
state='RUNNING';hero.life=0;assert(not SurvivorExpedition.AcceptRisk(),'A dead hero cannot accept risk');hero.life=100000
local marker,tag=risk.effect,risk.tag
assert(SurvivorExpedition.AcceptRisk() and marker.destroyed and tag.destroyed)
assert(SurvivorExpedition.RiskActive() and not SurvivorExpedition.RiskOffer() and not SurvivorExpedition.AcceptRisk())
hero.x,hero.y=0,0;now=1059.9;SurvivorExpedition.Step(.02,now);assert(#rewards==0)
state='INVENTORY';for i=1,100 do SurvivorExpedition.Step(.02,now)end;assert(#rewards==0)
state='RUNNING';now=1060;SurvivorExpedition.Step(.1,now);SurvivorExpedition.Step(.1,now)
assert(#rewards==1 and rewards[1]=='risk' and not SurvivorExpedition.RiskActive(),'Survival reward is granted once')

Begin(2,2000);hero.x,hero.y=0,0;now=2095;SurvivorExpedition.Step(.02,now)
risk=Local(SurvivorExpedition.Step,'risk');hero.x,hero.y=risk.x,risk.y
assert(SurvivorExpedition.RiskOffer());now=2150
assert(not SurvivorExpedition.AcceptRisk() and not SurvivorExpedition.RiskOffer(),'Expiry is rechecked even before the next Step')
hero.x,hero.y=0,0;now=2150
local count=#notifications;SurvivorExpedition.Step(.02,now)
assert(risk.state=='closed' and SurvivorExpedition.SearchRemaining()==30 and #notifications==count+1)
SurvivorExpedition.Step(.02,now);assert(#notifications==count+1,'Search deadline warning is announced once')
now=2180;SurvivorExpedition.Step(.02,now)
assert(SurvivorExpedition.SearchRemaining()==nil and not SurvivorExpedition.AcceptRisk(),'Boss arrival closes optional objectives')
SurvivorExpedition.Reset();assert(not SurvivorExpedition.HasRiskNotice() and SurvivorExpedition.Journal(2)=='')

-- Search and risk starts use their persistent objective display instead of duplicate popups.
notifications={};Begin(1,5000);hero.x,hero.y=0,0;now=5020;SurvivorExpedition.Step(.02,now)
assert(#notifications==0 and SurvivorExpedition.Status():find('선택 수색'))
local objective=Local(SurvivorExpedition.Step,'objective')
for i=1,#objective.points do
    hero.x,hero.y=objective.x,objective.y;SurvivorExpedition.Step(.02,now)
end
assert(#notifications==1 and notifications[1]:find('수색 완료') and not SurvivorExpedition.Status():find('수색'),
    'One short completion notice replaces the persistent completed objective')
local count=#notifications;assert(SurvivorExpedition.UseAdvantage(1))
assert(#notifications==count and not SurvivorExpedition.UseAdvantage(1),'Using an insight never opens a monster explanation popup')
now=5030;SurvivorExpedition.Step(.02,now)
assert(#notifications==count and not SurvivorExpedition.Status(true):find('선택 수색'),
    'Risk offer terms can be shown alone during dialogue without a duplicate start popup')
SurvivorExpedition.Reset()

-- Killing the courier speaks its own line before the reply; the scene reply never repeats the subtitle.
local speech={};SurvivorUI.Say=function(speaker,text)speech[#speech+1]=text end
Begin(4,6000);hero.x,hero.y=0,0;now=6020;SurvivorExpedition.Step(.02,now)
objective=Local(SurvivorExpedition.Step,'objective')
assert(objective.courier and SurvivorExpedition.GetSceneReply(4)==nil,'No scene reply before the search is complete')
SurvivorExpedition.OnKill(objective.courier,false)
assert(#speech==2 and speech[1]:find('지원 요청') and speech[2]==SurvivorExpedition.GetReply(4),'Courier line precedes the reply')
assert(SurvivorExpedition.GetSceneReply(4) and SurvivorExpedition.GetSceneReply(4)~=SurvivorExpedition.GetReply(4))
SurvivorExpedition.Reset()
for index=1,5 do
    speech={};Begin(index,7000+index*1000);hero.x,hero.y=0,0
    local opens=Local(SurvivorExpedition.RiskOffer,'RiskWindow')()
    now=7000+index*1000+opens;SurvivorExpedition.Step(.02,now)
    risk=Local(SurvivorExpedition.Step,'risk');hero.x,hero.y=risk.x,risk.y
    assert(SurvivorExpedition.AcceptRisk() and speech[#speech] and speech[#speech]~='','Every stage has its own risk line')
    if index>1 then assert(speech[#speech]~=previousRiskLine)end
    previousRiskLine=speech[#speech]
    SurvivorExpedition.Reset()
end
for index,window in ipairs({{30,90},{90,150},{95,180},{95,180},{95,180}})do
    Begin(index,7000);hero.x,hero.y=0,0
    now=7000+window[1]-.02;SurvivorExpedition.Step(.02,now)
    risk=Local(SurvivorExpedition.Step,'risk');assert(risk.state=='waiting')
    now=7000+window[1];SurvivorExpedition.Step(.02,now)
    hero.x,hero.y=risk.x,risk.y;assert(SurvivorExpedition.RiskOffer())
    now=7000+window[2]-.02
    assert(SurvivorExpedition.AcceptRisk(),'Every stage offers a usable acceptance window')
    local before=#rewards
    now=now+29.98;SurvivorExpedition.Step(.02,now);assert(#rewards==before)
    now=7000+window[2]-.02+30;SurvivorExpedition.Step(.02,now)
    assert(#rewards==before+1 and risk.state=='complete','Even a late acceptance finishes before boss arrival')
    now=7000+SurvivorConfig.StageTiming(index).bossStart;SurvivorExpedition.Step(.02,now)
    assert(SurvivorExpedition.SearchRemaining()==nil)
end
SurvivorExpedition.Reset()
`);

suite('overlapping pause reasons never advance run time', mocks + String.raw`
function ALICE_CallPeriodic(fn) periodic=fn;return fn end
function ALICE_DisableCallback() periodic=nil end
function ALICE_Halt() halted=true end
function ALICE_Resume() halted=false end
`, [metrics, 'src/20_system/RunSession.lua'], String.raw`
local steps=0
assert(RunSession.Start(function() steps=steps+1 end,{pause=function() end,resume=function() end,finish=function() end}))
periodic();local elapsed=RunSession.GetElapsed()
assert(RunSession.BeginChoice());assert(halted)
RunSession.SetInventoryOpen(true);periodic();assert(RunSession.GetElapsed()==elapsed and steps==1)
assert(RunSession.EndChoice());assert(RunSession.GetState()=="INVENTORY" and halted)
RunSession.SetInventoryOpen(false);assert(RunSession.IsRunning() and not halted)
periodic();assert(steps==2)
assert(RunSession.BeginStageClear());RunSession.SetInventoryOpen(true)
assert(RunSession.EndStageClear());assert(RunSession.GetState()=="INVENTORY")
RunSession.Finish("test");assert(RunSession.GetState()=="FINISHED" and not halted and periodic==nil)
`);

suite('a callback left behind by failed teardown cannot advance a subsequent run', mocks + String.raw`
function ALICE_CallPeriodic(fn) periodic=fn;return fn end
function ALICE_DisableCallback()error('injected disable failure')end
function ALICE_Halt()halted=true end
function ALICE_Resume()halted=false end
`, [metrics,'src/20_system/RunSession.lua'], String.raw`
local steps=0;local lifecycle={pause=function()end,resume=function()end,finish=function()end}
assert(RunSession.Start(function()steps=steps+1 end,lifecycle))
local stale=periodic;stale();assert(steps==1)
assert(RunSession.BeginChoice());assert(RunSession.Finish('test') and not halted)
assert(RunSession.Start(function()steps=steps+1 end,lifecycle))
local elapsed=RunSession.GetElapsed();stale()
assert(steps==1 and RunSession.GetElapsed()==elapsed,'An orphaned callback must not advance a new session')
periodic();assert(steps==2 and RunSession.GetElapsed()>elapsed)
RunSession.Finish('test')
`);

suite('finish attempts every subsystem cleanup and reports original and cleanup failures', mocks + String.raw`
OnInit={final=function()end}
function ALICE_CallPeriodic(fn) periodic=fn;return fn end
function ALICE_DisableCallback() periodic=nil end
function ALICE_Halt() halted=true end
function ALICE_Resume() halted=false;resumes=resumes+1 end
function GetLocalPlayer()return 0 end
function ResetToGameCamera()Mark('camera')end
function Mark(label)
    attempts[label]=(attempts[label]or 0)+1
    if failAt==label then error('injected '..label..' failure')end
end
SurvivorUI={HidePanel=function()Mark('panel')end,ShowResult=function(reason)Mark('result');shownReason=reason end}
SurvivorStory={Cleanup=function()Mark('story')end}
SurvivorInventoryPause={Cleanup=function()Mark('inventory')end}
SurvivorNativeLoadout={Cleanup=function()Mark('loadout')end}
SurvivorEquipment={Cleanup=function()Mark('equipment')end}
SurvivorCombat={DamageReport=function()Mark('report');return ''end,Cleanup=function()Mark('combat')end}
SurvivorStage={Cleanup=function()Mark('stage')end}
SurvivorExpedition={EndStage=function()Mark('expedition')end}
messages={};print=function(message)messages[#messages+1]=tostring(message)end
`, [config,metrics,'src/20_system/RunSession.lua','src/00_bootstrap/HeroSurvivor.lua'], String.raw`
local finish=Local(HeroSurvivor.BeginRun,'Finish')
SetLocal(finish,'RefreshDamageBoard',function()Mark('board')end)
SetLocal(finish,'ResultDetails',function()Mark('details');return {}end)
for _,label in ipairs({'expedition','board','details','report','panel','story','inventory','camera','loadout','equipment','combat','stage','result'})do
    attempts,resumes,shownReason,failAt,messages={},0,nil,label,{}
    SetLocal(finish,'hero',CreateUnit(0,'hero',0,0,0));SetLocal(finish,'build',{})
    local levelTrigger=CreateTrigger();SetLocal(finish,'levelTrigger',levelTrigger)
    assert(RunSession.Start(function()end,{pause=function()end,resume=function()end,finish=finish}))
    assert(RunSession.BeginChoice() and halted)
    RunSession.Fail('original failure')
    for _,cleanup in ipairs({'panel','story','inventory','camera','loadout','equipment','combat','stage','result'})do
        assert(attempts[cleanup]==1,'Earlier '..label..' failure skipped '..cleanup)
    end
    assert(levelTrigger.destroyed and Local(finish,'hero')==nil and Local(finish,'build')==nil)
    assert(RunSession.GetState()=='FINISHED' and periodic==nil and not halted and resumes==1)
    local log=table.concat(messages,'\n')
    assert(log:find('original failure') and log:find('injected '..label..' failure'),'Preserve both original and cleanup errors')
    assert(not RunSession.Finish('again') and resumes==1,'Repeated finish never cleans or resumes twice')
    if label~='result' then assert(shownReason=='error')end
end
`);

suite('actual run startup releases partially initialized heroes and retains a valid retry setup', mocks + String.raw`
OnInit={final=function()end}
function GetLocalPlayer()return 0 end
function ResetToGameCamera()end
bj_mapInitialPlayableArea={minX=-5000,minY=-5000,maxX=5000,maxY=5000}
function GetRectMinX(rect)return rect.minX end
function GetRectMaxX(rect)return rect.maxX end
function GetRectMinY(rect)return rect.minY end
function GetRectMaxY(rect)return rect.maxY end
function IsTerrainPathable()return false end
function BlzSetHeroProperName()if failName then error('injected hero name failure')end end
SurvivorUI={HidePanel=function()end,BeginRun=function()end,ShowResult=function(reason)resultReason=reason end}
SurvivorStory={Reset=function()end,Cleanup=function()storyCleaned=true end}
SurvivorInventoryPause={Cleanup=function()inventoryCleaned=true end}
SurvivorNativeLoadout={Cleanup=function()loadoutCleaned=true end}
SurvivorEquipment={Cleanup=function()equipmentCleaned=true end}
SurvivorStage={Init=function()end,Apply=function()end,Cleanup=function()stageCleaned=true end}
SurvivorExpedition={Reset=function()end,EndStage=function()end}
`, [config,metrics,augments,combat,'src/20_system/RunSession.lua','src/00_bootstrap/HeroSurvivor.lua'], String.raw`
SetLocal(HeroSurvivor.BeginRun,'initialized',true)
SetLocal(HeroSurvivor.BeginRun,'setupPhase','MENU')
SetLocal(HeroSurvivor.BeginRun,'selectedDifficulty','normal')
SetLocal(HeroSurvivor.BeginRun,'selectedWeapon','firebolt')
SetLocal(HeroSurvivor.BeginRun,'selectedTrinket','power')
local createGroup=CreateGroup
CreateGroup=function()error('injected group initialization failure')end
assert(not HeroSurvivor.BeginRun())
CreateGroup=createGroup
assert(RunSession.GetState()=='FINISHED' and resultReason=='error')
assert(world[#world].removed and Local(SurvivorCombat.Init,'hero')==nil and Local(SurvivorCombat.Init,'heightLocation')==nil)
assert(storyCleaned and inventoryCleaned and loadoutCleaned and equipmentCleaned and stageCleaned)
assert(HeroSurvivor.CanRetrySame(),'Partial initialization must not consume the selected setup')
failName=true;assert(not HeroSurvivor.RetrySame())
assert(world[#world].removed and Local(SurvivorCombat.Init,'hero')==nil and Local(SurvivorCombat.Init,'queryGroup')==nil,
    'A native name failure after unit creation must release the owned hero')
for _,trigger in ipairs(triggers)do assert(trigger.destroyed)end
assert(HeroSurvivor.CanRetrySame() and resultReason=='error')
`);

for (const missingFrame of ['nil', '0', '{handle=0}']) {
    suite('native inventory observer retries lazy frames and protects sync generations: ' + missingFrame, mocks + String.raw`
function ALICE_CallPeriodic(fn) periodic=fn;return fn end
function ALICE_DisableCallback() periodic=nil end
function ALICE_Halt() halted=true end
function ALICE_Resume() halted=false end
function GetLocalPlayer() return 0 end
function GetTriggerPlayer() return 0 end
available,openPanel,acceptSync,queries=false,false,true,0
sent,reconciles,restCollections,refreshes={},0,0,0
local panel={handle=900,visible=false}
local detailsPanel={handle=901,visible=false}
function BlzGetFrameByName(name)
    queries=queries+1
    if available and(name=='SimpleStatDetailsPanel'or name=='SimpleTalentsPanel')then return detailsPanel end
    if available then panel.visible=openPanel;return panel end
    return MISSING_FRAME
end
function BlzFrameIsVisible(frame)
    assert(type(frame)=='table' and frame.handle~=0,'Never pass a missing native frame to visibility queries')
    if frame==detailsPanel then return false end
    return openPanel
end
function BlzSendSyncData(prefix,data)
    sent[#sent+1]={prefix=prefix,data=data,accepted=acceptSync}
    return acceptSync
end
function BlzTriggerRegisterPlayerSyncEvent(trigger,player,prefix) trigger.prefix=prefix end
function BlzGetTriggerSyncData() return syncData end
SurvivorCombat={MaintainInventoryPause=function()end,IsClearing=function()return false end}
SurvivorEquipment={Reconcile=function()reconciles=reconciles+1 end,CollectRest=function()restCollections=restCollections+1 end}
SurvivorNativeLoadout={Refresh=function()refreshes=refreshes+1 end}
SurvivorUI={SetRestInventoryVisible=function(value)restVisible=value end}
SurvivorLootUI={Init=function()end,Reset=function()end,SetInventoryVisible=function(value)lootVisible=value end}
`.replace('MISSING_FRAME', missingFrame), [config, metrics, 'src/20_system/RunSession.lua',
        'src/30_gameplay/SurvivorInventoryPause.lua'], String.raw`
assert(RunSession.Start(function()end,{pause=function()end,resume=function()end,finish=function()end}))
SurvivorInventoryPause.Init()
local oldTimer=timers[#timers].callback;local oldSync=triggers[#triggers].action
TickTimers();assert(queries==4 and #sent==0 and not lootVisible)
available,openPanel,acceptSync=true,true,false
TickTimers();assert(queries==8 and #sent==1 and not sent[1].accepted and RunSession.IsRunning())
acceptSync=true;TickTimers();assert(#sent==2 and sent[2].accepted,'Retry a failed sync transmission')
syncData=sent[2].data;oldSync()
assert(RunSession.GetState()=='INVENTORY' and halted and lootVisible and restVisible)
local before=reconciles;syncData=sent[1].data;oldSync();oldSync()
assert(reconciles==before,'Ignore duplicate and out-of-order inventory sync messages')
local frozen=RunSession.GetElapsed();periodic();assert(RunSession.GetElapsed()==frozen)
openPanel=false;TickTimers();syncData=sent[#sent].data;oldSync()
assert(RunSession.IsRunning() and not halted)
assert(RunSession.BeginChoice());openPanel=true;TickTimers();syncData=sent[#sent].data;oldSync()
assert(RunSession.GetState()=='CHOOSING' and halted)
assert(RunSession.EndChoice() and RunSession.GetState()=='INVENTORY','Closing a choice keeps an open inventory paused')
openPanel=false;TickTimers();syncData=sent[#sent].data;oldSync();assert(RunSession.IsRunning())
assert(RunSession.BeginStageClear());openPanel=true;TickTimers();syncData=sent[#sent].data;oldSync()
assert(restCollections>0 and RunSession.GetState()=='STAGE_CLEAR')
assert(RunSession.EndStageClear() and RunSession.GetState()=='INVENTORY')
local staleData=sent[#sent].data
SurvivorInventoryPause.Cleanup();RunSession.Finish('test')
assert(RunSession.Start(function()end,{pause=function()end,resume=function()end,finish=function()end}))
openPanel=false;SurvivorInventoryPause.Init()
local newSync=triggers[#triggers].action;local calls=reconciles;local sends=#sent
oldTimer();syncData=staleData;oldSync();newSync()
assert(reconciles==calls and #sent==sends and RunSession.IsRunning(),'Stale timers and previous-run sync cannot affect the new run')
syncData='bad data';newSync();assert(RunSession.IsRunning())
openPanel=true;TickTimers();syncData=sent[#sent].data;newSync()
assert(RunSession.GetState()=='INVENTORY','A new generation still observes its own native inventory')
SurvivorInventoryPause.Cleanup();RunSession.Finish('test')
`);
}

suite('native details and bag tabs share one pause while preserving choice and stage-clear reasons', mocks + String.raw`
panels,sent={},{}
function GetLocalPlayer()return 0 end
function GetTriggerPlayer()return 0 end
function BlzGetFrameByName(name)return panels[name]end
function BlzFrameIsVisible(frame)return frame.visible end
function BlzFrameSetVisible()error('Native panel visibility belongs to the engine')end
function BlzSendSyncData(prefix,data)sent[#sent+1]=data;return true end
function BlzGetTriggerSyncData()return syncData end
function BlzTriggerRegisterPlayerSyncEvent()end
function ALICE_CallPeriodic(fn)periodic=fn;return fn end
function ALICE_DisableCallback()end
function ALICE_Halt()halted=true end
function ALICE_Resume()halted=false end
SurvivorCombat={MaintainInventoryPause=function()end,IsClearing=function()return false end}
SurvivorEquipment={Reconcile=function()return false,1 end,CollectRest=function()return false,1 end,UIRevision=function()return 1 end}
SurvivorNativeLoadout={Refresh=function()end}
SurvivorUI={SetRestInventoryVisible=function(value)restVisible=value end,InterruptCombatPreparation=function()interruptions=(interruptions or 0)+1 end}
SurvivorLootUI={Init=function()end,Reset=function()end,
    SetInventoryVisible=function(open,revision,details)bagVisible,detailsVisible=open,details end}
`, [config,metrics,'src/20_system/RunSession.lua','src/30_gameplay/SurvivorInventoryPause.lua'], String.raw`
local resumes=0
RunSession.Start(function()end,{pause=function()end,resume=function()resumes=resumes+1 end,finish=function()end})
SurvivorInventoryPause.Init()
local sync=triggers[#triggers].action
local function Observe()
    TickTimers()
    if #sent>0 then syncData=sent[#sent];sync()end
end
Observe();assert(RunSession.IsRunning()) -- Missing frames must be retried.
panels.SimpleStatDetailsPanel={handle=900,visible=true}
Observe();assert(RunSession.GetState()=='INVENTORY'and halted and restVisible and detailsVisible and not bagVisible)
local elapsed=RunSession.GetElapsed();periodic();assert(RunSession.GetElapsed()==elapsed)
panels.SimpleEquipmentInventoryPanel={handle=901,visible=true}
Observe();assert(detailsVisible and not bagVisible and resumes==0,'Details suppress loot even when native bag is also visible')
panels.SimpleStatDetailsPanel.visible=false
Observe();assert(bagVisible and not detailsVisible and resumes==0,'Changing native tabs must not resume combat')
panels.SimpleEquipmentInventoryPanel.visible=false
Observe();assert(RunSession.IsRunning()and resumes==1 and not restVisible)
assert(RunSession.BeginChoice())
panels.SimpleTalentsPanel={handle=902,visible=true};Observe()
assert(RunSession.GetState()=='CHOOSING'and detailsVisible)
panels.SimpleTalentsPanel.visible=false;Observe()
assert(RunSession.GetState()=='CHOOSING'and halted,'Closing details cannot dismiss a level-up choice')
panels.SimpleStatDetailsPanel.visible=true;Observe()
RunSession.EndChoice();assert(RunSession.GetState()=='INVENTORY')
panels.SimpleStatDetailsPanel.visible=false;Observe();assert(RunSession.IsRunning())
RunSession.BeginStageClear();panels.SimpleStatDetailsPanel.visible=true;Observe()
assert(RunSession.GetState()=='STAGE_CLEAR')
RunSession.EndStageClear();assert(RunSession.GetState()=='INVENTORY')
panels.SimpleStatDetailsPanel.visible=false;Observe();assert(RunSession.IsRunning())
assert(interruptions==4,'Only synchronized opens interrupt a pending preparation')
local oldTick=timers[#timers].callback
SurvivorInventoryPause.Cleanup();RunSession.Finish('test')
panels.SimpleStatDetailsPanel.visible=true;oldTick();sync()
assert(RunSession.GetState()=='FINISHED','Stale detail callbacks cannot pause a subsequent run')
`);

for (const clockFixture of [
    ['missing', 'nil'], ['throwing', 'function()error("clock failure")end'],
    ['text', 'function()return "bad clock"end'], ['NaN', 'function()return 0/0 end'],
    ['infinity', 'function()return math.huge end'],
    ['failure on end', '(function()local calls=0;return function()calls=calls+1;if calls==1 then return 1 end;error("later clock failure")end end)()'],
]) {
    suite('optional metrics tolerate ' + clockFixture[0] + ' CPU clocks without affecting gameplay', mocks + String.raw`
os.clock=CLOCK_FIXTURE
function ALICE_SetResumeObserver(before,after)observerBefore,observerAfter=before,after end
function ALICE_CallPeriodic(fn)periodic=fn;return fn end
function ALICE_DisableCallback()periodic=nil end
function ALICE_Halt()halted=true end
function ALICE_Resume()halted=false end
`.replace('CLOCK_FIXTURE', clockFixture[1]), [metrics,'src/20_system/RunSession.lua'], String.raw`
SurvivorMetrics.Enable(true)
assert(type(observerBefore)=='function' and type(observerAfter)=='function')
SurvivorMetrics.Count('fixture.count',3)
local started=SurvivorMetrics.Begin();SurvivorMetrics.End('fixture.time',started)
local token=observerBefore(5);observerAfter(token,5,7)
local counters=Local(SurvivorMetrics.Report,'counters')
assert(counters['fixture.count']==3 and counters['resume.cycles']==1 and counters['resume.removedPairs']==7)
local steps=0
assert(RunSession.Start(function()steps=steps+1 end,{pause=function()end,resume=function()end,finish=function()end}))
periodic();assert(steps==1 and RunSession.GetElapsed()>0)
assert(RunSession.BeginChoice());local elapsed=RunSession.GetElapsed();periodic();assert(RunSession.GetElapsed()==elapsed)
assert(RunSession.EndChoice());periodic();assert(steps==2)
SurvivorMetrics.Report();SurvivorMetrics.Enable(false)
assert(observerBefore==nil and observerAfter==nil)
SurvivorMetrics.Count('fixture.count',50);assert(counters['fixture.count']==3)
RunSession.Finish('test')
`);
}

suite('actual ALICE resume measures its first cycle and deferred actor/pair removals only when enabled', mocks + String.raw`
ALICE_Config=nil
OnInit={final=function()end}
for _,name in ipairs({'HERO','STRUCTURE','MECHANICAL','UNDEAD','TAUREN','ANCIENT','SAPPER','PEON','FLYING','GIANT','SUMMONED','TOWNHALL'})do
    _G['UNIT_TYPE_'..name]=name
end
`, ['src/05_vendor/ALICE.lua',metrics], String.raw`
local main=Local(ALICE_Resume,'Main')
SetLocal(main,'CYCLE_LENGTH',16);SetLocal(main,'MAX_STEPS',16)
local counts,pairsAtStep,checkedAtStep={},{},{}
for i=1,16 do counts[i]=0;pairsAtStep[i]={};checkedAtStep[i]={}end
SetLocal(main,'numPairs',counts);SetLocal(main,'numCellChecks',counts)
SetLocal(main,'whichPairs',pairsAtStep);SetLocal(main,'cellCheckedActors',checkedAtStep)
local master=CreateTimer();Local(ALICE_Resume,'timers').MASTER=master
local released,destroyed=0,0
SetLocal(main,'Release',function(actor)released=released+1 end)
SetLocal(main,'DestroyPair',function(pair)destroyed=destroyed+1;pair.actor.lastPair=pair.actor.firstPair end)
local backlog=Local(main,'destroyedActors')
local actor={firstPair={}};actor.lastPair={actor=actor};backlog[#backlog+1]=actor
SurvivorMetrics.Enable(true);ALICE_Halt(false);ALICE_Resume()
assert(master.running and master.callback==main)
main()
local counters=Local(SurvivorMetrics.Report,'counters')
assert(released==1 and destroyed==1 and #backlog==0)
assert(counters['resume.cycles']==1 and counters['resume.backlogActors']==1)
assert(counters['resume.removedActors']==1 and counters['resume.removedPairs']==1)
main();assert(counters['resume.cycles']==1,'Normal cycles do not count as resumed cycles')
ALICE_Halt(false);ALICE_Resume();main();assert(counters['resume.cycles']==2)
SurvivorMetrics.Enable(false);ALICE_Halt(false);ALICE_Resume();main();assert(counters['resume.cycles']==2)
local before=released
actor={firstPair={}};actor.lastPair={actor=actor};backlog[#backlog+1]=actor
ALICE_SetResumeObserver(function()error('observer failure')end,function()error('observer failure')end)
ALICE_Halt(false);ALICE_Resume();main()
assert(released==before+1 and #backlog==0 and master.running,'Broken optional observers cannot stop the ALICE cycle')
local observed=0
ALICE_SetResumeObserver(function()return 123 end,function(token)assert(token==123);observed=observed+1;error('after observer failure')end)
ALICE_Halt(false);ALICE_Resume();local tick=ALICE_Tick
assert(pcall(main) and ALICE_Tick==tick+1 and observed==1)
assert(pcall(main) and observed==1,'A throwing observer after one resume is not repeated on normal cycles')
ALICE_SetResumeObserver(nil,nil)
local object={destroy=function(self)self.cleaned=true;error('native effect teardown failure')end}
local sentinel={};local pair={};local registered={isActor=true,isGlobal=true,isAnonymous=true,
    firstPair=sentinel,lastPair=pair,nextPair={[sentinel]=pair},references={[object]=true}}
pair.actor=registered
local actorOf=Local(ALICE_Destroy,'actorOf');actorOf[object]=registered
assert(not pcall(ALICE_Kill,object) and actorOf[object]==registered,'A throwing host destructor interrupts the vendor Kill/Clear sequence')
ALICE_Destroy(object)
assert(actorOf[object]==nil and registered.alreadyDestroyed and pair.destructionQueued and #backlog==1,
    'The fallback must use actual vendor actor destruction to detach registry and queue pairs')
before=released;local pairsBefore=destroyed
ALICE_Halt(false);ALICE_Resume();main()
assert(released==before+1 and destroyed==pairsBefore+1 and #backlog==0)
`);

suite('actual ALICE schedules visual expiration with interval bounds, fractional lifetime, pause and restart', mocks + String.raw`
ALICE_Config=nil
OnInit={final=function(_,initializer)aliceFixtureInitializer=initializer end}
for _,name in ipairs({'HERO','STRUCTURE','MECHANICAL','UNDEAD','TAUREN','ANCIENT','SAPPER','PEON','FLYING','GIANT','SUMMONED','TOWNHALL'})do
    _G['UNIT_TYPE_'..name]=name
end
`, ['src/05_vendor/ALICE.lua',config,metrics,augments,combat], String.raw`
-- Install the table pool allocator normally set by vendor Init; keep real scheduling.
local unusedTables=Local(aliceFixtureInitializer,'unusedTables')
SetLocal(ALICE_CallDelayed,'GetTable',function()
    local n=#unusedTables;if n==0 then return {} end
    local t=unusedTables[n];unusedTables[n]=nil;return t
end)
SetLocal(ALICE_DrainDestroyed,'ReturnTable',function(t)
    for k in next,t do t[k]=nil end
    unusedTables[#unusedTables+1]=t;setmetatable(t,nil)
end)
local main=Local(ALICE_Resume,'Main');SetLocal(main,'CYCLE_LENGTH',17);SetLocal(main,'MAX_STEPS',16);ALICE_Config.MAX_INTERVAL=.32
local pc,cc,s,c={},{},{},{};for i=0,17 do pc[i]=0;cc[i]=0;s[i]={};c[i]={}end
SetLocal(main,'numPairs',pc);SetLocal(main,'numCellChecks',cc);SetLocal(main,'whichPairs',s);SetLocal(main,'cellCheckedActors',c)
Local(ALICE_Resume,'timers').MASTER=CreateTimer()
local acquire=Local(ALICE_Create,'GetUnusedActor');local makePair=Local(ALICE_Create,'CreatePair')
local registry=Local(ALICE_Destroy,'actorOf');local serial=0
local function actor(host)
    local a=acquire();serial=serial+1;a.unique=serial;host=host or {x=0,y=0,z=0}
    a.host,a.anchor,a.originalAnchor=host,host,host;a.x,a.y,a.z={},{},{}
    a.isGlobal,a.isAnonymous=true,true;a.alreadyDestroyed=nil;a.references[host]=true;registry[host]=a;return a
end
local selfActor=actor();SetLocal(makePair,'SELF_INTERACTION_ACTOR',selfActor)
local hero,build,units=NewCombat('firebolt');local create=Local(SurvivorCombat.CastExtra,'CreateObject')
local lifetime=Local(SurvivorCombat.CastExtra,'ZoneLifetime');local originalCreate=ALICE_Create
local function effect(life)
    local e={identifier='hsSnow',x=0,y=0,z=0,life=life,isAnonymous=true,selfInteractions=lifetime}
    ALICE_Create=function()end;create(e,SurvivorConfig.slashModel,1);ALICE_Create=originalCreate
    local a=actor(e);local calls=0;local wrapped=function(o)calls=calls+1;return lifetime(o)end
    a.selfInteractions[wrapped]=makePair(a,selfActor,wrapped);return e,function()return calls end
end
local e,calls=effect(.4)
for i=1,19 do main();assert(not e.cleaned)end;main();assert(e.cleaned and calls()==3);main()
local fractional,count=effect(.22)
for i=1,11 do main();assert(not fractional.cleaned)end;main();assert(fractional.cleaned and count()==2);main()
local paused,count=effect(.4);main();assert(count()==1)
ALICE_Halt(false);local tick=ALICE_Tick;assert(not Local(ALICE_Resume,'timers').MASTER.running)
for i=1,10 do assert(ALICE_Tick==tick and not paused.cleaned)end
ALICE_Resume();for i=1,18 do main();assert(not paused.cleaned)end;main();assert(paused.cleaned and count()==3);main()
-- A callback can halt a cycle after ALICE_Tick advances but before scheduled pairs run.
local cut,cutCalls=effect(.4);main()
local counter=Local(main,'cycle').counter;local oldTick=ALICE_Tick
ALICE_CallDelayed(function()state='CHOOSING';ALICE_Halt(false)end,.02);main()
assert(ALICE_Tick==oldTick+1 and Local(main,'cycle').counter==counter and cutCalls()==1 and not cut.cleaned)
state='RUNNING';ALICE_Resume();for i=1,18 do main();assert(not cut.cleaned)end
main();assert(cut.cleaned and cutCalls()==3);main()
local late,count=effect(.4);main();ALICE_Halt(false);SurvivorCombat.Cleanup();assert(late.cleaned and count()==1)
hero,build,units=NewCombat('firebolt');ALICE_Resume();for i=1,30 do main()end;assert(count()==1 and not hero.removed)
SurvivorCombat.Cleanup()
`);

suite('actual ALICE paused drain unlinks scheduled, paused and every-step pairs within budget before recycling', mocks + String.raw`
ALICE_Config=nil
OnInit={final=function()end}
for _,name in ipairs({'HERO','STRUCTURE','MECHANICAL','UNDEAD','TAUREN','ANCIENT','SAPPER','PEON','FLYING','GIANT','SUMMONED','TOWNHALL'})do
    _G['UNIT_TYPE_'..name]=name
end
`, ['src/05_vendor/ALICE.lua',config,metrics,augments,combat], String.raw`
local main=Local(ALICE_Resume,'Main')
SetLocal(main,'CYCLE_LENGTH',16);SetLocal(main,'MAX_STEPS',16)
local pairCounts,cellCounts,scheduled,checked={},{},{},{}
for i=0,16 do pairCounts[i]=0;cellCounts[i]=0;scheduled[i]={};checked[i]={}end
SetLocal(main,'numPairs',pairCounts);SetLocal(main,'numCellChecks',cellCounts)
SetLocal(main,'whichPairs',scheduled);SetLocal(main,'cellCheckedActors',checked)
local master=CreateTimer();Local(ALICE_Resume,'timers').MASTER=master
local acquire=Local(ALICE_Create,'GetUnusedActor');local createPair=Local(ALICE_Create,'CreatePair')
local registry=Local(ALICE_Destroy,'actorOf');local pairList=Local(createPair,'pairList')
local recycledActors=Local(ALICE_DrainDestroyed,'unusedActors');local recycledPairs=Local(createPair,'unusedPairs')
local fixtureUnique=1000
local function actor(object)
    local actor=acquire();object=object or {x=0,y=0,z=0}
    fixtureUnique=fixtureUnique+1;actor.unique=fixtureUnique
    actor.host,actor.anchor,actor.originalAnchor=object,object,object
    actor.x,actor.y,actor.z={},{},{};actor.isGlobal,actor.isAnonymous=true,true
    actor.alreadyDestroyed=nil;actor.references[object]=true;registry[object]=actor
    return actor
end
local selfActor=actor();SetLocal(createPair,'SELF_INTERACTION_ACTOR',selfActor)
local doomed,live,second,queuedFromCallback=actor(),actor(),actor(),actor()
local normal=function()return .1 end;local every=function()end;local paused=function()return .5 end
Local(createPair,'functionIsEveryStep')[every]=true
Local(createPair,'functionPauseOnStationary')[paused]=true;second.isStationary=true
local normalPair=createPair(doomed,live,normal)
local sharedPair=createPair(doomed,second,normal)
local everyPair=createPair(doomed,selfActor,every);doomed.selfInteractions[every]=everyPair
local pausedScheduled=createPair(second,actor(),normal)
Local(ALICE_PairPause,'PausePair')(pausedScheduled)
local pausedPair=createPair(second,live,paused)
assert(pausedPair[0x6]==nil and pausedScheduled[0x5]==0 and pausedScheduled[0x6]==1)
local enqueue=Local(ALICE_PairPause,'AddDelayedCallback');local staleActorCalls,liveCallbacks=0,0
enqueue(Local(ALICE_DrainDestroyed,'DestroyPair'),normalPair)
enqueue(function()staleActorCalls=staleActorCalls+1 end,doomed)
enqueue(function()liveCallbacks=liveCallbacks+1 end,live)
local onDestroy=Local(ALICE_DrainDestroyed,'functionOnDestroy');local callbacks=0
onDestroy[paused]=function()
    callbacks=callbacks+1
    assert(not pcall(ALICE_DrainDestroyed,1),'Pair teardown cannot recursively drain')
    ALICE_Destroy(queuedFromCallback.host)
end
ALICE_Destroy(doomed.host);ALICE_Destroy(second.host)
local backlog=Local(ALICE_DrainDestroyed,'destroyedActors')
assert(#backlog==2 and normalPair.destructionQueued and sharedPair.destructionQueued and everyPair.destructionQueued)
assert(not pcall(ALICE_DrainDestroyed,1),'Running ALICE must reject a paused drain')
ALICE_Halt(false)
for _,invalid in ipairs({0,-1,1.5,math.huge})do assert(not pcall(ALICE_DrainDestroyed,invalid))end
local tick,counter=ALICE_Tick,Local(main,'cycle').counter
local work,actorWork,pairWork,left=ALICE_DrainDestroyed(1)
assert(work==1 and actorWork==0 and pairWork==1 and left==3 and callbacks==1)
assert(#recycledActors==0 and second.host and second.lastPair==pausedScheduled,'A partly unlinked actor must not be recycled')
assert(scheduled[0][1]==pausedScheduled and live.nextPair[pausedPair]==nil)
local totalActors,totalPairs=actorWork,pairWork
while #backlog>0 do
    work,actorWork,pairWork,left=ALICE_DrainDestroyed(2)
    assert(work<=2 and work==actorWork+pairWork and left==#backlog)
    totalActors,totalPairs=totalActors+actorWork,totalPairs+pairWork
    assert(ALICE_Tick==tick and Local(main,'cycle').counter==counter,'A native drain must never advance gameplay or ALICE time')
end
assert(totalActors==3 and totalPairs==5 and #recycledActors==3 and #recycledPairs==5)
assert(scheduled[0][1]==Local(main,'DUMMY_PAIR'),'A previously scheduled paused pair clears its step-zero slot')
assert(live.lastPair==live.firstPair and selfActor.lastPair==selfActor.firstPair and next(pairList[live])==nil)
assert(doomed.host==nil and second.host==nil and queuedFromCallback.host==nil)
assert(Local(main,'numEveryStepPairs')==0 and Local(main,'lastEveryStepPair')==Local(main,'DUMMY_PAIR'))
for i=1,pairCounts[1]do assert(scheduled[1][i]==Local(main,'DUMMY_PAIR'),'Variable-step schedule entries remain safe tombstones')end
local replacement=actor();local replacementHost=replacement.host
assert(replacement==doomed,'The actual vendor actor pool is reused before resume')
local replacementPair=createPair(live,replacement,normal)
assert(replacementPair==normalPair,'The actual vendor pair pool is reused before resume')
SurvivorMetrics.Enable(true);ALICE_Resume();main()
local counters=Local(SurvivorMetrics.Report,'counters')
assert(counters['resume.backlogActors']==0 and counters['resume.removedPairs']==0 and counters['resume.removedActors']==0)
assert(ALICE_Tick==tick+1 and master.running)
assert(staleActorCalls==0 and liveCallbacks==1 and replacement.host==replacementHost and not replacementPair.destructionQueued
    and pairList[live][replacement]==replacementPair,'Old deferred calls cannot destroy or update recycled live actors and pairs')

-- Drive the actual combat timer through real vendor Kill, DestroyPair and Release.
local vendorCreate=ALICE_Create;ALICE_Create=function()end
local hero,build,units=NewCombat('orbitblade');SurvivorCombat.CastBlades()
ALICE_Create=vendorCreate
local objects=Local(SurvivorCombat.Counts,'objects');local callbacksBefore=callbacks
for object in pairs(objects)do
    local registered=actor(object)
    for i=1,5 do createPair(registered,actor(),normal)end
end
SurvivorConfig.battlefieldAliceCleanupBudget=1
state='STAGE_CLEAR';ALICE_Halt(false);local finished=0
SurvivorCombat.ClearBattlefieldAsync(function()finished=finished+1;assert(#backlog==0)end)
local ticks=0;tick=ALICE_Tick
while SurvivorCombat.IsClearing()do
    local before=counters['cleanup.aliceWork'] or 0
    TickTimers();ticks=ticks+1
    assert((counters['cleanup.aliceWork']or 0)-before<=1 and ALICE_Tick==tick and now==0)
    assert(ticks<30)
    if #backlog>0 then assert(finished==0,'Completion must wait for ALICE pair removal, not just visible handles')end
end
assert(finished==1 and ticks>10 and callbacks==callbacksBefore)
local stale=timers[#timers].callback;stale();assert(finished==1)
ALICE_Resume();main();assert(counters['resume.backlogActors']==0)
SurvivorCombat.Cleanup()

-- Cancellation leaves the vendor queue owned by ALICE; an old timer cannot touch a new run.
hero,build,units=NewCombat('orbitblade');ALICE_Create=function()end;SurvivorCombat.CastBlades();ALICE_Create=vendorCreate
for object in pairs(Local(SurvivorCombat.Counts,'objects'))do
    local registered=actor(object);for i=1,4 do createPair(registered,actor(),normal)end
end
state='STAGE_CLEAR';ALICE_Halt(false);SurvivorCombat.ClearBattlefieldAsync(function()error('cancelled completion')end)
stale=timers[#timers].callback;TickTimers();assert(#backlog>0)
SurvivorCombat.Cleanup();hero,build,units=NewCombat('firebolt');stale()
assert(not SurvivorCombat.IsClearing() and not hero.removed)
ALICE_Resume();main();assert(#backlog==0,'The next normal cycle can finish a cancelled partial drain')
SurvivorCombat.Cleanup();SurvivorMetrics.Enable(false)
`);

const gearMocks = mocks + String.raw`
EVENT_PLAYER_UNIT_EQUIP_ITEM,EVENT_PLAYER_UNIT_UNEQUIP_ITEM="equip","unequip"
EVENT_PLAYER_UNIT_PICKUP_ITEM,EVENT_PLAYER_UNIT_DROP_ITEM="pickup","drop"
function UnitEquipItem() end
function UnitUnequipItem() end
function ConvertLoadoutSlot(i) return i end
function UnitItemInEquipmentSlot(u,i) return u.equipped[i+1] end
bagReads,gearTooltipWrites=0,0
function UnitItemInBagSlot(u,i) bagReads=bagReads+1;local item=u.bag[i+1];return item and not item.removed and item or nil end
function UnitExtendedInventorySize(u) return u.capacity end
function UnitHasItemBagged(u,item)
    for i=0,u.capacity-1 do if UnitItemInBagSlot(u,i)==item then return true end end;return false
end
function UnitHasItemEquipped(u,item)
    for i=1,9 do if u.equipped[i]==item then return true end end;return false
end
function TriggerRegisterPlayerUnitEvent(t,p,event) t.events=t.events or {};t.events[event]=true end
function GetTriggerUnit() return eventUnit end
function GetManipulatedItem() return eventItem end
function GetTriggerEventId() return eventKind end
function FireItemEvent(u,item,kind)
    eventUnit,eventItem,eventKind=u,item,kind
    for _,t in ipairs(triggers) do if not t.destroyed and t.events and t.events[kind] then t.action() end end
end
function UnitAddItem(u,item)
    if rejectPickup then return false end
    if rejectAfterEvent then FireItemEvent(u,item,"pickup");return false end
    for i=1,u.capacity do
        if not UnitItemInBagSlot(u,i-1) then
            FireItemEvent(u,item,"pickup") -- Native events may precede the slot update.
            u.bag[i]=item;return true
        end
    end
    return false
end
function GetItemX(item) return item.x end
function GetItemY(item) return item.y end
function SetItemPosition(item,x,y) item.x,item.y=x,y end
function DisplayTimedTextToPlayer(...) lastMessage=select(5,...) end
function BlzSetItemExtendedTooltip(item,text) gearTooltipWrites=gearTooltipWrites+1;item.tooltip=text end
rarityRoll=100
function GetRandomInt(a,b) if b==100 then return rarityRoll end;return a end
function GetRandomReal(a,b) return b end
function NewGear(weapon,capacity)
    local hero=CreateUnit(0,"hero",0,0,0);hero.bag,hero.equipped,hero.capacity={},{},capacity or 6
    local build=SurvivorAugments.NewBuild(weapon or "firebolt")
    SurvivorEquipment.Init(hero,build)
    return hero,build
end
function CatalogIndex(id)
    for i,entry in ipairs(SurvivorEquipment.Catalog())do if entry.id==id then return i end end
    error("Missing item "..id)
end
`;
const equipment = 'src/20_system/SurvivorEquipment.lua';
suite('equipment and native trinkets omit redundant text while preserving stats and cleanup mechanics', gearMocks + String.raw`
function SetPlayerState()error('Equipment must not change player currency')end
function AdjustPlayerStateBJ()error('Equipment must not award sale income')end
function SetItemPawnable(item,value)item.pawnable=value end
function BlzSetItemDescription(item,text)item.description=text end
local gearAdd=UnitAddItem
function UnitAddItem(u,item)
    if item.id:sub(1,3)=='HsT' then
        for i=1,6 do if not u.inventory[i]or u.inventory[i].removed then u.inventory[i]=item;return true end end
        return false
    end
    return gearAdd(u,item)
end
`, [config,metrics,augments,equipment,'src/30_gameplay/SurvivorNativeLoadout.lua'], String.raw`
assert(SurvivorEquipment.SellPrice==nil,'Remove the unused sale-price API')
local hero,build=NewGear('firebolt',6)
for _,entry in ipairs(SurvivorEquipment.Catalog())do
    local description=SurvivorEquipment.Describe(entry.id,{})
    assert(not description:find('골드')and not description:find('판매'),entry.id..' retains a price')
    assert(description:find(entry.description,1,true),'Retain the actual equipment stats')
    for _,text in ipairs({'가방 정리 시 장비가 삭제됩니다.','자동 공격 스킬을 새로 부여하지 않습니다.',
        '보유 중인 해당 무기에만 적용','기본 능력치는 각각 적용','세트 효과의 추가 피해는',
        '확장 인벤토리에서 장착 시 적용'})do assert(not description:find(text,1,true))end
end
SurvivorCombat={EscapeStatus=function()return true,0 end,WardStatus=function()return 0,0 end}
SurvivorAugments.Apply('power',build,hero);SurvivorNativeLoadout.Init(hero,build)
local indicator=hero.inventory[1]
assert(indicator and indicator.pawnable==false and indicator.charges==1)
for _,id in ipairs(SurvivorConfig.startingTrinkets)do
    local text=SurvivorAugments.OwnedTooltip(id,build)
    assert(not text:find('자동 적용',1,true)and not text:find('레벨업 선택으로 강화',1,true))
end
for _,text in ipairs({'레벨업 장신구','버리기 불가','숫자는 강화 레벨','자동 적용','레벨업 선택으로 강화'})do
    assert(not indicator.description:find(text,1,true))
end
assert(not indicator.description:find('판매')and not indicator.description:find('골드'))
SurvivorEquipment.DropAt(0,0,1)
local item;for candidate in pairs(Local(SurvivorEquipment.Step,'owned'))do item=candidate end
assert(item and item.tooltip and not item.tooltip:find('판매')and not item.tooltip:find('골드'))
hero.bag[1]=item;SurvivorEquipment.Reconcile()
state='INVENTORY';local preview=SurvivorEquipment.PreviewCleanup('common')
assert(#preview.items==1 and SurvivorEquipment.ConfirmCleanup(preview)==1 and item.removed,
    'Bag cleanup still deletes gear without producing currency')
SurvivorNativeLoadout.Cleanup();SurvivorEquipment.Cleanup()
`);
suite('paused bag observation reuses reconciled revisions and invalidates only after native loadout transactions', gearMocks + String.raw`
local gearAdd=UnitAddItem
function UnitAddItem(u,item)
    if item.id:sub(1,3)=='HsT' then
        if rejectIndicator then return false end
        for i=1,6 do if not u.inventory[i] or u.inventory[i].removed then u.inventory[i]=item;return true end end
        return false
    end
    return gearAdd(u,item)
end
localPlayer,renderCalls=0,0
function GetLocalPlayer()return localPlayer end
function BlzGetFrameByName()return nil end
function BlzFrameIsVisible()return false end
function BlzTriggerRegisterPlayerSyncEvent()end
function BlzSendSyncData()return true end
SurvivorCombat={MaintainInventoryPause=function()end,IsClearing=function()return false end,
    EscapeStatus=function()return true,0 end,WardStatus=function()return 0,0 end}
SurvivorUI.SetRestInventoryVisible=function()end
SurvivorLootUI={Init=function()end,Reset=function()end,
    SetInventoryVisible=function(open,revision)renderCalls=renderCalls+1;renderedRevision=revision end}
`, [config,metrics,augments,equipment,'src/30_gameplay/SurvivorNativeLoadout.lua','src/30_gameplay/SurvivorInventoryPause.lua'], String.raw`
local hero,build=NewGear('firebolt',6)
SurvivorAugments.Apply('power',build,hero);SurvivorNativeLoadout.Init(hero,build)
SurvivorInventoryPause.Init();state='INVENTORY'
bagReads=0;TickTimers();assert(bagReads==6)
local indicator=hero.inventory[1];hero.inventory[1]=nil;hero.bag[1]=indicator
bagReads=0;TickTimers();assert(indicator.removed and hero.inventory[1]~=indicator and bagReads==12)
local revision=renderedRevision
bagReads=0;TickTimers();assert(bagReads==6 and renderedRevision==revision)
localPlayer=1;local renders=renderCalls;bagReads=0;TickTimers();assert(bagReads==6 and renderCalls==renders)
localPlayer=0;state='CHOOSING';hero.paused=true
indicator=hero.inventory[1];hero.inventory[1]=nil;hero.bag[1]=indicator
bagReads=0;TickTimers();assert(bagReads==6 and not indicator.removed and not hero.inventory[1])
state='INVENTORY';hero.paused=false;rejectIndicator=true
bagReads=0;TickTimers();assert(bagReads==12 and indicator.removed and not hero.inventory[1] and build.levels.power==1)
rejectIndicator=false;bagReads=0;TickTimers();assert(bagReads==12 and hero.inventory[1])
state='STAGE_CLEAR';bagReads=0;TickTimers();assert(bagReads==6)
for i=1,6 do hero.bag[i]=CreateItem('Hs01',0,0)end
assert(SurvivorEquipment.ClaimReward('Hs08'))
bagReads=0;TickTimers();assert(bagReads==6 and SurvivorEquipment.PendingRewardCount()==1)
local pending;for item,record in pairs(Local(SurvivorEquipment.Step,'owned'))do if record.pendingReward then pending=item end end
revision=renderedRevision;RemoveItem(pending);bagReads=0;TickTimers()
assert(bagReads==6 and renderedRevision>revision and SurvivorEquipment.PendingRewardCount()==0)
SurvivorInventoryPause.Cleanup();SurvivorNativeLoadout.Cleanup();SurvivorEquipment.Cleanup()
`);

suite('chosen rewards survive expiry/cap/transition and collect before ordinary loot', gearMocks,
    [config, metrics, augments, equipment], String.raw`
local hero,build=NewGear("firebolt",1)
hero.bag[1]=CreateItem("Hs15",0,0)
assert(SurvivorEquipment.ClaimReward("Hs04"))
local owned=Local(SurvivorEquipment.Step,"owned");local reward
for item,record in pairs(owned)do if record.pendingReward then reward=item end end
assert(reward and SurvivorEquipment.PendingRewardCount()==1)
assert(reward.tooltip:find("수령 보상") and lastMessage:find("자동 소멸 없음"))
local ordinary=SurvivorEquipment.DropAt(0,0,CatalogIndex("Hs01"))
now=61;SurvivorEquipment.Step(now)
assert(not reward.removed and ordinary.removed,"Expiry must remove only the ordinary drop")
SurvivorConfig.equipmentGroundLimit=2
ordinary=SurvivorEquipment.DropAt(0,0,CatalogIndex("Hs01"))
SurvivorEquipment.DropAt(0,0,CatalogIndex("Hs02"))
SurvivorEquipment.DropAt(0,0,CatalogIndex("Hs14"))
assert(not reward.removed and SurvivorEquipment.PendingRewardCount()==1)
local ground=0
for item,record in pairs(owned) do if not item.removed and not record.pendingReward then ground=ground+1 end end
assert(ground==2,"Protected rewards must not consume ordinary drop capacity")
SurvivorEquipment.ClearGround();assert(not reward.removed)
hero.x,hero.y=600,800;SurvivorEquipment.CarryGroundToStage()
assert(reward.x==600 and reward.y==800 and SurvivorEquipment.PendingRewardCount()==1)
now=1000;SurvivorEquipment.Step(now);assert(not reward.removed)
-- Even with auto-pick OFF, explicitly chosen rewards take the available slot first.
for i=1,3 do SurvivorEquipment.CyclePickup() end
assert(SurvivorEquipment.PickupMode()=="끔")
hero.bag[1]=nil
ordinary=SurvivorEquipment.DropAt(600,800,CatalogIndex("Hs01"))
SurvivorEquipment.PrepareRest()
assert(hero.bag[1]==reward and not ordinary.removed and SurvivorEquipment.PendingRewardCount()==0)
assert(not reward.tooltip:find("미수령 보상"))
-- Dropping a received reward deliberately restores ordinary expiration/no-auto-pick.
FireItemEvent(hero,reward,"drop");hero.bag[1]=nil
SurvivorEquipment.Step(now);assert(not reward.removed and hero.bag[1]==nil)
now=1061;SurvivorEquipment.Step(now);assert(reward.removed)
SurvivorEquipment.Cleanup()

hero,build=NewGear("frostshard",1)
rejectPickup=true
assert(SurvivorEquipment.ClaimReward("Hs08","봉인 조사 보상"))
assert(SurvivorEquipment.PendingRewardCount()==1,"Rejected native insertion must retain protection")
now=2000;SurvivorEquipment.Step(now);assert(SurvivorEquipment.PendingRewardCount()==1)
rejectPickup=false;SurvivorEquipment.CollectRest()
assert(SurvivorEquipment.PendingRewardCount()==0 and hero.bag[1].id=="Hs08")
SurvivorEquipment.ClaimReward("Hi04") -- Now full again; a second pending reward.
local pending
for item,record in pairs(Local(SurvivorEquipment.Step,"owned"))do if record.pendingReward then pending=item end end
assert(pending and SurvivorEquipment.PendingRewardCount()==1)
SurvivorEquipment.Cleanup();assert(pending.removed and SurvivorEquipment.PendingRewardCount()==0)
`);

suite('equipment effect revisions, individual tooltips and bounded pickup inventory scans', gearMocks,
    [config, metrics, augments, equipment], String.raw`
local function CheckEquipmentText(text)
    for _,removed in ipairs({'가방 정리 시 장비가 삭제됩니다.','자동 공격 스킬을 새로 부여하지 않습니다.',
        '보유 중인 해당 무기에만 적용','기본 능력치는 각각 적용','세트 효과의 추가 피해는 세트 효과를 다시 일으키지 않음',
        '확장 인벤토리에서 장착 시 적용','동일 이름은 1개로 계산 · 세트 추가 공격은 재발동하지 않음',
        '해당 무기 보유 시 적용','(장착 시 회복 없음)','(단독 기준)','레벨업으로 얻는 인장과 별도의 장비입니다.'})do
        assert(not text:find(removed,1,true),'Runtime equipment tooltip restored removed help: '..removed)
    end
end
local writeExtended,writeDescription=BlzSetItemExtendedTooltip,BlzSetItemDescription
BlzSetItemExtendedTooltip=function(item,text)CheckEquipmentText(text);return writeExtended(item,text)end
BlzSetItemDescription=function(item,text)CheckEquipmentText(text);item.description=text;return writeDescription(item,text)end
local hero,build=NewGear("firebolt",6)
local revision=build.revision
local item=CreateItem("Hs01",0,0);item.tooltip='가방 정리 시 장비가 삭제됩니다.';hero.bag[1]=item
SurvivorEquipment.Reconcile()
assert(item.description==item.tooltip and item.tooltip:find('모든 무기 피해 +5%',1,true),
    'An editor-provided item with stale text must receive the clean current description')
assert(build.revision==revision,'External bag acquisition must not recalculate weapons')
local ui=SurvivorEquipment.UIRevision();local writes=gearTooltipWrites
assert(SurvivorEquipment.ToggleLock(item))
assert(item.tooltip:find('[보관 잠금]',1,true),'Keep the live lock status')
assert(build.revision==revision and gearTooltipWrites==writes+1 and SurvivorEquipment.UIRevision()>ui,
    'Locking changes only the selected tooltip and UI revision')
writes=gearTooltipWrites
for i=1,20 do SurvivorEquipment.Reconcile() end
assert(gearTooltipWrites==writes and build.revision==revision,'Unchanged gear may not repeat tooltip setters or recalculation')
local list,count,capacity=SurvivorEquipment.BagEntries()
assert(#list==1 and count==1 and capacity==6 and list[1].locked)
hero.equipped[1]=item;hero.bag[1]=nil;SurvivorEquipment.Reconcile()
assert(build.revision==revision+1)
revision=build.revision
hero.equipped[1],hero.equipped[2]=nil,item;SurvivorEquipment.Reconcile()
assert(build.revision==revision,'Changing source slot without changing effective bonuses may not recalculate')
writes=gearTooltipWrites
hero.equipped[2]=CreateItem("Hs01",0,0);SurvivorEquipment.Reconcile()
assert(build.revision==revision and gearTooltipWrites==writes+1,
    'An externally equipped identical item still needs its own tooltip')
assert(SurvivorAugments.SetEquipmentBonuses(build,{a={all={damagePct=0.1}},b={all={damagePct=0.2}}},hero))
revision=build.revision
assert(not SurvivorAugments.SetEquipmentBonuses(build,{c={all={damagePct=0.3}}},hero) and build.revision==revision)
SurvivorEquipment.Cleanup()

hero=CreateUnit(0,"hero",0,0,0);hero.bag,hero.equipped,hero.capacity={},{},1
build=SurvivorAugments.NewBuild("firebolt","vitality")
local maximum=hero.maxLife;revision=build.revision
SurvivorEquipment.Init(hero,build)
assert(build.revision==revision and hero.maxLife==maximum+build.stats.equipmentLife,
    'Initial hero stats apply even when the initial equipment snapshot is empty')
SurvivorEquipment.Cleanup()

hero,build=NewGear("firebolt",6)
SurvivorConfig.equipmentGroundLimit=100
for i=1,40 do SurvivorEquipment.DropAt(0,0,CatalogIndex("Hs01")) end
rejectPickup=true;bagReads=0
SurvivorEquipment.Step(now)
assert(bagReads==hero.capacity,'Rejected candidates must share one inventory scan per pickup cycle')
rejectPickup=false;SurvivorEquipment.ClearGround()
for i=1,3 do SurvivorEquipment.DropAt(0,0,CatalogIndex("He05")) end
for i=1,3 do SurvivorEquipment.DropAt(0,0,CatalogIndex("Hs01")) end
local dropped=SurvivorEquipment.DropAt(0,0,CatalogIndex("Hs02"))
FireItemEvent(hero,dropped,"drop")
SurvivorEquipment.Step(now)
local rings,ordinary=0,0
for i=1,hero.capacity do
    local held=hero.bag[i]
    if held then rings=rings+(held.id=="He05" and 1 or 0);ordinary=ordinary+(held.id=="Hs01" and 1 or 0) end
end
assert(rings==2 and ordinary==1 and not UnitHasItemBagged(hero,dropped),
    'Successful pickups update shared duplicate counts and respect deliberate drops')
SurvivorEquipment.Cleanup()

hero,build=NewGear("frostshard",1)
rejectAfterEvent=true
assert(SurvivorEquipment.ClaimReward("Hs08"))
assert(SurvivorEquipment.PendingRewardCount()==1 and hero.bag[1]==nil,
    'A pickup event followed by failed insertion must preserve the selected reward')
rejectAfterEvent=false
SurvivorEquipment.CollectRest()
assert(hero.bag[1] and SurvivorEquipment.PendingRewardCount()==0 and not hero.bag[1].tooltip:find('미수령 보상'))
assert(SurvivorEquipment.ClaimReward("Hi04"))
local pending
for item,record in pairs(Local(SurvivorEquipment.Step,'owned')) do if record.pendingReward then pending=item end end
ui=SurvivorEquipment.UIRevision();RemoveItem(assert(pending))
assert(SurvivorEquipment.UIRevision()>ui and SurvivorEquipment.PendingRewardCount()==0,
    'External removal of a pending reward must invalidate a paused inventory display')
SurvivorEquipment.Cleanup()
`);

suite('boss recommendations preserve rarity/random cards and prioritize useful missing gear', gearMocks,
    [config, metrics, augments, equipment], String.raw`
local hero,build=NewGear("firebolt",6)
hero.equipped[1]=CreateItem("Hs04",0,0);SurvivorEquipment.Reconcile()
local revision,stats,life=build.revision,build.stats,hero.life
local offers=SurvivorEquipment.RollBossReward()
local first=SurvivorEquipment.Get(offers[1])
assert(first.set=="ember" and first.id~="Hs04" and first.rarity=="rare","Complete the existing 1/2 set first")
assert(#offers==3 and offers[1]~=offers[2] and offers[1]~=offers[3] and offers[2]~=offers[3])
assert(build.revision==revision and build.stats==stats and hero.life==life,"Recommendation must be a pure preview")
hero.bag[1]=CreateItem(first.id,0,0)
offers=SurvivorEquipment.RollBossReward()
assert(offers[1]~=first.id,"Prefer a useful missing piece over a copy already in the bag")
for i=2,hero.capacity do hero.bag[i]=CreateItem("Hs15",0,0) end
assert(SurvivorEquipment.ClaimReward(offers[1]))
local pendingId=offers[1]
offers=SurvivorEquipment.RollBossReward()
assert(offers[1]~=pendingId,"Pending chosen rewards also count as owned")
SurvivorEquipment.Cleanup()

-- Existing active sets should not be broken by the preferred replacement.
hero,build=NewGear("firebolt",6)
hero.equipped[1],hero.equipped[2]=CreateItem("Hs04",0,0),CreateItem("Hs03",0,0)
SurvivorEquipment.Reconcile()
offers=SurvivorEquipment.RollBossReward();first=SurvivorEquipment.Get(offers[1])
assert(first.slot~="Head" and first.slot~="Chest","Do not recommend breaking the active two-piece set")
SurvivorEquipment.Cleanup()

-- Exercise every weapon, both rarity outcomes and several stage profiles.
for _,weapon in ipairs({"firebolt","flamefield","chainlightning","orbitblade","monsoon","frontslash",
    "frostshard","frostnova","blizzard","meteor","thunderorb","returnblade"}) do
    hero,build=NewGear(weapon,6)
    for _,stage in ipairs({1,3,5}) do
        SurvivorEquipment.SetStage(stage)
        for _,roll in ipairs({1,100}) do
            rarityRoll=roll;offers=SurvivorEquipment.RollBossReward()
            assert(#offers==3 and offers[1]~=offers[2] and offers[1]~=offers[3] and offers[2]~=offers[3])
            assert(SurvivorEquipment.FitsBuild(offers[1]))
            for _,id in ipairs(offers) do assert(SurvivorEquipment.Get(id).rarity==(roll==1 and "epic" or "rare")) end
        end
    end
    SurvivorEquipment.Cleanup()
end
-- No useful/new candidates left: still provide three valid distinct choices.
hero,build=NewGear("firebolt",100)
for i,entry in ipairs(SurvivorEquipment.Catalog()) do hero.bag[i]=CreateItem(entry.id,0,0) end
offers=SurvivorEquipment.RollBossReward();assert(#offers==3 and offers[1]~=offers[2] and offers[2]~=offers[3])
SurvivorEquipment.Cleanup()
`);

suite('identical rings stack base stats but count once for set thresholds', gearMocks,
    [config, metrics, augments, equipment], String.raw`
local hero,build=NewGear("firebolt",6)
hero.equipped[1],hero.equipped[2]=CreateItem("He05",0,0),CreateItem("He05",0,0)
SurvivorEquipment.Reconcile()
assert(math.abs(build.stats.missileDamage-SurvivorConfig.missileDamage*1.20)<0.0001)
local sources,equipped=Local(SurvivorEquipment.Reconcile,"Sources")(Local(SurvivorEquipment.Reconcile,"ReadSlots")())
assert(sources["set:ember:2"]==nil,"Two identical rings must not activate a two-piece set")
local text=SurvivorEquipment.Describe("He05",equipped)
assert(text:find("1/9") and not text:find("기본 능력치는 각각 적용") and not text:find("동일 장비의 세트 개수는 1개"))
hero.equipped[3]=CreateItem("Hs04",0,0);SurvivorEquipment.Reconcile()
assert(math.abs(build.stats.missileDamage-SurvivorConfig.missileDamage*1.35)<0.0001)
SurvivorEquipment.Cleanup()
`);


const presentationMocks = mocks + String.raw`
frames,selectedUnit,selectionClears = {},nil,0
-- Known native String fields differ from their parent Frame/SimpleFrame containers.
-- The two Texture children are explicit fixture primitives, not classifications of the cover or world surfaces.
nativeFrameKinds={InventoryText='STRING',SimpleNameValue='STRING',NativePortraitHP='STRING',NativePortraitMana='STRING',
    NativeInventoryIconTexture='TEXTURE',NativePortraitIconTexture='TEXTURE'}
-- These containers are deliberately outside our compatibility policy; their concrete native types are not inferred.
engineOwnedFrames={SimpleInventoryCover=true,NativeWorldFrame=true,NativeWorldBars=true}
-- These panels/buttons are rebound by the engine to the selected unit. They are
-- ordinary frame handles, but forcing them visible can expose missing unit data.
selectionManagedFrames={SimpleInfoPanelUnitDetail=true,SimpleHeroLevelBar=true,SimpleProgressIndicator=true,
    SimpleBuildTimeIndicator=true,NativeBuffBar=true}
for _,entry in ipairs({{'SimpleInfoPanelIconDamage',''},{'SimpleInfoPanelIconDamage','1'},
    {'SimpleInfoPanelIconArmor','2'},{'SimpleInfoPanelIconRank','3'},{'SimpleInfoPanelIconFood','4'},
    {'SimpleInfoPanelIconGold','5'},{'SimpleInfoPanelIconHero','6'},{'SimpleInfoPanelIconAlly','7'}})do
    selectionManagedFrames[entry[1]..entry[2]]=true
end
for index=0,11 do selectionManagedFrames['NativeCommandButton'..index]=true end
for index=0,5 do selectionManagedFrames['NativeItemButton'..index]=true end
unsupportedStringNatives={BlzFrameIsVisible=true,BlzFrameSetVisible=true,BlzFrameSetAlpha=true,
    BlzFrameSetLevel=true,BlzFrameSetEnable=true,BlzFrameSetScale=true,BlzFrameSetParent=true,BlzDestroyFrame=true}
unsafeFrameCalls={}
function RequireFrameObject(frame,native)
    assert(frame,'Missing frame for '..native)
    if engineOwnedFrames[frame.name]then
        unsafeFrameCalls[#unsafeFrameCalls+1]={native=native,frame=frame}
        error(native..' must not inspect or write engine-owned '..frame.name)
    end
    if selectionManagedFrames[frame.name]and(native=='BlzFrameIsVisible'or native=='BlzFrameSetVisible')then
        unsafeFrameCalls[#unsafeFrameCalls+1]={native=native,frame=frame}
        error(native..' must leave selected-unit panel '..frame.name..' to the engine')
    end
    local incompatible=frame.nativeKind=='STRING'and unsupportedStringNatives[native]
        or frame.nativeKind=='TEXTURE'and(native=='BlzFrameIsVisible'or native=='BlzFrameSetVisible')
    if incompatible then
        unsafeFrameCalls[#unsafeFrameCalls+1]={native=native,frame=frame}
        error(native..' cannot operate on native '..frame.nativeKind..' '..frame.name)
    end
end
PLAYER_NEUTRAL_PASSIVE=15
PLAYER_COLOR_RED='red'
excludedPortraitTypes={}
function ALICE_ExcludeTypes(...)for _,id in ipairs({...})do excludedPortraitTypes[id]=true end end
for _,name in ipairs({"FRAMEPOINT_CENTER","FRAMEPOINT_TOP","FRAMEPOINT_BOTTOM","FRAMEPOINT_TOPLEFT","FRAMEPOINT_BOTTOMLEFT",
    "FRAMEPOINT_TOPRIGHT","FRAMEPOINT_RIGHT","FRAMEPOINT_BOTTOMRIGHT",
    "TEXT_JUSTIFY_TOP","TEXT_JUSTIFY_LEFT","TEXT_JUSTIFY_MIDDLE","TEXT_JUSTIFY_CENTER","FRAMEEVENT_CONTROL_CLICK",
    "FRAMEEVENT_MOUSE_ENTER","FRAMEEVENT_MOUSE_LEAVE","FRAMEEVENT_MOUSE_DOWN","FRAMEEVENT_MOUSE_UP",
    "ORIGIN_FRAME_GAME_UI","ORIGIN_FRAME_MINIMAP","ORIGIN_FRAME_MINIMAP_BUTTON","ORIGIN_FRAME_HERO_BAR",
    "ORIGIN_FRAME_UNIT_PANEL_BUFF_BAR","ORIGIN_FRAME_PORTRAIT_HP_TEXT","ORIGIN_FRAME_PORTRAIT_MANA_TEXT",
    "ORIGIN_FRAME_PORTRAIT","ORIGIN_FRAME_WORLD_FRAME","ORIGIN_FRAME_TOOLTIP","ORIGIN_FRAME_UBERTOOLTIP",
    "ORIGIN_FRAME_COMMAND_BUTTON","ORIGIN_FRAME_ITEM_BUTTON",
    "CAMERA_FIELD_TARGET_DISTANCE","CAMERA_FIELD_ANGLE_OF_ATTACK","CAMERA_FIELD_ROTATION",
    "CAMERA_FIELD_ZOFFSET","CAMERA_FIELD_ROLL","ANIM_TYPE_STAND","ANIM_TYPE_WALK","ANIM_TYPE_SPELL","ANIM_TYPE_DEATH"})do _G[name]=name end
function BlzCreateFrameByType(kind,name,parent)
    serial=serial+1;local f={name=name,parent=parent,kind=kind,handle=serial,visible=true,enabled=true};frames[name]=f;return f
end
function BlzCreateFrame(name,parent,priority,context) return BlzCreateFrameByType("FRAME",name..context,parent) end
function BlzGetFrameByName(name,context)
    local key=name..((context or 0)>0 and tostring(context)or '')
    local frame=frames[key] or BlzCreateFrameByType("FRAME",key,nil)
    frame.nativeKind=nativeFrameKinds[key]or frame.nativeKind
    return frame
end
function NativeGameUI()
    local ui=BlzGetFrameByName('GameUI')
    if not ui.children then
        local clockParent=BlzGetFrameByName('NativeClockMinimapParent')
        clockParent.children={BlzGetFrameByName('NativeClock'),BlzGetFrameByName('NativeMinimap0')}
        for _,child in ipairs(clockParent.children)do child.parent=clockParent end
        ui.children={BlzGetFrameByName('ConsoleUI'),BlzGetFrameByName('NativeWorldBars'),
            BlzGetFrameByName('ConsoleUIOverlay'),BlzGetFrameByName('ConsoleUIBackdrop'),
            BlzGetFrameByName('NativePortrait'),clockParent}
        for _,child in ipairs(ui.children)do child.parent=ui end
        -- Model separate render/command/inventory surfaces and the custom console ancestor chain.
        frames.ConsoleUIBackdrop.parent=frames.ConsoleUI
        for _,name in ipairs({'ConsoleBottomBar','CommandBarFrame','SimpleInventoryBar','SimpleInventoryCover',
            'InventoryText','ConsoleBottomBarOverlay','SimpleHeroLevelBar','SimpleProgressIndicator',
            'SimpleBuildTimeIndicator','SimpleInfoPanelUnitDetail','SimpleNameValue'})do
            BlzGetFrameByName(name).parent=frames.ConsoleUI
        end
        for _,name in ipairs({'NativeWorldFrame','NativeHeroBar','NativeBuffBar','NativePortraitHP',
            'NativePortraitMana','NativeTooltip','NativeUberTooltip'})do BlzGetFrameByName(name).parent=ui end
        BlzGetFrameByName('NativeInventoryIconTexture').parent=frames.SimpleInventoryBar
        BlzGetFrameByName('NativePortraitIconTexture').parent=frames.NativePortrait
        for index=0,11 do BlzGetFrameByName('NativeCommandButton'..index).parent=frames.CommandBarFrame end
        for index=0,5 do BlzGetFrameByName('NativeItemButton'..index).parent=frames.SimpleInventoryBar end
        for name in pairs(selectionManagedFrames)do
            local frame=BlzGetFrameByName(name)
            if not frame.parent then frame.parent=frames.ConsoleUI end
        end
        local menu=BlzGetFrameByName('UpperButtonBarFrame')
        menu.children={BlzGetFrameByName('NativeQuestButton'),BlzGetFrameByName('NativeMenuButton'),
            BlzGetFrameByName('NativeAllyButton'),BlzGetFrameByName('NativeChatButton')}
        for _,child in ipairs(menu.children)do child.parent=menu end
        menu.children[1].enabled=false -- Preserve existing disabled states too.
        BlzGetFrameByName('NativeInventory').parent=frames.ConsoleUI
    end
    return ui
end
function BlzGetOriginFrame(kind,index)
    local ui=NativeGameUI()
    if kind==ORIGIN_FRAME_MINIMAP then return BlzGetFrameByName('NativeMinimap'..index)end
    if kind==ORIGIN_FRAME_MINIMAP_BUTTON then return BlzGetFrameByName('NativeMinimapButton'..index)end
    if kind==ORIGIN_FRAME_GAME_UI then return ui end
    if kind==ORIGIN_FRAME_COMMAND_BUTTON then return BlzGetFrameByName('NativeCommandButton'..index)end
    if kind==ORIGIN_FRAME_ITEM_BUTTON then return BlzGetFrameByName('NativeItemButton'..index)end
    local names={[ORIGIN_FRAME_HERO_BAR]='NativeHeroBar',[ORIGIN_FRAME_UNIT_PANEL_BUFF_BAR]='NativeBuffBar',
        [ORIGIN_FRAME_PORTRAIT_HP_TEXT]='NativePortraitHP',[ORIGIN_FRAME_PORTRAIT_MANA_TEXT]='NativePortraitMana',
        [ORIGIN_FRAME_PORTRAIT]='NativePortrait',[ORIGIN_FRAME_WORLD_FRAME]='NativeWorldFrame',
        [ORIGIN_FRAME_TOOLTIP]='NativeTooltip',[ORIGIN_FRAME_UBERTOOLTIP]='NativeUberTooltip'}
    return names[kind]and BlzGetFrameByName(names[kind])or nil
end
function BlzFrameGetParent(frame)RequireFrameObject(frame,'BlzFrameGetParent');return frame.parent end
function BlzFrameSetParent(frame,parent)RequireFrameObject(frame,'BlzFrameSetParent');frame.parent=parent end
function BlzFrameGetChildrenCount(frame)
    RequireFrameObject(frame,'BlzFrameGetChildrenCount')
    assert(type(frame)=='table'and frame.handle~=0,'Child count requires a valid frame')
    return #(frame.children or {})
end
function BlzFrameGetChild(frame,index)
    RequireFrameObject(frame,'BlzFrameGetChild')
    assert(type(frame)=='table'and frame.handle~=0,'Child lookup requires a valid parent')
    assert(index>=0 and index<#(frame.children or {}),'Check native child count before indexing')
    return frame.children[index+1]
end
function BlzFrameSetVisible(f,v)RequireFrameObject(f,'BlzFrameSetVisible');f.visible=v end
function BlzFrameIsVisible(f)RequireFrameObject(f,'BlzFrameIsVisible');return f.visible end
function BlzDestroyFrame(f)RequireFrameObject(f,'BlzDestroyFrame');f.destroyed=true end
function BlzFrameSetText(f,v) assert(f);f.text=v end
function BlzFrameSetSize(f,w,h)RequireFrameObject(f,'BlzFrameSetSize');f.width,f.height=w,h end
function BlzFrameSetAlpha(f,v)RequireFrameObject(f,'BlzFrameSetAlpha');f.alpha=v end
function BlzFrameSetLevel(f,v)RequireFrameObject(f,'BlzFrameSetLevel');f.level=v end
function BlzFrameSetEnable(f,v)RequireFrameObject(f,'BlzFrameSetEnable');f.enabled=v end
function BlzFrameSetTexture(f,v) f.texture=v end
function BlzFrameSetScale(f,v)RequireFrameObject(f,'BlzFrameSetScale');f.scale=v end
function BlzFrameSetTextAlignment(f,v,h)RequireFrameObject(f,'BlzFrameSetTextAlignment');f.vertical,f.horizontal=v,h end
function BlzFrameSetAbsPoint(f,p,x,y)RequireFrameObject(f,'BlzFrameSetAbsPoint');f.x,f.y=x,y;f.absolute=p end
function BlzFrameSetPoint(f,p,target,tp,x,y)RequireFrameObject(f,'BlzFrameSetPoint');f.anchor={point=p,target=target,targetPoint=tp,x=x,y=y} end
function BlzFrameClearAllPoints(f)RequireFrameObject(f,'BlzFrameClearAllPoints');f.anchor,f.absolute=nil,nil end
function BlzFrameSetAllPoints(f,target)RequireFrameObject(f,'BlzFrameSetAllPoints');f.allPoints=target end
function BlzFrameSetVertexColor(f,color)RequireFrameObject(f,'BlzFrameSetVertexColor');f.color=color end
function BlzFrameSetTextColor(f,color)RequireFrameObject(f,'BlzFrameSetTextColor');f.textColor=color end
function BlzConvertColor(a,r,g,b)return {a=a,r=r,g=g,b=b}end
function BlzLoadTOCFile()return true end
function BlzTriggerRegisterFrameEvent(t,f,e) t.frame,t.event=f,e end
function GetLocalPlayer() return 0 end
function GetTriggerPlayer() return 0 end
function ClearTextMessages() end
function MultiboardDisplay(board,visible) board.visible=visible end
function CreateMultiboard()return {visible=false,items={}}end
function DestroyMultiboard(board)board.destroyed=true end
function MultiboardSetColumnCount(board,n)board.columns=n end
function MultiboardSetRowCount(board,n)board.rows=n end
function MultiboardMinimize(board,minimized)
    board.minimized=minimized;board.minimizeCalls=(board.minimizeCalls or 0)+1
end
function IsMultiboardMinimized(board)return board.minimized end
function MultiboardSetTitleText(board,text)board.title=text end
function MultiboardGetItem(board,row,column)local item={};board.items[row..':'..column]=item;return item end
function MultiboardSetItemValue(item,value)item.value=value end
for _,name in ipairs({'MultiboardSetItemStyle','MultiboardSetItemWidth','MultiboardSetItemValueColor',
    'MultiboardSetItemIcon','MultiboardReleaseItem'})do _G[name]=function()end end
function ClickFrame(frame)
    for _,trigger in ipairs(triggers)do
        if trigger.frame==frame and trigger.event==FRAMEEVENT_CONTROL_CLICK then trigger.action();return end
    end
    error('Missing click binding: '..frame.name)
end
function ShowUnit(u,visible) u.visible=visible end
function SetUnitInvulnerable(u,value)u.invulnerable=value end
function SetUnitPathing(u,value)u.pathing=value end
function SetUnitColor(u,value)u.color=value end
function BlzSetSpecialEffectColorByPlayer(effect,player)effect.colorPlayer=player end
function GetLocationX(l)return l.x end
function GetLocationY(l)return l.y end
function ClearSelection()selectedUnit=nil;selectionClears=selectionClears+1 end
function SelectUnit(u,value)if value then selectedUnit=u elseif selectedUnit==u then selectedUnit=nil end end
function GetCameraField(field) return field==CAMERA_FIELD_TARGET_DISTANCE and 1650 or 0 end
cameraNative={minX=-13056,minY=1792,maxX=-2304,maxY=13056,x=-7680,y=7424}
cameraBoundsWrites={}
function GetCameraBoundMinX()return cameraNative.minX end
function GetCameraBoundMinY()return cameraNative.minY end
function GetCameraBoundMaxX()return cameraNative.maxX end
function GetCameraBoundMaxY()return cameraNative.maxY end
function GetCameraTargetPositionX()return cameraNative.x end
function GetCameraTargetPositionY()return cameraNative.y end
function SetCameraBounds(minX,minY,x2,maxY,maxX,y3,x4,y4)
    assert(minX<maxX and minY<maxY,'Camera bounds must retain a positive area')
    assert(x2==minX and y3==maxY and x4==maxX and y4==minY,'Use native Blizzard corner order')
    cameraNative.minX,cameraNative.minY,cameraNative.maxX,cameraNative.maxY=minX,minY,maxX,maxY
    cameraBoundsWrites[#cameraBoundsWrites+1]={minX=minX,minY=minY,maxX=maxX,maxY=maxY}
end
function SetCameraPosition(x,y)cameraNative.x,cameraNative.y=x,y end
function PanCameraToTimed(x,y)SetCameraPosition(x,y)end
for _,name in ipairs({"SetCameraField","ResetToGameCamera","SetCameraTargetController"})do _G[name]=function()end end
function BlzPlaySpecialEffect(e,animation)
    e.animation=animation;e.animations=e.animations or {};e.animations[#e.animations+1]=animation
end
function BlzSetSpecialEffectPosition(e,x,y,z) e.x,e.y,e.z=x,y,z end
function BlzSetSpecialEffectAlpha(e,alpha)e.alpha=alpha end
function BlzSetSpecialEffectYaw(e,yaw)e.yaw=yaw end
-- Presentation timers advance wall time independently of the paused run clock.
visualNow=0
local timerStart=TimerStart
function TimerStart(timer,dt,repeated,callback)
    assert(dt>0);timerStart(timer,dt,repeated,callback);timer.due=visualNow+dt
end
function AdvanceVisualTime(seconds)
    local finish=visualNow+seconds
    local calls=0
    while true do
        local due
        for _,timer in ipairs(timers)do if timer.running and timer.due and timer.due<=finish+1e-9 then
            due=not due and timer.due or math.min(due,timer.due)
        end end
        if not due then break end
        visualNow=due
        local ready={}
        for _,timer in ipairs(timers)do if timer.running and timer.due and math.abs(timer.due-due)<1e-9 then ready[#ready+1]=timer end end
        for _,timer in ipairs(ready)do if timer.running then
            if timer.repeated then timer.due=timer.due+timer.dt else timer.running=false end
            timer.callback();calls=calls+1;assert(calls<10000,'Visual timers must remain bounded')
        end end
    end
    visualNow=finish
end
function LiveTimers(dt)
    local count=0;for _,timer in ipairs(timers)do if timer.running and(not dt or timer.dt==dt)then count=count+1 end end
    return count
end
soundHandles,soundEvents={},{}
function CreateSound(path,loop,threeD,stopOut,fadeIn,fadeOut,eax)
    if soundCreateError then error('sound create failure')end
    if soundUnavailable then return nil end
    local sound={path=path,loop=loop,threeD=threeD,fadeIn=fadeIn,fadeOut=fadeOut,eax=eax}
    soundHandles[#soundHandles+1]=sound;return sound
end
function SetSoundVolume(sound,volume)
    if soundVolumeError then error('sound volume failure')end
    sound.volume=volume;sound.volumeWrites=(sound.volumeWrites or 0)+1
end
function StartSound(sound)
    if soundStartError then error('sound start failure')end
    sound.starts=(sound.starts or 0)+1;soundEvents[#soundEvents+1]={kind='start',sound=sound}
end
function StopSound(sound,kill,fade)
    sound.stopped=true;sound.killed=kill;soundEvents[#soundEvents+1]={kind='stop',sound=sound}
    if soundStopError then error('sound stop failure')end
end
bj_mapInitialPlayableArea={minX=-15104,minY=-256,maxX=-256,maxY=15104}
function GetRectMinX(r)return r.minX end
function GetRectMinY(r)return r.minY end
function GetRectMaxX(r)return r.maxX end
function GetRectMaxY(r)return r.maxY end
SurvivorStage.Get=function(index)return {name="stage "..index,mission="mission",hint="hint"}end
-- Most UI suites isolate Story; the integrated Stage suite below exercises real ownership.
stageSceneProps={}
SurvivorStage.SceneProp=function(key,model,x,y,scale,angle,tint)
    if stageSceneProps[key]then return stageSceneProps[key]end
    local effect=AddSpecialEffect(model,x,y)
    effect.scale,effect.yaw,effect.tint=scale,angle,tint
    stageSceneProps[key]=effect
    return effect
end
SurvivorExpedition.Journal=function()return ""end
SurvivorExpedition.GetFinding=function()return finding==true and '직접 확인한 수색 결과.' or finding or nil end
SurvivorExpedition.GetReply=function()return finding and "직접 확인한 단서." or nil end
SurvivorExpedition.HasRiskNotice=function()return riskVisible==true end
SurvivorExpedition.Status=function(riskOnly)
    lastRiskOnly=riskOnly
    if emptyStatus then return '' end
    return riskOnly and 'risk terms only' or 'risk and objective status'
end
SurvivorExpedition.RiskOffer=function()return riskOffer end
SurvivorExpedition.AcceptRisk=function()riskAccepts=(riskAccepts or 0)+1;return riskOffer~=nil end
SurvivorCombat={DamageRows=function()return {}end,BossStatus=function()return nil end,
    EscapeStatus=function()return escapeReady~=false,escapeRemaining or 0 end,
    WardStatus=function()return shieldAmount or 0,shieldRemaining or 0 end}
HeroSurvivor={CanRetrySame=function()return true end,RetrySame=function()retryCalls=(retryCalls or 0)+1;return true end}
`;
suite('custom UI containers leave pointer input to buttons across setup, HUD, story, inventory, choices and results', presentationMocks + String.raw`
-- Conservative custom-frame hit test: alpha never makes a surface click-through.
-- Treat generic FRAME rectangles as potential blockers even when disabled; only
-- display-only BACKDROP and disabled TEXT children are safe decoration here.
local create=BlzCreateFrameByType
function BlzCreateFrameByType(kind,name,parent,...)
    local frame=create(kind,name,parent,...);frame.level=parent and parent.level or 0;return frame
end
function BlzCreateFrame(name,parent,priority,context)
    local kind=name=='ScriptDialogButton'and'GLUETEXTBUTTON'or'BACKDROP'
    local frame=BlzCreateFrameByType(kind,name..context,parent);frame.template=name;return frame
end
HeroSurvivor.IsStorySummary=function()return false end
SurvivorEquipment={UIRevision=function()return 1 end,PendingRewardCount=function()return 0 end,
    PickupMode=function()return '전체'end,CleanupFamilies=function()return {'화염'}end,
    BagEntries=function()return {},0,9 end,
    Get=function(id)return {id=id,icon='icon',description='gear'}end,
    Name=function(id)return id end,Summary=function()return 'summary','set'end}
`, [config,augments,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua',
    'src/30_gameplay/SurvivorSetupUI.lua','src/30_gameplay/SurvivorLootUI.lua'], String.raw`
local chosen,rerolled,excluded=0,0,0
SurvivorUI.Init(function()chosen=chosen+1;SurvivorUI.HidePanel()end,function()end,
    function()rerolled=rerolled+1 end,function()end,function()excluded=excluded+1 end)
SurvivorSetupUI.Init(function()end,function()end,function()end,function()end)
SurvivorLootUI.Init()
local factors={FRAMEPOINT_CENTER={.5,.5},FRAMEPOINT_TOP={.5,1},FRAMEPOINT_BOTTOM={.5,0},
    FRAMEPOINT_TOPLEFT={0,1},FRAMEPOINT_BOTTOMLEFT={0,0},FRAMEPOINT_TOPRIGHT={1,1},
    FRAMEPOINT_BOTTOMRIGHT={1,0},FRAMEPOINT_RIGHT={1,.5}}
local function Rect(frame)
    if frame.allPoints then return Rect(frame.allPoints)end
    local w,h=frame.width or 0,frame.height or 0
    local point,x,y
    if frame.absolute then point,x,y=frame.absolute,frame.x,frame.y
    elseif frame.anchor then
        local a=frame.anchor;local target=Rect(a.target);if not target then return end
        local f=factors[a.targetPoint];point=a.point
        x,y=target[1]+f[1]*target[3]+a.x,target[2]+f[2]*target[4]+a.y
    else return end
    local f=factors[point];return {x-f[1]*w,y-f[2]*h,w,h}
end
local function Pick(frame,x,y)
    if not frame.visible then return end
    local children={}
    for _,child in pairs(frames)do if child.parent==frame then children[#children+1]=child end end
    table.sort(children,function(a,b)
        if a.level~=b.level then return a.level>b.level end
        return a.handle>b.handle
    end)
    for _,child in ipairs(children)do local hit=Pick(child,x,y);if hit then return hit end end
    local r=Rect(frame)
    if r and r[3]>0 and r[4]>0 and x>=r[1]and x<=r[1]+r[3]and y>=r[2]and y<=r[2]+r[4]
        and frame.kind~='BACKDROP'and(frame.kind=='FRAME'or frame.enabled)then return frame end
end
local function CheckTextures()
    for _,frame in pairs(frames)do
        local visible,parent=frame.visible,frame.parent
        while visible and parent do visible=parent.visible;parent=parent.parent end
        if visible and frame.kind=='BACKDROP'then
            assert(frame.texture or frame.template,'Visible backdrop has no texture: '..frame.name)
        end
    end
end
local function Surface(button,fx,fy)
    CheckTextures()
    local r=assert(Rect(button));local hit=Pick(NativeGameUI(),r[1]+fx*r[3],r[2]+fy*r[4])
    assert(hit==button,'Pointer intercepted over '..button.name..' by '..(hit and hit.name or 'nothing'))
    return hit
end
local function WorldAt(frame,fx,fy)
    CheckTextures()
    local r=assert(Rect(frame));local hit=Pick(NativeGameUI(),r[1]+fx*r[3],r[2]+fy*r[4])
    assert(not hit,'Noninteractive region of '..frame.name..' intercepted by '..(hit and hit.name or 'nothing'))
end
local function Event(button,event)
    for _,trigger in ipairs(triggers)do
        if trigger.frame==button and trigger.event==event then trigger.action();return end
    end
    error('Missing pointer event')
end
local build=SurvivorAugments.NewBuild('firebolt','power')
local function Show()
    state='CHOOSING';SurvivorUI.ShowChoices({'firebolt','frontslash','haste'},2,build,0,3)
end
state='RUNNING';SurvivorLootUI.Refresh();SurvivorUI.UpdateSpeech()
Surface(frames.ScriptDialogButton810,.5,.5)
WorldAt(frames.HSLootRoot,.75,.5) -- The hidden manage button must not leave a dead region.
WorldAt(frames.HSExpedition,.5,.5)
SurvivorUI.Notify('notice');SurvivorUI.UpdateSpeech();WorldAt(frames.HSNotice,.5,.5)
SurvivorUI.Say('안야','speech');SurvivorUI.UpdateSpeech();WorldAt(frames.HSSpeech,.9,.5)
shieldAmount,shieldRemaining=100,10
SurvivorUI.UpdateSpeech();WorldAt(frames.HSEssentialHUD,.5,.5)
shieldAmount,shieldRemaining=0,0
state='INVENTORY';SurvivorLootUI.SetInventoryVisible(true)
ClickFrame(Surface(frames.ScriptDialogButton811,.5,.5))
assert(SurvivorLootUI.IsExpanded())
WorldAt(frames.QuestButtonBaseTemplate812,.5,.92)
for _,context in ipairs({810,811,842,843,846,847})do Surface(frames['ScriptDialogButton'..context],.5,.5)end
SurvivorLootUI.SetInventoryVisible(false)
state='READY';SurvivorLootUI.Refresh()
SurvivorSetupUI.ShowMenu('normal','firebolt','power')
WorldAt(frames.HeroSurvivorSetupRoot,.02,.5)
for _,name in ipairs({'DIFFICULTY','WEAPON','TRINKET','Start'})do
    Surface(frames['HeroSurvivorSetup'..name],.5,.5)
end
Surface(frames.HSSummaryToggle,.5,.5)
for _,kind in ipairs({'DIFFICULTY','WEAPON','TRINKET'})do
    SurvivorSetupUI.ShowOptions(kind,nil)
    WorldAt(frames.HeroSurvivorSetupOptions,.02,.5)
    for i=1,6 do local button=frames['HeroSurvivorSetupOption'..i]
        if button.visible then Surface(button,.5,.5);Surface(button,.07,.5)end
    end
    Surface(frames.HeroSurvivorSetupBack,.5,.5)
    if frames.HeroSurvivorSetupFollowing.visible and frames.HeroSurvivorSetupFollowing.enabled then
        Surface(frames.HeroSurvivorSetupFollowing,.5,.5)
    end
end
SurvivorSetupUI.Hide()
SurvivorUI.ShowNarrative('test','test',function()end)
WorldAt(frames.HeroSurvivorStoryContent,.5,.9)
Surface(frames.ScriptDialogButton700,.5,.5)
SurvivorUI.AdvanceNarrative()
SurvivorUI.ShowConversation('test',{{speaker='안야',text='test'}},function()end)
WorldAt(frames.HeroSurvivorCaption,.95,.5)
Surface(frames.ScriptDialogButton700,.5,.5);Surface(frames.ScriptDialogButton701,.5,.5)
SurvivorUI.SkipConversation();AdvanceVisualTime(.7)
state='STAGE_CLEAR';SurvivorUI.ShowCombatPreparation(1,function()end,function()return true end)
WorldAt(frames.HSCombatPreparation,.05,.5)
Surface(frames.HSCombatPreparationStart,.5,.5)
SurvivorUI.HidePanel()
Show() -- Check immediately, before the 0.05/0.1-second HUD observers run.
local function CheckCardText()
    for i=1,3 do
        local card=Rect(frames['HeroSurvivorCard'..i])
        local hint=Rect(frames['HeroSurvivorHint'..i])
        local preview=Rect(frames['HeroSurvivorPreview'..i])
        local description=Rect(frames['HeroSurvivorDescription'..i])
        assert(hint[2]>=card[2]+.025,'Selection hint must clear the decorative bottom border')
        assert(hint[2]+hint[4]<preview[2] and preview[2]+preview[4]<description[2],
            'Description, preview and selection hint need separate vertical space')
    end
end
CheckCardText()
SurvivorUI.ShowChoices({'evolution1','evolution2','haste'},2,build,0,3);CheckCardText()
SurvivorUI.ShowGearRewards({'gear1','gear2','gear3'},1,function()end);CheckCardText()
Show()
WorldAt(frames.HeroSurvivorChoiceRoot,.5,.95)
for i=1,3 do
    for _,prefix in ipairs({'HeroSurvivorCard','HeroSurvivorReroll','HeroSurvivorExclude'})do
        local button=frames[prefix..i]
        if button.enabled then
            for _,p in ipairs({{.5,.5},{.03,.03},{.97,.97},{.5,.87},{.5,.3}})do Surface(button,p[1],p[2])end
        end
    end
end
local card,reroll,exclude=frames.HeroSurvivorCard2,frames.HeroSurvivorReroll2,frames.HeroSurvivorExclude2
for _,button in ipairs({card,reroll,exclude})do
    Event(Surface(button,.5,.5),FRAMEEVENT_MOUSE_ENTER);AdvanceVisualTime(.14)
    if button==reroll then
        local r=Rect(frames.HSChoiceActionTooltip)
        assert(Pick(NativeGameUI(),r[1]+r[3]/2,r[2]+r[4]/2)==card,
            'The action tooltip must let the pointer reach the card beneath it')
    end
    Surface(button,.5,.5);Surface(button,.02,.5)
    Event(Surface(button,.5,.5),FRAMEEVENT_MOUSE_DOWN)
    Event(Surface(button,.5,.5),FRAMEEVENT_MOUSE_UP)
    ClickFrame(Surface(button,.5,.5))
    if button==card then Show()end
end
assert(chosen==1 and rerolled==1 and excluded==1,'Pointer-selected controls reach all three callbacks')
-- Native details shares the inventory gateway. The custom modal must relinquish
-- its entire hit region, including shade, then restore the queued choice.
local nativeDetails=BlzCreateFrameByType('BACKDROP','NativeDetailsSurface',NativeGameUI(),'',0)
nativeDetails.texture='native';nativeDetails.level=2
BlzFrameSetSize(nativeDetails,.14,.1204);BlzFrameSetAbsPoint(nativeDetails,FRAMEPOINT_TOPLEFT,.02,.55)
local nativeClose=BlzCreateFrameByType('GLUETEXTBUTTON','NativeDetailsClose',nativeDetails,'',0)
BlzFrameSetSize(nativeClose,.025,.025);BlzFrameSetPoint(nativeClose,FRAMEPOINT_TOPRIGHT,nativeDetails,FRAMEPOINT_TOPRIGHT,0,0)
local oldFrameCount=0;for _ in pairs(frames)do oldFrameCount=oldFrameCount+1 end
SurvivorUI.SetRestInventoryVisible(true)
SurvivorLootUI.SetInventoryVisible(false,nil,true)
assert(not frames.HeroSurvivorChoiceRoot.visible and not frames.HSLootRoot.visible and SurvivorUI.IsChoiceVisible())
Surface(nativeClose,.5,.5)
SurvivorUI.SetRestInventoryVisible(false);SurvivorLootUI.SetInventoryVisible(false,nil,false)
BlzFrameSetVisible(nativeDetails,false)
Surface(card,.5,.5);Surface(reroll,.5,.5);Surface(exclude,.5,.5)
-- A newly offered choice while details is already open must restore as well.
SurvivorUI.HidePanel();SurvivorUI.SetRestInventoryVisible(true);Show()
assert(not frames.HeroSurvivorChoiceRoot.visible)
SurvivorUI.SetRestInventoryVisible(false);Surface(card,.5,.5)
local frameCount=0;for _ in pairs(frames)do frameCount=frameCount+1 end
assert(frameCount==oldFrameCount,'Opening and closing native details must not create a transparent overlay')
-- The picker must catch invisible blockers rather than merely validating callbacks.
local blocker=BlzCreateFrameByType('FRAME','InjectedTransparentBlocker',card,'',0)
BlzFrameSetAllPoints(blocker,card);BlzFrameSetAlpha(blocker,0)
local ok,message=pcall(Surface,card,.5,.5)
assert(not ok and message:find('InjectedTransparentBlocker'))
BlzFrameSetVisible(blocker,false);Surface(card,.5,.5)
SurvivorUI.HidePanel();state='STAGE_CLEAR';SurvivorLootUI.Refresh()
assert(frames.HSLootRoot.visible)
SurvivorUI.ShowGearRewards({'gear1','gear2','gear3'},1,function()chosen=chosen+1 end)
SurvivorUI.SetRestInventoryVisible(true)
assert(not frames.HeroSurvivorChoiceRoot.visible and SurvivorUI.IsChoiceVisible())
SurvivorUI.SetRestInventoryVisible(false)
Surface(frames.HeroSurvivorCard1,.03,.97)
SurvivorLootUI.Refresh() -- Inventory observation must not put loot controls back over rewards.
assert(not frames.HSLootRoot.visible)
Surface(frames.HeroSurvivorCard1,.03,.97)
ClickFrame(Surface(frames.HeroSurvivorCard2,.5,.5))
assert(chosen==2)
state='FINISHED';SurvivorUI.ShowResult('defeated',10,3,1,nil,'report')
WorldAt(frames.HeroSurvivorChoiceRoot,.02,.5)
Surface(frames.ScriptDialogButton501,.5,.5)
Surface(frames.ScriptDialogButton4,.5,.5);Surface(frames.ScriptDialogButton720,.5,.5)
SurvivorUI.HidePanel()
WorldAt(frames.HeroSurvivorStoryContent,.5,.5)
`);

suite('native top art and minimap hide locally while hotkeys, console parents and custom HUD remain usable', presentationMocks + String.raw`
NativeGameUI()
local protected={GameUI=true,NativeClockMinimapParent=true,ConsoleUI=true,ConsoleBottomBar=true,
    ConsoleUIOverlay=true,ConsoleUIBackdrop=true,NativePortrait=true,NativeInventory=true,
    NativeQuestButton=true,NativeMenuButton=true,NativeAllyButton=true,NativeChatButton=true}
local nativeFrames={}
for name in pairs(protected)do nativeFrames[frames[name]]=true end
for _,name in ipairs({'UpperButtonBarFrame','ResourceBarFrame','ConsoleTopBar','NativeClock',
    'NativeMinimap0','MiniMapFrame','MinimapButtonBar'})do nativeFrames[BlzGetFrameByName(name)]=true end
for index=0,4 do nativeFrames[BlzGetOriginFrame(ORIGIN_FRAME_MINIMAP_BUTTON,index)]=true end
local setVisible=BlzFrameSetVisible
function BlzFrameSetVisible(frame,value)
    assert(not protected[frame.name],'Do not change shared native parents, portrait, inventory or menu buttons')
    setVisible(frame,value)
end
for _,name in ipairs({'BlzFrameSetEnable','BlzFrameSetAbsPoint','BlzFrameSetPoint','BlzFrameSetSize',
    'BlzFrameClearAllPoints','BlzFrameSetAllPoints'})do
    local original=_G[name]
    _G[name]=function(frame,...)
        assert(not nativeFrames[frame],'Native hiding must not disable hotkeys or rearrange the console')
        return original(frame,...)
    end
end
function BlzFrameSetParent(frame,parent)
    assert(not nativeFrames[frame],'Do not reparent the native console');frame.parent=parent
end
nativeLookups=0
for _,name in ipairs({'BlzGetFrameByName','BlzGetOriginFrame','BlzFrameGetChild','BlzFrameGetChildrenCount'})do
    local original=_G[name]
    _G[name]=function(...)nativeLookups=nativeLookups+1;return original(...)end
end
GetLocalPlayer=function()return 12 end
`,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local hidden=Local(SurvivorUI.Init,'nativeHiddenFrames')
assert(#hidden==12,'Cache all named top frames, the clock and minimap controls on every client')
for _,frame in ipairs(hidden)do assert(frame.visible and frame.enabled,'Nonlocal initialization only acquires native handles')end
local lookups=nativeLookups
local speechTimer
for _,timer in ipairs(timers)do if timer.dt==.1 and timer.repeated and timer.running then
    assert(not speechTimer,'UI initialization owns just one 0.1-second speech timer');speechTimer=timer
end end
assert(speechTimer,'Reapply native visibility through the existing 0.1-second loop')
GetLocalPlayer=function()return 0 end
TickTimers()
for _,frame in ipairs(hidden)do assert(not frame.visible and frame.enabled,'Hide only native visibility, preserving enable states')end
assert(nativeLookups==lookups,'Native frames are cached once rather than reacquired inside local timer updates')
for _,name in ipairs({'GameUI','NativeClockMinimapParent','ConsoleUI','ConsoleBottomBar','ConsoleUIOverlay',
    'ConsoleUIBackdrop','NativePortrait','NativeInventory'})do assert(frames[name].visible and frames[name].enabled)end
assert(frames.NativeMenuButton.enabled and frames.NativeMenuButton.parent==frames.UpperButtonBarFrame,
    'F10 still targets the enabled native menu button under its original parent')
assert(not frames.NativeQuestButton.enabled and frames.NativeAllyButton.enabled and frames.NativeChatButton.enabled,
    'Preserve the native quest, ally and chat enable states exactly')
assert(frames.NativeClock.parent==frames.NativeClockMinimapParent and frames.NativeMinimap0.parent==frames.NativeClockMinimapParent)
for _,frame in ipairs(hidden)do frame.visible=true end
TickTimers();for _,frame in ipairs(hidden)do assert(not frame.visible,'Native UI refreshes cannot bring the upper art back')end
assert(nativeLookups==lookups)
state='RUNNING';SurvivorCombat.BossStatus=function()return {name='boss',current=500,max=1000}end
SurvivorUI.UpdateDamageBoard({weapons={},evolutions={}},2,120,3,'normal');TickTimers()
local board=Local(SurvivorUI.UpdateDamageBoard,'damageBoard')
assert(board.visible and board.title:find('2:00')and frames.HSEssentialHUD.visible,
    'Hiding the top console preserves the custom boss panel and native statistics title')
SurvivorUI.Say('안야','읽을 수 있는 대사');TickTimers()
assert(frames.HSSpeech.visible and frames.HSEssentialHUD.visible and frames.HSSpeech.parent==frames.ConsoleUIBackdrop)
for _,frame in ipairs(hidden)do frame.visible=true end
GetLocalPlayer=function()return 12 end
TickTimers();for _,frame in ipairs(hidden)do assert(frame.visible,'Native hiding applies only on the solo player client')end
`);
for (const unavailable of ['nil', '0', '{handle=0}']) suite('optional named top art safely tolerates ' + unavailable,
    presentationMocks + String.raw`
NativeGameUI()
local lookup=BlzGetFrameByName
function BlzGetFrameByName(name,context)
    if name=='UpperButtonBarFrame'or name=='ResourceBarFrame'or name=='ConsoleTopBar'then return ` + unavailable + String.raw` end
    return lookup(name,context)
end
`, [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
for i=1,5 do SurvivorUI.UpdateSpeech()end
assert(frames.HSNotice and frames.HSEssentialHUD,'Missing optional resource handles must not interrupt map UI initialization')
`);
for (const target of ['GameUI', 'clock parent', 'clock child']) {
    for (const unavailable of ['nil', '0', '{handle=0}']) suite('clock hierarchy safely skips invalid ' + target + ' ' + unavailable,
        presentationMocks + String.raw`
NativeGameUI();clockChildCalls,clockCountCalls=0,0
local origin,child,count=BlzGetOriginFrame,BlzFrameGetChild,BlzFrameGetChildrenCount
function BlzGetOriginFrame(kind,index)
    local frame=origin(kind,index)
    if '` + target + String.raw`'=='GameUI'and kind==ORIGIN_FRAME_GAME_UI then return ` + unavailable + String.raw` end
    return frame
end
function BlzFrameGetChildrenCount(frame)clockCountCalls=clockCountCalls+1;return count(frame)end
function BlzFrameGetChild(frame,index)
    if frame==frames.NativeClockMinimapParent or(frame==frames.GameUI and index==5)then clockChildCalls=clockChildCalls+1 end
    local value=child(frame,index)
    if ('` + target + String.raw`'=='clock parent'and frame==frames.GameUI and index==5)
        or ('` + target + String.raw`'=='clock child'and frame==frames.NativeClockMinimapParent and index==0)then
        return ` + unavailable + String.raw`
    end
    return value
end
`, [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
for i=1,5 do TickTimers()end
local expected='` + target + String.raw`'=='GameUI'and 0 or '` + target + String.raw`'=='clock parent'and 1 or 2
assert(clockChildCalls==expected,'Stop descending the clock hierarchy immediately after an invalid frame')
assert(#Local(SurvivorUI.Init,'nativeHiddenFrames')==11 and frames.NativeClock.visible,
    'An unavailable clock leaves all other upper/minimap visibility changes intact')
assert(frames.NativeClockMinimapParent.visible and frames.ConsoleUIBackdrop.visible and frames.HSNotice)
`);
}
for (const [target, countValue, childCalls] of [['GameUI', 0, 0], ['GameUI', 5, 0], ['clock parent', 0, 1]]) {
    suite('clock hierarchy skips short ' + target + ' child count ' + countValue,
        presentationMocks + String.raw`
NativeGameUI();clockChildCalls=0
local child,count=BlzFrameGetChild,BlzFrameGetChildrenCount
function BlzFrameGetChildrenCount(frame)
    if ('` + target + String.raw`'=='GameUI'and frame==frames.GameUI)
        or ('` + target + String.raw`'=='clock parent'and frame==frames.NativeClockMinimapParent)then return ` + countValue + String.raw` end
    return count(frame)
end
function BlzFrameGetChild(frame,index)
    assert(index<BlzFrameGetChildrenCount(frame),'Skip an out-of-range native child before looking it up')
    if frame==frames.NativeClockMinimapParent or(frame==frames.GameUI and index==5)then clockChildCalls=clockChildCalls+1 end
    return child(frame,index)
end
`, [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
for i=1,5 do TickTimers()end
assert(clockChildCalls==` + childCalls + String.raw` and frames.NativeClock.visible)
assert(#Local(SurvivorUI.Init,'nativeHiddenFrames')==11 and not frames.UpperButtonBarFrame.visible)
`);
}
for (const absent of ['BlzFrameGetChild', 'BlzFrameGetChildrenCount']) suite('older clients safely omit ' + absent,
    presentationMocks + String.raw`
NativeGameUI()
` + absent + String.raw`=nil
`, [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
for i=1,5 do TickTimers()end
assert(frames.NativeClock.visible and frames.NativeClockMinimapParent.visible)
assert(#Local(SurvivorUI.Init,'nativeHiddenFrames')==11 and not frames.ConsoleTopBar.visible,
    'Missing child API skips only the clock without interrupting UI creation')
`);
const blackTexture = fs.readFileSync(path.join(root, 'assets/war3mapImported/HeroSurvivorUI/Black.tga'));
assert.equal(blackTexture[2], 2, 'The intro uses an uncompressed true-color TGA');
assert.equal(blackTexture[16], 32);
assert.equal(blackTexture.length, 18 + blackTexture.readUInt16LE(12) * blackTexture.readUInt16LE(14) * 4);
for (let offset = 18; offset < blackTexture.length; offset += 4) {
    assert.deepEqual([...blackTexture.subarray(offset, offset + 4)], [0, 0, 0, 255], 'Every intro pixel must be opaque black');
}
console.log('PASS intro texture contains only opaque black pixels');

suite('preparation start, black intro and dialogue retries never pass native strings, textures or renderer frames to visibility natives',
    presentationMocks + String.raw`
HeroSurvivor.IsStorySummary=function()return false end
HeroSurvivor.ToggleStorySummary=function()end
`, [config,metrics,augments,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua',
    'src/30_gameplay/SurvivorSetupUI.lua'], String.raw`
NativeGameUI()
local untouched={}
for name,kind in pairs(nativeFrameKinds)do
    local frame=frames[name]
    assert(frame and GetHandleId(frame)~=0 and frame.nativeKind==kind,
        'A valid handle does not imply compatibility with Frame/SimpleFrame natives')
    local prohibited=kind=='STRING'and{'BlzFrameIsVisible','BlzFrameSetVisible','BlzFrameSetAlpha',
        'BlzFrameSetLevel','BlzFrameSetEnable','BlzFrameSetScale','BlzFrameSetParent','BlzDestroyFrame'}
        or{'BlzFrameIsVisible','BlzFrameSetVisible'}
    for _,native in ipairs(prohibited)do
        local ok,message=pcall(_G[native],frame,false)
        assert(not ok and message:find('cannot operate on native'),'Typed mocks must reject the formerly unsafe call')
    end
    if kind=='STRING'then
        BlzFrameSetText(frame,'fixture text');BlzFrameSetSize(frame,.1,.02)
        BlzFrameSetAbsPoint(frame,FRAMEPOINT_CENTER,.4,.3)
        BlzFrameSetPoint(frame,FRAMEPOINT_TOP,frames.GameUI,FRAMEPOINT_TOP,0,-.1)
        assert(frame.text=='fixture text'and frame.width==.1 and frame.anchor.target==frames.GameUI,
            'Native String text, size and anchor writes remain supported by the typed mock')
    end
    untouched[frame]={visible=frame.visible,enabled=frame.enabled,parent=frame.parent}
end
for name in pairs(engineOwnedFrames)do
    local frame=frames[name]
    assert(frame and frame.nativeKind==nil,'Engine-owned containers must not be mislabeled as String or Texture primitives')
    for _,native in ipairs({'BlzFrameIsVisible','BlzFrameSetVisible','BlzFrameSetEnable','BlzFrameSetParent'})do
        local ok,message=pcall(_G[native],frame,false)
        assert(not ok and message:find('must not inspect or write engine-owned',1,true),
            'Compatibility policy keeps cover/world containers outside direct frame queries or writes')
    end
    untouched[frame]={visible=frame.visible,enabled=frame.enabled,parent=frame.parent}
end
for name in pairs(selectionManagedFrames)do
    local frame=frames[name]
    assert(frame and frame.nativeKind==nil,'Selected-unit panels are valid frames rather than String/Texture primitives')
    for _,native in ipairs({'BlzFrameIsVisible','BlzFrameSetVisible'})do
        local ok,message=pcall(_G[native],frame,true)
        assert(not ok and message:find('must leave selected-unit panel',1,true),
            'The mock rejects forcing engine-selected statistics or individual command/item buttons')
    end
    untouched[frame]={visible=frame.visible,enabled=frame.enabled,parent=frame.parent}
end
unsafeFrameCalls={}
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local selections,hero,starts,completed={},nil,0,0
local function Menu()
    SurvivorSetupUI.ShowMenu(selections.DIFFICULTY,selections.WEAPON,selections.TRINKET)
end
SurvivorSetupUI.Init(function(kind)SurvivorSetupUI.ShowOptions(kind,selections[kind])end,
    function(kind,id)selections[kind]=id;Menu()end,Menu,function()
        starts=starts+1;state='STAGE_CLEAR';hero=CreateUnit(0,'Uany',-7680,7424,0);selectedUnit=hero
        SurvivorUI.ShowStageIntro(1,function()completed=completed+1;state='FINISHED'end,hero)
    end)
state='READY';Menu()
for _,kind in ipairs({'DIFFICULTY','WEAPON','TRINKET'})do
    ClickFrame(frames['HeroSurvivorSetup'..kind]);ClickFrame(frames.HeroSurvivorSetupOption1)
    assert(selections[kind],'The actual preparation UI must supply every required selection')
end
ClickFrame(frames.HeroSurvivorSetupStart);ClickFrame(frames.HeroSurvivorSetupStart)
assert(starts==1 and frames.HeroSurvivorStageIntro.visible and frames.HeroSurvivorStageIntro.alpha==255)
assert(frames.HeroSurvivorStageText.text==SurvivorStory.premise and completed==0)
assert(frames.NativeWorldFrame.visible and frames.NativeWorldBars.visible,
    'Opaque cover supplies the black screen while the engine retains ownership of its world surfaces')
SurvivorUI.AdvanceNarrative();AdvanceVisualTime(.12)
assert(not hero.visible and selectedUnit.id=='hsPP')
SurvivorUI.SkipConversation();assert(completed==1 and hero.visible and selectedUnit==hero and LiveTimers(.03)==0)
Menu();ClickFrame(frames.HeroSurvivorSetupStart)
assert(starts==2 and frames.HeroSurvivorStageIntro.visible)
SurvivorUI.AdvanceNarrative();AdvanceVisualTime(.06)
SurvivorUI.HidePanel();SurvivorStory.Reset()
assert(hero.visible and selectedUnit==hero and completed==1 and LiveTimers(.03)==0)
state='FINISHED';Menu();ClickFrame(frames.HeroSurvivorSetupStart)
assert(starts==3 and frames.HeroSurvivorStageText.text==SurvivorStory.premise)
SurvivorUI.AdvanceNarrative()
for page=1,4 do AdvanceVisualTime(.7);SurvivorUI.AdvanceNarrative()end
assert(completed==2 and hero.visible and selectedUnit==hero and LiveTimers(.03)==0)
assert(#unsafeFrameCalls==0,'Every start, scene transition, skip, reset and retry must avoid unsupported native calls')
for frame,snapshot in pairs(untouched)do
    assert(frame.visible==snapshot.visible and frame.enabled==snapshot.enabled and frame.parent==snapshot.parent,
        'Native String/Texture primitives and policy-protected container flags remain untouched')
end
`);

suite('black introduction hides native clutter locally and reveals a sibling dialogue without automatic progress',
    presentationMocks, [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7680,7424,0);selectedUnit=hero
frames.SimpleInventoryCover.visible=false;frames.ConsoleBottomBarOverlay.visible=false
local originals,nativeFrames={},{}
for _,entry in ipairs(Local(SurvivorUI.Init,'cinematicFrames'))do if entry.frame then
    local frame=entry.frame
    originals[frame]={visible=frame.visible,enabled=frame.enabled,parent=frame.parent,x=frame.x,y=frame.y,
        width=frame.width,height=frame.height,anchor=frame.anchor}
    nativeFrames[frame]=true
end end
for _,name in ipairs({'GameUI','ConsoleUI','ConsoleUIBackdrop','NativeClockMinimapParent'})do
    nativeFrames[frames[name]]=true
end
local visible=BlzFrameSetVisible;local nativeWrites=0
function BlzFrameSetVisible(frame,value)
    assert(frame~=frames.GameUI and frame~=frames.ConsoleUI and frame~=frames.ConsoleUIBackdrop,
        'Never hide an ancestor of the custom cinematic UI')
    if nativeFrames[frame]then nativeWrites=nativeWrites+1 end
    visible(frame,value)
end
for _,name in ipairs({'BlzFrameSetEnable','BlzFrameSetParent','BlzFrameSetAbsPoint','BlzFrameSetPoint',
    'BlzFrameSetSize','BlzFrameClearAllPoints','BlzFrameSetAllPoints'})do
    local original=_G[name]
    _G[name]=function(frame,...)assert(not nativeFrames[frame],'Only native visibility may change');return original(frame,...)end
end
local completed=0
SurvivorUI.ShowStageIntro(1,function()completed=completed+1 end,hero)
local black,content,caption=frames.HeroSurvivorStageIntro,frames.HeroSurvivorStoryContent,frames.HeroSurvivorCaption
assert(black.texture==[[HeroSurvivorUI\Black.tga]] and black.alpha==255 and black.visible)
assert(black.width>=2.4 and black.height>=.6 and black.x==.4 and black.y==.3 and not black.enabled)
assert(black.parent==frames.ConsoleUIBackdrop and content.parent==black.parent and caption.parent==black.parent)
assert(content.level>black.level and frames.ScriptDialogButton700.level>black.level)
assert(frames.NativeWorldFrame.visible and frames.NativeWorldBars.visible and not frames.NativePortrait.visible,
    'The opaque backdrop covers the world without toggling renderer-owned frame visibility')
assert(not frames.CommandBarFrame.visible and not frames.SimpleInventoryBar.visible
    and frames.NativeCommandButton0.visible and frames.NativeItemButton0.visible,
    'Hide command/inventory containers while engine-controlled button flags remain untouched')
assert(frames.ConsoleUI.visible and frames.ConsoleUIBackdrop.visible and frames.GameUI.visible)
assert(frames.HeroSurvivorStageText.text==SurvivorStory.premise and frames.HSStoryFooter.text:find('F10')
    and frames.HSStoryFooter.text:find('창작'),'Premise and the small controls/fiction footer have distinct text frames')
local text=frames.HeroSurvivorStageText.text
AdvanceVisualTime(3)
assert(completed==0 and frames.HeroSurvivorStageText.text==text and black.alpha==255 and LiveTimers(.03)==0)
SurvivorUI.AdvanceNarrative()
assert(not hero.visible and #Local(SurvivorStory.Cleanup,'sceneEffects')==2)
local sceneryCount=0;for _ in pairs(stageSceneProps)do sceneryCount=sceneryCount+1 end
assert(sceneryCount>=4,'The introduction retains its grave and tracks as stage-owned landscape')
assert(frames.NativeWorldFrame.visible and frames.NativeWorldBars.visible and frames.NativePortrait.visible,
    'Renderer-owned world frames remain untouched and the speaker portrait returns for dialogue')
assert(frames.SimpleInfoPanelIconArmor2.visible and frames.SimpleNameValue.visible and not frames.CommandBarFrame.visible)
assert(frames.HeroSurvivorStageTitle.text:find('퓨트리스') and frames.HSStoryPosition.text:find('1/4'))
assert(caption.visible and frames.HSStoryFooter.visible and black.alpha==255 and LiveTimers(.03)==2)
local firstPage=frames.HeroSurvivorStageText.text
AdvanceVisualTime(.15)
assert(black.alpha>0 and black.alpha<255 and black.visible and caption.visible,
    'The backdrop fades while the sibling dialogue remains fully visible')
AdvanceVisualTime(.30)
assert(not black.visible and black.alpha==0 and LiveTimers(.03)==0)
assert(frames.HeroSurvivorStageText.text==firstPage and completed==0 and now==0,
    'Visual time never advances a page or the paused run clock')
SurvivorUI.SkipConversation();SurvivorUI.SkipConversation()
assert(completed==1 and hero.visible and selectedUnit==hero)
for frame,snapshot in pairs(originals)do
    assert(frame.visible==snapshot.visible and frame.enabled==snapshot.enabled and frame.parent==snapshot.parent
        and frame.x==snapshot.x and frame.y==snapshot.y and frame.width==snapshot.width and frame.height==snapshot.height
        and frame.anchor==snapshot.anchor,'Restore each native flag exactly without changing its geometry or parent')
end
local writes=nativeWrites;GetLocalPlayer=function()return 12 end
SurvivorUI.ShowStageIntro(2,function()completed=completed+1 end)
for _=1,3 do SurvivorUI.AdvanceNarrative()end
assert(nativeWrites==writes and completed==2,'Native cinematic visibility is local to the playable client')
`);

suite('cinematic native snapshots preserve inherited invisibility and retry only failed restoration writes', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local hiddenParent=BlzCreateFrameByType('FRAME','AlreadyHiddenNativeParent',frames.GameUI)
hiddenParent.visible=false;frames.NativeTooltip.parent=hiddenParent
function BlzFrameIsVisible(frame)
    if frame.visible==false then return false end
    return not frame.parent or BlzFrameIsVisible(frame.parent)
end
local writes,base={},BlzFrameSetVisible
function BlzFrameSetVisible(frame,value)
    writes[frame]=(writes[frame]or 0)+1
    if restoreFailure and frame==frames.CommandBarFrame and value then restoreFailure=false;error('native restore failure')end
    base(frame,value)
end
state='STAGE_CLEAR';SurvivorUI.ShowNarrative('intro','text',function()end)
assert(frames.NativeTooltip.visible and not BlzFrameIsVisible(frames.NativeTooltip))
local childWrites=writes[frames.NativeTooltip]or 0
restoreFailure=true
local ok,message=pcall(SurvivorUI.HidePanel)
assert(not ok and message:find('native restore failure') and not SurvivorUI.IsNarrativeVisible())
assert(frames.NativeTooltip.visible and(writes[frames.NativeTooltip]or 0)==childWrites,
    'An untouched child flag must not be overwritten with inherited false visibility')
assert(frames.NativePortrait.visible and frames.NativeWorldFrame.visible,
    'A failed native restore still attempts every other saved flag')
assert(next(Local(SurvivorUI.Init,'cinematicSaved'))~=nil)
SurvivorUI.HidePanel();assert(frames.CommandBarFrame.visible and next(Local(SurvivorUI.Init,'cinematicSaved'))==nil)
assert(frames.NativeTooltip.parent==hiddenParent and not hiddenParent.visible)
`);

suite('last manual dialogue restores the live hero before portrait deletion and native console restoration', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7680,7424,0);selectedUnit=hero
local closing,events,removedPortraits=false,{},0
local storyEffects,hiddenEffects,sunkEffects={},{},{}
local show,select,remove,visible=ShowUnit,SelectUnit,RemoveUnit,BlzFrameSetVisible
local alpha,destroy,position=BlzSetSpecialEffectAlpha,DestroyEffect,BlzSetSpecialEffectPosition
function ShowUnit(unit,value)
    if closing and unit==hero and value then events[#events+1]='hero visible' end
    if closing and excludedPortraitTypes[unit.id]and not value then
        assert(hero.visible and selectedUnit==hero,'Restore the live hero before hiding either portrait proxy')
        events[#events+1]='proxy hidden'
    end
    show(unit,value)
end
function SelectUnit(unit,value)
    if closing and unit==hero and value then
        assert(hero.visible and not hero.removed,'The live hero must be visible before restoring its selection')
        events[#events+1]='hero selected'
    end
    select(unit,value)
end
function RemoveUnit(unit)
    if closing and excludedPortraitTypes[unit.id]then
        assert(hero.visible and selectedUnit==hero,'Restore the live portrait before removing either dialogue proxy')
        assert(unit.visible==false,'Hide a portrait proxy before its native removal can display a death pose')
        removedPortraits=removedPortraits+1;events[#events+1]='proxy removed'
    end
    remove(unit)
end
function BlzSetSpecialEffectAlpha(effect,value)
    if closing and storyEffects[effect]then
        assert(value==0 and not effect.destroyed,'Hide the live story actor before its death animation can start')
        hiddenEffects[effect]=true;events[#events+1]='actor hidden'
    end
    alpha(effect,value)
end
function BlzSetSpecialEffectPosition(effect,x,y,z)
    if closing and storyEffects[effect]then
        assert(hiddenEffects[effect]and z==-10000 and x==effect.x and y==effect.y and not effect.destroyed,
            'Move hidden story geometry and emitters below terrain before destroying them')
        sunkEffects[effect]=true;events[#events+1]='actor sunk'
    end
    position(effect,x,y,z)
end
function DestroyEffect(effect)
    if closing and storyEffects[effect]then
        assert(hiddenEffects[effect]and effect.alpha==0 and sunkEffects[effect]and effect.z==-10000,
            'Destroy story actors only after geometry and emitters are hidden')
        events[#events+1]='actor destroyed'
    end
    destroy(effect)
end
local restored={}
function BlzFrameSetVisible(frame,value)
    if closing and value and(frame==frames.CommandBarFrame or frame==frames.SimpleInventoryBar)then
        assert(hero.visible and selectedUnit==hero and removedPortraits==2,
            'Console restoration must follow story cleanup and both retired dialogue proxies')
        restored[frame]=true;events[#events+1]='native restored'
    end
    visible(frame,value)
end
local completed=0
SurvivorUI.ShowStageIntro(1,function()
    assert(hero.visible and selectedUnit==hero and removedPortraits==2 and restored[frames.CommandBarFrame]
        and restored[frames.SimpleInventoryBar],'Gameplay continuation sees a fully restored live hero and console')
    completed=completed+1;events[#events+1]='gameplay continuation'
end,hero)
SurvivorUI.AdvanceNarrative()
for _=1,3 do SurvivorUI.AdvanceNarrative()end
assert(frames.HSStoryPosition.text:find('4/4')and selectedUnit.id=='hsPA')
local retiring=Local(SurvivorStory.Cleanup,'sceneEffects')
for _,effect in ipairs(retiring)do storyEffects[effect]=true end
closing=true;SurvivorUI.AdvanceNarrative()
assert(completed==1 and events[1]=='hero visible'and events[2]=='hero selected'
    and events[#events]=='gameplay continuation','The last Continue finishes synchronously in the safe native order')
assert(LiveTimers(.03)==0 and next(Local(SurvivorUI.Init,'cinematicSaved'))==nil and #unsafeFrameCalls==0)
for _,effect in ipairs(retiring)do
    assert(effect.destroyed and effect.alpha==0 and effect.z==-10000,'No retired story effect remains visibly animating')
end
SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation();SurvivorUI.HidePanel()
assert(completed==1 and removedPortraits==2,'Duplicate clicks and later hides never repeat scene cleanup or continuation')
`);

suite('conversation close hooks are consumed once, restore native UI after failure and cannot clean a newer story scene', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7680,7424,0);selectedUnit=hero
local completed,closes=0,0
local function Done()completed=completed+1 end
SurvivorStory.ShowBriefing(hero,Done)
local stale=Local(SurvivorUI.SkipConversation,'conversationClose');assert(type(stale)=='function')
SurvivorStory.ShowInterlude(2,hero,Done)
local fresh=Local(SurvivorStory.Cleanup,'sceneEffects')
local unit,sceneTimer=selectedUnit,Local(SurvivorStory.Cleanup,'motion').timer
stale();stale()
assert(not hero.visible and selectedUnit==unit and not unit.removed and not fresh[1].destroyed
    and sceneTimer.running,'A detached close token cannot clean the next scene, selection or timer')
SurvivorUI.SkipConversation();assert(completed==1 and hero.visible and selectedUnit==hero)
local pages={{speaker='안야',text='close failure'}}
SurvivorUI.ShowConversation('failure',pages,Done,nil,function()closes=closes+1;error('intentional close failure')end)
local ok,message=pcall(SurvivorUI.AdvanceNarrative)
assert(not ok and message:find('intentional close failure')and closes==1 and completed==1)
assert(not SurvivorUI.IsNarrativeVisible()and frames.CommandBarFrame.visible and frames.SimpleInventoryBar.visible
    and next(Local(SurvivorUI.Init,'cinematicSaved'))==nil and LiveTimers(.03)==0,
    'A failing scene closer still restores custom/native UI without running gameplay continuation')
SurvivorUI.HidePanel();SurvivorUI.SkipConversation();assert(closes==1)
SurvivorUI.ShowConversation('retry',pages,Done,nil,function()closes=closes+1 end)
SurvivorUI.AdvanceNarrative();assert(closes==2 and completed==2 and #unsafeFrameCalls==0)
`);

suite('gameplay return fades reveal restored views once and cancel on replacement, failure and cleanup', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local completed=0;local hero=CreateUnit(0,'Uany',0,0,0)
local function Done()completed=completed+1;SurvivorUI.ShowCombatPreparation(1,function()end)end
SurvivorStory.ShowBriefing(hero,Done);AdvanceVisualTime(.6)
SurvivorUI.SkipConversation();SurvivorUI.SkipConversation();SurvivorUI.AdvanceNarrative()
local cover=frames.HSStoryReturnShade
assert(completed==1 and hero.visible and selectedUnit==hero and cover.visible and cover.alpha==255)
assert(SurvivorUI.IsCombatPreparationVisible()and LiveTimers(.02)==1 and now==0,
    'Only presentation time advances; preparation still owns the gameplay pause')
local first=Local(SurvivorUI.SkipConversation,'returnTimer')
AdvanceVisualTime(.3);assert(cover.visible and cover.alpha>0 and cover.alpha<255)
AdvanceVisualTime(.35);assert(not cover.visible and LiveTimers(.02)==0 and first.destroyed and completed==1)
SurvivorStory.ShowBriefing(hero,Done);SurvivorUI.SkipConversation()
local replaced=Local(SurvivorUI.SkipConversation,'returnTimer')
SurvivorUI.ShowNarrative('replacement','new text',function()end)
assert(replaced.destroyed and not cover.visible)
replaced.callback();assert(not cover.visible and frames.HeroSurvivorStageIntro.alpha==255)
SurvivorStory.ShowBriefing(hero,Done);SurvivorUI.SkipConversation()
local reset=Local(SurvivorUI.SkipConversation,'returnTimer')
SurvivorUI.HidePanel();SurvivorStory.Reset();reset.callback()
assert(reset.destroyed and not cover.visible and LiveTimers(.02)==0)
SurvivorStory.ShowBriefing(hero,Done);SurvivorUI.SkipConversation()
local failed=Local(SurvivorUI.SkipConversation,'returnTimer');local alpha=BlzFrameSetAlpha
function BlzFrameSetAlpha(frame,value)
    if frame==cover and value<255 then error('return fade failure')end
    return alpha(frame,value)
end
local ok,message=pcall(AdvanceVisualTime,.02)
assert(not ok and message:find('return fade failure')and failed.destroyed and not cover.visible)
BlzFrameSetAlpha=alpha;failed.callback();assert(LiveTimers(.02)==0)
SurvivorUI.ShowConversation('next scene',{{speaker='안야',text='one'}},function()
    SurvivorUI.ShowNarrative('next','preserved',function()end)
end)
SurvivorUI.AdvanceNarrative()
assert(not cover.visible and LiveTimers(.02)==0 and frames.HeroSurvivorStageText.text=='preserved',
    'A completion callback opening another narrative keeps that narrative visible')
SurvivorUI.HidePanel()
`);

suite('intro reveal timers cancel on skip, replacement, error and restart and stale callbacks stay inert', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local pages={{speaker='안야',text='one'},{speaker='퓨트리스',text='two'}}
local completed=0;local function Done()completed=completed+1 end
local function Reveal()local timer=Local(SurvivorUI.ShowConversation,'revealTimer');assert(timer and timer.dt==.03 and timer.repeated);return timer end
local function Inert(timer)
    assert(timer.destroyed and not timer.running)
    local text,alpha,visible=frames.HeroSurvivorStageText.text,frames.HeroSurvivorStageIntro.alpha,frames.HeroSurvivorStageIntro.visible
    timer.callback()
    assert(text==frames.HeroSurvivorStageText.text and alpha==frames.HeroSurvivorStageIntro.alpha
        and visible==frames.HeroSurvivorStageIntro.visible,'An old reveal cannot mutate a later presentation')
end
SurvivorUI.ShowConversation('first',pages,Done);local first=Reveal();AdvanceVisualTime(.12)
SurvivorUI.SkipConversation();assert(completed==1);Inert(first)
SurvivorUI.ShowConversation('replacement',pages,Done);local second=Reveal();Inert(first)
SurvivorUI.ShowConversation('third',pages,Done);local third=Reveal();Inert(second)
local text=frames.HeroSurvivorStageText.text;AdvanceVisualTime(.6)
assert(frames.HeroSurvivorStageText.text==text and completed==1);Inert(third)
SurvivorUI.ShowConversation('reset',pages,Done);local fourth=Reveal()
SurvivorUI.HidePanel();SurvivorStory.Reset();Inert(fourth)
SurvivorUI.ShowConversation('failure',pages,Done);local fifth=Reveal()
local alpha=BlzFrameSetAlpha
function BlzFrameSetAlpha(frame,value)
    if frame==frames.HeroSurvivorStageIntro and value<255 then error('reveal alpha failure')end
    return alpha(frame,value)
end
local ok,message=pcall(function()AdvanceVisualTime(.03)end)
assert(not ok and message:find('reveal alpha failure') and not SurvivorUI.IsNarrativeVisible());Inert(fifth)
BlzFrameSetAlpha=alpha
SurvivorUI.ShowConversation('after error',pages,Done);SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative()
assert(completed==2 and LiveTimers(.03)==0,'Manual completion remains single-use after a reveal failure')
`);

suite('speaker portraits switch native units and restore the actual hero across completion, skip, summary and failure',
    presentationMocks + String.raw`
local create=CreateUnit
function CreateUnit(owner,id,x,y,facing)
    if id=='hsPA'or id=='hsPP'then
        assert(excludedPortraitTypes[id],'Exclude native portrait proxies from ALICE before allocation')
        if failPortraitCreation and id=='hsPP'then failPortraitCreation=false;return nil end
    end
    local unit=create(owner,id,x,y,facing)
    if id=='hsPA'or id=='hsPP'then unit.abilities={Amov=1,Aatk=1,AInv=1}end
    return unit
end
local select=SelectUnit
function SelectUnit(unit,value)
    if failPortraitSelection and unit.id=='hsPA'then failPortraitSelection=false;error('portrait render failure')end
    return select(unit,value)
end
`, [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7680,7424,0)
hero.abilities={gameplay=1};selectedUnit=hero
local completed=0
local function Done()completed=completed+1 end
local function LivePortraits()
    local count=0;for _,unit in ipairs(world)do if not unit.removed and(unit.id=='hsPA'or unit.id=='hsPP')then count=count+1 end end
    return count
end
SurvivorStory.ShowBriefing(hero,Done)
assert(LivePortraits()==2 and selectedUnit.id=='hsPP','The first Putress line selects his own native model')
local proxies=Local(SurvivorStory.Cleanup,'portraitUnits')
for _,unit in pairs(proxies)do
    assert(unit.owner==Player(0)and unit.color==PLAYER_COLOR_RED and unit.paused and unit.invulnerable and unit.pathing==false,
        'Both native portraits use the playable red team without enabling orders or pathing')
    assert(not unit.abilities.Amov and not unit.abilities.Aatk and not unit.abilities.AInv)
    assert(unit.visible~=false and (unit.scale or 1)==1,'Keep the proxy visible at ordinary scale for its native portrait')
    assert((unit.x-hero.x)^2+(unit.y-hero.y)^2>2000^2,'Portrait proxies must not duplicate the actors in the scene')
end
SurvivorUI.AdvanceNarrative();assert(selectedUnit.id=='hsPA','Anya selects her own portrait')
SurvivorUI.AdvanceNarrative();assert(selectedUnit.id=='hsPP')
SurvivorUI.AdvanceNarrative();assert(selectedUnit.id=='hsPA'and completed==0)
SurvivorUI.AdvanceNarrative();assert(completed==1 and selectedUnit==hero and LivePortraits()==0)
assert(hero.abilities.gameplay==1 and not hero.removed,'Presentation never mutates the gameplay hero abilities')
SurvivorStory.ShowInterlude(1,hero,Done);assert(LivePortraits()==2 and selectedUnit.id=='hsPP')
local scene=Local(SurvivorStory.Cleanup,'sceneEffects')
assert(scene[1].model==[[Units\Forsaken\HeroAnya\HeroAnya.mdl]] and scene[2].model==SurvivorStory.putressModel)
assert(scene[1].colorPlayer==Player(0)and scene[2].colorPlayer==Player(0),'Story actor effects share the native portraits red team')
SurvivorUI.SkipConversation();SurvivorUI.SkipConversation()
assert(completed==2 and selectedUnit==hero and hero.visible and LivePortraits()==0)
SurvivorStory.SetSummaryMode(true);SurvivorStory.ShowBriefing(hero,Done)
assert(LivePortraits()==0 and selectedUnit==nil,'Previously seen summary pages have a neutral portrait')
SurvivorUI.SkipConversation();assert(completed==3 and selectedUnit==hero)
SurvivorStory.SetSummaryMode(false)
failPortraitCreation=true
local ok,message=pcall(function()SurvivorStory.ShowBriefing(hero,Done)end)
assert(not ok and message:find('Missing story portrait')and completed==3)
assert(LivePortraits()==0 and selectedUnit==hero,'A failed second proxy allocation releases the first and restores hero selection')
SurvivorStory.ShowBriefing(hero,Done);failPortraitSelection=true
ok,message=pcall(SurvivorUI.AdvanceNarrative)
assert(not ok and message:find('portrait render failure')and LivePortraits()==0 and selectedUnit==hero)
SurvivorUI.HidePanel();SurvivorStory.Reset()
assert(LivePortraits()==0 and selectedUnit==hero,'Run error/reset cleanup is idempotent')
local clears=selectionClears;GetLocalPlayer=function()return 12 end
SurvivorStory.ShowBriefing(hero,Done);assert(LivePortraits()==2)
SurvivorUI.SkipConversation();assert(LivePortraits()==0 and selectionClears==clears,
    'Unit allocation/cleanup is synchronized while selection changes remain local')
`);

suite('story camera guards preserve live pans, cancel stale shots and restore exact native bounds on every exit',
    presentationMocks + String.raw`
cameraEvents={}
local nativeBounds=SetCameraBounds
function SetCameraBounds(...)
    if failCameraBounds then failCameraBounds=false;error('camera bounds failure')end
    nativeBounds(...);cameraEvents[#cameraEvents+1]={kind='bounds'}
end
function SetCameraPosition(x,y)
    cameraNative.x,cameraNative.y=x,y;cameraEvents[#cameraEvents+1]={kind='position',x=x,y=y}
end
function PanCameraToTimed(x,y,duration)
    if failCameraPan then failCameraPan=false;error('camera pan failure')end
    -- Leave the target in flight; a fast next-page click must use this actual target.
    lastPan={x=x,y=y,duration=duration};cameraEvents[#cameraEvents+1]={kind='pan'}
end
function ResetToGameCamera()cameraEvents[#cameraEvents+1]={kind='reset'}end
SurvivorStage.ScenePoint=function()return {x=-7500,y=7600}end
`, [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7680,7424,0)
local completed=0;local function Done()completed=completed+1 end
local saved={minX=-13051,minY=1797,maxX=-2307,maxY=13059}
cameraNative.minX,cameraNative.minY,cameraNative.maxX,cameraNative.maxY=saved.minX,saved.minY,saved.maxX,saved.maxY
local function Bounds(minX,minY,maxX,maxY)
    assert(cameraNative.minX==minX and cameraNative.minY==minY and cameraNative.maxX==maxX and cameraNative.maxY==maxY,
        'Unexpected camera bounds: '..cameraNative.minX..','..cameraNative.minY..','..cameraNative.maxX..','..cameraNative.maxY)
end
local function Restored()
    Bounds(saved.minX,saved.minY,saved.maxX,saved.maxY)
    assert(selectedUnit==hero and hero.visible~=false and cameraNative.x==hero.x and cameraNative.y==hero.y)
    assert(Local(SurvivorStory.Cleanup,'cameraGuardTimer')==nil)
    local n=#cameraEvents
    assert(cameraEvents[n-2].kind=='bounds'and cameraEvents[n-1].kind=='reset'and cameraEvents[n].kind=='position',
        'Restore the saved bounds before resetting and returning the camera to the hero')
end
local function GuardTimer()
    local timer=Local(SurvivorStory.Cleanup,'cameraGuardTimer')
    assert(timer and timer.running and not timer.destroyed and timer.dt==.48 and timer.repeated==false,
        'Each representative shot owns one synchronized one-shot timer')
    return timer
end
local function Cancelled(timer)
    assert(timer.destroyed and not timer.running)
    local writes,text=#cameraBoundsWrites,frames.HeroSurvivorStageText.text
    timer.callback()
    assert(#cameraBoundsWrites==writes and frames.HeroSurvivorStageText.text==text,
        'A cancelled callback must neither change camera bounds nor advance dialogue')
end
local function PanBounds(previousX,previousY)
    Bounds(math.min(previousX,lastPan.x)-64,math.min(previousY,lastPan.y)-64,
        math.max(previousX,lastPan.x)+64,math.max(previousY,lastPan.y)+64)
end
SurvivorStory.ShowBriefing(hero,Done)
local briefing=GuardTimer()
assert(not hero.visible and #Local(SurvivorStory.Cleanup,'sceneEffects')>=2,
    'The first briefing has real world actors and a hidden gameplay hero')
PanBounds(-7500,7380)
SurvivorUI.AdvanceNarrative();assert(GuardTimer()==briefing,'Dialogue page two keeps the established shot')
SurvivorUI.AdvanceNarrative();assert(GuardTimer()==briefing,'Inspection does not repeat the same pan')
SurvivorUI.AdvanceNarrative();local departure=GuardTimer();assert(departure~=briefing);Cancelled(briefing)
SurvivorUI.AdvanceNarrative();assert(completed==1);Restored();Cancelled(departure)

SurvivorStory.ShowInterlude(1,hero,Done)
local first=GuardTimer();PanBounds(-7500,7380)
cameraNative.x,cameraNative.y=-7243,7827
SurvivorUI.AdvanceNarrative();PanBounds(-7243,7827)
local second=GuardTimer();assert(second~=first);Cancelled(first)
local text=frames.HeroSurvivorStageText.text
AdvanceVisualTime(.6);Bounds(lastPan.x-64,lastPan.y-64,lastPan.x+64,lastPan.y+64)
assert(second.destroyed and Local(SurvivorStory.Cleanup,'cameraGuardTimer')==nil)
assert(frames.HeroSurvivorStageText.text==text and completed==1,'Settling a pan does not advance the story')
Cancelled(second)
SurvivorUI.AdvanceNarrative();assert(Local(SurvivorStory.Cleanup,'cameraGuardTimer')==nil,'An inspection uses the current shot')
SurvivorUI.AdvanceNarrative();local third=GuardTimer()
SurvivorStory.ShowInterlude(2,hero,Done)
local replacement=GuardTimer();assert(replacement~=third);Cancelled(third)
SurvivorUI.SkipConversation();assert(completed==2);Restored();Cancelled(replacement)

SurvivorStory.ShowEnding(hero,Done)
local endingTimer=GuardTimer()
for page=2,5 do
    cameraNative.x,cameraNative.y=lastPan.x-13,lastPan.y+17
    local previousX,previousY=cameraNative.x,cameraNative.y
    local previousTimer=endingTimer
    SurvivorUI.AdvanceNarrative();endingTimer=GuardTimer()
    if page==2 or page==5 then
        assert(endingTimer~=previousTimer);Cancelled(previousTimer);PanBounds(previousX,previousY)
    else assert(endingTimer==previousTimer,'Loading/inspection pages do not repeat a camera pan')end
end
assert(lastPan.x==-7180 and lastPan.y==7800 and completed==2)
SurvivorUI.AdvanceNarrative();assert(completed==3);Restored();Cancelled(endingTimer)

SurvivorStory.ShowInterlude(3,hero,Done);local resetTimer=GuardTimer()
SurvivorStory.Reset();Restored();Cancelled(resetTimer)
local writes=#cameraBoundsWrites;SurvivorStory.Cleanup()
assert(#cameraBoundsWrites==writes,'Repeated cleanup must not alter restored bounds')
SurvivorUI.HidePanel()

SurvivorStory.ShowInterlude(4,hero,Done);local errorTimer=GuardTimer()
failCameraPan=true
local ok,message=pcall(SurvivorUI.AdvanceNarrative)
assert(not ok and message:find('camera pan failure'));Restored();Cancelled(errorTimer)
local failedPageShot=timers[#timers]
assert(failedPageShot~=errorTimer);Cancelled(failedPageShot)
SurvivorUI.HidePanel()
SurvivorStory.ShowInterlude(1,hero,Done);local settleTimer=GuardTimer()
failCameraBounds=true;ok,message=pcall(settleTimer.callback)
assert(not ok and message:find('camera bounds failure'));Restored();Cancelled(settleTimer)
SurvivorUI.HidePanel()

local localWrites,clears=#cameraBoundsWrites,selectionClears
GetLocalPlayer=function()return 12 end
for _,name in ipairs({'GetCameraBoundMinX','GetCameraBoundMinY','GetCameraBoundMaxX','GetCameraBoundMaxY',
    'GetCameraTargetPositionX','GetCameraTargetPositionY','GetCameraField','SetCameraBounds','SetCameraPosition',
    'PanCameraToTimed','SetCameraField','ResetToGameCamera','SetCameraTargetController'})do
    _G[name]=function()error('Nonlocal camera mutation or capture: '..name)end
end
SurvivorStory.ShowInterlude(2,hero,Done)
local remoteFirst=GuardTimer();assert(LiveTimers(.03)==2,'All clients allocate one motion and one reveal timer')
SurvivorUI.AdvanceNarrative();local remoteSecond=GuardTimer();Cancelled(remoteFirst)
remoteSecond.callback();assert(remoteSecond.destroyed)
SurvivorUI.SkipConversation()
assert(completed==4 and #cameraBoundsWrites==localWrites and selectionClears==clears,
    'All clients allocate and cancel the same timers while camera and selection natives remain local')
`);

suite('manual dialogue, skip once, paused subtitles, risk visibility and per-stage transcript', presentationMocks,
    [config, 'src/30_gameplay/SurvivorStory.lua', 'src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local timerCount=#timers;SurvivorUI.Init();assert(#timers==timerCount,"Do not duplicate map UI timers")
state="STAGE_CLEAR"
local completed=0
SurvivorUI.ShowStageIntro(1,function()completed=completed+1 end)
assert(frames.ScriptDialogButton700.text=='장면 보기')
SurvivorUI.AdvanceNarrative() -- Static introduction now opens the four-line briefing.
assert(SurvivorUI.IsNarrativeVisible() and completed==0)
local first=frames.HeroSurvivorStageText.text
for i=1,300 do TickTimers()end
assert(frames.HeroSurvivorStageText.text==first and completed==0,"Time must never advance a dialogue page")
for i=1,3 do SurvivorUI.AdvanceNarrative();assert(completed==0)end
assert(frames.ScriptDialogButton700.text=='수색 준비','The final briefing action names the next preparation step')
SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation()
assert(completed==1 and not SurvivorUI.IsNarrativeVisible(),"Completion is consumed once")
local hero=CreateUnit(0,"hero",-7600,7400,0)
for stage=1,4 do
    finding=stage%2==0
    SurvivorStory.ShowInterlude(stage,hero,function()completed=completed+1 end)
    assert(hero.visible==false and frames.HeroSurvivorStageTitle.text:find("퓨트리스"))
    local effects=Local(SurvivorStory.Cleanup,"sceneEffects")
    assert(#effects>=2)
    for _=1,3 do SurvivorUI.AdvanceNarrative()end
    assert(frames.ScriptDialogButton700.text=='보상 선택')
    SurvivorUI.SkipConversation();SurvivorUI.SkipConversation()
    assert(hero.visible==true)
    for _,e in ipairs(effects)do assert(e.destroyed,"Story actor leaked")end
end
assert(completed==5)
SurvivorStory.ShowEnding(hero,function()completed=completed+1 end)
for i=1,4 do SurvivorUI.AdvanceNarrative();assert(completed==5)end
assert(frames.HeroSurvivorStageText.text:find("지하 묘실") and frames.HeroSurvivorStageText.text:find("이름"),
    'The ending records the transport while leaving the survivor unnamed')
assert(frames.ScriptDialogButton700.text=='결과 보기')
SurvivorUI.AdvanceNarrative();assert(completed==6 and hero.visible)
local journal=SurvivorStory.JournalChapters();local found,pages=false,0
for _,chapter in ipairs(journal)do
    for _,text in ipairs(chapter.pages)do pages=pages+1;if text:find("퓨트리스")then found=true end end
end
assert(found and pages>=25,"Skipped scenes remain available as short journal pages")

state="RUNNING";now=0;SurvivorUI.ClearSpeech();SurvivorStory.SetStage(2)
SurvivorUI.Say("안야","첫 번째 대사");SurvivorUI.Say("퓨트리스","두 번째 대사")
SurvivorUI.Notify("수색 완료 · 보상 지급")
SurvivorUI.UpdateSpeech();assert(frames.HSSpeech.visible and frames.HSNotice.visible)
assert(not frames.HeroSurvivorExpedition.visible)
riskVisible=true;SurvivorUI.UpdateSpeech();assert(frames.HeroSurvivorExpedition.visible,"Never conceal risk terms/countdown")
now=3;SurvivorUI.UpdateSpeech()
state="INVENTORY";for i=1,100 do TickTimers()end
assert(not frames.HSSpeech.visible and not frames.HSNotice.visible)
state="RUNNING";SurvivorUI.UpdateSpeech();assert(frames.HSSpeechText.text=="첫 번째 대사")
now=7.1;SurvivorUI.UpdateSpeech();assert(frames.HSSpeechText.text=="두 번째 대사")
now=14.2;SurvivorUI.UpdateSpeech();assert(not frames.HSSpeech.visible)
SurvivorUI.Say("안야","경고가 끝나면 이어지는 대사")
SurvivorUI.UpdateSpeech();now=15;SurvivorUI.UpdateSpeech()
SurvivorUI.Alert(3,"보스 공격 경고");SurvivorUI.Notify("경고 뒤에 표시할 장비 알림")
SurvivorUI.UpdateSpeech()
assert(not frames.HSSpeech.visible and frames.HSNoticeText.text:find("보스 공격"))
now=17;SurvivorUI.UpdateSpeech();assert(not frames.HSSpeech.visible)
now=18.1;SurvivorUI.UpdateSpeech()
assert(frames.HSSpeech.visible and frames.HSNoticeText.text=="경고 뒤에 표시할 장비 알림")
assert(Local(SurvivorUI.UpdateSpeech,"speech").remaining>4,"Warnings pause rather than consume reading time")
for i=1,20 do SurvivorUI.Say("안야","queued "..i)end
assert(#Local(SurvivorUI.Say,"speechQueue")==6,"Bound visible queue even when events arrive together")
SurvivorStory.Reset();SurvivorUI.UpdateSpeech()
assert(not frames.HSSpeech.visible and #SurvivorStory.JournalChapters()==0,"Restart must clear captions and transcript")
`);

suite('each clue branch and remembered summary retains current progress and the next destination', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7600,7400,0)
local destinations={'불타는 스트라솔름','스트라솔름 납골당','로데론 수도','로데론 수도 하수구'}
local progress={'무리와 갈라진 발자국','담장 가장자리로 발자국','납골당의 문은','스컬지 수색대도 같은 방향으로 그를'}
local completed=0
for index=1,4 do
    local defaultObservation
    for _,found in ipairs({false,true})do
        finding=found;SurvivorStory.SetSummaryMode(false)
        SurvivorStory.ShowInterlude(index,hero,function()completed=completed+1 end)
        assert(frames.HSStoryPosition.text:find('1/4'),'Both search outcomes retain four dialogue pages')
        local observation=frames.HeroSurvivorStageText.text
        if found then assert(observation~=defaultObservation,'Recovered evidence changes the observation')
        else defaultObservation=observation end
        for _=1,3 do SurvivorUI.AdvanceNarrative()end
        assert(frames.HeroSurvivorStageText.text:find(destinations[index],1,true),
            'The last line names the next destination even when optional evidence was recovered')
        assert(frames.HSStoryPosition.text:find('4/4'))
        SurvivorUI.AdvanceNarrative()
        SurvivorStory.SetSummaryMode(true)
        SurvivorStory.ShowInterlude(index,hero,function()completed=completed+1 end)
        assert(frames.HSStoryPosition.text:find('요약') and frames.HSStoryPosition.text:find('1/1'))
        local summary=frames.HeroSurvivorStageText.text
        assert(summary:find(destinations[index],1,true),'Seen summaries must retain their destination')
        assert(summary:find(found and '직접 확인한 수색 결과.' or progress[index],1,true),
            'Seen summaries keep confirmed current progress alongside the next objective')
        SurvivorUI.SkipConversation()
        assert(hero.visible)
    end
end
assert(completed==16)
local chapters=SurvivorStory.JournalChapters()
for index=1,4 do
    local found=false
    for _,chapter in ipairs(chapters)do
        for _,page in ipairs(chapter.pages)do if page:find(destinations[index],1,true)then found=true end end
    end
    assert(found,'Journal keeps the natural next-step dialogue after full scenes and summaries')
end
SurvivorStory.Reset();SurvivorUI.HidePanel()
`);

suite('choice hover stays local, uses bounded animation and cannot consume rerolls or exclusions', presentationMocks,
    [config,augments,'src/30_gameplay/SurvivorUI.lua'], String.raw`
local selected,rerolled,excluded=0,0,0
SurvivorUI.Init(function()selected=selected+1 end,function()end,function()rerolled=rerolled+1 end,
    function()end,function()excluded=excluded+1 end)
state='CHOOSING'
local build=SurvivorAugments.NewBuild('firebolt','power')
local offers={'firebolt','frontslash','haste'}
local function Show(rerolls)SurvivorUI.ShowChoices(offers,2,build,0,rerolls)end
local function Event(frame,event)
    for _,trigger in ipairs(triggers)do
        if trigger.frame==frame and trigger.event==event then trigger.action();return end
    end
    error('Missing mouse binding')
end
Show(3)
local reroll,exclude=frames.HeroSurvivorReroll2,frames.HeroSurvivorExclude2
local gold,orange,tip=frames.HSRerollHover2,frames.HSExcludeHover2,frames.HSChoiceActionTooltip
local timerCount=#timers;local width,height=reroll.width,reroll.height
local card=frames.HeroSurvivorCard2
Event(card,FRAMEEVENT_MOUSE_ENTER);AdvanceVisualTime(.14)
assert(frames.HSCardHover2.alpha==230 and not tip.visible and selected==0,
    'Hovering a card brightens only its border without selecting it')
assert(frames.HSCardHover2Top.width<card.width and frames.HSCardHover2Left.height<card.height,
    'Card borders keep an inset and do not expand the hit area')
Event(reroll,FRAMEEVENT_MOUSE_ENTER)
assert(tip.visible and frames.HSChoiceActionTooltipText.text:find('리롤 기회'))
AdvanceVisualTime(.04);assert(gold.alpha>0 and gold.alpha<230)
AdvanceVisualTime(.1);assert(gold.alpha==230 and LiveTimers(.02)==0)
assert(frames.HSCardHover2.alpha==0,'Moving from the card to its action button clears the card highlight')
assert(reroll.width==width and reroll.height==height and frames.HeroSurvivorRerollText2.textColor.g==220)
Event(reroll,FRAMEEVENT_MOUSE_DOWN);assert(frames.QuestButtonBaseTemplate202.color.r==165)
Event(exclude,FRAMEEVENT_MOUSE_ENTER);AdvanceVisualTime(.14)
assert(frames.QuestButtonBaseTemplate202.color.r==255 and gold.alpha==0 and orange.alpha==230,
    'Moving to another button clears pressed styling even without the old Mouse Up')
assert(frames.HeroSurvivorExcludeText2.textColor.g==165 and frames.HSChoiceActionTooltipText.text:find('다시 등장하지'))
Event(reroll,FRAMEEVENT_MOUSE_LEAVE);assert(tip.visible,'A late leave from the old button preserves the current tooltip')
Event(exclude,FRAMEEVENT_MOUSE_LEAVE);AdvanceVisualTime(.14)
assert(orange.alpha==0 and not tip.visible and LiveTimers(.02)==0)
assert(selected==0 and rerolled==0 and excluded==0 and build.excludesRemaining==SurvivorConfig.excludesPerRun)
Event(frames.HeroSurvivorExclude1,FRAMEEVENT_MOUSE_ENTER);AdvanceVisualTime(.14)
assert(frames.HSExcludeHover1.alpha==0 and not tip.visible,'Owned upgrades cannot be highlighted or excluded')
Event(exclude,FRAMEEVENT_MOUSE_ENTER);Event(exclude,FRAMEEVENT_MOUSE_DOWN)
Event(exclude,FRAMEEVENT_MOUSE_UP);assert(frames.QuestButtonBaseTemplate402.color.r==255)
ClickFrame(exclude);assert(excluded==1 and orange.alpha==0 and not tip.visible)
Show(3);ClickFrame(reroll)
assert(rerolled==1 and gold.alpha==0 and not tip.visible,'An available reroll reaches its gameplay callback once')
Event(reroll,FRAMEEVENT_MOUSE_ENTER);Show(0);AdvanceVisualTime(.14)
assert(gold.alpha==0 and not tip.visible and not reroll.enabled)
Event(reroll,FRAMEEVENT_MOUSE_ENTER);ClickFrame(reroll);AdvanceVisualTime(.14)
assert(gold.alpha==0 and not tip.visible and rerolled==1,'A disabled reroll cannot consume a charge')
Show(3);GetLocalPlayer=function()return 12 end
Event(reroll,FRAMEEVENT_MOUSE_ENTER);AdvanceVisualTime(.14)
assert(gold.alpha==0 and not tip.visible and LiveTimers(.02)==0,'Mouse feedback is local to the playable client')
GetLocalPlayer=function()return 0 end
Event(reroll,FRAMEEVENT_MOUSE_ENTER);AdvanceVisualTime(.04)
local feedbackTimer=Local(SurvivorUI.HidePanel,'actionTimer')
SurvivorUI.HidePanel();feedbackTimer.callback()
assert(gold.alpha==0 and orange.alpha==0 and not tip.visible and LiveTimers(.02)==0)
Show(3);Event(card,FRAMEEVENT_MOUSE_ENTER);AdvanceVisualTime(.14)
ClickFrame(frames.HeroSurvivorCard2)
assert(selected==1 and gold.alpha==0 and frames.HSCardHover2.alpha==0 and not tip.visible and #timers==timerCount,
    'Selections and repeated hovers reuse the map-lifetime timer and clear all feedback')
`);

suite('dialogue and notification content stays inside framed panels across layout switches', presentationMocks,
    [config, 'src/30_gameplay/SurvivorStory.lua', 'src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local function Inside(text,panel)
    assert(text.anchor and text.anchor.target==panel, 'Text must follow its own panel')
    assert(text.anchor.point==FRAMEPOINT_TOP and text.anchor.targetPoint==FRAMEPOINT_TOP)
    assert((text.scale or 1)==1, 'No scaled screen-relative text offsets')
    assert(text.width<=panel.width-0.02, 'Horizontal text padding')
    assert(-text.anchor.y>=0.009 and -text.anchor.y+text.height<=panel.height-0.009, 'Vertical text padding')
end
for _,pair in ipairs({{'HSSpeech','CustomTooltipBackgroundTemplate710'},{'HSNotice','CustomTooltipBackgroundTemplate711'},
    {'HSExpedition','CustomTooltipBackgroundTemplate715'},
    {'HeroSurvivorCaption','CustomTooltipBackgroundTemplate712'}})do
    local panel,skin=frames[pair[1]],frames[pair[2]]
    assert(skin.parent==panel and skin.allPoints==panel)
    assert(not skin.texture, 'Keep the template border and textured background')
    assert(panel.enabled==false and skin.enabled==false, 'Decorative panels must not consume clicks')
end
Inside(frames.HSSpeechName,frames.HSSpeech)
Inside(frames.HSSpeechText,frames.HSSpeech)
Inside(frames.HSNoticeText,frames.HSNotice)
assert(frames.HSNotice.width<=0.30 and frames.HSNotice.height>=0.042 and frames.HSNotice.height<=0.094,
    'An idle notice starts compact instead of reserving a large empty panel')
state='RUNNING'
SurvivorUI.Notify('단서 확보');SurvivorUI.UpdateSpeech();local short=frames.HSNotice.height
assert(math.abs(short-.042)<.00001)
SurvivorUI.Notify('|cff80d5bc첫째 줄|r\n둘째 줄\n셋째 줄');SurvivorUI.UpdateSpeech()
assert(frames.HSNotice.height>short and frames.HSNotice.height<.094,'Notice padding follows the actual number of lines')
Inside(frames.HSNoticeText,frames.HSNotice)
local colored=frames.HSNotice.height
SurvivorUI.Notify('첫째 줄\n둘째 줄\n셋째 줄');SurvivorUI.UpdateSpeech()
assert(frames.HSNotice.height==colored,'Color escapes never enlarge visible text')
SurvivorUI.ClearSpeech()
assert(frames.HSSpeech.width<=0.54 and frames.HeroSurvivorCaption.width<=0.54,'Dialogue stays compact')
state='STAGE_CLEAR'
for i=1,3 do
    SurvivorUI.ShowConversation('수색',{{speaker='퓨트리스',text='대사 한 줄'}},function()end)
    Inside(frames.HeroSurvivorStageTitle,frames.HeroSurvivorCaption)
    Inside(frames.HeroSurvivorStageText,frames.HeroSurvivorCaption)
    assert(frames.HeroSurvivorStageText.vertical==TEXT_JUSTIFY_TOP)
    for _,name in ipairs({'ScriptDialogButton700','ScriptDialogButton701'})do
        local button=frames[name];assert(button.anchor.target==frames.HeroSurvivorCaption)
        assert(button.anchor.point==FRAMEPOINT_TOP and button.anchor.targetPoint==FRAMEPOINT_TOP)
        assert(-button.anchor.y+button.height<=frames.HeroSurvivorCaption.height-0.007,'Dialogue controls stay inside the panel')
    end
    SurvivorUI.SkipConversation()
    SurvivorUI.ShowNarrative('정적 안내','본문',function()end,'안내','수색 준비')
    assert(frames.HeroSurvivorStageText.anchor.target==frames.HeroSurvivorStoryContent)
    assert(frames.ScriptDialogButton700.absolute==FRAMEPOINT_CENTER and not frames.ScriptDialogButton700.anchor)
    SurvivorUI.AdvanceNarrative()
end
`);

suite('seen scenes summarize only by preference while new clue branches and full journal remain available', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local completed=0
local function Done()completed=completed+1 end
SurvivorStory.SetSummaryMode(true)
SurvivorStory.ShowBriefing(Done)
assert(frames.HSStoryPosition.text:find('1/4') and not frames.HSStoryPosition.text:find('요약'),'First viewing stays complete')
SurvivorUI.SkipConversation();SurvivorStory.Reset()
SurvivorStory.ShowBriefing(Done)
assert(frames.HSStoryPosition.text:find('요약') and frames.HSStoryPosition.text:find('1/1'))
assert(frames.ScriptDialogButton700.text=='수색 준비','A one-page summary retains the same next-step action label')
local chapters=SurvivorStory.JournalChapters()
assert(#chapters==1 and #chapters[1].pages==4,'A summarized scene retains every full utterance in the journal')
local saved=chapters[1].pages[1];chapters[1].pages[1]='mutated'
assert(SurvivorStory.JournalChapters()[1].pages[1]==saved,'Journal returns independent presentation data')
SurvivorUI.AdvanceNarrative();assert(completed==2)
local hero=CreateUnit(0,'hero',-7600,7400,0)
SurvivorStage.ScenePoint=function()return {x=-8200,y=7000}end
finding=nil;SurvivorStory.ShowInterlude(4,hero,Done)
assert(frames.HSStoryPosition.text:find('1/4') and not frames.HSStoryPosition.text:find('요약'))
local effects=Local(SurvivorStory.Cleanup,'sceneEffects')
AdvanceVisualTime(.6)
local anya=effects[1];local startX,startY=anya.x,anya.y
SurvivorUI.AdvanceNarrative()
assert(anya.x==startX and anya.y==startY,'Starting a new action does not teleport its actor')
AdvanceVisualTime(.6)
assert(anya.x~=startX or anya.y~=startY,'The next manual page moves an actor after its visual action settles')
SurvivorUI.SkipConversation();SurvivorStory.Reset()
SurvivorStory.ShowInterlude(4,hero,Done)
assert(frames.HSStoryPosition.text:find('요약'))
SurvivorUI.SkipConversation();SurvivorStory.Reset()
finding=true;SurvivorStory.ShowInterlude(4,hero,Done)
assert(frames.HSStoryPosition.text:find('1/4') and not frames.HSStoryPosition.text:find('요약'),'A newly recovered order deserves its full scene')
assert(frames.HeroSurvivorStageText.text:find('명령서'))
SurvivorUI.SkipConversation();SurvivorStory.Reset();SurvivorStory.SetSummaryMode(false)
SurvivorStory.ShowBriefing(Done);assert(frames.HSStoryPosition.text:find('1/4'))
SurvivorUI.SkipConversation()
assert(hero.visible and #Local(SurvivorStory.Cleanup,'sceneEffects')==0)
`);

suite('stage arrivals stage both companions in the new place, wait for clicks and lead to preparation', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local completed=0
local hero=CreateUnit(0,'hero',-7600,7400,0)
for index=2,5 do
    SurvivorStory.SetSummaryMode(false)
    SurvivorUI.ShowStageIntro(index,function()completed=completed+1 end,hero)
    local effects=Local(SurvivorStory.Cleanup,'sceneEffects');local anya,putress=effects[1],effects[2]
    assert(not hero.visible and frames.HSStoryPosition.text:find('1/3')and frames.ScriptDialogButton700.text=='다음 대사')
    local putressX=putress.x
    for i=1,100 do TickTimers()end
    assert(completed==index-2,'Arrivals never advance on their own')
    AdvanceVisualTime(.7)
    assert(anya.x~=-7600-430 and (index==5)==(putress.x==putressX),'Both walk in, except Putress already waiting in the sewer')
    SurvivorUI.AdvanceNarrative();AdvanceVisualTime(.6);SurvivorUI.AdvanceNarrative();AdvanceVisualTime(.7)
    assert(frames.ScriptDialogButton700.text=='수색 준비'and frames.HSStoryPosition.text:find('3/3'))
    SurvivorUI.AdvanceNarrative()
    assert(completed==index-1 and hero.visible)
    for _,effect in ipairs(effects)do assert(effect.destroyed,'An arrival scene effect leaked')end
    -- A seen arrival can collapse to its one-page summary, which keeps the stage mission.
    SurvivorStory.SetSummaryMode(true);SurvivorUI.ShowStageIntro(index,function()completed=completed+1 end,hero)
    assert(frames.HSStoryPosition.text:find('요약')and frames.HeroSurvivorStageText.text:find('mission'))
    SurvivorUI.AdvanceNarrative();assert(completed==index and hero.visible)
    completed=completed-1
end
local found=0
for _,chapter in ipairs(SurvivorStory.JournalChapters())do
    for _,page in ipairs(chapter.pages)do if page:find('퓨트리스')then found=found+1 end end
end
assert(found>=4,'Arrival dialogue is kept in the journal of its own stage')
`);

suite('ending transport preparation and joint departure advance only on explicit dialogue pages', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local completed=0
local hero=CreateUnit(0,'hero',-7600,7400,0)
SurvivorStory.ShowEnding(hero,function()completed=completed+1 end)
local effects=Local(SurvivorStory.Cleanup,'sceneEffects')
local anya,putress,figure,cart=effects[1],effects[2],effects[3],effects[4]
assert(#effects<=96 and cart.model==SurvivorStory.transportModel and cart.alpha==0 and not hero.visible)
assert(anya.model==[[Units\Forsaken\HeroAnya\HeroAnya.mdl]] and anya.colorPlayer==Player(0)and putress.colorPlayer==Player(0),
    'The ending uses the same native Anya model and red team for both companions')
assert(figure.model==[[Units\Forsaken\Hero_ForsakenGarek\Hero_ForsakenGarek.mdl]],'The fallen figure is Garek, still unnamed in dialogue')
local initialX,initialY=cart.x,cart.y
for i=1,100 do TickTimers()end
assert(cart.x==initialX and cart.y==initialY and cart.alpha==0 and completed==0,'Timer ticks cannot move the scene ahead')
SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative()
AdvanceVisualTime(.7)
assert(cart.alpha==255 and (cart.x~=initialX or cart.y~=initialY) and figure.z==75,'Page four visibly prepares transport')
local preparedX,preparedY=cart.x,cart.y
SurvivorUI.AdvanceNarrative()
AdvanceVisualTime(.7)
assert(cart.x>preparedX and cart.y>preparedY and anya.x<cart.x and putress.x>cart.x,'Both companions depart alongside the transport')
assert(frames.HeroSurvivorStageText.text:find('지하 묘실') and completed==0)
SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation()
assert(completed==1 and hero.visible)
for _,effect in ipairs(effects)do assert(effect.destroyed,'An ending scene effect leaked')end
-- Page three is Anya's line, so Anya (not Putress) moves; the sewer seal search changes page four.
for _,found in ipairs({false,true})do
    finding=found;SurvivorStory.ShowEnding(hero,function()completed=completed+1 end)
    effects=Local(SurvivorStory.Cleanup,'sceneEffects');anya,putress=effects[1],effects[2]
    SurvivorUI.AdvanceNarrative();AdvanceVisualTime(.7)
    local putressX,putressY,anyaX=putress.x,putress.y,anya.x
    SurvivorUI.AdvanceNarrative();AdvanceVisualTime(.7)
    assert(frames.HeroSurvivorStageText.text:find('물어보자')and putress.x==putressX and putress.y==putressY and anya.x~=anyaX)
    SurvivorUI.AdvanceNarrative()
    assert((frames.HeroSurvivorStageText.text:find('사슬을 풀어')~=nil)==found,'Only a completed seal search changes the cart line')
    SurvivorUI.SkipConversation()
end
finding=nil
`);

suite('actor actions ease between manual pages, use Walk and Spell then Stand, and remain bounded with reusable quiet cues',
    presentationMocks + String.raw`
SurvivorStage.ScenePoint=function()return {x=0,y=0}end
`, [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7680,7424,0);local completed=0
local function Done()completed=completed+1 end
local function Near(a,b)assert(math.abs(a-b)<1e-6,'Unexpected interpolated position '..a..' vs '..b)end
SurvivorStory.ShowBriefing(hero,Done)
local effects=Local(SurvivorStory.Cleanup,'sceneEffects');local anya,putress=effects[1],effects[2]
assert(anya.x==-160 and anya.y==95 and putress.x==125 and putress.y==165 and not hero.visible)
AdvanceVisualTime(.18)
assert(putress.yaw>1 and putress.yaw<math.pi and putress.x==125 and putress.y==165,
    'A turn across the -pi/pi boundary follows the shorter arc without moving the actor')
AdvanceVisualTime(.18)
assert(#soundHandles==0,'Turning in place does not emit footsteps')
SurvivorUI.AdvanceNarrative()
local motion=Local(SurvivorStory.Cleanup,'motion');local timer=motion.timer
assert(timer.dt==.03 and timer.repeated and anya.animation==ANIM_TYPE_WALK and anya.x==-160 and anya.y==95)
local page=frames.HeroSurvivorStageText.text
AdvanceVisualTime(.09)
local eased=(1/6)^2*(3-2/6)
Near(anya.x,-160+90*eased);Near(anya.y,95+70*eased)
assert(anya.x>-160 and anya.x<-70 and #soundHandles==0,'The actor visibly traverses the route before its first step cue')
AdvanceVisualTime(.45)
assert(anya.x==-70 and anya.y==165 and anya.animation==ANIM_TYPE_STAND and timer.destroyed)
assert(Local(SurvivorStory.Cleanup,'motion')==nil and #soundHandles==2)
for _,sound in ipairs(soundHandles)do
    assert(sound.path:find('HeroStep')and sound.volume==18 and not sound.loop and not sound.threeD and sound.starts==1)
end
assert(now==0 and completed==0 and frames.HeroSurvivorStageText.text==page,'Motion never advances paused gameplay or dialogue')
SurvivorUI.AdvanceNarrative()
assert(putress.animation==ANIM_TYPE_SPELL and putress.x==125 and putress.y==165)
AdvanceVisualTime(.48)
assert(putress.animation==ANIM_TYPE_STAND and #soundHandles==3 and soundHandles[3].volume==14
    and soundHandles[3].path==[[Sound\Interface\PickUpItem.wav]])
SurvivorUI.AdvanceNarrative();AdvanceVisualTime(.66)
assert(anya.x==80 and anya.y==220 and putress.x==125 and putress.y==165 and #soundHandles==3)
assert(soundHandles[1].starts==2 and soundHandles[2].starts==2,'The same two step handles are reused on the next action')
assert(LiveTimers(.03)==0 and LiveTimers()==1,'Settled scenes retain only the map lifetime speech timer')
SurvivorUI.SkipConversation();assert(completed==1 and hero.visible)
for _,sound in ipairs(soundHandles)do assert(sound.killed,'Cleanup releases every optional scene cue')end
SurvivorStory.SetSummaryMode(true);SurvivorStory.ShowBriefing(hero,Done)
local summaryEffects=Local(SurvivorStory.Cleanup,'sceneEffects')
assert(summaryEffects[1].x==80 and summaryEffects[1].y==220 and #soundHandles==3
    and Local(SurvivorStory.Cleanup,'motion')==nil,'Seen summaries apply the final pose immediately with no choreography or sound')
AdvanceVisualTime(3);assert(#soundHandles==3 and completed==1)
SurvivorUI.SkipConversation();assert(completed==2)
`);

suite('rapid page clicks settle old poses and cancel old motion before new actions or restarts', presentationMocks + String.raw`
SurvivorStage.ScenePoint=function()return {x=0,y=0}end
`, [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7680,7424,0);local completed=0
SurvivorStory.ShowEnding(hero,function()completed=completed+1 end)
local effects=Local(SurvivorStory.Cleanup,'sceneEffects');local anya,putress,figure,cart=effects[1],effects[2],effects[3],effects[4]
local first=Local(SurvivorStory.Cleanup,'motion').timer
AdvanceVisualTime(.09);assert(anya.x>-180 and anya.x<-70)
SurvivorUI.AdvanceNarrative()
assert(first.destroyed and anya.x==-70 and anya.y==170,'An interrupted action settles its old target before the next page')
local second=Local(SurvivorStory.Cleanup,'motion').timer
local x,y=putress.x,putress.y;first.callback()
assert(putress.x==x and putress.y==y and Local(SurvivorStory.Cleanup,'motion').timer==second)
SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative()
local loading=Local(SurvivorStory.Cleanup,'motion').timer
assert(cart.alpha==255 and cart.x==-230 and figure.z~=75,'Loading is a visible action rather than an instant relocation')
AdvanceVisualTime(.33)
assert(cart.x>-230 and cart.x<20 and figure.z>0 and figure.z<75)
AdvanceVisualTime(.33);assert(cart.x==20 and cart.y==290 and figure.z==75 and loading.destroyed)
SurvivorUI.AdvanceNarrative();local departing=Local(SurvivorStory.Cleanup,'motion').timer
AdvanceVisualTime(.33)
assert(math.abs(cart.x-210)<1e-6 and math.abs(cart.y-397.5)<1e-6 and completed==0)
AdvanceVisualTime(.33)
assert(cart.x==400 and cart.y==505 and anya.x==250 and putress.x==550 and figure.z==75)
local text=frames.HeroSurvivorStageText.text;departing.callback()
assert(cart.x==400 and frames.HeroSurvivorStageText.text==text and completed==0)
SurvivorUI.SkipConversation();assert(completed==1 and hero.visible)
for i=1,12 do
    SurvivorStory.ShowInterlude(i%4+1,hero,function()completed=completed+1 end)
    local old=Local(SurvivorStory.Cleanup,'motion').timer
    assert(LiveTimers(.03)==2 and LiveTimers()==4,'Only one actor, one reveal and one camera transition can be live')
    SurvivorStory.Reset();SurvivorUI.HidePanel()
    old.callback();assert(hero.visible and LiveTimers()==1 and #Local(SurvivorStory.Cleanup,'sceneEffects')==0)
end
`);

suite('story visual errors cancel callbacks and cleanup continues through timer and actor native failures', presentationMocks + String.raw`
SurvivorStage.ScenePoint=function()return {x=0,y=0}end
`, [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7680,7424,0);selectedUnit=hero
SurvivorStory.ShowInterlude(1,hero,function()end)
local scene=Local(SurvivorStory.Cleanup,'sceneEffects')
local old=Local(SurvivorStory.Cleanup,'motion').timer;local camera=Local(SurvivorStory.Cleanup,'cameraGuardTimer')
local location=Local(SurvivorStory.Cleanup,'sceneLocation')
local timerDestroy,effectDestroy=DestroyTimer,DestroyEffect
function DestroyTimer(timer)if timer==old then error('motion destroy failure')end;timerDestroy(timer)end
function DestroyEffect(effect)if effect==scene[1]then error('actor destroy failure')end;effectDestroy(effect)end
local ok,message=pcall(SurvivorStory.Cleanup)
assert(not ok and message:find('motion destroy failure')and message:find('actor destroy failure'))
assert(not old.running and camera.destroyed and location.removed and hero.visible and selectedUnit==hero)
for index=2,#scene do assert(scene[index].destroyed,'A failed native must not abandon later actors')end
assert(Local(SurvivorStory.Cleanup,'motion')==nil and Local(SurvivorStory.Cleanup,'cameraGuardTimer')==nil)
DestroyTimer,DestroyEffect=timerDestroy,effectDestroy;effectDestroy(scene[1]);timerDestroy(old)
SurvivorUI.HidePanel();SurvivorStory.ShowBriefing(hero,function()end)
local fresh=Local(SurvivorStory.Cleanup,'sceneEffects');local x,y=fresh[1].x,fresh[1].y
old.callback();assert(fresh[1].x==x and fresh[1].y==y,'An old failed-destroy callback cannot touch a new scene')
SurvivorUI.SkipConversation()
SurvivorStory.ShowInterlude(2,hero,function()end)
local failed=Local(SurvivorStory.Cleanup,'motion').timer;local position=BlzSetSpecialEffectPosition
function BlzSetSpecialEffectPosition()error('visual position failure')end
RunSession.Fail=function(errorMessage)SurvivorUI.HidePanel();error(errorMessage)end
ok,message=pcall(function()AdvanceVisualTime(.03)end)
assert(not ok and message:find('visual position failure')and hero.visible and selectedUnit==hero and failed.destroyed)
BlzSetSpecialEffectPosition=position
failed.callback();assert(LiveTimers()==1 and not SurvivorUI.IsNarrativeVisible())
local play=BlzPlaySpecialEffect
function BlzPlaySpecialEffect(effect,animation)
    if animation==ANIM_TYPE_SPELL then error('missing model gesture')end;play(effect,animation)
end
SurvivorStory.ShowBriefing(hero,function()end);SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative()
assert(Local(SurvivorStory.Cleanup,'sceneEffects')[2].animation==ANIM_TYPE_STAND,'A failed optional gesture falls back to idle')
SurvivorUI.SkipConversation()
local effectAlpha,unitVisibility,effectPosition=BlzSetSpecialEffectAlpha,ShowUnit,BlzSetSpecialEffectPosition
for _,fault in ipairs({'effect hide','effect sink','portrait hide'})do
    SurvivorStory.ShowBriefing(hero,function()end)
    local retiring=Local(SurvivorStory.Cleanup,'sceneEffects')
    local proxies=Local(SurvivorStory.Cleanup,'portraitUnits')
    local firstProxy=proxies['안야']
    local hiddenEffects,hiddenUnits,sunkEffects={},{},{}
    function BlzSetSpecialEffectAlpha(effect,value)
        if value==0 then
            hiddenEffects[effect]=true
            if fault=='effect hide'and effect==retiring[1]then error('injected effect hide failure')end
        end
        effectAlpha(effect,value)
    end
    function BlzSetSpecialEffectPosition(effect,x,y,z)
        if z==-10000 then
            assert(hiddenEffects[effect],'Attempt opacity before moving lingering emitters below the terrain')
            sunkEffects[effect]=true
            if fault=='effect sink'and effect==retiring[1]then error('injected effect sink failure')end
        end
        effectPosition(effect,x,y,z)
    end
    function ShowUnit(unit,value)
        if not value and excludedPortraitTypes[unit.id]then
            hiddenUnits[unit]=true
            if fault=='portrait hide'and unit==firstProxy then error('injected portrait hide failure')end
        end
        unitVisibility(unit,value)
    end
    function DestroyEffect(effect)
        assert(hiddenEffects[effect]and sunkEffects[effect],
            'Effect removal must still follow attempted opacity and position writes when either fails')
        effectDestroy(effect)
    end
    local nativeRemove=RemoveUnit
    function RemoveUnit(unit)
        if excludedPortraitTypes[unit.id]then
            assert(hiddenUnits[unit],'Proxy removal must still follow an attempted hide when visibility fails')
        end
        nativeRemove(unit)
    end
    ok,message=pcall(SurvivorStory.Cleanup)
    assert(not ok and message:find('injected '..fault..' failure')and hero.visible and selectedUnit==hero)
    for _,effect in ipairs(retiring)do
        assert(effect.destroyed,'A failed hide must not prevent destroying that effect or later actors')
        if fault~='effect hide'or effect~=retiring[1]then assert(effect.alpha==0)end
        if fault~='effect sink'or effect~=retiring[1]then assert(effect.z==-10000)end
    end
    for _,unit in pairs(proxies)do
        assert(unit.removed,'A failed hide must not prevent removing that proxy or later units')
        if fault~='portrait hide'or unit~=firstProxy then assert(unit.visible==false)end
    end
    assert(Local(SurvivorStory.Cleanup,'motion')==nil and Local(SurvivorStory.Cleanup,'cameraGuardTimer')==nil
        and Local(SurvivorStory.Cleanup,'sceneLocation')==nil)
    BlzSetSpecialEffectAlpha,ShowUnit,BlzSetSpecialEffectPosition,DestroyEffect,RemoveUnit=
        effectAlpha,unitVisibility,effectPosition,effectDestroy,nativeRemove
    SurvivorUI.HidePanel();SurvivorStory.Cleanup();assert(LiveTimers(.03)==0)
end
`);

for (const fault of ['missingCreateSound','nil','zero','create','volume','start','stop']) {
    suite('optional story cues tolerate ' + fault + ' sound natives without affecting progression or cleanup', presentationMocks + String.raw`
SurvivorStage.ScenePoint=function()return {x=0,y=0}end
` + (fault === 'missingCreateSound' ? 'CreateSound=nil\n' : fault === 'nil' ? 'soundUnavailable=true\n'
    : fault === 'zero' ? 'CreateSound=function()return 0 end\n' : 'sound' + fault[0].toUpperCase() + fault.slice(1) + 'Error=true\n'),
        [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7680,7424,0);local completed=0
SurvivorStory.ShowInterlude(1,hero,function()completed=completed+1 end)
AdvanceVisualTime(.6);SurvivorUI.AdvanceNarrative();AdvanceVisualTime(.6)
assert(completed==0 and #soundHandles<=2 and now==0)
SurvivorUI.SkipConversation();AdvanceVisualTime(.65);assert(completed==1 and hero.visible and LiveTimers()==1)
local count=#soundHandles;GetLocalPlayer=function()return 12 end
SurvivorStory.ShowInterlude(2,hero,function()completed=completed+1 end);AdvanceVisualTime(.6)
assert(#soundHandles==count,'Optional sounds never allocate on a nonlocal client')
SurvivorUI.SkipConversation();AdvanceVisualTime(.65);assert(completed==2 and hero.visible and LiveTimers()==1)
`);
}

suite('concurrent urgent warnings preserve priority, deadlines, key updates and paused reading time', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='RUNNING';now=0
SurvivorUI.Say('안야','전투 중 읽던 대사');SurvivorUI.UpdateSpeech()
now=1;SurvivorUI.UpdateSpeech()
local before=Local(SurvivorUI.UpdateSpeech,'speech').remaining
SurvivorUI.Alert(2,'지원병 합류',70,'support')
SurvivorUI.Alert(3,'통로 옆으로 회피',100,'pattern')
SurvivorUI.UpdateSpeech()
local text=frames.HSNoticeText.text
assert(text:find('통로 옆으로 회피')<text:find('지원병 합류'),'The most urgent warning appears first')
assert(not frames.HSSpeech.visible and not frames.HSEssentialHUD.visible and not frames.HSEscapeState,
    'A warning does not bring back the removed escape status or an empty top panel')
assert(frames.HSNotice.width<=0.29 and frames.HSNotice.height>.042 and frames.HSNotice.height<=.132,
    'Concurrent warnings reserve only the lines they use')
SurvivorUI.Alert(3,'수정된 회피 안내',100,'pattern');SurvivorUI.UpdateSpeech()
assert(#Local(SurvivorUI.Alert,'alerts')==2 and not frames.HSNoticeText.text:find('통로 옆으로 회피'),'Same key refreshes its warning')
state='INVENTORY';for i=1,100 do TickTimers()end
assert(#Local(SurvivorUI.Alert,'alerts')==2 and Local(SurvivorUI.UpdateSpeech,'speech').remaining==before,'Paused run time never expires a warning')
state='RUNNING';now=3.1;SurvivorUI.UpdateSpeech()
assert(frames.HSNoticeText.text:find('수정된 회피 안내') and not frames.HSNoticeText.text:find('지원병 합류'),'Expired support warnings are not replayed')
now=4.1;SurvivorUI.UpdateSpeech()
assert(frames.HSSpeech.visible and not frames.HSNotice.visible)
for i=1,20 do SurvivorUI.Alert(4,'alert '..i,i,'key '..i)end
assert(#Local(SurvivorUI.Alert,'alerts')==8,'Bound urgent warning handles and state')
SurvivorUI.Alert(4,'highest',1000,'top');SurvivorUI.UpdateSpeech()
assert(frames.HSNoticeText.text:find('highest') and not frames.HSNoticeText.text:find('alert 1\n'))
SurvivorUI.ClearSpeech();SurvivorUI.UpdateSpeech()
assert(#Local(SurvivorUI.Alert,'alerts')==0 and not frames.HSNotice.visible and not frames.HSSpeech.visible)
`);

suite('safe essential HUD preserves native statistics controls and separates risk terms from nearby frames', presentationMocks + String.raw`
SurvivorCombat.DamageRows=function()return {}end
SurvivorCombat.BossStatus=function()return bossStatus end
`, [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='RUNNING';now=0
local build={weapons={},evolutions={}}
SurvivorUI.UpdateDamageBoard(build,3,200,2,'normal');SurvivorUI.UpdateSpeech()
local board=Local(SurvivorUI.UpdateDamageBoard,'damageBoard')
assert(not frames.HSEssentialHUD.visible and not frames.HSEscapeState and not frames.HSEssentialTime and board.visible,
    'Ordinary combat has no escape frame, empty top panel or duplicate timer')
assert(board.title:find('1:40') and board.title:find('S3/5'),'The native board title retains the remaining stage time')
assert(board.minimized and board.minimizeCalls==1,'Native statistics begin collapsed once when their board is created')
assert(SurvivorUI.ToggleStatistics==nil and not frames.ScriptDialogButton714,'Remove the extra custom statistics control')
local hud=frames.HSEssentialHUD
assert(hud.absolute==FRAMEPOINT_TOP and hud.y<=.54 and hud.y<.55,'Keep custom HUD below the native menu and time orb')
local function SafeLeftLane()
    local notice=frames.HSNotice
    assert(hud.x-hud.width/2-(notice.x+notice.width)>=.01-.00001,'Left notifications cannot overlap the essential HUD')
end
SafeLeftLane()
-- Model the player's native expand control; updates must retain that choice.
MultiboardMinimize(board,false)
SurvivorUI.UpdateDamageBoard(build,3,201,2,'normal');SurvivorUI.UpdateSpeech()
assert(board.visible and not board.minimized and board.minimizeCalls==2,'Refreshes never undo native expansion')
for _,paused in ipairs({'INVENTORY','FINISHED','CHOOSING'})do
    state=paused;SurvivorUI.UpdateSpeech();assert(not board.visible,'Fold statistics in '..paused..' even when quiet state has not changed')
    state='RUNNING';SurvivorUI.UpdateSpeech();assert(board.visible and not board.minimized,'Restore native statistics after '..paused)
end
SetLocal(SurvivorUI.UpdateSpeech,'choosing',true);SurvivorUI.UpdateSpeech();assert(not board.visible)
SetLocal(SurvivorUI.UpdateSpeech,'choosing',false);SurvivorUI.UpdateSpeech();assert(board.visible)
SurvivorUI.ShowConversation('정지된 장면',{{speaker='안야',text='대사'}},function()end)
SurvivorUI.UpdateSpeech();assert(not board.visible,'Statistics never cover a manually advanced scene')
SurvivorUI.SkipConversation();SurvivorUI.UpdateSpeech();assert(board.visible)
bossStatus={name='감시자',current=250,max=1000,enraged=true}
SurvivorUI.UpdateDamageBoard(build,5,250,2,'normal')
assert(frames.HSBossName.visible and frames.HSBossName.text:find('25%%') and frames.HSBossName.text:find('광폭화'))
assert(math.abs(frames.HSBossFill.width/frames.HSBossTrack.width-.25)<.01,'Boss health fill represents current health')
assert(math.abs(hud.height-.042)<.0001 and hud.y<=.54,'Boss health fits below the native top controls without an escape row')
assert(not frames.HSEssentialTime and frames.HSBossTrack.width<=hud.width-.02)
SurvivorUI.Say('안야','HUD를 가리지 않는 대사');SurvivorUI.UpdateSpeech()
assert(frames.HSSpeech.visible and frames.HSEssentialHUD.visible and board.visible and board.minimized,
    'Subtitles fold statistics while retaining the visible timer title')
SurvivorUI.Alert(2,'회피',100,'test');SurvivorUI.UpdateSpeech()
assert(frames.HSEssentialHUD.visible and board.visible and board.minimized)
SafeLeftLane()
riskOffer={name='봉인',remaining=40,seconds=30,text='risk terms'};SurvivorUI.UpdateSpeech()
local accept=Local(SurvivorUI.UpdateExpedition,'riskAccept')
local function SeparatedRiskControls()
    local text,root=frames.HeroSurvivorExpedition,frames.HSExpedition
    assert(root.y<=.515 and root.y>=.36 and text.height>=.041 and text.height<=.128)
    assert(root.y-root.height-accept.y>=.009-.00001,'Risk button must sit below its panel with visible spacing')
    assert(root.visible and text.parent==root and text.anchor.y==-0.014 and root.width==frames.HSNotice.width,
        'Search and region notices share a bordered panel width and internal padding')
end
riskVisible=true;SurvivorUI.UpdateSpeech()
assert(accept.visible and frames.HeroSurvivorExpedition.visible);SeparatedRiskControls()
assert(frames.HSNotice.y-frames.HSNotice.height-frames.HSExpedition.y>=.012-.00001,'Urgent notices leave room above risk terms')
SurvivorUI.ClearSpeech();SurvivorUI.UpdateSpeech();SeparatedRiskControls()
SurvivorUI.Notify('일반 알림');SurvivorUI.UpdateSpeech();SafeLeftLane()
assert(frames.HSNotice.y-frames.HSNotice.height-frames.HSExpedition.y>=.012-.00001,'Ordinary notices leave room above risk terms')
assert(frames.HSSpeech.x-frames.HSSpeech.width/2-(accept.x+accept.width/2)>=.011-.00001,'Risk input cannot overlap combat subtitles')
assert(accept.text=='조사 수락','Offer terms and explicit action use the same investigation label')
ClickFrame(accept);assert(riskAccepts==1)
riskOffer=nil;SurvivorUI.UpdateSpeech();assert(not accept.visible)
emptyStatus=true;SurvivorUI.UpdateSpeech();assert(not frames.HSExpedition.visible and not frames.HeroSurvivorExpedition.visible and not accept.visible,
    'A completed objective leaves no persistent blank or duplicate status')
emptyStatus=false
state='INVENTORY';SurvivorUI.UpdateSpeech();assert(not frames.HSEssentialHUD.visible and not accept.visible)
state='RUNNING';SurvivorUI.UpdateSpeech();assert(frames.HSEssentialHUD.visible)
SurvivorUI.ClearSpeech();SurvivorUI.UpdateSpeech();assert(board.visible and not board.minimized,
    'Restore the player native expansion choice after warnings and speech')
bossStatus=nil;SurvivorUI.UpdateDamageBoard(build,5,260,2,'normal')
assert(not hud.visible and not frames.HSBossName.visible and not frames.HSBossTrack.visible and not frames.HSBossFill.visible)
SurvivorUI.ClearDamageBoard();assert(board.destroyed)
`);

suite('top HUD omits escape entirely and shows only boss health or active wards without changing protection', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local build={weapons={},evolutions={}}
state='RUNNING';now=12;SurvivorUI.UpdateDamageBoard(build,1,12,3,'normal');SurvivorUI.UpdateSpeech()
local hud=frames.HSEssentialHUD
assert(not hud.visible and not frames.HSEscapeState and not frames.HSWardState.visible)
SurvivorCombat.EscapeStatus=function()error('Removed escape HUD must not query escape status')end
escapeRemaining=1.2;shieldAmount=75;shieldRemaining=4.3;SurvivorUI.UpdateSpeech()
assert(not frames.HSEscapeState and frames.HSWardState.text:find('75') and frames.HSWardState.text:find('5초'))
assert(hud.visible and frames.HSWardState.visible and math.abs(hud.height-.032)<.0001)
assert(-frames.HSWardState.anchor.y+frames.HSWardState.height<hud.height,'Status text stays within the panel')
for _,pause in ipairs({'INVENTORY','CHOOSING','STAGE_CLEAR','FINISHED'})do
    state=pause;for i=1,4 do SurvivorUI.UpdateSpeech()end
    assert(not hud.visible and escapeRemaining==1.2 and shieldRemaining==4.3 and now==12)
end
state='RUNNING';SurvivorUI.UpdateSpeech();assert(hud.visible and frames.HSWardState.visible)
SurvivorUI.SetRestInventoryVisible(true);SurvivorUI.UpdateSpeech()
assert(not hud.visible and state=='RUNNING','Hide immediately while native inventory sync is pending')
SurvivorUI.SetRestInventoryVisible(false);SurvivorUI.UpdateSpeech();assert(hud.visible)
SurvivorUI.ShowConversation('수동 장면',{{speaker='안야',text='대사'}},function()end)
SurvivorUI.UpdateSpeech();assert(not hud.visible)
SurvivorUI.SkipConversation();SurvivorUI.UpdateSpeech();assert(hud.visible)
escapeRemaining=0;escapeReady=false;shieldRemaining=0;SurvivorUI.UpdateSpeech()
assert(not hud.visible and not frames.HSEscapeState and not frames.HSWardState.visible)
escapeReady=true;SurvivorUI.UpdateSpeech();assert(not hud.visible,'Escape recharge does not restore the removed top status')
SurvivorCombat.BossStatus=function()return bossStatus end
bossStatus={name='boss',current=250,max=1000};SurvivorUI.UpdateSpeech()
assert(hud.visible and frames.HSBossName.visible and math.abs(hud.height-.042)<.0001)
shieldRemaining=4.3;SurvivorUI.UpdateSpeech()
assert(hud.visible and frames.HSWardState.visible and math.abs(hud.height-.064)<.0001)
assert(-frames.HSWardState.anchor.y+frames.HSWardState.height<hud.height,'Boss and ward text fit inside the panel')
bossStatus=nil;shieldRemaining=0;SurvivorUI.UpdateSpeech();assert(not hud.visible)
SurvivorUI.ClearDamageBoard();assert(not hud.visible)
`);

suite('combat speech keeps the timer title and restores both native statistics states after every exit', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='RUNNING';now=0;local build={weapons={},evolutions={}}
SurvivorUI.UpdateDamageBoard(build,2,120,3,'normal')
local board=Local(SurvivorUI.UpdateDamageBoard,'damageBoard')
MultiboardMinimize(board,false)
SurvivorUI.Say('안야','통계 내용보다 먼저 읽을 대사');SurvivorUI.UpdateSpeech()
assert(board.visible and board.minimized and board.title:find('2:00'),'Collapse rows while retaining the native timer title')
assert(Local(SurvivorUI.UpdateSpeech,'damageBoardOriginalMinimized')==false,'Remember the player-expanded false value')
for i=1,5 do SurvivorUI.UpdateSpeech()end
assert(Local(SurvivorUI.UpdateSpeech,'damageBoardOriginalMinimized')==false,'Repeated quiet ticks never replace the original state')
now=7.1;SurvivorUI.UpdateSpeech();assert(board.visible and not board.minimized,'Natural subtitle expiry restores expansion')
MultiboardMinimize(board,true)
SurvivorUI.Alert(2,'그림자 탈출 발동',100,'escape');SurvivorUI.UpdateSpeech()
assert(board.visible and board.minimized)
now=9.2;SurvivorUI.UpdateSpeech();assert(board.minimized,'A previously collapsed board remains collapsed')
MultiboardMinimize(board,false)
SurvivorUI.Say('안야','가방을 열어도 읽는 시간을 보존');SurvivorUI.UpdateSpeech()
state='INVENTORY';SurvivorUI.UpdateSpeech()
assert(not board.visible and not board.minimized,'A fully hidden board restores its expansion state')
state='RUNNING';SurvivorUI.UpdateSpeech();assert(board.visible and board.minimized)
SurvivorUI.ClearSpeech();assert(not board.minimized,'Clearing pending speech also restores expansion immediately')
SurvivorUI.Say('안야','종료 정리');SurvivorUI.UpdateSpeech();assert(board.minimized)
SurvivorUI.ClearDamageBoard();assert(board.destroyed and not board.minimized,'Restore before destroying a quiet board')
SurvivorUI.UpdateDamageBoard(build,2,130,3,'normal');local replacement=Local(SurvivorUI.UpdateDamageBoard,'damageBoard')
assert(replacement~=board and replacement.minimized,'A replacement board begins with its own default')
SurvivorUI.UpdateSpeech();SurvivorUI.ClearSpeech();assert(replacement.minimized,'An old false snapshot never leaks into the new board')
SurvivorUI.ClearDamageBoard()
`);

suite('native statistics clicks override one-time speech and warning folding through restoration and cleanup', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='RUNNING';now=0;local build={weapons={},evolutions={}}
SurvivorUI.UpdateDamageBoard(build,1,120,4,'normal')
local board=Local(SurvivorUI.UpdateDamageBoard,'damageBoard')
SurvivorUI.Say('안야','화살표로 통계를 펼칠 수 있는 대사');SurvivorUI.UpdateSpeech()
local calls=board.minimizeCalls
for i=1,5 do SurvivorUI.UpdateSpeech()end
assert(board.minimizeCalls==calls,'An already folded board needs no repeated minimize calls')
MultiboardMinimize(board,false);calls=board.minimizeCalls
for i=1,5 do SurvivorUI.UpdateSpeech()end
assert(not board.minimized and board.minimizeCalls==calls,'Manual expansion survives every speech tick')
SurvivorUI.Alert(2,'대사와 겹친 경고',100,'test');SurvivorUI.UpdateSpeech()
assert(not board.minimized and board.minimizeCalls==calls,'Overlapping warnings do not re-enter quiet mode')
now=2.1;SurvivorUI.UpdateSpeech();now=7.1;SurvivorUI.UpdateSpeech()
assert(not board.minimized and board.minimizeCalls==calls,'Speech expiry preserves manual expansion')

SurvivorUI.Alert(2,'새 경고',100,'test');SurvivorUI.UpdateSpeech()
assert(board.minimized and board.minimizeCalls==calls+1,'A new quiet interval folds an expanded board once')
MultiboardMinimize(board,false);SurvivorUI.UpdateSpeech()
MultiboardMinimize(board,true);calls=board.minimizeCalls
SurvivorUI.UpdateSpeech();now=9.2;SurvivorUI.UpdateSpeech()
assert(board.minimized and board.minimizeCalls==calls,'Manual folding after expansion cancels automatic restoration')

SurvivorUI.Say('안야','종료 직전에 펼치기');SurvivorUI.UpdateSpeech()
MultiboardMinimize(board,false);calls=board.minimizeCalls
SurvivorUI.ClearSpeech()
assert(not board.minimized and board.minimizeCalls==calls,'Cleanup also respects a click before the next observer tick')
SurvivorUI.Say('안야','새 대사에서는 다시 한 번만 접기');SurvivorUI.UpdateSpeech()
assert(board.minimized and board.minimizeCalls==calls+1,'Cleanup resets the quiet entry guard')
MultiboardMinimize(board,false);SurvivorUI.UpdateSpeech()
MultiboardMinimize(board,true);calls=board.minimizeCalls
SurvivorUI.ClearSpeech()
assert(board.minimized and board.minimizeCalls==calls,'Clearing speech preserves the last observed manual choice')
SurvivorUI.ClearDamageBoard()
SurvivorUI.UpdateDamageBoard(build,1,120,4,'normal')
local replacement=Local(SurvivorUI.UpdateDamageBoard,'damageBoard')
assert(replacement~=board and replacement.minimized)
MultiboardMinimize(replacement,false)
SurvivorUI.Say('안야','새 통계판');SurvivorUI.UpdateSpeech()
assert(replacement.minimized,'A replacement board has its own quiet interval')
SurvivorUI.ClearSpeech();assert(not replacement.minimized,'An untouched automatic fold still restores the original state')
SurvivorUI.ClearDamageBoard()
`);

suite('UI speech failure recovers on the same map timer for a new run', presentationMocks,
    [config, 'src/30_gameplay/SurvivorStory.lua', 'src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local timer=Local(SurvivorUI.BeginRun,'speechTimer');local created=#timers
local update=SurvivorUI.UpdateSpeech;local failures=0
RunSession.Fail=function(message)failures=failures+1;state='FINISHED';assert(message:find('injected speech failure'))end
SurvivorUI.UpdateSpeech=function()error('injected speech failure')end
TickTimers();assert(failures==1 and not timer.running and Local(SurvivorUI.BeginRun,'speechTimerPaused'))
SurvivorUI.UpdateSpeech=update;state='RUNNING';now=0
SurvivorUI.BeginRun();SurvivorUI.BeginRun();SurvivorUI.Init()
assert(#timers==created and Local(SurvivorUI.BeginRun,'speechTimer')==timer and timer.running,
    'A new run resumes the existing UI timer without allocating a second handle')
SurvivorUI.Say('안야','다시 읽을 수 있는 대사');TickTimers()
assert(frames.HSSpeech.visible and frames.HSSpeechText.text=='다시 읽을 수 있는 대사' and failures==1)
`);

suite('unchanged UI skips frame writes and folded statistics retain synchronized cell handles', presentationMocks + String.raw`
local rows={{id='firebolt',stageDamage=100,damage=100,dps=10,bossDamage=0,slowSeconds=0}}
rowReads=0
SurvivorCombat.DamageRows=function()rowReads=rowReads+1;return rows end
frameWrites,cellGets,cellReleases,cellStyles,cellValues,cellIcons=0,0,0,0,0,0
for _,name in ipairs({'BlzFrameSetVisible','BlzFrameSetText','BlzFrameSetSize','BlzFrameSetAbsPoint','BlzFrameClearAllPoints'})do
    local original=_G[name]
    _G[name]=function(frame,...)
        if frame.name:find('^HS') or frame.name:find('^HeroSurvivor')then frameWrites=frameWrites+1 end
        return original(frame,...)
    end
end
local get=MultiboardGetItem
function MultiboardGetItem(board,row,column)
    cellGets=cellGets+1;local item=get(board,row,column);item.row=row;return item
end
function MultiboardReleaseItem(item)
    assert(not item.released,'Every retained multiboard item must be released once')
    item.released=true;cellReleases=cellReleases+1
end
for _,name in ipairs({'MultiboardSetItemStyle','MultiboardSetItemWidth','MultiboardSetItemValueColor'})do
    _G[name]=function(item)assert(not item.released);cellStyles=cellStyles+1 end
end
local value=MultiboardSetItemValue
function MultiboardSetItemValue(item,text)
    assert(not item.released);if item.row>0 then cellValues=cellValues+1 end;value(item,text)
end
function MultiboardSetItemIcon(item)assert(not item.released);cellIcons=cellIcons+1 end
damageFixture=rows
`, [config, augments, 'src/30_gameplay/SurvivorStory.lua', 'src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local build=SurvivorAugments.NewBuild('firebolt')
state='RUNNING';SurvivorUI.UpdateDamageBoard(build,1,0,3,'normal');SurvivorUI.UpdateSpeech()
local board=Local(SurvivorUI.UpdateDamageBoard,'damageBoard')
assert(board.minimized and cellGets==12 and cellValues==0 and cellReleases==0)
local styles=cellStyles;frameWrites=0
for i=1,100 do SurvivorUI.UpdateSpeech();SurvivorUI.UpdateExpedition();SurvivorUI.UpdateDamageBoard(build,1,0,3,'normal')end
assert(frameWrites==0 and cellGets==12 and cellValues==0 and cellStyles==styles,
    'Unchanged layouts and folded statistics cause no frame or data-cell writes')
assert(rowReads==0,'Folded observations never construct dynamic damage snapshots')
damageFixture[1].damage=250;MultiboardMinimize(board,false);SurvivorUI.UpdateSpeech()
assert(board.items['1:2'].value=='250' and cellValues==6 and cellGets==12 and cellStyles==styles,
    'The first UI observation after native expansion fills fresh data without acquiring local handles')
assert(rowReads==1)
SurvivorUI.UpdateDamageBoard(build,1,0,3,'normal');assert(cellValues==6 and cellIcons==1)
damageFixture[1].damage=300;SurvivorUI.UpdateDamageBoard(build,1,0,3,'normal')
assert(cellValues==7 and cellIcons==1 and cellStyles==styles,'Only the changed statistic is written')
assert(rowReads==3)
SurvivorUI.Say('안야','통계 잠시 접기');SurvivorUI.UpdateSpeech()
assert(board.minimized);damageFixture[1].damage=400
for i=1,100 do SurvivorUI.UpdateDamageBoard(build,1,0,3,'normal')end
assert(rowReads==3,'Speech folding does not create invisible damage snapshots')
SurvivorUI.ClearSpeech();SurvivorUI.UpdateSpeech()
assert(not board.minimized and board.items['1:2'].value=='400','Restoring native expansion refreshes current data')
state='INVENTORY';SurvivorUI.UpdateSpeech();local beforeRows=rowReads
for i=1,100 do SurvivorUI.UpdateDamageBoard(build,1,0,3,'normal')end
assert(rowReads==beforeRows,'Fully hidden statistics skip snapshots as well')
state='RUNNING';SurvivorUI.UpdateSpeech();assert(rowReads==beforeRows+1)
damageFixture[2]={id='chainlightning',stageDamage=20,damage=20,dps=2,bossDamage=0,slowSeconds=0}
build.weapons[2]='chainlightning';build.levels.chainlightning=1
SurvivorUI.UpdateDamageBoard(build,1,0,3,'normal')
assert(cellGets==30 and cellReleases==12 and board.rows==3,'Weapon rows rebuild and release the previous cell snapshot')
SurvivorUI.ClearDamageBoard();assert(board.destroyed and cellReleases==cellGets)
GetLocalPlayer=function()return 12 end
local beforeValues=cellValues
beforeRows=rowReads
SurvivorUI.UpdateDamageBoard(build,1,0,3,'normal')
assert(cellGets==48 and cellValues==beforeValues,'Nonlocal clients allocate the same cell layout without rendering local values')
assert(rowReads==beforeRows,'Nonlocal clients do not construct local rendering snapshots')
SurvivorUI.ClearDamageBoard();assert(cellReleases==cellGets)
`);

for (const missing of ['nil','0','{handle=0}']) {
    suite('loot parent fallback handles invalid backdrop and rejects invalid GameUI before creation: ' + missing,
        presentationMocks + String.raw`
local lookup=BlzGetFrameByName
fallback={handle=999,name='ValidGameUI'};originCalls,createCalls=0,0
invalidOrigin=false
function BlzGetFrameByName(name,...)
    if name=='ConsoleUIBackdrop'then return ` + missing + String.raw` end
    return lookup(name,...)
end
function BlzGetOriginFrame()
    originCalls=originCalls+1
    if invalidOrigin then return ` + missing + String.raw` end
    return fallback
end
local create=BlzCreateFrameByType
function BlzCreateFrameByType(...)createCalls=createCalls+1;return create(...)end
`, [config,'src/30_gameplay/SurvivorLootUI.lua'], String.raw`
invalidOrigin=true
local ok,message=pcall(SurvivorLootUI.Init)
assert(not ok and message:find('Missing game UI parent') and createCalls==0)
assert(Local(SurvivorLootUI.Init,'root')==nil,'A failed parent lookup retains retry ownership')
invalidOrigin=false;SurvivorLootUI.Init()
assert(Local(SurvivorLootUI.Init,'root').parent==fallback and originCalls==2 and createCalls>0)
local count=createCalls;SurvivorLootUI.Init();assert(createCalls==count,'Successful initialization remains idempotent')
`);
}

suite('loot UI revisions skip unchanged bag rendering and preserve locks, rewards and native visibility', presentationMocks + String.raw`
local revision,locked,pending,mode=1,false,1,'전체'
bagReads,pendingReads,lootWrites,expeditionUpdates=0,0,0,0
SurvivorUI={IsNarrativeVisible=function()return narrative==true end,UpdateExpedition=function()expeditionUpdates=expeditionUpdates+1 end}
SurvivorEquipment={
    UIRevision=function()return revision end,
    PendingRewardCount=function()pendingReads=pendingReads+1;return pending end,
    PickupMode=function()return mode end,
    CyclePickup=function()mode='끔';revision=revision+1 end,
    CleanupFamilies=function()return {'화염','번개','얼음','칼날','공용'}end,
    BagEntries=function()bagReads=bagReads+1;return {{item='item',id='Hs15',locked=locked}},1,6 end,
    BagCount=function()error('A shared bag snapshot already contains its count and capacity')end,
    Name=function()return '병사의 반지'end,
    ToggleLock=function(item)assert(item=='item');locked=not locked;revision=revision+1 end,
}
for _,name in ipairs({'BlzFrameSetVisible','BlzFrameSetText','BlzFrameSetEnable'})do
    local original=_G[name];_G[name]=function(...)lootWrites=lootWrites+1;return original(...)end
end
function ChangePending(value)pending=value;revision=revision+1 end
`, [config, 'src/30_gameplay/SurvivorLootUI.lua'], String.raw`
state='INVENTORY';SurvivorLootUI.Init();SurvivorLootUI.SetInventoryVisible(true)
ClickFrame(frames.ScriptDialogButton811)
assert(SurvivorLootUI.IsExpanded() and frames.ScriptDialogButton821.text:find('보관') and bagReads==1)
local reads,updates=pendingReads,expeditionUpdates;lootWrites=0
for i=1,100 do SurvivorLootUI.SetInventoryVisible(true)end
assert(lootWrites==0 and bagReads==1 and pendingReads==reads and expeditionUpdates==updates,
    'Unchanged native visibility and equipment revisions do not redraw or reread the bag')
ClickFrame(frames.ScriptDialogButton821)
assert(frames.ScriptDialogButton821.text:find('잠금') and bagReads==2,'Lock changes update the cached row')
ChangePending(2);SurvivorLootUI.Refresh();assert(frames.HSPendingRewards.text:find('2개') and bagReads==3)
ClickFrame(frames.ScriptDialogButton810);assert(frames.ScriptDialogButton810.text=='줍기: 끔')
narrative=true;SurvivorLootUI.Refresh();assert(not frames.HSLootRoot.visible)
narrative=false;SurvivorLootUI.Refresh();assert(frames.HSLootRoot.visible and SurvivorLootUI.IsExpanded())
SurvivorLootUI.SetInventoryVisible(false)
assert(not SurvivorLootUI.IsExpanded() and not frames.ScriptDialogButton811.visible and not frames.QuestButtonBaseTemplate812.visible)
SurvivorLootUI.Reset();assert(not frames.HSLootRoot.visible)
`);

suite('loot UI observes actual equipment revisions for native bag moves and protected rewards', presentationMocks + gearMocks + String.raw`
SurvivorUI.IsNarrativeVisible=function()return false end
SurvivorUI.UpdateExpedition=function()end
`, [config, metrics, augments, equipment, 'src/30_gameplay/SurvivorLootUI.lua'], String.raw`
local hero,build=NewGear('firebolt',1);state='INVENTORY'
hero.bag[1]=CreateItem('Hs15',0,0)
SurvivorLootUI.Init();SurvivorLootUI.SetInventoryVisible(true);ClickFrame(frames.ScriptDialogButton811)
assert(frames.ScriptDialogButton821.text:find('병사의 반지') and frames.HSLootStatus.text:find('1/1칸'))
local revision=build.revision
ClickFrame(frames.ScriptDialogButton821)
assert(frames.ScriptDialogButton821.text:find('잠금') and build.revision==revision,'UI locks never invalidate combat statistics')
hero.bag[1]=CreateItem('Hs14',0,0) -- Native movement without an item event.
SurvivorLootUI.SetInventoryVisible(true)
assert(frames.ScriptDialogButton821.text:find('빛바랜 목걸이') and not frames.ScriptDialogButton821.text:find('잠금'),
    'The native bag observer invalidates rows even without an event callback')
assert(SurvivorEquipment.ClaimReward('Hs04'));SurvivorLootUI.Refresh()
assert(frames.HSPendingRewards.visible and frames.HSPendingRewards.text:find('1개'))
hero.bag[1]=nil;SurvivorEquipment.CollectRest();SurvivorLootUI.SetInventoryVisible(true)
assert(not frames.HSPendingRewards.visible and frames.ScriptDialogButton821.text:find(SurvivorEquipment.Name('Hs04')),
    'Collecting the protected reward updates both its notice and bag row')
SurvivorLootUI.Reset();SurvivorEquipment.Cleanup()
`);

suite('inventory observation stays synchronized while revision-based loot rendering is local', presentationMocks + String.raw`
localPlayer,observations,localRenders=12,0,0
function GetLocalPlayer()return localPlayer end
function BlzTriggerRegisterPlayerSyncEvent()end
function BlzSendSyncData()return true end
SurvivorCombat={MaintainInventoryPause=function()end,IsClearing=function()return false end}
SurvivorNativeLoadout={Refresh=function()end}
SurvivorEquipment={Reconcile=function()end,CollectRest=function()end,UIRevision=function()observations=observations+1;return observations end}
SurvivorUI={SetRestInventoryVisible=function()end}
SurvivorLootUI={Init=function()end,Reset=function()end,SetInventoryVisible=function(open,revision)
    assert(localPlayer==0 and revision==observations,'Render the already observed shared revision only on the local client')
    localRenders=localRenders+1
end}
`, [config, 'src/30_gameplay/SurvivorInventoryPause.lua'], String.raw`
state='RUNNING';SurvivorInventoryPause.Init();TickTimers()
assert(observations==1 and localRenders==0,'Nonlocal clients still perform identical equipment metadata observation')
localPlayer=0;TickTimers();assert(observations==2 and localRenders==1)
TickTimers();assert(observations==3 and localRenders==2,'Each local timer tick observes once and forwards that revision')
SurvivorInventoryPause.Cleanup()
`);

suite('checkpoint patterns and reinforcements keep gameplay and ground warnings without monster notices', presentationMocks + String.raw`
SurvivorStage.Get=function(index)return {name='stage '..index,mission='mission',hint='hint',warning={255,160,90}}end
SurvivorExpedition.UseAdvantage=function()return false end
function GetUnitCurrentOrder()return 'attack'end
function OrderId(order)return order end
`, [config,metrics,augments,combat,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local hero,build,units=NewCombat('orbitblade')
SetLocal(SurvivorCombat.BossStatus,'stage',4)
local unit=EnemyAt(units,500,0,false);units[unit].boss=true
SetLocal(SurvivorCombat.BossStatus,'boss',unit)
now=2
Local(SurvivorCombat.UpdateEnemies,'BossPattern')(units[unit])
SurvivorUI.UpdateSpeech()
local record=units[unit]
assert(record.patternCount==1 and record.supportAt==4,'Checkpoint reinforcements keep their actual two-second delay')
assert(#actors>=5 and not frames.HSNotice.visible,'Cross pattern retains its visible ground warnings')
assert(#Local(SurvivorUI.Alert,'alerts')==0,'Monster ability descriptions must not open a notice')
local spawns=0;SurvivorCombat.Spawn=function(elite,kind)spawns=spawns+1;return true end
record.nextBlast,record.attackSpeed=100,1
now=3.9;SurvivorCombat.UpdateEnemies(now);assert(spawns==0)
now=4;SurvivorCombat.UpdateEnemies(now);assert(spawns==3 and not record.supportAt)
SurvivorUI.UpdateSpeech();assert(not frames.HSNotice.visible)
SurvivorCombat.Cleanup()
`);

suite('result summary separates progress, six weapon totals and rest guidance across tab switches', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local build={weapons={},evolutions={}}
for index,minutes in ipairs({3,4,5,5,5})do
    SurvivorUI.UpdateDamageBoard(build,index,0,3,'normal')
    assert(Local(SurvivorUI.UpdateDamageBoard,'damageBoard').title:find(minutes..':00',1,true))
    SurvivorUI.UpdateDamageBoard(build,index,60,3,'normal')
    assert(Local(SurvivorUI.UpdateDamageBoard,'damageBoard').title:find((minutes-1)..':00',1,true))
end
local details={difficulty='쉬움',level=16,weapons={'잿불 화살'},trinkets={},stages={}}
local report='누적 유효 피해'
for index=1,6 do report=report..'\n무기 '..index..' '..index*1000 end
state='STAGE_CLEAR';SurvivorUI.ShowResult('stage_clear',122,427,1,2,report,details)
local info,damage,rest=frames.HSResultSummaryInfo,frames.HSResultSummaryDamage,frames.HSResultSummaryRest
assert(info.visible and damage.visible and rest.visible and not frames.HeroSurvivorResultNote.visible)
assert(info.vertical==TEXT_JUSTIFY_TOP and info.horizontal==TEXT_JUSTIFY_LEFT
    and damage.vertical==TEXT_JUSTIFY_TOP and damage.horizontal==TEXT_JUSTIFY_LEFT)
assert(info.text:find('현재 레벨 16',1,true) and info.text:find('2:02',1,true)
    and damage.text:find('무기 6 6000',1,true))
assert(rest.text:find('다음 시작 지점',1,true) and frames.ScriptDialogButton4.text=='다음 스테이지')
local tabs=Local(SurvivorUI.NavigateJournal,'resultTabs')
ClickFrame(tabs[2].frame)
assert(not info.visible and not damage.visible and not rest.visible and frames.HeroSurvivorResultNote.visible)
ClickFrame(tabs[1].frame);assert(info.visible and damage.visible and rest.visible)
state='FINISHED';SurvivorUI.ShowResult('timeout',180,427,1,60,'',details)
assert(rest.text=='' and info.text:find('종료 레벨 16',1,true) and damage.text:find('없음',1,true),
    'Later results replace previous rest guidance and damage content')
`);

suite('chapter journal navigation is reversible, bounded and independent of repeated tab clicks', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='FINISHED'
local details={difficulty='보통',level=1,weapons={},trinkets={},stages={},journalChapters={
    {title='첫 수색',pages={'첫 장 요약','첫 장 대화'}},{title='두 번째 수색',pages={'둘째 장 요약','둘째 장 대화'}}}}
SurvivorUI.ShowResult('boss_defeated',500,100,5,nil,'',details)
local tab=Local(SurvivorUI.NavigateJournal,'resultTabs')[5].frame
ClickFrame(tab)
local note=frames.HeroSurvivorResultNote.text
assert(note:find('첫 장 요약'))
ClickFrame(tab);assert(frames.HeroSurvivorResultNote.text==note,'Repeated tab clicks never move a page')
SurvivorUI.NavigateJournal(-1,0);assert(frames.HeroSurvivorResultNote.text==note)
ClickFrame(Local(SurvivorUI.NavigateJournal,'journalNext'));assert(frames.HeroSurvivorResultNote.text:find('첫 장 대화'))
SurvivorUI.NavigateJournal(99,0);assert(frames.HeroSurvivorResultNote.text:find('첫 장 대화'))
ClickFrame(Local(SurvivorUI.NavigateJournal,'journalPrevious'));assert(frames.HeroSurvivorResultNote.text==note)
ClickFrame(Local(SurvivorUI.NavigateJournal,'chapterNext'));assert(frames.HeroSurvivorResultNote.text:find('둘째 장 요약'))
SurvivorUI.NavigateJournal(0,99);assert(frames.HeroSurvivorResultNote.text:find('둘째 장 요약'))
ClickFrame(Local(SurvivorUI.NavigateJournal,'chapterPrevious'));assert(frames.HeroSurvivorResultNote.text==note)
assert(frames.HSJournalPosition.text:find('1/2장') and frames.HSJournalPosition.text:find('1/2쪽'))
ClickFrame(Local(SurvivorUI.NavigateJournal,'resultTabs')[1].frame)
assert(not frames.HSJournalPosition.visible)
SurvivorUI.NavigateJournal(1,1);assert(not frames.HeroSurvivorResultNote.text:find('둘째 장 요약'),'Journal actions only work on its tab')
`);

suite('setup preserves selections and same-settings retry consumes one valid finished run', mocks + String.raw`
OnInit={final=function()end}
RunSession.Finish=function()state='FINISHED'end
SurvivorSetupUI={ShowMenu=function(difficulty,weapon,trinket)
    setupShown={difficulty=difficulty,weapon=weapon,trinket=trinket}
end,ShowOptions=function()end}
SurvivorStory={SetSummaryMode=function(value)summaryMode=value end}
`, [config,'src/00_bootstrap/HeroSurvivor.lua'], String.raw`
SetLocal(HeroSurvivor.Start,'initialized',true)
state='READY';HeroSurvivor.Start()
assert(not setupShown.difficulty and not setupShown.weapon and not setupShown.trinket)
assert(not HeroSurvivor.RetrySame(),'Cannot retry before selecting a complete setup')
local selections={DIFFICULTY='normal',WEAPON=SurvivorConfig.startingWeapons[1],TRINKET=SurvivorConfig.startingTrinkets[1]}
for _,kind in ipairs({'DIFFICULTY','WEAPON','TRINKET'})do
    assert(HeroSurvivor.OpenSetup(kind) and HeroSurvivor.SelectSetup(kind,selections[kind]))
end
assert(not HeroSurvivor.IsStorySummary())
assert(HeroSurvivor.ToggleStorySummary());assert(HeroSurvivor.IsStorySummary())
HeroSurvivor.Start()
assert(setupShown.difficulty==selections.DIFFICULTY and setupShown.weapon==selections.WEAPON and setupShown.trinket==selections.TRINKET)
assert(HeroSurvivor.IsStorySummary(),'Restart retains the explicitly chosen story preference')
local starts=0
SetLocal(HeroSurvivor.BeginRun,'Start',function(weapon,trinket)
    starts=starts+1;assert(weapon==selections.WEAPON and trinket==selections.TRINKET);state='RUNNING'
end)
state='FINISHED';assert(HeroSurvivor.RetrySame() and starts==1)
assert(not HeroSurvivor.RetrySame() and starts==1,'Retry is rejected once a run is active')
state='FINISHED';HeroSurvivor.Start()
assert(setupShown.difficulty==selections.DIFFICULTY and setupShown.weapon==selections.WEAPON and setupShown.trinket==selections.TRINKET)
assert(HeroSurvivor.ToggleStorySummary() and not HeroSurvivor.IsStorySummary())
assert(summaryMode==false,'Setup summary preference reaches the story runtime')
`);

suite('initial and later introductions wait for a distinct preparation countdown before real combat and reject stale run callbacks', presentationMocks + String.raw`
OnInit={final=function()end}
PATHING_TYPE_WALKABILITY,PLAYER_NEUTRAL_AGGRESSIVE,EVENT_PLAYER_HERO_LEVEL='walk',12,'hero level'
function ALICE_CallPeriodic(fn)periodic=fn;return fn end
function ALICE_DisableCallback()periodic=nil end
function ALICE_Halt()halted=true end
function ALICE_Resume()halted=false;resumeCount=(resumeCount or 0)+1 end
function FogMaskEnable()end
function FogEnable()end
function IsTerrainPathable()return false end
function GetRandomInt(a,b)return a end
function GetRandomReal(a,b)return a end
function BlzSetHeroProperName(unit,name)unit.properName=name end
function SuspendHeroXP(unit,value)unit.xpSuspended=value end
function GetHeroLevel(unit)return unit.level or 1 end
function GetHeroSkillPoints()return 0 end
function TriggerRegisterPlayerUnitEvent(trigger,player,event)trigger.event=event end
function BlzSetUnitName(unit,name)unit.displayName=name end
function BlzSetUnitBaseDamage(unit,value)unit.damage=value end
function BlzGetUnitAttackCooldown()return 1.5 end
function BlzSetUnitAttackCooldown(unit,value)unit.attackCooldown=value end
function SetUnitScale(unit,value)unit.scale=value end
function SetUnitVertexColor()end
function SetUnitCreepGuard()end
function RemoveGuardPosition()end
function IssueTargetOrder(unit,order)unit.order=order end
function IssuePointOrder(unit,order)unit.order=order end
function GetUnitCurrentOrder(unit)return unit.order end
function OrderId(order)return order end
function ALICE_AddIdentifier()end
function BlzTriggerRegisterPlayerSyncEvent(trigger,player,prefix)trigger.prefix=prefix end
sentSync={}
function BlzSendSyncData(prefix,data)sentSync[#sentSync+1]={prefix=prefix,data=data};return true end
function BlzGetTriggerSyncData()return deliveredSyncData end
function DeliverInventorySync()
    local messages=sentSync;sentSync={}
    for _,message in ipairs(messages)do
        deliveredSyncData=message.data;local delivered=0
        for _,trigger in ipairs(triggers)do if not trigger.destroyed and trigger.prefix==message.prefix then
            trigger.action();delivered=delivered+1
        end end
        assert(delivered==1,'Only the current run observer may receive an inventory sync transition')
    end
    return #messages
end
SurvivorStage.Init=function()end
SurvivorStage.Apply=function(index)appliedStage=index end
SurvivorStage.Cleanup=function()end
SurvivorStage.Get=function(index)return {name='stage '..index,mission='mission',hint='hint',color={150,150,150},
    ids={melee='sm0'..index,ranged='sr0'..index,flying='sf0'..index,boss='sb0'..index}}end
SurvivorExpedition.Reset=function()end
SurvivorExpedition.EndStage=function()end
SurvivorExpedition.BeginStage=function(unit,index)expeditionHero,expeditionStage=unit,index end
SurvivorExpedition.SetPaused=function(value)expeditionPaused=value end
SurvivorExpedition.Step=function()expeditionSteps=(expeditionSteps or 0)+1 end
SurvivorEquipment={Init=function()end,Cleanup=function()end,Reconcile=function()return false,1 end,
    CollectRest=function()return false,1 end,UIRevision=function()return 1 end,Step=function()end,
    SetStage=function(index)equipmentStage=index end,CarryGroundToStage=function()carriedStages=(carriedStages or 0)+1 end}
SurvivorLootUI={Init=function()end,Reset=function()end,SetInventoryVisible=function()end,Refresh=function()end,
    IsExpanded=function()return false end}
for _,name in ipairs({'SimpleEquipmentInventoryPanel','SimpleEquipmentPanel','SimpleTalentsPanel','SimpleStatDetailsPanel'})do
    BlzGetFrameByName(name).visible=false
end
`, [config,metrics,augments,combat,'src/20_system/RunSession.lua','src/30_gameplay/SurvivorNativeLoadout.lua',
    'src/30_gameplay/SurvivorInventoryPause.lua','src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua',
    'src/30_gameplay/SurvivorSetupUI.lua','src/00_bootstrap/HeroSurvivor.lua'], String.raw`
SurvivorConfig.debugCommands=false
HeroSurvivor.Init()
local introduction=SurvivorUI.ShowStageIntro
function SurvivorUI.ShowStageIntro(index,onReady,hero)
    latestIntroduction=onReady
    return introduction(index,onReady,hero)
end
local prepare=SurvivorUI.ShowCombatPreparation
function SurvivorUI.ShowCombatPreparation(index,onReady,canStart)
    latestReady,latestCanStart=onReady,canStart
    return prepare(index,onReady,canStart)
end
local function CountdownText()
    return frames.HSCombatCountdown.text:gsub('|c%x%x%x%x%x%x%x%x',''):gsub('|r','')
end
local function Waiting(index)
    assert(select(2,SurvivorNativeLoadout.TalentStatus())==index,'Each actual preparation grants its own stage point exactly once')
    assert(RunSession.GetState()=='STAGE_CLEAR'and halted and expeditionPaused
        and SurvivorUI.IsCombatPreparationVisible()and SurvivorUI.IsNarrativeVisible())
    local current=Local(HeroSurvivor.BeginRun,'hero')
    assert(current.visible and selectedUnit==current and not current.removed
        and cameraNative.x==current.x and cameraNative.y==current.y)
    assert(frames.HSCombatPreparation.visible and frames.HSCombatPreparationStart.visible
        and frames.HSCombatPreparationStart.kind=='GLUETEXTBUTTON'
        and not frames.HeroSurvivorStageIntro.visible and LiveTimers(.03)==0 and LiveTimers(1)==0)
    assert(frames.HSCombatPreparationTitle.text:find(index..' / 5',1,true)
        and frames.HSCombatPreparationMission.text:find('mission',1,true)
        and frames.HSCombatPreparationHint.text:find('hint',1,true))
    assert(not HeroSurvivor.NextStage(),'A pending preparation must block queued Next Stage actions')
    local elapsed=RunSession.GetElapsed()
    local currentReady=latestReady
    latestIntroduction();latestIntroduction()
    assert(latestReady==currentReady and SurvivorUI.IsCombatPreparationVisible(),
        'A consumed introduction callback cannot replace or duplicate the waiting preparation')
    SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation()
    ClickFrame(frames.ScriptDialogButton700);ClickFrame(frames.ScriptDialogButton701)
    for _=1,3 do periodic()end
    AdvanceVisualTime(4)
    assert(RunSession.GetElapsed()==elapsed and RunSession.GetState()=='STAGE_CLEAR'
        and SurvivorCombat.Counts()==0 and LiveTimers(1)==0,
        'Reading and old Continue/Skip events cannot start a countdown, spawn or gameplay time')
end
local function StartCountdown()
    ClickFrame(frames.HSCombatPreparationStart);ClickFrame(frames.HSCombatPreparationStart)
    assert(SurvivorUI.IsCombatPreparationVisible()and LiveTimers(1)==1 and CountdownText():find('3',1,true))
    local countdown=Local(SurvivorUI.BeginPreparedCombat,'preparationTimer')
    latestIntroduction();latestIntroduction()
    assert(Local(SurvivorUI.BeginPreparedCombat,'preparationTimer')==countdown and countdown.running and LiveTimers(1)==1,
        'Late introduction completions cannot replace an active combat countdown')
    local elapsed=RunSession.GetElapsed()
    for number=2,1,-1 do
        AdvanceVisualTime(1);periodic()
        assert(CountdownText():find(tostring(number),1,true)and RunSession.GetElapsed()==elapsed
            and RunSession.GetState()=='STAGE_CLEAR'and SurvivorCombat.Counts()==0)
    end
    AdvanceVisualTime(.99);periodic();assert(RunSession.GetState()=='STAGE_CLEAR'and RunSession.GetElapsed()==elapsed)
    AdvanceVisualTime(.01)
    assert(RunSession.IsRunning()and not halted and not expeditionPaused and not SurvivorUI.IsCombatPreparationVisible()
        and not frames.HSCombatPreparation.visible and not frames.HSCombatPreparationStart.visible
        and not frames.HSCombatCountdown.visible and LiveTimers(1)==0)
end
assert(RunSession.GetState()=='READY'and frames.HeroSurvivorSetupShade.visible
    and frames.HeroSurvivorSetupShade.texture==[[HeroSurvivorUI\Black.tga]])
for _,kind in ipairs({'DIFFICULTY','WEAPON','TRINKET'})do
    ClickFrame(frames['HeroSurvivorSetup'..kind])
    ClickFrame(frames[kind=='DIFFICULTY'and'HeroSurvivorSetupOption2'or'HeroSurvivorSetupOption1'])
end
ClickFrame(frames.HeroSurvivorSetupStart);ClickFrame(frames.HeroSurvivorSetupStart)
local hero=Local(HeroSurvivor.BeginRun,'hero')
assert(hero and not hero.removed and RunSession.GetState()=='STAGE_CLEAR'and halted and expeditionPaused)
local build=Local(HeroSurvivor.BeginRun,'build')
assert(build.weapons[1]=='firebolt'and build.trinkets[1]=='power'
    and Local(HeroSurvivor.BeginRun,'selectedDifficulty')=='normal',
    'Exercise the reported firebolt and increased-damage trinket combination through actual preparation controls')
assert(not frames.HeroSurvivorSetupShade.visible and frames.HeroSurvivorStageIntro.visible)
assert(frames.ScriptDialogButton700.text=='장면 보기')
periodic();AdvanceVisualTime(.2)
assert(RunSession.GetElapsed()==0 and SurvivorCombat.Counts()==0,'Preparing and reading never starts combat time or waves')
SurvivorUI.AdvanceNarrative()
for page=1,4 do
    AdvanceVisualTime(.72)
    assert(RunSession.GetState()=='STAGE_CLEAR'and RunSession.GetElapsed()==0
        and frames.HSStoryPosition.text:find(page..'/4'),'Every line remains manual and frozen')
    assert(frames.ScriptDialogButton700.text==(page==4 and'수색 준비'or'다음 대사'))
    SurvivorUI.AdvanceNarrative()
end
Waiting(1)
local traitPanel=frames.SimpleTalentsPanel
local beforeTalent=build.stats.missileDamage
traitPanel.visible=true;AdvanceVisualTime(.05)
assert(DeliverInventorySync()==1 and not frames.HSCombatPreparation.visible and RunSession.GetState()=='STAGE_CLEAR')
UnitAddAbility(hero,'Ht1A');hero.talentPoints=hero.talentPoints-1
traitPanel.visible=false;AdvanceVisualTime(.05)
assert(DeliverInventorySync()==1 and build.talentChoices[1]=='Ht1A'and build.stats.missileDamage>beforeTalent
    and select(1,SurvivorNativeLoadout.TalentStatus())==0 and frames.HSCombatPreparation.visible
    and BlzGetUnitRealField(hero,UNIT_RF_HIT_POINTS_REGENERATION_RATE)==0,
    'A real native selection is reconciled while paused before the start button is restored')
local firstReady,firstCanStart=latestReady,latestCanStart
StartCountdown()
assert(RunSession.IsRunning()and not halted and not expeditionPaused and resumeCount==1)
assert(hero.visible and selectedUnit==hero and not hero.paused and not hero.removed)
assert(not SurvivorUI.IsNarrativeVisible()and not frames.HeroSurvivorSetupShade.visible
    and not frames.HeroSurvivorStageIntro.visible and LiveTimers(.03)==0)
assert(SurvivorCombat.Counts()==3 and #actors>0,'The actual first-story callback creates three enemies and the selected weapon')
assert(hero.inventory[1]and not hero.inventory[1].removed,'Starting trinket survives narrative selection restoration')
local elapsed=RunSession.GetElapsed();periodic();assert(RunSession.GetElapsed()>elapsed and expeditionSteps==1)
AdvanceVisualTime(.12);assert(RunSession.IsRunning()and #unsafeFrameCalls==0,
    'Real combat resume and following UI/inventory timers use only supported native frame calls')
hero.level=3;periodic()
assert(RunSession.GetState()=='CHOOSING'and halted and expeditionPaused and frames.HeroSurvivorChoiceRoot.visible,
    'Two actual hero levels open the growth controls and pause combat')
local choiceTime=RunSession.GetElapsed()
local pendingOffers=Local(HeroSurvivor.BeginRun,'offers')
local details=frames.SimpleStatDetailsPanel
details.visible=true;AdvanceVisualTime(.05)
assert(DeliverInventorySync()==1 and RunSession.GetState()=='CHOOSING'and halted
    and not frames.HeroSurvivorChoiceRoot.visible and GetUnitAbilityLevel(hero,'ASde')==1,
    'The real native details observer hides cards without consuming their queued offers')
details.visible=false;AdvanceVisualTime(.05)
assert(DeliverInventorySync()==1 and RunSession.GetState()=='CHOOSING'and halted
    and frames.HeroSurvivorChoiceRoot.visible and Local(HeroSurvivor.BeginRun,'offers')==pendingOffers
    and RunSession.GetElapsed()==choiceTime,'Closing details restores the same live card controls')
local rerolls=Local(HeroSurvivor.BeginRun,'rerollsRemaining')
assert(frames.HeroSurvivorReroll2.enabled);ClickFrame(frames.HeroSurvivorReroll2)
assert(Local(HeroSurvivor.BeginRun,'rerollsRemaining')==rerolls-1 and RunSession.GetState()=='CHOOSING')
local excluded=Local(HeroSurvivor.BeginRun,'offers')[2]
assert(frames.HeroSurvivorExclude2.enabled);ClickFrame(frames.HeroSurvivorExclude2)
assert(build.excluded[excluded]and build.excludesRemaining==SurvivorConfig.excludesPerRun-1
    and Local(HeroSurvivor.BeginRun,'rerollsRemaining')==rerolls-1,
    'Real exclusion replaces the candidate without consuming another reroll or level')
for remaining=1,0,-1 do
    local id=Local(HeroSurvivor.BeginRun,'offers')[1]
    local previous=SurvivorAugments.Level(build,id)
    ClickFrame(frames.HeroSurvivorCard1)
    assert(SurvivorAugments.Level(build,id)==previous+1,'Each card click grants exactly one queued growth reward')
    if remaining>0 then
        periodic();assert(RunSession.GetState()=='CHOOSING'and halted and RunSession.GetElapsed()==choiceTime)
    end
end
assert(RunSession.IsRunning()and not halted and not expeditionPaused and not frames.HeroSurvivorChoiceRoot.visible,
    'The last growth selection closes the modal and resumes the actual session')
ClickFrame(frames.HeroSurvivorCard1)
assert(RunSession.IsRunning(),'A stale click cannot consume another reward or pause the resumed run')
for index=2,5 do
    assert(RunSession.BeginStageClear())
    if index==2 then
        -- Reproduce the same hero/stage/run guard values while the defeated-boss cleanup owns the transition.
        SetLocal(HeroSurvivor.NextStage,'stageTransition',true)
        local resumed=resumeCount
        assert(not firstCanStart()and not firstReady()and resumeCount==resumed
            and RunSession.GetState()=='STAGE_CLEAR'and SurvivorCombat.Counts()==3,
            'A consumed preparation callback cannot reactivate during the same stage boss pause')
        SetLocal(HeroSurvivor.NextStage,'stageTransition',false)
    end
    assert(HeroSurvivor.NextStage())
    assert(appliedStage==index and equipmentStage==index and expeditionStage==index and expeditionHero==hero)
    -- Each later stage opens on its arrival scene in the new place; nothing resumes until preparation.
    assert(frames.ScriptDialogButton700.text=='다음 대사'and frames.HSStoryPosition.text:find('1/3')and not hero.visible)
    SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative()
    assert(frames.ScriptDialogButton700.text=='수색 준비'and RunSession.GetState()=='STAGE_CLEAR')
    SurvivorUI.AdvanceNarrative();assert(hero.visible);Waiting(index)
    local currentText=frames.HSCombatPreparationTitle.text
    assert(not firstReady()and frames.HSCombatPreparationTitle.text==currentText and RunSession.GetState()=='STAGE_CLEAR',
        'An earlier stage start callback cannot resume a later stage preparation')
    StartCountdown();assert(Local(HeroSurvivor.BeginRun,'stage')==index and selectedUnit==hero)
end
assert(RunSession.Finish('test')and hero.removed and not halted and periodic==nil)
local cast=SurvivorCombat.CastWeapon
SurvivorCombat.CastWeapon=function(id)lastFirstCast=id;return cast(id)end
for _,id in ipairs(SurvivorConfig.startingWeapons)do
    HeroSurvivor.Start();assert(HeroSurvivor.OpenSetup('WEAPON')and HeroSurvivor.SelectSetup('WEAPON',id))
    ClickFrame(frames.HeroSurvivorSetupStart)
    local nextHero=Local(HeroSurvivor.BeginRun,'hero')
    assert(RunSession.GetState()=='STAGE_CLEAR'and nextHero and not nextHero.removed,
        'Every supported starting weapon reaches the initial narrative')
    SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation();Waiting(1)
    if id=='firebolt'then
      for _,panelName in ipairs({'SimpleEquipmentInventoryPanel','SimpleStatDetailsPanel','SimpleTalentsPanel'})do
        local bag=frames[panelName]
        bag.visible=true;AdvanceVisualTime(.05)
        assert(#sentSync==1 and not RunSession.IsInventoryOpen()and SurvivorUI.IsCombatPreparationVisible()
            and not frames.HSCombatPreparation.visible and not frames.HSCombatPreparationStart.visible,
            'Local bag visibility hides preparation without changing synchronized simulation state')
        assert(DeliverInventorySync()==1 and RunSession.IsInventoryOpen())
        assert(not SurvivorUI.BeginPreparedCombat()and LiveTimers(1)==0 and RunSession.GetState()=='STAGE_CLEAR',
            'The synchronized inventory pause blocks the preparation start without consuming it')
        bag.visible=false;AdvanceVisualTime(.05)
        assert(DeliverInventorySync()==1 and not RunSession.IsInventoryOpen()
            and frames.HSCombatPreparation.visible and frames.HSCombatPreparationStart.visible)
        assert(SurvivorUI.BeginPreparedCombat());local cancelled=Local(SurvivorUI.BeginPreparedCombat,'preparationTimer')
        AdvanceVisualTime(.10);bag.visible=true;AdvanceVisualTime(.05)
        assert(cancelled.running and not frames.HSCombatCountdown.visible and not RunSession.IsInventoryOpen(),
            'The local observer alone must not cancel a synchronized countdown')
        assert(DeliverInventorySync()==1 and RunSession.IsInventoryOpen())
        bag.visible=false;AdvanceVisualTime(.05)
        assert(DeliverInventorySync()==1 and not RunSession.IsInventoryOpen())
        assert(cancelled.destroyed and LiveTimers(1)==0 and SurvivorUI.IsCombatPreparationVisible()
            and RunSession.GetState()=='STAGE_CLEAR'and SurvivorCombat.Counts()==0
            and frames.HSCombatPreparation.visible and frames.HSCombatPreparationStart.visible,
            'A synchronized open then close before the first 1-second tick still cancels the countdown')
        cancelled.callback();assert(LiveTimers(1)==0,'A cancelled countdown stays inert after an inventory interruption')
        AdvanceVisualTime(4)
        assert(RunSession.GetState()=='STAGE_CLEAR'and LiveTimers(1)==0,
            'Closing the inventory never restarts the cancelled countdown automatically')
      end
    end
    StartCountdown()
    assert(RunSession.IsRunning()and selectedUnit==nextHero and nextHero.visible and lastFirstCast==id,
        'The real first-story callback casts '..id..' after completing all presentation cleanup')
    assert(SurvivorCombat.Counts()==3 and not halted and #unsafeFrameCalls==0)
    local before=RunSession.GetElapsed();periodic();assert(RunSession.GetElapsed()>before)
    AdvanceVisualTime(.06);assert(RunSession.IsRunning(),'Inventory observation after '..id..' leaves the run active')
    assert(RunSession.Finish('test')and nextHero.removed and not halted and periodic==nil)
end
assert(HeroSurvivor.RetrySame());SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation();Waiting(1)
local staleReady,staleCanStart=latestReady,latestCanStart
assert(SurvivorUI.BeginPreparedCombat());local staleTimer=Local(SurvivorUI.BeginPreparedCombat,'preparationTimer')
assert(RunSession.Finish('test')and staleTimer.destroyed and not SurvivorUI.IsCombatPreparationVisible())
assert(HeroSurvivor.RetrySame());SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation();Waiting(1)
assert(not staleCanStart()and not staleReady(),'Previous-run preparation closures must fail their expected run/hero guards')
staleTimer.callback();assert(LiveTimers(1)==0 and SurvivorUI.IsCombatPreparationVisible()and RunSession.GetElapsed()==0)
StartCountdown();assert(RunSession.IsRunning()and SurvivorCombat.Counts()==3)
assert(RunSession.Finish('test'))
`);

suite('combat preparation preserves the live arena and requires a fresh click after interruption or replacement', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local completed,allowed=0,false
local function Ready()completed=completed+1 end
local function CanStart()return allowed end
assert(not SurvivorUI.BeginPreparedCombat()and not SurvivorUI.InterruptCombatPreparation())
SurvivorUI.ShowNarrative('background','premise',Ready)
SurvivorUI.ShowCombatPreparation(2,Ready,CanStart)
local root,start,countdown=frames.HSCombatPreparation,frames.HSCombatPreparationStart,frames.HSCombatCountdown
assert(root.visible and start.visible and not countdown.visible and SurvivorUI.IsNarrativeVisible())
assert(not frames.HeroSurvivorStageIntro.visible and not frames.HeroSurvivorShade.visible
    and frames.NativeWorldFrame.visible and frames.NativeWorldBars.visible and frames.NativePortrait.visible
    and frames.CommandBarFrame.visible and frames.SimpleInventoryBar.visible,
    'Preparation restores the normal arena and hero HUD after a narrative screen')
assert(root.absolute==FRAMEPOINT_CENTER and root.x==.4 and root.y==.34 and root.height<.29
    and root.y-root.height/2>.16,'The compact preparation panel is centered above the lower console')
assert(start.kind=='GLUETEXTBUTTON'and start~=frames.ScriptDialogButton700 and start~=frames.ScriptDialogButton701
    and start.anchor.target==root and start.anchor.y-start.height>=-root.height)
assert(frames.HSCombatPreparationFooter.text==''and not frames.HSCombatPreparationRecord
    and not frames.HSCombatPreparationLoadout,'Preparation omits the recap, loadout and pause explanation')
for _,name in ipairs({'Title','Mission','Hint','Footer'})do
    local frame=frames['HSCombatPreparation'..name]
    assert(frame.parent==root and not frame.enabled and frame.width<root.width
        and frame.anchor.y-frame.height>=-root.height)
end
SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation()
ClickFrame(frames.ScriptDialogButton700);ClickFrame(frames.ScriptDialogButton701);ClickFrame(start)
assert(completed==0 and LiveTimers(1)==0 and SurvivorUI.IsCombatPreparationVisible())
allowed=true;ClickFrame(start);ClickFrame(start)
local first=Local(SurvivorUI.BeginPreparedCombat,'preparationTimer')
assert(first and LiveTimers(1)==1 and not root.visible and not start.visible and countdown.visible)
SurvivorUI.SetRestInventoryVisible(true)
assert(first.running and not countdown.visible and SurvivorUI.IsCombatPreparationVisible(),
    'Local native bag presentation cannot mutate a countdown or consume its synchronized callback')
AdvanceVisualTime(.2);SurvivorUI.SetRestInventoryVisible(false)
assert(first.running and countdown.visible)
assert(SurvivorUI.InterruptCombatPreparation()and first.destroyed and root.visible and start.visible)
assert(not SurvivorUI.InterruptCombatPreparation()and not countdown.visible and completed==0)
first.callback();AdvanceVisualTime(5)
assert(LiveTimers(1)==0 and completed==0 and SurvivorUI.IsCombatPreparationVisible(),
    'Interrupting preserves the invitation but requires another deliberate start click')
assert(SurvivorUI.BeginPreparedCombat());local second=Local(SurvivorUI.BeginPreparedCombat,'preparationTimer')
allowed=false;AdvanceVisualTime(1)
assert(second.destroyed and completed==0 and root.visible and start.visible)
allowed=true;AdvanceVisualTime(4);assert(completed==0 and LiveTimers(1)==0)
assert(SurvivorUI.BeginPreparedCombat());local replaced=Local(SurvivorUI.BeginPreparedCombat,'preparationTimer')
SurvivorUI.ShowCombatPreparation(3,function()
    assert(not SurvivorUI.IsCombatPreparationVisible(),'Detach the completed gate before its gameplay callback')
    completed=completed+10
    SurvivorUI.ShowCombatPreparation(4,Ready,CanStart)
end,CanStart)
assert(replaced.destroyed);replaced.callback();assert(completed==0 and root.visible)
ClickFrame(start);local third=Local(SurvivorUI.BeginPreparedCombat,'preparationTimer');AdvanceVisualTime(3)
assert(third.destroyed and completed==10 and SurvivorUI.IsCombatPreparationVisible()and root.visible)
ClickFrame(start);local fourth=Local(SurvivorUI.BeginPreparedCombat,'preparationTimer')
third.callback();assert(fourth.running and LiveTimers(1)==1 and completed==10,
    'A consumed timer cannot cancel the new preparation created by its completion callback')
SurvivorUI.HidePanel();fourth.callback()
assert(fourth.destroyed and completed==10 and not SurvivorUI.IsNarrativeVisible()
    and not root.visible and not start.visible and not countdown.visible and LiveTimers(1)==0)
SurvivorUI.ShowCombatPreparation(5,Ready,CanStart);ClickFrame(start)
local fifth=Local(SurvivorUI.BeginPreparedCombat,'preparationTimer')
SurvivorUI.ShowStageIntro(2,Ready);fifth.callback()
assert(fifth.destroyed and not SurvivorUI.IsCombatPreparationVisible()and frames.HeroSurvivorStageIntro.visible)
SurvivorUI.HidePanel();assert(#unsafeFrameCalls==0 and completed==10)
`);

suite('combat preparation errors detach callbacks and cleanup proceeds after timer native failures', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local completed,failures=0,0
RunSession.Fail=function(message)
    failures=failures+1;state='FINISHED';SurvivorUI.HidePanel();error(message)
end
local function Ready()completed=completed+1 end
local function AssertCleared(timer)
    assert(timer.destroyed and not timer.running and LiveTimers(1)==0
        and not SurvivorUI.IsCombatPreparationVisible()and not frames.HSCombatPreparation.visible
        and not frames.HSCombatPreparationStart.visible and not frames.HSCombatCountdown.visible)
    timer.callback();assert(completed==0,'Failed preparation callbacks stay inert after cleanup')
end
SurvivorUI.ShowCombatPreparation(1,function()error('injected prepared gameplay failure')end,function()return true end)
ClickFrame(frames.HSCombatPreparationStart);local timer=Local(SurvivorUI.BeginPreparedCombat,'preparationTimer')
local ok,message=pcall(AdvanceVisualTime,3)
assert(not ok and message:find('injected prepared gameplay failure')and failures==1);AssertCleared(timer)
state='STAGE_CLEAR';local checking=false
SurvivorUI.ShowCombatPreparation(1,Ready,function()
    if checking then error('injected preparation guard failure')end;return true
end)
ClickFrame(frames.HSCombatPreparationStart);timer=Local(SurvivorUI.BeginPreparedCombat,'preparationTimer')
checking=true;ok,message=pcall(AdvanceVisualTime,1)
assert(not ok and message:find('injected preparation guard failure')and failures==2);AssertCleared(timer)
local timerStart=TimerStart
function TimerStart(handle,interval,...)
    if interval==1 then error('injected countdown start failure')end
    return timerStart(handle,interval,...)
end
state='STAGE_CLEAR';SurvivorUI.ShowCombatPreparation(1,Ready,function()return true end)
ok,message=pcall(ClickFrame,frames.HSCombatPreparationStart);TimerStart=timerStart
assert(not ok and message:find('injected countdown start failure')and failures==3)
assert(timers[#timers].destroyed and not SurvivorUI.IsCombatPreparationVisible()and LiveTimers(1)==0 and completed==0)
local pause,destroy=PauseTimer,DestroyTimer
for _,fault in ipairs({'pause','destroy'})do
    state='STAGE_CLEAR';SurvivorUI.ShowCombatPreparation(1,Ready,function()return true end)
    ClickFrame(frames.HSCombatPreparationStart);timer=Local(SurvivorUI.BeginPreparedCombat,'preparationTimer')
    local pauseCalls,destroyCalls=0,0
    function PauseTimer(handle)
        if handle==timer then pauseCalls=pauseCalls+1;if fault=='pause'then error('injected countdown pause failure')end end
        return pause(handle)
    end
    function DestroyTimer(handle)
        if handle==timer then destroyCalls=destroyCalls+1;if fault=='destroy'then error('injected countdown destroy failure')end end
        return destroy(handle)
    end
    ok,message=pcall(SurvivorUI.HidePanel)
    assert(not ok and message:find('injected countdown '..fault..' failure')and pauseCalls==1 and destroyCalls==1
        and not timer.running and not SurvivorUI.IsCombatPreparationVisible()
        and not frames.HSCombatPreparation.visible and not frames.HSCombatCountdown.visible,
        'Attempt both timer natives and hide preparation even when one teardown native fails')
    timer.callback();assert(completed==0 and LiveTimers(1)==0)
    PauseTimer,DestroyTimer=pause,destroy;destroy(timer)
end
state='STAGE_CLEAR';SurvivorUI.ShowCombatPreparation(1,Ready,function()return true end)
ClickFrame(frames.HSCombatPreparationStart);AdvanceVisualTime(3)
assert(completed==1 and failures==3 and not SurvivorUI.IsCombatPreparationVisible()and #unsafeFrameCalls==0,
    'A fresh preparation completes once after handled countdown failures')
`);

suite('actual preparation UI supports second-page selections, return navigation and duplicate-click guards', presentationMocks + String.raw`
SurvivorUI.HidePanel=function()end
SurvivorUI.ClearDamageBoard=function()end
SurvivorStory={title='안야의 긴 밤',notice='창작 외전'}
HeroSurvivor.IsStorySummary=function()return false end
HeroSurvivor.ToggleStorySummary=function()end
`, [config,metrics,augments,'src/30_gameplay/SurvivorSetupUI.lua'], String.raw`
NativeGameUI()
local nativeSetupSnapshots={}
for _,frame in pairs(frames)do
    nativeSetupSnapshots[frame]={visible=frame.visible,enabled=frame.enabled,parent=frame.parent}
end
local chosen='power';local selects,starts,failures=0,0,0
local failStart=false
RunSession.Fail=function(message) failures=failures+1;failure=message end
SurvivorSetupUI.Init(function(kind)SurvivorSetupUI.ShowOptions(kind,chosen)end,
    function(kind,id)
        assert(kind=='TRINKET');chosen=id;selects=selects+1
        SurvivorSetupUI.ShowMenu('normal','firebolt',chosen)
    end,function()SurvivorSetupUI.ShowMenu('normal','firebolt',chosen)end,
    function()starts=starts+1;if failStart then error('intentional start failure')end end)
SurvivorSetupUI.ShowMenu(nil,nil,nil)
local setupBlack=frames.HeroSurvivorSetupShade
assert(setupBlack.texture==[[HeroSurvivorUI\Black.tga]] and setupBlack.alpha==255 and setupBlack.visible)
assert(setupBlack.width>=2.4 and setupBlack.height>=.6 and setupBlack.x==.4 and setupBlack.y==.3
    and not setupBlack.enabled and frames.HeroSurvivorSetupRoot.level>setupBlack.level,
    'The disabled opaque backdrop spans ultrawide screens while setup controls remain above it')
assert(not frames.HeroSurvivorSetupStart.enabled)
ClickFrame(frames.HeroSurvivorSetupStart);assert(starts==0)
SurvivorSetupUI.ShowMenu('normal','firebolt',chosen)
ClickFrame(frames.HeroSurvivorSetupTRINKET)
assert(setupBlack.visible and setupBlack.alpha==255,'Equipment option pages retain the black cover')
assert(frames.HeroSurvivorSetupPage.text=='1 / 2' and not frames.HeroSurvivorSetupPrevious.enabled)
ClickFrame(frames.HeroSurvivorSetupFollowing)
assert(frames.HeroSurvivorSetupPage.text=='2 / 2' and not frames.HeroSurvivorSetupFollowing.enabled)
assert(frames.HeroSurvivorSetupOption4.visible and not frames.HeroSurvivorSetupOption5.visible)
ClickFrame(frames.HeroSurvivorSetupOption4);ClickFrame(frames.HeroSurvivorSetupOption4)
assert(selects==1 and chosen==SurvivorConfig.startingTrinkets[10] and frames.HeroSurvivorSetupMenu.visible)
ClickFrame(frames.HeroSurvivorSetupTRINKET)
assert(frames.HeroSurvivorSetupPage.text=='2 / 2' and frames.HeroSurvivorSetupName4.text:find('선택됨'))
ClickFrame(frames.HeroSurvivorSetupPrevious);assert(frames.HeroSurvivorSetupPage.text=='1 / 2')
ClickFrame(frames.HeroSurvivorSetupBack);ClickFrame(frames.HeroSurvivorSetupTRINKET)
assert(frames.HeroSurvivorSetupPage.text=='2 / 2','Reopening finds the selected item on its actual page')
ClickFrame(frames.HeroSurvivorSetupBack)
assert(setupBlack.visible and setupBlack.alpha==255,'Returning to the preparation menu retains opaque black')
failStart=true;ClickFrame(frames.HeroSurvivorSetupStart);ClickFrame(frames.HeroSurvivorSetupStart)
assert(starts==1 and failures==1 and failure:find('intentional start failure'))
assert(not frames.HeroSurvivorSetupRoot.visible and not frames.HeroSurvivorSetupShade.visible)
SurvivorSetupUI.ShowMenu('normal','firebolt',chosen);failStart=false
ClickFrame(frames.HeroSurvivorSetupStart);ClickFrame(frames.HeroSurvivorSetupStart)
assert(starts==2 and failures==1,'A fresh preparation can start once after a handled failure')
local setupRoot,setupShade=frames.HeroSurvivorSetupRoot,frames.HeroSurvivorSetupShade
for _=1,3 do
    SurvivorSetupUI.ShowMenu('normal','firebolt',chosen)
    for _,kind in ipairs({'DIFFICULTY','WEAPON','TRINKET'})do
        ClickFrame(frames['HeroSurvivorSetup'..kind])
        assert(setupShade.visible and setupShade.alpha==255 and setupRoot.visible)
        ClickFrame(frames.HeroSurvivorSetupBack)
    end
    SurvivorSetupUI.Hide();SurvivorSetupUI.Hide()
    assert(not setupRoot.visible and not setupShade.visible)
    assert(frames.HeroSurvivorSetupRoot==setupRoot and frames.HeroSurvivorSetupShade==setupShade,
        'Menu, option and retry cycles reuse both map-lifetime black-cover siblings')
end
for frame,snapshot in pairs(nativeSetupSnapshots)do
    assert(frame.visible==snapshot.visible and frame.enabled==snapshot.enabled and frame.parent==snapshot.parent,
        'Black preparation screens change only their own custom UI and leave native selection panels untouched')
end
`);

const stageMocks = presentationMocks + String.raw`
PATHING_TYPE_WALKABILITY="walk";GAME_STATE_TIME_OF_DAY="time"
blocked,sceneEffects,painted,terrainCells,heightLocations={}, {}, {}, {}, {}
local function Cell(x,y)return math.floor(x/32)..":"..math.floor(y/32)end
function TerrainCell(x,y)
    local ix,iy=math.floor(x/128),math.floor(y/128);local key=ix..":"..iy
    if not terrainCells[key]then
        local tile,variance,blighted='Lgrs',math.abs(ix*3+iy*7)%16,(ix+iy)%3==0
        terrainCells[key]={x=ix*128+64,y=iy*128+64,tile=tile,variance=variance,blighted=blighted,
            originalTile=tile,originalVariance=variance,originalBlighted=blighted}
    end
    return terrainCells[key]
end
function IsTerrainPathable(x,y)return blocked[Cell(x,y)]==true end
function SetTerrainPathable(x,y,kind,walkable) blocked[Cell(x,y)]=not walkable end
function GetTerrainType(x,y)return TerrainCell(x,y).tile end
function GetTerrainVariance(x,y)return TerrainCell(x,y).variance end
function IsPointBlighted(x,y)return TerrainCell(x,y).blighted end
function SetTerrainType(x,y,id,variation,size,shape)
    assert(size==1 and shape==1,'Runtime terrain owns one cell at a time')
    local cell=TerrainCell(x,y);cell.tile,cell.variance=id,variation
    painted[#painted+1]={x=x,y=y,id=id}
end
function SetBlightPoint(player,x,y,value)
    TerrainCell(x,y).blighted=value
end
function SetBlight()error('Radius blight writes can leak into adjacent authored cells')end
function SetBlightRect()error('A whole-map blight edit destroys authored scenery')end
function Location(x,y)local l={x=x,y=y};heightLocations[#heightLocations+1]=l;return l end
function MoveLocation(l,x,y)assert(not l.removed);l.x,l.y=x,y end
function GetLocationZ(l)assert(not l.removed);return 45+l.x*.001+l.y*.002 end
function RemoveLocation(l)assert(not l.removed);l.removed=true end
function BlzSetSpecialEffectZ(e,z)e.z=z end
function AddSpecialEffect(model,x,y)local e={model=model,x=x,y=y};sceneEffects[#sceneEffects+1]=e;return e end
function Rect(a,b,c,d)return {minX=a,minY=b,maxX=c,maxY=d}end
worldBounds={minX=-32768,minY=-32768,maxX=32768,maxY=32768}
function GetWorldBounds()return Rect(worldBounds.minX,worldBounds.minY,worldBounds.maxX,worldBounds.maxY)end
function RemoveRect(r)r.removed=true end
function AddWeatherEffect()return {}end
function RemoveWeatherEffect(w)w.removed=true end
for _,name in ipairs({"BlzSetSpecialEffectRoll","SetDayNightModels","SuspendTimeOfDay",
    "SetFloatGameState","FogMaskEnable","FogEnable","ResetTerrainFog","EnableWeatherEffect"})do _G[name]=function()end end
`;
suite('dialogue ambience owners share cached ducking, survive stage replacement and retry failed native gain writes', stageMocks,
    [config,metrics,'src/30_gameplay/SurvivorStage.lua'], String.raw`
SurvivorStage.Init({minX=-5000,minY=-5000,maxX=5000,maxY=5000});SurvivorStage.Apply(1)
local first=soundHandles[#soundHandles]
assert(first.loop and first.volume==18 and first.volumeWrites==1)
SurvivorStage.SetDialogueAmbience(true,'ui');assert(first.volume==8 and first.volumeWrites==2)
SurvivorStage.SetDialogueAmbience(true,'ui');SurvivorStage.SetDialogueAmbience(true)
assert(first.volumeWrites==2,'Repeated updates and a second owner do not repeat native gain writes')
SurvivorStage.SetDialogueAmbience(false,'ui');assert(first.volume==8 and first.volumeWrites==2,
    'Releasing the intro UI must not undo the story scene duck')
SurvivorStage.SetDialogueAmbience(false);assert(first.volume==18 and first.volumeWrites==3)
SurvivorStage.SetDialogueAmbience(false);assert(first.volumeWrites==3)
SurvivorStage.SetDialogueAmbience(true,'ui');SurvivorStage.Apply(2)
local replacement=soundHandles[#soundHandles]
assert(replacement~=first and first.stopped and replacement.volume==8 and replacement.volumeWrites==1,
    'A newly created theme loop inherits the active dialogue ownership')
soundVolumeError=true
local ok=pcall(function()SurvivorStage.SetDialogueAmbience(false,'ui')end)
assert(ok and replacement.volume==8 and Local(SurvivorStage.SetDialogueAmbience,'soundVolume')==8,
    'A failed optional native must neither stop gameplay nor cache an unapplied gain')
soundVolumeError=false;SurvivorStage.SetDialogueAmbience(false,'ui')
assert(replacement.volume==18 and replacement.volumeWrites==2,'A later update retries the failed gain')
SurvivorStage.SetDialogueAmbience(true);SurvivorStage.Cleanup()
assert(replacement.volume==18 and replacement.stopped and next(Local(SurvivorStage.SetDialogueAmbience,'dialogueAudioOwners'))==nil)
SurvivorStage.Init({minX=-5000,minY=-5000,maxX=5000,maxY=5000});SurvivorStage.Apply(3)
assert(soundHandles[#soundHandles].volume==18,'A restarted run does not inherit a stale owner')
SurvivorStage.Cleanup()
`);

suite('actual intro, story and stage modules keep ambience ducked until both dialogue owners release it', stageMocks,
    [config,metrics,'src/30_gameplay/SurvivorStage.lua','src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorStage.Init({minX=-5000,minY=-5000,maxX=5000,maxY=5000});SurvivorStage.Apply(1)
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local loop=soundHandles[1];state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',0,0,0);local completed=0
SurvivorStory.ShowBriefing(hero,function()completed=completed+1 end)
local owners=Local(SurvivorStage.SetDialogueAmbience,'dialogueAudioOwners')
assert(owners.story and owners.ui and loop.volume==8 and loop.volumeWrites==2)
AdvanceVisualTime(.6);SurvivorUI.AdvanceNarrative();AdvanceVisualTime(.6)
assert(loop.volume==8 and loop.volumeWrites==2,'Page actions and cue playback leave the ambience gain cached')
SurvivorUI.SkipConversation()
assert(completed==1 and hero.visible and loop.volume==18 and loop.volumeWrites==3 and next(owners)==nil,
    'UI completion releases its owner while story ownership holds the duck, then restores the gain once')
SurvivorUI.ShowStageIntro(2,function()completed=completed+1 end,hero)
assert(owners.ui and owners.story and loop.volume==8 and not hero.visible,'An arrival is a staged scene with both owners')
SurvivorUI.SkipConversation();assert(completed==2 and hero.visible and loop.volume==18 and next(owners)==nil)
SurvivorStage.Cleanup()
`);

suite('actual story scenery survives completion, skip and replay until stage transition or run cleanup', stageMocks,
    [config,metrics,'src/30_gameplay/SurvivorStage.lua','src/30_gameplay/SurvivorStory.lua','src/30_gameplay/SurvivorUI.lua'], String.raw`
SurvivorStage.Init({minX=-5000,minY=-5000,maxX=5000,maxY=5000})
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',0,0,0);local completed=0
local function Done()completed=completed+1 end
local function Scenery()
    local result={}
    for key,effect in pairs(Local(SurvivorStage.SceneProp,'sceneProps'))do
        assert(not effect.destroyed and effect.alpha~=0)
        assert(math.abs(effect.z-(45+effect.x*.001+effect.y*.002))<.001,
            'Static scenery remains grounded instead of being retired below the terrain')
        assert(effect.animation==ANIM_TYPE_STAND,'Persistent props explicitly use their idle animation')
        result[key]={effect=effect,x=effect.x,y=effect.y,z=effect.z}
    end
    return result
end
local function Survives(snapshot)
    local props=Local(SurvivorStage.SceneProp,'sceneProps')
    for key,entry in pairs(snapshot)do
        local effect=entry.effect
        assert(props[key]==effect and not effect.destroyed and effect.alpha~=0
            and effect.x==entry.x and effect.y==entry.y and effect.z==entry.z,
            'Dialogue cleanup must preserve the same visible static landscape handle')
    end
end
local function Closed(actors,portraits)
    assert(hero.visible and #Local(SurvivorStory.Cleanup,'sceneEffects')==0)
    for _,effect in ipairs(actors)do assert(effect.destroyed,'Actors, patrols and carried evidence are scene-owned')end
    for _,unit in pairs(portraits)do assert(unit.removed,'Portrait proxies remain scene-owned')end
    assert(Local(SurvivorStory.Cleanup,'motion')==nil
        and Local(SurvivorStory.Cleanup,'cameraGuardTimer')==nil,'Dialogue timers still retire with their scene')
end
local previous
for index=1,5 do
    SurvivorStage.Apply(index)
    if previous then for _,entry in pairs(previous)do
        assert(entry.effect.destroyed,'A stage transition removes the preceding scene scenery')
    end end
    assert(next(Local(SurvivorStage.SceneProp,'sceneProps'))==nil,'Stage application resets scenery keys')
    if index==1 then
        SurvivorStory.ShowBriefing(hero,Done)
        local snapshot=Scenery();local count=0;for _ in pairs(snapshot)do count=count+1 end
        assert(count==4 and not hero.visible,'The briefing separates its grave and footprints from its two actors')
        local actors,portraits=Local(SurvivorStory.Cleanup,'sceneEffects'),Local(SurvivorStory.Cleanup,'portraitUnits')
        assert(#actors==2)
        SurvivorUI.SkipConversation();Closed(actors,portraits);Survives(snapshot)
    end
    local function Open()
        if index<5 then SurvivorStory.ShowInterlude(index,hero,Done)else SurvivorStory.ShowEnding(hero,Done)end
    end
    finding=nil;Open()
    local actors,portraits=Local(SurvivorStory.Cleanup,'sceneEffects'),Local(SurvivorStory.Cleanup,'portraitUnits')
    assert(not hero.visible and #actors==({2,3,2,5,4})[index],
        'Only actors, the sample, patrols and moving ending transport belong to Story')
    local snapshot=Scenery()
    for _,entry in pairs(snapshot)do for _,actor in ipairs(actors)do
        assert(entry.effect~=actor,'Stage scenery cannot enter the scene actor cleanup list')
    end end
    local before=#Local(SurvivorStage.Apply,'effects')
    assert(before<=96)
    for _=1,index==5 and 5 or 4 do SurvivorUI.AdvanceNarrative()end
    Closed(actors,portraits);Survives(snapshot)
    finding=true;Open()
    local retryActors,retryPortraits=Local(SurvivorStory.Cleanup,'sceneEffects'),Local(SurvivorStory.Cleanup,'portraitUnits')
    assert(#Local(SurvivorStage.Apply,'effects')==before,'Replaying a scene never duplicates static scenery')
    Survives(snapshot)
    if index==4 then assert(#retryActors==6,'Recovered orders remain transient scene evidence')end
    SurvivorUI.SkipConversation();Closed(retryActors,retryPortraits);Survives(snapshot)
    previous=Scenery()
end
assert(completed==11)
SurvivorStory.Reset();Survives(previous)
local effects=Local(SurvivorStage.Apply,'effects')
local prop=SurvivorStage.SceneProp('budget-prop','prop.mdl',700,700,.5,0,{100,110,120})
assert(prop)
for i=1,200 do SurvivorStage.SceneProp('budget-'..i,'prop.mdl',700,700,.5,0,{100,110,120})end
assert(#effects==96 and SurvivorStage.SceneProp('overflow','prop.mdl',700,700,1)==nil,
    'Dialogue scenery shares the stage effect budget')
assert(SurvivorStage.SceneProp('budget-prop','other.mdl',900,900,2)==prop,
    'A duplicate key returns its original handle even when the effect budget is full')
SurvivorStage.Cleanup()
for _,effect in ipairs(effects)do assert(effect.destroyed,'Run cleanup destroys persistent scenery too')end
assert(next(Local(SurvivorStage.SceneProp,'sceneProps'))==nil)
SurvivorStage.Init({minX=-5000,minY=-5000,maxX=5000,maxY=5000});SurvivorStage.Apply(1)
local fresh=SurvivorStage.SceneProp('budget-prop','prop.mdl',700,700,.5)
assert(fresh and fresh~=prop,'A restarted run acquires fresh scenery after all old owners were cleared')
SurvivorStage.Cleanup()
`);

suite('five detailed landmarks preserve authored terrain, grounding, effect budget and reversible pathing', stageMocks,
    [config,metrics,'src/30_gameplay/SurvivorStage.lua'], String.raw`
for _,fixture in ipairs({
    {arena=bj_mapInitialPlayableArea,world={minX=-16384,minY=-1536,maxX=1024,maxY=16384}},
    {arena={minX=-13568,minY=1536,maxX=-1792,maxY=13312},world={minX=-13824,minY=1280,maxX=-1536,maxY=13568}},
    {arena={minX=-1200,minY=-1200,maxX=1200,maxY=1200},world={minX=-1408,minY=-1408,maxX=1408,maxY=1408}},
})do
    local bounds=fixture.arena;worldBounds=fixture.world
    SurvivorStage.Init(bounds)
    local cx,cy=(bounds.minX+bounds.maxX)/2,(bounds.minY+bounds.maxY)/2
    -- An editor-authored blocked cell must survive all stage rebuilds.
    local authored=TerrainCell(cx+768,cy+384)
    local key=math.floor(authored.x/32)..":"..math.floor(authored.y/32);blocked[key]=true
    local extent={minX=math.max(bounds.minX-1024,worldBounds.minX+64),maxX=math.min(bounds.maxX+1024,worldBounds.maxX-64),
        minY=math.max(bounds.minY-1024,worldBounds.minY+64),maxY=math.min(bounds.maxY+1024,worldBounds.maxY-64)}
    for stage=1,5 do
        painted={};SurvivorStage.Apply(stage)
        local live=0
        for _,e in ipairs(sceneEffects)do if not e.destroyed then
            live=live+1;assert(e.x>=bounds.minX and e.x<=bounds.maxX and e.y>=bounds.minY and e.y<=bounds.maxY)
            assert(math.abs(e.z-(45+e.x*.001+e.y*.002))<.001,'Every prop must sit on the real terrain height')
            assert((e.x-cx)^2+(e.y-cy)^2>=420^2,'Keep the starting battle clearing free of scenery')
        end end
        assert(live<=96 and live>10)
        local owned=Local(SurvivorStage.Apply,'painted')
        assert(#owned>0)
        for _,cell in ipairs(owned)do
            local original=TerrainCell(cell.x,cell.y)
            assert(cell.tile==original.originalTile and cell.variation==original.originalVariance
                and cell.blighted==original.originalBlighted,'Stage rebuilds must restore authored data before acquiring new cells')
        end
        local ownership={};for _,cell in ipairs(owned)do ownership[cell.x..':'..cell.y]=true end
        local expected=0
        for x=math.ceil((extent.minX-64)/128)*128+64,extent.maxX,128 do
            for y=math.ceil((extent.minY-64)/128)*128+64,extent.maxY,128 do
                expected=expected+1
                assert(ownership[x..':'..y],'The whole playable landscape and clipped sight buffer need continuous textures')
                if stage==3 then
                    local tile=TerrainCell(x,y).tile
                    assert(tile=='Nsnw' or tile=='Nice' or tile=='Nsnr',
                        'Snow remains coherent on reachable ground, blocked landscape and the outside sight buffer')
                end
            end
        end
        assert(#owned==expected,'A bounded rectangular sight buffer owns every cell exactly once')
        for _,p in ipairs(painted)do
            -- Apply restores the preceding stage before painting the same bounded extent again.
            assert(p.x>=extent.minX and p.x<=extent.maxX and p.y>=extent.minY and p.y<=extent.maxY,
                'Texture presentation must stay within the native world bounds and its bounded sight buffer')
        end
        assert(blocked[key],'Presentation may recolor authored obstacles without changing their pathing')
        if stage==3 then
            assert(authored.tile=='Nsnw' or authored.tile=='Nice' or authored.tile=='Nsnr',
                'A blocked tile is part of the landscape and must not retain a dirt hole')
            local x,y=bounds.maxX-192,cy
            assert(not IsTerrainPathable(x,y),'Far outer floor fixture must be walkable')
            local tile=TerrainCell(x,y).tile
            assert(tile=='Nsnw' or tile=='Nice' or tile=='Nsnr','Reachable snow extends beyond the old central district')
            if bounds.maxX-bounds.minX>5000 then assert(x-cx>1900,'Exercise snow beyond the former paint radius')end
        end
        local point=SurvivorStage.FindPoint(0,1000,{})
        assert(point and not IsTerrainPathable(point.x,point.y),"Search destination remains reachable")
        local approach=SurvivorStage.LandmarkApproach({})
        assert(approach and not IsTerrainPathable(approach.x,approach.y),"Landmark investigation must be on a reachable forecourt")
        assert(SurvivorStage.Get(stage).landmark)
        local route=SurvivorStage.SearchPoints(stage)
        assert(#route==({3,4,1,3,3})[stage],'Decorated search route supplies every gameplay point')
        for i,point in ipairs(route)do
            assert(point.x>bounds.minX and point.x<bounds.maxX and point.y>bounds.minY and point.y<bounds.maxY)
            assert(not IsTerrainPathable(point.x,point.y),'Environmental clues may not block their investigation point')
            for j=1,i-1 do assert((point.x-route[j].x)^2+(point.y-route[j].y)^2>=180^2,'Distinct investigation points remain legible')end
        end
        local scene=SurvivorStage.ScenePoint()
        assert(scene and scene.x-300>=bounds.minX and scene.x+660<=bounds.maxX
            and scene.y>=bounds.minY and scene.y+670<=bounds.maxY,'Actors and departure entrance stay inside the map')
    end
    SurvivorStage.Cleanup()
    assert(blocked[key],"Editor pathing was overwritten")
    for k,v in pairs(blocked)do if k~=key then assert(not v,"Temporary wall survived cleanup")end end
    for _,e in ipairs(sceneEffects)do assert(e.destroyed,"Scenery leaked across stage cleanup")end
    for _,l in ipairs(heightLocations)do assert(l.removed,'Scenery height Location leaked')end
    for _,cell in pairs(terrainCells)do
        assert(cell.tile==cell.originalTile and cell.variance==cell.originalVariance and cell.blighted==cell.originalBlighted,
            'Cleanup must restore each authored tile, variation and blight')
    end
    blocked,sceneEffects,terrainCells,heightLocations={},{},{},{}
end
`);

suite('stage reachability reuses native samples only within one geometry build and reports transition work', stageMocks,
    [config,metrics,'src/30_gameplay/SurvivorStage.lua'], String.raw`
SurvivorMetrics.Enable(true)
SurvivorStage.Init({minX=-5000,minY=-5000,maxX=5000,maxY=5000})
SurvivorStage.Apply(1)
local counters=Local(SurvivorMetrics.Report,'counters')
assert(counters['stage.calls']==1 and counters['stage.geometry.cells']>0
    and counters['stage.terrain.cells']>0 and counters['stage.scenery.effects']>0)
local flood=Local(SurvivorStage.Apply,'BuildReachable')
local original=IsTerrainPathable
local samples={}
function IsTerrainPathable(x,y,...)
    local key=string.format('%.3f:%.3f',x,y)
    assert(samples[key]==nil,'Overlapping flood margins and edges share each native sample')
    samples[key]=true;return original(x,y,...)
end
SetLocal(SurvivorStage.Apply,'reachable',{});flood(0,0)
IsTerrainPathable=original
local sampleCount=0;for _ in pairs(samples)do sampleCount=sampleCount+1 end
assert(sampleCount>0)
print('  cached reachability: '..sampleCount..' unique native samples')
local function HasNode(x,y)
    for _,p in ipairs(Local(SurvivorStage.FindPoint,'reachable'))do if p.x==x and p.y==y then return true end end
    return false
end
assert(HasNode(128,0))
blocked['4:0']=true;SurvivorStage.Apply(1);assert(not HasNode(128,0),'New authored pathing is observed on the next build')
blocked['4:0']=nil;SurvivorStage.Apply(1);assert(HasNode(128,0),'Pathing samples never survive into another stage application')
assert(counters['stage.calls']==3)
SurvivorStage.Cleanup();SurvivorMetrics.Enable(false)
`);

const originalPathMap = openMap(baseMapPath);
const originalPathTerrain = terrainInfo(originalPathMap.read('war3map.w3e'));
const originalPathInfoBytes = originalPathMap.read('war3map.w3i'), originalPathInfo = mapInfo(originalPathInfoBytes);
const originalMargins = Array.from({length: 4}, (_,i) => originalPathInfoBytes.readInt32LE(originalPathInfo.cameraOffset + 32 + i * 4));
// Match InitMapRects and HeroSurvivor.Start's 128-unit inset, rather than treating camera coordinates as playable bounds.
const originalArena = {minX: originalPathTerrain.x + originalMargins[0] * 128 + 128,
    maxX: originalPathTerrain.x + (originalPathTerrain.width - 1 - originalMargins[1]) * 128 - 128,
    minY: originalPathTerrain.y + originalMargins[2] * 128 + 128,
    maxY: originalPathTerrain.y + (originalPathTerrain.height - 1 - originalMargins[3]) * 128 - 128};
const originalPathBytes = originalPathMap.read('war3map.wpm');
suite('actual resized editor pathing connects the hero to every stage search and landmark', stageMocks + String.raw`
local originalPath=('` + originalPathBytes.subarray(16).toString('hex') + String.raw`'):gsub('..',function(pair)return string.char(tonumber(pair,16))end)
local originX,originY,width,height=` + [originalPathTerrain.x, originalPathTerrain.y, originalPathBytes.readInt32LE(8), originalPathBytes.readInt32LE(12)].join(',') + String.raw`
ActualArena={` + Object.entries(originalArena).map(([k,v]) => k + '=' + v).join(',') + String.raw`}
function OriginalWalkBlocked(x,y)
    local ix,iy=math.floor((x-originX)/32),math.floor((y-originY)/32)
    if ix<0 or iy<0 or ix>=width or iy>=height then return true end
    return (originalPath:byte(iy*width+ix+1)&2)~=0
end
function IsTerrainPathable(x,y)
    local key=math.floor(x/32)..':'..math.floor(y/32)
    if blocked[key]~=nil then return blocked[key]end
    return OriginalWalkBlocked(x,y)
end
`, [config,metrics,'src/30_gameplay/SurvivorStage.lua'], String.raw`
local bounds=ActualArena
local cx,cy=(bounds.minX+bounds.maxX)/2,(bounds.minY+bounds.maxY)/2
for dx=-32,32,32 do for dy=-32,32,32 do
    assert(not OriginalWalkBlocked(cx+dx,cy+dy),'The resized editor map must allow the hero-sized starting clearing')
end end
SurvivorStage.Init(bounds)
for stage=1,5 do
    SurvivorStage.Apply(stage)
    local expected=SurvivorStage.SearchPoints(stage)
    assert(#expected==({3,4,1,3,3})[stage],'Every authored-pathing stage must supply the required search points')
    expected[#expected+1]=assert(SurvivorStage.LandmarkApproach(),'The landmark needs a reachable forecourt')
    local queue,seen,head={{x=cx,y=cy}}, {[cx..':'..cy]=true},1
    local offsets={{32,0},{-32,0},{0,32},{0,-32}}
    -- Independently flood a finer grid against real WPM flags and current runtime walls.
    while queue[head]do
        local point=queue[head];head=head+1
        for _,offset in ipairs(offsets)do
            local x,y=point.x+offset[1],point.y+offset[2];local key=x..':'..y
            if not seen[key]and math.abs(x-cx)<=1952 and math.abs(y-cy)<=1952 then
                local clear=x>bounds.minX+96 and x<bounds.maxX-96 and y>bounds.minY+96 and y<bounds.maxY-96
                for _,margin in ipairs({{0,0},{32,0},{-32,0},{0,32},{0,-32}})do
                    if IsTerrainPathable(x+margin[1],y+margin[2])then clear=false;break end
                end
                if clear then seen[key]=true;queue[#queue+1]={x=x,y=y}end
            end
        end
    end
    for _,point in ipairs(expected)do
        assert(seen[point.x..':'..point.y],'Stage '..stage..' search/landmark must connect through real editor pathing')
    end
    print('  actual editor pathing: stage '..stage..', '..(#expected-1)..' search points + landmark, '..#queue..' reachable 32-unit nodes')
end
SurvivorStage.Cleanup()
for key,value in pairs(blocked)do
    local x,y=key:match('([^:]+):([^:]+)')
    assert(value==OriginalWalkBlocked(tonumber(x)*32+16,tonumber(y)*32+16),
        'Stage wall cleanup must restore the original editor path flag')
end
`);

for (const profile of ['development', 'playtest', 'release']) {
    const profileBundle = collectSources({profile}).bundle;
    assert(profileBundle.indexOf('HERO_SURVIVOR_PROFILE = "' + profile + '"') < profileBundle.indexOf('Debug = {'),
        'The profile must be available before vendor configuration');
    suite('build profile preserves error protection and disables release diagnostics: ' + profile,
        mocks + String.raw`
HERO_SURVIVOR_PROFILE='` + profile + String.raw`'
InitBlizzard=function()end
function GetBJMaxPlayerSlots()return 24 end
oldTimerStart,oldTriggerAddAction,oldTostring=TimerStart,TriggerAddAction,tostring
`, ['src/05_vendor/DebugUtils.lua', config], String.raw`
local development=HERO_SURVIVOR_PROFILE=='development'
local release=HERO_SURVIVOR_PROFILE=='release'
assert(Debug.settings.USE_NAME_CACHE==development and Debug.settings.AUTO_REGISTER_NEW_NAMES==development)
assert(Debug.settings.NAME_CACHE_DEPTH==(development and 4 or 0))
assert(SurvivorConfig.debugCommands==not release and ALICE_Config.PROTECTED_MODE)
assert((TimerStart==oldTimerStart)==release and (TriggerAddAction==oldTriggerAddAction)==release)
assert((tostring==oldTostring)==not development)
assert(Debug.settings.enabled==not release)
if release then assert(not Debug.settings.ALLOW_INGAME_CODE_EXECUTION)end
if not development then assert(getmetatable(_G)==nil,'Playtest/release must avoid automatic global name metatables')end
`);
}

function publicationFixture(inject = () => {}) {
    const files = new Map(['asset-a', 'asset-b', 'bundle', 'map'].map(name => [name, Buffer.from('old-' + name)]));
    const io = {
        existsSync(file) { return files.has(file); },
        readFileSync(file) { inject('read', file, undefined, files); assert(files.has(file), 'Missing fixture: ' + file); return Buffer.from(files.get(file)); },
        mkdirSync() {},
        writeFileSync(file, bytes, options) {
            inject('write', file, undefined, files);
            if (options?.flag === 'wx' && files.has(file)) throw Object.assign(new Error('already exists'), {code: 'EEXIST'});
            files.set(file, Buffer.from(bytes));
        },
        renameSync(from, to) {
            inject('rename', from, to, files);
            assert(files.has(from), 'Missing prepared fixture'); files.set(to, files.get(from)); files.delete(from);
        },
        unlinkSync(file) { inject('unlink', file, undefined, files); assert(files.delete(file)); },
    };
    const entries = [...files].map(([file, before]) => ({path: file, before: Buffer.from(before), bytes: Buffer.from('new-' + file),
        ...(file === 'map' ? {alternate: 'alternate-map'} : {})}));
    const options = {io, stamp: 'fixture', finalize(paths) {
        return [{path: 'manifest', before: null, bytes: Buffer.from(paths.get('map'))}];
    }};
    return {files, entries, options};
}
for (const [label, operation, target] of [
    ['preparation', 'write', 'asset-b.fixture.tmp'], ['second asset', 'rename', 'asset-b'],
    ['map commit', 'rename', 'map'], ['success manifest', 'write', 'manifest.fixture.tmp'],
]) {
    let failed = false;
    const fixture = publicationFixture((op, from, to) => {
        if (!failed && op === operation && (op === 'rename' ? to : from) === target) {
            failed = true; throw new Error('injected ' + label + ' failure');
        }
    });
    const originalFiles = new Map([...fixture.files].map(([file, bytes]) => [file, Buffer.from(bytes)]));
    assert.throws(() => publishTransaction(fixture.entries, fixture.options), /injected/);
    assert(failed); assert.deepEqual(fixture.files, originalFiles, 'Publication failure must restore every committed companion');
    console.log('PASS publication rollback after ' + label + ' failure');
}
{
    const fixture = publicationFixture();
    const paths = publishTransaction(fixture.entries, fixture.options);
    assert.equal(paths.get('map'), 'map'); assert.equal(fixture.files.get('manifest').toString(), 'map');
    for (const file of ['asset-a', 'asset-b', 'bundle', 'map']) assert.equal(fixture.files.get(file).toString(), 'new-' + file);
    assert.equal(fixture.files.size, 5, 'Successful publication leaves no temporary files');
    console.log('PASS prepared map, companion files and actual-path manifest publish together');
}
for (const failManifest of [false, true]) {
    const fixture = publicationFixture((op, from, to) => {
        if (op === 'rename' && to === 'map') throw Object.assign(new Error('locked map'), {code: 'EBUSY'});
        if (failManifest && op === 'write' && from === 'manifest.fixture.tmp') throw new Error('injected final failure');
    });
    if (failManifest) {
        const before = new Map(fixture.files);
        assert.throws(() => publishTransaction(fixture.entries, fixture.options), /injected final/);
        assert.deepEqual(fixture.files, before);
    } else {
        const paths = publishTransaction(fixture.entries, fixture.options);
        assert.equal(paths.get('map'), 'alternate-map'); assert.equal(fixture.files.get('map').toString(), 'old-map');
        assert.equal(fixture.files.get('manifest').toString(), 'alternate-map');
    }
    console.log('PASS locked output uses a verified alternate and rollback protects its original: ' + failManifest);
}
{
    const fixture = publicationFixture((op, from, to, files) => {
        if (op === 'rename' && to === 'asset-a') files.set('asset-b', Buffer.from('external asset change'));
    });
    assert.throws(() => publishTransaction(fixture.entries, fixture.options), /changed during publication/);
    assert.equal(fixture.files.get('asset-a').toString(), 'old-asset-a');
    assert.equal(fixture.files.get('asset-b').toString(), 'external asset change');
    assert.equal(fixture.files.get('map').toString(), 'old-map');
    assert.equal(fixture.files.size, 4);
    console.log('PASS concurrent edits abort publication and survive companion rollback');
}
{
    const fixture = publicationFixture((op, from, to, files) => {
        if (op === 'rename' && to === 'map') { files.set('asset-a', Buffer.from('external post-commit change')); throw new Error('injected map failure'); }
    });
    assert.throws(() => publishTransaction(fixture.entries, fixture.options), /need recovery.*Concurrent edit preserved/);
    assert.equal(fixture.files.get('asset-a').toString(), 'external post-commit change');
    assert.equal(fixture.files.get('asset-b').toString(), 'old-asset-b');
    assert.equal(fixture.files.get('bundle').toString(), 'old-bundle');
    assert.equal(fixture.files.get('map').toString(), 'old-map');
    assert.equal(fixture.files.size, 4);
    console.log('PASS rollback refuses to overwrite a post-publication external edit');
}
{
    const fixture = publicationFixture((op, from, to, files) => {
        if (op === 'rename' && to === 'map') throw new Error('injected map failure');
        if (op === 'write' && from === 'asset-a.fixture.rollback') files.set('asset-a', Buffer.from('external edit during rollback'));
    });
    assert.throws(() => publishTransaction(fixture.entries, fixture.options), /need recovery.*Concurrent edit preserved/);
    assert.equal(fixture.files.get('asset-a').toString(), 'external edit during rollback');
    for (const name of ['asset-b', 'bundle', 'map']) assert.equal(fixture.files.get(name).toString(), 'old-' + name);
    assert.equal(fixture.files.size, 4);
    console.log('PASS rollback rechecks the destination after preparing its restoration');
}
{
    const fixture = publicationFixture((op, from, to) => {
        if (op === 'rename' && to === 'asset-b') throw new Error('original publication failure');
        if (op === 'unlink' && from === 'asset-b.fixture.tmp') throw Object.assign(new Error('temporary cleanup locked'), {code: 'EACCES'});
    });
    assert.throws(() => publishTransaction(fixture.entries, fixture.options), error => {
        assert(error instanceof AggregateError);
        assert(error.errors.some(item => /original publication failure/.test(item.message)));
        assert(error.errors.some(item => /temporary cleanup locked/.test(item.message)));
        return true;
    });
    for (const name of ['asset-a', 'asset-b', 'bundle', 'map']) assert.equal(fixture.files.get(name).toString(), 'old-' + name);
    assert.equal(fixture.files.size, 5, 'Only the locked temporary file remains');
    assert(fixture.files.has('asset-b.fixture.tmp'));
    console.log('PASS temporary cleanup continues after a failure and retains the original publication error');
}
{
    const fixture = publicationFixture();
    const before = new Map(fixture.files);
    fixture.options.guard = () => { throw new Error('source changed during build'); };
    assert.throws(() => publishTransaction(fixture.entries, fixture.options), /source changed/);
    assert.deepEqual(fixture.files, before);
    console.log('PASS source guard aborts after preparation without publishing companions');
}
{
    const fixture = publicationFixture((op, from) => {
        if (op === 'write' && from === 'manifest.fixture.tmp') throw new Error('injected manifest failure');
    });
    fixture.files.delete('map');
    fixture.entries.find(entry => entry.path === 'map').before = null;
    const before = new Map(fixture.files);
    assert.throws(() => publishTransaction(fixture.entries, fixture.options), /injected manifest/);
    assert.deepEqual(fixture.files, before, 'Rollback removes newly created outputs');
    console.log('PASS new profile output is removed when final publication fails');
}

const {bundle, count} = collectSources();
const original = fs.readFileSync(path.join(root, 'dist/AnyasLongNight-playtest.w3x'));
const map = openMap(original), old = map.read('war3map.lua').toString('utf8');
{
    for (const [tier,entries] of talentCatalog.tiers.entries()) {
        assert.deepEqual(entries.map(entry=>Object.keys(entry.bonuses)), tier%2===0
            ? [['damagePct'],['speedPct'],['maxLife']] : [['sizePct'],['rangePct'],['durationPct']],
            'Talent rows must use the requested effect order without hidden secondary bonuses');
    }
    const snapshots = new Map(), prepared = prepareItemTooltipCleanup(map,snapshots);
    const again = cleanItemTooltipEntries(prepared.entries);
    for (const [name,bytes] of prepared.entries) assert.deepEqual(again.get(name),bytes);
    const tooltipStrings = new Map([...prepared.entries.get('war3map.wts').toString('utf8')
        .matchAll(/^STRING (\d+)\r?\n(?:\/\/[^\r\n]*\r?\n)*\{\r?\n([\s\S]*?)\r?\n\}/gm)].map(match=>[Number(match[1]),match[2]]));
    const mainItems = parseObjectData(prepared.entries.get('war3map.w3t'),'item');
    const skinItems = parseObjectData(prepared.entries.get('war3mapSkin.w3t'),'item');
    for(const row of mainItems.tables.flat().filter(row=>/^H(?:sT[1-9A]|[seitabnchv]\d{2})$/.test(row.newId))) {
        const skin=skinItems.tables.flat().find(value=>value.newId===row.newId);
        for(const id of ['utub','ides']) {
            const field=row.fields.find(field=>field.id===id),skinField=skin.fields.find(field=>field.id===id);
            assert.equal(field.value,skinField.value,'Both native item readers must resolve the same clean text');
            const text=tooltipStrings.get(Number(field.value.slice(8)))??field.value;
            assert(text.length>0 && !/가방 정리 시 장비가 삭제됩니다\.|자동 공격 스킬을 새로 부여하지 않습니다\.|보유 중인 해당 무기에만 적용|기본 능력치는 각각 적용|세트 효과의 추가 피해는 세트 효과를 다시 일으키지 않음|확장 인벤토리에서 장착 시 적용/.test(text));
            if(/^HsT/.test(row.newId))assert(!text.includes('|cffaaaaaa') && !/단독 기준|강화 단계마다|자동 적용/.test(text));
        }
    }
    assert.deepEqual(cleanItemTooltipText('피해 +10%|n|cffaaaaaa보유 중인 해당 무기에만 적용|r|n풍미 문장'), '피해 +10%|n풍미 문장');
    assert.deepEqual(cleanItemTooltipText('체력 +100\r\n가방 정리 시 장비가 삭제됩니다.\r\n풍미 문장'), '체력 +100\r\n풍미 문장');
    const fixture = new Map(prepared.entries), skin = parseObjectData(fixture.get('war3mapSkin.w3t'),'item');
    const row = skin.tables.flat().find(row=>row.newId==='He05'), field = row.fields.find(field=>field.id==='utub');
    delete row.raw; delete field.raw;
    field.value='피해 +10%|n가방 정리 시 장비가 삭제됩니다.|n풍미 문장';
    fixture.set('war3mapSkin.w3t',serializeObjectData(skin));
    const inline = cleanItemTooltipEntries(fixture);
    assert.equal(parseObjectData(inline.get('war3mapSkin.w3t'),'item').tables.flat().find(row=>row.newId==='He05')
        .fields.find(field=>field.id==='utub').value,'피해 +10%|n풍미 문장');
    verifyPreserved(original,map.replace(prepared.entries),[...prepared.entries.keys()]);
    assert.equal(snapshots.size,7);
    console.log('PASS requested talent categories and item tooltip cleanup preserve stats, flavor, unrelated data and repeated builds');
}
{
    const catalog=loadItemTooltipCatalog();
    assert.equal(catalog.get('HsT2').name,'신속의 인장');
    assert.equal(catalog.get('HsT3').name,'추적의 인장');
    assert.equal(catalog.get('HsT4').name,'가속의 인장');
    assert.equal(catalog.get('HsT5').name,'확대의 인장');
    const unwanted=/단계 특성 · 셋 중 하나 선택|이번 수색 동안 유지|자동 적용|레벨업 선택으로 강화|버리기 불가|숫자는 강화 레벨|가방 정리 시 장비가 삭제됩니다|자동 공격 스킬을 새로 부여하지 않습니다|보유 중인 해당 무기에만 적용|기본 능력치는 각각 적용|세트 효과의 추가 피해는 세트 효과를 다시 일으키지 않음|확장 인벤토리에서 장착 시 적용|해당 무기 보유 시 적용|장착 시 회복 없음|단독 기준|별도의 장비입니다/;
    for(const filename of [baseMapPath,path.join(root,'dist/AnyasLongNight-playtest.w3x')]) {
        const candidate=openMap(fs.readFileSync(filename));
        const strings=new Map([...candidate.read('war3map.wts').toString('utf8')
            .matchAll(/^STRING (\d+)\r?\n(?:\/\/[^\r\n]*\r?\n)*\{\r?\n([\s\S]*?)\r?\n\}/gm)].map(match=>[Number(match[1]),match[2]]));
        const resolve=field=>/^TRIGSTR_\d+$/.test(field.value)?strings.get(Number(field.value.slice(8))):field.value;
        for(const name of ['war3map.w3t','war3mapSkin.w3t']) {
            const rows=parseObjectData(candidate.read(name),'item').tables.flat();
            for(const [id,expected]of catalog) {
                const row=rows.find(row=>row.newId===id);assert(row,filename+' missing '+id);
                for(const field of ['utub','ides']) {
                    const value=resolve(row.fields.find(value=>value.id===field));
                    assert.equal(value,expected.description,filename+' '+id+'/'+field+' differs from runtime');
                    assert(!unwanted.test(value),'A removed notice remains in '+id);
                }
                for(const field of row.fields.filter(field=>['unam','utip'].includes(field.id)))assert.equal(resolve(field),expected.name);
            }
        }
        for(const name of ['war3map.w3a','war3mapSkin.w3a']) {
            const rows=parseObjectData(candidate.read(name),'ability').tables[1];
            for(const entry of talentCatalog.tiers.flat())assert.equal(rows.find(row=>row.newId===entry.id)
                .fields.find(field=>field.id==='aub1').value,entry.text);
            const controller=rows.find(row=>row.newId===talentCatalog.controller);
            for(let level=1;level<=5;level++)assert.equal(controller.fields.find(field=>field.id==='aub1'&&field.level===level).value,talentCatalog.controllerText);
            const interfaceRow=parseObjectData(candidate.read(name),'ability').tables[0].find(row=>row.oldId==='ASpc');
            assert(interfaceRow,'Both maps must store the short default interface tooltip');
            assert.equal(interfaceRow.fields.find(field=>field.id==='atp1').value,talentCatalog.interface.title);
            assert.equal(interfaceRow.fields.find(field=>field.id==='aub1').value,talentCatalog.interface.defaultText);
            assert.deepEqual(installInterfaceTooltip(candidate.read(name),talentCatalog),candidate.read(name));
        }
    }
    const weapons=loadWeaponTooltipCatalog();
    for(const filename of [baseMapPath,path.join(root,'dist/AnyasLongNight-playtest.w3x')]) {
        const candidate=openMap(fs.readFileSync(filename));
        const entries=new Map(['war3map.w3a','war3mapSkin.w3a','war3map.wts'].map(name=>[name,candidate.read(name)]));
        for(const [name,bytes]of cleanWeaponTooltipEntries(entries,weapons))assert.deepEqual(bytes,entries.get(name),'Saved weapon tooltip differs from runtime: '+filename+'/'+name);
    }
    const weaponEntries=new Map(['war3map.w3a','war3mapSkin.w3a','war3map.wts'].map(name=>[name,map.read(name)]));
    const installed=cleanWeaponTooltipEntries(weaponEntries,weapons);
    const strip=bytes=>{
        const data=parseObjectData(bytes,'ability');
        for(const row of data.tables[1].filter(row=>/^HsW[1-9ABC]$/.test(row.newId))) {
            row.fields=row.fields.filter(field=>!['anam','atp1','aub1'].includes(field.id));delete row.raw;
        }
        return serializeObjectData(data);
    };
    for(const name of ['war3map.w3a','war3mapSkin.w3a'])assert.deepEqual(strip(installed.get(name)),strip(weaponEntries.get(name)),
        'Weapon tooltip synchronization must preserve every combat field and unrelated ability');
    console.log('PASS complete original/test audit: 15 talents, 10 trinkets, 82 equipment items and 60 weapon levels match runtime');
}
{
    const snapshots=new Map(),prepared=prepareNativeTalents(map,snapshots);
    const ids=new Set([talentCatalog.controller,...talentCatalog.tiers.flat().map(entry=>entry.id)]);
    for(const [name,skin]of [['war3map.w3a',false],['war3mapSkin.w3a',true]]) {
        const source=map.read(name),output=prepared.entries.get(name),data=parseObjectData(output,'ability');
        const controller=data.tables[1].find(row=>row.newId===talentCatalog.controller);
        assert.equal(controller.oldId,'ATua');
        if(!skin) {
            assert.equal(controller.fields.find(field=>field.id==='alev').value,5);
            const tiers=controller.fields.filter(field=>field.id==='aabi');
            assert.equal(tiers.length,5);
            for(let i=0;i<5;i++)assert.deepEqual([tiers[i].level,tiers[i].column,tiers[i].value],
                [i+1,0,talentCatalog.tiers[i].map(entry=>entry.id).join(',')]);
        }
        for(const entry of talentCatalog.tiers.flat()) {
            const row=data.tables[1].find(row=>row.newId===entry.id);assert.equal(row.oldId,'Aamk');
            assert.equal(row.fields.find(field=>field.id==='aub1').value,entry.text,
                'Both base and skin data must contain only the concise talent effect');
            if(skin) {
                assert.equal(row.fields.find(field=>field.id==='abpy').value,-11);
                assert.equal(row.fields.find(field=>field.id==='aub1').value,entry.text);
            } else for(const id of ['Iagi','Iint','Istr'])assert.equal(row.fields.find(field=>field.id===id).value,0);
        }
        const strip=value=>{const d=parseObjectData(value,'ability');d.tables[1]=d.tables[1].filter(row=>!ids.has(row.newId));return serializeObjectData(d);};
        assert.deepEqual(strip(output),strip(source),'All unrelated ability rows must retain exact raw bytes');
        assert.deepEqual(installNativeTalents(output,skin,talentCatalog),output);
        const collision=parseObjectData(output,'ability');collision.tables[1].find(row=>row.newId==='Ht1A').oldId='AHbz';
        assert.throws(()=>installNativeTalents(serializeObjectData({...collision,tables:collision.tables.map(table=>table.map(row=>{
            if(row.newId==='Ht1A')delete row.raw;return row;
        }))}),skin,talentCatalog),/collision/);
    }
    const installed=map.replace(prepared.entries),saved=openMap(installed);
    for(const [name,bytes]of prepared.entries)assert.deepEqual(saved.read(name),bytes);
    verifyPreserved(original,installed,['war3map.w3a','war3mapSkin.w3a']);
    assert(snapshots.size===3 && prepared.assets.size===2);
    assert(bundle.includes(talentLua(talentCatalog)),'Native objects and runtime must use the same guarded catalog');
    console.log('PASS ATua-based five-tier tree, fifteen hidden zero-stat markers, catalog consistency, raw preservation, collision guards and MPQ readback');
}
{
    const source = map.read('war3map.w3a'), snapshots = new Map();
    const prepared = prepareStatDetails(map, snapshots);
    const output = prepared.entries.get('war3map.w3a');
    const data = parseObjectData(output, 'ability');
    const row = data.tables[0].find(row => row.oldId === 'ASde');
    assert(row, 'Native ASde must have an explicit supported-stat list');
    const field = row.fields.find(field => field.id === 'Asdf');
    assert.deepEqual([field.type, field.level, field.column, field.value], [3, 1, 1, 'AS01,AS0F']);
    assert.deepEqual(installStatDetails(output), output, 'ASde installation must be idempotent');
    const stripOwned = bytes => {const d = parseObjectData(bytes, 'ability');
        d.tables[0] = d.tables[0].filter(row => row.oldId !== 'ASde');return serializeObjectData(d);};
    assert.deepEqual(stripOwned(output), stripOwned(source), 'Every unrelated ability record retains its raw bytes');
    for (const version of [1,2,3]) {
        const fixture = {version, kind: 'ability', tables: [[{oldId:'ASde',newId:'\0\0\0\0',extra:version===3?[0]:[],fields:[
            {id:'Asdf',type:3,level:1,column:4,value:'AS01,AS03,AS0F',endId:'ASde'},
            {id:'anam',type:3,level:0,column:0,value:'keep native text',endId:'ASde'}]}],[]]};
        const bytes = serializeObjectData(fixture), installed = installStatDetails(bytes);
        const before = parseObjectData(bytes, 'ability').tables[0][0], after = parseObjectData(installed, 'ability').tables[0][0];
        assert.equal(after.fields[0].value, 'AS01,AS0F');assert.deepEqual(after.fields[1].raw, before.fields[1].raw);
        assert.deepEqual(installStatDetails(bytes, true), installed, 'A skin override cannot restore unsupported stats');
        fixture.tables[0][0].fields[0].column = 2;
        assert.throws(() => installStatDetails(serializeObjectData(fixture)), /field layout/);
    }
    const patched = map.replace(prepared.entries), saved = openMap(patched);
    assert.deepEqual(saved.read('war3map.w3a'), output);
    assert.deepEqual(prepareStatDetails(saved).entries.get('war3map.w3a'), output);
    verifyPreserved(original, patched, ['war3map.w3a','war3mapSkin.w3a']);
    assert(snapshots.size===2 && prepared.assets.size===2);
    assert.deepEqual(fs.readFileSync(path.join(root,'assets/war3map.w3a')), source, 'Preparation must not publish assets');
    console.log('PASS native ASde shows only engine regeneration and magic resistance; level/column, skins, unrelated bytes, MPQ readback and idempotence are preserved');
}
{
    const prepared = prepareHeroRegeneration(map), source = map.read('war3map.w3u');
    const output = prepared.entries.get('war3map.w3u');
    const row = parseUnits(output).tables[0].find(row => row.oldId === 'Uany');
    assert.equal(row.fields.find(field => field.id === 'uhrt').value, 1);
    assert.equal(row.fields.find(field => field.id === 'uhpr').value, 0);
    const stripOwned = bytes => {const data = parseUnits(bytes);
        for (const row of data.tables[0]) if (row.oldId === 'Uany') {
            row.fields = row.fields.filter(field => !['uhrt','uhpr'].includes(field.id)); delete row.raw;
        }return serializeUnits(data);};
    assert.deepEqual(stripOwned(output),stripOwned(source),'Only native regeneration fields may change on Anya');
    assert.deepEqual(installHeroRegeneration(output),output);
    for (const version of [1,2,3]) {
        const fixture = {version,kind:'unit',tables:[[{oldId:'Uany',newId:'\0\0\0\0',extra:version===3?[0,7]:[],fields:[
            {id:'uhrt',type:0,value:0,endId:'Uany'}, {id:'uhpr',type:1,value:2,endId:'Uany'},
            {id:'umdl',type:3,value:'keep-model',endId:'Uany'}]}],[]]};
        const before=serializeUnits(fixture),after=installHeroRegeneration(before);
        assert.deepEqual(stripOwned(after),stripOwned(before));
        assert.deepEqual(installHeroRegeneration(before,true),after,'An explicit skin cannot disable always-on regeneration');
        assert.deepEqual(installHeroRegeneration(after),after);
    }
    validateStrengthRegeneration(map.read('war3mapMisc.txt'));
    for (const text of ['[Misc]\nStrRegenBonus=0.05','[Misc]\nStrRegenBonus=0\nStrRegenBonus=0',
        '[Other]\nStrRegenBonus=0','[Misc]\nStrRegenBonus=']) {
        assert.throws(()=>validateStrengthRegeneration(Buffer.from(text)),/StrRegenBonus/);
    }
    const saved=map.replace(prepared.entries);
    assert.deepEqual(openMap(saved).read('war3map.w3u'),output);
    verifyPreserved(original,saved,['war3map.w3u','war3mapSkin.w3u']);
    assert.deepEqual(fs.readFileSync(path.join(root,'assets/war3map.w3u')),source,'Preparation must not publish unit assets');
    assert(!bundle.includes('SurvivorCombat.Regenerate('),'The old periodic Lua heal must not survive in the runtime bundle');
    console.log('PASS Anya always regenerates natively with no inherited base or STR bonus; skins, field bytes and saved MPQ remain consistent');
}
{
    const snapshots = new Map(), entries = prepareUIResources(map, snapshots);
    const texture = entries.get('HeroSurvivorUI\\Transparent.tga');
    assert(texture && snapshots.size === 1, 'Container texture is guarded as a build input');
    for (let i = 21; i < texture.length; i += 4) assert.equal(texture[i], 0);
    const installed = map.replace(entries), readback = openMap(installed);
    assert.deepEqual(readback.read('HeroSurvivorUI\\Transparent.tga'), texture);
    assert(readback.read('(listfile)').toString('utf8').includes('HeroSurvivorUI\\Transparent.tga'));
    assert.deepEqual(readback.replace(entries), installed, 'Resource installation is idempotent');
    assert.deepEqual(readback.replace(prepareUIResources(readback)), installed, 'Editor import registration is idempotent');
    const oldImports = map.read('war3map.imp'), imports = readback.read('war3map.imp');
    assert.deepEqual(imports.subarray(8, oldImports.length), oldImports.subarray(8), 'Existing import paths and flags are preserved');
    assert(imports.includes(Buffer.from('HeroSurvivorUI\\Transparent.tga\0')), 'The editor must retain the imported texture on save');
    verifyPreserved(original, installed, ['HeroSurvivorUI\\Transparent.tga', 'war3map.imp', '(listfile)']);
    console.log('PASS fully transparent container texture is imported, listed, byte-verified and preserves unrelated map data');
}
{
    const ui = fs.readFileSync(path.join(root, 'src/30_gameplay/SurvivorUI.lua'), 'utf8');
    const match = ui.match(/BlzFrameSetTexture\(introRoot,\s*"((?:\\.|[^"\\])*)"/);
    assert(match, 'The intro backdrop must declare its actual texture path');
    const texturePath = JSON.parse('"' + match[1] + '"');
    assert.equal(texturePath, 'HeroSurvivorUI\\Black.tga', 'Runtime texture paths use the actual MPQ import name');
    assert.deepEqual(map.read(texturePath), blackTexture, 'The runtime path must resolve to the exact opaque black asset inside the saved map');
    console.log('PASS runtime intro texture path resolves to the unchanged opaque black asset in the saved MPQ');
}
const changed = replaceBundle(old, bundle);
const result = map.replace(new Map([['war3map.lua', Buffer.from(changed)]]));
const preserved = verifyPreserved(original, result);
assert.equal(replaceBundle(changed, bundle), changed, 'Repeated build must be idempotent');
assert.throws(() => replaceBundle('function main() end', bundle), /marked/);
assert.throws(() => replaceBundle(old + old, bundle), /Duplicate/);
assert.equal(old.slice(old.lastIndexOf('-- ===== END src/00_bootstrap/HeroSurvivor.lua =====')),
    changed.slice(changed.lastIndexOf('-- ===== END src/00_bootstrap/HeroSurvivor.lua =====')));
console.log(`PASS Lua syntax (${count} sources), repeated bundle replacement, native map script and ${preserved} unrelated entries preserved`);
{
    const wct = map.read('war3map.wct'), commentEnd = wct.indexOf(0, 8), start = commentEnd + 5;
    const oldLength = wct.readUInt32LE(commentEnd + 1);
    const nativePrefix = '-- Authored prefix\nlocal nativePrefix = "keep"\n';
    const nativeSuffix = '\n-- Authored suffix\nlocal nativeSuffix = "keep"\n';
    const customScript = Buffer.from(nativePrefix + wct.toString('utf8', start, start + oldLength - 1) + nativeSuffix + '\0');
    const prefix = Buffer.from(wct.subarray(0, start)); prefix.writeUInt32LE(customScript.length, commentEnd + 1);
    const tail = wct.subarray(start + oldLength);
    let current = Buffer.concat([prefix, customScript, tail]);
    for (const profile of ['release', 'development', 'playtest']) {
        const nextBundle = collectSources({profile}).bundle;
        current = editorBundle(current, nextBundle);
        const length = current.readUInt32LE(commentEnd + 1);
        const text = current.toString('utf8', start, start + length - 1);
        assert(text.startsWith(nativePrefix) && text.endsWith(nativeSuffix), 'Native custom script must survive profile changes');
        assert(text.includes(nextBundle.trimEnd()), 'Editor source must contain the selected profile');
        assert.deepEqual(current.subarray(0, commentEnd + 1), wct.subarray(0, commentEnd + 1), 'Editor header/comment must be preserved');
        assert.deepEqual(current.subarray(start + length), tail, 'Following editor records must be preserved');
        assert.deepEqual(editorBundle(current, nextBundle), current, 'Editor synchronization must not accumulate newlines');
    }
    console.log('PASS editor profile synchronization preserves authored scripts, metadata and repeated-build bytes');
}

// Encode economic fields independently so the surgical transform cannot pass by
// merely agreeing with its own serializer; unrelated stats/models must survive.
{
    const integer = value => { const bytes = Buffer.alloc(4); bytes.writeInt32LE(value); return bytes; };
    const field = (id, type, value, endId = 'HsXX') => {
        let data;
        if (type === 3) data = Buffer.from(value + '\0');
        else if (type === 0) data = integer(value);
        else { data = Buffer.alloc(4); data.writeFloatLE(value); }
        return Buffer.concat([Buffer.from(id), integer(type), data, Buffer.from(endId)]);
    };
    const fixture = (kind, version, extraFields = []) => {
        const fields = [field(kind === 'item' ? 'iabi' : 'umdl', 3, 'unchanged-resource'),
            field(kind === 'item' ? 'ilev' : 'uhpm', 0, 150), field(kind === 'item' ? 'isca' : 'ucol', 2, 1.25),
            ...extraFields];
        return Buffer.concat([integer(version), integer(0), integer(1), Buffer.from(kind === 'item' ? 'ring' : 'hfoo'),
            Buffer.from('HsXX'), ...(version === 3 ? [integer(2), integer(0), integer(7)] : []),
            integer(fields.length), ...fields]);
    };
    for (const kind of ['item', 'unit']) {
        const owned = kind === 'item' ? ['igol', 'ipaw', 'isel'] : ['ugol', 'ugor', 'ubba', 'ubdi', 'ubsi'];
        for (const version of [1, 2, 3]) {
            const before = fixture(kind, version, [field(owned[0], 0, 120)]);
            const after = removeGoldObjectData(before, kind), previous = parseObjectData(before, kind), parsed = parseObjectData(after, kind);
            assert.equal(parsed.version, version);
            assert.equal(parsed.tables[1].length, 1);
            const row = parsed.tables[1][0], previousRow = previous.tables[1][0];
            assert.deepEqual([row.oldId, row.newId, row.extra], [previousRow.oldId, previousRow.newId, previousRow.extra]);
            for (const oldField of previousRow.fields.filter(value => !owned.includes(value.id)))
                assert.deepEqual(row.fields.find(value => value.id === oldField.id).raw, oldField.raw, 'A non-economic object field changed');
            for (const id of owned) {
                const values = row.fields.filter(value => value.id === id);
                assert.equal(values.length, 1, 'Explicitly override the inherited gold/sale field: ' + id);
                assert.equal(values[0].type, 0); assert.equal(values[0].value, 0);
                assert.equal(values[0].endId, 'HsXX');
            }
            assert.deepEqual(removeGoldObjectData(after, kind), after, 'Gold removal is idempotent');
            const skin = removeGoldObjectData(before, kind, {skin: true}), skinRow = parseObjectData(skin, kind).tables[1][0];
            assert.equal(skinRow.fields.length, previousRow.fields.length, 'Skin patch must not add unrelated inherited overrides');
            assert.equal(skinRow.fields.find(value => value.id === owned[0]).value, 0);
            assert.throws(() => removeGoldObjectData(fixture(kind, version, [field(owned[0], 0, 1), field(owned[0], 0, 2)]), kind),
                'Ambiguous duplicated economic fields must be rejected');
            assert.throws(() => removeGoldObjectData(fixture(kind, version, [field(owned[0], 3, '120')]), kind),
                'Economic fields with a wrong type must be rejected');
        }
    }
    console.log('PASS independent object versions, inherited cost/bounty/sale overrides, byte-preserved stats, skins and conflict refusal');
    const strings = Buffer.from('STRING 1\r\n{\r\n모든 무기 피해 +10%|n판매가 25 골드 · 일괄 정리는 판매 없이 삭제|n세트 2/3\r\n}\r\nSTRING 2\r\n{\r\n레벨 업 장신구 · 버리기/판매 불가 · 숫자는 강화 레벨\r\n}\r\nSTRING 3\r\n{\r\n수정 금지 문장\r\n}\r\n');
    const cleanedStrings = removeGoldStrings(strings), text = cleanedStrings.toString('utf8');
    assert(text.includes('모든 무기 피해 +10%|n가방 정리 시 장비가 삭제됩니다.|n세트 2/3'));
    assert(text.includes('버리기 불가 · 숫자는 강화 레벨') && !text.includes('판매'));
    assert(text.includes('수정 금지 문장'), 'Unrelated map strings remain unchanged');
    const unrelatedText = Buffer.from('STRING 1\n{\n무관한 골드 모델 이름\n}\n');
    assert.deepEqual(removeGoldStrings(unrelatedText), unrelatedText, 'Migration owns only the identified economic tooltip segments');
    assert.deepEqual(removeGoldStrings(cleanedStrings), cleanedStrings);
    const misc = Buffer.from('[Misc]\r\nPawnItemRate=0.5\r\nDropItemRange=10000.0\r\n');
    const cleanedMisc = removeGoldMisc(misc);
    assert.equal(cleanedMisc.toString('utf8'), '[Misc]\r\nPawnItemRate=0.0\r\nDropItemRange=10000.0\r\n');
    assert.deepEqual(removeGoldMisc(cleanedMisc), cleanedMisc);
    console.log('PASS gold tooltip cleanup preserves string IDs, game stats, unrelated text and game constants');
}
{
    const snapshots = new Map(), removal = prepareGoldRemoval(map, snapshots);
    const economicMap = openMap(map.replace(removal.entries));
    validateGoldRemoval(economicMap);
    for (const [name, bytes] of removal.entries)
        assert.deepEqual(economicMap.read(name), bytes, 'Economic map entries must survive MPQ readback');
    for (const [filename, bytes] of snapshots)
        assert.deepEqual(fs.readFileSync(filename), bytes, 'Preparation must not write source assets');
    assert(!economicMap.read('war3map.wts').toString('utf8').match(/판매|골드/));
    const data = parseObjectData(economicMap.read('war3map.w3t'), 'item');
    data.tables[1][0].fields.find(field => field.id === 'igol').value = 50;
    delete data.tables[1][0].raw;
    delete data.tables[1][0].fields.find(field => field.id === 'igol').raw;
    assert.throws(() => validateGoldRemoval(openMap(economicMap.replace(new Map([
        ['war3map.w3t', serializeObjectData(data)],
    ])))), /--remove-gold/, 'Ordinary publication must refuse a reintroduced item price');
    const pricedStrings = Buffer.concat([economicMap.read('war3map.wts'), Buffer.from('\nSTRING 9999\n{\n판매가 8 골드 · 일괄 정리는 판매 없이 삭제\n}\n')]);
    assert.throws(() => validateGoldRemoval(openMap(economicMap.replace(new Map([
        ['war3map.wts', pricedStrings],
    ])))), /--remove-gold/, 'Restored editor strings must not reintroduce sale text');
    console.log('PASS economic asset preparation is read-only and publication rejects returned prices or sale text');
}

{
    const asset = fs.readFileSync(path.join(root, 'assets/war3mapMisc.txt'));
    const values = asset.toString('utf8').match(/^NeedHeroXP=([^\r\n]+)/m)[1].split(',').map(Number);
    assert.equal(values.length, 69);
    assert.deepEqual(values.slice(0, 4), [120, 280, 480, 720], 'Opening levels retain their existing kill requirements');
    for (let i = 1; i < values.length; i++) {
        assert(values[i] > values[i - 1]);
        if (i > 1) assert(values[i] - values[i - 1] > values[i - 1] - values[i - 2], 'Each later level costs more XP');
    }
    assert.equal(values[18], 28320); assert.equal(values[38], 135120); assert.equal(values[68], 445320);
    assert.equal(1 + values.filter(xp => xp <= 7950).length, 11, 'Old level-20 XP must no longer permit early multi-weapon completion');
    assert.equal(1 + values.filter(xp => xp <= 12000).length, 14, 'A strong first-stage kill count still leaves room for later growth');
    const source = map.read('war3mapMisc.txt');
    assert.deepEqual(installExperienceCurve(source, asset), source, 'Saved map must use the authoritative XP table');
    const old = Buffer.from(source.toString('utf8').replace(/^NeedHeroXP=[^\r\n]+/m,
        'NeedHeroXP=' + Array.from({length: 69}, (_, i) => (i + 1) * 120).join(',')));
    const upgraded = installExperienceCurve(old, asset);
    const withoutCurve = bytes => bytes.toString('utf8').replace(/^NeedHeroXP=[^\r\n]+/m, 'NeedHeroXP=');
    assert.equal(withoutCurve(upgraded), withoutCurve(old), 'Only the XP table may change');
    assert.deepEqual(installExperienceCurve(upgraded, asset), upgraded);
    for (const invalid of [asset.toString('utf8').replace('120,280', '120,120'),
        asset.toString('utf8').replace('120,280', '120,1.5'),
        asset.toString('utf8').replace('MaxHeroLevel=70', 'MaxHeroLevel=69'),
        asset.toString('utf8') + '\nNeedHeroXP=120\n'])
        assert.throws(() => installExperienceCurve(source, Buffer.from(invalid)));
    console.log('PASS experience curve opening pace, all 69 thresholds, saved map, single-field migration and malformed-table guards');
}

// Prepare the exact resized archive in memory: these checks never publish a map.
const baseBytes = fs.readFileSync(baseMapPath);
const baseMap = openMap(baseBytes), baseTerrain = terrainInfo(baseMap.read('war3map.w3e'));
const baseMetadata = mapInfo(baseMap.read('war3map.w3i'));
// Build player records independently of mapInfo: v39 inserts RaceHud before Flags.
const baseInfoBytes = baseMap.read('war3map.w3i');
if (baseMetadata.version === 39) {
    const firstPlayer = baseMetadata.players[0].offset;
    const fixturePlayer = (id, controller, race, raceHud, flags, name, x, y) => {
        const record = Buffer.alloc(20);
        [id, controller, race, raceHud, flags].forEach((value, index) => record.writeInt32LE(value, index * 4));
        const positionAndMasks = Buffer.alloc(24);
        positionAndMasks.writeFloatLE(x, 0); positionAndMasks.writeFloatLE(y, 4);
        return Buffer.concat([record, Buffer.from(name + '\0'), positionAndMasks]);
    };
    const prefix = Buffer.from(baseInfoBytes.subarray(0, firstPlayer));
    prefix.writeInt32LE(2, prefix.length - 4);
    const firstRecord = fixturePlayer(0, 1, 3, 64, 3, 'Anya', -7616, 7040);
    const secondRecord = fixturePlayer(1, 2, 4, 65, 17, 'Second player', 12.5, -1401.25);
    const fixture = Buffer.concat([prefix, firstRecord, secondRecord]);
    const parsed = mapInfo(fixture);
    assert.deepEqual(parsed.players.map(({id, controller, race, raceHud, flags, name, x, y}) =>
        ({id, controller, race, raceHud, flags, name, x, y})), [
        {id: 0, controller: 1, race: 3, raceHud: 64, flags: 3, name: 'Anya', x: -7616, y: 7040},
        {id: 1, controller: 2, race: 4, raceHud: 65, flags: 17, name: 'Second player', x: 12.5, y: -1401.25},
    ]);
    assert.equal(parsed.players[0].flagsOffset, firstPlayer + 16);
    assert.equal(parsed.players[1].offset, firstPlayer + firstRecord.length);
    const playerNameEnd = baseInfoBytes.indexOf(0, firstPlayer + 20);
    assert.equal(baseMetadata.players[0].flags, baseInfoBytes.readInt32LE(firstPlayer + 16));
    assert.equal(baseMetadata.players[0].raceHud, baseInfoBytes.readInt32LE(firstPlayer + 12));
    assert.equal(baseMetadata.players[0].name, baseInfoBytes.toString('utf8', firstPlayer + 20, playerNameEnd));
    const nativeStart = baseMap.read('war3map.lua').toString('utf8')
        .match(/DefineStartLocation\(0,\s*([-\d.]+),\s*([-\d.]+)\)/);
    assert(nativeStart, 'Independent native script start location is required');
    assert.deepEqual([baseInfoBytes.readFloatLE(playerNameEnd + 1), baseInfoBytes.readFloatLE(playerNameEnd + 5)],
        nativeStart.slice(1).map(Number));
    assert.deepEqual([baseMetadata.players[0].x, baseMetadata.players[0].y], nativeStart.slice(1).map(Number));
    assert.throws(() => mapInfo(fixture.subarray(0, firstPlayer + firstRecord.length + 10)),
        'Truncated second-player records must not be accepted');
    console.log('PASS independent W3I v39 two-player records, RaceHud, flags, names, native coordinates and truncation');
}
const refreshed = refreshBase(original, baseBytes, bundle), refreshedMap = openMap(refreshed.patched);
assert.deepEqual(terrainInfo(refreshedMap.read('war3map.w3e')), baseTerrain);
assert.deepEqual(refreshed.playable, {width: baseMetadata.width, height: baseMetadata.height});
for (const name of ['war3map.w3e', 'war3map.wpm', 'war3map.shd', 'war3map.mmp', 'war3map.doo',
    'war3mapUnits.doo', 'war3mapMap.blp', 'war3map.w3c', 'war3map.w3r', 'war3map.wtg']) {
    assert.deepEqual(refreshedMap.read(name), baseMap.read(name), 'Base geography must match byte for byte: ' + name);
}
assert.deepEqual(refreshedMap.read('war3map.wts').subarray(0, baseMap.read('war3map.wts').length), baseMap.read('war3map.wts'),
    'Every authored base string byte must survive; only missing protected strings may be appended');
for (const name of ['war3map.w3a', 'war3map.w3t', 'war3map.w3u', 'war3mapMisc.txt',
    'war3mapSkin.w3a', 'war3mapSkin.w3t', 'war3mapSkin.w3u', 'CustomTooltip.fdf', 'CustomTooltip.toc']) {
    assert.deepEqual(refreshedMap.read(name), map.read(name), 'Test gameplay asset must survive: ' + name);
}
const mergedMetadata = mapInfo(refreshedMap.read('war3map.w3i'));
assert.equal(mergedMetadata.players[0].race, 3);
assert.equal(mergedMetadata.flags & 0x20, 0x20, 'Fixed player settings must survive');
assert.deepEqual([mergedMetadata.players[0].x, mergedMetadata.players[0].y],
    [baseMetadata.players[0].x, baseMetadata.players[0].y]);
const nativeMarker = '-- ===== END src/00_bootstrap/HeroSurvivor.lua =====';
const native = refreshed.script.slice(refreshed.script.indexOf(nativeMarker) + nativeMarker.length).trim();
const expectedNative = baseMap.read('war3map.lua').toString('utf8')
    .replace(/SetPlayerRacePreference\(Player\(0\), RACE_PREF_\w+\)/, 'SetPlayerRacePreference(Player(0), RACE_PREF_UNDEAD)')
    .replace(/SetPlayerRaceSkin\(Player\(0\), RACE_PREF_\w+\)/, 'SetPlayerRaceSkin(Player(0), RACE_PREF_UNDEAD)')
    .replace(/SetPlayerRaceSelectable\(Player\(0\), (?:true|false)\)/, 'SetPlayerRaceSelectable(Player(0), false)');
// A base with an older bundle is also accepted; compare its native body after the same marker.
assert.equal(native, (expectedNative.includes(nativeMarker)
    ? expectedNative.slice(expectedNative.indexOf(nativeMarker) + nativeMarker.length) : expectedNative).trim());
assert(refreshedMap.read('war3map.wct').includes(Buffer.from(bundle.trimEnd())), 'Editor globals must receive current source');
const repeatedRefresh = refreshBase(refreshed.patched, baseBytes, bundle);
for (const name of refreshed.entries) assert.deepEqual(openMap(repeatedRefresh.patched).read(name), refreshedMap.read(name),
    'Repeated base refresh must not change content: ' + name);
const terrainWithMissingSnow = Buffer.from(baseMap.read('war3map.w3e'));
const snowOffset = terrainWithMissingSnow.indexOf(Buffer.from('Nsnw')); assert(snowOffset >= 0);
terrainWithMissingSnow.write('Ldrt', snowOffset, 'ascii');
assert.throws(() => refreshBase(original, baseMap.replace(new Map([['war3map.w3e', terrainWithMissingSnow]])), bundle),
    /palette lost Nsnw/, 'A missing stage tile must block refresh instead of silently reverting snow to dirt');
const badPathing = Buffer.from(baseMap.read('war3map.wpm')); badPathing.writeInt32LE(1, 8);
assert.throws(() => refreshBase(original, baseMap.replace(new Map([['war3map.wpm', badPathing]])), bundle),
    /AssertionError/, 'Terrain/pathing mismatch must be refused');
const selectableBaseInfo = Buffer.from(baseMap.read('war3map.w3i'));
selectableBaseInfo.writeInt32LE(baseMetadata.players[0].flags | 3, baseMetadata.players[0].flagsOffset);
const selectableRefresh = refreshBase(original, baseMap.replace(new Map([['war3map.w3i', selectableBaseInfo]])), bundle);
const fixedFlags = mapInfo(openMap(selectableRefresh.patched).read('war3map.w3i')).players[0].flags;
assert.equal(fixedFlags & 1, 1, 'Fixed start-position geography follows the new base');
assert.equal(fixedFlags & 2, 0, 'Undead race stays non-selectable');
if (baseMetadata.version === 39) {
    const playerOffset = baseMetadata.players[0].offset;
    const refreshedBytes = openMap(selectableRefresh.patched).read('war3map.w3i');
    assert.equal(refreshedBytes.readInt32LE(playerOffset + 16) & 3, 1,
        'Independent v39 flags bytes preserve fixed start and remove selectable race');
    assert.deepEqual(refreshedBytes.subarray(playerOffset + 12, playerOffset + 16),
        baseInfoBytes.subarray(playerOffset + 12, playerOffset + 16), 'RaceHud must never be edited as flags');
}
const strings = baseMap.read('war3map.wts').toString('utf8');
const referencedIds = new Set(['war3map.w3a', 'war3map.w3t', 'war3map.w3u', 'war3mapSkin.w3a', 'war3mapSkin.w3t', 'war3mapSkin.w3u']
    .flatMap(name => [...(map.read(name)?.toString('utf8') ?? '').matchAll(/TRIGSTR_(\d+)/g)].map(match => Number(match[1]))));
const protectedEntry = [...strings.matchAll(/^(STRING (\d+)\r?\n(?:\/\/[^\r\n]*\r?\n)*\{\r?\n)([\s\S]*?)(\r?\n\})/gm)]
    .find(match => referencedIds.has(Number(match[2])));
assert(protectedEntry, 'Map has an ability/unit string for collision verification');
const conflictingStrings = Buffer.from(strings.replace(protectedEntry[0], protectedEntry[1] + 'Incorrect preserved unit name' + protectedEntry[4]));
assert.throws(() => refreshBase(original, baseMap.replace(new Map([['war3map.wts', conflictingStrings]])), bundle),
    new RegExp('string conflicts.*TRIGSTR_' + Number(protectedEntry[2]) + '(?!\\d)'),
    'New metadata strings must never silently corrupt preserved gameplay objects');
{
    const readStrings = bytes => new Map([...bytes.toString('utf8').replaceAll('\r\n', '\n')
        .matchAll(/^STRING (\d+)\n(?:\/\/[^\n]*\n|[ \t]*\n)*\{\n([\s\S]*?)\n\}/gm)]
        .map(match => [Number(match[1]), match[2]]));
    const protectedId = Number(protectedEntry[2]), oldStrings = readStrings(map.read('war3map.wts'));
    const withOrphan = map.replace(new Map([['war3map.wts', Buffer.concat([map.read('war3map.wts'),
        Buffer.from('\nSTRING 90000\n{\nunused test-only text\n}\n')])]]));
    for (const newline of ['\n', '\r\n']) {
        const missing = Buffer.from(strings.replace(protectedEntry[0], '').replaceAll('\r\n', '\n').replaceAll('\n', newline));
        const baseWithoutString = baseMap.replace(new Map([['war3map.wts', missing]]));
        const result = refreshBase(withOrphan, baseWithoutString, bundle);
        const output = openMap(result.patched).read('war3map.wts'), values = readStrings(removeGoldStrings(output));
        assert.deepEqual(output.subarray(0, missing.length), missing, 'All existing source bytes survive string retention');
        assert.equal(values.get(protectedId), oldStrings.get(protectedId), 'A deleted protected value comes from its preserved object data');
        assert(!values.has(90000), 'Unused test strings must not be imported into the base refresh');
        for (const id of referencedIds) assert.equal(values.get(id), oldStrings.get(id));
        const repeat = refreshBase(result.patched, baseWithoutString, bundle);
        assert.deepEqual(openMap(repeat.patched).read('war3map.wts'), output, 'Retained strings are deterministic and never duplicate');
    }
    const missingFromTest = map.read('war3map.wts').toString('utf8').replace(
        new RegExp('^STRING ' + protectedId + '\\r?\\n(?:\\/\\/[^\\r\\n]*\\r?\\n)*\\{\\r?\\n[\\s\\S]*?\\r?\\n\\}\\r?\\n?', 'm'), '');
    assert.throws(() => refreshBase(map.replace(new Map([['war3map.wts', Buffer.from(missingFromTest)]])), baseBytes, bundle),
        /Preserved gameplay object references a missing string/, 'Invalid existing test references cannot be silently repaired');
    console.log('PASS base string deletion retains only referenced gameplay text, source bytes, LF/CRLF, idempotence and collision guards');
}
assert.deepEqual(fs.readFileSync(baseMapPath), baseBytes, 'Dry verification changed original');
assert.deepEqual(fs.readFileSync(path.join(root, 'dist/AnyasLongNight-playtest.w3x')), original, 'Dry verification published output');
console.log(`PASS resized-base refresh (${baseTerrain.width - 1}x${baseTerrain.height - 1} cells), native geography, undead rules, editor source, ${refreshed.preserved} gameplay entries and palette/pathing guards`);

const unitEntries = new Map();
const unitAssetSnapshots = new Map();
for (const [name, skin] of [['war3map.w3u', false], ['war3mapSkin.w3u', true]]) {
    const before = map.read(name), assetBefore = fs.readFileSync(path.join(root, 'assets', name));
    unitAssetSnapshots.set(name, assetBefore);
    const output = installPortraitUnits(before, skin, {migrateLegacyAnya: true, migrateLegacyArmor: true, migrateLegacyUpgrades: true}), data = parseUnits(output);
    assert.deepEqual(serializeUnits(parseUnits(before)), before, 'Existing unit fields must round-trip byte for byte');
    assert.deepEqual(installPortraitUnits(output, skin), output, 'Portrait installation must be idempotent');
    assert.deepEqual(installPortraitUnits(assetBefore, skin, {migrateLegacyAnya: true, migrateLegacyArmor: true, migrateLegacyUpgrades: true}), output,
        'Asset source and archive receive identical portrait definitions and migrations');
    for (const unit of portraitUnits) {
        const row = data.tables[1].find(row => row.newId === unit.id);
        assert(row && row.oldId === 'hfoo' && /^[a-z]/.test(unit.id), 'Portrait proxy must be a lowercase non-hero custom unit');
        if (skin) assert.equal(row.fields.find(field => field.id === 'umdl').value, unit.model,
            'The native unit model must be the actual speaker, including Putress');
        else {
            assert.equal(row.fields.find(field => field.id === 'ucol').value, 0, 'Portrait units must not block gameplay movement');
            const armor = row.fields.find(field => field.id === 'udty');
            assert(armor && armor.type === 3 && armor.value === 'hero', 'Both speakers must display Hero armor without becoming actual heroes');
        }
        assert(!row.fields.some(field => field.id === 'upat'), 'Do not mistake a pathing texture field for a portrait override');
    }
    const conflicting = parseUnits(output), row = conflicting.tables[1].find(row => row.newId === 'hsPP');
    const field = row.fields.find(field => field.id === (skin ? 'umdl' : 'ucol'));
    delete row.raw; delete field.raw; field.value = skin ? 'FallbackWrongSpeaker.mdl' : 100;
    assert.throws(() => installPortraitUnits(serializeUnits(conflicting), skin, {migrateLegacyAnya: true, migrateLegacyArmor: true, migrateLegacyUpgrades: true}), /conflicting fields/,
        'Existing conflicting proxy data must not be silently overwritten');
    unitEntries.set(name, output);
}
const portraitMapBytes = map.replace(unitEntries), portraitMap = openMap(portraitMapBytes);
validatePortraitObjects(portraitMap, bundle);
verifyPreserved(original, portraitMapBytes, [...unitEntries.keys()]);
const missingUnits = new Map([...unitEntries].map(([name, bytes]) => {
    const data = parseUnits(bytes);
    data.tables[1] = data.tables[1].filter(row => !portraitUnits.some(unit => unit.id === row.newId));
    return [name, serializeUnits(data)];
}));
assert.throws(() => validatePortraitObjects(openMap(map.replace(missingUnits)), bundle), /--portrait-objects/,
    'Ordinary builds must reject a story bundle whose native portrait objects are not installed');
const oldAnyaModel = 'Units\\Creeps\\BansheeRanger\\BansheeRanger.mdl';
const newAnyaModel = 'Units\\Forsaken\\HeroAnya\\HeroAnya.mdl';
assert.equal(portraitUnits.find(unit => unit.id === 'hsPA').model, newAnyaModel);
const oldSkin = parseUnits(unitEntries.get('war3mapSkin.w3u'));
const oldAnya = oldSkin.tables[1].find(row => row.newId === 'hsPA');
const oldModelField = oldAnya.fields.find(field => field.id === 'umdl');
delete oldAnya.raw; delete oldModelField.raw; oldModelField.value = oldAnyaModel;
oldAnya.fields.push({id: 'usca', type: 2, value: 1.125, endId: 'hsPA'});
const legacySkin = serializeUnits(oldSkin), legacyObjects = new Map(unitEntries);
legacyObjects.set('war3mapSkin.w3u', legacySkin);
assert.throws(() => installPortraitUnits(legacySkin, true), /--portrait-objects/,
    'An installed old model requires an explicit migration option');
assert.throws(() => validatePortraitObjects(openMap(map.replace(legacyObjects)), bundle), /--portrait-objects/,
    'Ordinary Lua-only builds must not accept the old portrait as current');
const migratedSkin = installPortraitUnits(legacySkin, true, {migrateLegacyAnya: true});
assert.deepEqual(installPortraitUnits(migratedSkin, true), migratedSkin, 'Migration is idempotent without the legacy option');
const legacyData = parseUnits(legacySkin), migratedData = parseUnits(migratedSkin);
let changedFields = 0;
for (const [table, rows] of legacyData.tables.entries()) {
    assert.equal(migratedData.tables[table].length, rows.length, 'Migration never adds or removes existing records');
    for (const [index, row] of rows.entries()) {
        const after = migratedData.tables[table][index];
        if (row.newId !== 'hsPA') assert.deepEqual(after.raw, row.raw, 'Migration rewrote another record, including Uany or hsPP');
        else {
            const header = value => value.raw.subarray(0, value.raw.length - value.fields.reduce((sum, field) => sum + field.raw.length, 0));
            assert.deepEqual(header(after), header(row), 'Migration preserves the portrait record header');
            assert.equal(after.fields.length, row.fields.length);
            for (const [i, field] of row.fields.entries()) {
                if (field.id !== 'umdl') assert.deepEqual(after.fields[i].raw, field.raw, 'Migration rewrote an unrelated hsPA field');
                else { assert.equal(after.fields[i].value, newAnyaModel); changedFields++; }
            }
        }
    }
}
assert.equal(changedFields, 1, 'Change only the single hsPA model field');
const migratedObjects = new Map(legacyObjects); migratedObjects.set('war3mapSkin.w3u', migratedSkin);
const migratedMapBytes = map.replace(migratedObjects), migratedMap = openMap(migratedMapBytes);
assert.deepEqual(migratedMap.read('war3mapSkin.w3u'), migratedSkin, 'MPQ readback retains the exact surgical model migration');
validatePortraitObjects(migratedMap, bundle);
verifyPreserved(original, migratedMapBytes, [...migratedObjects.keys()]);
const wrongAnya = parseUnits(legacySkin), wrongRow = wrongAnya.tables[1].find(row => row.newId === 'hsPA');
const wrongField = wrongRow.fields.find(field => field.id === 'umdl');
delete wrongRow.raw; delete wrongField.raw; wrongField.value = 'UnexpectedReplacement.mdl';
assert.throws(() => installPortraitUnits(serializeUnits(wrongAnya), true, {migrateLegacyAnya: true}), /conflicting fields/,
    'Explicit installation only permits the known BansheeRanger-to-HeroAnya migration');
assert.deepEqual(fs.readFileSync(baseMapPath), baseBytes, 'Portrait preparation changed original');
assert.deepEqual(fs.readFileSync(path.join(root, 'dist/AnyasLongNight-playtest.w3x')), original, 'Portrait preparation published a map');
for (const [name, bytes] of unitAssetSnapshots) assert.deepEqual(fs.readFileSync(path.join(root, 'assets', name)), bytes,
    'Portrait dry preparation must not write its asset source');
console.log('PASS native portrait unit definitions, real speaker models, byte-preserved rows, assets, idempotence and missing-object guard');
console.log('PASS explicit Anya model migration, single-field changes, unrelated records, legacy guard, MPQ readback and conflict refusal');

{
    for (const skin of [false, true]) {
        const beforeData = parseUnits(unitEntries.get(skin ? 'war3mapSkin.w3u' : 'war3map.w3u'));
        for (const id of ['hsPA', 'hsPP']) {
            const row = beforeData.tables[1].find(row => row.newId === id);
            delete row.raw;
            row.fields = row.fields.filter(field => field.id !== 'upgr');
            if (id === 'hsPP' || skin) row.fields.push({id: 'upgr', type: 3, value: 'Rguv', endId: id});
        }
        const before = serializeUnits(beforeData);
        assert.throws(() => installPortraitUnits(before, skin), /--portrait-objects/);
        const after = installPortraitUnits(before, skin, {migrateLegacyUpgrades: true});
        const result = parseUnits(after);
        for (const [table, rows] of parseUnits(before).tables.entries()) for (const row of rows) {
            const next = result.tables[table].find(value => value.oldId === row.oldId && value.newId === row.newId);
            if (!['hsPA', 'hsPP'].includes(row.newId)) assert.deepEqual(next.raw, row.raw);
            else {
                const upgrades = next.fields.filter(field => field.id === 'upgr');
                assert.equal(upgrades.length, 1); assert.equal(upgrades[0].type, 3); assert.equal(upgrades[0].value, '');
                assert.equal(next.fields.length, row.fields.length + (row.fields.some(field => field.id === 'upgr') ? 0 : 1));
                for (const field of row.fields.filter(field => field.id !== 'upgr'))
                    assert.deepEqual(next.fields.find(value => value.id === field.id).raw, field.raw);
            }
        }
        assert.deepEqual(installPortraitUnits(after, skin), after);
    }
    console.log('PASS portrait inherited/explicit Rguv removal, skin overrides, unrelated fields, gameplay units and idempotence');
}

{
    const legacy = parseUnits(unitEntries.get('war3map.w3u'));
    const anya = legacy.tables[1].find(row => row.newId === 'hsPA'), putress = legacy.tables[1].find(row => row.newId === 'hsPP');
    delete anya.raw; anya.fields = anya.fields.filter(field => field.id !== 'udty');
    const armor = putress.fields.find(field => field.id === 'udty');
    delete putress.raw; delete armor.raw; armor.value = 'normal';
    const before = serializeUnits(legacy);
    assert.throws(() => installPortraitUnits(before), /--portrait-objects/, 'Old speaker armor requires explicit migration');
    const output = installPortraitUnits(before, false, {migrateLegacyArmor: true}), data = parseUnits(output);
    for (const [table, rows] of parseUnits(before).tables.entries()) for (const row of rows) {
        const after = data.tables[table].find(value => value.oldId === row.oldId && value.newId === row.newId);
        if (!['hsPA','hsPP'].includes(row.newId)) assert.deepEqual(after.raw, row.raw, 'Speaker armor migration changed Uany or another unit');
        else {
            const owned = after.fields.filter(field => field.id === 'udty');
            assert.equal(owned.length, 1); assert.equal(owned[0].type, 3); assert.equal(owned[0].value, 'hero');
            assert.equal(after.fields.length, row.fields.length + (row.newId === 'hsPA' ? 1 : 0));
            for (const field of row.fields.filter(value => value.id !== 'udty'))
                assert.deepEqual(after.fields.find(value => value.id === field.id).raw, field.raw, 'Speaker armor migration changed another field');
        }
    }
    assert.deepEqual(installPortraitUnits(output), output, 'Speaker Hero armor migration is idempotent');
    for (const [type, value] of [[3,'large'],[0,5]]) {
        const conflicting = parseUnits(output), row = conflicting.tables[1].find(row => row.newId === 'hsPA');
        const field = row.fields.find(field => field.id === 'udty');
        delete row.raw; delete field.raw; field.type = type; field.value = value;
        assert.throws(() => installPortraitUnits(serializeUnits(conflicting), false, {migrateLegacyArmor: true}), /conflicting fields/);
    }
    const skin = parseUnits(unitEntries.get('war3mapSkin.w3u')), row = skin.tables[1].find(value => value.newId === 'hsPP');
    delete row.raw; row.fields.push({id:'udty',type:3,value:'normal',endId:'hsPP'});
    const skinBefore = serializeUnits(skin);
    assert.throws(() => installPortraitUnits(skinBefore, true), /--portrait-objects/, 'A skin override must not mask Hero armor');
    const skinAfter = installPortraitUnits(skinBefore, true, {migrateLegacyArmor:true});
    assert.equal(parseUnits(skinAfter).tables[1].find(value => value.newId === 'hsPP').fields.find(value => value.id === 'udty').value, 'hero');
    console.log('PASS speaker Hero armor migration, inherited and skin overrides, explicit guard and gameplay unit preservation');
}

// Fixture codec only: inspect encrypted MPQ tables without relying on compact's
// readback verification. Fixtures remain in memory and never publish map files.
const fixtureCrypt = new Uint32Array(1280);
let fixtureSeed = 0x100001;
for (let low = 0; low < 256; low++) for (let high = 0; high < 5; high++) {
    fixtureSeed = (fixtureSeed * 125 + 3) % 0x2aaaab;
    const first = (fixtureSeed & 0xffff) << 16;
    fixtureSeed = (fixtureSeed * 125 + 3) % 0x2aaaab;
    fixtureCrypt[high * 256 + low] = (first | (fixtureSeed & 0xffff)) >>> 0;
}
function fixtureHash(name, type = 3) {
    let a = 0x7fed7fed, b = 0xeeeeeeee;
    for (const c of Buffer.from(name.replaceAll('/', '\\').toUpperCase(), 'ascii')) {
        a = (fixtureCrypt[type * 256 + c] ^ (a + b)) >>> 0;
        b = (c + a + b + (b << 5) + 3) >>> 0;
    }
    return a;
}
function fixtureTransform(input, key, encrypt = false) {
    const output = Buffer.from(input);
    let state = 0xeeeeeeee;
    for (let p = 0; p + 4 <= output.length; p += 4) {
        state = (state + fixtureCrypt[1024 + (key & 255)]) >>> 0;
        const word = output.readUInt32LE(p), transformed = (word ^ (key + state)) >>> 0;
        output.writeUInt32LE(transformed, p);
        key = (((~key << 21) + 0x11111111) | (key >>> 11)) >>> 0;
        state = ((encrypt ? word : transformed) + state + (state << 5) + 3) >>> 0;
    }
    return output;
}
function fixtureTables(bytes) {
    const offset = bytes.indexOf(Buffer.from([77, 80, 81, 26]));
    const hashStart = offset + bytes.readUInt32LE(offset + 16), blockStart = offset + bytes.readUInt32LE(offset + 20);
    const hashes = fixtureTransform(bytes.subarray(hashStart, hashStart + bytes.readUInt32LE(offset + 24) * 16), fixtureHash('(hash table)'));
    const blocks = fixtureTransform(bytes.subarray(blockStart, blockStart + bytes.readUInt32LE(offset + 28) * 16), fixtureHash('(block table)'));
    return {offset, hashStart, blockStart, hashes, blocks};
}
function fixtureBlockIndex(tables, name) {
    for (let p = 0; p < tables.hashes.length; p += 16) {
        if (tables.hashes.readUInt32LE(p) === fixtureHash(name, 1) &&
            tables.hashes.readUInt32LE(p + 4) === fixtureHash(name, 2)) return tables.hashes.readUInt32LE(p + 12);
    }
    throw new Error('Missing fixture block: ' + name);
}
const compactBytes = map.compact(), compactMap = openMap(compactBytes);
const beforeTables = fixtureTables(original), afterTables = fixtureTables(compactBytes);
assert(compactBytes.length <= original.length, 'Compaction cannot enlarge an already packed archive');
assert.strictEqual(compactMap.compact(), compactBytes, 'Repeated compaction is an exact no-op');
assert.strictEqual(map.replace(new Map()), original, 'No changes leave the archive buffer untouched');
assert.strictEqual(map.replace(new Map([['WAR3MAP.LUA', map.read('war3map.lua')]])), original,
    'Case-insensitive equal entries leave the archive untouched');
assert.deepEqual(compactBytes.subarray(0, beforeTables.offset), original.subarray(0, beforeTables.offset));
assert.deepEqual(afterTables.hashes, beforeTables.hashes, 'Hashes, locale/platform and block indices must survive compaction');
for (const name of new Set(['(listfile)', '(attributes)', ...map.read('(listfile)').toString('utf8').split(/\r?\n/).filter(Boolean)])) {
    assert.deepEqual(compactMap.read(name), map.read(name), 'Compaction changed decoded content: ' + name);
}
for (let p = 0; p < beforeTables.blocks.length; p += 16) {
    const flags = beforeTables.blocks.readUInt32LE(p + 12);
    if (!(flags & 0x80000000)) continue;
    assert.deepEqual(afterTables.blocks.subarray(p + 4, p + 16), beforeTables.blocks.subarray(p + 4, p + 16),
        'Packed length, decoded length and flags must stay unchanged');
}
const fixtureName = 'fixture/unnamed-compaction.dat', fixturePayload = Buffer.from('live content omitted from the listfile');
let anonymousBytes = map.replace(new Map([[fixtureName, fixturePayload]]));
anonymousBytes = openMap(anonymousBytes).replace(new Map([['(listfile)', map.read('(listfile)')]]));
assert(!openMap(anonymousBytes).read('(listfile)').includes(Buffer.from(fixtureName)));
assert.deepEqual(openMap(openMap(anonymousBytes).compact()).read(fixtureName), fixturePayload,
    'Compaction must preserve live blocks absent from the listfile');
const unreferencedBytes = Buffer.from(anonymousBytes), unreferencedTables = fixtureTables(anonymousBytes);
const fixtureIndex = fixtureBlockIndex(unreferencedTables, fixtureName);
for (let p = 0; p < unreferencedTables.hashes.length; p += 16) {
    if (unreferencedTables.hashes.readUInt32LE(p + 12) === fixtureIndex) unreferencedTables.hashes.writeUInt32LE(0xfffffffe, p + 12);
}
fixtureTransform(unreferencedTables.hashes, fixtureHash('(hash table)'), true).copy(unreferencedBytes, unreferencedTables.hashStart);
const unreferencedCompact = openMap(unreferencedBytes).compact(), unreferencedAfter = fixtureTables(unreferencedCompact);
const fixtureRow = fixtureIndex * 16, fixtureLength = unreferencedTables.blocks.readUInt32LE(fixtureRow + 4);
const fixtureFrom = unreferencedTables.offset + unreferencedTables.blocks.readUInt32LE(fixtureRow);
const fixtureTo = unreferencedAfter.offset + unreferencedAfter.blocks.readUInt32LE(fixtureRow);
assert.deepEqual(unreferencedCompact.subarray(fixtureTo, fixtureTo + fixtureLength),
    unreferencedBytes.subarray(fixtureFrom, fixtureFrom + fixtureLength), 'Even live blocks with no hash entry must survive');
const mixedBytes = map.replace(new Map([['war3map.lua', Buffer.from(old + '\n-- fixture change\n')],
    ['war3map.w3e', map.read('war3map.w3e')]]));
const mixedTables = fixtureTables(mixedBytes);
const terrainRow = fixtureBlockIndex(beforeTables, 'war3map.w3e') * 16;
assert.deepEqual(mixedTables.blocks.subarray(terrainRow, terrainRow + 16), beforeTables.blocks.subarray(terrainRow, terrainRow + 16),
    'An unchanged entry mixed with actual replacements must retain its complete block record');
const mixedCompactTables = fixtureTables(openMap(mixedBytes).compact());
let encryptedFixtureIndex = -1;
for (let p = 0; p < mixedTables.blocks.length; p += 16) {
    if ((mixedTables.blocks.readUInt32LE(p + 12) & 0x30000) === 0x30000 &&
        mixedTables.blocks.readUInt32LE(p) !== mixedCompactTables.blocks.readUInt32LE(p)) encryptedFixtureIndex = p / 16;
}
if (encryptedFixtureIndex >= 0) {
    const unknownKeyBytes = Buffer.from(mixedBytes), unknownHashes = Buffer.from(mixedTables.hashes);
    for (let p = 0; p < unknownHashes.length; p += 16) {
        if (unknownHashes.readUInt32LE(p + 12) === encryptedFixtureIndex) {
            unknownHashes.writeUInt32LE(0x12345678, p); unknownHashes.writeUInt32LE(0x87654321, p + 4);
        }
    }
    fixtureTransform(unknownHashes, fixtureHash('(hash table)'), true).copy(unknownKeyBytes, mixedTables.hashStart);
    assert.throws(() => openMap(unknownKeyBytes).compact(), /unknown or ambiguous key/,
        'Unknown FIX_KEY files must fail safely instead of relocating encrypted bytes');
    const crcBytes = Buffer.from(mixedBytes), crcBlocks = Buffer.from(mixedTables.blocks);
    const flagOffset = encryptedFixtureIndex * 16 + 12;
    crcBlocks.writeUInt32LE((crcBlocks.readUInt32LE(flagOffset) | 0x4000000) >>> 0, flagOffset);
    fixtureTransform(crcBlocks, fixtureHash('(block table)'), true).copy(crcBytes, mixedTables.blockStart);
    assert.throws(() => openMap(crcBytes).compact(), /CRC/,
        'Unsupported encrypted CRC layouts must not be published');
}
assert.deepEqual(fs.readFileSync(path.join(root, 'dist/AnyasLongNight-playtest.w3x')), original);
assert.deepEqual(fs.readFileSync(baseMapPath), baseBytes);
console.log('PASS MPQ no-op patching, compaction, prefix/locale/attributes, unnamed live blocks and encrypted FIX_KEY safety');
{
    let inflates = 0;
    const inflate = zlib.inflateSync;
    zlib.inflateSync = function(...args) { inflates++; return inflate.apply(this, args); };
    try {
        const cached = openMap(original), first = cached.read('war3map.lua'), expected = Buffer.from(first);
        const initialInflates = inflates;
        assert(initialInflates > 0, 'Use an actually compressed fixture');
        first.fill(0);
        for (let i = 0; i < 40; i++) assert.deepEqual(cached.read(i % 2 ? 'WAR3MAP.LUA' : 'war3map.lua'), expected);
        assert.equal(inflates, initialInflates, 'Repeat reads reuse decoded content instead of decompressing sectors again');
        assert.equal(cached.read('missing-cache-fixture'), null); assert.equal(cached.read('MISSING-CACHE-FIXTURE'), null);
        const toc = cached.read('war3mapImported/CustomTooltip.toc');
        assert.deepEqual(cached.read('WAR3MAPIMPORTED\\CUSTOMTOOLTIP.TOC'), toc, 'Slash and case variants share one entry');
        assert.deepEqual(fs.readFileSync(path.join(root, 'dist/AnyasLongNight-playtest.w3x')), original,
            'Mutating a read result must not modify the archive');
        console.log('PASS MPQ decoded cache avoids repeated inflate and isolates mutable read buffers');
    } finally { zlib.inflateSync = inflate; }
    const duplicate = Buffer.from(original), hashes = Buffer.from(beforeTables.hashes);
    const existingIndex = fixtureBlockIndex(beforeTables, 'war3map.lua');
    let sourceSlot = -1, freeSlot = -1;
    for (let p = 0; p < hashes.length; p += 16) {
        if (hashes.readUInt32LE(p + 12) === existingIndex) sourceSlot = p;
        if (hashes.readUInt32LE(p + 12) >= 0xfffffffe) freeSlot = p;
    }
    assert(sourceSlot >= 0 && freeSlot >= 0);
    hashes.copy(hashes, freeSlot, sourceSlot, sourceSlot + 16);
    hashes.writeUInt16LE(1033, freeSlot + 8);
    fixtureTransform(hashes, fixtureHash('(hash table)'), true).copy(duplicate, beforeTables.hashStart);
    assert.throws(() => openMap(duplicate).read('war3map.lua'), /Multiple locale/,
        'The lookup cache must retain duplicate-locale refusal');
    console.log('PASS MPQ indexed lookup preserves duplicate-locale rejection');
}
