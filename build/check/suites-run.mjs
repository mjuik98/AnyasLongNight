// Run lifecycle: stage transitions, enemies, pauses, teardown, failures and ALICE scheduling.
import {augments, combat, config, equipment, metrics, suite} from './harness.mjs';
import {gearMocks, mocks} from './mocks.mjs';
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
`, [config, metrics, augments, combat, 'src/20_system/RunSession.lua', 'src/00_bootstrap/AnyasLongNight.lua'], String.raw`
local step=Local(AnyasLongNight.BeginRun,"Step")
for stage=1,5 do
    local hero,build,units=NewCombat("orbitblade")
    story,storyStage,rewards,restCalls,inventoryStops=nil,nil,0,0,0
    LifecycleRun().stage=stage;LifecycleRun().stageTransition=false
    LifecycleRun().hero=hero;LifecycleRun().build=build;LifecycleRun().stats=build.stats
    SetLocal(step,"selectedDifficulty","normal");LifecycleRun().rerollsRemaining=0
    CombatRun().bossDefeated=true
    for i=1,80 do EnemyAt(units,i,300,false) end
    local finished=false
    assert(RunSession.Start(step,{pause=function(reason) SurvivorCombat.SetPaused(true,reason) end,
        resume=function() SurvivorCombat.SetPaused(false) end,finish=function() finished=true end}))
    periodic();assert(RunSession.GetState()=="STAGE_CLEAR" and halted)
    assert(SurvivorCombat.IsClearing() and not story and restCalls==0)
    assert(not AnyasLongNight.NextStage(),"Next stage bypassed cleanup")
    local elapsed=RunSession.GetElapsed()
    for i=1,20 do TickTimers() end
    assert(story and storyStage==stage and RunSession.GetElapsed()==elapsed)
    assert(not finished and rewards==0,"Story continued without player input")
    assert(not AnyasLongNight.NextStage(),"Next stage bypassed story")
    local serial=Local(step,"runSerial");SetLocal(step,"runSerial",serial+1)
    story();assert(not finished and rewards==0,"A story callback from an older run must not act on the current run")
    SetLocal(step,"runSerial",serial)
    story()
    if stage<5 then
        assert(rewards==1 and restCalls==1 and inventoryStops==0 and not finished)
        RunSession.Finish("test")
    else
        -- The ending's click continues after its callback, so the finish is requested
        -- and the paused-state watchdog consumes it.
        assert(not finished and RunSession.IsPending(),'The ending requests its finish')
        for i=1,20 do TickTimers() end
        assert(finished and restCalls==0 and inventoryStops==1)
    end
    SurvivorCombat.Cleanup()
end
-- An observer teardown failure at the final clear must not turn the victory into an error,
-- and a bag left open at that moment must not keep its pause reason through the ending.
print=function()end
SurvivorInventoryPause.Cleanup=function() inventoryStops=inventoryStops+1;error('injected observer failure') end
local hero,build,units=NewCombat("orbitblade")
story,storyStage,rewards,restCalls,inventoryStops=nil,nil,0,0,0
LifecycleRun().stage=5;LifecycleRun().stageTransition=false
LifecycleRun().hero=hero;LifecycleRun().build=build;LifecycleRun().stats=build.stats
CombatRun().bossDefeated=true
local reason
assert(RunSession.Start(step,{pause=function(r) SurvivorCombat.SetPaused(true,r) end,
    resume=function() SurvivorCombat.SetPaused(false) end,finish=function(r) reason=r end}))
periodic();assert(RunSession.SetInventoryOpen(true) and RunSession.IsInventoryOpen())
for i=1,20 do TickTimers() end
assert(storyStage==5 and inventoryStops==1 and reason==nil,'The ending still starts after an observer failure')
assert(not RunSession.IsInventoryOpen() and RunSession.GetState()=="STAGE_CLEAR")
story();assert(reason==nil and RunSession.IsPending())
for i=1,20 do TickTimers() end
assert(reason=="boss_defeated")
SurvivorCombat.Cleanup()
`);

suite('boss HUD reports live health and half-health state without separate monster popups', mocks,
    [config, metrics, augments, combat], String.raw`
