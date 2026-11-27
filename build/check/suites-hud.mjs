// Screen effects, input-transparent containers and native HUD hiding.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root} from '../build.mjs';
import {augments, combat, config, metrics, suite, uiModules} from './harness.mjs';
import {presentationMocks, timeStopFilterMocks} from './mocks.mjs';
suite('time-stop world filter fades subtly, reverses without flashes and cancels stale timers without changing UI',
    presentationMocks + timeStopFilterMocks, [config,uiModules], String.raw`
local set=SurvivorUI.SetTimeStopFilter
set(true);local first=Internal('screen','timeStopFilterTimer')
assert(first and filter.texture==[[ReplaceableTextures\CameraMasks\White_mask.blp]])
assert(filter.blend=='blend'and filter.flags=='none')
AdvanceVisualTime(.1);assert(filter.visible and filter.color[4]>=6 and filter.color[4]<=7)
local writes=filter.writes;set(true);assert(Internal('screen','timeStopFilterTimer')==first and filter.writes==writes)
AdvanceVisualTime(.1)
assert(first.destroyed and filter.color[1]==145 and filter.color[2]==185 and filter.color[3]==225 and filter.color[4]==13)
assert(Internal('screen','timeStopFilterTimer')==nil)
AdvanceVisualTime(1);assert(filter.writes>writes);writes=filter.writes
AdvanceVisualTime(1);set(true);assert(filter.writes==writes,'Holding and refreshing the stop must not repaint or restart the fade')
set(false);AdvanceVisualTime(.1);assert(filter.visible and filter.color[4]>0 and filter.color[4]<13)
local priorAlpha=filter.color[4];local stale=Internal('screen','timeStopFilterTimer')
set(true);assert(stale.destroyed and filter.color[4]==priorAlpha,'Reacquisition reverses from the current alpha')
stale.callback();assert(filter.color[4]==priorAlpha,'Cancelled fade-out callbacks cannot hide a refreshed filter')
AdvanceVisualTime(.2);assert(filter.visible and filter.color[4]==13)
set(false);AdvanceVisualTime(.3);assert(not filter.visible and filter.color[4]==0)
assert(Internal('screen','timeStopFilterTimer')==nil)
set(true);AdvanceVisualTime(.04);stale=Internal('screen','timeStopFilterTimer')
SurvivorUI.BeginRun();assert(stale.destroyed and not filter.visible and filter.color[4]==0)
writes=filter.writes;stale.callback();assert(filter.writes==writes)
assert(next(frames)==nil,'World tint must not create, recolor, hide or intercept HUD/card/tooltip frames')
GetLocalPlayer=function()return Player(1)end
set(true);AdvanceVisualTime(.2);set(false,true)
assert(filter.writes==writes and not filter.visible,'Only the playing client renders the filter')
`);

suite('hit vignette scales with damage, ignores chip hits during its cooldown and fits the local screen',
    presentationMocks, [config,uiModules], String.raw`
local c=SurvivorConfig.hitVignette
local frame=BlzCreateFrameByType('BACKDROP','HSHitVignette',nil)
SetInternal('screen','hitVignette',frame)
local function Near(a,b)return math.abs(a-b)<=1 end
local small=c.minAlpha+(c.maxAlpha-c.minAlpha)*0.01/c.fullFraction
SurvivorUI.HitFlash(0.01);assert(frame.visible and Near(frame.alpha,small) and math.abs(frame.width-0.8)<1e-9)
SurvivorUI.HitFlash(0.01);assert(Near(frame.alpha,small),'An equal hit never restarts the flash')
SurvivorUI.HitFlash(0.5);assert(frame.alpha==c.maxAlpha,'A heavier hit relights at once and caps at maxAlpha')
AdvanceVisualTime(0.3);local faded=frame.alpha;assert(faded<c.maxAlpha and faded>0)
SurvivorUI.HitFlash(0.01);assert(frame.alpha==faded,'Chip damage inside the cooldown keeps fading')
AdvanceVisualTime(c.fade-0.3+0.02);assert(not frame.visible)
SurvivorUI.HitFlash(0.01);assert(not frame.visible,'The cooldown outlasts the fade, so constant chip damage pulses')
AdvanceVisualTime(c.cooldown);assert(not Internal('screen','hitTimerRunning'),'An idle flash stops its timer')
function BlzGetLocalClientWidth()return 1920 end
function BlzGetLocalClientHeight()return 1080 end
SurvivorUI.HitFlash(0.01);assert(frame.visible and math.abs(frame.width-0.6*16/9)<1e-9,'Edges sit on a widescreen border')
SurvivorUI.BeginRun();assert(not frame.visible and not Internal('screen','hitTimerRunning'))
GetLocalPlayer=function()return Player(1)end
frame.alpha=nil;SurvivorUI.HitFlash(0.5);assert(frame.alpha==nil and not frame.visible,'Only the playing client draws the flash')
`);

