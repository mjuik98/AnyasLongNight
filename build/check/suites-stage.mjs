// Stage arenas, scenery, ambience and reachability.
import assert from 'node:assert/strict';
import {collectSources, terrainInfo, mapInfo, baseMapPath} from '../build.mjs';
import {openMap} from '../mpq.mjs';
import {config, metrics, suite, uiModules} from './harness.mjs';
import {mocks, stageMocks} from './mocks.mjs';
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
assert(ok and replacement.volume==8 and StageView().soundVolume==8,
    'A failed optional native must neither stop gameplay nor cache an unapplied gain')
soundVolumeError=false;SurvivorStage.SetDialogueAmbience(false,'ui')
assert(replacement.volume==18 and replacement.volumeWrites==2,'A later update retries the failed gain')
SurvivorStage.SetDialogueAmbience(true);SurvivorStage.Cleanup()
assert(replacement.volume==18 and replacement.stopped and next(StageRun().dialogueAudioOwners)==nil)
SurvivorStage.Init({minX=-5000,minY=-5000,maxX=5000,maxY=5000});SurvivorStage.Apply(3)
assert(soundHandles[#soundHandles].volume==18,'A restarted run does not inherit a stale owner')
SurvivorStage.Cleanup()
`);

suite('actual intro, story and stage modules keep ambience ducked until both dialogue owners release it', stageMocks,
    [config,metrics,'src/30_gameplay/SurvivorStage.lua','src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorStage.Init({minX=-5000,minY=-5000,maxX=5000,maxY=5000});SurvivorStage.Apply(1)
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local loop=soundHandles[1];state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',0,0,0);local completed=0
SurvivorStory.ShowBriefing(hero,function()completed=completed+1 end)
local owners=StageRun().dialogueAudioOwners
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
    [config,metrics,'src/30_gameplay/SurvivorStage.lua','src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorStage.Init({minX=-5000,minY=-5000,maxX=5000,maxY=5000})
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',0,0,0);local completed=0
local function Done()completed=completed+1 end
local function Scenery()
    local result={}
    for key,effect in pairs(StageView().sceneProps)do
        assert(not effect.destroyed and effect.alpha~=0)
        assert(math.abs(effect.z-(45+effect.x*.001+effect.y*.002))<.001,
            'Static scenery remains grounded instead of being retired below the terrain')
        assert(effect.animation==ANIM_TYPE_STAND,'Persistent props explicitly use their idle animation')
        result[key]={effect=effect,x=effect.x,y=effect.y,z=effect.z}
    end
    return result
end
local function Survives(snapshot)
    local props=StageView().sceneProps
    for key,entry in pairs(snapshot)do
        local effect=entry.effect
        assert(props[key]==effect and not effect.destroyed and effect.alpha~=0
            and effect.x==entry.x and effect.y==entry.y and effect.z==entry.z,
            'Dialogue cleanup must preserve the same visible static landscape handle')
    end
end
local function Closed(actors,portraits)
    assert(hero.visible and #StoryScene().sceneEffects==0)
    for _,effect in ipairs(actors)do assert(effect.destroyed,'Actors, patrols and carried evidence are scene-owned')end
    for _,unit in pairs(portraits)do assert(unit.removed,'Portrait proxies remain scene-owned')end
    assert(StoryScene().motion==nil
        and StoryScene().cameraGuardTimer==nil,'Dialogue timers still retire with their scene')
end
local previous
for index=1,5 do
    SurvivorStage.Apply(index)
    if previous then for _,entry in pairs(previous)do
        assert(entry.effect.destroyed,'A stage transition removes the preceding scene scenery')
    end end
    assert(next(StageView().sceneProps)==nil,'Stage application resets scenery keys')
    if index==1 then
        SurvivorStory.ShowBriefing(hero,Done)
        local snapshot=Scenery();local count=0;for _ in pairs(snapshot)do count=count+1 end
        assert(count==4 and not hero.visible,'The briefing separates its grave and footprints from its two actors')
        local actors,portraits=StoryScene().sceneEffects,StoryScene().portraitUnits
        assert(#actors==2)
        SurvivorUI.SkipConversation();Closed(actors,portraits);Survives(snapshot)
    end
    local function Open()
        if index<5 then SurvivorStory.ShowInterlude(index,hero,Done)else SurvivorStory.ShowEnding(hero,Done)end
    end
    finding=nil;Open()
    local actors,portraits=StoryScene().sceneEffects,StoryScene().portraitUnits
    assert(not hero.visible and #actors==({2,3,2,5,4})[index],
        'Only actors, the sample, patrols and moving ending transport belong to Story')
    local snapshot=Scenery()
    for _,entry in pairs(snapshot)do for _,actor in ipairs(actors)do
        assert(entry.effect~=actor,'Stage scenery cannot enter the scene actor cleanup list')
    end end
    local before=#StageView().effects
    assert(before<=96)
    for _=1,index==5 and 5 or 4 do SurvivorUI.AdvanceNarrative()end
    Closed(actors,portraits);Survives(snapshot)
    finding=true;Open()
    local retryActors,retryPortraits=StoryScene().sceneEffects,StoryScene().portraitUnits
    assert(#StageView().effects==before,'Replaying a scene never duplicates static scenery')
    Survives(snapshot)
    if index==4 then assert(#retryActors==6,'Recovered orders remain transient scene evidence')end
    SurvivorUI.SkipConversation();Closed(retryActors,retryPortraits);Survives(snapshot)
    previous=Scenery()
end
assert(completed==11)
SurvivorStory.Reset();Survives(previous)
local effects=StageView().effects
local prop=SurvivorStage.SceneProp('budget-prop','prop.mdl',700,700,.5,0,{100,110,120})
assert(prop)
for i=1,200 do SurvivorStage.SceneProp('budget-'..i,'prop.mdl',700,700,.5,0,{100,110,120})end
assert(#effects==96 and SurvivorStage.SceneProp('overflow','prop.mdl',700,700,1)==nil,
    'Dialogue scenery shares the stage effect budget')
assert(SurvivorStage.SceneProp('budget-prop','other.mdl',900,900,2)==prop,
    'A duplicate key returns its original handle even when the effect budget is full')
SurvivorStage.Cleanup()
for _,effect in ipairs(effects)do assert(effect.destroyed,'Run cleanup destroys persistent scenery too')end
assert(next(StageView().sceneProps)==nil)
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
        local owned=StageView().painted
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
    assert(#heightLocations<=1,'Terrain heights share one map-lifetime probe')
    for _,cell in pairs(terrainCells)do
        assert(cell.tile==cell.originalTile and cell.variance==cell.originalVariance and cell.blighted==cell.originalBlighted,
            'Cleanup must restore each authored tile, variation and blight')
    end
    blocked,sceneEffects,terrainCells,heightLocations={},{},{},{}
end
`);

suite('stage teardown attempts every native restore after failures and permits a fresh arena', stageMocks,
    [config,metrics,'src/30_gameplay/SurvivorStage.lua'], String.raw`
local bounds=bj_mapInitialPlayableArea
SurvivorStage.Init(bounds);SurvivorStage.Apply(3)
local cells,owned=StageView().cells,StageView().painted
local rect,weather=StageRun().rect,StageView().weather
assert(#cells>1 and #owned>1 and weather,'The fixture owns pathing, terrain and weather')
local first=cells[1]
local function Key(x,y)return math.floor(x/32)..":"..math.floor(y/32)end
local setPathable,removeRect=SetTerrainPathable,RemoveRect
local failedPathing=0
SetTerrainPathable=function(x,y,kind,walkable)
    if x==first.x and y==first.y then failedPathing=failedPathing+1;error('injected pathing failure')end
    setPathable(x,y,kind,walkable)
end
RemoveRect=function(r)if r==rect then error('injected rect failure')end;removeRect(r)end
local ok,message=pcall(SurvivorStage.Cleanup)
SetTerrainPathable,RemoveRect=setPathable,removeRect
assert(not ok and message:find('injected pathing failure') and message:find('injected rect failure'),'Every failure is reported')
assert(failedPathing==1,'A failed cell is skipped, not replayed')
for i=2,#cells do
    local cell=cells[i]
    if Key(cell.x,cell.y)~=Key(first.x,first.y)then
        assert(blocked[Key(cell.x,cell.y)]==not cell.walkable,'Later pathing cells are restored after one failure')
    end
end
for _,cell in ipairs(owned)do assert(TerrainCell(cell.x,cell.y).tile==cell.tile,'Terrain is restored after a pathing failure')end
for _,e in ipairs(sceneEffects)do assert(e.destroyed,'Scenery is destroyed after earlier failures')end
assert(weather.removed,'Weather is released')
assert(StageRun().rect==nil and #StageView().cells==0,'Ownership is detached even when natives fail')
SurvivorStage.Init(bounds);SurvivorStage.Apply(1);SurvivorStage.Cleanup()
`);
suite('stage reachability reuses native samples only within one geometry build and reports transition work', stageMocks,
    [config,metrics,'src/30_gameplay/SurvivorStage.lua'], String.raw`
SurvivorMetrics.Enable(true)
SurvivorStage.Init({minX=-5000,minY=-5000,maxX=5000,maxY=5000})
SurvivorStage.Apply(1)
local counters=Internal('metrics','counters')
assert(counters['stage.calls']==1 and counters['stage.geometry.cells']>0
    and counters['stage.terrain.cells']>0 and counters['stage.scenery.effects']>0)
local flood=Internal('stage','BuildReachable')
local original=IsTerrainPathable
local samples={}
function IsTerrainPathable(x,y,...)
    local key=string.format('%.3f:%.3f',x,y)
    assert(samples[key]==nil,'Overlapping flood margins and edges share each native sample')
    samples[key]=true;return original(x,y,...)
end
StageView().reachable={};flood(0,0)
IsTerrainPathable=original
local sampleCount=0;for _ in pairs(samples)do sampleCount=sampleCount+1 end
assert(sampleCount>0)
print('  cached reachability: '..sampleCount..' unique native samples')
local function HasNode(x,y)
    for _,p in ipairs(StageView().reachable)do if p.x==x and p.y==y then return true end end
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
// Match InitMapRects and AnyasLongNight.Start's 128-unit inset, rather than treating camera coordinates as playable bounds.
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
    assert(profileBundle.indexOf('ANYAS_LONG_NIGHT_PROFILE = "' + profile + '"') < profileBundle.indexOf('Debug = {'),
        'The profile must be available before vendor configuration');
    suite('build profile preserves error protection and disables release diagnostics: ' + profile,
        mocks + String.raw`
ANYAS_LONG_NIGHT_PROFILE='` + profile + String.raw`'
InitBlizzard=function()end
function GetBJMaxPlayerSlots()return 24 end
oldTimerStart,oldTriggerAddAction,oldTostring=TimerStart,TriggerAddAction,tostring
`, ['src/05_vendor/DebugUtils.lua', config], String.raw`
local development=ANYAS_LONG_NIGHT_PROFILE=='development'
local release=ANYAS_LONG_NIGHT_PROFILE=='release'
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
