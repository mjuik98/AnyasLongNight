// Catalogs evaluated from the Lua sources: native talents and runtime item/weapon tooltips.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import fengari from 'fengari';
import {root} from './project.mjs';

export function loadTalentCatalog(snapshots = new Map()) {
    const name = path.join(root, 'assets/AnyasLongNightTalents.json'), bytes = fs.readFileSync(name);
    if (snapshots.has(name)) assert.deepEqual(snapshots.get(name), bytes, 'Talent catalog changed during preparation');
    else snapshots.set(name, bytes);
    const data = JSON.parse(bytes);
    assert(data.controller === 'HsTL' && data.base === 'ATua' && data.pointItem === 'ttal');
    assert(typeof data.controllerText === 'string' && data.controllerText.length > 0);
    assert(data.interface && ['title','defaultText','format'].every(key=>typeof data.interface[key]==='string'&&data.interface[key].length>0));
    assert(data.tiers.length === 5, 'The run grants five native talent points');
    const ids = new Set([data.controller]);
    const keys = new Set(['damagePct','speedPct','maxLife','moveSpeed','regeneration','sizePct','rangePct','durationPct']);
    for (const tier of data.tiers) {
        assert(tier.length === 3, 'Native talent tiers need exactly three choices');
        for (const entry of tier) {
            assert(/^Ht[1-5][ABC]$/.test(entry.id) && !ids.has(entry.id), 'Duplicate or invalid talent ID'); ids.add(entry.id);
            assert(entry.name && entry.text && /^ReplaceableTextures\\CommandButtons\\\w+\.blp$/.test(entry.icon));
            assert(Object.keys(entry.bonuses).length > 0);
            for (const [key,value] of Object.entries(entry.bonuses)) assert(keys.has(key) && Number.isFinite(value) && value > 0);
        }
    }
    return data;
}
export function talentLua(data) {
    const literal = value => typeof value === 'string' ? JSON.stringify(value)
        : typeof value === 'number' ? String(value)
        : Array.isArray(value) ? '{' + value.map(literal).join(',') + '}'
        : '{' + Object.entries(value).map(([key,item]) => '[' + JSON.stringify(key) + ']=' + literal(item)).join(',') + '}';
    return 'ANYAS_LONG_NIGHT_TALENTS = ' + literal(data);
}
// Owned item rawcodes: trinkets HsT*, weapon gear Hs##, and set pieces by set code letter
// (Anya e,i,t,b,a,n,c,v; Putress p,g,r,l,f,m; shared tag sets u,o,x,y,j,k,z,w).
export const ownedItemPattern = /^H(?:sT[1-9AB]|[seitabnchvpgrlfmuoxyjkzw]\d{2})$/;
// Evaluate only pure catalog/description code. No Warcraft gameplay natives run.
// Runtime descriptions, native object tooltips and editor strings share one source.
export function loadItemTooltipCatalog(snapshots = new Map()) {
    return loadRuntimeTooltipCatalog(snapshots,false);
}
export function loadWeaponTooltipCatalog(snapshots = new Map()) {
    return loadRuntimeTooltipCatalog(snapshots,true);
}
function loadRuntimeTooltipCatalog(snapshots, weapons) {
    const {lua,lauxlib,lualib,to_luastring,to_jsstring} = fengari;
    const state = lauxlib.luaL_newstate(), catalog = new Map();
    lualib.luaL_openlibs(state);
    try {
        lua.lua_pushjsfunction(state, current => {
            const values = [1,2,3].map(index => to_jsstring(lua.lua_tostring(current,index)));
            assert((weapons ? /^HsW[1-9A-S]:[1-7]$/ : ownedItemPattern).test(values[0]) && !catalog.has(values[0]));
            const optional = index => lua.lua_isstring(current,index) ? to_jsstring(lua.lua_tostring(current,index)) : undefined;
            catalog.set(values[0], {name:values[1],description:values[2].replaceAll('\n','|n'),icon:optional(4),base:optional(5)});
            return 0;
        });
        lua.lua_setglobal(state,to_luastring('EmitItemTooltip'));
        const chunks = [['catalog natives','function FourCC(value)return value end\nALICE_Config={MIN_INTERVAL=.02}'],
            ['talents',talentLua(loadTalentCatalog(snapshots))]];
        for (const name of ['src/00_bootstrap/SurvivorConfig.lua','src/00_bootstrap/SurvivorUtil.lua','src/20_system/SurvivorAugments.lua',
            ...(weapons ? [] : ['src/20_system/SurvivorEquipment.lua'])]) {
            const absolute = path.join(root,name), bytes = fs.readFileSync(absolute);
            if(snapshots.has(absolute))assert.deepEqual(snapshots.get(absolute),bytes,'Tooltip source changed: '+name);
            else snapshots.set(absolute,bytes);
            chunks.push([name,bytes.toString('utf8')]);
        }
        chunks.push(['descriptions',weapons ? String.raw`
for id,weapon in pairs(SurvivorConfig.weapons)do
    local raw,build=weapon.rawcode,SurvivorAugments.NewBuild(id,nil,weapon.hero)
    for level=1,SurvivorConfig.growthMaxLevel do
        build.levels[id]=level;SurvivorAugments.Recalculate(build)
        local name=SurvivorAugments.Get(id).name..' · '..(level==SurvivorConfig.growthMaxLevel and 'MAX' or 'Lv.'..level)
        EmitItemTooltip(raw..':'..level,name,SurvivorAugments.OwnedTooltip(id,build),SurvivorAugments.Get(id).icon)
    end
end
` : String.raw`
for id,raw in pairs(SurvivorConfig.trinketRawcodes)do
    EmitItemTooltip(raw,SurvivorAugments.Get(id).name,SurvivorAugments.OwnedTooltip(id,SurvivorAugments.NewBuild('firebolt',id)))
end
for _,entry in ipairs(SurvivorEquipment.Catalog())do
    EmitItemTooltip(entry.id,SurvivorEquipment.Name(entry.id),SurvivorEquipment.Describe(entry.id,{}),entry.icon,entry.base)
end
`]);
        for(const [label,source] of chunks) {
            let status=lauxlib.luaL_loadbuffer(state,to_luastring(source),null,to_luastring(label));
            if(status===lua.LUA_OK)status=lua.lua_pcall(state,0,0,0);
            assert.equal(status,lua.LUA_OK,'Cannot generate item tooltips: '+(status===lua.LUA_OK?'':to_jsstring(lua.lua_tostring(state,-1))));
        }
        assert.equal(catalog.size,weapons ? weaponObjectCount * growthLevels : itemObjectCount,'Unexpected runtime tooltip catalog size');
        return catalog;
    } finally { lua.lua_close(state); }
}
// Weapon/trinket growth ends at level 7 (SurvivorConfig.growthMaxLevel).
export const growthLevels = 7;
// Passive weapon indicators HsW1..HsWS (SurvivorConfig.weapons[id].rawcode): a tripwire for the catalog size.
export const weaponObjectCount = 28;
// 11 trinkets + 30 single gear + 22 sets of nine pieces, minus Anya set pieces reusing single gear.
export const itemObjectCount = 231;
