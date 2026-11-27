// Warcraft native mocks (Lua) shared by the suites; each suite appends its own overrides.
export const mocks = String.raw`
world, actors, timers, hits, triggers = {}, {}, {}, {}, {}
now, state, serial, removed = 0, "RUNNING", 0, 0
ALICE_Config = {MIN_INTERVAL = 0.02}
ALICE_Initialized = true
bj_DEGTORAD, bj_RADTODEG = math.pi / 180, 180 / math.pi
UNIT_TYPE_FLYING, EVENT_PLAYER_UNIT_DEATH, EVENT_PLAYER_UNIT_DAMAGED = "flying", "death", "damage"
EVENT_PLAYER_UNIT_PICKUP_ITEM = "pickup"
UNIT_STATE_MANA, UNIT_STATE_MAX_MANA = "mana", "maxMana"
UNIT_RF_HIT_POINTS_REGENERATION_RATE = 'uhpr'
function FourCC(x) return x end
function OrderId(x) return x end
function Player(x) return x end
playerColors, playerNames, alliances, ALLIANCE_PASSIVE = {}, {}, {}, 'passive'
function GetPlayerColor(p) return playerColors[p] or 'color' .. tostring(p) end
function SetPlayerColor(p,c) playerColors[p]=c end
function GetPlayerName(p) return playerNames[p] or 'Player ' .. tostring(p) end
function SetPlayerName(p,n) playerNames[p]=n end
function SetPlayerAlliance(a,b,kind,on) alliances[tostring(a) .. '>' .. tostring(b) .. ':' .. kind]=on end
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
function BlzGetUnitArmor(u) return u.armor or 0 end
function BlzSetUnitArmor(u,v) u.armor=v end
function BlzSetUnitRealField(u,field,value)
    assert(not u.removed);u.realFields=u.realFields or {};u.realFields[field]=value;return true
end
function BlzGetUnitRealField(u,field)return u.realFields and u.realFields[field] or 0 end
function GetHandleId(u) return u.handle end
function GetOwningPlayer(u) return u.owner end
function GetUnitName(u) return u.id end
function SetUnitMoveSpeed(u,v) u.speed=v end
function GetUnitMoveSpeed(u) return u.speed end
function SetUnitVertexColor(u,r,g,b,a) u.color={r,g,b,a};u.colorWrites=(u.colorWrites or 0)+1 end
function BlzSetSpecialEffectMatrixScale(e,x,y,z)e.matrixScale={x,y,z}end
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
function TriggerRegisterPlayerUnitEvent(t,p,e) t.event=e;t.player=p end
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
function AddLightningEx(kind,visible,x,y,z,tx,ty,tz)return {kind=kind,x=x,y=y,z=z,tx=tx,ty=ty,tz=tz}end
ANIM_TYPE_ATTACK,ANIM_TYPE_WALK,ANIM_TYPE_STAND='attack','walk','stand'
function BlzPlaySpecialEffect(effect,animation)effect.animation=animation end
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
function UnitRemoveAbility(u,id) u.abilities[id]=nil;if u.abilityHandles then u.abilityHandles[id]=nil end end
function SetUnitAbilityLevel(u,id,level) u.abilities[id]=level end
function ConvertAbilityRealLevelField(id)return id end
function BlzGetUnitAbility(u,id)
    if GetUnitAbilityLevel(u,id)==0 then return nil end
    u.abilityHandles=u.abilityHandles or {};u.abilityHandles[id]=u.abilityHandles[id]or{realFields={}}
    return u.abilityHandles[id]
end
function BlzSetAbilityRealLevelField(a,field,level,value)
    a.realFields[field]=a.realFields[field]or{};a.realFields[field][level]=value;return true
end
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
-- Like the real session, a request is deferred and stops IsRunning until the
-- session callback consumes it; FlushRunSession() plays that callback.
RunSession = {GetElapsed=function() return now end,
    IsRunning=function() return state=="RUNNING" and pendingFailure==nil end,
    IsPending=function() return pendingFailure~=nil end,
    GetState=function() return state end, Fail=function(message) error(message) end,
    RequestFail=function(message) if pendingFailure==nil then pendingFailure=tostring(message) end end,
    IsInventoryOpen=function() return state=="INVENTORY" end,
    Attempt=function(errors,label,action)
        local ok,result=pcall(action)
        if not ok then errors[#errors+1]=label..": "..tostring(result) end
        return ok,result
    end,
    CancelTimer=function(errors,label,timer)
        if not timer then return end
        RunSession.Attempt(errors,label.." pause",function() PauseTimer(timer) end)
        RunSession.Attempt(errors,label.." destroy",function() DestroyTimer(timer) end)
    end,
    DestroyTrigger=function(errors,label,trigger)
        if trigger==nil then return end
        RunSession.Attempt(errors,label,function() DestroyTrigger(trigger) end)
    end,
    TriggerAction=function(action)
        return function()
            local ok,message=pcall(action)
            if not ok then RunSession.RequestFail(message) end
        end
    end}
function FlushRunSession()
    local message=pendingFailure
    pendingFailure=nil
    if message~=nil then RunSession.Fail(message) end
end
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
-- Game-module internals by logical module and local name. Suites never name the public
-- function whose closure happens to hold a local: moving a local or function to another
-- file changes only this table. A module may span files whose bound copies of a primitive
-- (the weapon module's Hit, its attached run) hold the same value: reads accept them, a
-- write needs exactly one cell. Vendor (ALICE) internals keep using Local/SetLocal.
local internalFiles = {
    lifecycle = {"AnyasLongNight", "SurvivorSetup"}, progression = {"SurvivorProgression"},
    debug = {"SurvivorDebugCommands"}, combat = {"SurvivorCombat", "SurvivorCombatWeapons"},
    sets = {"SurvivorCombatSets"}, status = {"SurvivorCombatStatus"}, hazards = {"SurvivorCombatHazards"},
    ui = {"SurvivorUI"}, narrative = {"SurvivorNarrativeUI"}, speech = {"SurvivorSpeech"},
    screen = {"SurvivorScreenEffects"}, board = {"SurvivorDamageBoard"}, hud = {"SurvivorNativeHUD"},
    loot = {"SurvivorLootUI"}, loadout = {"SurvivorNativeLoadout"}, inventory = {"SurvivorInventoryPause"},
    metrics = {"SurvivorMetrics"}, augments = {"SurvivorAugments"}, equipment = {"SurvivorEquipment"},
    story = {"SurvivorStory"}, stage = {"SurvivorStage"}, expedition = {"SurvivorExpedition"},
}
-- Every function defined in the module's files that globals reach (tables up to three
-- levels deep, closures through their upvalues); cached per module and rebuilt once on a miss.
local internalFunctions = {}
local function OwnedFunctions(module)
    local files=assert(internalFiles[module],"Unknown internal module "..tostring(module))
    local function Owned(fn)
        local source=debug.getinfo(fn,"S").source
        for _,file in ipairs(files) do if source:sub(-#file-5)=="/"..file..".lua" then return true end end
        return false
    end
    local seen,queue={}, {}
    local function Visit(value,depth)
        if seen[value] then return end
        if type(value)=="function" then seen[value]=true; if Owned(value) then queue[#queue+1]=value end
        elseif type(value)=="table" and depth<3 then seen[value]=true; for _,child in pairs(value) do Visit(child,depth+1) end end
    end
    for name,value in pairs(_G) do if name~="_G" and name~="package" then Visit(value,0) end end
    local head=1
    while head<=#queue do
        local fn=queue[head]; head=head+1
        for i=1,255 do
            local name,value=debug.getupvalue(fn,i); if not name then break end
            if type(value)=="function" and not seen[value] then seen[value]=true; if Owned(value) then queue[#queue+1]=value end end
        end
    end
    internalFunctions[module]=queue
    return queue
end
-- Every distinct upvalue cell named key among those functions, as {function, index, value}.
local function InternalCells(module,key,rebuilt)
    local found,cells={}, {}
    for _,fn in ipairs(internalFunctions[module] or OwnedFunctions(module)) do
        for i=1,255 do
            local name,value=debug.getupvalue(fn,i); if not name then break end
            local id=name==key and debug.upvalueid(fn,i)
            if id and not found[id] then found[id]=true; cells[#cells+1]={fn,i,value} end
        end
    end
    if #cells==0 and not rebuilt then OwnedFunctions(module); return InternalCells(module,key,true) end
    assert(#cells>0,"Missing internal "..module.."."..key)
    return cells
end
function Internal(module,key)
    local cells=InternalCells(module,key)
    for i=2,#cells do assert(rawequal(cells[i][3],cells[1][3]),"Ambiguous internal "..module.."."..key) end
    return cells[1][3]
end
function SetInternal(module,key,value)
    local cells=InternalCells(module,key)
    assert(#cells==1,"Ambiguous internal "..module.."."..key)
    debug.setupvalue(cells[1][1],cells[1][2],value)
end
-- The current combat run table (SurvivorCombat's NewRun()): read or set its fields
-- instead of reaching for individual module locals. Cleanup replaces the table, so
-- call this again after a cleanup instead of keeping the old reference.
function CombatRun() return Internal("combat","run") end
-- The lifecycle's current run record (AnyasLongNight's NewRun()); Start replaces it.
function LifecycleRun() return Internal("lifecycle","run") end
-- Equipment's run (hero, trigger, owned item records, tooltip state); Init and Cleanup replace it.
function EquipmentRun() return Internal("equipment","run") end
-- The story record (clues, transcript, stage) that Reset replaces, and the open scene
-- (portraits, actors, camera, motion) that every Cleanup replaces.
function StoryRun() return Internal("story","run") end
function StoryScene() return Internal("story","scene") end
-- The stage arena of this run (rect, bounds, ambience owners) that Cleanup replaces, and
-- the applied stage's view (scenery, weather, painted terrain, pathing) that each Apply replaces.
function StageRun() return Internal("stage","run") end
function StageView() return Internal("stage","view") end
-- Expedition's run (journal records, current stage markers); EndStage and Reset replace it.
function ExpeditionRun() return Internal("expedition","run") end
function NewCombat(weapon)
    world,actors,hits={}, {}, {}; state="RUNNING"; now=0
    local hero=CreateUnit(0,"hero",0,0,0)
    local build=SurvivorAugments.NewBuild(weapon,nil,SurvivorConfig.weapons[weapon].hero)
    SurvivorCombat.Init(hero,build.stats,{minX=-5000,maxX=5000,minY=-5000,maxY=5000},nil,nil,"normal")
    SurvivorCombat.TrackWeapons({weapon})
    return hero,build,CombatRun().units
end
function EnemyAt(units,x,y,fly)
    local u=CreateUnit(12,"enemy",x,y,0); u.flying=fly; u.flyHeight=fly and 300 or 0
    units[u]={enemy=true,alive=true,baseSpeed=220}
    CombatRun().enemyCount=select(1,SurvivorCombat.Counts())+1
    return u
end
`;
export const bossTelegraphMocks = mocks + String.raw`
SurvivorExpedition.UseAdvantage=function()return advantage==true end
function SetUnitFacing()end
function BlzSetSpecialEffectScale(e,s)e.scale=s end
function BlzSetSpecialEffectYaw(e,a)e.yaw=a end
function BlzSetSpecialEffectPosition(e,x,y,z)e.x,e.y,e.z=x,y,z end
function BlzSetSpecialEffectColor(e,r,g,b)e.color={r,g,b}end
function BlzSetSpecialEffectAlpha(e,a)e.alpha=a;e.alphaWrites=(e.alphaWrites or 0)+1 end
`;
export const gearMocks = mocks + String.raw`
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
-- The run owner injects the notifier; fixtures forward to their SurvivorUI mock.
function NewGear(weapon,capacity)
    local hero=CreateUnit(0,"hero",0,0,0);hero.bag,hero.equipped,hero.capacity={},{},capacity or 6
    local build=SurvivorAugments.NewBuild(weapon or "firebolt",nil,SurvivorConfig.weapons[weapon or "firebolt"].hero)
    SurvivorEquipment.Init(hero,build,function(text)SurvivorUI.Notify(text)end)
    return hero,build
end
function CatalogIndex(id)
    for i,entry in ipairs(SurvivorEquipment.Catalog())do if entry.id==id then return i end end
    error("Missing item "..id)
end
`;
export const presentationMocks = mocks + String.raw`
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
    "CAMERA_FIELD_ZOFFSET","CAMERA_FIELD_ROLL","CAMERA_FIELD_FIELD_OF_VIEW","CAMERA_FIELD_FARZ","ANIM_TYPE_STAND","ANIM_TYPE_WALK","ANIM_TYPE_SPELL","ANIM_TYPE_DEATH"})do _G[name]=name end
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
function BlzFrameSetEnable(f,v)RequireFrameObject(f,'BlzFrameSetEnable');f.enabled=v
    f.enableWrites=(f.enableWrites or 0)+1 end
function BlzFrameGetEnable(f)RequireFrameObject(f,'BlzFrameGetEnable');return f.enabled end
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
function SetUnitFlyHeight(u,height)u.flyHeight=height end
function BlzShowUnitTeamGlow(u,show)u.teamGlow=show end
function SetUnitAnimation(u,name)u.animation=name end
function BlzSetUnitSkin(u,skin)u.skin=skin end
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
function GetRectCenterX(r)return (r.minX+r.maxX)/2 end
function GetRectCenterY(r)return (r.minY+r.maxY)/2 end
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
AnyasLongNight={CanRetrySame=function()return true end,RetrySame=function()retryCalls=(retryCalls or 0)+1;return true end}
`;
export const timeStopFilterMocks = String.raw`
BLEND_MODE_BLEND,TEXMAP_FLAG_NONE='blend','none'
filter={visible=false,writes=0}
function SetCineFilterTexture(value)filter.texture=value end
function SetCineFilterBlendMode(value)filter.blend=value end
function SetCineFilterTexMapFlags(value)filter.flags=value end
function SetCineFilterStartUV(...)filter.startUV={...}end
function SetCineFilterEndUV(...)filter.endUV={...}end
function SetCineFilterDuration(value)filter.duration=value end
function SetCineFilterStartColor(r,g,b,a)filter.color={r,g,b,a};filter.writes=filter.writes+1 end
function SetCineFilterEndColor(r,g,b,a)filter.endColor={r,g,b,a}end
function DisplayCineFilter(value)filter.visible=value end
`;
export const stageMocks = presentationMocks + String.raw`
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
