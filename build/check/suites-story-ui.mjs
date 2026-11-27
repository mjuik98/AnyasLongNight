// Story scenes, dialogue, subtitles, loot/result UI, setup and combat preparation.
import {augments, combat, config, equipment, metrics, suite, uiModules} from './harness.mjs';
import {gearMocks, mocks, presentationMocks} from './mocks.mjs';
suite('preparation start, black intro and dialogue retries never pass native strings, textures or renderer frames to visibility natives',
    presentationMocks + String.raw`
AnyasLongNight.IsStorySummary=function()return false end
AnyasLongNight.ToggleStorySummary=function()end
`, [config,metrics,augments,'src/30_gameplay/SurvivorStory.lua',uiModules,
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
    SurvivorSetupUI.ShowMenu(selections.DIFFICULTY,selections.WEAPON,selections.TRINKET,selections.HERO)
end
SurvivorSetupUI.Init(function(kind)SurvivorSetupUI.ShowOptions(kind,selections[kind],selections.HERO)end,
    function(kind,id)selections[kind]=id;Menu()end,Menu,function()
        starts=starts+1;state='STAGE_CLEAR';hero=CreateUnit(0,'Uany',-7680,7424,0);selectedUnit=hero
        SurvivorUI.ShowStageIntro(1,function()completed=completed+1;state='FINISHED'end,hero)
    end)
state='READY';Menu()
local console=frames.ConsoleBottomBar
assert(not console.visible and not frames.CommandBarFrame.visible,'Setup hides the console HUD')
SurvivorSetupUI.Hide();assert(console.visible and frames.CommandBarFrame.visible,'Closing setup restores the console HUD')
Menu();assert(not console.visible)
for _,kind in ipairs({'HERO','DIFFICULTY','WEAPON','TRINKET'})do
    ClickFrame(frames['AnyasLongNightSetup'..kind]);ClickFrame(frames.AnyasLongNightSetupOption1)
    assert(selections[kind],'The actual preparation UI must supply every required selection')
end
ClickFrame(frames.AnyasLongNightSetupStart);ClickFrame(frames.AnyasLongNightSetupStart)
assert(starts==1 and frames.AnyasLongNightStageIntro.visible and frames.AnyasLongNightStageIntro.alpha==255)
assert(frames.AnyasLongNightStageText.text==SurvivorStory.premise and completed==0)
assert(frames.NativeWorldFrame.visible and frames.NativeWorldBars.visible,
    'Opaque cover supplies the black screen while the engine retains ownership of its world surfaces')
SurvivorUI.AdvanceNarrative();AdvanceVisualTime(.12)
assert(not hero.visible and selectedUnit.id=='hsPP')
SurvivorUI.SkipConversation();assert(completed==1 and hero.visible and selectedUnit==hero and LiveTimers(.03)==0)
Menu();ClickFrame(frames.AnyasLongNightSetupStart)
assert(starts==2 and frames.AnyasLongNightStageIntro.visible)
SurvivorUI.AdvanceNarrative();AdvanceVisualTime(.06)
SurvivorUI.HidePanel();SurvivorStory.Reset()
assert(hero.visible and selectedUnit==hero and completed==1 and LiveTimers(.03)==0)
state='FINISHED';Menu();ClickFrame(frames.AnyasLongNightSetupStart)
assert(starts==3 and frames.AnyasLongNightStageText.text==SurvivorStory.premise)
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
    presentationMocks, [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7680,7424,0);selectedUnit=hero
frames.SimpleInventoryCover.visible=false;frames.ConsoleBottomBarOverlay.visible=false
local originals,nativeFrames={},{}
for _,entry in ipairs(Local(SurvivorNativeHUD.Apply,'cinematicFrames'))do if entry.frame then
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
local black,content,caption=frames.AnyasLongNightStageIntro,frames.AnyasLongNightStoryContent,frames.AnyasLongNightCaption
assert(black.texture==[[AnyasLongNightUI\Black.tga]] and black.alpha==255 and black.visible)
assert(black.width>=2.4 and black.height>=.6 and black.x==.4 and black.y==.3 and not black.enabled)
assert(black.parent==frames.ConsoleUIBackdrop and content.parent==black.parent and caption.parent==black.parent)
assert(content.level>black.level and frames.ScriptDialogButton700.level>black.level)
assert(frames.NativeWorldFrame.visible and frames.NativeWorldBars.visible and not frames.NativePortrait.visible,
    'The opaque backdrop covers the world without toggling renderer-owned frame visibility')
assert(not frames.CommandBarFrame.visible and not frames.SimpleInventoryBar.visible
    and frames.NativeCommandButton0.visible and frames.NativeItemButton0.visible,
    'Hide command/inventory containers while engine-controlled button flags remain untouched')
assert(frames.ConsoleUI.visible and frames.ConsoleUIBackdrop.visible and frames.GameUI.visible)
assert(frames.AnyasLongNightStageText.text==SurvivorStory.premise and frames.HSStoryFooter.text:find('F10')
    and frames.HSStoryFooter.text:find('창작'),'Premise and the small controls/fiction footer have distinct text frames')
local text=frames.AnyasLongNightStageText.text
AdvanceVisualTime(3)
assert(completed==0 and frames.AnyasLongNightStageText.text==text and black.alpha==255 and LiveTimers(.03)==0)
SurvivorUI.AdvanceNarrative()
assert(not hero.visible and #StoryScene().sceneEffects==2)
local sceneryCount=0;for _ in pairs(stageSceneProps)do sceneryCount=sceneryCount+1 end
assert(sceneryCount>=4,'The introduction retains its grave and tracks as stage-owned landscape')
assert(frames.NativeWorldFrame.visible and frames.NativeWorldBars.visible and frames.NativePortrait.visible,
    'Renderer-owned world frames remain untouched and the speaker portrait returns for dialogue')
assert(frames.SimpleInfoPanelIconArmor2.visible and frames.SimpleNameValue.visible and not frames.CommandBarFrame.visible)
assert(frames.AnyasLongNightStageTitle.text:find('퓨트리스') and frames.HSStoryPosition.text:find('1/4'))
assert(caption.visible and frames.HSStoryFooter.visible and black.alpha==255 and LiveTimers(.03)==2)
local firstPage=frames.AnyasLongNightStageText.text
AdvanceVisualTime(.15)
assert(black.alpha>0 and black.alpha<255 and black.visible and caption.visible,
    'The backdrop fades while the sibling dialogue remains fully visible')
AdvanceVisualTime(.30)
assert(not black.visible and black.alpha==0 and LiveTimers(.03)==0)
assert(frames.AnyasLongNightStageText.text==firstPage and completed==0 and now==0,
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
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
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
assert(next(Local(SurvivorNativeHUD.Apply,'cinematicSaved'))~=nil)
SurvivorUI.HidePanel();assert(frames.CommandBarFrame.visible and next(Local(SurvivorNativeHUD.Apply,'cinematicSaved'))==nil)
assert(frames.NativeTooltip.parent==hiddenParent and not hiddenParent.visible)
`);

suite('last manual dialogue restores the live hero before portrait deletion and native console restoration', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7680,7424,0);selectedUnit=hero
hero.maxLife,hero.life=620,415
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
local mirrored=0
for _,unit in pairs(StoryScene().portraitUnits)do
    assert(unit.maxLife==620 and unit.life==415,'Story portraits mirror the player hero HP');mirrored=mirrored+1
end
assert(mirrored==2,'Both story portraits exist')
local retiring=StoryScene().sceneEffects
for _,effect in ipairs(retiring)do storyEffects[effect]=true end
closing=true;SurvivorUI.AdvanceNarrative()
assert(completed==1 and events[1]=='hero visible'and events[2]=='hero selected'
    and events[#events]=='gameplay continuation','The last Continue finishes synchronously in the safe native order')
assert(LiveTimers(.03)==0 and next(Local(SurvivorNativeHUD.Apply,'cinematicSaved'))==nil and #unsafeFrameCalls==0)
for _,effect in ipairs(retiring)do
    assert(effect.destroyed and effect.alpha==0 and effect.z==-10000,'No retired story effect remains visibly animating')
end
SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation();SurvivorUI.HidePanel()
assert(completed==1 and removedPortraits==2,'Duplicate clicks and later hides never repeat scene cleanup or continuation')
`);

suite('conversation close hooks are consumed once, restore native UI after failure and cannot clean a newer story scene', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7680,7424,0);selectedUnit=hero
local completed,closes=0,0
local function Done()completed=completed+1 end
SurvivorStory.ShowBriefing(hero,Done)
local stale=Local(SurvivorUI.SkipConversation,'conversationClose');assert(type(stale)=='function')
SurvivorStory.ShowInterlude(2,hero,Done)
local fresh=StoryScene().sceneEffects
local unit,sceneTimer=selectedUnit,StoryScene().motion.timer
stale();stale()
assert(not hero.visible and selectedUnit==unit and not unit.removed and not fresh[1].destroyed
    and sceneTimer.running,'A detached close token cannot clean the next scene, selection or timer')
SurvivorUI.SkipConversation();assert(completed==1 and hero.visible and selectedUnit==hero)
local pages={{speaker='안야',text='close failure'}}
SurvivorUI.ShowConversation('failure',pages,Done,nil,function()closes=closes+1;error('intentional close failure')end)
local ok,message=pcall(SurvivorUI.AdvanceNarrative)
assert(not ok and message:find('intentional close failure')and closes==1 and completed==1)
assert(not SurvivorUI.IsNarrativeVisible()and frames.CommandBarFrame.visible and frames.SimpleInventoryBar.visible
    and next(Local(SurvivorNativeHUD.Apply,'cinematicSaved'))==nil and LiveTimers(.03)==0,
    'A failing scene closer still restores custom/native UI without running gameplay continuation')
SurvivorUI.HidePanel();SurvivorUI.SkipConversation();assert(closes==1)
SurvivorUI.ShowConversation('retry',pages,Done,nil,function()closes=closes+1 end)
SurvivorUI.AdvanceNarrative();assert(closes==2 and completed==2 and #unsafeFrameCalls==0)
`);

suite('panel and story teardown release their run state before native steps that can fail', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR'
SetLocal(SurvivorUI.HidePanel,'gearCallback',function()end);SetLocal(SurvivorUI.HidePanel,'choosing',true)
assert(SurvivorUI.IsChoiceVisible())
local stopIntro=Local(SurvivorUI.HidePanel,'StopIntro')
SetLocal(SurvivorUI.HidePanel,'StopIntro',function()error('injected intro failure',0)end)
local ok,message=pcall(SurvivorUI.HidePanel)
SetLocal(SurvivorUI.HidePanel,'StopIntro',stopIntro)
assert(not ok and tostring(message):find('injected intro failure'),'The failure still surfaces')
assert(not SurvivorUI.IsChoiceVisible() and Local(SurvivorUI.HidePanel,'restVisible')==false,
    'A failed intro stop must not leave the choice reported as visible (hidden HUD, blocked loot controls)')
SurvivorUI.HidePanel()
SurvivorStory.Record(1);assert(next(StoryRun().clues)~=nil)
local cleanup=SurvivorStory.Cleanup
SurvivorStory.Cleanup=function()error('injected scene failure',0)end
ok,message=pcall(SurvivorStory.Reset)
SurvivorStory.Cleanup=cleanup
assert(not ok and tostring(message):find('injected scene failure'))
assert(next(StoryRun().clues)==nil,'A failed scene cleanup still resets the run story record')
SurvivorStory.Reset()
`);

suite('gameplay return fades reveal restored views once and cancel on replacement, failure and cleanup', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
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
replaced.callback();assert(not cover.visible and frames.AnyasLongNightStageIntro.alpha==255)
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
assert(not cover.visible and LiveTimers(.02)==0 and frames.AnyasLongNightStageText.text=='preserved',
    'A completion callback opening another narrative keeps that narrative visible')
SurvivorUI.HidePanel()
`);

suite('intro reveal timers cancel on skip, replacement, error and restart and stale callbacks stay inert', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local pages={{speaker='안야',text='one'},{speaker='퓨트리스',text='two'}}
local completed=0;local function Done()completed=completed+1 end
local function Reveal()local timer=Local(SurvivorUI.ShowConversation,'revealTimer');assert(timer and timer.dt==.03 and timer.repeated);return timer end
local function Inert(timer)
    assert(timer.destroyed and not timer.running)
    local text,alpha,visible=frames.AnyasLongNightStageText.text,frames.AnyasLongNightStageIntro.alpha,frames.AnyasLongNightStageIntro.visible
    timer.callback()
    assert(text==frames.AnyasLongNightStageText.text and alpha==frames.AnyasLongNightStageIntro.alpha
        and visible==frames.AnyasLongNightStageIntro.visible,'An old reveal cannot mutate a later presentation')
end
SurvivorUI.ShowConversation('first',pages,Done);local first=Reveal();AdvanceVisualTime(.12)
SurvivorUI.SkipConversation();assert(completed==1);Inert(first)
SurvivorUI.ShowConversation('replacement',pages,Done);local second=Reveal();Inert(first)
SurvivorUI.ShowConversation('third',pages,Done);local third=Reveal();Inert(second)
local text=frames.AnyasLongNightStageText.text;AdvanceVisualTime(.6)
assert(frames.AnyasLongNightStageText.text==text and completed==1);Inert(third)
SurvivorUI.ShowConversation('reset',pages,Done);local fourth=Reveal()
SurvivorUI.HidePanel();SurvivorStory.Reset();Inert(fourth)
SurvivorUI.ShowConversation('failure',pages,Done);local fifth=Reveal()
local alpha=BlzFrameSetAlpha
function BlzFrameSetAlpha(frame,value)
    if frame==frames.AnyasLongNightStageIntro and value<255 then error('reveal alpha failure')end
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
`, [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
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
local proxies=StoryScene().portraitUnits
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
local scene=StoryScene().sceneEffects
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
`, [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
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
    assert(StoryScene().cameraGuardTimer==nil)
    local n=#cameraEvents
    assert(cameraEvents[n-2].kind=='bounds'and cameraEvents[n-1].kind=='reset'and cameraEvents[n].kind=='position',
        'Restore the saved bounds before resetting and returning the camera to the hero')
end
local function GuardTimer()
    local timer=StoryScene().cameraGuardTimer
    assert(timer and timer.running and not timer.destroyed and timer.dt==.48 and timer.repeated==false,
        'Each representative shot owns one synchronized one-shot timer')
    return timer
end
local function Cancelled(timer)
    assert(timer.destroyed and not timer.running)
    local writes,text=#cameraBoundsWrites,frames.AnyasLongNightStageText.text
    timer.callback()
    assert(#cameraBoundsWrites==writes and frames.AnyasLongNightStageText.text==text,
        'A cancelled callback must neither change camera bounds nor advance dialogue')
end
local function PanBounds(previousX,previousY)
    Bounds(math.min(previousX,lastPan.x)-64,math.min(previousY,lastPan.y)-64,
        math.max(previousX,lastPan.x)+64,math.max(previousY,lastPan.y)+64)
end
SurvivorStory.ShowBriefing(hero,Done)
local briefing=GuardTimer()
assert(not hero.visible and #StoryScene().sceneEffects>=2,
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
local text=frames.AnyasLongNightStageText.text
AdvanceVisualTime(.6);Bounds(lastPan.x-64,lastPan.y-64,lastPan.x+64,lastPan.y+64)
assert(second.destroyed and StoryScene().cameraGuardTimer==nil)
assert(frames.AnyasLongNightStageText.text==text and completed==1,'Settling a pan does not advance the story')
Cancelled(second)
SurvivorUI.AdvanceNarrative();assert(StoryScene().cameraGuardTimer==nil,'An inspection uses the current shot')
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
    [config, 'src/30_gameplay/SurvivorStory.lua', uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local timerCount=#timers;SurvivorUI.Init();assert(#timers==timerCount,"Do not duplicate map UI timers")
state="STAGE_CLEAR"
local completed=0
SurvivorUI.ShowStageIntro(1,function()completed=completed+1 end)
assert(frames.ScriptDialogButton700.text=='장면 보기')
SurvivorUI.AdvanceNarrative() -- Static introduction now opens the four-line briefing.
assert(SurvivorUI.IsNarrativeVisible() and completed==0)
local first=frames.AnyasLongNightStageText.text
for i=1,300 do TickTimers()end
assert(frames.AnyasLongNightStageText.text==first and completed==0,"Time must never advance a dialogue page")
for i=1,3 do SurvivorUI.AdvanceNarrative();assert(completed==0)end
assert(frames.ScriptDialogButton700.text=='수색 준비','The final briefing action names the next preparation step')
SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation()
assert(completed==1 and not SurvivorUI.IsNarrativeVisible(),"Completion is consumed once")
local hero=CreateUnit(0,"hero",-7600,7400,0)
for stage=1,4 do
    finding=stage%2==0
    SurvivorStory.ShowInterlude(stage,hero,function()completed=completed+1 end)
    assert(hero.visible==false and frames.AnyasLongNightStageTitle.text:find("퓨트리스"))
    local effects=StoryScene().sceneEffects
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
assert(frames.AnyasLongNightStageText.text:find("지하 묘실") and frames.AnyasLongNightStageText.text:find("이름"),
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
assert(not frames.AnyasLongNightExpedition.visible)
riskVisible=true;SurvivorUI.UpdateSpeech();assert(frames.AnyasLongNightExpedition.visible,"Never conceal risk terms/countdown")
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
assert(Local(SurvivorSpeech.Advance,"speech").remaining>4,"Warnings pause rather than consume reading time")
for i=1,20 do SurvivorUI.Say("안야","queued "..i)end
assert(#Local(SurvivorSpeech.Say,"queue")==6,"Bound visible queue even when events arrive together")
SurvivorStory.Reset();SurvivorUI.UpdateSpeech()
assert(not frames.HSSpeech.visible and #SurvivorStory.JournalChapters()==0,"Restart must clear captions and transcript")
`);

suite('each clue branch and remembered summary retains current progress and the next destination', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
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
        local observation=frames.AnyasLongNightStageText.text
        if found then assert(observation~=defaultObservation,'Recovered evidence changes the observation')
        else defaultObservation=observation end
        for _=1,3 do SurvivorUI.AdvanceNarrative()end
        assert(frames.AnyasLongNightStageText.text:find(destinations[index],1,true),
            'The last line names the next destination even when optional evidence was recovered')
        assert(frames.HSStoryPosition.text:find('4/4'))
        SurvivorUI.AdvanceNarrative()
        SurvivorStory.SetSummaryMode(true)
        SurvivorStory.ShowInterlude(index,hero,function()completed=completed+1 end)
        assert(frames.HSStoryPosition.text:find('요약') and frames.HSStoryPosition.text:find('1/1'))
        local summary=frames.AnyasLongNightStageText.text
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

suite('choice hover stays local, switches feedback without a fade timer and cannot consume rerolls or exclusions', presentationMocks,
    [config,augments,uiModules], String.raw`
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
local reroll,exclude=frames.AnyasLongNightReroll2,frames.AnyasLongNightExclude2
local gold,orange,tip=frames.HSRerollHover2,frames.HSExcludeHover2,frames.HSChoiceActionTooltip
local timerCount=#timers;local width,height=reroll.width,reroll.height
local card=frames.AnyasLongNightCard2
Event(card,FRAMEEVENT_MOUSE_ENTER);AdvanceVisualTime(.14)
assert(frames.HSCardHover2.alpha==230 and not tip.visible and selected==0,
    'Hovering a card brightens only its border without selecting it')
assert(frames.HSCardHover2Top.width<card.width and frames.HSCardHover2Left.height<card.height,
    'Card borders keep an inset and do not expand the hit area')
Event(reroll,FRAMEEVENT_MOUSE_ENTER)
assert(tip.visible and frames.HSChoiceActionTooltipText.text:find('리롤 기회'))
assert(gold.alpha==230 and LiveTimers(.02)==0 and #timers==timerCount,
    'Hover feedback switches at once; a fade timer rewrote the hovered frames and made the cursor flicker')
assert(frames.HSCardHover2.alpha==0,'Moving from the card to its action button clears the card highlight')
assert(reroll.width==width and reroll.height==height and frames.AnyasLongNightRerollText2.textColor.g==220)
Event(reroll,FRAMEEVENT_MOUSE_DOWN);assert(frames.QuestButtonBaseTemplate202.color.r==165)
Event(exclude,FRAMEEVENT_MOUSE_ENTER);AdvanceVisualTime(.14)
assert(frames.QuestButtonBaseTemplate202.color.r==255 and gold.alpha==0 and orange.alpha==230,
    'Moving to another button clears pressed styling even without the old Mouse Up')
assert(frames.AnyasLongNightExcludeText2.textColor.g==165 and frames.HSChoiceActionTooltipText.text:find('다시 등장하지'))
Event(reroll,FRAMEEVENT_MOUSE_LEAVE);assert(tip.visible,'A late leave from the old button preserves the current tooltip')
Event(exclude,FRAMEEVENT_MOUSE_LEAVE);AdvanceVisualTime(.14)
assert(orange.alpha==0 and not tip.visible and LiveTimers(.02)==0)
assert(selected==0 and rerolled==0 and excluded==0 and build.excludesRemaining==SurvivorConfig.excludesPerRun)
Event(frames.AnyasLongNightExclude1,FRAMEEVENT_MOUSE_ENTER);AdvanceVisualTime(.14)
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
Event(reroll,FRAMEEVENT_MOUSE_ENTER);assert(gold.alpha==230)
SurvivorUI.HidePanel()
assert(gold.alpha==0 and orange.alpha==0 and not tip.visible and LiveTimers(.02)==0)
Show(3);Event(card,FRAMEEVENT_MOUSE_ENTER);AdvanceVisualTime(.14)
ClickFrame(frames.AnyasLongNightCard2)
assert(selected==1 and gold.alpha==0 and frames.HSCardHover2.alpha==0 and not tip.visible and #timers==timerCount,
    'Selections and repeated hovers reuse the map-lifetime timer and clear all feedback')
`);

suite('dialogue and notification content stays inside framed panels across layout switches', presentationMocks,
    [config, 'src/30_gameplay/SurvivorStory.lua', uiModules], String.raw`
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
    {'AnyasLongNightCaption','CustomTooltipBackgroundTemplate712'}})do
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
assert(frames.HSSpeech.width<=0.54 and frames.AnyasLongNightCaption.width<=0.54,'Dialogue stays compact')
state='STAGE_CLEAR'
for i=1,3 do
    SurvivorUI.ShowConversation('수색',{{speaker='퓨트리스',text='대사 한 줄'}},function()end)
    Inside(frames.AnyasLongNightStageTitle,frames.AnyasLongNightCaption)
    Inside(frames.AnyasLongNightStageText,frames.AnyasLongNightCaption)
    assert(frames.AnyasLongNightStageText.vertical==TEXT_JUSTIFY_TOP)
    for _,name in ipairs({'ScriptDialogButton700','ScriptDialogButton701'})do
        local button=frames[name];assert(button.anchor.target==frames.AnyasLongNightCaption)
        assert(button.anchor.point==FRAMEPOINT_TOP and button.anchor.targetPoint==FRAMEPOINT_TOP)
        assert(-button.anchor.y+button.height<=frames.AnyasLongNightCaption.height-0.007,'Dialogue controls stay inside the panel')
    end
    SurvivorUI.SkipConversation()
    SurvivorUI.ShowNarrative('정적 안내','본문',function()end,'안내','수색 준비')
    assert(frames.AnyasLongNightStageText.anchor.target==frames.AnyasLongNightStoryContent)
    assert(frames.ScriptDialogButton700.absolute==FRAMEPOINT_CENTER and not frames.ScriptDialogButton700.anchor)
    SurvivorUI.AdvanceNarrative()
end
`);

suite('seen scenes summarize only by preference while new clue branches and full journal remain available', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
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
local effects=StoryScene().sceneEffects
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
assert(frames.AnyasLongNightStageText.text:find('명령서'))
SurvivorUI.SkipConversation();SurvivorStory.Reset();SurvivorStory.SetSummaryMode(false)
SurvivorStory.ShowBriefing(Done);assert(frames.HSStoryPosition.text:find('1/4'))
SurvivorUI.SkipConversation()
assert(hero.visible and #StoryScene().sceneEffects==0)
`);

suite('stage arrivals stage both companions in the new place, wait for clicks and lead to preparation', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local completed=0
local hero=CreateUnit(0,'hero',-7600,7400,0)
for index=2,5 do
    SurvivorStory.SetSummaryMode(false)
    SurvivorUI.ShowStageIntro(index,function()completed=completed+1 end,hero)
    local effects=StoryScene().sceneEffects;local anya,putress=effects[1],effects[2]
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
    assert(frames.HSStoryPosition.text:find('요약')and frames.AnyasLongNightStageText.text:find('mission'))
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
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local completed=0
local hero=CreateUnit(0,'hero',-7600,7400,0)
SurvivorStory.ShowEnding(hero,function()completed=completed+1 end)
local effects=StoryScene().sceneEffects
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
assert(frames.AnyasLongNightStageText.text:find('지하 묘실') and completed==0)
SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation()
assert(completed==1 and hero.visible)
for _,effect in ipairs(effects)do assert(effect.destroyed,'An ending scene effect leaked')end
-- Page three is Anya's line, so Anya (not Putress) moves; the sewer seal search changes page four.
for _,found in ipairs({false,true})do
    finding=found;SurvivorStory.ShowEnding(hero,function()completed=completed+1 end)
    effects=StoryScene().sceneEffects;anya,putress=effects[1],effects[2]
    SurvivorUI.AdvanceNarrative();AdvanceVisualTime(.7)
    local putressX,putressY,anyaX=putress.x,putress.y,anya.x
    SurvivorUI.AdvanceNarrative();AdvanceVisualTime(.7)
    assert(frames.AnyasLongNightStageText.text:find('물어보자')and putress.x==putressX and putress.y==putressY and anya.x~=anyaX)
    SurvivorUI.AdvanceNarrative()
    assert((frames.AnyasLongNightStageText.text:find('사슬을 풀어')~=nil)==found,'Only a completed seal search changes the cart line')
    SurvivorUI.SkipConversation()
end
finding=nil
`);

suite('actor actions ease between manual pages, use Walk and Spell then Stand, and remain bounded with reusable quiet cues',
    presentationMocks + String.raw`
SurvivorStage.ScenePoint=function()return {x=0,y=0}end
`, [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7680,7424,0);local completed=0
local function Done()completed=completed+1 end
local function Near(a,b)assert(math.abs(a-b)<1e-6,'Unexpected interpolated position '..a..' vs '..b)end
SurvivorStory.ShowBriefing(hero,Done)
local effects=StoryScene().sceneEffects;local anya,putress=effects[1],effects[2]
assert(anya.x==-160 and anya.y==95 and putress.x==125 and putress.y==165 and not hero.visible)
AdvanceVisualTime(.18)
assert(putress.yaw>1 and putress.yaw<math.pi and putress.x==125 and putress.y==165,
    'A turn across the -pi/pi boundary follows the shorter arc without moving the actor')
AdvanceVisualTime(.18)
assert(#soundHandles==0,'Turning in place does not emit footsteps')
SurvivorUI.AdvanceNarrative()
local motion=StoryScene().motion;local timer=motion.timer
assert(timer.dt==.03 and timer.repeated and anya.animation==ANIM_TYPE_WALK and anya.x==-160 and anya.y==95)
local page=frames.AnyasLongNightStageText.text
AdvanceVisualTime(.09)
local eased=(1/6)^2*(3-2/6)
Near(anya.x,-160+90*eased);Near(anya.y,95+70*eased)
assert(anya.x>-160 and anya.x<-70 and #soundHandles==0,'The actor visibly traverses the route before its first step cue')
AdvanceVisualTime(.45)
assert(anya.x==-70 and anya.y==165 and anya.animation==ANIM_TYPE_STAND and timer.destroyed)
assert(StoryScene().motion==nil and #soundHandles==2)
for _,sound in ipairs(soundHandles)do
    assert(sound.path:find('HeroStep')and sound.volume==18 and not sound.loop and not sound.threeD and sound.starts==1)
end
assert(now==0 and completed==0 and frames.AnyasLongNightStageText.text==page,'Motion never advances paused gameplay or dialogue')
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
local summaryEffects=StoryScene().sceneEffects
assert(summaryEffects[1].x==80 and summaryEffects[1].y==220 and #soundHandles==3
    and StoryScene().motion==nil,'Seen summaries apply the final pose immediately with no choreography or sound')
AdvanceVisualTime(3);assert(#soundHandles==3 and completed==1)
SurvivorUI.SkipConversation();assert(completed==2)
`);

suite('rapid page clicks settle old poses and cancel old motion before new actions or restarts', presentationMocks + String.raw`
SurvivorStage.ScenePoint=function()return {x=0,y=0}end
`, [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7680,7424,0);local completed=0
SurvivorStory.ShowEnding(hero,function()completed=completed+1 end)
local effects=StoryScene().sceneEffects;local anya,putress,figure,cart=effects[1],effects[2],effects[3],effects[4]
local first=StoryScene().motion.timer
AdvanceVisualTime(.09);assert(anya.x>-180 and anya.x<-70)
SurvivorUI.AdvanceNarrative()
assert(first.destroyed and anya.x==-70 and anya.y==170,'An interrupted action settles its old target before the next page')
local second=StoryScene().motion.timer
local x,y=putress.x,putress.y;first.callback()
assert(putress.x==x and putress.y==y and StoryScene().motion.timer==second)
SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative()
local loading=StoryScene().motion.timer
assert(cart.alpha==255 and cart.x==-230 and figure.z~=75,'Loading is a visible action rather than an instant relocation')
AdvanceVisualTime(.33)
assert(cart.x>-230 and cart.x<20 and figure.z>0 and figure.z<75)
AdvanceVisualTime(.33);assert(cart.x==20 and cart.y==290 and figure.z==75 and loading.destroyed)
SurvivorUI.AdvanceNarrative();local departing=StoryScene().motion.timer
AdvanceVisualTime(.33)
assert(math.abs(cart.x-210)<1e-6 and math.abs(cart.y-397.5)<1e-6 and completed==0)
AdvanceVisualTime(.33)
assert(cart.x==400 and cart.y==505 and anya.x==250 and putress.x==550 and figure.z==75)
local text=frames.AnyasLongNightStageText.text;departing.callback()
assert(cart.x==400 and frames.AnyasLongNightStageText.text==text and completed==0)
SurvivorUI.SkipConversation();assert(completed==1 and hero.visible)
for i=1,12 do
    SurvivorStory.ShowInterlude(i%4+1,hero,function()completed=completed+1 end)
    local old=StoryScene().motion.timer
    assert(LiveTimers(.03)==2 and LiveTimers()==4,'Only one actor, one reveal and one camera transition can be live')
    SurvivorStory.Reset();SurvivorUI.HidePanel()
    old.callback();assert(hero.visible and LiveTimers()==1 and #StoryScene().sceneEffects==0)
end
`);

suite('story visual errors cancel callbacks and cleanup continues through timer and actor native failures', presentationMocks + String.raw`
SurvivorStage.ScenePoint=function()return {x=0,y=0}end
`, [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local hero=CreateUnit(0,'Uany',-7680,7424,0);selectedUnit=hero
SurvivorStory.ShowInterlude(1,hero,function()end)
local scene=StoryScene().sceneEffects
local old=StoryScene().motion.timer;local camera=StoryScene().cameraGuardTimer
local timerDestroy,effectDestroy=DestroyTimer,DestroyEffect
function DestroyTimer(timer)if timer==old then error('motion destroy failure')end;timerDestroy(timer)end
function DestroyEffect(effect)if effect==scene[1]then error('actor destroy failure')end;effectDestroy(effect)end
local ok,message=pcall(SurvivorStory.Cleanup)
assert(not ok and message:find('motion destroy failure')and message:find('actor destroy failure'))
assert(not old.running and camera.destroyed and hero.visible and selectedUnit==hero)
for index=2,#scene do assert(scene[index].destroyed,'A failed native must not abandon later actors')end
assert(StoryScene().motion==nil and StoryScene().cameraGuardTimer==nil)
DestroyTimer,DestroyEffect=timerDestroy,effectDestroy;effectDestroy(scene[1]);timerDestroy(old)
SurvivorUI.HidePanel();SurvivorStory.ShowBriefing(hero,function()end)
local fresh=StoryScene().sceneEffects;local x,y=fresh[1].x,fresh[1].y
old.callback();assert(fresh[1].x==x and fresh[1].y==y,'An old failed-destroy callback cannot touch a new scene')
SurvivorUI.SkipConversation()
SurvivorStory.ShowInterlude(2,hero,function()end)
local failed=StoryScene().motion.timer;local position=BlzSetSpecialEffectPosition
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
assert(StoryScene().sceneEffects[2].animation==ANIM_TYPE_STAND,'A failed optional gesture falls back to idle')
SurvivorUI.SkipConversation()
local effectAlpha,unitVisibility,effectPosition=BlzSetSpecialEffectAlpha,ShowUnit,BlzSetSpecialEffectPosition
for _,fault in ipairs({'effect hide','effect sink','portrait hide'})do
    SurvivorStory.ShowBriefing(hero,function()end)
    local retiring=StoryScene().sceneEffects
    local proxies=StoryScene().portraitUnits
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
    assert(StoryScene().motion==nil and StoryScene().cameraGuardTimer==nil
        and StoryScene().sceneX==nil)
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
        [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
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
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='RUNNING';now=0
SurvivorUI.Say('안야','전투 중 읽던 대사');SurvivorUI.UpdateSpeech()
now=1;SurvivorUI.UpdateSpeech()
local before=Local(SurvivorSpeech.Advance,'speech').remaining
-- The local native-panel observer only redraws: it never advances the shared reading clock.
now=3;SurvivorUI.SetRestInventoryVisible(true);SurvivorUI.SetRestInventoryVisible(false);now=1
assert(Local(SurvivorSpeech.Advance,'speech').remaining==before and Local(SurvivorSpeech.Advance,'clock')==1,
    'Local panel visibility changes redraw speech without consuming reading time')
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
assert(#Local(SurvivorUI.Alert,'alerts')==2 and Local(SurvivorSpeech.Advance,'speech').remaining==before,'Paused run time never expires a warning')
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
`, [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='RUNNING';now=0
local build={weapons={},evolutions={}}
SurvivorUI.UpdateDamageBoard(build,3,200,2,'normal');SurvivorUI.UpdateSpeech()
local board=Local(SurvivorDamageBoard.Update,'board')
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
    local text,root=frames.AnyasLongNightExpedition,frames.HSExpedition
    assert(root.y<=.515 and root.y>=.36 and text.height>=.041 and text.height<=.128)
    assert(root.y-root.height-accept.y>=.009-.00001,'Risk button must sit below its panel with visible spacing')
    assert(root.visible and text.parent==root and text.anchor.y==-0.014 and root.width==frames.HSNotice.width,
        'Search and region notices share a bordered panel width and internal padding')
end
riskVisible=true;SurvivorUI.UpdateSpeech()
assert(accept.visible and frames.AnyasLongNightExpedition.visible);SeparatedRiskControls()
assert(frames.HSNotice.y-frames.HSNotice.height-frames.HSExpedition.y>=.012-.00001,'Urgent notices leave room above risk terms')
SurvivorUI.ClearSpeech();SurvivorUI.UpdateSpeech();SeparatedRiskControls()
SurvivorUI.Notify('일반 알림');SurvivorUI.UpdateSpeech();SafeLeftLane()
assert(frames.HSNotice.y-frames.HSNotice.height-frames.HSExpedition.y>=.012-.00001,'Ordinary notices leave room above risk terms')
assert(frames.HSSpeech.x-frames.HSSpeech.width/2-(accept.x+accept.width/2)>=.011-.00001,'Risk input cannot overlap combat subtitles')
assert(accept.text=='조사 수락','Offer terms and explicit action use the same investigation label')
ClickFrame(accept);assert(riskAccepts==1)
riskOffer=nil;SurvivorUI.UpdateSpeech();assert(not accept.visible)
emptyStatus=true;SurvivorUI.UpdateSpeech();assert(not frames.HSExpedition.visible and not frames.AnyasLongNightExpedition.visible and not accept.visible,
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
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
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
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='RUNNING';now=0;local build={weapons={},evolutions={}}
SurvivorUI.UpdateDamageBoard(build,2,120,3,'normal')
local board=Local(SurvivorDamageBoard.Update,'board')
MultiboardMinimize(board,false)
SurvivorUI.Say('안야','통계 내용보다 먼저 읽을 대사');SurvivorUI.UpdateSpeech()
assert(board.visible and board.minimized and board.title:find('2:00'),'Collapse rows while retaining the native timer title')
assert(Local(SurvivorDamageBoard.Display,'originalMinimized')==false,'Remember the player-expanded false value')
for i=1,5 do SurvivorUI.UpdateSpeech()end
assert(Local(SurvivorDamageBoard.Display,'originalMinimized')==false,'Repeated quiet ticks never replace the original state')
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
SurvivorUI.UpdateDamageBoard(build,2,130,3,'normal');local replacement=Local(SurvivorDamageBoard.Update,'board')
assert(replacement~=board and replacement.minimized,'A replacement board begins with its own default')
SurvivorUI.UpdateSpeech();SurvivorUI.ClearSpeech();assert(replacement.minimized,'An old false snapshot never leaks into the new board')
SurvivorUI.ClearDamageBoard()
`);

suite('native statistics clicks override one-time speech and warning folding through restoration and cleanup', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='RUNNING';now=0;local build={weapons={},evolutions={}}
SurvivorUI.UpdateDamageBoard(build,1,120,4,'normal')
local board=Local(SurvivorDamageBoard.Update,'board')
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
local replacement=Local(SurvivorDamageBoard.Update,'board')
assert(replacement~=board and replacement.minimized)
MultiboardMinimize(replacement,false)
SurvivorUI.Say('안야','새 통계판');SurvivorUI.UpdateSpeech()
assert(replacement.minimized,'A replacement board has its own quiet interval')
SurvivorUI.ClearSpeech();assert(not replacement.minimized,'An untouched automatic fold still restores the original state')
SurvivorUI.ClearDamageBoard()
`);

suite('UI speech failure recovers on the same map timer for a new run', presentationMocks,
    [config, 'src/30_gameplay/SurvivorStory.lua', uiModules], String.raw`
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
        if frame.name:find('^HS') or frame.name:find('^AnyasLongNight')then frameWrites=frameWrites+1 end
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
`, [config, augments, 'src/30_gameplay/SurvivorStory.lua', uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local build=SurvivorAugments.NewBuild('firebolt')
state='RUNNING';SurvivorUI.UpdateDamageBoard(build,1,0,3,'normal');SurvivorUI.UpdateSpeech()
local board=Local(SurvivorDamageBoard.Update,'board')
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
bagReads,observedReads,pendingReads,lootWrites,expeditionUpdates=0,0,0,0,0
SurvivorUI={IsNarrativeVisible=function()return narrative==true end,UpdateExpedition=function()expeditionUpdates=expeditionUpdates+1 end}
SurvivorEquipment={
    UIRevision=function()return revision end,
    PendingRewardCount=function()pendingReads=pendingReads+1;return pending end,
    PickupMode=function()return mode end,
    CyclePickup=function()mode='끔';revision=revision+1 end,
    CleanupFamilies=function()return {'화염','번개','얼음','칼날','공용'}end,FamilyLabel=function(f)return f end,
    -- BagEntries also observes shared bag state; local rendering must use ReadBagEntries.
    BagEntries=function()bagReads,observedReads=bagReads+1,observedReads+1;return {{item='item',id='Hs15',locked=locked}},1,6 end,
    ReadBagEntries=function()bagReads=bagReads+1;return {{item='item',id='Hs15',locked=locked}},1,6 end,
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
assert(observedReads==0,'Rendering (also run by the local inventory observer) never observes shared bag state')
ClickFrame(frames.ScriptDialogButton821)
-- The synchronized click resolves its row from the shared bag, then the render rereads once.
assert(frames.ScriptDialogButton821.text:find('잠금') and bagReads==3 and observedReads==1,'Lock changes update the cached row')
ChangePending(2);SurvivorLootUI.Refresh();assert(frames.HSPendingRewards.text:find('2개') and bagReads==4)
ClickFrame(frames.ScriptDialogButton810);assert(frames.ScriptDialogButton810.text=='줍기: 끔')
narrative=true;SurvivorLootUI.Refresh();assert(not frames.HSLootRoot.visible)
narrative=false;SurvivorLootUI.Refresh();assert(frames.HSLootRoot.visible and SurvivorLootUI.IsExpanded())
-- Clicks run on every client: they follow the synchronized inventory state, never the local panel flags.
local toggles,toggleLock=0,SurvivorEquipment.ToggleLock
SurvivorEquipment.ToggleLock=function(item)toggles=toggles+1;return toggleLock(item)end
SurvivorLootUI.SetInventoryVisible(false,nil,true);ClickFrame(frames.ScriptDialogButton821)
assert(toggles==1,'A locally hidden panel does not change a synchronized lock click')
state='RUNNING';SurvivorLootUI.SetInventoryVisible(true);ClickFrame(frames.ScriptDialogButton821)
assert(toggles==1,'A locally visible panel cannot act while the shared inventory is closed')
state='INVENTORY';SurvivorLootUI.SetInventoryOpen(false);ClickFrame(frames.ScriptDialogButton821)
assert(toggles==1,'The synchronized close collapses shared management on every client')
SurvivorEquipment.ToggleLock=toggleLock
ClickFrame(frames.ScriptDialogButton811);assert(SurvivorLootUI.IsExpanded())
SurvivorLootUI.SetInventoryVisible(false)
assert(not SurvivorLootUI.IsExpanded() and not frames.ScriptDialogButton811.visible and not frames.QuestButtonBaseTemplate812.visible)
-- A synchronized refresh observes shared bag state on every client, even where the
-- local details panel hides the loot UI; the local observer never observes.
local uiObservations,uiRevision=0,SurvivorEquipment.UIRevision
SurvivorEquipment.UIRevision=function()uiObservations=uiObservations+1;return uiRevision()end
SurvivorLootUI.SetInventoryVisible(false,nil,true);assert(uiObservations==0)
SurvivorLootUI.Refresh();assert(uiObservations==1 and not frames.HSLootRoot.visible,
    'The local details panel cannot skip a synchronized observation')
SurvivorEquipment.UIRevision=uiRevision
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
-- The local observer entry never observes shared bag state itself.
local before=Local(SurvivorEquipment.UIRevision,'uiRevision')
SurvivorLootUI.SetInventoryVisible(true)
assert(Local(SurvivorEquipment.UIRevision,'uiRevision')==before,'A local render without a revision must not observe the shared bag')
-- Like InventoryPause.Tick: observe on every client, then pass the revision to the local renderer.
SurvivorLootUI.SetInventoryVisible(true,SurvivorEquipment.UIRevision())
assert(frames.ScriptDialogButton821.text:find('빛바랜 목걸이') and not frames.ScriptDialogButton821.text:find('잠금'),
    'The native bag observer invalidates rows even without an event callback')
assert(SurvivorEquipment.ClaimReward('Hs04'));SurvivorLootUI.Refresh()
assert(frames.HSPendingRewards.visible and frames.HSPendingRewards.text:find('1개'))
hero.bag[1]=nil;SurvivorEquipment.CollectRest();SurvivorLootUI.SetInventoryVisible(true,SurvivorEquipment.UIRevision())
assert(not frames.HSPendingRewards.visible and frames.ScriptDialogButton821.text:find(SurvivorEquipment.Name('Hs04')),
    'Collecting the protected reward updates both its notice and bag row')
SurvivorLootUI.Reset();SurvivorEquipment.Cleanup()
`);

suite('inventory observation stays synchronized while revision-based loot rendering is local', presentationMocks + String.raw`
localPlayer,observations,localRenders=12,0,0
function GetLocalPlayer()return localPlayer end
function BlzTriggerRegisterPlayerSyncEvent()end
function BlzSendSyncData()return true end
function BlzGetTriggerSyncData()return syncData end
freezes,collections=0,0
SurvivorCombat={MaintainInventoryPause=function()freezes=freezes+1 end,IsClearing=function()return false end}
SurvivorNativeLoadout={Refresh=function()end}
SurvivorEquipment={Reconcile=function()collections=collections+1 end,CollectRest=function()collections=collections+1 end,
    UIRevision=function()observations=observations+1;return observations end}
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
-- Paused rest: collect normally, but never transact on a run whose teardown is pending.
state='STAGE_CLEAR';TickTimers();assert(collections==1 and freezes==1)
RunSession.RequestFail('injected pending teardown');TickTimers()
assert(collections==1 and freezes==2,'A pending teardown stops item transactions but keeps the paused vitals frozen')
-- The synchronized open/close event follows the same rule as the timer.
syncData=Local(SurvivorInventoryPause.Init,'generation')..':1:0'
Local(SurvivorInventoryPause.Cleanup,'syncTrigger').action()
assert(collections==1,'A pending teardown stops the sync event from reconciling gear or granting talents')
pendingFailure=nil;SurvivorInventoryPause.Cleanup()
`);

suite('checkpoint patterns and reinforcements keep gameplay and ground warnings without monster notices', presentationMocks + String.raw`
SurvivorStage.Get=function(index)return {name='stage '..index,mission='mission',hint='hint',warning={255,160,90}}end
SurvivorExpedition.UseAdvantage=function()return false end
function GetUnitCurrentOrder()return 'attack'end
function OrderId(order)return order end
`, [config,metrics,augments,combat,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local hero,build,units=NewCombat('orbitblade')
CombatRun().stage=4
local unit=EnemyAt(units,500,0,false);units[unit].boss=true
CombatRun().boss=unit
now=2
SurvivorCombatHazards.BossPattern(units[unit])
SurvivorUI.UpdateSpeech()
local record=units[unit]
assert(record.patternCount==1 and record.supportAt==4,'Checkpoint reinforcements keep their actual two-second delay')
assert(#actors>=5 and not frames.HSNotice.visible,'Cross pattern retains its visible ground warnings')
assert(#Local(SurvivorUI.Alert,'alerts')==0,'Monster ability descriptions must not open a notice')
local spawns=0;SurvivorCombatEnemies.Spawn=function(elite,kind)spawns=spawns+1;return true end
record.nextBlast,record.attackSpeed=100,1
now=3.9;SurvivorCombat.UpdateEnemies(now);assert(spawns==0)
now=4;SurvivorCombat.UpdateEnemies(now);assert(spawns==3 and not record.supportAt)
SurvivorUI.UpdateSpeech();assert(not frames.HSNotice.visible)
SurvivorCombat.Cleanup()
`);

suite('result summary separates progress, six weapon totals and rest guidance across tab switches', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
local build={weapons={},evolutions={}}
for index,minutes in ipairs({3,4,5,5,5})do
    SurvivorUI.UpdateDamageBoard(build,index,0,3,'normal')
    assert(Local(SurvivorDamageBoard.Update,'board').title:find(minutes..':00',1,true))
    SurvivorUI.UpdateDamageBoard(build,index,60,3,'normal')
    assert(Local(SurvivorDamageBoard.Update,'board').title:find((minutes-1)..':00',1,true))
end
local details={difficulty='쉬움',level=16,weapons={'잿불 화살'},trinkets={},stages={}}
local report='누적 유효 피해'
for index=1,6 do report=report..'\n무기 '..index..' '..index*1000 end
state='STAGE_CLEAR';SurvivorUI.ShowResult('stage_clear',122,427,1,2,report,details)
local info,damage,rest=frames.HSResultSummaryInfo,frames.HSResultSummaryDamage,frames.HSResultSummaryRest
assert(info.visible and damage.visible and rest.visible and not frames.AnyasLongNightResultNote.visible)
assert(info.vertical==TEXT_JUSTIFY_TOP and info.horizontal==TEXT_JUSTIFY_LEFT
    and damage.vertical==TEXT_JUSTIFY_TOP and damage.horizontal==TEXT_JUSTIFY_LEFT)
assert(info.text:find('현재 레벨 16',1,true) and info.text:find('2:02',1,true)
    and damage.text:find('무기 6 6000',1,true))
assert(rest.text:find('다음 시작 지점',1,true) and frames.ScriptDialogButton4.text=='다음 스테이지')
local tabs=Local(SurvivorUI.NavigateJournal,'resultTabs')
ClickFrame(tabs[2].frame)
assert(not info.visible and not damage.visible and not rest.visible and frames.AnyasLongNightResultNote.visible)
ClickFrame(tabs[1].frame);assert(info.visible and damage.visible and rest.visible)
state='FINISHED';SurvivorUI.ShowResult('timeout',180,427,1,60,'',details)
assert(rest.text=='' and info.text:find('종료 레벨 16',1,true) and damage.text:find('없음',1,true),
    'Later results replace previous rest guidance and damage content')
`);

suite('chapter journal navigation is reversible, bounded and independent of repeated tab clicks', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='FINISHED'
local details={difficulty='보통',level=1,weapons={},trinkets={},stages={},journalChapters={
    {title='첫 수색',pages={'첫 장 요약','첫 장 대화'}},{title='두 번째 수색',pages={'둘째 장 요약','둘째 장 대화'}}}}
SurvivorUI.ShowResult('boss_defeated',500,100,5,nil,'',details)
local tab=Local(SurvivorUI.NavigateJournal,'resultTabs')[5].frame
ClickFrame(tab)
local note=frames.AnyasLongNightResultNote.text
assert(note:find('첫 장 요약'))
ClickFrame(tab);assert(frames.AnyasLongNightResultNote.text==note,'Repeated tab clicks never move a page')
SurvivorUI.NavigateJournal(-1,0);assert(frames.AnyasLongNightResultNote.text==note)
ClickFrame(Local(SurvivorUI.NavigateJournal,'journalNext'));assert(frames.AnyasLongNightResultNote.text:find('첫 장 대화'))
SurvivorUI.NavigateJournal(99,0);assert(frames.AnyasLongNightResultNote.text:find('첫 장 대화'))
ClickFrame(Local(SurvivorUI.NavigateJournal,'journalPrevious'));assert(frames.AnyasLongNightResultNote.text==note)
ClickFrame(Local(SurvivorUI.NavigateJournal,'chapterNext'));assert(frames.AnyasLongNightResultNote.text:find('둘째 장 요약'))
SurvivorUI.NavigateJournal(0,99);assert(frames.AnyasLongNightResultNote.text:find('둘째 장 요약'))
ClickFrame(Local(SurvivorUI.NavigateJournal,'chapterPrevious'));assert(frames.AnyasLongNightResultNote.text==note)
assert(frames.HSJournalPosition.text:find('1/2장') and frames.HSJournalPosition.text:find('1/2쪽'))
ClickFrame(Local(SurvivorUI.NavigateJournal,'resultTabs')[1].frame)
assert(not frames.HSJournalPosition.visible)
SurvivorUI.NavigateJournal(1,1);assert(not frames.AnyasLongNightResultNote.text:find('둘째 장 요약'),'Journal actions only work on its tab')
`);

suite('setup preserves selections and same-settings retry consumes one valid finished run', mocks + String.raw`
OnInit={final=function()end}
RunSession.Finish=function()state='FINISHED'end
SurvivorSetupUI={ShowMenu=function(difficulty,weapon,trinket)
    setupShown={difficulty=difficulty,weapon=weapon,trinket=trinket}
end,ShowOptions=function()end}
SurvivorStory={SetSummaryMode=function(value)summaryMode=value end}
`, [config,'src/00_bootstrap/AnyasLongNight.lua'], String.raw`
SetLocal(AnyasLongNight.Start,'initialized',true)
state='READY';AnyasLongNight.Start()
assert(not setupShown.difficulty and not setupShown.weapon and not setupShown.trinket)
assert(not AnyasLongNight.RetrySame(),'Cannot retry before selecting a complete setup')
local selections={DIFFICULTY='normal',WEAPON=SurvivorConfig.startingWeapons[1],TRINKET=SurvivorConfig.startingTrinkets[1]}
for _,kind in ipairs({'DIFFICULTY','WEAPON','TRINKET'})do
    assert(AnyasLongNight.OpenSetup(kind) and AnyasLongNight.SelectSetup(kind,selections[kind]))
end
assert(not AnyasLongNight.IsStorySummary())
assert(AnyasLongNight.ToggleStorySummary());assert(AnyasLongNight.IsStorySummary())
AnyasLongNight.Start()
assert(setupShown.difficulty==selections.DIFFICULTY and setupShown.weapon==selections.WEAPON and setupShown.trinket==selections.TRINKET)
assert(AnyasLongNight.IsStorySummary(),'Restart retains the explicitly chosen story preference')
local starts=0
SetLocal(AnyasLongNight.BeginRun,'Start',function(weapon,trinket)
    starts=starts+1;assert(weapon==selections.WEAPON and trinket==selections.TRINKET);state='RUNNING'
end)
state='FINISHED';assert(AnyasLongNight.RetrySame() and starts==1)
assert(not AnyasLongNight.RetrySame() and starts==1,'Retry is rejected once a run is active')
state='FINISHED';AnyasLongNight.Start()
assert(setupShown.difficulty==selections.DIFFICULTY and setupShown.weapon==selections.WEAPON and setupShown.trinket==selections.TRINKET)
assert(AnyasLongNight.ToggleStorySummary() and not AnyasLongNight.IsStorySummary())
assert(summaryMode==false,'Setup summary preference reaches the story runtime')
`);

suite('hero selection rejects locked heroes, resets foreign starting weapons and filters growth by hero', mocks + String.raw`
OnInit={final=function()end}
RunSession.Finish=function()state='FINISHED'end
SurvivorSetupUI={ShowMenu=function(difficulty,weapon,trinket,hero)
    setupShown={difficulty=difficulty,weapon=weapon,trinket=trinket,hero=hero}
end,ShowOptions=function(kind,selected,hero)optionsShown={kind=kind,selected=selected,hero=hero}end}
SurvivorStory={SetSummaryMode=function()end}
`, [config,augments,'src/00_bootstrap/AnyasLongNight.lua'], String.raw`
SetLocal(AnyasLongNight.Start,'initialized',true)
state='READY';AnyasLongNight.Start()
assert(setupShown.hero==SurvivorConfig.defaultHero and SurvivorConfig.heroes[setupShown.hero].unitId,
    'Setup opens with a playable default hero')
assert(AnyasLongNight.OpenSetup('HERO') and optionsShown.kind=='HERO' and optionsShown.selected=='anya')
SurvivorConfig.heroes.putress.locked=true
assert(not AnyasLongNight.SelectSetup('HERO','putress'),'A locked hero cannot be selected')
SurvivorConfig.heroes.putress.locked=nil
assert(not AnyasLongNight.SelectSetup('HERO','missing'))
assert(AnyasLongNight.SelectSetup('HERO','anya') and setupShown.hero=='anya')
assert(AnyasLongNight.OpenSetup('WEAPON') and AnyasLongNight.SelectSetup('WEAPON','firebolt'))
assert(AnyasLongNight.OpenSetup('HERO') and AnyasLongNight.SelectSetup('HERO','anya') and setupShown.weapon=='firebolt',
    'Confirming the same hero keeps the starting weapon')
assert(AnyasLongNight.OpenSetup('HERO') and AnyasLongNight.SelectSetup('HERO','putress'))
assert(setupShown.hero=='putress' and setupShown.weapon==nil,'Switching heroes clears the previous hero weapon')
assert(AnyasLongNight.OpenSetup('WEAPON') and optionsShown.hero=='putress')
assert(not AnyasLongNight.SelectSetup('WEAPON','firebolt'),'A weapon owned by another hero is rejected')
assert(AnyasLongNight.SelectSetup('WEAPON','deathcoil') and setupShown.weapon=='deathcoil' and setupShown.hero=='putress')
local anya=SurvivorAugments.NewBuild('firebolt',nil,'anya')
assert(anya.hero=='anya' and SurvivorAugments.CanChoose('frostshard',anya) and SurvivorAugments.CanChoose('power',anya))
assert(not pcall(SurvivorAugments.NewBuild,'firebolt',nil,'putress'),'A starting weapon must belong to the hero')
local foreign={hero='putress',levels={firebolt=7},weapons={'firebolt'},trinkets={},evolutions={},excluded={},stats={}}
assert(not SurvivorAugments.CanChoose('frostshard',foreign) and not SurvivorAugments.CanChoose('firebolt_burst',foreign),
    'Weapons and evolutions are offered only to their own hero')
assert(SurvivorAugments.CanChoose('power',foreign),'Trinkets are shared by every hero')
local empty={hero='putress',levels={},weapons={},trinkets={},evolutions={},excluded={},stats={}}
assert(SurvivorAugments.CanChoose('velocity',empty),'A future Putress projectile weapon keeps projectile speed available')
for id,weapon in pairs(SurvivorConfig.weapons)do if weapon.hero=='putress' and weapon.projectile then empty.excluded[id]=true end end
assert(not SurvivorAugments.CanChoose('velocity',empty),'Projectile speed waits for a projectile weapon of the same hero')
empty.excluded={};for id,weapon in pairs(SurvivorConfig.weapons)do if weapon.hero=='anya' then empty.excluded[id]=true end end
assert(SurvivorAugments.CanChoose('velocity',empty),'Excluding the other hero weapons never blocks projectile speed')
`);

suite('weapon clocks follow the registry: profiles and volleys fire before upkeep, zones keep overshoot', mocks + String.raw`
OnInit={final=function()end}
function GetHeroLevel()return 1 end
function GetHeroSkillPoints()return 0 end
SurvivorExpedition.Step=function()end
SurvivorEquipment={Step=function()end}
SurvivorNativeLoadout={Refresh=function()end}
casts={}
SurvivorCombat={BossDefeated=function()return false end,Counts=function()return 0,0,0 end,
    SpawnBoss=function()return true end,Spawn=function()return true end,
    CastWeapon=function(id)casts[#casts+1]=id end,
    UpdateStatus=function()casts[#casts+1]='upkeep' end,UpdateEnemies=function()end,WarnLava=function()end}
`, [config,'src/00_bootstrap/AnyasLongNight.lua'], String.raw`
local step=Local(AnyasLongNight.BeginRun,'Step')
LifecycleRun().hero=CreateUnit(0,'hero',0,0,0)
LifecycleRun().stats={weapons={flamefield={enabled=true,interval=.05},firebolt={enabled=true,interval=.05},
    orbitblade={enabled=true,interval=.05},meteor={enabled=true,interval=.05},blizzard={enabled=false,interval=.01}}}
SetLocal(step,'selectedDifficulty','normal');SetLocal(step,'RefreshDamageBoard',function()end)
LifecycleRun().stage=1;LifecycleRun().stageStarted=0;LifecycleRun().bossStarted=false;LifecycleRun().nextElite=45
state='RUNNING'
now=.03;step(.03,now)
assert(#casts==1 and casts[1]=='upkeep','Nothing fires before its interval')
casts={};now=.06;step(.03,now)
local order=table.concat(casts,',')
assert(order=='meteor,orbitblade,upkeep,firebolt,flamefield','Unexpected cast order '..order)
local clocks=LifecycleRun().weaponClocks
assert(math.abs(clocks.flamefield-.01)<1e-9 and clocks.firebolt==0 and clocks.meteor==0 and clocks.blizzard==0,
    'Zones carry overshoot; other weapons restart and unowned weapons stay idle')
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
    'src/30_gameplay/SurvivorInventoryPause.lua','src/30_gameplay/SurvivorStory.lua',uiModules,
    'src/30_gameplay/SurvivorSetupUI.lua','src/00_bootstrap/AnyasLongNight.lua'], String.raw`
SurvivorConfig.debugCommands=false
AnyasLongNight.Init()
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
    local current=LifecycleRun().hero
    assert(current.visible and selectedUnit==current and not current.removed
        and cameraNative.x==current.x and cameraNative.y==current.y)
    assert(frames.HSCombatPreparation.visible and frames.HSCombatPreparationStart.visible
        and frames.HSCombatPreparationStart.kind=='GLUETEXTBUTTON'
        and not frames.AnyasLongNightStageIntro.visible and LiveTimers(.03)==0 and LiveTimers(1)==0)
    assert(frames.HSCombatPreparationTitle.text:find(index..' / 5',1,true)
        and frames.HSCombatPreparationMission.text:find('mission',1,true)
        and frames.HSCombatPreparationHint.text:find('hint',1,true))
    assert(not AnyasLongNight.NextStage(),'A pending preparation must block queued Next Stage actions')
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
assert(RunSession.GetState()=='READY'and frames.AnyasLongNightSetupShade.visible
    and frames.AnyasLongNightSetupShadeTop.texture==[[AnyasLongNightUI\Black.tga]])
for _,kind in ipairs({'DIFFICULTY','WEAPON','TRINKET'})do
    ClickFrame(frames['AnyasLongNightSetup'..kind])
    ClickFrame(frames[kind=='DIFFICULTY'and'AnyasLongNightSetupOption2'or'AnyasLongNightSetupOption1'])
end
ClickFrame(frames.AnyasLongNightSetupStart);ClickFrame(frames.AnyasLongNightSetupStart)
local hero=LifecycleRun().hero
assert(hero and not hero.removed and RunSession.GetState()=='STAGE_CLEAR'and halted and expeditionPaused)
local build=LifecycleRun().build
assert(build.weapons[1]=='firebolt'and build.trinkets[1]=='power'
    and Local(AnyasLongNight.BeginRun,'selectedDifficulty')=='normal',
    'Exercise the reported firebolt and increased-damage trinket combination through actual preparation controls')
assert(not frames.AnyasLongNightSetupShade.visible and frames.AnyasLongNightStageIntro.visible)
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
local beforeTalent=build.stats.weapons.firebolt.damage
traitPanel.visible=true;AdvanceVisualTime(.05)
assert(DeliverInventorySync()==1 and not frames.HSCombatPreparation.visible and RunSession.GetState()=='STAGE_CLEAR')
UnitAddAbility(hero,'Ht1A');hero.talentPoints=hero.talentPoints-1
traitPanel.visible=false;AdvanceVisualTime(.05)
assert(DeliverInventorySync()==1 and build.talentChoices[1]=='Ht1A'and build.stats.weapons.firebolt.damage>beforeTalent
    and select(1,SurvivorNativeLoadout.TalentStatus())==0 and frames.HSCombatPreparation.visible
    and BlzGetUnitRealField(hero,UNIT_RF_HIT_POINTS_REGENERATION_RATE)==0,
    'A real native selection is reconciled while paused before the start button is restored')
local firstReady,firstCanStart=latestReady,latestCanStart
StartCountdown()
assert(RunSession.IsRunning()and not halted and not expeditionPaused and resumeCount==1)
assert(hero.visible and selectedUnit==hero and not hero.paused and not hero.removed)
assert(not SurvivorUI.IsNarrativeVisible()and not frames.AnyasLongNightSetupShade.visible
    and not frames.AnyasLongNightStageIntro.visible and LiveTimers(.03)==0)
assert(SurvivorCombat.Counts()==3,'The actual first-story callback creates three enemies outside the new spawn distance')
assert(hero.inventory[1]and not hero.inventory[1].removed,'Starting trinket survives narrative selection restoration')
local elapsed=RunSession.GetElapsed();periodic();assert(RunSession.GetElapsed()>elapsed and expeditionSteps==1)
AdvanceVisualTime(.12);assert(RunSession.IsRunning()and #unsafeFrameCalls==0,
    'Real combat resume and following UI/inventory timers use only supported native frame calls')
hero.level=3;periodic()
assert(RunSession.GetState()=='CHOOSING'and halted and expeditionPaused and frames.AnyasLongNightChoiceRoot.visible,
    'Two actual hero levels open the growth controls and pause combat')
local choiceTime=RunSession.GetElapsed()
local pendingOffers=LifecycleRun().offers
local details=frames.SimpleStatDetailsPanel
details.visible=true;AdvanceVisualTime(.05)
assert(DeliverInventorySync()==1 and RunSession.GetState()=='CHOOSING'and halted
    and not frames.AnyasLongNightChoiceRoot.visible and GetUnitAbilityLevel(hero,'ASde')==1,
    'The real native details observer hides cards without consuming their queued offers')
details.visible=false;AdvanceVisualTime(.05)
assert(DeliverInventorySync()==1 and RunSession.GetState()=='CHOOSING'and halted
    and frames.AnyasLongNightChoiceRoot.visible and LifecycleRun().offers==pendingOffers
    and RunSession.GetElapsed()==choiceTime,'Closing details restores the same live card controls')
local rerolls=LifecycleRun().rerollsRemaining
assert(frames.AnyasLongNightReroll2.enabled);ClickFrame(frames.AnyasLongNightReroll2)
assert(LifecycleRun().rerollsRemaining==rerolls-1 and RunSession.GetState()=='CHOOSING')
local excluded=LifecycleRun().offers[2]
assert(frames.AnyasLongNightExclude2.enabled);ClickFrame(frames.AnyasLongNightExclude2)
assert(build.excluded[excluded]and build.excludesRemaining==SurvivorConfig.excludesPerRun-1
    and LifecycleRun().rerollsRemaining==rerolls-1,
    'Real exclusion replaces the candidate without consuming another reroll or level')
for remaining=1,0,-1 do
    local id=LifecycleRun().offers[1]
    local previous=SurvivorAugments.Level(build,id)
    ClickFrame(frames.AnyasLongNightCard1)
    assert(SurvivorAugments.Level(build,id)==previous+1,'Each card click grants exactly one queued growth reward')
    if remaining>0 then
        periodic();assert(RunSession.GetState()=='CHOOSING'and halted and RunSession.GetElapsed()==choiceTime)
    end
end
assert(RunSession.IsRunning()and not halted and not expeditionPaused and not frames.AnyasLongNightChoiceRoot.visible,
    'The last growth selection closes the modal and resumes the actual session')
ClickFrame(frames.AnyasLongNightCard1)
assert(RunSession.IsRunning(),'A stale click cannot consume another reward or pause the resumed run')
for index=2,5 do
    assert(RunSession.BeginStageClear())
    if index==2 then
        -- Reproduce the same hero/stage/run guard values while the defeated-boss cleanup owns the transition.
        LifecycleRun().stageTransition=true
        local resumed=resumeCount
        assert(not firstCanStart()and not firstReady()and resumeCount==resumed
            and RunSession.GetState()=='STAGE_CLEAR'and SurvivorCombat.Counts()==3,
            'A consumed preparation callback cannot reactivate during the same stage boss pause')
        LifecycleRun().stageTransition=false
    end
    assert(AnyasLongNight.NextStage())
    assert(appliedStage==index and equipmentStage==index and expeditionStage==index and expeditionHero==hero)
    -- Each later stage opens on its arrival scene in the new place; nothing resumes until preparation.
    assert(frames.ScriptDialogButton700.text=='다음 대사'and frames.HSStoryPosition.text:find('1/3')and not hero.visible)
    SurvivorUI.AdvanceNarrative();SurvivorUI.AdvanceNarrative()
    assert(frames.ScriptDialogButton700.text=='수색 준비'and RunSession.GetState()=='STAGE_CLEAR')
    SurvivorUI.AdvanceNarrative();assert(hero.visible);Waiting(index)
    local currentText=frames.HSCombatPreparationTitle.text
    assert(not firstReady()and frames.HSCombatPreparationTitle.text==currentText and RunSession.GetState()=='STAGE_CLEAR',
        'An earlier stage start callback cannot resume a later stage preparation')
    StartCountdown();assert(LifecycleRun().stage==index and selectedUnit==hero)
end
assert(RunSession.Finish('test')and hero.removed and not halted and periodic==nil)
local cast=SurvivorCombat.CastWeapon
SurvivorCombat.CastWeapon=function(id)lastFirstCast=id;return cast(id)end
for _,id in ipairs(SurvivorConfig.startingWeapons)do
    AnyasLongNight.Start();assert(AnyasLongNight.OpenSetup('WEAPON')and AnyasLongNight.SelectSetup('WEAPON',id))
    ClickFrame(frames.AnyasLongNightSetupStart)
    local nextHero=LifecycleRun().hero
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
assert(AnyasLongNight.RetrySame());SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation();Waiting(1)
local staleReady,staleCanStart=latestReady,latestCanStart
assert(SurvivorUI.BeginPreparedCombat());local staleTimer=Local(SurvivorUI.BeginPreparedCombat,'preparationTimer')
assert(RunSession.Finish('test')and staleTimer.destroyed and not SurvivorUI.IsCombatPreparationVisible())
assert(AnyasLongNight.RetrySame());SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation();Waiting(1)
assert(not staleCanStart()and not staleReady(),'Previous-run preparation closures must fail their expected run/hero guards')
staleTimer.callback();assert(LiveTimers(1)==0 and SurvivorUI.IsCombatPreparationVisible()and RunSession.GetElapsed()==0)
StartCountdown();assert(RunSession.IsRunning()and SurvivorCombat.Counts()==3)
assert(RunSession.Finish('test'))
AnyasLongNight.Start();assert(AnyasLongNight.OpenSetup('HERO')and AnyasLongNight.SelectSetup('HERO','putress'))
for _,id in ipairs(SurvivorConfig.heroes.putress.startingWeapons)do
    AnyasLongNight.Start();assert(AnyasLongNight.OpenSetup('WEAPON')and AnyasLongNight.SelectSetup('WEAPON',id))
    ClickFrame(frames.AnyasLongNightSetupStart)
    local nextHero=LifecycleRun().hero
    assert(RunSession.GetState()=='STAGE_CLEAR'and nextHero and GetUnitTypeId(nextHero)==SurvivorConfig.heroes.putress.unitId,
        'Selecting Putress creates the Putress hero unit')
    assert(nextHero.properName=='퓨트리스','The Putress hero is named Putress, not Anya')
    SurvivorUI.AdvanceNarrative();SurvivorUI.SkipConversation();Waiting(1)
    StartCountdown()
    assert(RunSession.IsRunning()and selectedUnit==nextHero and lastFirstCast==id,'Putress starts with '..id)
    assert(SurvivorCombat.Counts()==3 and not halted and #unsafeFrameCalls==0)
    local before=RunSession.GetElapsed();periodic();assert(RunSession.GetElapsed()>before)
    assert(RunSession.Finish('test')and nextHero.removed and not halted and periodic==nil)
end
`);

suite('combat preparation preserves the live arena and requires a fresh click after interruption or replacement', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
SurvivorUI.Init(function()end,function()end,function()end,function()end,function()end)
state='STAGE_CLEAR';local completed,allowed=0,false
local function Ready()completed=completed+1 end
local function CanStart()return allowed end
assert(not SurvivorUI.BeginPreparedCombat()and not SurvivorUI.InterruptCombatPreparation())
SurvivorUI.ShowNarrative('background','premise',Ready)
SurvivorUI.ShowCombatPreparation(2,Ready,CanStart)
local root,start,countdown=frames.HSCombatPreparation,frames.HSCombatPreparationStart,frames.HSCombatCountdown
assert(root.visible and start.visible and not countdown.visible and SurvivorUI.IsNarrativeVisible())
assert(not frames.AnyasLongNightStageIntro.visible and not frames.AnyasLongNightShade.visible
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
assert(fifth.destroyed and not SurvivorUI.IsCombatPreparationVisible()and frames.AnyasLongNightStageIntro.visible)
SurvivorUI.HidePanel();assert(#unsafeFrameCalls==0 and completed==10)
-- A start refused by the gameplay callback keeps the panel and its callback for another click.
local refusals=0
SurvivorUI.ShowCombatPreparation(5,function()refusals=refusals+1;return refusals>1 end,CanStart)
ClickFrame(start);AdvanceVisualTime(3)
assert(refusals==1 and SurvivorUI.IsCombatPreparationVisible()and root.visible and start.visible and not countdown.visible
    and LiveTimers(1)==0,'A refused start returns to the live preparation panel')
ClickFrame(start);AdvanceVisualTime(3)
assert(refusals==2 and not SurvivorUI.IsCombatPreparationVisible(),'The next click starts normally')
SurvivorUI.HidePanel()
`);

suite('combat preparation errors detach callbacks and cleanup proceeds after timer native failures', presentationMocks,
    [config,'src/30_gameplay/SurvivorStory.lua',uiModules], String.raw`
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
SurvivorUI.SetSetupCinematic=function()end
SurvivorStory={title='안야의 긴 밤',notice='창작 외전'}
AnyasLongNight.IsStorySummary=function()return false end
AnyasLongNight.ToggleStorySummary=function()end
`, [config,metrics,augments,'src/30_gameplay/SurvivorSetupUI.lua'], String.raw`
NativeGameUI()
local nativeSetupSnapshots={}
for _,frame in pairs(frames)do
    nativeSetupSnapshots[frame]={visible=frame.visible,enabled=frame.enabled,parent=frame.parent}
end
local chosen='power';local selects,starts,failures,resets,heroSelects=0,0,0,0,0
local failStart=false
RunSession.Fail=function(message) failures=failures+1;failure=message end
local function Event(frame,event)
    for _,trigger in ipairs(triggers)do
        if trigger.frame==frame and trigger.event==event then trigger.action();return end
    end
    error('Missing pointer event')
end
SurvivorSetupUI.Init(function(kind)SurvivorSetupUI.ShowOptions(kind,kind=='TRINKET'and chosen or nil)end,
    function(kind,id)
        -- Gameplay owns the hero too; it answers with the refreshed menu.
        if kind=='HERO' then heroSelects=heroSelects+1;SurvivorSetupUI.ShowMenu('normal','firebolt',chosen,id);return end
        assert(kind=='TRINKET');chosen=id;selects=selects+1
        SurvivorSetupUI.ShowMenu('normal','firebolt',chosen)
    end,function()resets=resets+1;SurvivorSetupUI.ShowMenu('normal','firebolt',chosen)end,
    function()starts=starts+1;if failStart then error('intentional start failure')end end)
SurvivorSetupUI.ShowMenu(nil,nil,nil)
local setupBlack=frames.AnyasLongNightSetupShade
assert(setupBlack.alpha==255 and setupBlack.visible)
for _,side in ipairs({'Top','Bottom','Left','Right'})do
    local piece=frames['AnyasLongNightSetupShade'..side]
    assert(piece.parent==setupBlack and piece.texture==[[AnyasLongNightUI\Black.tga]] and not piece.enabled and piece.anchor.target==frames.AnyasLongNightSetupHole)
end
local hole=frames.AnyasLongNightSetupHole
assert(hole.parent==setupBlack and hole.anchor.target==frames.AnyasLongNightSetupPreview and hole.width>.15 and hole.height>.15,
    'Only the preview window is left uncovered')
assert(frames.AnyasLongNightSetupShadeTop.width>=2.4 and frames.AnyasLongNightSetupShadeBottom.width>=2.4
    and frames.AnyasLongNightSetupShadeLeft.width>=1.2 and frames.AnyasLongNightSetupShadeRight.width>=1.2
    and frames.AnyasLongNightSetupShadeLeft.height==hole.height and frames.AnyasLongNightSetupShadeRight.height==hole.height,
    'The four pieces reach past ultrawide edges around the hole')
assert(setupBlack.width>=2.4 and setupBlack.height>=.6 and setupBlack.x==.4 and setupBlack.y==.3
    and not setupBlack.enabled and frames.AnyasLongNightSetupRoot.level>setupBlack.level,
    'The disabled opaque backdrop spans ultrawide screens while setup controls remain above it')
assert(not frames.AnyasLongNightSetupStart.enabled)
ClickFrame(frames.AnyasLongNightSetupStart);assert(starts==0)
-- Both heroes are listed; the description opens with the selected hero's story.
local anyaStory=SurvivorConfig.heroes.anya.story
assert(frames.AnyasLongNightSetupListTitle.text:find('영웅',1,true)and frames.AnyasLongNightSetupOption1.visible
    and frames.AnyasLongNightSetupOption2.visible and not frames.AnyasLongNightSetupOption3.visible
    and frames.AnyasLongNightSetupChosen1.visible and not frames.AnyasLongNightSetupChosen2.visible
    and frames.AnyasLongNightSetupDescription.text:sub(1,#anyaStory)==anyaStory,
    'Setup opens on the hero list with the selected hero story')
assert(frames.AnyasLongNightSetupWEAPONCaption.text:find('미선택',1,true)and frames.AnyasLongNightSetupWEAPONLabel.text:find('?',1,true))
SurvivorSetupUI.ShowMenu('normal','firebolt',chosen)
local trinketTile=frames.AnyasLongNightSetupTRINKET;local writes=trinketTile.enableWrites or 0
ClickFrame(trinketTile)
assert(trinketTile.enabled and trinketTile.enableWrites==writes+2,'A click drops the button focus that made hovers flicker')
assert(setupBlack.visible and setupBlack.alpha==255,'Equipment option lists retain the black cover')
assert(frames.AnyasLongNightSetupOption11.visible and not frames.AnyasLongNightSetupOption12.visible,'Every trinket fits one list')
local tenth=SurvivorAugments.Get(SurvivorConfig.startingTrinkets[10]).name
Event(frames.AnyasLongNightSetupOption10,FRAMEEVENT_MOUSE_ENTER)
assert(frames.AnyasLongNightSetupDescriptionTitle.text:find(tenth,1,true),'Hovering previews an option')
Event(frames.AnyasLongNightSetupOption10,FRAMEEVENT_MOUSE_LEAVE)
assert(frames.AnyasLongNightSetupDescriptionTitle.text:find(SurvivorAugments.Get(chosen).name,1,true),'Leaving restores the choice')
ClickFrame(frames.AnyasLongNightSetupOption10)
assert(selects==1 and chosen==SurvivorConfig.startingTrinkets[10])
assert(frames.AnyasLongNightSetupListTitle.text:find('장신구',1,true)and frames.AnyasLongNightSetupChosen10.visible
    and not frames.AnyasLongNightSetupChosen1.visible and frames.AnyasLongNightSetupTRINKETCaption.text:find(tenth,1,true),
    'Selecting keeps the list open, marks the choice and updates the summary')
ClickFrame(frames.AnyasLongNightSetupHERO)
assert(frames.AnyasLongNightSetupListTitle.text:find('영웅',1,true)and frames.AnyasLongNightSetupHEROActive.visible
    and not frames.AnyasLongNightSetupTRINKETActive.visible)
ClickFrame(frames.AnyasLongNightSetupOption1)
assert(selects==1 and heroSelects==1 and frames.AnyasLongNightSetupChosen1.visible,'A hero card hands the choice to gameplay')
-- Switching to Putress swaps the preview model and lists only Putress's starting weapons.
local createUnit,previewSkin=CreateUnit,nil
CreateUnit=function(...)local unit=createUnit(...);local skin=BlzSetUnitSkin
    BlzSetUnitSkin=function(u,id)if u==unit then previewSkin=id end;return skin(u,id)end;return unit end
ClickFrame(frames.AnyasLongNightSetupOption2)
CreateUnit=createUnit
assert(heroSelects==2 and frames.AnyasLongNightSetupChosen2.visible and not frames.AnyasLongNightSetupChosen1.visible
    and frames.AnyasLongNightSetupHeroName.text:find(SurvivorConfig.heroes.putress.name,1,true)
    and previewSkin==SurvivorConfig.heroes.putress.previewSkin,'The hero card swaps the summary and the preview model')
ClickFrame(frames.AnyasLongNightSetupWEAPON)
local putressWeapons=SurvivorConfig.heroes.putress.startingWeapons
for i,id in ipairs(putressWeapons)do
    assert(frames['AnyasLongNightSetupName'..i].text:find(SurvivorAugments.Get(id).name,1,true),'Putress lists its own starting weapon '..id)
end
assert(not frames['AnyasLongNightSetupOption'..(#putressWeapons+1)].visible,'Anya weapons never appear for Putress')
ClickFrame(frames.AnyasLongNightSetupHERO);ClickFrame(frames.AnyasLongNightSetupOption1)
assert(heroSelects==3 and frames.AnyasLongNightSetupChosen1.visible)
ClickFrame(frames.AnyasLongNightSetupReset);assert(resets==1)
assert(setupBlack.visible and setupBlack.alpha==255,'Resetting the preparation screen retains opaque black')
failStart=true;ClickFrame(frames.AnyasLongNightSetupStart);ClickFrame(frames.AnyasLongNightSetupStart)
assert(starts==1 and failures==1 and failure:find('intentional start failure'))
assert(not frames.AnyasLongNightSetupRoot.visible and not frames.AnyasLongNightSetupShade.visible)
SurvivorSetupUI.ShowMenu('normal','firebolt',chosen);failStart=false
ClickFrame(frames.AnyasLongNightSetupStart);ClickFrame(frames.AnyasLongNightSetupStart)
assert(starts==2 and failures==1,'A fresh preparation can start once after a handled failure')
local setupRoot,setupShade=frames.AnyasLongNightSetupRoot,frames.AnyasLongNightSetupShade
for _=1,3 do
    SurvivorSetupUI.ShowMenu('normal','firebolt',chosen)
    for _,kind in ipairs({'DIFFICULTY','WEAPON','TRINKET'})do
        ClickFrame(frames['AnyasLongNightSetup'..kind])
        assert(setupShade.visible and setupShade.alpha==255 and setupRoot.visible)
        ClickFrame(frames.AnyasLongNightSetupReset)
    end
    SurvivorSetupUI.Hide();SurvivorSetupUI.Hide()
    assert(not setupRoot.visible and not setupShade.visible)
    assert(frames.AnyasLongNightSetupRoot==setupRoot and frames.AnyasLongNightSetupShade==setupShade,
        'Menu, option and retry cycles reuse both map-lifetime black-cover siblings')
end
for frame,snapshot in pairs(nativeSetupSnapshots)do
    assert(frame.visible==snapshot.visible and frame.enabled==snapshot.enabled and frame.parent==snapshot.parent,
        'Black preparation screens change only their own custom UI and leave native selection panels untouched')
end
`);
