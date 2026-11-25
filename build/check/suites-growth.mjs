// Growth: evolutions, tooltips, growth cards and native loadout/talents.
import {augments, combat, config, metrics, suite} from './harness.mjs';
import {mocks} from './mocks.mjs';
suite('putress evolutions apply their engine, status and mode changes', mocks, [config,augments], String.raw`
local count=0
local putressEvolutions={}
for _,weapon in ipairs({'plaguedart','plaguetrail','corrosion','plaguepool','deathcoil','soulchain','wraithguard','shadowscythe',
    'plaguejar','catalyst','boilingflask','acidvials'})do
    for _,id in ipairs(SurvivorAugments.Evolutions(weapon))do putressEvolutions[#putressEvolutions+1]=id end
end
for _,id in ipairs(putressEvolutions)do
    local entry=SurvivorAugments.Get(id);assert(entry and entry.kind=='evolution')
    local weapon=entry.weapon;assert(SurvivorConfig.weapons[weapon].hero=='putress');count=count+1
    local build=SurvivorAugments.NewBuild(weapon,nil,'putress')
    build.levels[weapon]=SurvivorConfig.growthMaxLevel;SurvivorAugments.Recalculate(build)
    assert(SurvivorAugments.CanChoose(id,build));SurvivorAugments.Apply(id,build)
    assert(SurvivorAugments.OwnedTooltip(weapon,build):find(entry.name,1,true))
end
assert(count==24)
local function Evolved(weapon,id)
    local build=SurvivorAugments.NewBuild(weapon,nil,'putress')
    build.levels[weapon]=SurvivorConfig.growthMaxLevel;SurvivorAugments.Recalculate(build)
    for _,evolution in ipairs(SurvivorAugments.Evolutions(weapon))do
        if SurvivorAugments.Get(evolution).name==id then SurvivorAugments.Apply(evolution,build)end
    end
    return build.stats
end
local stats=Evolved('plaguedart','괴사 주입')
assert(stats.weapons.plaguedart.pierce==1 and stats.status.plaguedart.poison==SurvivorConfig.weapons.plaguedart.poison[7]+4)
stats=Evolved('plaguedart','역병 산탄');assert(stats.weapons.plaguedart.count==3)
stats=Evolved('catalyst','임계 반응');assert(stats.status.catalyst.reactionAll and math.abs(stats.status.catalyst.reaction-1.5*1.3)<1e-9)
stats=Evolved('wraithguard','망령 군단');assert(stats.weapons.wraithguard.evolution=='pulse' and stats.weapons.orbitblade.evolution==nil)
stats=Evolved('acidvials','농축 산성');assert(stats.weapons.acidvials.count==1)
stats=Evolved('plaguejar','연쇄 폭발');assert(stats.status.plaguejar.splitJars==2)
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

suite('shadow escape stays visible but disabled while spent and re-enables on stage recharge', mocks + String.raw`
escapeReady,escapeRemaining=true,0
SurvivorCombat={EscapeStatus=function()return escapeReady,escapeRemaining end}
escapeButton={writes=0}
function BlzUnitDisableAbility(u,id,disabled,hidden)
    if id~='HsAE'then return end
    escapeButton.disabled,escapeButton.hidden=disabled,hidden
    escapeButton.writes=escapeButton.writes+1
end
`, [config,metrics,augments,'src/30_gameplay/SurvivorNativeLoadout.lua'], String.raw`
for _,heroId in ipairs({'anya','putress'})do
    escapeReady,escapeRemaining=true,0
    local hero=CreateUnit(0,'hero',0,0,0)
    SurvivorNativeLoadout.Init(hero,SurvivorAugments.NewBuild(heroId=='anya'and'firebolt'or'plaguedart',nil,heroId))
    assert(escapeButton.disabled==false and escapeButton.hidden==false)
    assert(abilityExtendedTooltips.HsAE=='치명적인 피해를 받을 시 30%의 생명력으로 생존합니다.|n주변 적이 적은 방향으로 최대 400 거리 순간 이동하고, 2.5초|n동안 무적 상태가 됩니다.')
    local writes=escapeButton.writes
    SurvivorNativeLoadout.Refresh();assert(escapeButton.writes==writes)
    escapeReady,escapeRemaining=false,2.5;SurvivorNativeLoadout.Refresh()
    assert(escapeButton.disabled and not escapeButton.hidden and GetUnitAbilityLevel(hero,'HsAE')==1)
    assert(abilityTooltips.HsAE:find('보호 중',1,true))
    escapeRemaining=0;SurvivorNativeLoadout.Refresh()
    assert(escapeButton.disabled and abilityTooltips.HsAE:find('소진',1,true))
    escapeReady=true;SurvivorNativeLoadout.Refresh()
    assert(not escapeButton.disabled and not escapeButton.hidden and abilityTooltips.HsAE:find('사용 가능',1,true))
    SurvivorNativeLoadout.Cleanup();assert(GetUnitAbilityLevel(hero,'HsAE')==0)
end
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
    for level=1,SurvivorConfig.growthMaxLevel do
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
    SurvivorNativeLoadout.Refresh();assert(hero.inventory[1]==nil and build.levels[id]==SurvivorConfig.growthMaxLevel)
    hero.paused=false;SurvivorNativeLoadout.Refresh()
    assert(hero.inventory[1]~=item and hero.inventory[1].charges==SurvivorConfig.growthMaxLevel)
    assert(hero.inventory[1].description==SurvivorAugments.OwnedTooltip(id,build):gsub('\n','|n'))
    SurvivorNativeLoadout.Cleanup();build=SurvivorAugments.NewBuild('firebolt',id)
    SurvivorNativeLoadout.Init(hero,build);assert(hero.inventory[1].charges==1)
    assert(hero.inventory[1].description==SurvivorAugments.OwnedTooltip(id,build):gsub('\n','|n'))
    SurvivorNativeLoadout.Cleanup()
end
`);

suite('weapon tooltips stay concise through seven levels, all evolutions and native refreshes', mocks + String.raw`
SurvivorCombat={EscapeStatus=function()return true,0 end,WardStatus=function()return 0,0 end}
weaponText={}
local write=BlzSetAbilityExtendedTooltip
function BlzSetAbilityExtendedTooltip(id,text,level)
    weaponText[id..':'..level]=text;return write(id,text,level)
end
`, [config,metrics,augments,'src/30_gameplay/SurvivorNativeLoadout.lua'], String.raw`
local ids=Local(SurvivorNativeLoadout.Refresh,'weapons')
local function Check(id,build)
    local level=build.levels[id];local text=weaponText[ids[id]..':'..(level-1)]
    assert(text==SurvivorAugments.OwnedTooltip(id,build):gsub('\n','|n'))
    assert(not text:find('자동 적용')and not text:find('레벨업 선택으로 강화')and not text:find('|cffaaaaaa'))
    assert(text:find('쿨다운',1,true)and text:find('피해',1,true),'Keep current numerical combat information')
    if id=='chainlightning'then assert(text:find('전이마다 피해 -15%',1,true))end
    if id=='frontslash'then assert(text:find('대상별 1회 타격',1,true))end
    if SurvivorConfig.weapons[id].engine=='summon'then
        assert(text:find('|cffffcc00소환 상한:|r '..build.stats.weapons[id].cap,1,true))
        assert(not text:find('충돌 없음',1,true)and not text:find('지속 종료 시 사라짐',1,true))
        assert(not text:find('※ 소환 상한',1,true))
    end
end
for id in pairs(ids)do
    local hero=CreateUnit(0,'hero',0,0,0);local build=SurvivorAugments.NewBuild(id,nil,SurvivorConfig.weapons[id].hero)
    SurvivorNativeLoadout.Init(hero,build)
    for level=1,SurvivorConfig.growthMaxLevel do
        if level>1 then SurvivorAugments.Apply(id,build,hero);SurvivorNativeLoadout.Refresh()end
        Check(id,build)
        assert(BlzGetAbilityTooltip(ids[id])==SurvivorAugments.Get(id).name..' · '..(level==SurvivorConfig.growthMaxLevel and 'MAX'or'Lv.'..level))
    end
    local writes=abilityWrites;for _=1,20 do SurvivorNativeLoadout.Refresh()end
    assert(abilityWrites==writes,'Unchanged weapon tooltips must not be rewritten every tick')
    SurvivorNativeLoadout.Cleanup()
end
local allEvolutions={}
for _,weapon in ipairs(SurvivorConfig.weaponOrder)do
    for _,id in ipairs(SurvivorAugments.Evolutions(weapon))do allEvolutions[#allEvolutions+1]=id end
end
assert(#allEvolutions==56)
for _,evolution in ipairs(allEvolutions)do
    local entry=SurvivorAugments.Get(evolution)
    local hero=CreateUnit(0,'hero',0,0,0);local build=SurvivorAugments.NewBuild(entry.weapon,nil,SurvivorConfig.weapons[entry.weapon].hero)
    build.levels[entry.weapon]=SurvivorConfig.growthMaxLevel;SurvivorAugments.Recalculate(build,hero)
    SurvivorNativeLoadout.Init(hero,build);SurvivorAugments.Apply(evolution,build,hero);SurvivorNativeLoadout.Refresh()
    Check(entry.weapon,build)
    assert(weaponText[ids[entry.weapon]..':'..(SurvivorConfig.growthMaxLevel-1)]:find(entry.text,1,true),'Keep every evolution effect and condition')
    assert(BlzGetAbilityTooltip(ids[entry.weapon])==entry.name..' · 진화')
    assert(SurvivorAugments.Preview(evolution,build)=='진화 선택 후 변경 불가')
    SurvivorNativeLoadout.Cleanup()
end
`);

suite('growth cards isolate changed stats and preserve gear, talents, caps and first-acquisition summaries', mocks,
    [config,metrics,augments], String.raw`
local hero=CreateUnit(0,'hero',0,0,0)
local function Plain(text)return text:gsub('|c%x%x%x%x%x%x%x%x',''):gsub('|r','')end
local function At(id,level)
    local build=SurvivorAugments.NewBuild(id,nil,SurvivorConfig.weapons[id].hero)
    build.levels[id]=level;SurvivorAugments.Recalculate(build,hero)
    return build
end
local build=At('firebolt',1)
SurvivorAugments.SetEquipmentBonuses(build,{gear={all={damagePct=.2,speedPct=.1},firebolt={damagePct=.1,extraProjectiles=2}}},hero)
SurvivorAugments.SetTalents(build,{[1]='Ht1A',[2]='Ht2A',[4]='Ht4C'},hero)
local stats,revision=build.stats,build.revision
local text=Plain(SurvivorAugments.Preview('firebolt',build))
assert(not text:find('\n',1,true) and text:find('(+25%)',1,true),'Level 1 to 2 changes only damage')
assert(not text:find('투사체 수',1,true) and not text:find('쿨다운',1,true))
assert(build.stats==stats and build.revision==revision and build.levels.firebolt==1,'Preview must not modify the build')
local a,b=text:match('피해 ([%d.]+) → ([%d.]+)')
assert(math.abs(tonumber(a)-stats.weapons.firebolt.damage)<.051)
SurvivorAugments.Apply('firebolt',build,hero)
assert(math.abs(tonumber(b)-build.stats.weapons.firebolt.damage)<.051,'The displayed result must equal the actual upgrade with talents and gear')
text=Plain(SurvivorAugments.Preview('firebolt',build))
assert(text:find('투사체 수 3 → 4',1,true),'Level 2 to 3 also grants a projectile')
SurvivorAugments.SetEquipmentBonuses(build,{gear={firebolt={extraProjectiles=20}}},hero)
assert(not SurvivorAugments.Preview('firebolt',build):find('투사체 수',1,true),'A capped projectile count is unchanged')
text=SurvivorAugments.Preview('flamefield',At('flamefield',1))
assert(not text:find('범위',1,true) and not text:find('지속',1,true))
assert(SurvivorAugments.Preview('flamefield',At('flamefield',2)):find('범위',1,true))
assert(SurvivorAugments.Preview('flamefield',At('flamefield',3)):find('지속 시간',1,true))
text=Plain(SurvivorAugments.Preview('plaguedart',At('plaguedart',2)))
assert(text:find('중독 2스택/타격 → 3스택/타격',1,true) and not text:find('최대 관통',1,true))
text=Plain(SurvivorAugments.Preview('banshee',At('banshee',6)))
assert(text:find('소환 수 1 → 2',1,true) and not text:find('공격 간격',1,true) and not text:find('지속',1,true))
local multi=SurvivorAugments.NewBuild('firebolt','multicast')
text=Plain(SurvivorAugments.Preview('multicast',multi))
assert(text:find('추가 공격 피해',1,true) and not text:find('\n',1,true),'Unchanged helper count must not be repeated')
for id,weapon in pairs(SurvivorConfig.weapons)do
    local fresh=At(id,0)
    text=Plain(SurvivorAugments.Preview(id,fresh))
    assert(text:find('피해',1,true) and text:find('쿨다운',1,true) and not text:find('→',1,true),'New weapons show current core performance: '..id)
    for level=1,6 do
        local owned=At(id,level)
        text=Plain(SurvivorAugments.Preview(id,owned))
        assert(text:find('피해',1,true) and text:find('→',1,true),'All weapon upgrades show their damage change: '..id)
        for line in text:gmatch('[^\n]+')do
            local before,after=line:match('([%d.]+)[^%d]* → ([%d.]+)')
            if before and after then assert(tonumber(before)~=tonumber(after),'No equal rounded values: '..line)end
        end
        assert(not text:find('전이마다',1,true) and not text:find('대상별 1회',1,true),'Static rules stay in the full weapon tooltip')
    end
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
    assert(select(2,menuText:gsub('|n',''))==0,'Shared menu tooltip contains only the talent point line when nothing is pending')
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

suite('native cooldown display tracks only common bonuses, refreshes passive ranks and preserves automatic weapon clocks', mocks,
    [config,metrics,augments,combat,'src/30_gameplay/SurvivorNativeLoadout.lua'], String.raw`
local hero,build=NewCombat('firebolt')
local writes,active=0,0
local write,rank=BlzSetAbilityRealLevelField,SetUnitAbilityLevel
local disabled=false
BlzUnitDisableAbility=function(u,id,disable,hide)
    if id~='HsCD'then return end
    assert(hide,'The display passive must not occupy a command slot')
    disabled=disable
    if disable then active=0 else
        local fields=BlzGetUnitAbility(u,id).realFields.Icr1
        active=fields and fields[GetUnitAbilityLevel(u,id)-1]or 0
    end
end
BlzSetAbilityRealLevelField=function(...)writes=writes+1;return write(...)end
SetUnitAbilityLevel=function(u,id,level)
    rank(u,id,level)
    if id=='HsCD'then
        assert(disabled,'Suspend the old cached modifier before changing its rank')
        local fields=BlzGetUnitAbility(u,id).realFields.Icr1
        assert(fields and fields[level-1]~=nil,'The inactive rank must be populated before activation')
    end
end
local function Check(expected)
    local interval=build.stats.weapons.firebolt.interval
    SurvivorNativeLoadout.Refresh()
    assert(not disabled and math.abs(active-expected)<1e-9 and math.abs(build.stats.commonCooldownReduction-expected)<1e-9)
    assert(build.stats.weapons.firebolt.interval==interval,'ASde synchronization must not apply cooldown reduction twice')
end
SurvivorNativeLoadout.Init(hero,build);Check(0)
local unchanged=writes;for i=1,30 do Check(0)end;assert(writes==unchanged)
SurvivorAugments.Apply('haste',build,hero);SurvivorAugments.Apply('haste',build,hero)
Check(1-1/1.2)
assert(math.abs(build.stats.weapons.firebolt.interval-SurvivorConfig.weaponEngines.missile.base.interval/1.2)<1e-9)
SurvivorCombat.SetPaused(true,'INVENTORY')
SurvivorAugments.SetEquipmentBonuses(build,{ring={all={speedPct=.10}},fire={firebolt={speedPct=.30}}},hero)
Check(1-1/1.3)
assert(math.abs(build.stats.weapons.firebolt.interval-SurvivorConfig.weaponEngines.missile.base.interval/1.6)<1e-9,
    'Weapon-specific bonuses remain in their own weapon clocks')
SurvivorAugments.SetTalents(build,{[1]='Ht1B'},hero);Check(1-1/1.4)
SurvivorCombat.SetPaused(false);Check(1-1/1.4)
SurvivorAugments.SetEquipmentBonuses(build,{},hero);Check(1-1/1.3)
SurvivorAugments.SetTalents(build,{},hero);build.levels.haste=0;SurvivorAugments.Recalculate(build,hero);Check(0)
UnitRemoveAbility(hero,'HsCD');Check(0)
SurvivorNativeLoadout.Cleanup();assert(GetUnitAbilityLevel(hero,'HsCD')==0)
SurvivorNativeLoadout.Init(hero,build);Check(0);SurvivorNativeLoadout.Cleanup()
local native=BlzSetAbilityRealLevelField;BlzSetAbilityRealLevelField=function()return false end
local ok,message=pcall(SurvivorNativeLoadout.Init,hero,build)
assert(not ok and tostring(message):find('native stat display HsCD'))
BlzSetAbilityRealLevelField=native;SurvivorNativeLoadout.Cleanup();assert(GetUnitAbilityLevel(hero,'HsCD')==0)
`);

suite('renamed ASde rows carry common bonuses only while combat is paused and clear before units resume', mocks,
    [config,metrics,augments,combat,'src/30_gameplay/SurvivorNativeLoadout.lua'], String.raw`
local hero,build=NewCombat('firebolt')
local displays={HsDM={'Isa1','commonDamageBonus',1},HsAR={'Ilv1','commonAreaBonus',1},HsSZ={'Isv1','commonSizeBonus',1},
    HsRG={'Ivam','commonRangeBonus',1},HsDU={'Ocr1','commonDurationBonus',100},HsPS={'Ocr1','commonProjectileSpeedBonus',100}}
local function Active(code)
    local spec=displays[code];local fields=BlzGetUnitAbility(hero,code).realFields[spec[1]]
    return fields and fields[GetUnitAbilityLevel(hero,code)-1]or 0
end
local resuming,resumed=false,0
local pause=PauseUnit
PauseUnit=function(u,flag)
    if resuming and not flag then
        resumed=resumed+1
        for code in pairs(displays)do assert(Active(code)==0,'A unit resumed before '..code..' was cleared')end
    end
    return pause(u,flag)
end
local function Resume()resuming=true;SurvivorCombat.SetPaused(false);resuming=false end
local function Check(paused)
    for code,spec in pairs(displays)do
        assert(GetUnitAbilityLevel(hero,code)>0,'Missing display passive '..code)
        local expected=paused and build.stats[spec[2]]*spec[3]or 0
        assert(math.abs(Active(code)-expected)<1e-9,code..' shows '..tostring(Active(code))..' instead of '..expected)
    end
end
SurvivorNativeLoadout.Init(hero,build);Check(false)
for _,id in ipairs({'power','magnitude','reach','longevity','velocity'})do SurvivorAugments.Apply(id,build,hero)end
SurvivorNativeLoadout.Refresh();Check(false)
assert(build.stats.commonDamageBonus>0 and build.stats.commonSizeBonus>0 and build.stats.commonRangeBonus>0
    and build.stats.commonDurationBonus>0 and build.stats.commonProjectileSpeedBonus>0 and build.stats.commonAreaBonus==0)
SurvivorCombat.SetPaused(true,'INVENTORY');Check(true)
assert(math.abs(Active('HsDM')-build.stats.commonDamageBonus)<1e-9 and Active('HsDU')>1,'Crit-based rows take whole percents')
-- A gear change during the pause is reflected by the inventory tick's refresh.
SurvivorAugments.SetEquipmentBonuses(build,{ring={all={damagePct=.10,areaPct=.20}},fire={firebolt={damagePct=.30}}},hero)
SurvivorNativeLoadout.Refresh();Check(true)
assert(math.abs(build.stats.commonAreaBonus-.20)<1e-9,'Weapon-specific bonuses stay out of the common rows')
Resume();Check(false);assert(resumed>0,'The resume path must unpause the hero')
SurvivorCombat.SetPaused(true,'CHOOSING');Check(true)
Resume();Check(false)
for _=1,10 do SurvivorNativeLoadout.Refresh()end;Check(false)
SurvivorNativeLoadout.Cleanup()
for code in pairs(displays)do assert(GetUnitAbilityLevel(hero,code)==0,'Cleanup keeps '..code)end
PauseUnit=pause
`);

suite('engine regeneration stays visible in interactive panels while paused HP remains frozen', mocks + String.raw`
function ALICE_CallPeriodic(fn)periodic=fn;return fn end
function ALICE_DisableCallback()periodic=nil end
function ALICE_Halt()halted=true end
function ALICE_Resume()halted=false end
-- Deliberately regenerate even on paused units: interactive inventory heroes
-- cannot rely on PauseUnit to freeze HP. Interactive panels must correct their
-- frozen HP snapshot while keeping the native rate visible to ASde.
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
local interfaceText=BlzGetAbilityExtendedTooltip('ASpc')
assert(interfaceText:find('사용 가능 특성 포인트: ',1,true)and not interfaceText:find('생명력 재생',1,true)
    and not interfaceText:find('보관 가능',1,true)and not interfaceText:find('포인트 전달 대기',1,true),
    'The stat skill shows talent points only; regeneration stays in the stat rows')
local calls=abilityWrites
for _=1,20 do SurvivorNativeLoadout.Refresh()end
assert(abilityWrites==calls,'Unchanged talent tooltips do not rewrite the native interface')
assert(RunSession.Start(function()end,{pause=function(reason)SurvivorCombat.SetPaused(true,reason)end,
    resume=function()SurvivorCombat.SetPaused(false)end,finish=function()SurvivorNativeLoadout.Cleanup();SurvivorCombat.Cleanup()end}))
assert(RunSession.BeginChoice()and Rate()==0 and hero.paused)
SurvivorAugments.Apply('renewal',build,hero)
assert(build.stats.regeneration==2 and Rate()==0,'Learning renewal while choosing must not enable regeneration')
calls=abilityWrites;SurvivorNativeLoadout.Refresh()
assert(abilityWrites==calls and not BlzGetAbilityExtendedTooltip('ASpc'):find('초당',1,true),
    'Regeneration changes no longer rewrite the talent tooltip')
AdvanceEngine(60);assert(hero.life==105)
RunSession.SetInventoryOpen(true)
assert(RunSession.GetState()=='CHOOSING'and hero.paused and Rate()==2,
    'Opening ASde over a growth choice must show regeneration without resuming the hero')
AdvanceEngine(.025);SurvivorCombat.MaintainInventoryPause();assert(hero.life==105)
AdvanceEngine(.025);RunSession.SetInventoryOpen(false)
assert(RunSession.GetState()=='CHOOSING'and hero.life==105 and Rate()==0)
local excluded=build.excluded;build.excluded={}
for _,id in ipairs(Local(SurvivorAugments.Roll,'order'))do build.excluded[id]=true end
SurvivorAugments.Apply('recovery',build,hero)
build.excluded=excluded
RunSession.EndChoice()
assert(hero.life==285 and Rate()==2,'A recovery card must keep its explicit heal when choices resume')
hero.life=105;RunSession.BeginChoice();RunSession.SetInventoryOpen(true);RunSession.EndChoice()
assert(RunSession.GetState()=='INVENTORY'and not hero.paused and Rate()==2)
SurvivorAugments.SetEquipmentBonuses(build,{gear={all={maxLife=50,moveSpeed=10}}},hero)
assert(hero.life==105 and Rate()==2,'Equipment recalculation must preserve the displayed rate without healing')
for i=1,1200 do
    AdvanceEngine(.05);SurvivorCombat.MaintainInventoryPause()
    assert(hero.life==105 and Rate()==2,'Every inventory timer tick freezes HP without hiding regeneration')
end
-- Close between observer ticks: the final correction must discard this partial tick.
AdvanceEngine(.025);assert(hero.life>105)
RunSession.SetInventoryOpen(false);assert(RunSession.IsRunning()and Rate()==2)
assert(hero.life==105,'Closing the panel must not retain regeneration from the final partial tick')
AdvanceEngine(5);assert(hero.life==115)
RunSession.BeginStageClear();assert(Rate()==2)
AdvanceEngine(60);SurvivorCombat.MaintainInventoryPause()
assert(hero.life==115,'Story and search preparation remain frozen while their interactive hero keeps its rate')
RunSession.SetInventoryOpen(true)
SurvivorCombat.BeginStage(2,RunSession.GetElapsed())
SurvivorAugments.Apply('renewal',build,hero)
assert(build.stats.regeneration==3 and Rate()==3,'Stage changes and paused upgrades update the visible engine rate')
local full=hero.life
AdvanceEngine(.05);SurvivorCombat.MaintainInventoryPause();assert(hero.life==full)
RunSession.EndStageClear();assert(RunSession.GetState()=='INVENTORY'and Rate()==3)
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
local life,maximum,damage,regen=hero.life,hero.maxLife,build.stats.weapons.firebolt.damage,build.stats.regeneration
SurvivorCombat.SetPaused(true,'STAGE_CLEAR')
assert(SurvivorNativeLoadout.GrantStageTalent(1)and not SurvivorNativeLoadout.GrantStageTalent(1))
assert(hero.talentPoints==1 and select(1,SurvivorNativeLoadout.TalentStatus())==1)
for i=1,6 do assert(hero.inventory[i]==slots[i],'A native powerup must not displace a full classic inventory')end
-- The engine grants an ability, not an event callback we can invent for ATal.
hero.talentPoints=hero.talentPoints-1;UnitAddAbility(hero,'Ht1C')
assert(SurvivorNativeLoadout.Refresh()and hero.life==life and hero.maxLife==maximum+100)
assert(BlzGetUnitRealField(hero,UNIT_RF_HIT_POINTS_REGENERATION_RATE)==regen)
local revision=build.revision
for _=1,100 do assert(not SurvivorNativeLoadout.Refresh())end
assert(build.revision==revision and hero.maxLife==maximum+100,'Repeated native polls must not stack a talent')
assert(talentWrites==15,'Refreshes must not append text or keep rewriting the native talent cache')
assert(SurvivorNativeLoadout.GrantStageTalent(2))
hero.talentPoints=hero.talentPoints-1;UnitAddAbility(hero,'Ht2B');SurvivorNativeLoadout.Refresh()
assert(build.talentTotals.all.rangePct==.12 and build.stats.regeneration==regen
    and BlzGetUnitRealField(hero,UNIT_RF_HIT_POINTS_REGENERATION_RATE)==regen)
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
local before=build.stats.weapons.firebolt.damage
SurvivorAugments.SetEquipmentBonuses(build,{},hero)
assert(hero.maxLife==maximum+300 and build.stats.weapons.firebolt.damage<before and build.talentChoices[3]=='Ht3A')
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
local base={damage=build.stats.weapons.firebolt.damage,interval=build.stats.weapons.firebolt.interval,size=build.stats.weapons.firebolt.hitRadius,
    range=build.stats.weapons.firebolt.range,life=build.stats.weapons.firebolt.lifetime,zone=build.stats.weapons.flamefield.duration}
assert(SurvivorAugments.SetTalents(build,{[1]='Ht1A',[2]='Ht2A',[3]='Ht3B',[4]='Ht4B',[5]='Ht5B'},hero))
assert(math.abs(build.stats.weapons.firebolt.damage/base.damage-1.12)<.00001)
assert(math.abs(build.stats.weapons.firebolt.interval/base.interval-1/1.35)<.00001)
assert(math.abs(build.stats.weapons.firebolt.hitRadius/base.size-1.12)<.00001)
assert(math.abs(build.stats.weapons.firebolt.range/base.range-1.15)<.00001)
local revision=build.revision
assert(not SurvivorAugments.SetTalents(build,build.talentChoices,hero)and build.revision==revision)
SurvivorAugments.SetTalents(build,{[4]='Ht4C'},hero)
assert(math.abs(build.stats.weapons.firebolt.lifetime/base.life-1.15)<.00001
    and math.abs(build.stats.weapons.flamefield.duration/base.zone-1.15)<.00001)
SurvivorAugments.SetTalents(build,{[2]='Ht2C',[4]='Ht4C'},hero)
assert(math.abs(build.stats.weapons.firebolt.lifetime/base.life-1.27)<.00001)
SurvivorAugments.SetTalents(build,{[2]='Ht2A',[4]='Ht4A'},hero)
assert(math.abs(build.stats.weapons.firebolt.hitRadius/base.size-1.30)<.00001)
assert(not pcall(SurvivorAugments.SetTalents,build,{[2]='Ht1A'},hero),'A talent cannot be assigned to another tier')
SurvivorAugments.SetEquipmentBonuses(build,{gear={all={damagePct=.1,speedPct=.1}}},hero)
SurvivorAugments.SetTalents(build,{[1]='Ht1A',[3]='Ht3A',[5]='Ht5A'},hero)
assert(math.abs(build.stats.weapons.firebolt.damage/base.damage-1.65)<.00001)
assert(math.abs(build.stats.weapons.firebolt.interval/base.interval-1/1.1)<.00001)
local preview=SurvivorAugments.PreviewEquipment(build,{})
assert(math.abs(preview.weapons.firebolt.damage/base.damage-1.55)<.00001)
`);
