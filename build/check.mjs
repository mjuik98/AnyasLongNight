// Behavioral regression checks with Lua 5.3 and explicit Warcraft native mocks.
// This does not emulate Warcraft rendering, its spatial-index cost, or ALICE timing.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fengari from 'fengari';
import {collectSources, replaceBundle, verifyPreserved, refreshBase, terrainInfo, mapInfo,
    parseUnits, serializeUnits, installPortraitUnits, portraitUnits, validatePortraitObjects, publishTransaction, editorBundle,
    parseObjectData, serializeObjectData, removeGoldObjectData, removeGoldStrings, removeGoldMisc,
    prepareGoldRemoval, validateGoldRemoval, root} from './build.mjs';
import {openMap} from './mpq.mjs';
const {lua, lauxlib, lualib, to_luastring, to_jsstring} = fengari;
function suite(name, before, files, after) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    try {
        for (const [label, source] of [['mocks', before], ...files.map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]), ['assertions', after]]) {
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
function BlzSetAbilityTooltip(id,text) end
abilityWrites=0
function BlzSetAbilityExtendedTooltip(id,text) abilityWrites=abilityWrites+1 end
function UnitInventorySize() return 6 end
function UnitItemInSlot(u,i) return u.inventory[i+1] end
function GetItemTypeId(i) return i and not i.removed and i.id or 0 end
function CreateItem(id,x,y) return {id=id,x=x,y=y} end
function RemoveItem(i) i.removed=true end
function SetItemCharges(i,v) i.charges=v end
function UnitAddItem(u,item)
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
SurvivorCombat.CastBlades();blade=actors[1];assert(blade.visual.alpha==140)
SetLocal(SurvivorCombat.UpdateWeapons,"warningUntil",10)
SurvivorCombat.UpdateWeapons(0.02);assert(blade.visual.alpha==70)
local writes=alphaWrites
for i=1,100 do SurvivorCombat.UpdateWeapons(0.02) end
assert(alphaWrites==writes)
SurvivorCombat.CastBlades();assert(actors[#actors].visual.alpha==70)
now=11;SurvivorCombat.UpdateWeapons(0.02)
for _,a in ipairs(actors) do assert(a.visual.alpha==140) end
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
`);

suite('risk investigations require explicit live acceptance and search deadlines use paused run time', mocks + String.raw`
function CreateTextTag()return {}end
function DestroyTextTag(tag)assert(not tag.destroyed);tag.destroyed=true end
function SetTextTagText(tag,text)tag.text=text end
for _,name in ipairs({'SetTextTagPos','SetTextTagColor','SetTextTagPermanent','PingMinimapEx'})do _G[name]=function()end end
SurvivorStage.FindPoint=function(angle,radius)return {x=math.cos(angle)*radius,y=math.sin(angle)*radius}end
SurvivorStage.LandmarkApproach=function()return {x=1000,y=0}end
SurvivorCombat={ReleaseCourier=function()end,GrantSearchRecovery=function()return '회복'end}
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
now=1095;SurvivorExpedition.Step(0.02,now)
local risk=Local(SurvivorExpedition.Step,'risk')
assert(risk.state=='offered' and SurvivorExpedition.RiskOffer()==nil)
assert(not SurvivorExpedition.AcceptRisk(),'A distant stale click cannot begin a challenge')
hero.x,hero.y=risk.x,risk.y
for i=1,100 do SurvivorExpedition.Step(.02,now)end
assert(risk.state=='offered' and not SurvivorExpedition.RiskActive(),'Standing near a marker never automatically accepts risk')
local offer=SurvivorExpedition.RiskOffer()
assert(offer and offer.seconds==30 and offer.remaining==85 and offer.text:find('25%%') and offer.text:find('35%%'))
local terms=SurvivorExpedition.Status();local lineCount=1
for _ in terms:gmatch('\n')do lineCount=lineCount+1 end
assert(terms:find('조사 수락') and terms:find('장소를 벗어나도') and lineCount==7,'Display every term before acceptance alongside the active search')
state='INVENTORY';assert(not SurvivorExpedition.RiskOffer() and not SurvivorExpedition.AcceptRisk(),'Acceptance is blocked while paused')
state='RUNNING';hero.life=0;assert(not SurvivorExpedition.AcceptRisk(),'A dead hero cannot accept risk');hero.life=100000
local marker,tag=risk.effect,risk.tag
assert(SurvivorExpedition.AcceptRisk() and marker.destroyed and tag.destroyed)
assert(SurvivorExpedition.RiskActive() and not SurvivorExpedition.RiskOffer() and not SurvivorExpedition.AcceptRisk())
hero.x,hero.y=0,0;now=1124.9;SurvivorExpedition.Step(.02,now);assert(#rewards==0)
state='INVENTORY';for i=1,100 do SurvivorExpedition.Step(.02,now)end;assert(#rewards==0)
state='RUNNING';now=1125;SurvivorExpedition.Step(.1,now);SurvivorExpedition.Step(.1,now)
assert(#rewards==1 and rewards[1]=='risk' and not SurvivorExpedition.RiskActive(),'Survival reward is granted once')

Begin(2,2000);hero.x,hero.y=0,0;now=2095;SurvivorExpedition.Step(.02,now)
risk=Local(SurvivorExpedition.Step,'risk');hero.x,hero.y=risk.x,risk.y
assert(SurvivorExpedition.RiskOffer());now=2180
assert(not SurvivorExpedition.AcceptRisk() and not SurvivorExpedition.RiskOffer(),'Expiry is rechecked even before the next Step')
SurvivorExpedition.Step(.02,now);assert(risk.state=='closed')
hero.x,hero.y=0,0;now=2210
local count=#notifications;SurvivorExpedition.Step(.02,now)
assert(SurvivorExpedition.SearchRemaining()==30 and #notifications==count+1)
SurvivorExpedition.Step(.02,now);assert(#notifications==count+1,'Search deadline warning is announced once')
now=2240;SurvivorExpedition.Step(.02,now)
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
now=5095;SurvivorExpedition.Step(.02,now)
assert(#notifications==count and not SurvivorExpedition.Status(true):find('선택 수색'),
    'Risk offer terms can be shown alone during dialogue without a duplicate start popup')
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
function BlzGetFrameByName(name)
    queries=queries+1
    if available then panel.visible=openPanel;return panel end
    return MISSING_FRAME
end
function BlzFrameIsVisible(frame)
    assert(type(frame)=='table' and frame.handle~=0,'Never pass a missing native frame to visibility queries')
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
TickTimers();assert(queries==3 and #sent==0 and not lootVisible)
available,openPanel,acceptSync=true,true,false
TickTimers();assert(queries==6 and #sent==1 and not sent[1].accepted and RunSession.IsRunning())
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
suite('equipment and native trinkets omit all prices and cleanup retains deletion without currency', gearMocks + String.raw`
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
    assert(description:find('가방 정리 시 장비가 삭제됩니다.'),'Retain the deletion warning')
end
SurvivorCombat={EscapeStatus=function()return true,0 end,WardStatus=function()return 0,0 end}
SurvivorAugments.Apply('power',build,hero);SurvivorNativeLoadout.Init(hero,build)
local indicator=hero.inventory[1]
assert(indicator and indicator.pawnable==false and indicator.description:find('버리기 불가'))
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
assert(SurvivorEquipment.PickupMode()=="OFF")
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
local hero,build=NewGear("firebolt",6)
local revision=build.revision
local item=CreateItem("Hs01",0,0);hero.bag[1]=item
SurvivorEquipment.Reconcile()
assert(build.revision==revision,'External bag acquisition must not recalculate weapons')
local ui=SurvivorEquipment.UIRevision();local writes=gearTooltipWrites
assert(SurvivorEquipment.ToggleLock(item))
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
assert(text:find("기본 능력치는 각각 적용") and text:find("동일 장비의 세트 개수는 1개"))
hero.equipped[3]=CreateItem("Hs04",0,0);SurvivorEquipment.Reconcile()
assert(math.abs(build.stats.missileDamage-SurvivorConfig.missileDamage*1.35)<0.0001)
SurvivorEquipment.Cleanup()
`);


const presentationMocks = mocks + String.raw`
frames,selectedUnit,selectionClears = {},nil,0
PLAYER_NEUTRAL_PASSIVE=15
PLAYER_COLOR_RED='red'
excludedPortraitTypes={}
function ALICE_ExcludeTypes(...)for _,id in ipairs({...})do excludedPortraitTypes[id]=true end end
for _,name in ipairs({"FRAMEPOINT_CENTER","FRAMEPOINT_TOP","FRAMEPOINT_BOTTOM","FRAMEPOINT_TOPLEFT","FRAMEPOINT_BOTTOMLEFT",
    "TEXT_JUSTIFY_TOP","TEXT_JUSTIFY_LEFT","TEXT_JUSTIFY_MIDDLE","TEXT_JUSTIFY_CENTER","FRAMEEVENT_CONTROL_CLICK",
    "ORIGIN_FRAME_GAME_UI","ORIGIN_FRAME_MINIMAP","ORIGIN_FRAME_MINIMAP_BUTTON",
    "CAMERA_FIELD_TARGET_DISTANCE","CAMERA_FIELD_ANGLE_OF_ATTACK","CAMERA_FIELD_ROTATION",
    "CAMERA_FIELD_ZOFFSET","CAMERA_FIELD_ROLL","ANIM_TYPE_STAND","ANIM_TYPE_WALK","ANIM_TYPE_DEATH"})do _G[name]=name end
function BlzCreateFrameByType(kind,name,parent)
    serial=serial+1;local f={name=name,parent=parent,kind=kind,handle=serial,visible=true,enabled=true};frames[name]=f;return f
end
function BlzCreateFrame(name,parent,priority,context) return BlzCreateFrameByType("FRAME",name..context,parent) end
function BlzGetFrameByName(name) return frames[name] or BlzCreateFrameByType("FRAME",name,nil) end
function NativeGameUI()
    local ui=BlzGetFrameByName('GameUI')
    if not ui.children then
        local clockParent=BlzGetFrameByName('NativeClockMinimapParent')
        clockParent.children={BlzGetFrameByName('NativeClock'),BlzGetFrameByName('NativeMinimap0')}
        for _,child in ipairs(clockParent.children)do child.parent=clockParent end
        ui.children={BlzGetFrameByName('ConsoleUI'),BlzGetFrameByName('ConsoleBottomBar'),
            BlzGetFrameByName('ConsoleUIOverlay'),BlzGetFrameByName('ConsoleUIBackdrop'),
            BlzGetFrameByName('NativePortrait'),clockParent}
        for _,child in ipairs(ui.children)do child.parent=ui end
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
    return ui
end
function BlzFrameGetChildrenCount(frame)
    assert(type(frame)=='table'and frame.handle~=0,'Child count requires a valid frame')
    return #(frame.children or {})
end
function BlzFrameGetChild(frame,index)
    assert(type(frame)=='table'and frame.handle~=0,'Child lookup requires a valid parent')
    assert(index>=0 and index<#(frame.children or {}),'Check native child count before indexing')
    return frame.children[index+1]
end
function BlzFrameSetVisible(f,v) assert(f);f.visible=v end
function BlzFrameIsVisible(f)assert(f);return f.visible end
function BlzFrameSetText(f,v) assert(f);f.text=v end
function BlzFrameSetSize(f,w,h) f.width,f.height=w,h end
function BlzFrameSetAlpha(f,v) f.alpha=v end
function BlzFrameSetLevel(f,v) f.level=v end
function BlzFrameSetEnable(f,v) f.enabled=v end
function BlzFrameSetTexture(f,v) f.texture=v end
function BlzFrameSetScale(f,v) f.scale=v end
function BlzFrameSetTextAlignment(f,v,h) f.vertical,f.horizontal=v,h end
function BlzFrameSetAbsPoint(f,p,x,y) f.x,f.y=x,y;f.absolute=p end
function BlzFrameSetPoint(f,p,target,tp,x,y) f.anchor={point=p,target=target,targetPoint=tp,x=x,y=y} end
function BlzFrameClearAllPoints(f) f.anchor,f.absolute=nil,nil end
function BlzFrameSetAllPoints(f,target) f.allPoints=target end
function BlzFrameSetVertexColor(f,color) f.color=color end
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
function BlzPlaySpecialEffect(e,animation) e.animation=animation end
function BlzSetSpecialEffectPosition(e,x,y,z) e.x,e.y,e.z=x,y,z end
function BlzSetSpecialEffectAlpha(e,alpha)e.alpha=alpha end
function BlzSetSpecialEffectYaw(e,yaw)e.yaw=yaw end
bj_mapInitialPlayableArea={minX=-15104,minY=-256,maxX=-256,maxY=15104}
function GetRectMinX(r)return r.minX end
function GetRectMinY(r)return r.minY end
function GetRectMaxX(r)return r.maxX end
function GetRectMaxY(r)return r.maxY end
SurvivorStage.Get=function(index)return {name="stage "..index,mission="mission",hint="hint"}end
SurvivorExpedition.Journal=function()return ""end
SurvivorExpedition.GetFinding=function()return finding end
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
assert(board.visible and board.title:find('3:00')and frames.HSEssentialHUD.visible,
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
    clockChildCalls=clockChildCalls+1
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
assert(clockChildCalls==expected and clockCountCalls==expected,'Stop descending immediately after an invalid frame')
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
    clockChildCalls=clockChildCalls+1;return child(frame,index)
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
-- Use asymmetric, non-grid-aligned native bounds to expose added margins or rounding.
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
local function GuardTimer(duration)
    local timer=Local(SurvivorStory.Cleanup,'cameraGuardTimer')
    assert(timer and timer.running and not timer.destroyed and timer.dt==duration and timer.repeated==false,
        'Each animated shot owns one synchronized one-shot timer')
    return timer
end
local function Cancelled(timer)
    assert(timer.destroyed and not timer.running)
    local writes,text=#cameraBoundsWrites,frames.HeroSurvivorStageText.text
    timer.callback()
    assert(#cameraBoundsWrites==writes and frames.HeroSurvivorStageText.text==text,
        'A cancelled callback must neither change camera bounds nor advance dialogue')
end
cameraNative.x,cameraNative.y=-7191,7513
local timerCount=#timers
SurvivorStory.ShowBriefing(hero,Done)
Bounds(-7255,7449,-7127,7577)
assert(cameraNative.x==-7191 and cameraNative.y==7513 and #timers==timerCount,
    'Briefing locks its current target without reframing or creating a transition timer')
for page=1,4 do SurvivorUI.AdvanceNarrative()end
assert(completed==1);Restored()

SurvivorStory.ShowInterlude(1,hero,Done)
Bounds(-7564,7316,-7336,7574) -- Initial target(-7500,7380) union page-one target(-7400,7510).
local first=GuardTimer(.45)
assert(not hero.visible and lastPan.x==-7400 and lastPan.y==7510)
cameraNative.x,cameraNative.y=-7243,7827 -- An actual in-flight position outside the old planned targets.
SurvivorUI.AdvanceNarrative()
Bounds(-7584,7446,-7179,7891)
local second=GuardTimer(.45);assert(second~=first);Cancelled(first)
local text=frames.HeroSurvivorStageText.text
second.callback();Bounds(-7584,7446,-7456,7574)
assert(second.destroyed and Local(SurvivorStory.Cleanup,'cameraGuardTimer')==nil)
assert(frames.HeroSurvivorStageText.text==text and completed==1,'Settling a pan does not advance the story')
Cancelled(second)
SurvivorUI.AdvanceNarrative();local third=GuardTimer(.45)
SurvivorStory.ShowInterlude(2,hero,Done)
assert(GuardTimer(.45)~=third);Cancelled(third)
local replacement=GuardTimer(.45)
SurvivorUI.SkipConversation();assert(completed==2);Restored();Cancelled(replacement)

SurvivorStory.ShowEnding(hero,Done)
local endingTimer=GuardTimer(.5)
for page=2,5 do
    cameraNative.x,cameraNative.y=lastPan.x-13,lastPan.y+17
    local previousX,previousY=cameraNative.x,cameraNative.y
    local previousTimer=endingTimer
    SurvivorUI.AdvanceNarrative();endingTimer=GuardTimer(.5);Cancelled(previousTimer)
    Bounds(math.min(previousX,lastPan.x)-64,math.min(previousY,lastPan.y)-64,
        math.max(previousX,lastPan.x)+64,math.max(previousY,lastPan.y)+64)
end
assert(lastPan.x==-7180 and lastPan.y==7800 and completed==2)
SurvivorUI.AdvanceNarrative();assert(completed==3);Restored();Cancelled(endingTimer)

SurvivorStory.ShowInterlude(3,hero,Done);local resetTimer=GuardTimer(.45)
SurvivorStory.Reset();Restored();Cancelled(resetTimer)
local writes=#cameraBoundsWrites;SurvivorStory.Cleanup()
assert(#cameraBoundsWrites==writes,'Repeated cleanup must not alter restored bounds')
SurvivorUI.HidePanel()

SurvivorStory.ShowInterlude(4,hero,Done);local errorTimer=GuardTimer(.45)
failCameraPan=true
local ok,message=pcall(SurvivorUI.AdvanceNarrative)
assert(not ok and message:find('camera pan failure'));Restored();Cancelled(errorTimer)
local failedPageShot=timers[#timers]
assert(failedPageShot~=errorTimer);Cancelled(failedPageShot)
SurvivorUI.HidePanel()
SurvivorStory.ShowInterlude(1,hero,Done);local settleTimer=GuardTimer(.45)
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
timerCount=#timers;SurvivorStory.ShowInterlude(2,hero,Done)
local remoteFirst=GuardTimer(.45);assert(#timers==timerCount+1)
SurvivorUI.AdvanceNarrative();local remoteSecond=GuardTimer(.45);Cancelled(remoteFirst)
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
SurvivorUI.AdvanceNarrative() -- Static introduction now opens the four-line briefing.
assert(SurvivorUI.IsNarrativeVisible() and completed==0)
local first=frames.HeroSurvivorStageText.text
for i=1,300 do TickTimers()end
assert(frames.HeroSurvivorStageText.text==first and completed==0,"Time must never advance a dialogue page")
for i=1,3 do SurvivorUI.AdvanceNarrative();assert(completed==0)end
SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation()
assert(completed==1 and not SurvivorUI.IsNarrativeVisible(),"Completion is consumed once")
local hero=CreateUnit(0,"hero",-7600,7400,0)
for stage=1,4 do
    finding=stage%2==0
    SurvivorStory.ShowInterlude(stage,hero,function()completed=completed+1 end)
    assert(hero.visible==false and frames.HeroSurvivorStageTitle.text:find("퓨트리스"))
    local effects=Local(SurvivorStory.Cleanup,"sceneEffects")
    assert(#effects>=2)
    SurvivorUI.SkipConversation();SurvivorUI.SkipConversation()
    assert(hero.visible==true)
    for _,e in ipairs(effects)do assert(e.destroyed,"Story actor leaked")end
end
assert(completed==5)
SurvivorStory.ShowEnding(hero,function()completed=completed+1 end)
for i=1,4 do SurvivorUI.AdvanceNarrative();assert(completed==5)end
assert(frames.HeroSurvivorStageText.text:find("본편"))
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
    {'HeroSurvivorCaption','CustomTooltipBackgroundTemplate712'}})do
    local panel,skin=frames[pair[1]],frames[pair[2]]
    assert(panel.kind=='FRAME' and skin.parent==panel and skin.allPoints==panel)
    assert(not panel.texture and not skin.texture, 'Keep the template border and textured background')
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
    SurvivorUI.ShowStageIntro(2,function()end)
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
assert(frames.HeroSurvivorStageTitle.text:find('1/4') and not frames.HeroSurvivorStageTitle.text:find('요약'),'First viewing stays complete')
SurvivorUI.SkipConversation();SurvivorStory.Reset()
SurvivorStory.ShowBriefing(Done)
assert(frames.HeroSurvivorStageTitle.text:find('요약') and frames.HeroSurvivorStageTitle.text:find('1/1'))
local chapters=SurvivorStory.JournalChapters()
assert(#chapters==1 and #chapters[1].pages==4,'A summarized scene retains every full utterance in the journal')
local saved=chapters[1].pages[1];chapters[1].pages[1]='mutated'
assert(SurvivorStory.JournalChapters()[1].pages[1]==saved,'Journal returns independent presentation data')
SurvivorUI.AdvanceNarrative();assert(completed==2)
local hero=CreateUnit(0,'hero',-7600,7400,0)
SurvivorStage.ScenePoint=function()return {x=-8200,y=7000}end
finding=nil;SurvivorStory.ShowInterlude(4,hero,Done)
assert(frames.HeroSurvivorStageTitle.text:find('1/4') and not frames.HeroSurvivorStageTitle.text:find('요약'))
local effects=Local(SurvivorStory.Cleanup,'sceneEffects')
local putress=effects[2];local startX,startY=putress.x,putress.y
SurvivorUI.AdvanceNarrative()
assert(putress.x~=startX or putress.y~=startY,'Each inspection page changes the actors pose')
SurvivorUI.SkipConversation();SurvivorStory.Reset()
SurvivorStory.ShowInterlude(4,hero,Done)
assert(frames.HeroSurvivorStageTitle.text:find('요약'))
SurvivorUI.SkipConversation();SurvivorStory.Reset()
finding=true;SurvivorStory.ShowInterlude(4,hero,Done)
assert(frames.HeroSurvivorStageTitle.text:find('1/4') and not frames.HeroSurvivorStageTitle.text:find('요약'),'A newly recovered order deserves its full scene')
assert(frames.HeroSurvivorStageText.text:find('명령서'))
SurvivorUI.SkipConversation();SurvivorStory.Reset();SurvivorStory.SetSummaryMode(false)
SurvivorStory.ShowBriefing(Done);assert(frames.HeroSurvivorStageTitle.text:find('1/4'))
SurvivorUI.SkipConversation()
assert(hero.visible and #Local(SurvivorStory.Cleanup,'sceneEffects')==0)
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
local initialX,initialY=cart.x,cart.y
for i=1,100 do TickTimers()end
assert(cart.x==initialX and cart.y==initialY and cart.alpha==0 and completed==0,'Timer ticks cannot move the scene ahead')
SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative()
assert(cart.alpha==255 and (cart.x~=initialX or cart.y~=initialY) and figure.z==75,'Page four visibly prepares transport')
local preparedX,preparedY=cart.x,cart.y
SurvivorUI.AdvanceNarrative()
assert(cart.x>preparedX and cart.y>preparedY and anya.x<cart.x and putress.x>cart.x,'Both companions depart alongside the transport')
assert(frames.HeroSurvivorStageText.text:find('본편') and completed==0)
SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation()
assert(completed==1 and hero.visible)
for _,effect in ipairs(effects)do assert(effect.destroyed,'An ending scene effect leaked')end
`);

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
    local text=frames.HeroSurvivorExpedition
    assert(text.y<=.515 and text.y>=.36 and text.height>=.041 and text.height<=.128)
    assert(text.y-text.height-accept.y>=.009-.00001,'Risk button must sit below every line of the terms with visible spacing')
end
riskVisible=true;SurvivorUI.UpdateSpeech()
assert(accept.visible and frames.HeroSurvivorExpedition.visible);SeparatedRiskControls()
assert(frames.HSNotice.y-frames.HSNotice.height-frames.HeroSurvivorExpedition.y>=.012-.00001,'Urgent notices leave room above risk terms')
SurvivorUI.ClearSpeech();SurvivorUI.UpdateSpeech();SeparatedRiskControls()
SurvivorUI.Notify('일반 알림');SurvivorUI.UpdateSpeech();SafeLeftLane()
assert(frames.HSNotice.y-frames.HSNotice.height-frames.HeroSurvivorExpedition.y>=.012-.00001,'Ordinary notices leave room above risk terms')
assert(frames.HSSpeech.x-frames.HSSpeech.width/2-(accept.x+accept.width/2)>=.011-.00001,'Risk input cannot overlap combat subtitles')
assert(accept.text=='조사 수락','Offer terms and explicit action use the same investigation label')
ClickFrame(accept);assert(riskAccepts==1)
riskOffer=nil;SurvivorUI.UpdateSpeech();assert(not accept.visible)
emptyStatus=true;SurvivorUI.UpdateSpeech();assert(not frames.HeroSurvivorExpedition.visible and not accept.visible,
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
assert(board.visible and board.minimized and board.title:find('3:00'),'Collapse rows while retaining the native timer title')
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
    CyclePickup=function()mode='OFF';revision=revision+1 end,
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
ClickFrame(frames.ScriptDialogButton810);assert(frames.ScriptDialogButton810.text=='줍기: OFF')
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

suite('actual preparation UI supports second-page selections, return navigation and duplicate-click guards', presentationMocks + String.raw`
SurvivorUI.HidePanel=function()end
SurvivorUI.ClearDamageBoard=function()end
SurvivorStory={title='안야의 긴 밤',notice='창작 외전'}
HeroSurvivor.IsStorySummary=function()return false end
HeroSurvivor.ToggleStorySummary=function()end
`, [config,metrics,augments,'src/30_gameplay/SurvivorSetupUI.lua'], String.raw`
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
assert(not frames.HeroSurvivorSetupStart.enabled)
ClickFrame(frames.HeroSurvivorSetupStart);assert(starts==0)
SurvivorSetupUI.ShowMenu('normal','firebolt',chosen)
ClickFrame(frames.HeroSurvivorSetupTRINKET)
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
failStart=true;ClickFrame(frames.HeroSurvivorSetupStart);ClickFrame(frames.HeroSurvivorSetupStart)
assert(starts==1 and failures==1 and failure:find('intentional start failure'))
assert(not frames.HeroSurvivorSetupRoot.visible and not frames.HeroSurvivorSetupShade.visible)
SurvivorSetupUI.ShowMenu('normal','firebolt',chosen);failStart=false
ClickFrame(frames.HeroSurvivorSetupStart);ClickFrame(frames.HeroSurvivorSetupStart)
assert(starts==2 and failures==1,'A fresh preparation can start once after a handled failure')
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
function RemoveRect(r)r.removed=true end
function CreateSound()return {}end
function StopSound(s)s.stopped=true end
function AddWeatherEffect()return {}end
function RemoveWeatherEffect(w)w.removed=true end
for _,name in ipairs({"BlzSetSpecialEffectRoll","SetDayNightModels","SuspendTimeOfDay",
    "SetFloatGameState","FogMaskEnable","FogEnable","ResetTerrainFog","EnableWeatherEffect","SetSoundVolume","StartSound"})do _G[name]=function()end end
`;
suite('five detailed landmarks preserve authored terrain, grounding, effect budget and reversible pathing', stageMocks,
    [config,metrics,'src/30_gameplay/SurvivorStage.lua'], String.raw`
for _,bounds in ipairs({bj_mapInitialPlayableArea,{minX=-13568,minY=1536,maxX=-1792,maxY=13312},
    {minX=-1200,minY=-1200,maxX=1200,maxY=1200}})do
    SurvivorStage.Init(bounds)
    local cx,cy=(bounds.minX+bounds.maxX)/2,(bounds.minY+bounds.maxY)/2
    -- An editor-authored blocked cell must survive all stage rebuilds.
    local key=math.floor((cx+768)/32)..":"..math.floor((cy+384)/32);blocked[key]=true
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
        if bounds.maxX-bounds.minX>5000 then assert(#owned<1000,'Only the local arena and search lanes should repaint')end
        for _,p in ipairs(painted)do assert(p.x>=bounds.minX and p.x<=bounds.maxX and p.y>=bounds.minY and p.y<=bounds.maxY)end
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

const originalPathMap = openMap(path.join(root, 'HeroSurvivor.w3x'));
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
const original = fs.readFileSync(path.join(root, 'dist/HeroSurvivor-playtest.w3x'));
const map = openMap(original), old = map.read('war3map.lua').toString('utf8');
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

// Prepare the exact resized archive in memory: these checks never publish a map.
const baseBytes = fs.readFileSync(path.join(root, 'HeroSurvivor.w3x'));
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
    'war3mapUnits.doo', 'war3mapMap.blp', 'war3map.w3c', 'war3map.w3r', 'war3map.wts', 'war3map.wtg']) {
    assert.deepEqual(refreshedMap.read(name), baseMap.read(name), 'Base geography must match byte for byte: ' + name);
}
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
const protectedEntry = strings.match(/^(STRING 7\r?\n(?:\/\/[^\r\n]*\r?\n)*\{\r?\n)([\s\S]*?)(\r?\n\})/m);
assert(protectedEntry, 'Map has an ability/unit string for collision verification');
const conflictingStrings = Buffer.from(strings.replace(protectedEntry[0], protectedEntry[1] + 'Incorrect preserved unit name' + protectedEntry[3]));
assert.throws(() => refreshBase(original, baseMap.replace(new Map([['war3map.wts', conflictingStrings]])), bundle),
    /string conflicts.*TRIGSTR_7/, 'New metadata strings must never silently corrupt preserved gameplay objects');
assert.deepEqual(fs.readFileSync(path.join(root, 'HeroSurvivor.w3x')), baseBytes, 'Dry verification changed original');
assert.deepEqual(fs.readFileSync(path.join(root, 'dist/HeroSurvivor-playtest.w3x')), original, 'Dry verification published output');
console.log(`PASS resized-base refresh (${baseTerrain.width - 1}x${baseTerrain.height - 1} cells), native geography, undead rules, editor source, ${refreshed.preserved} gameplay entries and palette/pathing guards`);

const unitEntries = new Map();
const unitAssetSnapshots = new Map();
for (const [name, skin] of [['war3map.w3u', false], ['war3mapSkin.w3u', true]]) {
    const before = map.read(name), assetBefore = fs.readFileSync(path.join(root, 'assets', name));
    unitAssetSnapshots.set(name, assetBefore);
    const output = installPortraitUnits(before, skin, {migrateLegacyAnya: true, migrateLegacyArmor: true}), data = parseUnits(output);
    assert.deepEqual(serializeUnits(parseUnits(before)), before, 'Existing unit fields must round-trip byte for byte');
    assert.deepEqual(installPortraitUnits(output, skin), output, 'Portrait installation must be idempotent');
    assert.deepEqual(installPortraitUnits(assetBefore, skin, {migrateLegacyAnya: true, migrateLegacyArmor: true}), output,
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
    assert.throws(() => installPortraitUnits(serializeUnits(conflicting), skin, {migrateLegacyAnya: true, migrateLegacyArmor: true}), /conflicting fields/,
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
assert.deepEqual(fs.readFileSync(path.join(root, 'HeroSurvivor.w3x')), baseBytes, 'Portrait preparation changed original');
assert.deepEqual(fs.readFileSync(path.join(root, 'dist/HeroSurvivor-playtest.w3x')), original, 'Portrait preparation published a map');
for (const [name, bytes] of unitAssetSnapshots) assert.deepEqual(fs.readFileSync(path.join(root, 'assets', name)), bytes,
    'Portrait dry preparation must not write its asset source');
console.log('PASS native portrait unit definitions, real speaker models, byte-preserved rows, assets, idempotence and missing-object guard');
console.log('PASS explicit Anya model migration, single-field changes, unrelated records, legacy guard, MPQ readback and conflict refusal');

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
assert.deepEqual(fs.readFileSync(path.join(root, 'dist/HeroSurvivor-playtest.w3x')), original);
assert.deepEqual(fs.readFileSync(path.join(root, 'HeroSurvivor.w3x')), baseBytes);
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
        assert.deepEqual(fs.readFileSync(path.join(root, 'dist/HeroSurvivor-playtest.w3x')), original,
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
