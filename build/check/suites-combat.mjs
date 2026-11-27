// Combat: supplies, spawning, weapons, status effects, sets and boss telegraphs.
import {augments, combat, config, metrics, suite} from './harness.mjs';
import {bossTelegraphMocks, mocks} from './mocks.mjs';
suite('breakable supplies spawn on accessible ground, reward once, pause and clean without enemy kills', mocks + String.raw`
PATHING_TYPE_WALKABILITY,PLAYER_NEUTRAL_PASSIVE='walk',24
local angle=0
function GetRandomReal(a,b)if b==2*math.pi then angle=angle+math.pi/2;return angle end;return a end
bonusRoll,bonusRollCalls=1,0
function GetRandomInt()bonusRollCalls=bonusRollCalls+1;return bonusRoll end
function IsTerrainPathable()return blocked==true end
function ALICE_AddIdentifier(u,id)u.identifier=id end
function ALICE_RemoveIdentifier(u)u.identifier=nil end
function BlzSetUnitName(u,name)u.name=name end
function GetTriggerUnit()return eventUnit end
function GetEventDamage()return eventDamage end
function GetEventDamageSource()return eventSource end
function BlzSetEventDamage(amount)eventDamage=amount end
function GetItemX(item)return item.x end
function GetItemY(item)return item.y end
function GetManipulatedItem()return eventItem end
function UnitDamageTarget(source,u,amount)
    eventUnit,eventSource,eventDamage=u,source,amount
    for _,t in ipairs(triggers)do if not t.destroyed and t.event=='damage'then t.action()end end
    hits[#hits+1]={unit=u,damage=eventDamage};u.life=math.max(0,u.life-eventDamage)
    if u.life==0 then for _,t in ipairs(triggers)do if not t.destroyed and t.event=='death'then t.action()end end end
end
`, [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('firebolt')
local rewards,kills,deaths={},0,0
CombatRun().onBonus=function(kind)rewards[#rewards+1]=kind end
CombatRun().onKill=function()kills=kills+1 end
CombatRun().onDeath=function()deaths=deaths+1 end
local update=SurvivorCombatSupplies.Update
local hit=Local(SurvivorCombat.FireMissile,'Hit')
local function Props()local list={};for u,r in pairs(units)do if r.bonus and r.alive then list[#list+1]=u end end;return list end
local items=CombatRun().bonusItems
local function OnlyItem()local item=next(items);assert(item and next(items,item)==nil);return item end
local function Pickup(item,unit)
    eventUnit,eventItem=unit or hero,item
    CombatRun().bonusPickupTrigger.action()
end
now=19;SurvivorCombat.UpdateEnemies(now);assert(#Props()==0)
state='CHOOSING';now=20;SurvivorCombat.UpdateEnemies(now);assert(#Props()==0)
state='RUNNING';blocked=true;SurvivorCombat.UpdateEnemies(now);assert(#Props()==0)
blocked=false;now=25;SurvivorCombat.UpdateEnemies(now)
local prop=Props()[1];assert(prop and prop.identifier=='hsEnemy' and prop.owner==24 and prop.paused)
assert(prop.life==2 and SurvivorCombat.Counts()==0 and units[prop].bonus==true)
local propType,propName=prop.id,prop.name
assert(propType==SurvivorConfig.bonusProps.unitId and propName==SurvivorConfig.bonusProps.name and bonusRollCalls==0,
    'One common prop has no reward classification and does not roll at spawn')
assert((prop.x-hero.x)^2+(prop.y-hero.y)^2>=SurvivorConfig.bonusProps.distanceMin^2)
UnitDamageTarget(CreateUnit(12,'enemy',0,0,0),prop,999);assert(prop.life==2,'Enemies cannot break supplies')
state='CHOOSING';UnitDamageTarget(hero,prop,999);assert(prop.life==2)
SurvivorCombat.SetPaused(true);SurvivorCombat.SetPaused(false);assert(prop.paused)
state='RUNNING';SurvivorCombat.FireMissile();assert(actors[#actors].target==prop,'Homing weapons select supplies')
hit(prop,999,'firebolt');assert(prop.life==1 and #rewards==0)
hit(prop,999,'firebolt');assert(prop.life==0 and #rewards==0,'Destruction drops an item without granting its reward')
local drop=OnlyItem();assert(drop.id==SurvivorConfig.bonusProps.recovery.itemId and drop.x==prop.x and drop.y==prop.y)
assert(bonusRollCalls==1,'Choose the reward only on destruction')
assert(kills==0 and deaths==0 and SurvivorCombat.Counts()==0,'Supplies do not invoke kill, drop or hero-death callbacks')
assert(SurvivorCombat.DamageRows({'firebolt'})[1].damage==0,'Supplies do not inflate weapon damage')
CombatRun().deathTrigger.action();assert(OnlyItem()==drop and bonusRollCalls==1,'Repeated deaths cannot duplicate or reroll drops')
SurvivorCombat.UpdateStatus(.02);assert(#rewards==0 and not drop.removed,'A distant drop waits for collection')
hero.inventory={};for i=1,6 do hero.inventory[i]=CreateItem('occupied',0,0)end
hero.x,hero.y=drop.x+SurvivorConfig.bonusProps.pickupRadius,drop.y
SurvivorCombat.UpdateStatus(.02)
assert(drop.removed and next(items)==nil and #rewards==1 and rewards[1]=='recovery','Approach consumes the reward even with a full inventory')
Pickup(drop);assert(#rewards==1,'Manual pickup after proximity cannot award twice')
hero.x,hero.y=0,0
now=25.5;SurvivorCombat.UpdateEnemies(now);assert(prop.removed and #Props()==0)
bonusRoll=31;now=60;SurvivorCombat.UpdateEnemies(now);prop=Props()[1]
assert(units[prop].bonus==true and prop.id==propType and prop.name==propName and bonusRollCalls==1,
    'Spawn appearance and name cannot reveal the future drop')
local marker=units[prop].cosmetic
-- Keep spawning under control to inspect expiry and pause independently.
CombatRun().nextBonusAt=10000
state='INVENTORY';now=120;SurvivorCombat.UpdateEnemies(now);assert(not prop.removed)
state='RUNNING';SurvivorCombat.UpdateEnemies(now);assert(prop.removed and marker.destroyed and #rewards==1)
SurvivorCombat.BeginStage(2,120);assert(CombatRun().nextBonusAt==140)
now=140;SurvivorCombat.UpdateEnemies(now);assert(#Props()==1)
now=175;SurvivorCombat.UpdateEnemies(now);assert(#Props()==2 and SurvivorCombat.Counts()==0)
now=195;SurvivorCombat.UpdateEnemies(now);assert(#Props()==2,'Live supply limit is independent of enemies')
prop=Props()[1];hit(prop,99,'firebolt');hit(prop,99,'firebolt');drop=OnlyItem()
state='STAGE_CLEAR';local completed=false
SurvivorCombat.ClearBattlefieldAsync(function()completed=true end)
while SurvivorCombat.IsClearing()do TickTimers()end
assert(completed and #Props()==0 and #rewards==1 and drop.removed,'Stage cleanup removes drops without a reward')
state='RUNNING';SurvivorCombat.BeginStage(3,200);bonusRoll=1;now=220;SurvivorCombat.UpdateEnemies(now);prop=Props()[1]
bonusRoll=31 -- Changing the roll after spawn must change the drop at destruction.
hit(prop,99,'firebolt');hit(prop,99,'firebolt');drop=OnlyItem()
assert(drop.id==SurvivorConfig.bonusProps.experienceProp.itemId and prop.id==propType)
Pickup(drop,CreateUnit(12,'other',0,0,0));assert(#rewards==1 and not drop.removed)
Pickup(drop);assert(drop.removed and #rewards==2 and rewards[2]=='experienceProp','Direct pickup grants XP without requiring proximity')
Pickup(drop);assert(#rewards==2)
local makeDrop=SurvivorCombatSupplies.Drop
makeDrop('recovery',400,0);drop=OnlyItem()
state='CHOOSING';Pickup(drop);RemoveItem(drop) -- Emulate native automatic powerup consumption after the event.
SurvivorCombat.UpdateStatus(.02);assert(#rewards==2 and items[drop].pending)
state='RUNNING';SurvivorCombat.UpdateStatus(.02);assert(#rewards==3 and next(items)==nil,'Paused native pickup resumes exactly once even after native removal')
makeDrop('experienceProp',400,0);drop=OnlyItem()
now=280;SurvivorCombat.UpdateStatus(.02);assert(drop.removed and #rewards==3,'Expired drops grant nothing')
makeDrop('recovery',400,0);drop=OnlyItem()
SurvivorCombat.BeginStage(4,280);assert(drop.removed and #rewards==3)
makeDrop('experienceProp',400,0);drop=OnlyItem()
local pickupTrigger=CombatRun().bonusPickupTrigger
SurvivorCombat.Cleanup();assert(prop.removed and drop.removed and pickupTrigger.destroyed and #rewards==3)
hero,build,units=NewCombat('plaguedart');update=SurvivorCombatSupplies.Update
now=20;SurvivorCombat.UpdateEnemies(now);assert(#Props()==1,'Restart resets the supply schedule')
SurvivorCombat.CastWeapon('plaguedart');assert(actors[#actors].identifier=='hsFrostShard','Putress attacks supplies too')
SurvivorCombat.ClearBattlefield();assert(#Props()==0)
now=SurvivorConfig.StageTiming(1).bossStart;SurvivorCombat.UpdateEnemies(now)
assert(#Props()==0,'No new supplies appear during the boss encounter')
SurvivorCombat.Cleanup()
`);

suite('bonus rolls implement exactly 30 healing, 60 experience, 5 purge and 5 time stop outcomes', mocks + String.raw`
function GetRandomInt(a,b)assert(a==1 and b==100);return roll end
`, [config,metrics,augments,combat], String.raw`
local choose=SurvivorCombatSupplies.Roll
local counts={recovery=0,experienceProp=0,purge=0,timeStop=0}
for i=1,100 do roll=i;local kind=choose();counts[kind]=counts[kind]+1
    assert(kind==(i<=30 and 'recovery' or i<=90 and 'experienceProp' or i<=95 and 'purge' or 'timeStop'))
end
assert(counts.recovery==30 and counts.experienceProp==60 and counts.purge==5 and counts.timeStop==5)
`);

suite('purge kills nearby ordinary and elite enemies, spares props and caps boss damage without death procs', mocks + String.raw`
function GetTriggerUnit()return eventUnit end
function KillUnit(u)
    u.life=0;eventUnit=u
    for _,t in ipairs(triggers)do if not t.destroyed and t.event=='death'then t.action()end end
end
`, [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('firebolt')
local near=EnemyAt(units,100,0,false)
local elite=EnemyAt(units,400,0,false);units[elite].elite=true
local edge=EnemyAt(units,700,0,false)
local far=EnemyAt(units,701,0,false)
local boss=EnemyAt(units,600,0,false);units[boss].boss=true;boss.maxLife=1000;boss.life=1000
local prop=CreateUnit(24,'hsBC',100,50,0);prop.life=2;units[prop]={bonus=true,alive=true}
build.stats.sets.gravewarden=true
for _,u in ipairs({near,elite,edge})do units[u].curse=3;units[u].curseUntil=10;units[u].lastHit=100000;units[u].lastWeapon='firebolt'end
local kills=0;CombatRun().onKill=function()kills=kills+1 end
assert(SurvivorCombat.PurgeNearby()==3 and kills==3 and near.life==0 and elite.life==0 and edge.life==0)
assert(far.life==far.maxLife and prop.life==2 and hero.life==hero.maxLife,'No bonus or out-of-range target is killed by secondary death effects')
assert(boss.life==900 and units[boss].alive and SurvivorCombat.Counts()==2)
assert(SurvivorCombat.DamageRows({'firebolt'})[1].damage==0,'Item kills are not attributed to the last weapon')
boss.life=50;assert(SurvivorCombat.PurgeNearby()==0 and boss.life==1 and units[boss].alive)
state='CHOOSING';boss.life=100;assert(SurvivorCombat.PurgeNearby()==0 and boss.life==100)
SurvivorCombat.Cleanup()
`);

suite('time stop preserves enemy missiles, hazards and special clocks for eight seconds while friendly weapons continue', mocks + String.raw`
PATHING_TYPE_WALKABILITY,PLAYER_NEUTRAL_AGGRESSIVE='walk',12
function GetRandomInt(a,b)return a end
function GetRandomReal(a,b)return a end
function IsTerrainPathable()return false end
function BlzSetUnitName(u,n)u.name=n end
function BlzSetUnitBaseDamage(u,d)u.damage=d end
function BlzGetUnitAttackCooldown()return 1.5 end
function BlzSetUnitAttackCooldown(u,v)u.attackCooldown=v end
function SetUnitScale()end
function SetUnitVertexColor(u,r,g,b,a)u.color={r,g,b,a}end
function SetUnitCreepGuard()end
function RemoveGuardPosition()end
function SetUnitFacing()end
function SetUnitAnimation()end
function ALICE_AddIdentifier()end
function IssueTargetOrder(u,o)u.order=o end
function IssuePointOrder(u,o)u.order=o end
function GetUnitCurrentOrder(u)return u.order or 'attack'end
function OrderId(x)return x end
function SetUnitTimeScale(u,s)u.timeScale=s end
function BlzSetSpecialEffectTimeScale(e,s)e.timeScale=s end
SurvivorStage.Get=function()return{ids={melee='sm01',ranged='sr01',boss='sb01'},color={180,220,185}}end
function GetTriggerUnit()return eventUnit end
function GetEventDamage()return eventDamage end
function GetEventDamageSource()return eventSource end
function BlzSetEventDamage(d)eventDamage=d end
`, [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('firebolt')
local source=EnemyAt(units,400,0,false);units[source].damageScale=1
units[source].baseColor={210,150,90,220}
units[source].nextShot,units[source].nextBlast,units[source].nextTrait,units[source].supportAt=2,3,4,5
-- Unit deadlines live on the unit clock; this is their run-time due point.
local function Due(u,key)local record=units[u];return record[key]+(record.stoppedFor or 0)end
local elite=EnemyAt(units,600,0,false);units[elite].elite=true;units[elite].damageScale=1
units[elite].baseColor={120,200,180,255}
local boss=EnemyAt(units,700,0,false);units[boss].boss=true;units[boss].nextBlast=100
units[boss].baseColor={180,100,230,255}
local fire=SurvivorCombatHazards.FireEnemyMissile
fire(source,{projectileSpeed=420,damage=12});local missile=actors[#actors]
local warn=Local(SurvivorCombat.WarnLava,'WarnBossBlast');warn(0,0,200,1.8,true);local blast=actors[#actors]
SurvivorCombatHazards.WarnPlague(source,units[source]);local plague=actors[#actors]
SurvivorCombatHazards.StartSpecial('dash',units[elite],elite);local dash=actors[#actors]
SurvivorCombat.FireMissile();local friendly=actors[#actors];assert(friendly.identifier=='hsMissile')
SurvivorCombat.StopTime()
assert(source.paused and elite.paused and boss.paused and not hero.paused and not build.stats.combatPaused)
assert(source.timeScale==0 and missile.visual.timeScale==0 and blast.markers[1].timeScale==0)
assert(source.color[1]==94 and source.color[2]==67 and source.color[3]==40 and source.color[4]==220)
assert(boss.color[1]==81 and elite.color[1]==54 and hero.color==nil,'Only stopped enemies are dimmed; original colors and alpha remain distinct')
local mx,my,life=missile.x,missile.y,missile.life
for i=1,30 do missile:selfInteractions();blast:selfInteractions();plague:selfInteractions();dash:selfInteractions()end
assert(missile.x==mx and missile.y==my and missile.life==life and blast.life==1.8 and plague.elapsed==0 and dash.elapsed==0)
local fx=friendly.x;friendly:selfInteractions();assert(friendly.x~=fx,'Friendly projectiles continue moving')
local hit=Local(SurvivorCombat.FireMissile,'Hit');local hp=source.life;hit(source,10,'firebolt');assert(source.life<hp,'Frozen enemies can still be attacked')
eventUnit,eventSource,eventDamage=hero,source,20;CombatRun().damageTrigger.action();assert(eventDamage==0,'Native enemy attacks cannot land during stop')
now=.5;SurvivorCombatStatus.Freeze(source,.8)
state='CHOOSING';SurvivorCombat.SetPaused(true,'CHOICE');SurvivorCombat.UpdateStatus(.02)
SurvivorCombat.SetPaused(false);state='RUNNING'
assert(source.paused and missile.visual.timeScale==0 and friendly.visual.timeScale==1)
assert(source.color[1]==64 and source.color[2]==74 and source.color[3]==85 and boss.color[1]==81,
    'Menu pause preserves the blue freeze tint underneath time-stop dimming')
now=2;SurvivorCombat.UpdateStatus(.02)
assert(boss.paused and boss.timeScale==0 and Due(boss,'nextBlast')==100,'Boss motion must remain stopped after one second')
assert(source.paused and units[source].freezeUntil==nil,'Expiring weapon freeze must not release time stop')
assert(source.color[1]==94,'Expiring weapon freeze restores the dimmed base color')
now=3;local ok,late=SurvivorCombat.Spawn(false,'melee');assert(ok and late.paused and late.timeScale==0)
assert(late.color[1]==81 and late.color[2]==99 and late.color[3]==83)
local bossOK,lateBoss=SurvivorCombat.SpawnBoss();assert(bossOK and lateBoss.paused and lateBoss.color[1]==81)
local courier=SurvivorCombat.SpawnCourier({{x=100,y=100},{x=500,y=100}})
assert(courier.paused and courier.color[1]==105 and courier.color[2]==94 and units[courier].baseColor[1]==235,
    'A courier spawned during time stop keeps its new gold base color underneath the dimming')
local dying=EnemyAt(units,900,0,false);units[dying].baseColor={80,160,240,255}
Local(SurvivorCombat.StopTime,'StopUnitTime')(dying,units[dying],8)
assert(dying.color[1]==36);dying.life=0;eventUnit=dying;CombatRun().deathTrigger.action()
assert(dying.color[1]==80 and dying.timeScale==1,'A unit killed during stop restores its death animation and color')
local lateShot=units[late].nextShot
fire(source,{projectileSpeed=420,damage=12});local lateMissile=actors[#actors]
local lx=lateMissile.x;lateMissile:selfInteractions();assert(lateMissile.x==lx and lateMissile.visual.timeScale==0)
now=7.99;SurvivorCombat.UpdateStatus(.02);assert(source.paused and late.paused and boss.paused and lateBoss.paused)
now=8;SurvivorCombat.UpdateStatus(.02)
assert(not source.paused and not late.paused and source.timeScale==1 and missile.visual.timeScale==1)
assert(not boss.paused and not lateBoss.paused and Due(boss,'nextBlast')==108,'Both existing and new bosses resume at eight seconds')
assert(source.color[1]==210 and source.color[2]==150 and source.color[3]==90 and source.color[4]==220)
assert(boss.color[1]==180 and late.color[1]==180 and courier.color[1]==235 and courier.color[2]==210,
    'Expiry restores each original theme, boss and courier color')
assert(Due(source,'nextShot')==10 and Due(source,'nextBlast')==11 and Due(source,'nextTrait')==12 and Due(source,'supportAt')==13)
assert(math.abs(Due(late,'nextShot')-lateShot-5)<1e-9,'New enemies retain their own remaining attack delays')
missile:selfInteractions();blast:selfInteractions();plague:selfInteractions();dash:selfInteractions()
assert(missile.x~=mx and missile.life<life and blast.life<1.8 and plague.elapsed>0 and dash.elapsed>0)
-- Refresh to eight remaining seconds, preserving pre-existing native pauses.
late.paused=true;now=9;SurvivorCombat.StopTime();now=10;SurvivorCombat.StopTime()
assert(source.color[1]==94 and boss.color[1]==81,'Repeated pickups cannot darken colors cumulatively')
now=17.99;SurvivorCombat.UpdateStatus(.02);assert(source.paused)
now=18;SurvivorCombat.UpdateStatus(.02);assert(not source.paused and late.paused and source.color[1]==210 and late.color[1]==180)
now=19;SurvivorCombat.StopTime();state='STAGE_CLEAR';SurvivorCombat.SetPaused(true,'STAGE_CLEAR')
SurvivorCombat.ClearBattlefield();assert(CombatRun().timeStopUntil==0 and source.color[1]==210)
SurvivorCombat.Cleanup()
hero,build,units=NewCombat('firebolt');source=EnemyAt(units,400,0,false)
assert(CombatRun().timeStopUntil==0 and not source.paused,'Restart cannot inherit time stop')
-- Pause reasons overlap: a unit stays paused while any reason holds, and the last one
-- restores the native state from before the first (an outside pause survives).
state='RUNNING';now=20;local held=EnemyAt(units,500,0,false);local free=EnemyAt(units,520,0,false);held.paused=true
for _,u in ipairs({held,free}) do assert(SurvivorCombatStatus.Freeze(u,.5)) end
SurvivorCombat.StopTime()
now=21;SurvivorCombat.UpdateStatus(.02);assert(free.paused and units[free].freezeUntil==nil,'Time stop outlasts an expired freeze')
SurvivorCombat.SetPaused(true,'CHOICE')
now=28;SurvivorCombat.UpdateStatus(.02);assert(free.paused and units[free].timeStopUntil==nil,'A menu pause outlasts time stop')
SurvivorCombat.SetPaused(false)
assert(not free.paused and units[free].pauseReasons==nil,'The last released reason resumes the unit')
assert(held.paused and units[held].pauseReasons==nil,'A pause from outside combat is restored, not cleared')
SurvivorCombat.Cleanup()
`);

suite('supply rewards cap healing and use suspended native XP with deferred multi-level choices', mocks + String.raw`
OnInit={final=function()end}
function GetHeroLevel(u)return u.level or 1 end
function GetHeroSkillPoints()return 0 end
function SuspendHeroXP(u,on)u.xpSuspended=on end
function AddHeroXP(u,amount)assert(not u.xpSuspended);u.xp=(u.xp or 0)+amount;u.level=4 end
purges,stops=0,0
SurvivorCombat={PurgeNearby=function()purges=purges+1;return 2 end,StopTime=function()stops=stops+1 end}
`, [config,'src/00_bootstrap/AnyasLongNight.lua'], String.raw`
local reward=Local(AnyasLongNight.BeginRun,'BonusReward')
local hero=CreateUnit(0,'hero',0,0,0);hero.maxLife=500;hero.life=200
LifecycleRun().hero=hero;LifecycleRun().stage=1
reward('recovery');assert(hero.life==300)
hero.life=480;reward('recovery');assert(hero.life==500 and lastMessage:find('+20',1,true))
hero.life=500;reward('recovery');assert(hero.life==500)
state='CHOOSING';reward('experienceProp');assert(not hero.xp)
state='RUNNING';reward('experienceProp')
assert(hero.xp==250 and hero.xpSuspended and #LifecycleRun().queuedLevels==3 and state=='RUNNING')
LifecycleRun().stage=5;reward('experienceProp');assert(hero.xp==650 and #LifecycleRun().queuedLevels==3)
reward('purge');reward('timeStop');assert(purges==1 and stops==1 and hero.xp==650,'Rare effects must not grant XP rewards')
hero.life=0;reward('recovery');reward('experienceProp');assert(hero.life==0 and hero.xp==650)
`);

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
    TickWeapons=function()return {},{} end,CastWeapons=function()end,
    UpdateStatus=function()end,UpdateEnemies=function()end,WarnLava=function()end}
`, [config,'src/00_bootstrap/AnyasLongNight.lua'], String.raw`
local step=Local(AnyasLongNight.BeginRun,'Step')
LifecycleRun().hero=CreateUnit(0,'hero',0,0,0)
LifecycleRun().stats={weapons={}}
SetLocal(step,'selectedDifficulty','normal')
SetLocal(step,'RefreshDamageBoard',function()end)
for index,expected in ipairs({{120,180},{180,240},{240,300},{240,300},{240,300}})do
    local timing=SurvivorConfig.StageTiming(index)
    assert(timing.bossStart==expected[1] and timing.duration==expected[2])
    LifecycleRun().stage=index;LifecycleRun().stageStarted=1000
    LifecycleRun().bossStarted=false;LifecycleRun().nextElite=45
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
local wave=Local(AnyasLongNight.BeginRun,'SpawnWave')
local oldStageRates,oldMinuteRates={1,1.35,1.75,2.2,2.7},{1,1.6,2.4,3.4}
for difficulty,weight in pairs({easy=.8,normal=1,hard=1.1})do
    SetLocal(wave,'selectedDifficulty',difficulty)
    for index,stageWeight in ipairs(oldStageRates)do
        LifecycleRun().stage=index;LifecycleRun().bossStarted=false
        for minute,timeWeight in ipairs(oldMinuteRates)do
            local elapsed=(minute-1)*60
            if elapsed<SurvivorConfig.StageTiming(index).bossStart then
                LifecycleRun().spawnBudget=0;regularSpawns=0
                for tick=1,500 do wave(.02,elapsed+(tick-1)*.02)end
                local expected=10*weight*stageWeight*timeWeight*1.5
                assert(math.abs(regularSpawns-expected)<1.00001,
                    'Actual wave accumulation must deliver 1.5 times the old rate across every difficulty, stage and minute')
            end
        end
    end
end
`);

suite('seven-level growth gates evolution at the cap and the armor trinket applies native armor once', mocks,
    [config,augments], String.raw`
assert(SurvivorConfig.growthMaxLevel==7)
local b=SurvivorAugments.NewBuild('chainlightning')
local previous=0
for level=2,7 do
    assert(SurvivorAugments.CanChoose('chainlightning',b) and not SurvivorAugments.CanChoose('chainlightning_stormnet',b))
    SurvivorAugments.Apply('chainlightning',b);assert(b.levels.chainlightning==level and b.stats.weapons.chainlightning.damage>previous)
    previous=b.stats.weapons.chainlightning.damage
end
assert(b.stats.weapons.chainlightning.targets==9 and not SurvivorAugments.CanChoose('chainlightning',b) and SurvivorAugments.CanChoose('chainlightning_stormnet',b))
SurvivorAugments.Apply('chainlightning_stormnet',b);assert(b.stats.weapons.chainlightning.targets==13,'Storm net adds four targets at level 7')
b=SurvivorAugments.NewBuild('firebolt','multicast');for _=2,7 do SurvivorAugments.Apply('multicast',b)end
assert(b.stats.multiCount==3 and math.abs(b.stats.multiDamage-.45)<1e-9)
local hero=CreateUnit(0,'hero',0,0,0);hero.armor=3
b=SurvivorAugments.NewBuild('firebolt','armor');SurvivorAugments.Recalculate(b,hero)
assert(hero.armor==5 and SurvivorAugments.OwnedTooltip('armor',b)=='방어력 +2')
for _=2,7 do SurvivorAugments.Apply('armor',b,hero)end
assert(hero.armor==17 and b.stats.armorBonus==14,'Armor is a delta over the base, never restacked')
SurvivorAugments.Recalculate(b,hero);SurvivorAugments.Recalculate(b,hero);assert(hero.armor==17)
assert(SurvivorAugments.Preview('armor',SurvivorAugments.NewBuild('firebolt')):find('방어력 0 → ',1,true))
`);

suite('growth offers preserve guarantees, evolution priority, exclusion fallbacks and exhausted recovery', mocks,
    [config,augments], String.raw`
GetRandomInt=function(a,b)return a end
local b=SurvivorAugments.NewBuild('firebolt');local o=SurvivorAugments.Roll(b)
assert(o[1]=='firebolt' and b.choiceKinds[1]=='upgrade' and b.choiceKinds[2]=='new' and #o==3)
assert(not SurvivorAugments.CanReroll(b,o,1) and not SurvivorAugments.CanExclude(b,o,1))
assert(SurvivorAugments.Reroll(b,o,2) and SurvivorAugments.Level(b,o[2])==0)
b.levels.firebolt=SurvivorConfig.growthMaxLevel;o=SurvivorAugments.Roll(b)
assert(o[1]=='firebolt_burst' and o[2]=='firebolt_judgment' and b.evolutionOffer)
assert(SurvivorAugments.Exclude(b,o,1) and b.excluded.firebolt_burst and b.excludesRemaining==SurvivorConfig.excludesPerRun-1)
o=SurvivorAugments.Roll(b);assert(o[1]=='firebolt_judgment' and b.evolutionOffer)
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
b.evolutions={flamefield='flamefield_inferno',chainlightning='chainlightning_stormnet',orbitblade='orbitblade_constellation',monsoon='monsoon_stormfront',frontslash='frontslash_crescent'}
b.excluded.firebolt_judgment=true;o=SurvivorAugments.Roll(b)
assert(#o==1 and o[1]=='firebolt_burst')
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
build.stats.weapons.frontslash.duration=0.5
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
CombatRun().warningUntil=10
SurvivorCombat.UpdateStatus(0.02);assert(blade.visual.alpha==150)
local writes=alphaWrites
for i=1,100 do SurvivorCombat.UpdateStatus(0.02) end
assert(alphaWrites==writes)
SurvivorCombat.CastBlades();assert(actors[#actors].visual.alpha==150)
now=11;SurvivorCombat.UpdateStatus(0.02)
for _,a in ipairs(actors) do assert(a.visual.alpha==255) end
SurvivorCombat.Cleanup()
hero,build,units=NewCombat('frontslash');target=EnemyAt(units,50,0,false)
SurvivorCombat.CastFrontSlash()
for _,a in ipairs(actors)do
    if a.identifier=='hsSlash'or a.identifier=='hsSlashHit'then assert(a.visual.alpha==255)end
end
CombatRun().warningUntil=10;SurvivorCombat.UpdateStatus(.02)
for _,a in ipairs(actors)do
    if a.identifier=='hsSlash'or a.identifier=='hsSlashHit'then assert(a.visual.alpha==150)end
end
SurvivorCombat.Cleanup()
hero,build,units=NewCombat('returnblade');EnemyAt(units,100,0,false);SurvivorCombat.CastExtra('returnblade')
assert(actors[1].visual.alpha==140,'Unrelated blade weapons keep their existing visibility policy')
SurvivorCombat.Cleanup()
`);

suite('chain lightning adds one fixed-size impact per hit, preserves damage and cleans paused or expired visuals', mocks + String.raw`
function AddLightningEx(kind,visible,x,y,z,tx,ty,tz)return {kind=kind,x=x,y=y,z=z,tx=tx,ty=ty,tz=tz}end
function AddSpecialEffectTarget(model,unit,point)return {model=model,unit=unit,point=point}end
function BlzSetSpecialEffectZ(effect,z)assert(not effect.unit,'Attached effects must use native attachment height');effect.z=z end
function BlzSetSpecialEffectScale(effect,value)effect.scale=value end
function BlzSetSpecialEffectAlpha(effect,value)effect.alpha=value end
`, [config, metrics, augments, combat], String.raw`
local hero,build,units=NewCombat('chainlightning')
build.stats.weapons.chainlightning.targets=4
local targets={EnemyAt(units,100,0,false),EnemyAt(units,200,0,true),EnemyAt(units,300,0,false)}
EnemyAt(units,2000,0,false);targets[1].life=10
SurvivorCombat.CastChainLightning()
assert(#hits==3 and #actors==6,'One beam and one impact for each distinct target in reach')
local impacts,beams={},{}
for _,actor in ipairs(actors)do
    if actor.identifier=='hsChainHit'then impacts[#impacts+1]=actor else beams[#beams+1]=actor end
end
for i,target in ipairs(targets)do
    assert(hits[i].unit==target and math.abs(hits[i].damage-build.stats.weapons.chainlightning.damage*SurvivorConfig.chainFalloff^(i-1))<.00001)
    local tx,ty=GetUnitX(target),GetUnitY(target)
    assert(impacts[i].visual.unit==nil and impacts[i].visual.x==tx and impacts[i].visual.y==ty and impacts[i].visual.z==impacts[i].z
        and impacts[i].visual.model==SurvivorConfig.chainHitModel and impacts[i].visual.scale==SurvivorConfig.chainHitScale and impacts[i].visual.scale<1
        and impacts[i].visual.alpha==255,'Ground, flying and lethally hit units all receive a bright unscaled impact at the body')
end
local impact=impacts[2];local life=impact.life
state='CHOOSING';impact.selfInteractions(impact);assert(impact.life==life)
state='RUNNING';CombatRun().warningUntil=10
SurvivorCombat.UpdateStatus(.02)
for _,entry in ipairs(impacts)do assert(entry.visual.alpha==110)end
now=11;SurvivorCombat.UpdateStatus(.02)
for _,entry in ipairs(impacts)do
    assert(entry.visual.alpha==255)
    local visual=entry.visual
    for _=1,30 do if not entry.cleaned then entry.selfInteractions(entry)end end
    assert(entry.cleaned and visual.destroyed and entry.target==nil,'Expiration releases effects and target references')
end
SurvivorCombat.Cleanup()
for _,entry in ipairs(beams)do assert(entry.cleaned and entry.lightning==nil)end
`);

suite('shadow escape blinks through walkable routes, protects once per stage, releases native invulnerability and survives presentation failures', mocks + String.raw`
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
    CombatRun().damageTrigger.action()
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
local shell=CombatRun().escapeEffect
local x,y=hero.x,hero.y
assert(Receive(hero,source,1000)==0 and hero.life==300 and hero.x==x and hero.y==y and #actors==2)
state='CHOOSING';SurvivorCombat.UpdateStatus(10)
assert(hero.invulnerable and select(2,SurvivorCombat.EscapeStatus())==2.5 and not shell.destroyed)
state='RUNNING';now=2.49;SurvivorCombat.UpdateStatus(.02);assert(hero.invulnerable)
now=2.5;SurvivorCombat.UpdateStatus(.02)
assert(not hero.invulnerable and shell.destroyed and select(2,SurvivorCombat.EscapeStatus())==0)
assert(Receive(hero,source,400)==400 and select(3,SurvivorCombat.EscapeStatus())==1,
    'The spent escape cannot trigger again in the same stage')
SurvivorCombat.BeginStage(2,now);assert(SurvivorCombat.EscapeStatus())
hero.life=100;assert(Receive(hero,nil,100)==0 and hero.invulnerable and SurvivorCombat.StageEscapeUses(2)==1)
SurvivorCombat.BeginStage(3,now);assert(not hero.invulnerable and SurvivorCombat.EscapeStatus())
-- The escape's cue and line are presentation inside the hit loop: a failure is
-- reported once each but never defers a run teardown or undoes the escape.
local say,cue,oldPrint,printed=SurvivorUI.Say,SurvivorUI.Cue,print,{}
SurvivorUI.Say=function()error('injected speech failure')end
SurvivorUI.Cue=function()error('injected cue failure')end
print=function(message)printed[#printed+1]=tostring(message)end
hero.life=100
local dealt=Receive(hero,source,100)
print,SurvivorUI.Say,SurvivorUI.Cue=oldPrint,say,cue
assert(dealt==0 and hero.invulnerable and SurvivorCombat.StageEscapeUses(3)==1 and RunSession.IsRunning(),
    'A presentation failure keeps the applied escape and the run')
local log=table.concat(printed,'\n')
assert(#printed==2 and log:find('injected speech failure') and log:find('injected cue failure'),
    'Each presentation failure is reported')
SurvivorCombat.Cleanup()

hero,build,units=NewCombat('firebolt');hero.maxLife,hero.life=1000,100
source=EnemyAt(units,100,0,false)
-- Both distant endpoints are clear; only the route to the left crosses a wall.
IsTerrainPathable=function(x,y)return math.abs(y)>32.001 or (x < -48 and x > -80)end
assert(Receive(hero,source,100)==0 and hero.x>0 and math.abs(hero.y)<.001,
    'Do not blink across an impassable strip into an otherwise clear landing')
SurvivorCombat.Cleanup();assert(not hero.invulnerable)

hero,build,units=NewCombat('firebolt');hero.maxLife,hero.life=1000,100
CombatRun().bounds={minX=-64,maxX=64,minY=-64,maxY=64}
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

-- The escape line belongs to the playing hero.
local said={};SurvivorUI.Say=function(speaker,text)said[#said+1]={speaker,text}end
IsTerrainPathable=function()return false end
hero,build,units=NewCombat('firebolt');hero.maxLife,hero.life=1000,100
assert(Receive(hero,nil,100)==0 and said[1][1]=='안야')
local anyaLine=said[1][2];SurvivorCombat.Cleanup()
hero,build,units=NewCombat('firebolt');hero.maxLife,hero.life=1000,100
hero.id=SurvivorConfig.heroes.putress.unitId
assert(Receive(hero,nil,100)==0 and said[2][1]=='퓨트리스' and said[2][2]~='' and said[2][2]~=anyaLine,
    'Putress speaks its own escape line')
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
    local group=CombatRun().queryGroup
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
    assert(timer.destroyed and not SurvivorCombat.IsClearing())
    if failureKind~='DestroyGroup' then assert(group.destroyed)end
    assert(CombatRun().hero==nil and CombatRun().queryGroup==nil)
    assert(CombatRun().damageTrigger==nil and CombatRun().deathTrigger==nil)
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
local areaHit=Local(SurvivorCombat.CastMonsoon,'AreaHit')
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
SurvivorCombat.UpdateStatus(.02);assert(#hits==hitCount)
state='RUNNING';SurvivorCombat.UpdateStatus(.02)
assert(counters['status.calls']==1 and counters['status.unitChecks']>0)
SurvivorMetrics.Enable(false);SurvivorCombat.Cleanup()
`);

suite('active status tracking skips unaffected units and preserves pause, expiry, ties and frost resets', mocks,
    [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('frostshard')
for i=1,150 do EnemyAt(units,2000+i,0,false)end
local target=EnemyAt(units,100,0,false);local other=EnemyAt(units,120,0,false)
local slow=SurvivorCombatStatus.Slow;local freeze=SurvivorCombatStatus.Freeze
local statuses=Local(SurvivorCombatStatus.Update,'statusUnits')
SurvivorCombat.TrackWeapons({'blizzard','frostshard'})
SurvivorMetrics.Enable(true);SurvivorCombat.UpdateStatus(.02)
local counters=Local(SurvivorMetrics.Report,'counters')
assert(counters['status.unitChecks']==0,'Unaffected enemies must not enter the 50Hz status traversal')
slow(target,.2,1,'blizzard');slow(target,.2,2,'frostshard');assert(freeze(target,.6))
slow(other,.4,.8,'frostshard')
now=.5;SurvivorCombat.UpdateStatus(.1)
assert(counters['status.unitChecks']==2 and target.paused and target.speed==176)
local ledger=CombatRun().damageTotals
assert(ledger.blizzard.slowSeconds==.1 and ledger.frostshard.slowSeconds==.1,'Equal slows credit the lexical source once per target')
state='INVENTORY';local checks=counters['status.unitChecks'];SurvivorCombat.UpdateStatus(.1)
assert(counters['status.unitChecks']==checks and ledger.blizzard.slowSeconds==.1 and target.paused)
state='RUNNING';now=.8;SurvivorCombat.UpdateStatus(.1)
assert(not target.paused and other.speed==220 and statuses[other]==nil)
now=1;SurvivorCombat.UpdateStatus(.1)
assert(math.abs(ledger.frostshard.slowSeconds-.2)<.00001 and target.speed==176)
now=2;SurvivorCombat.UpdateStatus(.1)
assert(target.speed==220 and target.speed==units[target].baseSpeed and statuses[target]==nil and next(statuses)==nil)
build.stats.sets.frost=true;now=3;slow(target,.3,2,'frostshard')
local setHit=SurvivorCombatSets.SetHit;setHit(target,10,'frostshard')
assert(units[target].frostHits==1 and statuses[target])
build.stats.sets.frost=false;SurvivorCombat.UpdateStatus(.02);assert(units[target].frostHits==0)
now=5;SurvivorCombat.UpdateStatus(.02);assert(next(statuses)==nil)
slow(other,.2,3,'blizzard');GetTriggerUnit=function()return other end
for _,trigger in ipairs(triggers)do if trigger.event=='death' and not trigger.destroyed then trigger.action()end end
assert(statuses[other]==nil,'Deaths detach active status ownership immediately')
SurvivorCombat.Cleanup();SurvivorMetrics.Enable(false)
hero,build,units=NewCombat('frostshard');assert(next(Local(SurvivorCombatStatus.Update,'statusUnits'))==nil)
SurvivorCombat.Cleanup()
`);

suite('enemy status colors prioritize slow, poison and curse, compose with time stop and restore without repeated writes', mocks + String.raw`
function GetTriggerUnit()return eventUnit end
`, [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('plaguedart')
local target=EnemyAt(units,100,0,false)
local boss=EnemyAt(units,120,0,false);units[boss].boss=true
for _,u in ipairs({target,boss})do units[u].baseColor={210,150,90,220}end
local apply=SurvivorCombatStatus.Apply
local slow=SurvivorCombatStatus.Slow
local freeze=SurvivorCombatStatus.Freeze
local statuses=Local(SurvivorCombatStatus.Update,'statusUnits')
local function Color(u,r,g,b,a)
    assert(u.color[1]==r and u.color[2]==g and u.color[3]==b and u.color[4]==a,
        'Unexpected RGB/alpha: '..table.concat(u.color,','))
end
SurvivorConfig.status.curseDuration=6
apply(target,'plaguedart',{curse=1},1);Color(target,198,144,180,220)
assert(statuses[target],'Curse-only targets must stay tracked until their color expires')
apply(target,'plaguedart',{poison=2},1);Color(target,162,198,108,220)
slow(target,.3,1,'frostshard');Color(target,144,165,189,220)
local writes=target.colorWrites
for i=1,10 do SurvivorCombat.UpdateStatus(.02)end
assert(target.colorWrites==writes,'Unchanged status colors do not repeat native writes')
state='INVENTORY';SurvivorCombat.UpdateStatus(.02);Color(target,144,165,189,220)
state='RUNNING';now=1;SurvivorCombat.UpdateStatus(.02);Color(target,162,198,108,220)
now=4;SurvivorCombat.UpdateStatus(.02);Color(target,198,144,180,220)
assert(statuses[target] and units[target].poison==0)
now=6;SurvivorCombat.UpdateStatus(.02);Color(target,210,150,90,220)
assert(statuses[target]==nil)
-- Full poison consumption must remove green immediately, before the next update.
now=7;apply(target,'plaguedart',{poison=2},1);Color(target,162,198,108,220)
apply(target,'plaguedart',{reaction=1,reactionAll=true},1);Color(target,210,150,90,220)
-- Time stop dims the selected state, and its expiry restores the still-active state.
now=8;slow(target,.3,20,'frostshard');SurvivorCombat.StopTime()
Color(target,64,74,85,220)
apply(boss,'plaguedart',{curse=1},1);Color(boss,89,64,81,220)
apply(boss,'plaguedart',{poison=1},1);Color(boss,72,89,48,220)
assert(freeze(boss,.3));Color(boss,64,74,85,220)
now=8.35;SurvivorCombat.UpdateStatus(.02);Color(boss,72,89,48,220)
now=12;SurvivorCombat.UpdateStatus(.02);Color(boss,89,64,81,220)
now=14;SurvivorCombat.UpdateStatus(.02);Color(boss,94,67,40,220)
now=16;SurvivorCombat.UpdateStatus(.02);Color(target,144,165,189,220);Color(boss,210,150,90,220)
-- A corpse loses status tint immediately; cleanup/retry does not retain status owners.
eventUnit=target
for _,trigger in ipairs(triggers)do if trigger.event=='death' and not trigger.destroyed then trigger.action()end end
Color(target,210,150,90,220);assert(statuses[target]==nil)
apply(boss,'plaguedart',{curse=1},1);Color(boss,198,144,180,220)
SurvivorCombat.ClearBattlefield();Color(boss,210,150,90,220)
assert(next(statuses)==nil)
SurvivorCombat.Cleanup()
hero,build,units=NewCombat('plaguedart')
assert(next(Local(SurvivorCombatStatus.Update,'statusUnits'))==nil)
SurvivorCombat.Cleanup()
`);

suite('passive frost stacks preserve accumulation without polling expired states and clear on unequip or death', mocks,
    [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('frostshard');build.stats.sets.frost=true
local target=EnemyAt(units,100,0,false)
local slow=SurvivorCombatStatus.Slow;local setHit=SurvivorCombatSets.SetHit
local statuses=Local(SurvivorCombatStatus.Update,'statusUnits');local stacks=Local(SurvivorCombatStatus.Update,'frostStackUnits')
slow(target,.3,2,'frostshard');setHit(target,10,'frostshard');now=3;SurvivorCombat.UpdateStatus(.02)
assert(units[target].slows==nil and statuses[target]==nil and units[target].frostHits==1 and stacks[target])
SurvivorMetrics.Enable(true);for i=1,1500 do now=now+.02;SurvivorCombat.UpdateStatus(.02)end
assert(Local(SurvivorMetrics.Report,'counters')['status.unitChecks']==0)
slow(target,.3,2,'frostshard');setHit(target,10,'frostshard');assert(units[target].frostHits==2)
now=now+3;SurvivorCombat.UpdateStatus(.02);assert(statuses[target]==nil and stacks[target])
build.stats.sets.frost=false;SurvivorCombat.UpdateStatus(.02);assert(units[target].frostHits==0 and next(stacks)==nil)
build.stats.sets.frost=true;slow(target,.3,2,'frostshard');setHit(target,10,'frostshard');assert(units[target].frostHits==1)
GetTriggerUnit=function()return target end
for _,t in ipairs(triggers)do if t.event=='death' and not t.destroyed then t.action()end end
assert(stacks[target]==nil and statuses[target]==nil);SurvivorCombat.Cleanup()
assert(next(Local(SurvivorCombatStatus.Update,'frostStackUnits'))==nil)
SurvivorMetrics.Enable(false)
print('  expired frost: 1500 updates, 0 status unit checks')
`);

suite('secondary range queries preserve damage and random order and choose cached nearest shards', mocks + String.raw`
function GetRandomInt(a,b)randomBounds[#randomBounds+1]=b;return b end
`, [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('frostnova')
local first=EnemyAt(units,100,0,false);local tie=EnemyAt(units,-100,0,false)
local edge=EnemyAt(units,200,0,true);local far=EnemyAt(units,2500,0,false)
build.stats.weapons.frostnova.range=200;randomBounds={}
local expected={};for u,record in pairs(units)do if record.enemy and u.x*u.x+u.y*u.y<=200^2 then expected[#expected+1]=u end end
SurvivorCombat.CastExtra('frostnova')
assert(#randomBounds==#expected);for i,b in ipairs(randomBounds)do assert(i==b,'Reservoir random bounds must retain the original units order')end
local nova;for _,a in ipairs(actors)do if a.identifier=='hsNova' then nova=a end end
assert(nova.x==expected[1].x and nova.y==expected[1].y,'Preserve the random-selected target in table order')
build.stats.sets.ember=true;hits={}
local expire=SurvivorCombatSets.ExpireEmber
local nested=false;local areaHit=Local(SurvivorCombat.CastMonsoon,'AreaHit')
onDamage=function()if not nested then nested=true;areaHit({x=far.x,y=far.y,z=60,radius=1,weapon='meteor',slow=0},1)end end
expire({x=0,y=0,z=0,radius=200,damage=5,weapon='flamefield'});onDamage=nil
local outer={};for _,hit in ipairs(hits)do if hit.damage==10 then outer[#outer+1]=hit.unit end end
local groundExpected={};for _,u in ipairs(expected)do if not u.flying then groundExpected[#groundExpected+1]=u end end
assert(#outer==#groundExpected);for i,u in ipairs(outer)do assert(u==groundExpected[i],'Secondary nested queries preserve the outer damage order')end
SurvivorCombat.Cleanup()
hero,build,units=NewCombat('frostshard');build.stats.weapons.frostshard.evolution='shatter'
build.stats.weapons.frostshard.modeValues=SurvivorAugments.Get('frostshard_glacier').modeValues
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
local hero,build,units=NewCombat('firebolt');build.stats.weapons.firebolt.evolution='burst'
build.stats.weapons.firebolt.modeValues=SurvivorAugments.Get('firebolt_burst').modeValues;build.stats.weapons.firebolt.count=1
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
assert(#hits==13 and hits[1].unit==primary and hits[1].damage==build.stats.weapons.firebolt.damage)
for i=1,12 do assert(hits[i+1].unit==nearby[i] and hits[i+1].damage==build.stats.weapons.firebolt.damage*.30,
    'Explosion must retain handle order after a reversed native candidate enumeration')end
assert(primary.life==100000-build.stats.weapons.firebolt.damage,'The primary is excluded from secondary explosion damage')
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

suite('meteor deals one impact with a cosmetic explosion and never creates lingering damage', mocks,
    [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('meteor')
local target=EnemyAt(units,100,0,false)
SurvivorCombat.CastWeapon('meteor')
local meteor=actors[#actors]
assert(meteor.identifier=='hsMeteor' and meteor.visual.model==SurvivorConfig.meteorModel)
local w=meteor.profile
meteor.life=.001;meteor.selfInteractions(meteor)
local impact=actors[#actors]
assert(meteor.cleaned and impact.weapon=='meteor' and impact.identifier=='hsMeteorImpact'
    and impact.visual.model==[[Objects\Spawnmodels\Other\NeutralBuildingExplosion\NeutralBuildingExplosion.mdl]])
assert(impact.damage==nil and impact.life==.6)
assert(#hits==1 and hits[1].damage==w.damage,'Landing still deals its full impact damage')
state='CHOOSING';local life=impact.life;impact.selfInteractions(impact);assert(impact.life==life and #hits==1)
state='RUNNING'
for _=1,40 do if not impact.cleaned then impact.selfInteractions(impact)end end
assert(impact.cleaned and #hits==1,'The impact visual expires without any extra hits')
for _,actor in ipairs(actors)do assert(actor.identifier~='hsExtraZone','Meteor must not register a zone')end
Local(SurvivorConfig.weaponEngines.field.cast,'NewZone')('flamefield',0,0,w,w.damage)
assert(actors[#actors].visual.model==SurvivorConfig.zoneModel,'Other flame zones retain their own effect')
SurvivorCombat.Cleanup()
`);

suite('both cone weapons aim at the nearest eligible enemy, fall back to facing and lock the cast direction', mocks,
    [config,metrics,augments,combat], String.raw`
for _,weapon in ipairs({'frontslash','corrosion'})do
    local hero,build,units=NewCombat(weapon)
    local function Cast()
        SurvivorCombat.CastWeapon(weapon)
        local area,visual
        for _,actor in ipairs(actors)do
            if actor.identifier=='hsSlashArea'then area=actor end
            if actor.identifier=='hsSlash'or actor.identifier=='hsBreath'then visual=actor end
        end
        assert(area and area.weapon==weapon,weapon..' produced '..tostring(area and area.weapon)..' across '..#actors..' actors')
        assert(visual and visual.facing==area.facing,'Visual and hit cone share one direction')
        return area
    end
    hero.facing=90
    local view=build.stats.weapons[weapon]
    view.duration=.5 -- Exercise the lingering variant as well as its immediate hit.
    local radius=view.range
    local far=EnemyAt(units,radius+100,0,false)
    local area=Cast();assert(math.abs(area.facing-math.pi/2)<1e-9 and #hits==0,'No close enemy: retain facing')
    local dead=EnemyAt(units,1,0,false);dead.life=0
    local flying=EnemyAt(units,2,0,true)
    local prop=CreateUnit(24,'hsBC',3,0,0);units[prop]={bonus=true,alive=true}
    area=Cast();assert(math.abs(area.facing-math.pi/2)<1e-9,'Dead, flying and bonus actors cannot redirect ground cones')
    local target=EnemyAt(units,-50,0,false)
    local other=EnemyAt(units,0,100,false)
    local before=#hits
    area=Cast();assert(math.abs(math.abs(area.facing)-math.pi)<1e-9 and #hits==before+1 and hits[#hits].unit==target,
        'A nearby enemy behind the hero takes priority over current facing and farther targets')
    local facing=area.facing
    target.x,target.y=50,0;hero.facing=0
    area.selfInteractions(area)
    assert(area.facing==facing and #hits==before+1,'A lingering cone never retargets or hits the same target twice')
    state='CHOOSING';local count=#actors;SurvivorCombat.CastWeapon(weapon);assert(#actors==count)
    state='RUNNING';SurvivorCombat.Cleanup()
end
`);

suite('weapon tags match delivery types and meteor growth and evolutions describe impact only', mocks,
    [config,metrics,augments], String.raw`
local melee={orbitblade=true,frontslash=true,wraithguard=true,corrosion=true}
local counts,total={},0
for id,weapon in pairs(SurvivorConfig.weapons)do
    total=total+1
    local text=SurvivorAugments.WeaponTags(id)
    local seen={}
    for _,tag in ipairs(weapon.tags)do
        assert(not seen[tag] and tag~='회전' and tag~='전방');seen[tag]=true
        counts[weapon.hero]=counts[weapon.hero] or {};counts[weapon.hero][tag]=(counts[weapon.hero][tag] or 0)+1
        assert(text:find('['..tag..']',1,true))
    end
    assert((seen['근접']==true)==(melee[id]==true))
    assert(not seen['투사체'],'Broad projectile tag is replaced by homing/piercing roles')
    local build=SurvivorAugments.NewBuild(id,nil,weapon.hero)
    assert(SurvivorAugments.Description(id):find(text,1,true)==1)
    assert(SurvivorAugments.OwnedTooltip(id,build):find(text,1,true)==1)
end
assert(total==28)
for _,hero in ipairs({'anya','putress'})do
    local categories=0;for _,count in pairs(counts[hero])do assert(count==2);categories=categories+1 end
    assert(categories==8,'Every hero has eight attack tags, each shared by exactly two weapons')
end
local build=SurvivorAugments.NewBuild('meteor')
for level=1,7 do
    build.levels.meteor=level;SurvivorAugments.Recalculate(build)
    local text=SurvivorAugments.OwnedTooltip('meteor',build)
    assert(text:find('[낙하]',1,true) and not text:find('[장판]',1,true))
    assert(not text:find('잔불',1,true) and not text:find('지속 시간',1,true))
    if level<7 then local preview=SurvivorAugments.Preview('meteor',build);assert(not preview:find('지속',1,true))end
end
local base=build.stats.weapons.meteor.damage
for _,evolution in ipairs({'meteor_cataclysm','meteor_crater'})do
    build.evolutions.meteor=evolution;SurvivorAugments.Recalculate(build)
    local text=SurvivorAugments.OwnedTooltip('meteor',build)
    assert(not text:find('잔불',1,true) and not text:find('지속 시간',1,true))
    assert(math.abs(build.stats.weapons.meteor.damage-base*(evolution=='meteor_cataclysm'and 1.8 or 1.4))<1e-9)
end
`);

suite('summons grow through seven levels, stay capped, attack for their owner and clean across pause and restart', mocks + String.raw`
function SetUnitVertexColor()end
`, [config,metrics,augments,combat,'src/30_gameplay/SurvivorNativeLoadout.lua'], String.raw`
local ids={banshee='HsWP',shadowarcher='HsWQ',plaguezombie='HsWR',experiment='HsWS'}
for weapon,raw in pairs(ids)do
    local hero,build,units=NewCombat(weapon)
    local other=build.hero=='anya'and SurvivorAugments.NewBuild('plaguedart',nil,'putress')or SurvivorAugments.NewBuild('firebolt',nil,'anya')
    assert(not SurvivorAugments.CanChoose(weapon,other),'Summons stay in their owning hero growth pool')
    SurvivorNativeLoadout.Init(hero,build)
    for level=1,7 do
        if level>1 then SurvivorAugments.Apply(weapon,build,hero);SurvivorNativeLoadout.Refresh()end
        local tooltip=BlzGetAbilityExtendedTooltip(raw,level-1)
        assert(tooltip==SurvivorAugments.OwnedTooltip(weapon,build):gsub('\n','|n'))
        assert(tooltip:find('[소환]',1,true) and tooltip:find('소환 수',1,true) and tooltip:find('공격 간격',1,true))
    end
    local target=EnemyAt(units,70,0,false)
    local flying=weapon=='experiment'and EnemyAt(units,75,0,true)or nil
    local w=build.stats.weapons[weapon]
    local function Helpers()
        local list={};for _,actor in ipairs(actors)do if actor.summon and not actor.cleaned then list[#list+1]=actor end end;return list
    end
    SurvivorCombat.CastWeapon(weapon)
    assert(#Helpers()==math.min(w.cap,w.count) and #world==(flying and 3 or 2),'Summons use collision-free model actors, never native blocking units')
    for _=1,20 do SurvivorCombat.CastWeapon(weapon)end
    assert(#Helpers()==math.min(w.cap,w.count),'Repeated casts refresh helpers without exceeding their cap')
    for step=1,130 do
        now=now+.02
        local list={};for _,actor in ipairs(actors)do list[#list+1]=actor end
        for _,actor in ipairs(list)do if not actor.cleaned and actor.selfInteractions then actor.selfInteractions(actor)end end
    end
    assert(#hits>0 and SurvivorCombat.DamageRows({weapon})[1].damage>0,'Summon damage is attributed to its weapon: '..weapon)
    if flying then assert(flying.life==flying.maxLife,'A ground-only experimental slam cannot hit flying enemies')end
    if weapon=='banshee'then assert(units[target].slowAmount>0)end
    if weapon=='plaguezombie'then assert((units[target].poison or 0)>0)end
    local helper=Helpers()[1];assert(helper)
    state='CHOOSING';local x,y,life=helper.x,helper.y,helper.life;local before=#hits
    for _=1,20 do helper.selfInteractions(helper)end
    assert(helper.x==x and helper.y==y and helper.life==life and #hits==before)
    state='RUNNING';SurvivorCombat.StopTime();assert(target.paused)
    helper.selfInteractions(helper);assert(helper.life<life,'Friendly summons continue during enemy time stop')
    build.stats.multiCount,build.stats.multiDamage=3,.4
    SurvivorCombat.CastWeapon(weapon)
    local count=#Helpers()
    local extra={};for _,actor in ipairs(actors)do if actor.identifier=='hsExtraAttack'and not actor.cleaned then extra[#extra+1]=actor end end
    assert(#extra==3)
    for _,actor in ipairs(extra)do actor.life=.001;actor.selfInteractions(actor)end
    assert(#Helpers()==count,'Multicast adds helper attacks instead of bypassing the summon cap')
    for _,actor in ipairs(Helpers())do actor.life=.001;actor.selfInteractions(actor);actor.selfInteractions(actor)end
    -- The expiry boundary permits one final update, then releases exactly once.
    for _,actor in ipairs(Helpers())do actor.selfInteractions(actor)end
    assert(#Helpers()==0)
    SurvivorCombat.CastWeapon(weapon);assert(#Helpers()==math.min(w.cap,w.count),'Expired summon slots can be reused')
    SurvivorCombat.ClearBattlefield();assert(#Helpers()==0)
    SurvivorCombat.CastWeapon(weapon);assert(#Helpers()==math.min(w.cap,w.count))
    SurvivorNativeLoadout.Cleanup();SurvivorCombat.Cleanup();assert(#Helpers()==0)
    for _,actor in ipairs(actors)do if actor.summon then assert(actor.cleaned and actor.visual==nil)end end
end
for _,weapon in ipairs({'banshee','shadowarcher','plaguezombie','experiment'})do for _,id in ipairs(SurvivorAugments.Evolutions(weapon))do
    local entry=SurvivorAugments.Get(id)
    local build=SurvivorAugments.NewBuild(entry.weapon,nil,SurvivorConfig.weapons[entry.weapon].hero)
    build.levels[entry.weapon]=7;SurvivorAugments.Recalculate(build)
    assert(SurvivorAugments.CanChoose(id,build));SurvivorAugments.Apply(id,build)
    assert(SurvivorAugments.OwnedTooltip(entry.weapon,build):find(entry.text,1,true))
    local w=build.stats.weapons[entry.weapon];assert(w.count<=w.cap and w.damage>0 and w.pulse>0)
end end
`);

suite('tag-set explosions and falling attacks have bounded cooldowns and never retrigger sets or status', mocks,
    [config,metrics,augments,combat], String.raw`
for _,weapon in ipairs({'frostnova','meteor','catalyst','plaguejar'})do
    local hero,build,units=NewCombat(weapon);build.stats.sets.destroyer=true
    local target=EnemyAt(units,100,0,false);local nearby=EnemyAt(units,120,0,false)
    local rawHit=Local(SurvivorCombat.FireMissile,'Hit')
    local function hit(target,damage,id)rawHit(target,damage,id,nil,nil,1,{poison=0,curse=0,reaction=0})end
    units[target].curse,units[target].curseUntil=3,10
    for _=1,3 do hit(target,100,weapon)end
    assert(#hits==5 and math.abs(100000-nearby.life-40)<1e-8,'Exactly one small explosion after three direct hits: '..weapon)
    local record=Local(SurvivorCombatSets.SetHit,'tagState')
    assert(record.burstHits==0 and record.burstReady==2,'Secondary explosion damage does not count toward another proc')
    assert(not units[nearby].poison and not units[nearby].curse,'Set explosions do not apply status or reactions')
    local expected=100000-3*124-40*1.24
    assert(math.abs(target.life-expected)<1e-7,'Each victim receives its own curse amplification exactly once')
    for _=1,6 do hit(target,100,weapon)end;assert(nearby.life==99960,'Cooldown bounds dense area hits')
    now=2;hit(target,100,weapon);assert(nearby.life==99920)
    local before=nearby.life;state='CHOOSING';hit(target,100,weapon);assert(nearby.life==before)
    state='RUNNING';SurvivorCombat.BeginStage(2,now)
    assert(Local(SurvivorCombatSets.SetHit,'tagState').burstHits==0)
    SurvivorCombat.Cleanup()
end
for _,weapon in ipairs({'meteor','monsoon','plaguejar','acidvials'})do
    local hero,build,units=NewCombat(weapon)
    build.stats.sets.bombardier,build.stats.sets.destroyer,build.stats.sets.storm=true,true,true
    local target=EnemyAt(units,100,0,false)
    local function Extras()
        local list={};for _,a in ipairs(actors)do if a.setProc and not a.cleaned then list[#list+1]=a end end;return list
    end
    for _=1,3 do SurvivorCombat.CastWeapon(weapon)end;assert(#Extras()==0)
    SurvivorCombat.CastWeapon(weapon);assert(#Extras()==1,'Every four primary casts includes non-default engines: '..weapon)
    local extra=Extras()[1];local x,y,life=extra.x,extra.y,extra.life
    state='CHOOSING';extra.selfInteractions(extra);assert(extra.life==life)
    state='RUNNING';target.x=130
    repeat extra.selfInteractions(extra)until extra.cleaned
    local damage=build.stats.weapons[weapon].damage
    assert(#hits==1 and math.abs(hits[1].damage-damage*.4)<1e-8,'Extra falling damage resolves once, without normal payloads')
    assert(extra.x==x and extra.y==y,'The extra payload does not follow a moving target')
    local counters=Local(SurvivorCombatSets.SetHit,'tagState')
    assert(counters.fall[weapon].hits==0 and counters.burstHits==0,'The extra landing never chains into other set effects')
    for _=1,4 do SurvivorCombat.CastWeapon(weapon)end;assert(#Extras()==0,'Four-second cooldown')
    now=4;SurvivorCombat.CastWeapon(weapon);assert(#Extras()==1)
    extra=Extras()[1];build.stats.sets.bombardier=false
    local before=#hits;repeat extra.selfInteractions(extra)until extra.cleaned
    assert(#hits==before,'Removing the set cancels a pending set landing')
    SurvivorCombat.BeginStage(2,now);assert(next(Local(SurvivorCombatSets.SetHit,'tagState').fall)==nil)
    SurvivorCombat.Cleanup()
end
`);

suite('tag-set kills award normal kill rewards without triggering death-based set chains', mocks + String.raw`
function GetTriggerUnit()return eventUnit end
function onDamage(unit)
    if unit.life<=0 then
        eventUnit=unit
        for _,trigger in ipairs(triggers)do if not trigger.destroyed and trigger.event=='death'then trigger.action()end end
    end
end
`, [config,metrics,augments,combat], String.raw`
for _,kind in ipairs({'destroyer','bombardier','conductor'})do
    local weapon=kind=='conductor'and'soulchain'or'plaguejar'
    local hero,build,units=NewCombat(weapon)
    build.stats.sets[kind],build.stats.sets.gravewarden,build.stats.sets.apothecary=true,true,true
    local primary=EnemyAt(units,100,0,false)
    local doomed=EnemyAt(units,120,0,false);doomed.life=10
    units[doomed].poison,units[doomed].poisonUntil,units[doomed].poisonWeapon=8,10,'plaguejar'
    units[doomed].curse,units[doomed].curseUntil=3,10
    local outside=EnemyAt(units,280,0,false)
    local kills=0;CombatRun().onKill=function()kills=kills+1 end
    if kind=='destroyer'then
        local hit=Local(SurvivorCombat.FireMissile,'Hit')
        for _=1,3 do hit(primary,100,'plaguejar',nil,nil,1,{poison=0,curse=0,reaction=0})end
    elseif kind=='bombardier'then
        local cast=SurvivorCombatSets.RecordFallingCast
        for _=1,4 do cast('plaguejar',100,0,0,100,200,SurvivorConfig.meteorModel,.5)end
        local extra;for _,a in ipairs(actors)do if a.setProc then extra=a end end
        assert(extra);repeat extra.selfInteractions(extra)until extra.cleaned
    else
        SurvivorCombatSets.RelayEnd(weapon,doomed,100)
    end
    assert(kills==1 and not units[doomed].alive,'Set kills retain the normal XP/loot callback')
    assert(outside.life==100000 and not units[outside].poison and not units[outside].curse,
        'No poison spread or soul explosion from a tagged set kill: '..kind)
    SurvivorCombat.Cleanup()
end
`);

suite('summon set counts real attacks and piercing set scales unique victims in travel order', mocks,
    [config,metrics,augments,combat], String.raw`
for _,weapon in ipairs({'banshee','shadowarcher','plaguezombie','experiment'})do
    local hero,build,units=NewCombat(weapon);build.stats.sets.commander=true
    local target=EnemyAt(units,60,0,false);local w=build.stats.weapons[weapon]
    SurvivorCombat.CastWeapon(weapon)
    local summon;for _,a in ipairs(actors)do if a.summon then summon=a;break end end
    summon.x,summon.y=60,0
    local attack=Local(SurvivorConfig.weaponEngines.summon.cast,'SummonAttack')
    local function Attack(damage,scale)
        local before=#actors;assert(attack(summon,w,damage,scale))
        for i=before+1,#actors do local a=actors[i];if a.identifier=='hsSummonArrow'then a.speed=50000;a.selfInteractions(a)end end
    end
    for i=1,6 do Attack(w.damage,1);assert(hits[#hits].damage==w.damage*(i==6 and 2 or 1),weapon)end
    local counter=Local(SurvivorCombatSets.SetHit,'tagState').summon[weapon]
    Attack(w.damage*.5,.5);assert(counter.hits==0,'Multicast helpers do not charge the reinforced attack')
    for _=1,6 do Attack(w.damage,1)end;assert(hits[#hits].damage==w.damage,'Reinforcement has a cooldown')
    now=2;Attack(w.damage,1);assert(hits[#hits].damage==w.damage*2)
    local life=summon.life;state='CHOOSING';summon.selfInteractions(summon);assert(summon.life==life)
    state='RUNNING';SurvivorCombat.BeginStage(2,now);assert(next(Local(SurvivorCombatSets.SetHit,'tagState').summon)==nil)
    SurvivorCombat.Cleanup()
end
for _,weapon in ipairs({'frostshard','plaguedart','returnblade','shadowscythe'})do
    local hero,build,units=NewCombat(weapon)
    build.levels[weapon]=7;SurvivorAugments.Recalculate(build,hero);build.stats.sets.tracker=true
    local targets={};for i=1,5 do targets[i]=EnemyAt(units,i*100,0,false)end
    local enumerate=GroupEnumUnitsInRange
    function GroupEnumUnitsInRange(group,...)
        enumerate(group,...);local reverse={};for i=#group,1,-1 do reverse[#reverse+1]=group[i]end
        for i=1,#group do group[i]=reverse[i]end
    end
    SurvivorCombat.CastWeapon(weapon)
    local object;for _,a in ipairs(actors)do if a.identifier=='hsFrostShard'or a.identifier=='hsReturnBlade'or a.identifier=='hsScythe'then object=a;break end end
    assert(object);local damage=object.damage
    object.x,object.y,object.z,object.dx,object.dy,object.dz,object.speed,object.remaining=0,0,60,1,0,0,30000,600
    object.selfInteractions(object);GroupEnumUnitsInRange=enumerate
    assert(#hits==5,'Five enemies crossed by one projectile: '..weapon)
    for i=1,5 do assert(hits[i].unit==targets[i]and math.abs(hits[i].damage-damage*(1+math.min(3,i-1)*.2))<1e-7,'Travel order and capped damage: '..weapon)end
    local pierce=SurvivorCombatSets.PierceDamage
    local extra={weapon=weapon,tagExtra=true};assert(pierce(extra,targets[1],100)==100 and not extra.pierceCount)
    local repeated={weapon=weapon};assert(pierce(repeated,targets[1],100)==100 and pierce(repeated,targets[1],100)==100 and repeated.pierceCount==1)
    SurvivorCombat.Cleanup()
end
`);

suite('pursuer homing bonus uses actual chase time, pauses and excludes extra attacks for both engines', mocks,
    [config,metrics,augments,combat], String.raw`
local function Find()for _,a in ipairs(actors)do if a.identifier=='hsMissile'or a.identifier=='hsOrb'then return a end end end
for _,weapon in ipairs({'firebolt','deathcoil','thunderorb','boilingflask'})do
    for _,distance in ipairs({10,600})do
        local hero,build,units=NewCombat(weapon);build.stats.sets.pursuer=true
        EnemyAt(units,distance,0,false);SurvivorCombat.CastWeapon(weapon)
        local object=assert(Find());local damage,life=object.damage,object.life
        state='CHOOSING';for _=1,40 do object.selfInteractions(object)end
        assert(object.life==life and (object.flightAge or 0)==0,'Menus do not charge chase time')
        state='RUNNING'
        local steps=0;while #hits==0 and not object.cleaned and steps<400 do object.selfInteractions(object);steps=steps+1 end
        assert(#hits>0 and math.abs(hits[1].damage-damage*(distance==600 and 1.4 or 1))<1e-8,'Long chase bonus and close-range baseline: '..weapon)
        SurvivorCombat.Cleanup()
    end
    local hero,build,units=NewCombat(weapon);build.stats.sets.pursuer=true;EnemyAt(units,10,0,false)
    local engine=SurvivorConfig.weaponEngines[SurvivorConfig.weapons[weapon].engine]
    if engine.profile then SurvivorCombat.CastExtra(weapon,{weapon=build.stats.weapons[weapon],index=1})
    else SurvivorCombat.FireMissile({weapon=build.stats.weapons[weapon],index=1})end
    local object=assert(Find());object.flightAge=.6
    if object.identifier=='hsOrb'then object.pulseClock=object.pulse end
    object.selfInteractions(object)
    assert(#hits>0 and hits[1].damage==object.damage and object.tagExtra,'Additional attacks cannot receive the chase bonus')
    SurvivorCombat.Cleanup()
end
`);

suite('bulwark reduces incoming damage after melee hits without stacking and respects shields, pause and expiry', mocks + String.raw`
function BlzIsUnitInvulnerable(u)return u.invulnerable==true end
function SetUnitInvulnerable(u,value)u.invulnerable=value end
function BlzSetEventDamage(value)eventDamage=value end
function GetEventDamage()return eventDamage end
function GetEventDamageSource()return eventSource end
function GetTriggerUnit()return eventTarget end
function Receive(hero,source,damage)
    eventTarget,eventSource,eventDamage=hero,source,damage
    CombatRun().damageTrigger.action();return eventDamage
end
function SurvivorExpedition.RiskActive()return risk==true end
`, [config,metrics,augments,combat], String.raw`
for _,weapon in ipairs({'orbitblade','frontslash','wraithguard','corrosion'})do
    local hero,build,units=NewCombat(weapon);hero.life,hero.maxLife=1000,1000;build.stats.sets.bulwark=true
    local enemy=EnemyAt(units,60,0,false);local hit=Local(SurvivorCombat.FireMissile,'Hit')
    hit(enemy,1,'firebolt');assert(Receive(hero,enemy,100)==100,'Other tags cannot grant melee protection')
    hit(enemy,1,weapon);assert(Receive(hero,enemy,100)==85,weapon)
    now=1;hit(enemy,1,weapon);assert(Receive(hero,enemy,100)==85,'Protection refreshes instead of stacking')
    risk=true;assert(Receive(hero,enemy,100)==106.25);risk=false
    CombatRun().ward=50;CombatRun().wardUntil=10
    assert(Receive(hero,enemy,100)==35,'Apply damage reduction before absorbing the remaining damage with a ward')
    state='CHOOSING';assert(Receive(hero,enemy,100)==0);state='RUNNING'
    assert(Receive(hero,enemy,100)==85)
    now=4;assert(Receive(hero,enemy,100)==100,'The refreshed protection expires after three combat seconds')
    hit(enemy,1,weapon);build.stats.sets.bulwark=false;assert(Receive(hero,enemy,100)==100,'Unequipping removes protection immediately')
    build.stats.sets.bulwark=true;SurvivorCombat.BeginStage(2,now)
    assert(Receive(hero,nil,100)==100,'Stage transitions clear protection')
    SurvivorCombat.Cleanup()
end
`);

suite('mire stacks per zone and enemy, stays capped and excludes additional attacks and residue', mocks,
    [config,metrics,augments,combat], String.raw`
local function Zone()for _,a in ipairs(actors)do if a.identifier=='hsZone'or a.identifier=='hsExtraZone'then return a end end end
for _,weapon in ipairs({'flamefield','plaguetrail','blizzard','plaguepool'})do
    local hero,build,units=NewCombat(weapon);build.stats.sets.mire=true
    local target=EnemyAt(units,10,0,false);SurvivorCombat.CastWeapon(weapon)
    if not Zone()then
        local throw;for _,a in ipairs(actors)do if a.identifier=='hsThrow'then throw=a end end
        assert(throw);for _=1,500 do if not throw.cleaned then throw.selfInteractions(throw)end end
    end
    local zone=assert(Zone());target.x,target.y=zone.x,zone.y
    local area=Local(SurvivorCombat.CastMonsoon,'AreaHit')
    local function Pulse()
        if zone.interactions then zone.interactions.hsEnemy(zone,target)else area(zone,zone.damage)end
    end
    for i=1,8 do Pulse();assert(math.abs(hits[#hits].damage-zone.damage*(1+math.min(5,i-1)*.1))<1e-8,'Per-target ramp and cap: '..weapon)end
    local before=#hits;state='CHOOSING';Pulse();assert(#hits==before);state='RUNNING'
    local ramp=SurvivorCombatSets.ZoneRampDamage
    local separate={weapon=weapon};assert(ramp(separate,target,100)==100,'A new overlapping zone starts from its own baseline')
    local fresh=EnemyAt(units,zone.x,zone.y,false);assert(ramp(zone,fresh,100)==100,'A new enemy starts at baseline')
    assert(ramp({weapon=weapon,tagExtra=true},target,100)==100)
    assert(ramp({weapon=weapon,status={poison=1}},target,100)==100,'Secondary residues cannot gain ramp damage')
    build.stats.sets.mire=false;Pulse();assert(hits[#hits].damage==zone.damage)
    build.stats.sets.mire=true;Pulse();assert(hits[#hits].damage==zone.damage,'Unequipping clears accumulated damage')
    SurvivorCombat.Cleanup()
end
`);

suite('conductor follows chain endpoints and orb transfers, supports bosses and never recursively transfers', mocks,
    [config,metrics,augments,combat], String.raw`
for _,weapon in ipairs({'chainlightning','soulchain'})do
    local hero,build,units=NewCombat(weapon);build.stats.sets.conductor=true
    local targets={};for i=1,3 do targets[i]=EnemyAt(units,i*100,0,false)end
    SurvivorCombat.CastWeapon(weapon);assert(#hits==4 and hits[4].unit==targets[3])
    local curse=units[targets[3]].curse or 0
    assert(math.abs(hits[4].damage-hits[3].damage*.6*(1+curse*SurvivorConfig.status.curseAmp))<1e-8)
    SurvivorCombat.CastWeapon(weapon);assert(#hits==7,'Two-second cooldown is shared by casts of the same weapon')
    now=2;SurvivorCombat.CastWeapon(weapon);assert(#hits==11)
    now=4;SurvivorCombat.CastChainLightning({weapon=build.stats.weapons[weapon],index=1})
    assert(#hits==14,'Additional chain casts do not receive an extra endpoint hit')
    local total=0;for _,hit in ipairs(hits)do total=total+hit.damage end
    assert(math.abs(SurvivorCombat.DamageRows({weapon})[1].damage-total)<1e-7,'All damage belongs to its original weapon')
    SurvivorCombat.BeginStage(2,now);assert(next(Local(SurvivorCombatSets.SetHit,'tagState').relay)==nil)
    local boss=EnemyAt(units,100,0,false);units[boss].boss=true;hits={}
    SurvivorCombat.CastWeapon(weapon);assert(#hits==2 and hits[2].unit==boss,'A single boss is a valid endpoint')
    SurvivorCombat.Cleanup()
end
for _,weapon in ipairs({'thunderorb','boilingflask'})do
    for _,single in ipairs({false,true})do
        local hero,build,units=NewCombat(weapon);build.stats.sets.conductor,build.stats.sets.pursuer=true,true
        local primary=EnemyAt(units,60,0,false);local secondary=not single and EnemyAt(units,220,0,false)
        SurvivorCombat.CastWeapon(weapon)
        local orb;for _,a in ipairs(actors)do if a.identifier=='hsOrb'then orb=a;break end end
        orb.x,orb.y,orb.z,orb.speed,orb.flightAge=60,0,60,0,1
        orb.pulseClock,orb.chainClock=orb.pulse,orb.chainInterval;orb.selfInteractions(orb)
        assert(#hits==(single and 2 or 3),'One bounded endpoint hit per transfer, including a lone target')
        local expected=orb.damage*1.4*(single and 1 or orb.chainFraction)*.6
        assert(hits[#hits].unit==(single and primary or secondary)and math.abs(hits[#hits].damage-expected)<1e-8,
            'Chase amplification is applied once before the transfer and endpoint bonus')
        SurvivorCombat.Cleanup()
    end
end
`);

suite('homing orbs track moving targets and transfer once with their own cooldown', mocks,
    [config,metrics,augments,combat], String.raw`
for _,weapon in ipairs({'thunderorb','boilingflask'})do
    local hero,build,units=NewCombat(weapon)
    local primary=EnemyAt(units,180,0,false)
    local secondary=EnemyAt(units,380,0,false)
    EnemyAt(units,580,0,false)
    SurvivorCombat.CastWeapon(weapon)
    local orb=actors[1];assert(orb.identifier=='hsOrb')
    orb.x,orb.y,orb.z=180,0,60;primary.y=100
    orb.chainClock,orb.pulseClock=orb.chainInterval,orb.pulse
    orb.selfInteractions(orb)
    assert(orb.y>0 and #hits==2 and hits[1].unit==primary and hits[2].unit==secondary)
    assert(math.abs(hits[2].damage-orb.damage*orb.chainFraction)<1e-9,'Transfer damage never starts another transfer')
    orb.pulseClock=orb.pulse;orb.selfInteractions(orb)
    assert(#hits==3 and hits[3].unit==primary,'Orb transfer waits for its separate cooldown')
    state='CHOOSING';local life,y=orb.life,orb.y;orb.selfInteractions(orb);assert(orb.life==life and orb.y==y)
    state='RUNNING';primary.life=0;orb.selfInteractions(orb);assert(orb.target==secondary,'A dead target is replaced')
    SurvivorCombat.Cleanup();assert(orb.cleaned)
end
`);

suite('falling jars and vials lock landing points, pause in the air and leave no damage zones', mocks,
    [config,metrics,augments,combat], String.raw`
for _,weapon in ipairs({'plaguejar','acidvials'})do
    local hero,build,units=NewCombat(weapon);local target=EnemyAt(units,400,0,false)
    SurvivorCombat.CastWeapon(weapon)
    local falling=actors[1];assert(falling.identifier=='hsFallingPayload'and falling.x==400 and falling.y==0)
    local x,y,z,life=falling.x,falling.y,falling.z,falling.life
    state='CHOOSING';falling.selfInteractions(falling);assert(falling.z==z and falling.life==life and #hits==0)
    state='RUNNING';target.x=1000
    for _=1,80 do if not falling.cleaned then falling.selfInteractions(falling);assert(falling.x==x and falling.y==y)end end
    assert(falling.cleaned and #hits==0,'Moving away avoids the locked impact position')
    for _,actor in ipairs(actors)do assert(actor.identifier~='hsExtraZone')end
    SurvivorCombat.Cleanup()
end
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
    assert(#pending==2 and pending[1].shot.weapon==pending[2].shot.weapon)
    local snapshot=pending[1].shot.weapon
    assert(snapshot.sets==nil and snapshot.regeneration==nil and snapshot.weapons==nil and snapshot.weaponId==weapon and snapshot.enabled,
        'Only the selected weapon is copied, without global stats or other weapons')
    local damage=snapshot.damage
    assert(math.abs(damage-build.stats.weapons[weapon].damage*.4)<1e-9 and snapshot.statusScale==.5)
    build.stats.weapons[weapon].damage=99999
    assert(snapshot.damage==damage and snapshot~=build.stats.weapons[weapon])
    for _,actor in ipairs(pending)do actor.life=.001;actor.selfInteractions(actor);assert(actor.cleaned)end
    SurvivorCombat.Cleanup()
end
`);

suite('putress weapons fire through shared engines and attribute damage to their own id', mocks + String.raw`
function AddLightningEx()return {}end
function GetRandomInt()return 1 end
`, [config,metrics,augments,combat], String.raw`
local ids={'plaguedart','plaguetrail','corrosion','plaguepool','deathcoil','soulchain','wraithguard','shadowscythe',
    'plaguejar','catalyst','boilingflask','acidvials','plaguezombie','experiment'}
assert(#ids==14)
for _,id in ipairs(ids)do
    local hero,build,units=NewCombat(id);local target=EnemyAt(units,150,0,false);target.life=100000
    assert(build.hero=='putress' and SurvivorConfig.weapons[id].hero=='putress')
    SurvivorCombat.CastWeapon(id)
    for step=1,300 do
        if #hits>0 then break end
        now=now+.02
        local list={};for _,a in ipairs(actors)do list[#list+1]=a end
        for _,a in ipairs(list)do
            if not a.cleaned and a.selfInteractions then a.selfInteractions(a) end
            if not a.cleaned and a.interactions and a.interactions.hsEnemy then a.interactions.hsEnemy(a,target) end
        end
    end
    assert(#hits>0,'No hit from '..id)
    local rows=SurvivorCombat.DamageRows({id})
    assert(rows[1].damage>0,'Damage must be attributed to '..id)
    for _,a in ipairs(actors)do
        assert(a.weapon==nil or SurvivorConfig.weapons[a.weapon].hero=='putress','A Putress cast created an Anya-attributed object: '..tostring(a.weapon))
    end
    SurvivorCombat.Cleanup()
end
`);

suite('putress poison ticks, curse amplifies, reaction consumes poison and extra attacks halve stacks', mocks + String.raw`
function AddLightningEx()return {}end
`, [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('plaguedart');local target=EnemyAt(units,150,0,false);target.life=100000
local hit=Local(SurvivorCombat.FireMissile,'Hit');local cfg=SurvivorConfig.status
hit(target,10,'plaguedart')
assert(units[target].poison==build.stats.status.plaguedart.poison and units[target].poison==2)
hits={};now=cfg.poisonTick;SurvivorCombat.UpdateStatus(.02)
assert(#hits==1 and math.abs(hits[1].damage-2*build.stats.poisonDamage*cfg.poisonTick)<1e-9,'Poison ticks every half second per stack')
hit(target,10,'plaguedart',false,false,1,{curse=5})
assert(units[target].curse==cfg.curseMax,'Curse stacks cap')
hits={};hit(target,10,'plaguedart',false,false,1,{})
assert(math.abs(hits[1].damage-10*(1+cfg.curseAmp*cfg.curseMax))<1e-9,'Cursed enemies take amplified damage')
units[target].poison,units[target].poisonBy=8,{plaguedart=8};hits={}
hit(target,10,'plaguedart',false,false,1,{reaction=1})
local amp=1+cfg.curseAmp*cfg.curseMax
assert(units[target].poison==4 and #hits==2,'Reaction consumes half of the poison')
assert(math.abs(hits[2].damage-4*cfg.reactionDamage*build.stats.poisonDamage/cfg.poisonDamage*amp)<1e-6)
hits={};hit(target,10,'plaguedart',false,false,1,{reaction=1})
assert(#hits==1 and units[target].poison==4,'Reaction waits for its per-target cooldown')
now=now+cfg.reactionCooldown;hits={};hit(target,10,'plaguedart',false,false,1,{reaction=1,reactionAll=true})
assert(units[target].poison==0 and #hits==2,'Critical reaction consumes every stack')
hit(target,10,'plaguedart',false,false,.5,{poison=4});assert(units[target].poison==2,'Extra attacks apply half the stacks')
hit(target,10,'plaguedart',false,false,.5,{poison=1});assert(units[target].poison==3,'A halved stack never rounds to zero')
hit(target,10,'plaguedart',true,false,1,{poison=4});assert(units[target].poison==3,'Set procs and ticks never add status')
now=now+60;SurvivorCombat.UpdateStatus(.02)
assert(units[target].poison==0 and next(Local(SurvivorCombatStatus.Update,'poisonUnits'))==nil,'Expired poison stops ticking')
-- Two poison weapons on one enemy: each share ticks with its own power and credit,
-- and a reaction consumes both shares in proportion.
local shared=EnemyAt(units,200,0,false);shared.life=100000
local dartPower=build.stats.status.plaguedart.tickPower
build.stats.status.plaguejar={tickPower=dartPower*2}
SurvivorCombat.TrackWeapons({'plaguejar'})
hit(shared,10,'plaguedart',false,false,1,{poison=6})
hit(shared,10,'plaguejar',false,false,1,{poison=2})
assert(units[shared].poison==8 and units[shared].poisonBy.plaguedart==6 and units[shared].poisonBy.plaguejar==2,
    'A later weapon adds its own share instead of taking every stack')
local function Dealt(id)return SurvivorCombat.DamageRows({id})[1].damage end
local dart,jar=Dealt('plaguedart'),Dealt('plaguejar')
hits={};now=now+cfg.poisonTick;SurvivorCombat.UpdateStatus(.02)
local unit=cfg.poisonDamage*cfg.poisonTick
assert(#hits==2 and math.abs(hits[1].damage-6*unit*dartPower)<1e-6 and math.abs(hits[2].damage-2*unit*dartPower*2)<1e-6,
    'Each share ticks at its own weapon power, in weapon-id order')
assert(math.abs(Dealt('plaguedart')-dart-6*unit*dartPower)<1e-6 and math.abs(Dealt('plaguejar')-jar-4*unit*dartPower)<1e-6,
    'Each share credits its own weapon')
now=now+cfg.reactionCooldown;hit(shared,10,'plaguedart',false,false,1,{reaction=1})
assert(units[shared].poison==4 and units[shared].poisonBy.plaguedart==3 and units[shared].poisonBy.plaguejar==1,
    'A reaction consumes every share in proportion')
SurvivorCombat.Cleanup()
assert(next(Local(SurvivorCombatStatus.Update,'poisonUnits'))==nil)
`);

suite('putress throws follow a Bezier arc and land on the point locked at release', mocks + String.raw`
function AddLightningEx()return {}end
function GetRandomInt()return 1 end
`, [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('plaguepool');local target=EnemyAt(units,400,0,false);target.life=100000
SurvivorCombat.CastWeapon('plaguepool')
local throw;for _,a in ipairs(actors)do if a.identifier=='hsThrow' then throw=a end end
assert(throw and throw.x1==400 and throw.y1==0,'The landing point is the target position at release')
local c=SurvivorConfig.throw
local expected=(c.minFlight+(c.maxFlight-c.minFlight)*400/c.flightRange)/build.stats.weapons.plaguepool.speed
assert(math.abs(throw.flight-expected)<1e-9)
target.x=1000
local steps,peak=0,-math.huge
repeat steps=steps+1;now=now+.02;throw.selfInteractions(throw);peak=math.max(peak,throw.z) until throw.cleaned or steps>200
assert(throw.cleaned and math.abs(steps*.02-expected)<.021,'Impact waits for the flight time')
assert(peak>throw.z0 and peak<=throw.cz,'The bottle rises toward its control point')
local zone;for _,a in ipairs(actors)do if a.identifier=='hsExtraZone' then zone=a end end
assert(zone and zone.x==400 and zone.weapon=='plaguepool','The poison pool lands where the bottle was aimed')
SurvivorCombat.Cleanup()
`);

suite('putress weapon visuals use their configured models, sizes and opacity', mocks + String.raw`
function AddLightningEx()return {}end
function BlzSetSpecialEffectScale(e,v)e.scale=v end
function BlzSetSpecialEffectAlpha(e,v)e.alpha=v end
function BlzSetSpecialEffectColor(e,r,g,b)e.color={r,g,b}end
function GetRandomInt()return 1 end
`, [config,metrics,augments,combat], String.raw`
local function Cast(id)
    local hero,build,units=NewCombat(id);local target=EnemyAt(units,400,0,false);target.life=100000
    SurvivorCombat.CastWeapon(id);return build
end
local function Find(identifier)for _,a in ipairs(actors)do if a.identifier==identifier then return a end end end
Cast('deathcoil')
assert(Find('hsMissile').visual.model==[[Abilities\Spells\Undead\DeathCoil\DeathCoilMissile.mdl]]);SurvivorCombat.Cleanup()
local build=Cast('shadowscythe');local scythe=Find('hsScythe')
assert(scythe.visual.model==[[Abilities\Spells\NightElf\shadowstrike\shadowstrike.mdl]] and scythe.visual.alpha==255,'The scythe is opaque')
local dark,alchemy=SurvivorConfig.elements['어둠'].tint,SurvivorConfig.elements['연금술'].tint
assert(scythe.visual.scale==build.stats.weapons.shadowscythe.size*1.6,'The scythe is enlarged')
assert(scythe.visual.color[1]==dark[1] and scythe.visual.color[3]==dark[3],'Dark weapons are tinted purple instead of the glaive tint')
SurvivorCombat.Cleanup()
build=Cast('plaguejar');local jar=Find('hsFallingPayload')
local jarWeapon=SurvivorConfig.weapons.plaguejar
assert(jar.visual.model==jarWeapon.throwModel and jar.visual.scale==jarWeapon.throwScale,'The plague jar falls as an enlarged brew')
assert(jar.visual.color[1]==255 and jar.visual.color[2]==0 and jar.visual.color[3]==255,'The jar retains its purple tint')
local steps=0;repeat steps=steps+1;now=now+.02;jar.selfInteractions(jar)until jar.cleaned or steps>200
local impact=Find('hsJarImpact');assert(impact and impact.visual.model==SurvivorConfig.jarExplosionModel and impact.visual.color==nil)
assert(not Find('hsExtraZone'),'The falling jar must not leave poison residue')
SurvivorCombat.Cleanup()
Cast('boilingflask');assert(Find('hsOrb').visual.scale==build.stats.weapons.boilingflask.size*SurvivorConfig.weapons.boilingflask.modelScale,'The flask is enlarged')
SurvivorCombat.Cleanup()
Cast('plaguepool');assert(Find('hsThrow').visual.scale==SurvivorConfig.weapons.plaguepool.throwScale,'The pool bottle is enlarged')
SurvivorCombat.Cleanup()
Cast('acidvials');local vial=Find('hsFallingPayload')
assert(vial.visual.model==[[Abilities\Spells\Other\AcidBomb\BottleMissile.mdl]],'Acid vials fly as bottles')
SurvivorCombat.Cleanup()
assert(SurvivorAugments.Get('acidvials').icon:find('BTNHealingSalve',1,true) and SurvivorAugments.Get('shadowscythe').icon:find('BTNShadowStrike',1,true))
Cast('plaguedart');assert(Find('hsFrostShard').visual.color==nil,'Poison keeps its natural green');SurvivorCombat.Cleanup()
assert(SurvivorAugments.ElementTag('연금술')=='|cffffa040[연금술]|r' and SurvivorAugments.ElementTag('얼음',true)=='|cff6fa8ff[냉기]|r')
local hero2,build2=NewCombat('plaguejar');assert(SurvivorAugments.OwnedTooltip('plaguejar',build2):find('|cffffa040[연금술]|r',1,true)==1,'Weapon tooltips open with their school tag')
SurvivorCombat.Cleanup()
`);

suite('combat effects keep one model per role and boss blasts show one sized ring', mocks + String.raw`
function AddLightningEx()return {}end
function BlzSetSpecialEffectScale(e,v)e.scale=v end
`, [config,metrics,augments,combat], String.raw`
local c,w=SurvivorConfig,SurvivorConfig.weapons
local roles={enemy=c.enemyProjectileModel,meteor=c.meteorModel,bossImpact=c.bossImpactModel,fireBurst=c.fireBurstModel,
    ember=c.emberBurstModel,blade=c.bladeModel,bladeProc=c.bladeProcModel,slashHit=c.slashModel,corrosionHit=w.corrosion.hitModel,
    reaction=c.reactionModel,residue=c.residueModel,pool=w.plaguepool.model,soulBurst=c.soulBurstModel,
    flask=w.boilingflask.model,poolThrow=w.plaguepool.throwModel,vialThrow=w.acidvials.throwModel,
    catalyst=w.catalyst.model,vialImpact=w.acidvials.model}
local seen={}
for role,model in pairs(roles)do
    local key=assert(model,role):lower();assert(not seen[key],role..' shares a model with '..tostring(seen[key]));seen[key]=role
end
local hero,build,units=NewCombat('firebolt')
Local(SurvivorCombat.WarnLava,'WarnBossBlast')(0,0,240,1.25,true)
local warning;for _,a in ipairs(actors)do if a.identifier=='hsBossWarning' then warning=a end end
assert(#warning.markers==1 and warning.markers[1].model==c.warningRingModel,'A boss blast shows one ring')
assert(warning.markers[1].scale==240/c.warningRingRadius,'The ring matches the blast radius')
SurvivorCombat.Cleanup()
`);

suite('elite and boss dash arrows follow their real route and preserve lingering fire and search advantages', mocks + String.raw`
SurvivorExpedition.UseAdvantage=function()return false end
function AddLightningEx()return {}end
function BlzSetSpecialEffectScale(e,v)e.scale=v end
function BlzSetSpecialEffectYaw(e,v)e.yaw=v end
function IsTerrainPathable()return false end
function IsUnitPaused(u)return u.paused==true end
function PauseUnit(u,v)u.paused=v end
function SetUnitFacing()end
`, [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('firebolt')
local elite=EnemyAt(units,-300,0,false);units[elite].elite=true;units[elite].damageScale=1
SurvivorCombatHazards.StartSpecial('dash',units[elite],elite)
local special;for _,a in ipairs(actors)do if a.identifier=='hsBossSpecial' then special=a end end
local c=SurvivorConfig;local expected=math.max(1,math.floor((special.distance-c.dashArrowOffset)/c.dashArrowSpacing)+1)
assert(#special.markers==expected and expected>1,'Elite dash arrows repeat along the dash')
for i,arrow in ipairs(special.markers)do
    assert(arrow.model==c.dashArrowModel and math.abs(arrow.yaw)<1e-9 and arrow.scale==c.dashArrowScale)
    assert(math.abs(arrow.x-(-300+c.dashArrowOffset+(i-1)*c.dashArrowSpacing))<1e-9 and arrow.x<=-300+special.distance+1e-9,'Arrows are evenly spaced up to the dash end')
end
local start=SurvivorCombatHazards.StartSpecial
-- Boss warnings include the endpoint at evenly spaced intervals no greater than 150.
for _,stage in ipairs({2,5})do
    CombatRun().stage=stage
    local source=EnemyAt(units,-500,0,false);units[source].boss=true
    start('dash',units[source],source)
    local dash=units[source].special;local markers=dash.markers
    local count=math.ceil(dash.distance/c.dashArrowSpacing)
    assert(#markers==count and count<18 and dash.width==100 and dash.delay==c.bossBlastDelay)
    for i,arrow in ipairs(markers)do
        assert(arrow.model==c.dashArrowModel and arrow.scale==c.bossDashArrowScale and arrow.scale>c.dashArrowScale)
        assert(math.abs(arrow.yaw)<1e-9 and math.abs(arrow.x-(-500+dash.distance*i/count))<1e-9)
    end
    assert(math.abs(markers[count].x-dash.bx)<1e-9 and math.abs(markers[count].y-dash.by)<1e-9)
    -- The warning is fixed at cast time; moving the hero cannot redirect the dash.
    hero.y=500;local firstX,firstY=markers[1].x,markers[1].y
    state='CHOOSING';dash:selfInteractions();assert(dash.elapsed==0 and markers[1].x==firstX and markers[1].y==firstY)
    state='RUNNING';SurvivorCombat.StopTime();dash:selfInteractions();assert(dash.elapsed==0)
    now=now+8;SurvivorCombat.UpdateStatus(.02)
    for i=1,110 do dash:selfInteractions()end
    assert(dash.trail and #dash.markers==8,'Boss dash still leaves the original two-second burning trail')
    for _,arrow in ipairs(markers)do assert(arrow.destroyed,'All arrows are removed when the dash ends')end
    local trail=dash.markers;for i=1,101 do dash:selfInteractions()end
    assert(dash.cleaned);for _,effect in ipairs(trail)do assert(effect.destroyed)end
    hero.y=0
end
-- Clipping near an arena corner must not skew or extend the indicated route.
local source=EnemyAt(units,4900,4800,false);units[source].boss=true
hero.x,hero.y=5200,5500
start('dash',units[source],source)
local dash=units[source].special;local dx,dy=dash.bx-dash.ax,dash.by-dash.ay
for _,arrow in ipairs(dash.markers)do
    assert(math.abs((arrow.x-dash.ax)*dy-(arrow.y-dash.ay)*dx)<1e-6)
    assert(arrow.x<=dash.bx+1e-9 and arrow.y<=dash.by+1e-9)
    assert(math.abs(arrow.yaw-math.atan(dy,dx))<1e-9)
end
CombatRun().stage=2
SurvivorExpedition.UseAdvantage=function()return true end
source=EnemyAt(units,-300,0,false);units[source].boss=true;hero.x,hero.y=0,0
start('dash',units[source],source);dash=units[source].special;local arrows=dash.markers
assert(dash.noTrail)
for i=1,100 do dash:selfInteractions()end
assert(dash.cleaned and not dash.trail,'The stage-two search advantage still removes the fire trail')
for _,arrow in ipairs(arrows)do assert(arrow.destroyed)end
SurvivorCombat.Cleanup()
`);

suite('wave safety rays match normal and widened safe sectors and freeze with the actual attack', bossTelegraphMocks,
    [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('firebolt')
local source=EnemyAt(units,0,0,false);units[source].boss=true;hero.x=400
local start=SurvivorCombatHazards.StartSpecial
CombatRun().stage=3
for _,informed in ipairs({false,true})do
    advantage=informed;start('wave',units[source],source)
    local wave=units[source].special;local markers=wave.markers
    assert(#markers==20 and wave.gapWidth==(informed and math.pi or math.pi/2))
    for i,side in ipairs({-1,1})do
        local ray=markers[18+i];local angle=wave.gap+side*wave.gapWidth/2
        local reach=wave.waveMaxRadius+wave.width
        assert(ray.model==SurvivorConfig.warningPlaneModel and ray.color[2]==255)
        assert(math.abs(ray.x-math.cos(angle)*reach/2)<1e-7 and math.abs(ray.y-math.sin(angle)*reach/2)<1e-7)
        assert(ray.matrixScale[1]==reach/100 and ray.matrixScale[2]==.08 and ray.alpha==185)
    end
    state='CHOOSING';wave:selfInteractions();assert(wave.elapsed==0)
    state='RUNNING';SurvivorCombat.StopTime();wave:selfInteractions();assert(wave.elapsed==0)
    now=now+8;SurvivorCombat.UpdateStatus(.02)
    local safe=wave.gap;hero.x,hero.y=120*math.cos(safe),120*math.sin(safe)
    wave.elapsed=wave.delay-.02;local hp=hero.life;wave:selfInteractions();assert(hero.life==hp and not wave.hit)
    local unsafe=wave.gap+wave.gapWidth/2+.05
    hero.x,hero.y=125*math.cos(unsafe),125*math.sin(unsafe)
    wave:selfInteractions();assert(wave.hit and hero.life<hp,'The warned arc still hits outside the safe wedge')
    wave.elapsed=wave.delay+(wave.waveMaxRadius-120)/340;wave:selfInteractions()
    assert(wave.cleaned);for _,effect in ipairs(markers)do assert(effect.destroyed)end
    hero.x,hero.y=400,0
end
SurvivorCombat.Cleanup()
`);

suite('chain ribbons exactly bound the three damaging lanes and preserve the removed middle lane advantage', bossTelegraphMocks,
    [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('firebolt')
local source=EnemyAt(units,-600,0,false);units[source].boss=true
CombatRun().stage=5
local start=SurvivorCombatHazards.StartSpecial
for _,informed in ipairs({false,true})do
    advantage=informed;hero.x,hero.y=0,0;start('chains',units[source],source)
    local chain=units[source].special;local markers=chain.markers
    assert(#chain.lanes==(informed and 2 or 3)and #markers==#chain.lanes*3)
    for index,lane in ipairs(chain.lanes)do
        local fill=markers[(index-1)*3+1]
        assert(fill.model==SurvivorConfig.warningPlaneModel and fill.color[1]==255 and fill.alpha==80)
        assert(fill.matrixScale[1]==9 and fill.matrixScale[2]==chain.width*2/100)
        assert(fill.x==(lane.ax+lane.bx)/2 and fill.y==(lane.ay+lane.by)/2)
        for side=2,3 do
            local edge=markers[(index-1)*3+side]
            assert(edge.matrixScale[2]==.05 and edge.alpha==220)
            assert(math.abs(math.abs(edge.y-fill.y)+2.5-chain.width)<1e-9,'Outer edge equals the damage boundary')
        end
    end
    if not informed then hero.y=chain.width+1 end
    chain.elapsed=chain.delay-.02;local hp=hero.life;chain:selfInteractions()
    assert(chain.cleaned and hero.life==hp,'The corridor gaps and removed middle lane remain safe')
    for _,effect in ipairs(markers)do assert(effect.destroyed)end
end
advantage=false;hero.x,hero.y=0,0;start('chains',units[source],source)
local chain=units[source].special;local hp=hero.life
chain.elapsed=chain.delay-.02;chain:selfInteractions();assert(hero.life<hp,'The red strip interior still deals damage')
hero.life=hp;start('chains',units[source],source);chain=units[source].special
hero.x=chain.lanes[2].bx+1;chain.elapsed=chain.delay-.02;chain:selfInteractions()
assert(hero.life==hp,'The warning and damage both end at the lane endpoint')
SurvivorCombat.Cleanup()
`);

suite('blast rings retain their radius and brighten by remaining time so the cross center warns before its arms', bossTelegraphMocks,
    [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('firebolt')
local source=EnemyAt(units,-600,0,false);units[source].boss=true
CombatRun().boss=source;CombatRun().stage=4
SurvivorCombatHazards.BossPattern(units[source])
local warnings={};for _,actor in ipairs(actors)do if actor.identifier=='hsBossWarning'then warnings[#warnings+1]=actor end end
assert(#warnings==5)
local center,outer=warnings[1],warnings[2];local scale=center.markers[1].scale
assert(center.markers[1].alpha==90 and outer.markers[1].alpha==90)
for i=1,10 do for _,warning in ipairs(warnings)do warning:selfInteractions()end end
assert(center.markers[1].alphaWrites==1,'Steady early warnings do not repeatedly write alpha')
for i=1,23 do for _,warning in ipairs(warnings)do warning:selfInteractions()end end
assert(center.markers[1].alpha>outer.markers[1].alpha and center.markers[1].scale==scale)
local remaining,alpha=center.life,center.markers[1].alpha
state='CHOOSING';center:selfInteractions();assert(center.life==remaining and center.markers[1].alpha==alpha)
state='RUNNING';SurvivorCombat.StopTime();center:selfInteractions()
assert(center.life==remaining and center.markers[1].alpha==alpha)
now=8;SurvivorCombat.UpdateStatus(.02)
local hp=hero.life;local ring=center.markers[1]
for i=1,30 do center:selfInteractions();for n=2,5 do warnings[n]:selfInteractions()end end
assert(center.cleaned and ring.destroyed and not outer.cleaned and hero.life==hp-center.damage)
for i=1,21 do for n=2,5 do warnings[n]:selfInteractions()end end
for _,warning in ipairs(warnings)do assert(warning.cleaned)end
SurvivorCombat.Cleanup()
`);