suite('combat time stop owns the screen filter across pause, expiry, stage cleanup and restart',
    presentationMocks + timeStopFilterMocks, [config,metrics,augments,combat,uiModules], String.raw`
local hero,build,units=NewCombat('firebolt')
SurvivorCombat.StopTime();AdvanceVisualTime(.2);assert(filter.visible and filter.color[4]==13)
state='INVENTORY';SurvivorCombat.SetPaused(true,'INVENTORY');assert(not filter.visible)
AdvanceVisualTime(1);assert(not filter.visible and now==0,'Menus must not consume the remaining eight seconds')
state='RUNNING';SurvivorCombat.SetPaused(false);AdvanceVisualTime(.2);assert(filter.visible)
now=7.9;SurvivorCombat.UpdateStatus(.02);assert(filter.visible)
SurvivorCombat.StopTime();now=8;SurvivorCombat.UpdateStatus(.02);AdvanceVisualTime(.3);assert(filter.visible)
now=15.9;SurvivorCombat.UpdateStatus(.02);AdvanceVisualTime(.3);assert(not filter.visible)
SurvivorCombat.StopTime();AdvanceVisualTime(.04)
local stale=Internal('screen','timeStopFilterTimer')
SurvivorCombat.ClearBattlefield();assert(not filter.visible and stale.destroyed)
stale.callback();assert(not filter.visible)
SurvivorCombat.StopTime();AdvanceVisualTime(.2);assert(filter.visible)
SurvivorCombat.Cleanup();assert(not filter.visible)
hero,build,units=NewCombat('firebolt');AdvanceVisualTime(1);assert(not filter.visible)
SurvivorCombat.Cleanup()
`);

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
AnyasLongNight.IsStorySummary=function()return false end
SurvivorEquipment={UIRevision=function()return 1 end,PendingRewardCount=function()return 0 end,
    PickupMode=function()return '전체'end,CleanupFamilies=function()return {'화염'}end,FamilyLabel=function(f)return f end,
    BagEntries=function()return {},0,9 end,ReadBagEntries=function()return {},0,9 end,
    Get=function(id)return {id=id,icon='icon',description='gear'}end,
    Name=function(id)return id end,Summary=function()return 'summary','set'end}