local hero,build,units=NewCombat('orbitblade')
assert(SurvivorCombat.BossStatus()==nil,'No boss status before a boss exists')
local unit=EnemyAt(units,500,0,false)
units[unit].boss=true;units[unit].special={}
CombatRun().boss=unit
local alerts={}
SurvivorUI.Alert=function(seconds,text,priority,key)alerts[#alerts+1]={text=text,priority=priority,key=key}end
for stage=1,5 do
    CombatRun().stage=stage
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
    CombatRun().stage=index
    for count=1,cap-1 do assert(SurvivorCombat.Spawn(false,'melee'))end
    assert(not SurvivorCombat.Spawn(false,'melee'),'The enlarged regular wave still respects its stage cap')
    assert(SurvivorCombat.SpawnBoss(),'A full wave must leave one reserved slot for its boss')
    assert(SurvivorCombat.Counts()==cap and not SurvivorCombat.SpawnBoss(),'A single boss fills the reserved slot without exceeding the cap')
    SurvivorCombat.Cleanup()
end
hero,build,units=NewCombat('orbitblade')
assert(SurvivorConfig.spawnDistance==1500)
local nativeCreate,attempts=CreateUnit,0
function CreateUnit(owner,id,x,y,facing)
    attempts=attempts+1
    local unit=nativeCreate(owner,id,x,y,facing)
    if attempts==1 then unit.x,unit.y=hero.x+200,hero.y end
    return unit
end
local countBefore=SurvivorCombat.Counts()
local ok,unit=SurvivorCombat.Spawn(false,'melee')
assert(ok and attempts==2 and world[#world-1].removed,'Retry a native spawn relocated too close to the hero')
assert((unit.x-hero.x)^2+(unit.y-hero.y)^2>=1500^2 and SurvivorCombat.Counts()==countBefore+1)
function CreateUnit(owner,id,x,y,facing)
    attempts=attempts+1
    local unit=nativeCreate(owner,id,hero.x+200,hero.y,facing)
    return unit
end
attempts=0;local beforeRemoved=removed
assert(not SurvivorCombat.Spawn(false,'ranged') and attempts==16,'Unsafe native placements exhaust bounded retries')
assert(removed==beforeRemoved+16 and SurvivorCombat.Counts()==countBefore+1,'Rejected units never enter enemy state or counts')
CreateUnit=nativeCreate
CombatRun().bounds={minX=-100,maxX=100,minY=-100,maxY=100}
assert(not SurvivorCombat.Spawn(false,'melee'),'Do not fall back to a close spawn in a cramped arena')
SurvivorCombat.Cleanup()
`);

suite('enemies rotate across allied Neutral Hostile look-alike owners and stagger redundant move orders', mocks + String.raw`
PATHING_TYPE_WALKABILITY,PLAYER_NEUTRAL_AGGRESSIVE='walk',12
function GetRandomInt(a,b)return a end
function GetRandomReal(a,b)return a end
function IsTerrainPathable()return false end
for _,name in ipairs({'BlzSetUnitName','BlzSetUnitBaseDamage','BlzSetUnitAttackCooldown','SetUnitScale','SetUnitVertexColor',
    'ALICE_AddIdentifier','SetUnitCreepGuard','RemoveGuardPosition','BlzUnitDisableAbility','IssueImmediateOrder','SetUnitFacing','SetUnitAnimation'})do
    _G[name]=function()end
end
function BlzGetUnitAttackCooldown()return 1.5 end
function IssueTargetOrder(unit,order)unit.order=order end
moveOrders=0
function IssuePointOrder(unit,order,x,y)unit.order,unit.target=order,{x,y};moveOrders=moveOrders+1 end
function GetUnitCurrentOrder(unit)return unit.order or 0 end
function OrderId(order)return order end
SurvivorStage.LineClear=function()return true end
SurvivorStage.Get=function(index)return {ids={melee='sm0'..index,ranged='sr0'..index,flying='sf0'..index,boss='sb0'..index},
    color={180,220,185}}end
`, [config,metrics,augments,combat], String.raw`
local hero,build,units=NewCombat('orbitblade')
local ids,owners=SurvivorConfig.enemyPlayerIds,{}
assert(#ids>=4,'Enough owners must share the pathing load')
for count=1,#ids*2 do
    local ok,unit=SurvivorCombat.Spawn(false,'melee')
    assert(ok and unit.owner==ids[(count-1)%#ids+1],'Enemies rotate through every spare owner')
    owners[unit.owner]=(owners[unit.owner] or 0)+1
end
for _,id in ipairs(ids)do
    assert(owners[id]==2,'Each owner receives an even share')
    assert(playerColors[id]=='color12' and playerNames[id]=='적','Owners borrow Neutral Hostile color and show the enemy name')
    assert(alliances[id..'>0:passive']==false and alliances['0>'..id..':passive']==false,'Owners stay hostile to the hero player')
    for _,other in ipairs(ids)do
        if other~=id then assert(alliances[id..'>'..other..':passive']==true,'Enemy owners never fight each other')end
    end
end
SurvivorCombat.Cleanup()
hero,build,units=NewCombat('orbitblade')
local ok,ranged=SurvivorCombat.Spawn(false,'ranged')
assert(ok and ranged.order=='move' and moveOrders==1)
hero.x,hero.y=ranged.x+3000,ranged.y
SurvivorCombat.UpdateEnemies(1)
local issued=moveOrders
SurvivorCombat.UpdateEnemies(1.5)
assert(moveOrders==issued,'An unchanged chase target must not repath')
hero.y=hero.y+40
SurvivorCombat.UpdateEnemies(2)
assert(moveOrders==issued,'A small hero step within slack must not repath a distant chaser')
local groups=SurvivorConfig.enemyOrderGroups
assert(groups>1,'Re-aim orders must be spread over several updates')
for tick=1,groups do
    hero.y=hero.y+2000
    SurvivorCombat.UpdateEnemies(2+tick*.5)
end
assert(moveOrders==issued+1,'A chaser re-aims once per staggered cycle even when the hero keeps moving')
issued=moveOrders
ranged.order=0
SurvivorCombat.UpdateEnemies(10)
assert(moveOrders==issued+1 and ranged.target[2]==hero.y,'A unit that lost its move order is ordered at once, off its group tick')
SurvivorCombat.Cleanup()
hero,build,units=NewCombat('orbitblade')
ok,ranged=SurvivorCombat.Spawn(false,'ranged')
assert(ok and units[ranged].profile.range==400)
ranged.x,ranged.y=hero.x+401,hero.y
SurvivorCombat.UpdateEnemies(2)
assert(#actors==0,'Ranged enemies must close the distance before firing outside 400')
ranged.x=hero.x+400
SurvivorCombat.UpdateEnemies(2.1)
assert(#actors>0,'Ranged enemies can fire exactly at distance 400')
SurvivorCombat.Cleanup()
`);

suite('swarm rush warns a lane through the hero, marches a straight block once across it and leaves without kills', mocks + String.raw`
PATHING_TYPE_WALKABILITY,PLAYER_NEUTRAL_AGGRESSIVE='walk',12
function GetRandomInt(a,b)return a end
rushAngles={}
function GetRandomReal(a,b)if b==2*math.pi and #rushAngles>0 then return table.remove(rushAngles,1)end;return a end
function IsTerrainPathable()return false end
for _,name in ipairs({'BlzSetUnitName','BlzSetUnitBaseDamage','BlzSetUnitAttackCooldown','SetUnitScale','SetUnitVertexColor',
    'ALICE_AddIdentifier','SetUnitCreepGuard','RemoveGuardPosition','BlzUnitDisableAbility','IssueImmediateOrder','SetUnitAnimation'})do
    _G[name]=function()end
end
function SetUnitFacing(unit,facing)unit.facing=facing end
function BlzGetUnitAttackCooldown()return 1.5 end
function IssueTargetOrder(unit,order)unit.order=order end
function IssuePointOrder(unit,order,x,y)unit.order,unit.target=order,{x,y} end
function GetUnitCurrentOrder(unit)return unit.order or 0 end
function OrderId(order)return order end
function AddSpecialEffect(model,x,y)return {model=model,x=x,y=y}end
function BlzSetSpecialEffectAlpha(e,alpha)e.alpha=alpha end
function BlzSetSpecialEffectYaw(e,yaw)e.yaw=yaw end
function GetTriggerUnit()return eventUnit end
function GetEventDamage()return eventDamage end
function GetEventDamageSource()return eventSource end
function BlzSetEventDamage(amount)eventDamage=amount end
function UnitDamageTarget(source,u,amount)
    eventUnit,eventSource,eventDamage=u,source,amount
    for _,t in ipairs(triggers)do if not t.destroyed and t.event=='damage'then t.action()end end
    hits[#hits+1]={unit=u,damage=eventDamage,source=source};u.life=math.max(0,u.life-eventDamage)
end
flashes,cues={},{}
SurvivorUI.HitFlash=function(fraction)flashes[#flashes+1]=fraction end
SurvivorUI.Cue=function(kind)cues[#cues+1]=kind end
SurvivorStage.Get=function(index)return {ids={melee='sm0'..index,ranged='sr0'..index,flying='sf0'..index,boss='sb0'..index},
    color={180,220,185}}end
`, [config,metrics,augments,combat], String.raw`
local c=SurvivorConfig.swarmRush
local hero,build,units=NewCombat('orbitblade')
local function Rushers()local list={};for u,r in pairs(units)do if r.rush and not u.removed then list[#list+1]=u end end;return list end
local function Step(warning,seconds)for _=1,math.floor(seconds/0.02+0.5)do warning.selfInteractions(warning)end end
assert(SurvivorCombat.WarnRush())
local warning=actors[#actors]
assert(warning.identifier=='hsEnemyRushWarning' and warning.hostile,'The warning freezes with other enemy telegraphs')
assert(math.abs(warning.ax+c.distance)<1e-6 and warning.ay==0 and math.abs(warning.length-2*c.distance)<1e-6,
    'The lane starts off screen behind the hero and runs the same distance past it')
local arrows=0
for _,marker in ipairs(warning.markers)do if marker.model==SurvivorConfig.dashArrowModel then arrows=arrows+1;assert(marker.yaw==0)end end
assert(#warning.markers==3+arrows and arrows==math.floor(warning.length/c.arrowSpacing),'One lane, two edges and direction arrows')
assert(warning.markers[1].matrixScale[2]==((c.columns-1)*c.spacing+2*c.hitRadius)/100,'The lane is as wide as the block can hit')
assert(lastMessage:find('무리 돌진')and cues[1]=='elite')
SurvivorCombat.StopTime()
Step(warning,c.warning+1);assert(#Rushers()==0 and not warning.cleaned,'Time stop holds the warning')
now=9;Step(warning,c.warning-c.brightTime+0.02);assert(warning.markers[1].alpha==c.finalLaneAlpha and #Rushers()==0)
Step(warning,c.brightTime)
assert(warning.cleaned and #Rushers()==c.rows*c.columns,'The block appears once the warning ends')
for _,u in ipairs(Rushers())do
    local rush=units[u].rush
    assert(u.speed==c.speed and u.order=='move' and u.facing==0)
    assert(math.abs(u.target[1]-(u.x+warning.length))<1e-6 and u.target[2]==u.y,'Each unit marches straight down the lane')
end
SurvivorCombat.UpdateEnemies(now)
assert(#hits==0,'Units that have not crossed the hero do not hurt it')
for _,u in ipairs(Rushers())do u.x=u.x+c.distance+300 end
SurvivorCombat.UpdateEnemies(now+0.5)
local inside=0
for _,u in ipairs(Rushers())do if math.abs(u.y)<=c.hitRadius then inside=inside+1 end end
assert(inside==2*c.rows and #hits==inside and #flashes==inside,'Only paths crossing the hero hit it, and each hit flashes')
assert(math.abs(hits[1].damage-SurvivorConfig.enemyDamage*units[hits[1].source].damageScale*c.damage)<1e-6)
assert(math.abs(flashes[1]-hits[1].damage/hero.maxLife)<1e-9,'The flash strength is damage over max HP')
for _,u in ipairs(Rushers())do u.x=u.x+100 end
SurvivorCombat.UpdateEnemies(now+1);assert(#hits==inside,'Each marcher hurts at most once')
local before=select(1,SurvivorCombat.Counts())
SurvivorCombat.UpdateEnemies(now+c.life+0.01)
assert(#Rushers()==0 and select(1,SurvivorCombat.Counts())==before-c.rows*c.columns,'Expired marchers leave without dying')
SurvivorCombat.Cleanup()
hero,build,units=NewCombat('orbitblade')
hero.x=-4000;rushAngles={0,math.pi}
assert(SurvivorCombat.WarnRush())
warning=actors[#actors]
assert(math.abs(warning.angle-math.pi)<1e-9 and math.abs(warning.ax-(-4000+c.distance))<1e-6,'A wall behind the hero turns the lane around')
assert(math.abs(warning.length-c.distance-(5000-32-4000))<1e-6,'The lane stops at the arena edge')
SurvivorCombat.Cleanup()
hero,build,units=NewCombat('orbitblade')
CombatRun().bounds={minX=-600,maxX=600,minY=-600,maxY=600}
assert(not SurvivorCombat.WarnRush() and #actors==0,'A cramped arena has no off-screen start')
SurvivorCombat.Cleanup()
hero,build,units=NewCombat('orbitblade')
SurvivorCombat.SpawnBoss()
assert(not SurvivorCombat.WarnRush(),'No rush while the boss is out')
SurvivorCombat.Cleanup()
`);

suite('risk investigations require explicit live acceptance and search deadlines use paused run time', mocks + String.raw`
function CreateTextTag()return {}end
function DestroyTextTag(tag)assert(not tag.destroyed);tag.destroyed=true end
function SetTextTagText(tag,text)tag.text=text end
for _,name in ipairs({'SetTextTagPos','SetTextTagColor','SetTextTagPermanent','PingMinimapEx'})do _G[name]=function()end end
SurvivorStage.FindPoint=function(angle,radius)return {x=math.cos(angle)*radius,y=math.sin(angle)*radius}end
SurvivorStage.LandmarkApproach=function()return {x=1000,y=0}end
-- Same layout as SurvivorStage.SearchPoints over the flat FindPoint above.
SurvivorStage.SearchPoints=function(index)
    local search,points=SurvivorConfig.encounters[index].search,{}
    for i=1,search.count do
        points[i]=search.landmark and SurvivorStage.LandmarkApproach(points) or SurvivorStage.FindPoint(
            search.angles and search.angles[i] or math.pi/4+(index-1)*math.pi/2+(i-1)*0.85,search.distance or 650+(i-1)*200,points)
    end
    return points
end
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
        function(kind)rewards[#rewards+1]=kind end,
        {grantRecovery=function()return SurvivorCombat.GrantSearchRecovery()end,
            spawnCourier=function(points)return SurvivorCombat.SpawnCourier(points)end,
            releaseCourier=function(unit)return SurvivorCombat.ReleaseCourier(unit)end})
end
Begin(1,1000)
now=1030;SurvivorExpedition.Step(0.02,now)
local risk=ExpeditionRun().risk
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
risk=ExpeditionRun().risk;hero.x,hero.y=risk.x,risk.y
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
local objective=ExpeditionRun().objective
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
objective=ExpeditionRun().objective
assert(objective.courier and SurvivorExpedition.GetSceneReply(4)==nil,'No scene reply before the search is complete')
SurvivorExpedition.OnKill(objective.courier,false)
assert(#speech==2 and speech[1]:find('지원 요청') and speech[2]==SurvivorExpedition.GetReply(4),'Courier line precedes the reply')
assert(SurvivorExpedition.GetSceneReply(4) and SurvivorExpedition.GetSceneReply(4)~=SurvivorExpedition.GetReply(4))
SurvivorExpedition.Reset()
-- The playing hero speaks the subtitles; Putress has a full line set of its own.
local chapters=Local(SurvivorExpedition.BeginStage,'chapters')
for index,chapter in ipairs(chapters)do
    local own=assert(chapter.putress,'Putress lines for chapter '..index)
    assert(#own.beats==#chapter.beats,'Putress beats match chapter '..index)
    for _,key in ipairs({'insight','reply','riskLine'})do
        assert(type(own[key])=='string' and own[key]~='' and own[key]~=chapter[key],'Putress '..key..' for chapter '..index)
    end
    for i,line in ipairs(own.beats)do assert(line~=''and line~=chapter.beats[i])end
end
local voiced={};SurvivorUI.Say=function(speaker,text)voiced[#voiced+1]={speaker,text}end
local anyaHero=hero
hero=CreateUnit(0,SurvivorConfig.heroes.putress.unitId,0,0,0)
Begin(4,6500);hero.x,hero.y=0,0;now=6520;SurvivorExpedition.Step(.02,now)
objective=ExpeditionRun().objective
SurvivorExpedition.OnKill(objective.courier,false)
assert(#voiced==2 and voiced[1][1]=='퓨트리스' and voiced[1][2]==chapters[4].putress.beats[1]
    and voiced[2][1]=='퓨트리스' and voiced[2][2]==chapters[4].putress.reply,'Putress speaks its own courier and reply lines')
assert(SurvivorExpedition.GetReply(4)==chapters[4].reply,'Story scenes keep the original reply text')
assert(SurvivorExpedition.UseAdvantage(4) and voiced[3][1]=='퓨트리스' and voiced[3][2]==chapters[4].putress.insight)
SurvivorExpedition.Reset()
voiced={};hero=anyaHero
Begin(4,6800);hero.x,hero.y=0,0;now=6820;SurvivorExpedition.Step(.02,now)
objective=ExpeditionRun().objective
SurvivorExpedition.OnKill(objective.courier,false)
assert(voiced[1][1]=='안야' and voiced[1][2]==chapters[4].beats[1] and voiced[2][2]==chapters[4].reply,'Anya keeps her lines')
SurvivorExpedition.Reset()
SurvivorUI.Say=function(speaker,text)speech[#speech+1]=text end
for index=1,5 do
    speech={};Begin(index,7000+index*1000);hero.x,hero.y=0,0
    local opens=Local(SurvivorExpedition.RiskOffer,'RiskWindow')()
    now=7000+index*1000+opens;SurvivorExpedition.Step(.02,now)
    risk=ExpeditionRun().risk;hero.x,hero.y=risk.x,risk.y
    assert(SurvivorExpedition.AcceptRisk() and speech[#speech] and speech[#speech]~='','Every stage has its own risk line')
    if index>1 then assert(speech[#speech]~=previousRiskLine)end
    previousRiskLine=speech[#speech]
    SurvivorExpedition.Reset()
end
for index,window in ipairs({{30,90},{90,150},{95,180},{95,180},{95,180}})do
    Begin(index,7000);hero.x,hero.y=0,0
    now=7000+window[1]-.02;SurvivorExpedition.Step(.02,now)
    risk=ExpeditionRun().risk;assert(risk.state=='waiting')
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
SurvivorUI={HidePanel=function()Mark('panel')end,ResetScreenEffects=function()Mark('effects')end,ShowResult=function(reason)Mark('result');shownReason=reason end}
SurvivorStory={Cleanup=function()Mark('story')end,Reset=function()Mark('storyReset')end}
SurvivorInventoryPause={Cleanup=function()Mark('inventory')end}
SurvivorNativeLoadout={Cleanup=function()Mark('loadout')end}
SurvivorEquipment={Cleanup=function()Mark('equipment')end}
SurvivorCombat={DamageReport=function()Mark('report');return ''end,Cleanup=function()Mark('combat')end}
SurvivorStage={Cleanup=function()Mark('stage')end}
SurvivorExpedition={EndStage=function()Mark('expedition')end,Reset=function()Mark('expeditionReset')end}
messages={};print=function(message)messages[#messages+1]=tostring(message)end
`, [config,metrics,'src/20_system/RunSession.lua','src/00_bootstrap/AnyasLongNight.lua'], String.raw`
local finish=Local(AnyasLongNight.BeginRun,'Finish')
SetLocal(finish,'RefreshDamageBoard',function()Mark('board')end)
SetLocal(finish,'ResultDetails',function()Mark('details');return {}end)
for _,label in ipairs({'expedition','board','details','report','panel','effects','story','inventory','camera','loadout','equipment','combat','stage','result'})do
    attempts,resumes,shownReason,failAt,messages={},0,nil,label,{}
    LifecycleRun().hero=CreateUnit(0,'hero',0,0,0);LifecycleRun().build={}
    local levelTrigger=CreateTrigger();LifecycleRun().levelTrigger=levelTrigger
    assert(RunSession.Start(function()end,{pause=function()end,resume=function()end,finish=finish}))
    assert(RunSession.BeginChoice() and halted)
    RunSession.Fail('original failure')
    for _,cleanup in ipairs({'panel','effects','story','inventory','camera','loadout','equipment','combat','stage','result'})do
        assert(attempts[cleanup]==1,'Earlier '..label..' failure skipped '..cleanup)
    end
    assert(attempts.expedition==2,'Finish ends the expedition for its details and again in the shared teardown list')
    assert(levelTrigger.destroyed and LifecycleRun().hero==nil and LifecycleRun().build==nil)
    assert(RunSession.GetState()=='FINISHED' and periodic==nil and not halted and resumes==1)
    local log=table.concat(messages,'\n')
    assert(log:find('original failure') and log:find('injected '..label..' failure'),'Preserve both original and cleanup errors')
    assert(not RunSession.Finish('again') and resumes==1,'Repeated finish never cleans or resumes twice')
    if label~='result' then assert(shownReason=='error')end
end
-- A restart attempts the same subsystem list (plus per-run resets), then prints
-- each cleanup failure without blocking the new run.
local start=Local(AnyasLongNight.BeginRun,'Start')
local restartSteps={'panel','effects','storyReset','expeditionReset','inventory','camera','loadout','equipment','combat','stage'}
for _,label in ipairs(restartSteps)do
    attempts,failAt,messages={},label,{}
    local levelTrigger=CreateTrigger();LifecycleRun().levelTrigger=levelTrigger
    pcall(start,'firebolt','power')
    assert(table.concat(messages,'\n'):find('injected '..label..' failure'),'Restart reports the cleanup failure')
    for _,cleanup in ipairs(restartSteps)do
        assert(attempts[cleanup]==1,'Restart after a '..label..' failure skipped '..cleanup)
    end
    assert(levelTrigger.destroyed,'Restart releases the level trigger')
end
-- A search reward can come from a kill inside a weapon hit loop: its board refresh is presentation.
local reward=Local(AnyasLongNight.NextStage,'ExpeditionReward')
SetLocal(reward,'RefreshDamageBoard',function()error('injected board failure')end)
messages={};assert(pcall(reward,'search'),'A failed board refresh never fails the kill reward')
assert(table.concat(messages,'\n'):find('damage board') and table.concat(messages,'\n'):find('injected board failure'))
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
function GetRectCenterX(rect)return (rect.minX+rect.maxX)/2 end
function GetRectCenterY(rect)return (rect.minY+rect.maxY)/2 end
function IsTerrainPathable()return false end
function BlzSetHeroProperName()if failName then error('injected hero name failure')end end
SurvivorUI={HidePanel=function()end,ResetScreenEffects=function()end,BeginRun=function()end,ShowResult=function(reason)resultReason=reason end}
SurvivorStory={Reset=function()end,Cleanup=function()storyCleaned=true end}
SurvivorInventoryPause={Cleanup=function()inventoryCleaned=true end}
SurvivorNativeLoadout={Cleanup=function()loadoutCleaned=true end}
SurvivorEquipment={Cleanup=function()equipmentCleaned=true end}
SurvivorStage={Init=function()end,Apply=function()end,Cleanup=function()stageCleaned=true end}
SurvivorExpedition={Reset=function()end,EndStage=function()end}
`, [config,metrics,augments,combat,'src/20_system/RunSession.lua','src/00_bootstrap/AnyasLongNight.lua'], String.raw`
SetLocal(AnyasLongNight.BeginRun,'initialized',true)
SetLocal(AnyasLongNight.BeginRun,'setupPhase','MENU')
SetLocal(AnyasLongNight.BeginRun,'selectedDifficulty','normal')
SetLocal(AnyasLongNight.BeginRun,'selectedWeapon','firebolt')
SetLocal(AnyasLongNight.BeginRun,'selectedTrinket','power')
local createGroup=CreateGroup
CreateGroup=function()error('injected group initialization failure')end
assert(not AnyasLongNight.BeginRun())
CreateGroup=createGroup
assert(RunSession.GetState()=='FINISHED' and resultReason=='error')
assert(world[#world].removed and CombatRun().hero==nil)
assert(storyCleaned and inventoryCleaned and loadoutCleaned and equipmentCleaned and stageCleaned)
assert(AnyasLongNight.CanRetrySame(),'Partial initialization must not consume the selected setup')
failName=true;assert(not AnyasLongNight.RetrySame())
assert(world[#world].removed and CombatRun().hero==nil and CombatRun().queryGroup==nil,
    'A native name failure after unit creation must release the owned hero')
for _,trigger in ipairs(triggers)do assert(trigger.destroyed)end
assert(AnyasLongNight.CanRetrySame() and resultReason=='error')
-- Combat owns the hero before its own validation can fail.
failName=false;SetLocal(AnyasLongNight.BeginRun,'selectedDifficulty','injected-missing')
assert(not AnyasLongNight.RetrySame())
assert(world[#world].removed and CombatRun().hero==nil,'A combat validation failure still removes the created hero')
SetLocal(AnyasLongNight.BeginRun,'selectedDifficulty','normal')
`);

suite('hero death defers run teardown to the next step, a post-start or startup-pause failure shows one detailed result and a pending teardown blocks stage actions', mocks + String.raw`
OnInit={final=function()end}
function GetLocalPlayer()return 0 end
function ResetToGameCamera()end
bj_mapInitialPlayableArea={minX=-5000,minY=-5000,maxX=5000,maxY=5000}
function GetRectMinX(rect)return rect.minX end
function GetRectMaxX(rect)return rect.maxX end
function GetRectMinY(rect)return rect.minY end
function GetRectMaxY(rect)return rect.maxY end
function GetRectCenterX(rect)return (rect.minX+rect.maxX)/2 end
function GetRectCenterY(rect)return (rect.minY+rect.maxY)/2 end
function IsTerrainPathable()return false end
function BlzSetHeroProperName()end
function ALICE_CallPeriodic(fn) periodic=fn;return fn end
function ALICE_DisableCallback() periodic=nil end
function ALICE_Halt()end
function ALICE_Resume()end
function TriggerRegisterPlayerUnitEvent()end
function SuspendHeroXP()end
function GetHeroLevel()return 1 end
function GetHeroSkillPoints()return 0 end
function UnitModifySkillPoints()end
function ClearSelection()end
function SelectUnit()end
function SetCameraPosition()end
function SetCameraTargetController()end
results={}
local noop=function()end
SurvivorUI={HidePanel=noop,ResetScreenEffects=noop,BeginRun=noop,UpdateDamageBoard=noop,UpdateExpedition=noop,ShowStageIntro=noop,
    Notify=noop,Alert=noop,Say=noop,Cue=noop,
    ShowResult=function(reason,_,_,_,_,_,details)results[#results+1]={reason=reason,details=details}end}
SurvivorStory={Reset=noop,Cleanup=noop,JournalChapters=function()return {}end}
SurvivorInventoryPause={Cleanup=noop,Init=function()if failObserver then error('injected observer failure')end end}
SurvivorNativeLoadout={Cleanup=noop,Init=noop,Refresh=noop}
SurvivorEquipment={Cleanup=noop,Init=noop,Reconcile=noop,Step=noop}
SurvivorStage={Init=noop,Apply=noop,Cleanup=noop,LineClear=function()return true end}
SurvivorExpedition={Reset=noop,EndStage=noop,BeginStage=noop,SetPaused=noop,Step=noop,OnKill=noop,
    RiskActive=function()return false end}
messages={};print=function(message)messages[#messages+1]=tostring(message)end
`, [config,metrics,augments,combat,'src/20_system/RunSession.lua','src/00_bootstrap/AnyasLongNight.lua'], String.raw`
SetLocal(AnyasLongNight.BeginRun,'initialized',true)
SetLocal(AnyasLongNight.BeginRun,'setupPhase','MENU')
SetLocal(AnyasLongNight.BeginRun,'selectedDifficulty','normal')
SetLocal(AnyasLongNight.BeginRun,'selectedWeapon','firebolt')
SetLocal(AnyasLongNight.BeginRun,'selectedTrinket','power')
assert(AnyasLongNight.BeginRun() and RunSession.GetState()=='STAGE_CLEAR')
assert(RunSession.EndStageClear() and RunSession.IsRunning())
local hero=CombatRun().hero
hero.life=0;GetTriggerUnit=function()return hero end
for _,t in ipairs(triggers)do if t.event=='death' and not t.destroyed then t.action()end end
assert(RunSession.GetState()=='RUNNING' and not RunSession.IsRunning() and #results==0 and CombatRun().hero==hero,
    'A hero death inside a native event must not tear combat down synchronously')
assert(not RunSession.BeginChoice() and not RunSession.SetInventoryOpen(true) and RunSession.GetState()=='RUNNING',
    'A pending defeat cannot be postponed by a choice or a synchronized inventory pause')
periodic()
assert(RunSession.GetState()=='FINISHED' and #results==1 and results[1].reason=='defeated',
    'The next gameplay step finishes the run as a defeat')
assert(CombatRun().hero==nil)
results,failObserver={},true
assert(not AnyasLongNight.RetrySame())
failObserver=false
assert(#results==1 and results[1].reason=='error' and results[1].details~=nil,
    'A failure after the session hooks exist shows the Finish result once, with its details')
assert(CombatRun().hero==nil and RunSession.GetState()=='FINISHED')
assert(AnyasLongNight.RetrySame() and RunSession.GetState()=='STAGE_CLEAR','A later retry starts normally')
RunSession.Finish('test')
-- A cleanup step that fails every time (a presentation refresh, not owned state)
-- is reported but must not block every later run.
SurvivorStage.Cleanup=function()error('injected ambience failure',0)end
results,messages={},{}
assert(AnyasLongNight.RetrySame() and RunSession.GetState()=='STAGE_CLEAR',
    'A repeated presentation cleanup failure does not prevent a new run')
assert(table.concat(messages,'\n'):find('injected ambience failure'),'The cleanup failure is still reported')
SurvivorStage.Cleanup=function()end
RunSession.Finish('test')
-- A failed pause hook at startup returns normally after Fail already showed the
-- error result (the shared mock's Fail raises instead, so only the real session shows this).
local intros=0;SurvivorUI.ShowStageIntro=function()intros=intros+1 end
SurvivorExpedition.SetPaused=function(paused)if paused and failPause then error('injected pause failure',0)end end
results,failPause={},true
AnyasLongNight.RetrySame()
failPause=false
assert(RunSession.GetState()=='FINISHED' and #results==1 and results[1].reason=='error' and intros==0,
    'Start must not open the introduction over the error result of a run its pause hook finished')
assert(CombatRun().hero==nil and AnyasLongNight.CanRetrySame(),'The failed start leaves a retryable setup')
-- A teardown requested while paused keeps the STAGE_CLEAR name until the watchdog
-- consumes it; stage actions must not start a transition the teardown then discards.
assert(AnyasLongNight.RetrySame() and RunSession.GetState()=='STAGE_CLEAR' and intros==1)
LifecycleRun().stageTransition=false
local applied=0;SurvivorStage.Apply=function()applied=applied+1 end
RunSession.RequestFail('injected paused failure')
assert(RunSession.GetState()=='STAGE_CLEAR' and RunSession.IsPending())
assert(not AnyasLongNight.NextStage() and applied==0 and LifecycleRun().stage==1,
    'A pending teardown blocks the next stage')
results={}
TickTimers()
assert(RunSession.GetState()=='FINISHED' and not RunSession.IsPending() and #results==1 and results[1].reason=='error',
    'The paused watchdog still consumes the request')
SurvivorStage.Apply=function()end
`);

suite('run-clock soul burst cooldown and the status-death guard reset across runs and after proc failures', mocks + String.raw`
function AddLightningEx()return {}end
`, [config, metrics, augments, combat], String.raw`
local cfg=SurvivorConfig.status
local function Kill(u)
    u.life=0;GetTriggerUnit=function()return u end
    for _,t in ipairs(triggers)do if t.event=='death' and not t.destroyed then t.action()end end
end
local function Burst(units,build)
    build.stats.sets.gravewarden=true
    local apply=SurvivorCombatStatus.Apply;local hit=Local(SurvivorCombat.CastExtra,'Hit')
    local near=EnemyAt(units,100,100,false);near.life=100000
    local cursed=EnemyAt(units,100,0,false);cursed.life=100000
    apply(cursed,'plaguedart',{curse=cfg.curseMax},1);hit(cursed,40,'plaguedart',false,false,1,{})
    hits={};Kill(cursed)
    for _,h in ipairs(hits)do if h.unit==near then return true end end
    return false
end
local _,build,units=NewCombat('plaguedart');now=600
assert(Burst(units,build),'The first soul burst fires')
SurvivorCombat.Cleanup()
_,build,units=NewCombat('plaguedart');now=5
assert(Burst(units,build),'A new run restarts at time zero and must not inherit the previous run cooldown')
now=10
local procVisual=Local(SurvivorCombatSets.StatusDeath,'ProcVisual')
SetLocal(SurvivorCombatSets.StatusDeath,'ProcVisual',function()error('injected proc failure')end)
Burst(units,build)
assert(not pcall(FlushRunSession),'The injected failure surfaces once the deferred request is consumed')
assert(Local(SurvivorCombatSets.StatusDeath,'inStatusProc')==false,'A failed proc must release the reentry guard')
SetLocal(SurvivorCombatSets.StatusDeath,'ProcVisual',procVisual)
now=20
assert(Burst(units,build),'Status-death set effects keep working after a failed proc')
SurvivorCombat.Cleanup()
`);

suite('deferred run teardown waits for the session callback or paused watchdog and a stalled gameplay clock fails the run', mocks + String.raw`
function ALICE_CallPeriodic(fn) periodic=fn;return fn end
function ALICE_DisableCallback() periodic=nil end
function ALICE_Halt() halted=true end
function ALICE_Resume() halted=false end
function ALICE_IsHalted() return halted==true end
function ALICE_SetErrorObserver(fn) errorObserver=fn end
messages={};print=function(message)messages[#messages+1]=tostring(message)end
`, [metrics,'src/20_system/RunSession.lua'], String.raw`
local finished,steps
local function Begin(step)
    finished,steps=nil,0
    assert(RunSession.Start(step or function()steps=steps+1 end,
        {pause=function()end,resume=function()end,finish=function(reason)finished=reason end}))
end
Begin()
RunSession.RequestFinish('defeated');RunSession.RequestFail('injected kill failure')
assert(RunSession.GetState()=='RUNNING' and not RunSession.IsRunning() and finished==nil,'Requests never tear down synchronously')
assert(not RunSession.BeginChoice() and not RunSession.BeginStageClear(),'A pending teardown cannot open a modal pause')
periodic()
assert(finished=='error' and steps==0 and RunSession.GetState()=='FINISHED','The session callback consumes the request before another step')
assert(table.concat(messages,'\n'):find('injected kill failure'),'An error request replaces a pending finish')
-- While paused the caller (a click or item event) may still use module state, so
-- the watchdog consumes the request on its next tick instead.
Begin();assert(RunSession.BeginChoice() and halted)
RunSession.RequestFinish('defeated')
assert(finished==nil and RunSession.GetState()=='CHOOSING' and halted,'A paused request never tears down under its caller')
assert(not RunSession.EndChoice() and RunSession.GetState()=='CHOOSING','A pending teardown cannot resume combat')
TickTimers();assert(finished=='defeated' and not halted and RunSession.GetState()=='FINISHED')
-- A step that requests teardown is finished by the same session callback after it returns.
Begin(function()RunSession.RequestFinish('defeated')end);periodic();assert(finished=='defeated')
-- Without PROTECTED_MODE ALICE halts its whole cycle after an actor error; the run must not stay RUNNING.
Begin();periodic();messages={}
for _=1,6 do TickTimers() end
assert(RunSession.GetState()=='RUNNING' and finished==nil,'Short stalls are tolerated')
for _=1,2 do TickTimers() end
assert(finished=='error' and table.concat(messages,'\n'):find('Gameplay clock stopped'),'A stopped gameplay clock fails the run')
for _,t in ipairs(timers)do assert(not t.running,'The watchdog timer is released on finish')end
-- Paused sessions and an advancing clock never trip the watchdog.
Begin();assert(RunSession.BeginChoice());for _=1,20 do TickTimers() end;assert(finished==nil)
assert(RunSession.EndChoice());for _=1,20 do periodic();TickTimers() end;assert(finished==nil)
RunSession.Finish('test')
-- Protected ALICE keeps cycling after an actor error; its observer reports the error,
-- and teardown waits until the actor loop has returned.
Begin();assert(type(errorObserver)=='function','A running session observes ALICE actor errors')
errorObserver('injected actor error')
assert(finished==nil and not RunSession.IsRunning(),'An actor error defers teardown')
periodic()
assert(finished=='error' and table.concat(messages,'\n'):find('ALICE actor error: injected actor error'))
assert(errorObserver==nil,'Finish releases the error observer')
-- A cycle that halted itself after an unprotected crash is resumed when the run ends.
Begin();halted=true;RunSession.Finish('test')
assert(not halted,'Finish resumes a self-halted ALICE cycle so released actors drain')
-- A direct Fail from a native timer can preempt a queued error; both causes are printed.
Begin();RunSession.RequestFail('injected root cause');messages={}
RunSession.Fail('injected secondary failure')
local log=table.concat(messages,'\n')
assert(finished=='error' and log:find('injected root cause') and log:find('injected secondary failure'),
    'A preempted pending error is still reported')
-- A pause must not adopt a cycle that ALICE halted itself: resuming it would hide the crash.
Begin();periodic();halted=true;messages={}
assert(not RunSession.SetInventoryOpen(true),'A pause on a self-halted cycle is refused')
assert(finished=='error' and table.concat(messages,'\n'):find('ALICE cycle halted'),'The hidden crash fails the run')
assert(not halted and RunSession.GetState()=='FINISHED','Finish still resumes the self-halted cycle once')
Begin();periodic();halted=true;assert(not RunSession.BeginChoice() and finished=='error','Choices refuse the halted cycle too')
-- A session-owned halt is still switched between pause reasons without failing.
Begin();assert(RunSession.BeginChoice() and halted);RunSession.SetInventoryOpen(true)
assert(RunSession.EndChoice() and RunSession.GetState()=='INVENTORY' and finished==nil)
RunSession.Finish('test')
`);

suite('kills and weapon damage in the tick of a pending teardown still count, without new procs', mocks + String.raw`
function ALICE_CallPeriodic(fn) periodic=fn;return fn end
function ALICE_DisableCallback() periodic=nil end
function ALICE_Halt() end
function ALICE_Resume() end
messages={};print=function(message)messages[#messages+1]=tostring(message)end
`, [config, metrics, augments, combat, 'src/20_system/RunSession.lua'], String.raw`
local finished,killed=nil,0
local _,_,units=NewCombat('plaguedart')
assert(RunSession.Start(function()end,{pause=function()end,resume=function()end,
    finish=function(reason)finished=reason;SurvivorCombat.Cleanup()end}))
CombatRun().onKill=function()killed=killed+1 end
local hit=Local(SurvivorCombat.CastExtra,'Hit')
local enemy=EnemyAt(units,100,0,false);enemy.life=10
onDamage=function(u)
    if u.life>0 then return end
    -- The same damage event also ends the run (e.g. the hero dies in this tick).
    RunSession.RequestFinish('defeated')
    GetTriggerUnit=function()return u end
    for _,t in ipairs(triggers)do if t.event=='death' and not t.destroyed then t.action()end end
end
hit(enemy,50,'plaguedart')
onDamage=nil
local totals=CombatRun().damageTotals
assert(killed==1,'A kill in the defeat tick is still reported to the run owner')
assert(totals.plaguedart.damage>0,'Damage dealt in the defeat tick stays attributed to its weapon')
assert(not RunSession.IsRunning() and finished==nil)
periodic();assert(finished=='defeated')
`);

suite('actual protected ALICE reports actor errors to its observer, disables only that pair and keeps cycling', mocks + String.raw`
ALICE_Config=nil
OnInit={final=function(_,initializer)aliceFixtureInitializer=initializer end}
for _,name in ipairs({'HERO','STRUCTURE','MECHANICAL','UNDEAD','TAUREN','ANCIENT','SAPPER','PEON','FLYING','GIANT','SUMMONED','TOWNHALL'})do
    _G['UNIT_TYPE_'..name]=name
end
`, ['src/05_vendor/ALICE.lua',config], String.raw`
local unusedTables=Local(aliceFixtureInitializer,'unusedTables')
SetLocal(ALICE_CallDelayed,'GetTable',function()
    local n=#unusedTables;if n==0 then return {} end
    local t=unusedTables[n];unusedTables[n]=nil;return t
end)
local main=Local(ALICE_Resume,'Main');SetLocal(main,'CYCLE_LENGTH',17);SetLocal(main,'MAX_STEPS',16)
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
assert(ALICE_Config.PROTECTED_MODE,'The map runs ALICE in protected mode')
local observed={}
ALICE_SetErrorObserver(function(message)observed[#observed+1]=tostring(message)end)
local failing,healthy=0,0
local bad=function()failing=failing+1;error('injected actor error',0)end
local good=function()healthy=healthy+1;return .02 end
local a,b=actor(),actor()
a.selfInteractions[bad]=makePair(a,selfActor,bad)
b.selfInteractions[good]=makePair(b,selfActor,good)
for _=1,3 do pcall(main) end
local seen=healthy
assert(#observed==1 and observed[1]=='injected actor error','Every caught actor error reaches the observer')
for _=1,5 do pcall(main) end
assert(failing==1,'Protected mode disables only the failing pair')
assert(healthy>seen and not ALICE_IsHalted(),'The cycle keeps running, so a stalled clock cannot reveal this error')
ALICE_SetErrorObserver(nil)
`);

suite('a kill-reward failure inside a weapon hit defers teardown until the hit returns', mocks + String.raw`
function ALICE_CallPeriodic(fn) periodic=fn;return fn end
function ALICE_DisableCallback() periodic=nil end
function ALICE_Halt() end
function ALICE_Resume() end
messages={};print=function(message)messages[#messages+1]=tostring(message)end
`, [config, metrics, augments, combat, 'src/20_system/RunSession.lua'], String.raw`
local finished
local _,_,units=NewCombat('plaguedart')
assert(RunSession.Start(function()end,{pause=function()end,resume=function()end,
    finish=function(reason)finished=reason;SurvivorCombat.Cleanup()end}))
CombatRun().onKill=function()error('injected kill reward failure')end
local hit=Local(SurvivorCombat.CastExtra,'Hit')
local enemy=EnemyAt(units,100,0,false);enemy.life=10
onDamage=function(u)
    if u.life>0 then return end
    GetTriggerUnit=function()return u end
    for _,t in ipairs(triggers)do if t.event=='death' and not t.destroyed then t.action()end end
end
hit(enemy,50,'plaguedart') -- Previously Fail cleaned combat here and the rest of Hit touched released state.
onDamage=nil
assert(finished==nil and RunSession.GetState()=='RUNNING' and not RunSession.IsRunning(),'Teardown waits outside the hit loop')
assert(CombatRun().hero~=nil,'Combat state stays owned while the hit unwinds')
periodic()
assert(finished=='error' and CombatRun().hero==nil)
assert(table.concat(messages,'\n'):find('injected kill reward failure'))
`);

suite('expedition teardown detaches markers before native calls and a failure cannot block the next reset', mocks + String.raw`
function DestroyTextTag(tag)assert(not tag.destroyed);tag.destroyed=true end
`, [config,'src/30_gameplay/SurvivorExpedition.lua'], String.raw`
local failing,other,tag={},{},{}
ExpeditionRun().objective={effect=failing,tag=tag}
ExpeditionRun().risk={effect=other}
local destroy=DestroyEffect
DestroyEffect=function(e)if e==failing then error('injected marker failure')end;destroy(e)end
local ok,message=pcall(SurvivorExpedition.EndStage)
DestroyEffect=destroy
assert(not ok and tostring(message):find('injected marker failure'))
assert(tag.destroyed and other.destroyed,'A failed marker removal still releases the remaining handles')
assert(ExpeditionRun().objective==nil and ExpeditionRun().risk==nil,
    'Ownership is detached before native calls')
SurvivorExpedition.Reset() -- Must not retry the failed handle.
`);

suite('combat trigger failures reach the run owner and a failed death proc keeps its kill reward', mocks + String.raw`
function AddLightningEx()return {}end
`, [config, metrics, augments, combat], String.raw`
local failures={}
RunSession.Fail=function(message)failures[#failures+1]=tostring(message)end
local _,build,units=NewCombat('plaguedart')
local kills=0
CombatRun().onKill=function()kills=kills+1 end
build.stats.sets.gravewarden=true
local apply=SurvivorCombatStatus.Apply;local hit=Local(SurvivorCombat.CastExtra,'Hit')
local near=EnemyAt(units,100,100,false);near.life=100000
local cursed=EnemyAt(units,100,0,false);cursed.life=100000
now=10 -- Past the initial soul-burst cooldown; the curse is applied at this time.
apply(cursed,'plaguedart',{curse=SurvivorConfig.status.curseMax},1);hit(cursed,40,'plaguedart',false,false,1,{})
local procVisual=Local(SurvivorCombatSets.StatusDeath,'ProcVisual')
SetLocal(SurvivorCombatSets.StatusDeath,'ProcVisual',function()error('injected proc failure')end)
cursed.life=0;GetTriggerUnit=function()return cursed end
for _,t in ipairs(triggers)do if t.event=='death' and not t.destroyed then t.action()end end
SetLocal(SurvivorCombatSets.StatusDeath,'ProcVisual',procVisual)
assert(kills==1,'A failed death proc must not cancel the kill reward')
assert(#failures==0 and not RunSession.IsRunning(),'A death-event failure is deferred, never raised inside the hit loop')
FlushRunSession()
assert(#failures==1 and failures[1]:find('injected proc failure'),'The proc failure reaches RunSession.Fail')
assert(Local(SurvivorCombatSets.StatusDeath,'inStatusProc')==false,'The status-death guard is released')
-- Hero damage: Debug.try would only print; the run owner must hear about it.
local hero=CombatRun().hero
local risk=SurvivorExpedition.RiskActive
SurvivorExpedition.RiskActive=function()error('injected damage failure')end
GetTriggerUnit=function()return hero end
GetEventDamage=function()return 10 end
GetEventDamageSource=function()return near end
BlzSetEventDamage=function()end
for _,t in ipairs(triggers)do if t.event=='damage' and not t.destroyed then t.action()end end
SurvivorExpedition.RiskActive=risk
FlushRunSession()
assert(#failures==2 and failures[2]:find('injected damage failure'),'Damage trigger failures reach RunSession.Fail')
SurvivorCombat.Cleanup()
`);

suite('stat recalculation keeps combat-owned pause flags and drops derived keys that are no longer produced', mocks,
    [config, augments], String.raw`
local build=SurvivorAugments.NewBuild('firebolt')
local stats=build.stats
stats.nativeRegenerationPaused,stats.combatPaused,stats.retiredDerivedKey=true,true,42
SurvivorAugments.Recalculate(build)
assert(build.stats==stats,'Combat keeps the same stats table')
assert(stats.nativeRegenerationPaused==true and stats.combatPaused==true,'Combat-owned pause flags survive')
assert(stats.retiredDerivedKey==nil,'A key Calculate no longer emits must not keep a stale value')
assert(stats.weapons.firebolt.enabled==true and stats.sets~=nil,'Derived values are still applied')
`);

suite('inventory observer and native loadout teardown release ownership after native failures', mocks + String.raw`
function GetLocalPlayer()return 0 end
function BlzTriggerRegisterPlayerSyncEvent()end
SurvivorCombat={EscapeStatus=function()return true,0 end,WardStatus=function()return 0,0 end}
SurvivorUI={SetRestInventoryVisible=function()end}
SurvivorLootUI={Init=function()end,Reset=function()if failLoot then error('injected loot reset failure')end end}
`, [config,metrics,augments,'src/30_gameplay/SurvivorNativeLoadout.lua','src/30_gameplay/SurvivorInventoryPause.lua'], String.raw`
SurvivorInventoryPause.Init()
local observerTimer,observerTrigger=timers[#timers],triggers[#triggers]
failLoot=true
assert(not pcall(SurvivorInventoryPause.Cleanup),'The loot UI failure is reported')
failLoot=false
assert(observerTimer.destroyed and observerTrigger.destroyed,'Native handles are still released')
SurvivorInventoryPause.Init();SurvivorInventoryPause.Cleanup()
local hero=CreateUnit(0,'hero',0,0,0);local build=SurvivorAugments.NewBuild('firebolt')
SurvivorNativeLoadout.Init(hero,build)
local remove=UnitRemoveAbility
UnitRemoveAbility=function(u,id)if id=='ASde'then error('injected ability failure')end;return remove(u,id)end
assert(not pcall(SurvivorNativeLoadout.Cleanup),'The ability failure is reported')
UnitRemoveAbility=remove
assert(GetUnitAbilityLevel(hero,'HsW1')==0,'Later removals still run after one failure')
local fresh=CreateUnit(0,'hero',0,0,0)
SurvivorNativeLoadout.Init(fresh,SurvivorAugments.NewBuild('firebolt'))
SurvivorNativeLoadout.Cleanup()
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
local objects=CombatRun().objects;local callbacksBefore=callbacks
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
for object in pairs(CombatRun().objects)do
    local registered=actor(object);for i=1,4 do createPair(registered,actor(),normal)end
end
state='STAGE_CLEAR';ALICE_Halt(false);SurvivorCombat.ClearBattlefieldAsync(function()error('cancelled completion')end)
stale=timers[#timers].callback;TickTimers();assert(#backlog>0)
SurvivorCombat.Cleanup();hero,build,units=NewCombat('firebolt');stale()
assert(not SurvivorCombat.IsClearing() and not hero.removed)
ALICE_Resume();main();assert(#backlog==0,'The next normal cycle can finish a cancelled partial drain')
SurvivorCombat.Cleanup();SurvivorMetrics.Enable(false)
`);

suite('equipment teardown removes every owned item and permits a fresh run after native failures', gearMocks,
    [config, metrics, augments, equipment], String.raw`
local hero=NewGear()
local first=SurvivorEquipment.DropAt(100,0,1);local second=SurvivorEquipment.DropAt(200,0,2)
local destroy=DestroyTrigger
DestroyTrigger=function()error('injected trigger failure')end
assert(not pcall(SurvivorEquipment.Cleanup),'The trigger failure is reported')
DestroyTrigger=destroy
assert(first.removed and second.removed,'Owned gear is removed even when trigger teardown fails')
NewGear();SurvivorEquipment.Cleanup()
`);
suite('equipment item-event failures reach the run owner instead of only printing', gearMocks,
    [config, metrics, augments, equipment], String.raw`
local hero=NewGear()
local failures={}
RunSession.Fail=function(message)failures[#failures+1]=tostring(message)end
local trigger=EquipmentRun().eventTrigger
local manipulated=GetManipulatedItem
GetTriggerUnit=function()return hero end
GetManipulatedItem=function()error('injected item event failure')end
trigger.action()
GetManipulatedItem=manipulated
assert(#failures==0 and EquipmentRun().hero==hero,'Item events fire inside equipment scans; teardown is deferred')
FlushRunSession()
assert(#failures==1 and failures[1]:find('injected item event failure'),'Item-event failures reach RunSession.Fail')
SurvivorEquipment.Cleanup()
`);

suite('equipment notices are presentation: a failing notifier inside the pickup scan never ends the run', gearMocks + String.raw`
messages={};print=function(message)messages[#messages+1]=tostring(message)end
`, [config, metrics, augments, equipment], String.raw`
local hero=NewGear();state='RUNNING';now=0
SurvivorUI.Notify=function()error('injected notice failure')end
assert(SurvivorEquipment.ClaimReward('Hs01'),'A reward is granted even when its notice fails')
local item=SurvivorEquipment.DropAt(hero.x,hero.y,CatalogIndex('Hs02'))
SurvivorEquipment.Step(1) -- The auto-pickup notice runs inside Step's owned-item loop.
assert(RunSession.IsRunning() and not RunSession.IsPending(),'A notice failure neither fails nor defers teardown')
assert(hero.bag[2]==item or hero.bag[1]==item,'The pickup itself completed')
local log=table.concat(messages,'\n')
assert(select(2,log:gsub('injected notice failure',''))>=2 and log:find('equipment notice'),'Each notice failure is reported')
SurvivorEquipment.Cleanup()
`);

suite('a paused rest pickup failure waits until the native item loop returns before the run is torn down', gearMocks + String.raw`
function ALICE_CallPeriodic(fn) periodic=fn;return fn end
function ALICE_DisableCallback() periodic=nil end
function ALICE_Halt() end
function ALICE_Resume() end
messages={};print=function(message)messages[#messages+1]=tostring(message)end
`, [config, metrics, 'src/20_system/RunSession.lua', augments, equipment], String.raw`
local hero=NewGear()
local finished
assert(RunSession.Start(function()end,{pause=function()end,resume=function()end,
    finish=function(reason)finished=reason;SurvivorEquipment.Cleanup()end}))
assert(RunSession.BeginStageClear() and RunSession.GetState()=='STAGE_CLEAR')
local reward=SurvivorEquipment.DropAt(hero.x,hero.y,CatalogIndex("Hs01"),true)
local manipulated=GetManipulatedItem
GetManipulatedItem=function()error('injected pickup failure')end
SurvivorEquipment.CollectRest() -- UnitAddItem raises the pickup event inside this scan.
GetManipulatedItem=manipulated
assert(finished==nil and EquipmentRun().hero==hero,'The scan finishes on owned state; no teardown under its native call')
assert(hero.bag[1]==reward)
TickTimers()
assert(finished=='error' and EquipmentRun().hero==nil,'The paused watchdog tick consumes the request')
assert(table.concat(messages,'\n'):find('injected pickup failure'))
`);

suite('bag family cleanup offers the playing hero\'s own elements and keeps tag sets shared', gearMocks, [config,metrics,augments,equipment], String.raw`
local function Same(list,expected)
    assert(#list==#expected,table.concat(list,','))
    for i,name in ipairs(expected)do assert(list[i]==name,table.concat(list,','))end
end
for _,case in ipairs({{weapon='firebolt',hero='anya'},{weapon='deathcoil',hero='putress'}})do
    local hero,build=NewGear(case.weapon,6)
    local expected,seen={}, {}
    for _,id in ipairs(SurvivorConfig.weaponOrder)do
        local w=SurvivorConfig.weapons[id]
        if w.hero==case.hero and not seen[w.element]then seen[w.element]=true;expected[#expected+1]=w.element end
    end
    expected[#expected+1]='공용'
    Same(SurvivorEquipment.CleanupFamilies(),expected)
    for _,entry in ipairs(SurvivorEquipment.Catalog())do
        if SurvivorEquipment.ForHero(entry.id)then
            local family=SurvivorEquipment.Family(entry.id)
            assert(seen[family]or family=='공용',case.hero..' cannot keep '..entry.id..' ('..family..')')
        end
    end
    SurvivorEquipment.Cleanup()
end
assert(SurvivorEquipment.FamilyLabel('얼음')=='냉기'and SurvivorEquipment.FamilyLabel('공용')=='공용')
local shared=0
for _,entry in ipairs(SurvivorEquipment.Catalog())do
    if entry.set and entry.hero==nil and SurvivorEquipment.Family(entry.id)=='공용' then shared=shared+1 end
end
assert(shared>0,'Attack-tag set pieces belong to the shared family')
`);
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
        '확장 인벤토리에서 장착 시 적용','두 칸 중 하나'})do assert(not description:find(text,1,true))end
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
local item;for candidate in pairs(EquipmentRun().owned)do item=candidate end
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
local pending;for item,record in pairs(EquipmentRun().owned)do if record.pendingReward then pending=item end end
revision=renderedRevision;RemoveItem(pending);bagReads=0;TickTimers()
assert(bagReads==6 and renderedRevision>revision and SurvivorEquipment.PendingRewardCount()==0)
SurvivorInventoryPause.Cleanup();SurvivorNativeLoadout.Cleanup();SurvivorEquipment.Cleanup()
`);

suite('chosen rewards survive expiry/cap/transition and collect before ordinary loot', gearMocks,
    [config, metrics, augments, equipment], String.raw`
local hero,build=NewGear("firebolt",1)
hero.bag[1]=CreateItem("Hs15",0,0)
assert(SurvivorEquipment.ClaimReward("Hs04"))
local owned=EquipmentRun().owned;local reward
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
for item,record in pairs(EquipmentRun().owned)do if record.pendingReward then pending=item end end
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
SurvivorEquipment.Init(hero,build,function(text)SurvivorUI.Notify(text)end)
assert(build.revision==revision and hero.maxLife==maximum+build.stats.equipmentLife,
    'Initial hero stats apply even when the initial equipment snapshot is empty')
local _,storm=SurvivorEquipment.Summary("Ht02")
assert(storm=='|cff80d0ff[번개]|r 성벽 파수꾼의 장구\n2개·4개 세트 효과\n연계: 연쇄 번개·폭풍의 부름·폭풍 구슬',
    'Set cards name their element and linked weapons')
local _,ember=SurvivorEquipment.Summary("Ha01")
assert(ember=='|cffff8040[화염]|r 스트라솔름 인도자의 유산\n3개·5개 세트 효과\n연계: |cff80ff80잿불 화살|r·잿불 발자취·잿불 낙성',
    'Owned linked weapons are highlighted')
assert(select(2,SurvivorEquipment.Summary("Hs01"))=='단품 장비 · 세트 없음')
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
for item,record in pairs(EquipmentRun().owned) do if record.pendingReward then pending=item end end
ui=SurvivorEquipment.UIRevision();RemoveItem(assert(pending))
assert(SurvivorEquipment.UIRevision()>ui and SurvivorEquipment.PendingRewardCount()==0,
    'External removal of a pending reward must invalidate a paused inventory display')
SurvivorEquipment.Cleanup()
`);

suite('gear is split by hero: shared pieces serve both, Putress gear and sets roll only for Putress', gearMocks + String.raw`
function GetRandomInt(a,b)randomSeed=(randomSeed or 7)*1103515245%2147483648;return a+randomSeed%(b-a+1)end
`, [config, metrics, augments, equipment], String.raw`
local counts={}
for _,entry in ipairs(SurvivorEquipment.Catalog())do counts[entry.hero or 'shared']=(counts[entry.hero or 'shared']or 0)+1 end
assert(counts.shared==79 and counts.putress==66 and counts.anya==75,'Shared 79, Anya 75 and Putress 66 gear entries')
for _,entry in ipairs(SurvivorEquipment.Catalog())do
    for scope in pairs(entry.bonuses)do
        assert(scope=='all' or entry.hero==nil or SurvivorConfig.weapons[scope].hero==entry.hero,'Gear bonuses target only their own hero or an explicit shared tag: '..entry.id)
    end
end
local roll=Local(SurvivorEquipment.OnKill,'RollIndex')
local hero,build=NewGear('deathcoil',6)
local seen={}
for i=1,400 do
    local entry=SurvivorEquipment.Catalog()[roll(i%4==0,i%7==0)];seen[entry.hero or 'shared']=true
    assert(entry.hero~='anya','Putress never rolls Anya gear: '..entry.id)
end
assert(seen.putress and seen.shared,'Putress rolls both shared and Putress gear')
for i=1,20 do
    for _,id in ipairs(SurvivorEquipment.RollBossReward())do assert(SurvivorEquipment.Get(id).hero~='anya')end
    for _,id in ipairs(SurvivorEquipment.RollRiskReward())do assert(SurvivorEquipment.Get(id).hero~='anya')end
end
SurvivorEquipment.Cleanup()
hero,build=NewGear('firebolt',6)
for i=1,400 do assert(SurvivorEquipment.Catalog()[roll(i%4==0,false)].hero~='putress','Anya never rolls Putress gear')end
SurvivorEquipment.Cleanup()
hero,build=NewGear('plaguedart',6)
hero.equipped[1]=CreateItem('Hs19',0,0);SurvivorEquipment.Reconcile()
assert(build.stats.status.plaguedart.poison==SurvivorConfig.weapons.plaguedart.poison[1]+1 and build.stats.weapons.plaguedart.pierce==3,
    'Weapon gear adds poison stacks and pierce to its Putress weapon')
for i,id in ipairs({'Hp01','Hp02','Hp03','Hp04'})do hero.equipped[i]=CreateItem(id,0,0)end
SurvivorEquipment.Reconcile();assert(build.stats.sets.apothecary and not build.stats.sets.gravewarden,'Four apothecary pieces enable its set effect')
local _,summary=SurvivorEquipment.Summary('Hp01');assert(summary:find('[독]',1,true)and summary:find('역병 침',1,true))
SurvivorEquipment.Cleanup()
`);

suite('putress set effects spread poison, burst cursed deaths and strengthen reactions', mocks + String.raw`
function AddLightningEx()return {}end
`, [config, metrics, augments, combat], String.raw`
local hero,build,units=NewCombat('plaguedart')
local apply=SurvivorCombatStatus.Apply;local hit=Local(SurvivorCombat.CastExtra,'Hit')
local cfg=SurvivorConfig.status
local function Kill(u)
    u.life=0;GetTriggerUnit=function()return u end
    for _,t in ipairs(triggers)do if t.event=='death' and not t.destroyed then t.action()end end
end
local dead=EnemyAt(units,0,100,false);local near=EnemyAt(units,100,100,false);local far=EnemyAt(units,2000,0,false)
for _,u in ipairs({dead,near,far})do u.life=100000 end
apply(dead,'plaguedart',{poison=20},1);assert(units[dead].poison==cfg.poisonMax,'Poison caps without the set')
build.stats.sets.apothecary=true
apply(dead,'plaguedart',{poison=20},1);assert(units[dead].poison==cfg.poisonMax+4,'Apothecary raises the poison cap')
Kill(dead)
assert(units[near].poison==8 and (units[far].poison or 0)==0,'Poison spreads half the stacks only to nearby enemies')
build.stats.sets.apothecary=false;build.stats.sets.gravewarden=true
local cursed=EnemyAt(units,100,0,false);cursed.life=100000
apply(cursed,'plaguedart',{curse=3},1);hit(cursed,40,'plaguedart',false,false,1,{})
hits={};Kill(cursed)
local burst=0;for _,h in ipairs(hits)do if h.unit==near then burst=burst+1 end end
assert(burst==1 and units[near].curse==1,'Gravewarden bursts the last hit onto nearby enemies and curses them')
hits={};local again=EnemyAt(units,110,0,false);again.life=100000
apply(again,'plaguedart',{curse=3},1);Kill(again)
assert(#hits==0,'The soul burst waits for its one-second cooldown')
build.stats.sets.gravewarden=false;build.stats.sets.apprentice=true
local target=EnemyAt(units,300,0,false);target.life=100000;units[target].poison=0
apply(target,'plaguedart',{poison=4},1);now=now+1;hits={}
hit(target,1,'plaguedart',false,false,1,{reaction=1})
assert(math.abs(hits[2].damage-2*cfg.reactionDamage*build.stats.poisonDamage/cfg.poisonDamage*1.6)<1e-6,'Apprentice reactions deal 60% more')
local victim=EnemyAt(units,500,0,false);victim.life=1;apply(victim,'plaguedart',{poison=4},1);now=now+1
local before=#actors;hit(victim,0.5,'plaguedart',false,false,1,{reaction=1})
local residue;for i=before+1,#actors do if actors[i].identifier=='hsExtraZone' then residue=actors[i] end end
assert(residue and residue.status.poison==1 and residue.x==500,'A reaction kill leaves a poison residue')
SurvivorCombat.Cleanup()
`);

suite('shared attack-tag sets support both heroes, exact thresholds and relevant reward weights', gearMocks,
    [config,metrics,augments,equipment], String.raw`
local definitions={
    {code='Hu',flag='commander',tag='소환',weapons={'banshee','plaguezombie'}},
    {code='Ho',flag='bombardier',tag='낙하',weapons={'meteor','plaguejar'}},
    {code='Hx',flag='destroyer',tag='폭발',weapons={'frostnova','catalyst'}},
    {code='Hy',flag='tracker',tag='관통',weapons={'frostshard','plaguedart'}},
    {code='Hj',flag='pursuer',tag='유도',weapons={'firebolt','deathcoil','thunderorb','boilingflask'}},
    {code='Hk',flag='bulwark',tag='근접',weapons={'orbitblade','wraithguard','frontslash','corrosion'}},
    {code='Hz',flag='mire',tag='장판',weapons={'flamefield','plaguetrail','blizzard','plaguepool'}},
    {code='Hw',flag='conductor',tag='연쇄',weapons={'chainlightning','soulchain','thunderorb','boilingflask'}}}
local counts,total={},0
for _,entry in ipairs(SurvivorEquipment.Catalog())do
    total=total+1
    if entry.set then counts[entry.set]=(counts[entry.set]or 0)+1 end
end
assert(total==220)
local setCount=0;for _ in pairs(counts)do setCount=setCount+1 end;assert(setCount==22)
for _,definition in ipairs(definitions)do
    assert(counts[definition.flag]==9)
    for _,weapon in ipairs(definition.weapons)do
        local hero,build=NewGear(weapon,12)
        local function Value()
            local source=build.stats.weapons[weapon]
            if definition.flag=='pursuer'then return source.damage end
            if definition.flag=='bulwark'then return source.radius or source.range end
            if definition.flag=='mire'or definition.flag=='commander'then return source.duration end
            if definition.flag=='conductor'or definition.flag=='bombardier'then return source.interval end
            if definition.flag=='destroyer'then return source.radius end
            return source.damage
        end
        local original=Value()
        local companion=definition.flag=='conductor'and(build.hero=='anya'and'firebolt'or'deathcoil')
            or build.hero=='anya'and'chainlightning'or'soulchain'
        build.levels[companion]=1;build.weapons[#build.weapons+1]=companion;SurvivorAugments.Recalculate(build,hero)
        local function Other()
            return build.stats.weapons[companion].damage
        end
        local other=Other()
        for i=1,2 do hero.equipped[i]=CreateItem(definition.code..string.format('%02d',i),0,0)end
        SurvivorEquipment.Reconcile()
        local expected=definition.flag=='commander'and original+2 or definition.flag=='mire'and original+1
            or (definition.flag=='bombardier'or definition.flag=='conductor')and original/1.15
            or definition.flag=='destroyer'and original*1.2 or original*1.15
        assert(math.abs(Value()-expected)<1e-8,'Two-piece bonus: '..definition.flag..'/'..weapon)
        assert(not build.stats.sets[definition.flag],'Two pieces do not enable the four-piece effect')
        assert(Other()==other,'Only the matching tag benefits')
        local id=definition.code..'01';assert(SurvivorEquipment.Get(id).hero==nil and SurvivorEquipment.ForHero(id) and SurvivorEquipment.FitsBuild(id))
        local _,summary=SurvivorEquipment.Summary(id)
        assert(summary:find(SurvivorAugments.AttackTag(definition.tag),1,true))
        for i=3,4 do hero.equipped[i]=CreateItem(definition.code..string.format('%02d',i),0,0)end
        SurvivorEquipment.Reconcile();assert(build.stats.sets[definition.flag])
        local stats,revision=build.stats,build.revision
        SurvivorEquipment.Reconcile();assert(build.stats==stats and build.revision==revision,'Reconciliation must not stack bonuses')
        hero.equipped[4]=nil;SurvivorEquipment.Reconcile();assert(not build.stats.sets[definition.flag])
        for _,offer in ipairs(SurvivorEquipment.RollBossReward())do assert(SurvivorEquipment.ForHero(offer))end
        assert(SurvivorEquipment.FitsBuild(SurvivorEquipment.RollRiskReward()[1]))
        SurvivorEquipment.Cleanup()
    end
end
local hero,build=NewGear('banshee',12)
local roll=Local(SurvivorEquipment.OnKill,'RollIndex');local weighted=Local(roll,'WeightedChoice')
local maxWeight,choice
function GetRandomInt(a,b)maxWeight=b;return choice or a end
assert(weighted({'Hu02','Ha01'})=='Hu02'and maxWeight==4,'A relevant tag item has three times the normal weight')
hero.equipped[1]=CreateItem('Hu01',0,0);SurvivorEquipment.Reconcile()
assert(weighted({'Hu02','Ha01'})=='Hu02'and maxWeight==7,'An unfinished matching set gets double weight')
choice=7;assert(weighted({'Hu02','Ha01'})=='Ha01','Unrelated items remain available')
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
assert(math.abs(build.stats.weapons.firebolt.damage-SurvivorConfig.weaponEngines.missile.base.damage*1.20)<0.0001)
local sources,equipped=Local(SurvivorEquipment.Reconcile,"Sources")(Local(SurvivorEquipment.Reconcile,"ReadSlots")())
assert(sources["set:ember:2"]==nil,"Two identical rings must not activate a two-piece set")
local text=SurvivorEquipment.Describe("He05",equipped)
assert(text:find("1/9") and not text:find("기본 능력치는 각각 적용") and not text:find("동일 장비의 세트 개수는 1개"))
hero.equipped[3]=CreateItem("Hs04",0,0);SurvivorEquipment.Reconcile()
assert(math.abs(build.stats.weapons.firebolt.damage-SurvivorConfig.weaponEngines.missile.base.damage*1.35)<0.0001)
SurvivorEquipment.Cleanup()
`);