`, [config,augments,'src/30_gameplay/SurvivorStory.lua',uiModules,
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
local createUnit,previewUnit=CreateUnit,nil
CreateUnit=function(...)previewUnit=createUnit(...);return previewUnit end
SurvivorSetupUI.ShowMenu('normal','firebolt','power')
CreateUnit=createUnit
local function Inside(inner,outer)
    local a,b=assert(Rect(inner)),assert(Rect(outer))
    assert(a[1]>=b[1]-1e-9 and a[2]>=b[2]-1e-9 and a[1]+a[3]<=b[1]+b[3]+1e-9 and a[2]+a[4]<=b[2]+b[4]+1e-9,
        inner.name..' overflows '..outer.name)
end
local setupRoot=frames.AnyasLongNightSetupRoot
local rootRect=assert(Rect(setupRoot))
assert(rootRect[1]>=0 and rootRect[1]+rootRect[3]<=.8 and rootRect[2]>=.02 and rootRect[2]+rootRect[4]<=.56
    and math.abs(rootRect[2]+rootRect[4]/2-.3)<1e-9,'Setup is centered in the 4:3 area below the upper menu bar')
local list,summary,preview,actions=frames.EscMenuBackdrop800,frames.EscMenuBackdrop801,frames.AnyasLongNightSetupPreview,frames.EscMenuBackdrop803
for _,panel in ipairs({list,summary,preview,actions})do Inside(panel,setupRoot);WorldAt(panel,.5,.995)end
assert(preview.texture==[[AnyasLongNightUI\Transparent.tga]] and frames.AnyasLongNightSetupPreviewTop.texture==[[AnyasLongNightUI\Ready.tga]],
    'The preview window is clear with a thin outline so the world shows through')
WorldAt(setupRoot,.5,.99)
for _,name in ipairs({'HERO','DIFFICULTY','WEAPON','TRINKET','DescriptionTitle','Description'})do
    Inside(frames['AnyasLongNightSetup'..name],summary)
end
for _,name in ipairs({'HERO','DIFFICULTY','WEAPON','TRINKET'})do Surface(frames['AnyasLongNightSetup'..name],.5,.5)end
WorldAt(frames.AnyasLongNightSetupDescription,.5,.5)
WorldAt(preview,.5,.5)
for _,button in ipairs({frames.AnyasLongNightSetupStart,frames.AnyasLongNightSetupReset,frames.HSSummaryToggle})do
    Inside(button,actions);Surface(button,.5,.5)
end
local anya=SurvivorConfig.heroes.anya
assert(previewUnit and previewUnit.id==FourCC('hfoo') and previewUnit.skin==anya.previewSkin and not previewUnit.removed
    and previewUnit.abilities[FourCC('Aloc')] and not previewUnit.abilities[FourCC('Aatk')]
    and previewUnit.x>cameraNative.x and previewUnit.y==cameraNative.y,'The camera shifts left so the locust hero lands in the right-hand window')
assert(previewUnit.flyHeight==SurvivorConfig.setupPreview.lift and not previewUnit.abilities[FourCC('Amrf')],
    'The hero floats above the ground so only black sky surrounds it')
assert(previewUnit.teamGlow==false and previewUnit.animation==anya.previewAnimation,
    'The preview hides the hero glow and plays its cinematic stand')
assert(cameraNative.maxX-cameraNative.minX<=2 and cameraNative.maxY-cameraNative.minY<=2
    and cameraNative.x==(cameraNative.minX+cameraNative.maxX)/2,'Setup locks the camera on the preview shot')
Inside(frames.AnyasLongNightSetupHole,preview)
SurvivorSetupUI.ShowOptions('WEAPON',nil);assert(not previewUnit.removed,'Re-rendering keeps the same preview actor')
for _,name in ipairs({'HERO','TRINKET'})do
    local tile=frames['AnyasLongNightSetup'..name]
    assert(frames['AnyasLongNightSetup'..name..'Active'].level<frames['AnyasLongNightSetup'..name..'Icon'].level,
        'The opaque selection rim stays behind the icon')
end
assert(frames.AnyasLongNightSetupChosen1.level<frames.AnyasLongNightSetupIcon1.level)
for _,kind in ipairs({'HERO','DIFFICULTY','WEAPON','TRINKET'})do
    SurvivorSetupUI.ShowOptions(kind,nil)
    for i=1,12 do local button=frames['AnyasLongNightSetupOption'..i]
        -- A locked hero card is shown disabled and never takes pointer input.
        if button.visible and button.enabled then Inside(button,list);Surface(button,.5,.5);Surface(button,.07,.5)end
    end
end
SurvivorSetupUI.Hide()
assert(previewUnit.removed and previewUnit.visible==false and cameraNative.maxX-cameraNative.minX>1000,
    'Closing setup hides and removes the preview actor and restores the camera bounds')
SurvivorUI.ShowNarrative('test','test',function()end)
WorldAt(frames.AnyasLongNightStoryContent,.5,.9)
Surface(frames.ScriptDialogButton700,.5,.5)
SurvivorUI.AdvanceNarrative()
SurvivorUI.ShowConversation('test',{{speaker='안야',text='test'}},function()end)
WorldAt(frames.AnyasLongNightCaption,.95,.5)
Surface(frames.ScriptDialogButton700,.5,.5);Surface(frames.ScriptDialogButton701,.5,.5)
SurvivorUI.SkipConversation();AdvanceVisualTime(.7)
state='STAGE_CLEAR';SurvivorUI.ShowCombatPreparation(1,function()end,function()return true end)
WorldAt(frames.HSCombatPreparation,.05,.5)
Surface(frames.HSCombatPreparationStart,.5,.5)
SurvivorUI.HidePanel()
Show() -- Check immediately, before the 0.05/0.1-second HUD observers run.
local function CheckCardText()
    for i=1,3 do
        local card=Rect(frames['AnyasLongNightCard'..i])
        local hint=Rect(frames['AnyasLongNightHint'..i])
        local preview=Rect(frames['AnyasLongNightPreview'..i])
        local description=Rect(frames['AnyasLongNightDescription'..i])
        assert(hint[2]>=card[2]+.025,'Selection hint must clear the decorative bottom border')
        assert(hint[2]+hint[4]<preview[2] and preview[2]+preview[4]<description[2],
            'Description, preview and selection hint need separate vertical space')
    end
end
CheckCardText()
local cardBuild=SurvivorAugments.NewBuild('firebolt')
SurvivorUI.ShowChoices({'firebolt','meteor','haste'},2,cardBuild,0,3);CheckCardText()
assert(frames.AnyasLongNightDescription1.text:find('Lv.1 → 2',1,true)
    and frames.AnyasLongNightDescription1.text:find('[유도]',1,true)
    and not frames.AnyasLongNightDescription1.text:find('추적 투사체',1,true),'Upgrade cards keep the level and tags without the static attack description')
assert(not frames.AnyasLongNightPreview1.text:find('투사체 수',1,true)
    and frames.AnyasLongNightPreview1.text:find('(+25%)',1,true))
assert(frames.AnyasLongNightDescription2.text:find('운석 충돌',1,true)
    and not frames.AnyasLongNightPreview2.text:find('→',1,true),'New weapon cards retain the mechanic and core values')
SurvivorUI.ShowChoices({'firebolt_burst','firebolt_judgment','haste'},2,build,0,3);CheckCardText()
assert(frames.AnyasLongNightDescription1.text:find(SurvivorAugments.Get('firebolt_burst').text,1,true)
    and frames.AnyasLongNightPreview1.text=='진화 선택 후 변경 불가','Evolution cards retain their full effects and tradeoffs')
SurvivorUI.ShowGearRewards({'gear1','gear2','gear3'},1,function()end);CheckCardText()
Show()
WorldAt(frames.AnyasLongNightChoiceRoot,.5,.95)
for i=1,3 do
    for _,prefix in ipairs({'AnyasLongNightCard','AnyasLongNightReroll','AnyasLongNightExclude'})do
        local button=frames[prefix..i]
        if button.enabled then
            for _,p in ipairs({{.5,.5},{.03,.03},{.97,.97},{.5,.87},{.5,.3}})do Surface(button,p[1],p[2])end
        end
    end
end
local card,reroll,exclude=frames.AnyasLongNightCard2,frames.AnyasLongNightReroll2,frames.AnyasLongNightExclude2
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
assert(not frames.AnyasLongNightChoiceRoot.visible and not frames.HSLootRoot.visible and SurvivorUI.IsChoiceVisible())
Surface(nativeClose,.5,.5)
SurvivorUI.SetRestInventoryVisible(false);SurvivorLootUI.SetInventoryVisible(false,nil,false)
BlzFrameSetVisible(nativeDetails,false)
Surface(card,.5,.5);Surface(reroll,.5,.5);Surface(exclude,.5,.5)
-- A newly offered choice while details is already open must restore as well.
SurvivorUI.HidePanel();SurvivorUI.SetRestInventoryVisible(true);Show()
assert(not frames.AnyasLongNightChoiceRoot.visible)
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
assert(not frames.AnyasLongNightChoiceRoot.visible and SurvivorUI.IsChoiceVisible())
SurvivorUI.SetRestInventoryVisible(false)
Surface(frames.AnyasLongNightCard1,.03,.97)
SurvivorLootUI.Refresh() -- Inventory observation must not put loot controls back over rewards.
assert(not frames.HSLootRoot.visible)
Surface(frames.AnyasLongNightCard1,.03,.97)
ClickFrame(Surface(frames.AnyasLongNightCard2,.5,.5))
assert(chosen==2)
state='FINISHED';SurvivorUI.ShowResult('defeated',10,3,1,nil,'report')
WorldAt(frames.AnyasLongNightChoiceRoot,.02,.5)
Surface(frames.ScriptDialogButton501,.5,.5)
Surface(frames.ScriptDialogButton4,.5,.5);Surface(frames.ScriptDialogButton720,.5,.5)
SurvivorUI.HidePanel()
WorldAt(frames.AnyasLongNightStoryContent,.5,.5)
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
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local hidden=Internal('hud','hiddenFrames')
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
local board=Internal('board','board')
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
`, [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
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
`, [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
for i=1,5 do TickTimers()end
local expected='` + target + String.raw`'=='GameUI'and 0 or '` + target + String.raw`'=='clock parent'and 1 or 2
assert(clockChildCalls==expected,'Stop descending the clock hierarchy immediately after an invalid frame')
assert(#Internal('hud','hiddenFrames')==11 and frames.NativeClock.visible,
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
`, [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
for i=1,5 do TickTimers()end
assert(clockChildCalls==` + childCalls + String.raw` and frames.NativeClock.visible)
assert(#Internal('hud','hiddenFrames')==11 and not frames.UpperButtonBarFrame.visible)
`);
}
for (const absent of ['BlzFrameGetChild', 'BlzFrameGetChildrenCount']) suite('older clients safely omit ' + absent,
    presentationMocks + String.raw`
NativeGameUI()
` + absent + String.raw`=nil
`, [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
for i=1,5 do TickTimers()end
assert(frames.NativeClock.visible and frames.NativeClockMinimapParent.visible)
assert(#Internal('hud','hiddenFrames')==11 and not frames.ConsoleTopBar.visible,
    'Missing child API skips only the clock without interrupting UI creation')
`);
export const blackTexture = fs.readFileSync(path.join(root, 'assets/war3mapImported/AnyasLongNightUI/Black.tga'));
assert.equal(blackTexture[2], 2, 'The intro uses an uncompressed true-color TGA');
assert.equal(blackTexture[16], 32);
assert.equal(blackTexture.length, 18 + blackTexture.readUInt16LE(12) * blackTexture.readUInt16LE(14) * 4);
for (let offset = 18; offset < blackTexture.length; offset += 4) {
    assert.deepEqual([...blackTexture.subarray(offset, offset + 4)], [0, 0, 0, 255], 'Every intro pixel must be opaque black');
}
console.log('PASS intro texture contains only opaque black pixels');
