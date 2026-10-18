// Ordinary builds synchronize game/editor Lua; --refresh-base imports edited geography.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import luaparse from 'luaparse';
import fengari from 'fengari';
import {openMap} from './mpq.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const baseMapPath = path.join(root, 'AnyasLongNight.w3x');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const firstMarker = '-- HeroSurvivor Lua prototype. Import at map script scope before main().';
const lastMarker = '-- ===== END src/00_bootstrap/HeroSurvivor.lua =====';
export function loadTalentCatalog(snapshots = new Map()) {
    const name = path.join(root, 'assets/HeroSurvivorTalents.json'), bytes = fs.readFileSync(name);
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
    return 'HERO_SURVIVOR_TALENTS = ' + literal(data);
}
// Owned item rawcodes: trinkets HsT*, weapon gear Hs##, and set pieces by set code letter
// (Anya e,i,t,b,a,n,c,v; Putress p,g,r,l,f,m).
export const ownedItemPattern = /^H(?:sT[1-9AB]|[seitabnchvpgrlfm]\d{2})$/;
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
            assert((weapons ? /^HsW[1-9A-O]:[1-7]$/ : ownedItemPattern).test(values[0]) && !catalog.has(values[0]));
            const optional = index => lua.lua_isstring(current,index) ? to_jsstring(lua.lua_tostring(current,index)) : undefined;
            catalog.set(values[0], {name:values[1],description:values[2].replaceAll('\n','|n'),icon:optional(4),base:optional(5)});
            return 0;
        });
        lua.lua_setglobal(state,to_luastring('EmitItemTooltip'));
        const chunks = [['catalog natives','function FourCC(value)return value end\nALICE_Config={MIN_INTERVAL=.02}'],
            ['talents',talentLua(loadTalentCatalog(snapshots))]];
        for (const name of ['src/00_bootstrap/SurvivorConfig.lua','src/20_system/SurvivorAugments.lua',
            ...(weapons ? [] : ['src/20_system/SurvivorEquipment.lua'])]) {
            const absolute = path.join(root,name), bytes = fs.readFileSync(absolute);
            if(snapshots.has(absolute))assert.deepEqual(snapshots.get(absolute),bytes,'Tooltip source changed: '+name);
            else snapshots.set(absolute,bytes);
            chunks.push([name,bytes.toString('utf8')]);
        }
        chunks.push(['descriptions',weapons ? String.raw`
local ids={firebolt='HsW1',flamefield='HsW2',chainlightning='HsW3',orbitblade='HsW4',monsoon='HsW5',frontslash='HsW6',frostshard='HsW7',frostnova='HsW8',blizzard='HsW9',meteor='HsWA',thunderorb='HsWB',returnblade='HsWC',
    plaguedart='HsWD',plaguetrail='HsWE',corrosion='HsWF',plaguepool='HsWG',deathcoil='HsWH',soulchain='HsWI',wraithguard='HsWJ',shadowscythe='HsWK',plaguejar='HsWL',catalyst='HsWM',boilingflask='HsWN',acidvials='HsWO'}
for id,raw in pairs(ids)do
    local build=SurvivorAugments.NewBuild(id,nil,SurvivorConfig.weapons[id].hero)
    for level=1,SurvivorConfig.growthMaxLevel do
        build.levels[id]=level;SurvivorAugments.Recalculate(build)
        local name=SurvivorAugments.Get(id).name..' · '..(level==SurvivorConfig.growthMaxLevel and 'MAX' or 'Lv.'..level)
        EmitItemTooltip(raw..':'..level,name,SurvivorAugments.OwnedTooltip(id,build))
    end
end
` : String.raw`
local ids={power='HsT1',haste='HsT2',reach='HsT3',velocity='HsT4',magnitude='HsT5',longevity='HsT6',multicast='HsT7',vitality='HsT8',renewal='HsT9',stride='HsTA',armor='HsTB'}
for id,raw in pairs(ids)do
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
export function collectSources({profile = 'playtest'} = {}) {
    assert(['development', 'playtest', 'release'].includes(profile), 'Invalid build profile');
    const orderPath = path.join(root, 'build/source-order.json');
    const orderBytes = fs.readFileSync(orderPath);
    const order = JSON.parse(orderBytes);
    assert.equal(new Set(order).size, order.length, 'Duplicate source');
    assert.equal(order.at(-1), 'src/00_bootstrap/HeroSurvivor.lua');
    const snapshots = new Map([[orderPath, orderBytes]]);
    const chunks = [firstMarker, `HERO_SURVIVOR_PROFILE = "${profile}"`,
        '-- Native objects/constants: assets/war3map.w3a, assets/war3map.w3t, assets/war3map.w3u, assets/war3mapMisc.txt.',
        talentLua(loadTalentCatalog(snapshots))];
    for (const name of order) {
        assert(/^src\/[\w/]+\.lua$/.test(name), 'Invalid source path: ' + name);
        const absolute = path.join(root, name), bytes = fs.readFileSync(absolute);
        snapshots.set(absolute, bytes);
        const text = bytes.toString('utf8').replaceAll('\r\n', '\n').trimEnd();
        luaparse.parse(text, {luaVersion: '5.3'});
        chunks.push('-- ===== BEGIN ' + name + ' =====', text, '-- ===== END ' + name + ' =====', '');
    }
    const bundle = chunks.join('\n');
    luaparse.parse(bundle, {luaVersion: '5.3'});
    return {bundle, snapshots, count: order.length, profile};
}
// Game-interface text overrides GlobalStrings.fdf keys from [FrameDef], the
// section World Editor writes (its values are TRIGSTR_ references or literal
// text). [CustomSkin] only holds art paths, so stat-row keys left there by the
// 0.1a build are removed. Every other section and line is preserved.
const statTextKey = /^\s*(AS[0-9A-F]{2}_(?:LABEL|TOOLTIP))\s*=/i;
export function installGameInterfaceLabel(bytes, definition) {
    const expected = new Map();
    let inDefinition = false;
    for (const line of definition.toString('utf8').split(/\r?\n/)) {
        const header = line.match(/^\s*\[([^\]]+)\]/);
        if (header) { inDefinition = header[1].toLowerCase() === 'framedef'; continue; }
        const match = line.match(/^(AS[0-9A-F]{2}_(?:LABEL|TOOLTIP))=(.+)$/);
        if (!match) continue;
        assert(inDefinition, 'Interface definitions belong to [FrameDef]: ' + match[1]);
        assert(!expected.has(match[1]), 'Duplicate interface definition: ' + match[1]);
        expected.set(match[1], match[2]);
    }
    assert(expected.has('AS07_LABEL'), 'Missing common cooldown interface label');
    const source = bytes?.toString('utf8') ?? '';
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    const sections = [{name: null, lines: []}];
    for (const line of source.split(/(?<=\n)/).filter(Boolean)) {
        const header = line.match(/^\s*\[([^\]]+)\]/);
        if (header) sections.push({name: header[1].toLowerCase(), lines: [line]});
        else sections.at(-1).lines.push(line);
    }
    assert(sections.filter(section => section.name === 'framedef').length <= 1, 'Duplicate FrameDef section');
    for (const section of sections.filter(section => section.name === 'customskin')) {
        section.lines = section.lines.filter(line => !statTextKey.test(line));
        if (section.lines.every((line, index) => index === 0 || !line.trim())) section.lines = [];
    }
    let frame = sections.find(section => section.name === 'framedef');
    if (!frame) sections.push(frame = {name: 'framedef', lines: ['[FrameDef]' + newline]});
    const written = new Set();
    frame.lines = frame.lines.map(line => {
        const key = line.match(statTextKey)?.[1].toUpperCase();
        if (!key || !expected.has(key)) return line;
        assert(!written.has(key), 'Duplicate ' + key);
        written.add(key);
        return line.replace(/^(\s*[^=]+=)[^\r\n]*/, (_, prefix) => prefix + expected.get(key));
    });
    let tail = frame.lines.length;
    while (tail > 1 && !frame.lines[tail - 1].trim()) tail--;
    const additions = [...expected].filter(([key]) => !written.has(key)).map(([key, value]) => key + '=' + value + newline);
    if (additions.length && !frame.lines[tail - 1].endsWith('\n')) frame.lines[tail - 1] += newline;
    frame.lines.splice(tail, 0, ...additions);
    const output = sections.flatMap(section => section.lines);
    // Separate a section that follows text without a final newline.
    for (let i = 1; i < output.length; i++) if (!output[i - 1].endsWith('\n')) output[i - 1] += newline;
    return Buffer.from(output.join(''));
}
export function prepareUIResources(map, snapshots = new Map()) {
    const name = 'HeroSurvivorUI\\Transparent.tga';
    const asset = path.join(root, 'assets/war3mapImported/HeroSurvivorUI/Transparent.tga');
    const bytes = fs.readFileSync(asset);
    assert.equal(bytes.length, 18 + 8 * 8 * 4, 'Unexpected transparent UI texture size');
    assert.equal(bytes[0], 0); assert.equal(bytes[1], 0); assert.equal(bytes[2], 2);
    assert.equal(bytes.readUInt16LE(12), 8); assert.equal(bytes.readUInt16LE(14), 8);
    assert.equal(bytes[16], 32); assert.equal(bytes[17] & 15, 8);
    for (let i = 21; i < bytes.length; i += 4) assert.equal(bytes[i], 0, 'UI container texture must be fully transparent');
    snapshots.set(asset, bytes);
    const imports = map.read('war3map.imp');
    assert(imports && imports.length >= 8 && imports.readUInt32LE(0) === 1, 'Invalid map import table');
    const count = imports.readUInt32LE(4);
    let p = 8, present = false;
    for (let i = 0; i < count; i++) {
        assert(p < imports.length, 'Truncated map import table');
        const flag = imports[p++], end = imports.indexOf(0, p);
        assert([5, 8, 10, 13].includes(flag) && end >= p, 'Invalid map import entry');
        const entry = imports.toString('utf8', p, end);
        const actual = flag === 10 || flag === 13 ? entry : 'war3mapImported\\' + entry;
        if (actual.replaceAll('/', '\\').toLowerCase() === name.toLowerCase()) present = true;
        p = end + 1;
    }
    assert.equal(p, imports.length, 'Trailing map import data');
    let updated = imports;
    if (!present) {
        const header = Buffer.from(imports.subarray(0, 8)); header.writeUInt32LE(count + 1, 4);
        updated = Buffer.concat([header, imports.subarray(8), Buffer.from([13]), Buffer.from(name + '\0')]);
    }
    const skinAsset = path.join(root, 'assets/war3mapSkin.txt'), definition = fs.readFileSync(skinAsset);
    snapshots.set(skinAsset, definition);
    const skin = installGameInterfaceLabel(map.read('war3mapSkin.txt'), definition);
    return new Map([[name, bytes], ['war3map.imp', updated], ['war3mapSkin.txt', skin]]);
}
export function replaceBundle(script, bundle) {
    const first = script.indexOf(firstMarker), last = script.indexOf(lastMarker);
    assert(first >= 0 && last > first, 'Input must contain a marked HeroSurvivor test bundle');
    assert.equal(script.indexOf(firstMarker, first + firstMarker.length), -1, 'Duplicate bundle');
    assert.equal(script.indexOf(lastMarker, last + lastMarker.length), -1, 'Duplicate bundle end');
    const result = script.slice(0, first) + bundle.trimEnd() + script.slice(last + lastMarker.length);
    luaparse.parse(result, {luaVersion: '5.3'});
    return result;
}
export function verifyPreserved(before, after, changed = ['war3map.lua']) {
    const a = openMap(before), b = openMap(after);
    const list = a.read('(listfile)');
    assert(list, 'Map needs a listfile for preservation checks');
    const names = new Set(['(listfile)', ...list.toString('utf8').split(/\r?\n/).filter(Boolean)]);
    let count = 0;
    const allowed = new Set(['(attributes)', ...changed].map(name => name.toLowerCase()));
    for (const name of names) {
        if (allowed.has(name.toLowerCase())) continue;
        assert.deepEqual(b.read(name), a.read(name), 'Unrelated map entry changed: ' + name);
        count++;
    }
    return count;
}
// Surgical object reader: untouched records and fields retain their exact raw bytes.
export function parseObjectData(bytes, kind = 'unit') {
    assert(['unit', 'item', 'ability'].includes(kind), 'Unsupported object kind: ' + kind);
    const hasLevels = kind === 'ability';
    assert(Buffer.isBuffer(bytes), 'Missing object data');
    let p = 0;
    const take = n => { assert(n >= 0 && p + n <= bytes.length, 'Truncated unit object data');
        const value = bytes.subarray(p, p + n); p += n; return value; };
    const integer = () => take(4).readInt32LE(0), id = () => take(4).toString('latin1');
    const count = minimum => { const value = integer();
        assert(value >= 0 && value <= Math.floor((bytes.length - p) / minimum), 'Invalid unit object count'); return value; };
    const version = integer(); assert([1, 2, 3].includes(version), 'Unsupported unit object version');
    const tables = [[], []], known = new Set();
    for (let table = 0; table < 2; table++) {
        const length = count(12);
        for (let index = 0; index < length; index++) {
            const start = p, oldId = id(), newId = id(), extra = [];
            assert(table === 0 ? newId === '\0\0\0\0' : newId !== '\0\0\0\0', 'Invalid unit object ID layout');
            const objectId = table === 0 ? oldId : newId;
            assert(!known.has(objectId), 'Duplicate unit object ID: ' + objectId); known.add(objectId);
            if (version === 3) { const length = count(4); for (let i = 0; i < length; i++) extra.push(integer()); }
            const fields = [], n = count(hasLevels ? 21 : 13);
            for (let i = 0; i < n; i++) {
                const fieldStart = p, fieldId = id(), type = integer();
                assert(type >= 0 && type <= 3, 'Invalid unit field type');
                const level = hasLevels ? integer() : 0, column = hasLevels ? integer() : 0;
                let value;
                if (type === 3) { const end = bytes.indexOf(0, p); assert(end >= p, 'Unterminated unit string');
                    value = take(end - p + 1).subarray(0, -1).toString('utf8'); }
                else value = type === 0 ? integer() : take(4).readFloatLE(0);
                const endId = id(); fields.push({id: fieldId, type, level, column, value, endId, raw: bytes.subarray(fieldStart, p)});
            }
            tables[table].push({oldId, newId, extra, fields, raw: bytes.subarray(start, p)});
        }
    }
    assert.equal(p, bytes.length, 'Trailing unit object data');
    return {version, kind, tables};
}
export function serializeObjectData(data) {
    const hasLevels = data.kind === 'ability';
    const integer = value => { const bytes = Buffer.alloc(4); bytes.writeInt32LE(value); return bytes; };
    const field = value => {
        if (value.raw) return value.raw;
        const bytes = value.type === 3 ? Buffer.from(value.value + '\0') : Buffer.alloc(4);
        if (value.type === 0) bytes.writeInt32LE(value.value);
        else if (value.type !== 3) bytes.writeFloatLE(value.value);
        return Buffer.concat([Buffer.from(value.id, 'latin1'), integer(value.type),
            ...(hasLevels ? [integer(value.level), integer(value.column)] : []), bytes, Buffer.from(value.endId, 'latin1')]);
    };
    return Buffer.concat([integer(data.version), ...data.tables.flatMap(table => [integer(table.length),
        ...table.map(row => row.raw ?? Buffer.concat([Buffer.from(row.oldId, 'latin1'), Buffer.from(row.newId, 'latin1'),
            ...(data.version === 3 ? [integer(row.extra.length), ...row.extra.map(integer)] : []),
            integer(row.fields.length), ...row.fields.map(field)]))])]);
}
export const parseUnits = bytes => parseObjectData(bytes, 'unit');
export const serializeUnits = data => serializeObjectData({...data, kind: 'unit'});
export function installInterfaceTooltip(bytes,catalog) {
    const data=parseObjectData(bytes,'ability');
    assert.deepEqual(serializeObjectData(data),bytes,'Ability reader must round-trip losslessly');
    assert(!data.tables[1].some(row=>row.newId==='ASpc'),'ASpc collides with a custom ability');
    const matches=data.tables[0].filter(row=>row.oldId==='ASpc');assert(matches.length<=1,'Duplicate ASpc override');
    let row=matches[0];
    if(!row){row={oldId:'ASpc',newId:'\0\0\0\0',extra:data.version===3?[0]:[],fields:[]};data.tables[0].push(row);}
    for(const [id,type,level,value]of [['atp1',3,1,catalog.interface.title],['aub1',3,1,catalog.interface.defaultText],
        ['abpx',0,0,3],['abpy',0,0,0]]) {
        const fields=row.fields.filter(field=>field.id===id&&field.level===level&&field.column===0);
        assert(fields.length<=1,'Duplicate ASpc interface field: '+id);
        if(!fields.length){delete row.raw;row.fields.push({id,type,level,column:0,value,endId:'ASpc'});}
        else {assert.equal(fields[0].type,type);if(fields[0].value!==value){delete row.raw;delete fields[0].raw;fields[0].value=value;}}
    }
    return serializeObjectData(data);
}
function prepareInterfaceTooltip(map,snapshots,preparedAssets=new Map()) {
    const catalog=loadTalentCatalog(snapshots),entries=new Map(),assets=new Map();
    for(const name of ['war3map.w3a','war3mapSkin.w3a']) {
        const asset=path.join(root,'assets',name),source=fs.readFileSync(asset);
        const output=installInterfaceTooltip(map.read(name),catalog);
        const assetOutput=installInterfaceTooltip(preparedAssets.get(asset)??source,catalog);
        assert.deepEqual(output,assetOutput,'ASpc tooltip assets diverge: '+name);
        if(snapshots.has(asset))assert.deepEqual(snapshots.get(asset),source,'ASpc asset changed');else snapshots.set(asset,source);
        entries.set(name,output);assets.set(asset,assetOutput);
    }
    return {entries,assets};
}
// WC3 3.0.0.24268 AbilityMetaData.slk: repeat=4, data=1 (DataA), not DataD.
// AS01 = health regeneration stays native; AS0F (magic resistance) is unused here.
// The other rows are renamed in assets/war3mapSkin.txt and mirror common Lua
// stats through hidden item-stat passives (AbilityData.slk bases and units:
// AIcr/AIap/AIlv/AIsv/ALs1 take fractions, AIxr/AIsc take whole percents).
export const statDetailRows = 'AS01,AS07,AS09,AS0E,AS0C,AS0A,AS04,AS10';
export const statDisplays = [
    {id: 'HsCD', base: 'AIcr', name: '공통 무기 쿨다운 감소', value: 'Icr1', zero: ['Icr2']}, // AS07
    {id: 'HsDM', base: 'AIap', name: '공통 무기 피해 증가', value: 'Isa1', zero: ['Isa2', 'Isa3']}, // AS09
    {id: 'HsAR', base: 'AIlv', name: '공통 무기 범위 증가', value: 'Ilv1', zero: ['Ilv2']}, // AS0E
    {id: 'HsSZ', base: 'AIsv', name: '공통 무기 크기 증가', value: 'Isv1', zero: ['Isv2']}, // AS0C
    {id: 'HsRG', base: 'ALs1', name: '공통 무기 사거리 증가', value: 'Ivam', zero: []}, // AS0A
    {id: 'HsDU', base: 'AIxr', name: '공통 무기 지속시간 증가', value: 'Ocr1', zero: [], real: ['Ixr2', 'Ixr3']}, // AS04
    {id: 'HsPS', base: 'AIsc', name: '공통 투사체 속도 증가', value: 'Ocr1', zero: [], real: ['Ixr2']}, // AS10
];
// Column = metadata data index: the value is DataA, then DataB, DataC.
const displayColumns = {Isa3: 3, Ixr3: 3};
export function installStatDetails(bytes, skin = false) {
    const data = parseObjectData(bytes, 'ability');
    assert.deepEqual(serializeObjectData(data), bytes, 'Ability reader must round-trip losslessly');
    assert(!data.tables[1].some(row => row.newId === 'ASde'), 'ASde collides with a custom ability');
    const rows = data.tables[0].filter(row => row.oldId === 'ASde');
    assert(rows.length <= 1, 'Duplicate ASde ability overrides');
    let row = rows[0];
    if (skin && !row?.fields.some(field => field.id === 'Asdf')) return bytes;
    if (!row) {
        row = {oldId: 'ASde', newId: '\0\0\0\0', extra: data.version === 3 ? [0] : [], fields: []};
        data.tables[0].push(row);
    }
    const fields = row.fields.filter(field => field.id === 'Asdf');
    assert(fields.length <= 1, 'Duplicate ASde supported-stat fields');
    let field = fields[0];
    if (field) {
        assert(field.type === 3 && field.level === 1 && [1,4].includes(field.column), 'Unexpected ASde supported-stat field layout');
        delete field.raw;
        field.column = 1;
        field.value = statDetailRows;
    } else {
        field = {id: 'Asdf', type: 3, level: 1, column: 1, value: statDetailRows, endId: 'ASde'};
        row.fields.push(field);
    }
    delete row.raw;
    for (const spec of statDisplays) {
        assert(!data.tables[0].some(row => row.oldId === spec.id), 'Stat display collides with a native override: ' + spec.id);
        const displays = data.tables[1].filter(row => row.newId === spec.id);
        assert(displays.length <= 1, 'Duplicate stat display: ' + spec.id);
        let display = displays[0];
        if (!display) {
            display = {oldId:spec.base,newId:spec.id,extra:data.version===3?[0]:[],fields:[]};
            data.tables[1].push(display);
        }
        assert.equal(display.oldId, spec.base, 'Stat display base collision: ' + spec.id);
        const set = (id, type, value, level = 0, column = 0) => {
            const fields = display.fields.filter(field => field.id===id && field.level===level && field.column===column);
            assert(fields.length<=1, 'Duplicate stat display field: '+spec.id+'.'+id);
            if (fields.length) {
                const field=fields[0]; assert.equal(field.type,type,'Stat display field type collision: '+spec.id+'.'+id);
                if (field.value===value) return;
                delete field.raw; field.value=value;
            } else display.fields.push({id,type,level,column,value,endId:spec.id});
            delete display.raw;
        };
        set('anam',3,spec.name);
        set('aher',0,0); set('aite',0,0); set('alev',0,2);
        set('abpx',0,0); set('abpy',0,-11);
        for (let level=1; level<=2; level++) {
            set(spec.value,2,0,level,1);
            // Flat Bonus=false keeps percentage rows; crit multipliers stay zero.
            for (const id of spec.zero) set(id,0,0,level,displayColumns[id] ?? 2);
            for (const id of spec.real ?? []) set(id,2,0,level,displayColumns[id] ?? 2);
        }
    }
    return serializeObjectData(data);
}
export function prepareStatDetails(map, snapshots = new Map(), preparedAssets = new Map()) {
    const entries = new Map(), assets = new Map();
    for (const [name, skin] of [['war3map.w3a', false], ['war3mapSkin.w3a', true]]) {
        const bytes = map.read(name), assetPath = path.join(root, 'assets', name), source = fs.readFileSync(assetPath);
        const output = installStatDetails(bytes, skin);
        const assetOutput = installStatDetails(preparedAssets.get(assetPath) ?? source, skin);
        assert.deepEqual(assetOutput, output, 'Asset and test map stat-details data diverge: ' + name);
        if (snapshots.has(assetPath)) assert.deepEqual(source, snapshots.get(assetPath), 'Asset changed during preparation');
        else snapshots.set(assetPath, source);
        entries.set(name, output); assets.set(assetPath, assetOutput);
    }
    return {entries, assets};
}
export function installNativeTalents(bytes, skin, catalog) {
    const data = parseObjectData(bytes, 'ability');
    assert.deepEqual(serializeObjectData(data), bytes, 'Ability reader must round-trip losslessly');
    const ensure = (id, base) => {
        assert(!data.tables[0].some(row => row.oldId === id), 'Talent ID collides with a native override: ' + id);
        const matches = data.tables[1].filter(row => row.newId === id);
        assert(matches.length <= 1, 'Duplicate talent object: ' + id);
        if (matches.length) {assert.equal(matches[0].oldId,base,'Talent base collision: '+id);return matches[0];}
        const row = {oldId:base,newId:id,extra:data.version===3?[0]:[],fields:[]};
        data.tables[1].push(row);return row;
    };
    const set = (row,id,type,value,level=0,column=0) => {
        const matches = row.fields.filter(field => field.id===id && field.level===level && field.column===column);
        assert(matches.length<=1,'Duplicate talent field: '+row.newId+'/'+id);
        if (matches.length) {
            const field=matches[0];assert.equal(field.type,type,'Talent field type collision: '+id);
            if(field.value===value)return;
            delete field.raw;field.value=value;
        } else row.fields.push({id,type,level,column,value,endId:row.newId});
        delete row.raw;
    };
    const controller=ensure(catalog.controller,catalog.base);
    if (skin) {
        set(controller,'anam',3,'긴 밤의 특성');
        for(let level=1;level<=catalog.tiers.length;level++) {
            set(controller,'atp1',3,'긴 밤의 특성 · '+level+'단계',level);
        }
    } else {
        set(controller,'aher',0,0);set(controller,'alev',0,catalog.tiers.length);
        // Metadata: aabi replaces BuffID for code ATal. repeat=4, data=0.
        for(let i=0;i<catalog.tiers.length;i++)set(controller,'aabi',3,catalog.tiers[i].map(entry=>entry.id).join(','),i+1,0);
    }
    for(let level=1;level<=catalog.tiers.length;level++)set(controller,'aub1',3,catalog.controllerText,level);
    for(let tier=0;tier<catalog.tiers.length;tier++)for(const entry of catalog.tiers[tier]) {
        const row=ensure(entry.id,'Aamk');
        if(skin) {
            set(row,'anam',3,entry.name);set(row,'aart',3,entry.icon);
            set(row,'abpx',0,0);set(row,'abpy',0,-11);
            set(row,'atp1',3,entry.name,1);
        } else {
            set(row,'aher',0,0);set(row,'alev',0,1);
            for(const [id,column]of [['Iagi',1],['Iint',2],['Istr',3]])set(row,id,0,0,1,column);
        }
        // Both readers resolve the same description, regardless of skin fallback.
        set(row,'aub1',3,entry.text,1);
    }
    return serializeObjectData(data);
}
export function prepareNativeTalents(map, snapshots = new Map(), preparedAssets = new Map()) {
    const catalog=loadTalentCatalog(snapshots), entries=new Map(),assets=new Map();
    for(const [name,skin]of [['war3map.w3a',false],['war3mapSkin.w3a',true]]) {
        const asset=path.join(root,'assets',name),source=fs.readFileSync(asset);
        const output=installNativeTalents(map.read(name),skin,catalog);
        const assetOutput=installNativeTalents(preparedAssets.get(asset)??source,skin,catalog);
        assert.deepEqual(output,assetOutput,'Asset and test map talents diverge: '+name);
        if(snapshots.has(asset))assert.deepEqual(source,snapshots.get(asset),'Asset changed during preparation');
        else snapshots.set(asset,source);
        entries.set(name,output);assets.set(asset,assetOutput);
    }
    return {entries,assets};
}
// Weapon/trinket growth ends at level 7 (SurvivorConfig.growthMaxLevel).
export const growthLevels = 7;
// Passive weapon indicators: HsW1..HsWC are Anya's, HsWD..HsWO are Putress' (SurvivorNativeLoadout).
export const weaponObjectCount = 24;
// 11 trinkets + 30 single gear + 14 sets of nine pieces, minus Anya set pieces reusing single gear.
export const itemObjectCount = 159;
export const weaponObjectPattern = /^HsW[1-9A-O]$/;
export const putressWeaponObjects = [
    ['HsWD', 'BTNEnvenomedSpear'], ['HsWE', 'BTNPlagueCloud'], ['HsWF', 'BTNCorrosiveBreath'], ['HsWG', 'BTNOrbOfVenom'],
    ['HsWH', 'BTNDeathCoil'], ['HsWI', 'BTNCurse'], ['HsWJ', 'BTNUnholyFrenzy'], ['HsWK', 'BTNDarkRitual'],
    ['HsWL', 'BTNAcidBomb'], ['HsWM', 'BTNTransmute'], ['HsWN', 'BTNHealingSpray'], ['HsWO', 'BTNChemicalRage'],
].map(([id, icon]) => ({id, icon: 'ReplaceableTextures\\CommandButtons\\' + icon + '.blp'}));
export const armorTrinket = {id: 'HsTB', template: 'HsTA', name: '수호의 인장',
    icon: 'ReplaceableTextures\\CommandButtons\\BTNHumanArmorUpOne.blp'};
// Own only the weapon level count, their zero attribute rows and the armor trinket.
// Tooltip text is written afterwards by the weapon/item tooltip synchronization.
export const itemTemplates = {gcel: 'Hs05', bspd: 'Hs13', cnob: 'Ha01', ciri: 'Hs08', ram3: 'Ha05', rlif: 'Ha06',
    ofro: 'Ha07', lhst: 'Ha08', penr: 'Ha09'};
function installGearRows(data, skin, catalog) {
    const text = new Set(['unam', 'utip', 'utub', 'ides', 'iico']);
    for (const [id, item] of catalog) {
        if (/^HsT/.test(id) || !item.base) continue;
        assert(!data.tables[0].some(row => row.oldId === id), 'Gear ID collides with a stock item: ' + id);
        const rows = data.tables[1].filter(row => row.newId === id);
        assert(rows.length <= 1, 'Duplicate gear object: ' + id);
        if (rows.length) { assert.equal(rows[0].oldId, item.base, 'Gear base collision: ' + id); continue; }
        const template = data.tables[1].find(row => row.newId === itemTemplates[item.base]);
        assert(template && template.oldId === item.base, 'Missing gear template for ' + item.base);
        const fields = template.fields.filter(field => !text.has(field.id)).map(field => ({id: field.id, type: field.type,
            level: field.level, column: field.column, value: field.value, endId: id}));
        const add = (field, value) => fields.push({id: field, type: 3, level: 0, column: 0, value, endId: id});
        if (skin) { add('unam', item.name); add('iico', item.icon); add('utip', item.name); }
        add('utub', item.description); add('ides', item.description);
        data.tables[1].push({oldId: item.base, newId: id, extra: [...template.extra], fields});
    }
}
export function installGrowthObjects(entries, itemCatalog = loadItemTooltipCatalog()) {
    const output = new Map(entries);
    const abilities = parseObjectData(entries.get('war3map.w3a'), 'ability');
    assert.deepEqual(serializeObjectData(abilities), entries.get('war3map.w3a'), 'Ability reader must round-trip losslessly');
    // Putress indicators are created from HsW1's level metadata; tooltips are filled later.
    const template = abilities.tables[1].find(row => row.newId === 'HsW1');
    assert(template && template.oldId === 'Aamk', 'Missing weapon template HsW1');
    for (const object of putressWeaponObjects) {
        assert(!abilities.tables[0].some(row => row.oldId === object.id), 'Weapon ID collides with a stock ability: ' + object.id);
        const rows = abilities.tables[1].filter(row => row.newId === object.id);
        assert(rows.length <= 1, 'Duplicate weapon object: ' + object.id);
        if (rows.length) continue;
        abilities.tables[1].push({oldId: 'Aamk', newId: object.id, extra: [...template.extra],
            fields: template.fields.filter(field => field.id === 'aher' || field.id === 'alev')
                .map(field => ({id: field.id, type: field.type, level: field.level, column: field.column, value: field.value, endId: object.id}))});
    }
    const weapons = abilities.tables[1].filter(row => weaponObjectPattern.test(row.newId));
    assert.equal(weapons.length, weaponObjectCount, 'Missing native weapon objects');
    for (const row of weapons) {
        assert.equal(row.oldId, 'Aamk', 'Weapon base collision: ' + row.newId);
        const levels = row.fields.filter(field => field.id === 'alev');
        assert(levels.length === 1 && levels[0].type === 0 && levels[0].value >= 1 && levels[0].value <= growthLevels,
            'Unexpected weapon level field: ' + row.newId);
        if (levels[0].value !== growthLevels) { delete row.raw; delete levels[0].raw; levels[0].value = growthLevels; }
        for (let level = 1; level <= growthLevels; level++) for (const [id, column] of [['Iagi', 1], ['Iint', 2], ['Istr', 3]]) {
            const fields = row.fields.filter(field => field.id === id && field.level === level && field.column === column);
            assert(fields.length <= 1 && (!fields.length || fields[0].type === 0 && fields[0].value === 0),
                'Weapon indicators must not grant attributes: ' + row.newId);
            if (!fields.length) { delete row.raw; row.fields.push({id, type: 0, level, column, value: 0, endId: row.newId}); }
        }
    }
    output.set('war3map.w3a', serializeObjectData(abilities));
    const skins = parseObjectData(entries.get('war3mapSkin.w3a'), 'ability');
    assert.deepEqual(serializeObjectData(skins), entries.get('war3mapSkin.w3a'), 'Ability skin reader must round-trip losslessly');
    const skinTemplate = skins.tables[1].find(row => row.newId === 'HsW1');
    assert(skinTemplate && skinTemplate.oldId === 'Aamk', 'Missing weapon skin template HsW1');
    for (const object of putressWeaponObjects) {
        const rows = skins.tables[1].filter(row => row.newId === object.id);
        assert(rows.length <= 1, 'Duplicate weapon skin: ' + object.id);
        if (rows.length) {
            const art = rows[0].fields.filter(field => field.id === 'aart');
            assert(art.length === 1 && art[0].value === object.icon, 'Unexpected weapon icon: ' + object.id);
            continue;
        }
        const base = (id, value) => {
            const field = skinTemplate.fields.find(candidate => candidate.id === id && candidate.level === 0 && candidate.column === 0);
            assert(field, 'Weapon skin template lacks ' + id);
            return {id, type: field.type, level: 0, column: 0, value: value ?? field.value, endId: object.id};
        };
        skins.tables[1].push({oldId: 'Aamk', newId: object.id, extra: [...skinTemplate.extra],
            fields: [base('anam', object.id), base('aart', object.icon), base('abpx'), base('abpy')]});
    }
    output.set('war3mapSkin.w3a', serializeObjectData(skins));
    for (const [name, skin] of [['war3map.w3t', false], ['war3mapSkin.w3t', true]]) {
        const data = parseObjectData(entries.get(name), 'item');
        assert.deepEqual(serializeObjectData(data), entries.get(name), 'Item reader must round-trip losslessly');
        installGearRows(data, skin, itemCatalog);
        output.set(name, serializeObjectData(data));
        assert(!data.tables[0].some(row => row.oldId === armorTrinket.id), 'Armor trinket collides with a stock item');
        const rows = data.tables[1].filter(row => row.newId === armorTrinket.id);
        assert(rows.length <= 1, 'Duplicate armor trinket');
        if (rows.length) { assert.equal(rows[0].oldId, 'cnob', 'Armor trinket base collision'); continue; }
        const template = data.tables[1].find(row => row.newId === armorTrinket.template);
        assert(template && template.oldId === 'cnob', 'Missing trinket template: ' + armorTrinket.template);
        const text = {unam: armorTrinket.name, utip: armorTrinket.name, utub: armorTrinket.name, ides: armorTrinket.name, iico: armorTrinket.icon};
        const fields = template.fields.map(field => ({id: field.id, type: field.type, level: field.level, column: field.column,
            value: text[field.id] ?? field.value, endId: armorTrinket.id}));
        assert.deepEqual(fields.map(field => field.id).filter(id => text[id]).sort(),
            (skin ? ['ides', 'iico', 'unam', 'utip', 'utub'] : ['ides', 'utub']), 'Unexpected trinket template fields');
        data.tables[1].push({oldId: 'cnob', newId: armorTrinket.id, extra: [...template.extra], fields});
        output.set(name, serializeObjectData(data));
    }
    return output;
}
export function prepareGrowthObjects(map, snapshots = new Map(), preparedAssets = new Map()) {
    const names = ['war3map.w3a', 'war3mapSkin.w3a', 'war3map.w3t', 'war3mapSkin.w3t'];
    const itemCatalog = loadItemTooltipCatalog(snapshots);
    const entries = installGrowthObjects(new Map(names.map(name => [name, map.read(name)])), itemCatalog);
    const sources = new Map(names.map(name => [name, fs.readFileSync(path.join(root, 'assets', name))]));
    const outputs = installGrowthObjects(new Map(names.map(name => [name, preparedAssets.get(path.join(root, 'assets', name)) ?? sources.get(name)])), itemCatalog);
    const assets = new Map();
    for (const name of names) {
        const asset = path.join(root, 'assets', name);
        assert.deepEqual(entries.get(name), outputs.get(name), 'Asset and test map growth objects diverge: ' + name);
        if (snapshots.has(asset)) assert.deepEqual(snapshots.get(asset), sources.get(name), 'Growth asset changed: ' + name);
        else snapshots.set(asset, sources.get(name));
        assets.set(asset, outputs.get(name));
    }
    return {entries, assets};
}
export function cleanWeaponTooltipEntries(entries, catalog) {
    assert.equal(catalog.size,weaponObjectCount * growthLevels,'Expected seven-level weapons for every indicator');
    const output=new Map(entries),strings=stringTable(entries.get('war3map.wts'));
    const skins=parseObjectData(entries.get('war3mapSkin.w3a'),'ability'),expectedStrings=new Map(),otherReferences=new Set();
    for(const name of ['war3map.w3a','war3mapSkin.w3a']) {
        const data=parseObjectData(entries.get(name),'ability');
        const rows=data.tables[1].filter(row=>weaponObjectPattern.test(row.newId));
        assert.equal(rows.length,weaponObjectCount,'Missing native weapon objects in '+name);
        for(const row of rows) {
            assert.equal(row.oldId,'Aamk','Weapon base collision: '+row.newId);
            const skin=skins.tables[1].find(value=>value.newId===row.newId&&value.oldId===row.oldId);
            assert(skin,'Missing weapon skin: '+row.newId);
            const setText=(id,level,expected)=>{
                const sourceFields=skin.fields.filter(field=>field.id===id&&field.level===level&&field.column===0);
                const fields=row.fields.filter(field=>field.id===id&&field.level===level&&field.column===0);
                assert(sourceFields.length<=1&&fields.length<=1,'Duplicate weapon text: '+row.newId+'/'+id);
                const value=sourceFields[0]?.value??expected;
                assert(typeof value==='string'&&(!sourceFields.length||sourceFields[0].type===3));
                const reference=value.match(/^TRIGSTR_(\d+)$/);
                const text=reference?value:expected;
                if(reference) {
                    const key=Number(reference[1]);assert(strings.has(key),'Missing weapon string: '+key);
                    assert(!expectedStrings.has(key)||expectedStrings.get(key)===expected,'Conflicting weapon string: '+key);
                    expectedStrings.set(key,expected);
                }
                if(!fields.length) {
                    delete row.raw;row.fields.push({id,type:3,level,column:0,value:text,endId:row.newId});
                } else {
                    assert.equal(fields[0].type,3);
                    if(fields[0].value!==text){delete row.raw;delete fields[0].raw;fields[0].value=text;}
                }
            };
            setText('anam',0,catalog.get(row.newId+':1').name.replace(/ · Lv\.1$/,''));
            for(let level=1;level<=growthLevels;level++) {
                const expected=catalog.get(row.newId+':'+level);assert(expected);
                setText('atp1',level,expected.name);setText('aub1',level,expected.description);
            }
        }
        for(const row of data.tables.flat())for(const field of row.fields) {
            if(field.type!==3)continue;
            const reference=field.value.match(/^TRIGSTR_(\d+)$/);
            if(reference&&!(weaponObjectPattern.test(row.newId)&&['anam','atp1','aub1'].includes(field.id)))otherReferences.add(Number(reference[1]));
        }
        output.set(name,serializeObjectData(data));
    }
    for(const [id,text]of expectedStrings)assert(!otherReferences.has(id)||strings.get(id)===text,'Weapon text is shared with unrelated data: '+id);
    const cleaned=Buffer.from(entries.get('war3map.wts').toString('utf8').replace(/^((?:\uFEFF)?STRING[ \t]+(\d+)[ \t]*\r?\n(?:\/\/[^\r\n]*\r?\n|[ \t]*\r?\n)*\{[ \t]*\r?\n)([\s\S]*?)(\r?\n\})/gm,
        (whole,header,id,text,end)=>expectedStrings.has(Number(id))?header+expectedStrings.get(Number(id))+end:whole));
    const after=stringTable(cleaned);assert.equal(after.size,strings.size);
    for(const [id,text]of strings)assert.equal(after.get(id),expectedStrings.get(id)??text,'Weapon string readback differs: '+id);
    output.set('war3map.wts',cleaned);
    return output;
}
export function prepareWeaponTooltips(map,snapshots=new Map(),preparedAssets=new Map()) {
    const names=['war3map.w3a','war3mapSkin.w3a','war3map.wts'],catalog=loadWeaponTooltipCatalog(snapshots);
    const entries=cleanWeaponTooltipEntries(new Map(names.map(name=>[name,map.read(name)])),catalog);
    const sources=new Map(names.map(name=>[name,fs.readFileSync(path.join(root,'assets',name))]));
    const outputs=cleanWeaponTooltipEntries(new Map(names.map(name=>[name,preparedAssets.get(path.join(root,'assets',name))??sources.get(name)])),catalog);
    const assets=new Map();
    for(const name of names) {
        const asset=path.join(root,'assets',name),source=sources.get(name);
        if(!name.endsWith('.wts'))assert.deepEqual(entries.get(name),outputs.get(name),'Weapon tooltip assets diverge: '+name);
        if(snapshots.has(asset))assert.deepEqual(snapshots.get(asset),source,'Weapon tooltip asset changed: '+name);
        else snapshots.set(asset,source);
        assets.set(asset,outputs.get(name));
    }
    return {entries,assets};
}
export function installHeroRegeneration(bytes, skin = false) {
    const data = parseUnits(bytes);
    assert.deepEqual(serializeUnits(data), bytes, 'Unit reader must round-trip losslessly');
    assert(!data.tables[1].some(row => row.newId === 'Uany'), 'Native Anya collides with a custom unit');
    const rows = data.tables[0].filter(row => row.oldId === 'Uany');
    assert(rows.length <= 1, 'Duplicate Anya unit overrides');
    let row = rows[0];
    if (skin && !row) return bytes;
    if (!row) {
        row = {oldId: 'Uany', newId: '\0\0\0\0', extra: data.version === 3 ? [0] : [], fields: []};
        data.tables[0].push(row);
    }
    // Object data stores regenType as the editor string "always", not the
    // integer enum accepted by UNIT_IF_HIT_POINTS_REGENERATION_TYPE at runtime.
    // The runtime supplies the complete rate, including 0 while paused.
    for (const [id, type, value] of [['uhrt', 3, 'always'], ['uhpr', 1, 0]]) {
        const fields = row.fields.filter(field => field.id === id);
        assert(fields.length <= 1, 'Duplicate Anya regeneration field: ' + id);
        const field = fields[0];
        if (skin && !field) continue;
        if (field) {
            assert(id === 'uhrt'
                ? field.type === 3 && ['none', 'always', 'blight', 'day', 'night'].includes(field.value)
                    || field.type === 0 && Number.isInteger(field.value) && field.value >= 0 && field.value <= 4
                : [1, 2].includes(field.type), 'Unexpected Anya regeneration type: ' + id);
            if (field.value === value && (id !== 'uhrt' || field.type === type)) continue;
            delete field.raw; field.type = type; field.value = value;
        } else row.fields.push({id, type, level: 0, column: 0, value, endId: 'Uany'});
        delete row.raw;
    }
    return serializeUnits(data);
}
// Putress copies every Uany gameplay override (stats, regeneration, no native skills)
// so both heroes start identical; the skin row only changes presentation.
export const putressHero = {id: 'HsPu', base: 'Uany', name: '퓨트리스',
    model: 'Units\\Forsaken\\Hero_Putress\\Hero_Putress.mdl',
    icon: 'ReplaceableTextures\\CommandButtons\\BTNPutress.blp'};
export function installPutressHero(bytes, skin = false) {
    const data = parseUnits(bytes);
    assert.deepEqual(serializeUnits(data), bytes, 'Unit reader must round-trip losslessly');
    assert(!data.tables[0].some(row => row.oldId === putressHero.id), 'Putress ID collides with a stock unit');
    const source = data.tables[0].filter(row => row.oldId === putressHero.base);
    assert(source.length === 1, 'Putress needs the Anya unit overrides');
    const fields = skin
        ? [['umdl', putressHero.model], ['unam', putressHero.name], ['uico', putressHero.icon], ['upro', putressHero.name], ['usnd', '']]
            .map(([id, value]) => ({id, type: 3, level: 0, column: 0, value, endId: putressHero.id}))
        : source[0].fields.map(field => ({id: field.id, type: field.type, level: field.level, column: field.column,
            value: field.value, endId: putressHero.id}));
    const rows = data.tables[1].filter(row => row.newId === putressHero.id);
    assert(rows.length <= 1, 'Duplicate Putress hero');
    const same = row => row.oldId === putressHero.base && row.fields.length === fields.length
        && row.fields.every((field, i) => ['id', 'type', 'level', 'column', 'value'].every(key => (field[key] ?? 0) === (fields[i][key] ?? 0)));
    if (rows.length && same(rows[0])) return bytes;
    if (rows.length) { delete rows[0].raw; rows[0].oldId = putressHero.base; rows[0].fields = fields; }
    else data.tables[1].push({oldId: putressHero.base, newId: putressHero.id, extra: data.version === 3 ? [0] : [], fields});
    return serializeUnits(data);
}
export function validateStrengthRegeneration(bytes) {
    let section = '', values = [];
    for (const line of bytes.toString('utf8').split(/\r?\n/)) {
        const header = line.match(/^\s*\[([^\]]+)\]/);
        if (header) section = header[1].toLowerCase();
        const field = section === 'misc' && line.match(/^\s*StrRegenBonus\s*=\s*([^;\r\n]*)/i);
        if (field) values.push(field[1].trim() === '' ? NaN : Number(field[1].trim()));
    }
    assert(values.length === 1 && values[0] === 0, 'Native hero regeneration requires exactly one StrRegenBonus=0');
}
export function prepareHeroRegeneration(map, snapshots = new Map(), preparedAssets = new Map()) {
    validateStrengthRegeneration(map.read('war3mapMisc.txt'));
    const entries = new Map(), assets = new Map();
    for (const [name, skin] of [['war3map.w3u', false], ['war3mapSkin.w3u', true]]) {
        const bytes = map.read(name), assetPath = path.join(root, 'assets', name), source = fs.readFileSync(assetPath);
        const output = installPutressHero(installHeroRegeneration(bytes, skin), skin);
        const assetOutput = installPutressHero(installHeroRegeneration(preparedAssets.get(assetPath) ?? source, skin), skin);
        assert.deepEqual(assetOutput, output, 'Asset and test map hero regeneration diverge: ' + name);
        if (snapshots.has(assetPath)) assert.deepEqual(source, snapshots.get(assetPath), 'Asset changed during preparation');
        else snapshots.set(assetPath, source);
        entries.set(name, output); assets.set(assetPath, assetOutput);
    }
    return {entries, assets};
}
export const portraitUnits = [
    {id: 'hsPA', name: '안야', model: 'Units\\Forsaken\\HeroAnya\\HeroAnya.mdl',
        legacyModel: 'Units\\Creeps\\BansheeRanger\\BansheeRanger.mdl',
        armorType: 'hero',
        icon: 'ReplaceableTextures\\CommandButtons\\BTNBansheeRanger.blp'},
    {id: 'hsPP', name: '퓨트리스', model: 'Units\\Forsaken\\Hero_Putress\\Hero_Putress.mdl',
        armorType: 'hero',
        icon: 'ReplaceableTextures\\CommandButtons\\BTNNecromancer.blp'},
];
export function installPortraitUnits(bytes, skin = false, {migrateLegacyAnya = false, migrateLegacyArmor = false, migrateLegacyUpgrades = false} = {}) {
    const data = parseUnits(bytes); assert.deepEqual(serializeUnits(data), bytes, 'Unit reader must round-trip losslessly');
    const migratedFields = new Map();
    const recordMigration = (row, index, id, type, value) => {
        if (!migratedFields.has(row.newId)) migratedFields.set(row.newId, new Map());
        migratedFields.get(row.newId).set(index, {id, type, value});
    };
    for (const unit of portraitUnits) {
        // Native animated portraits follow umdl. upat is not a portrait override.
        const values = skin ? [['umdl', 3, unit.model], ['unam', 3, unit.name], ['uico', 3, unit.icon],
            ['usnd', 3, ''], ['ushu', 3, '']] : [['uabi', 3, ''], ['uaen', 0, 0], ['ucol', 2, 0],
            ['umvs', 0, 0], ['ufoo', 0, 0], ['uhom', 0, 1], ['udty', 3, unit.armorType], ['upgr', 3, '']];
        const existing = data.tables.flat().find(row => (row.newId === '\0\0\0\0' ? row.oldId : row.newId) === unit.id);
        if (existing) {
            assert.equal(existing.newId, unit.id, 'Portrait ID collides with a stock object');
            assert.equal(existing.oldId, 'hfoo', 'Portrait ID has an unexpected base: ' + unit.id);
            // Base data owns the armor override. Existing skin overrides must agree, but
            // absent skin fields inherit the base and need no extra gameplay metadata.
            if (skin && existing.fields.some(field => field.id === 'udty')) values.push(['udty', 3, unit.armorType]);
            if (skin && existing.fields.some(field => field.id === 'upgr')) values.push(['upgr', 3, '']);
            for (const [id, type, value] of values) {
                const matches = existing.fields.filter(field => field.id === id);
                // Removing the override would inherit hfoo's upgrade list again.
                // Own an explicit empty string in base data and any existing skin override.
                if (id === 'upgr' && (!matches.length || matches.length === 1 && matches[0].type === 3 && matches[0].value === 'Rguv')) {
                    assert(migrateLegacyUpgrades, 'Story portrait inherits Rguv; run build with --portrait-objects before publishing');
                    const index = matches.length ? existing.fields.indexOf(matches[0]) : existing.fields.length;
                    delete existing.raw;
                    if (matches.length) { delete matches[0].raw; matches[0].value = value; }
                    else existing.fields.push({id, type, value, endId: unit.id});
                    recordMigration(existing, index, id, type, value);
                    continue;
                }
                if (id === 'udty' && !matches.length) {
                    assert(migrateLegacyArmor, 'Story portrait armor is not explicit Hero; run build with --portrait-objects before publishing');
                    const index = existing.fields.length;
                    delete existing.raw;
                    existing.fields.push({id, type, value, endId: unit.id});
                    recordMigration(existing, index, id, type, value);
                    continue;
                }
                assert.equal(matches.length, 1, 'Portrait field missing or duplicated: ' + unit.id + ' ' + id);
                if (skin && unit.id === 'hsPA' && id === 'umdl' && matches[0].type === 3 && matches[0].value === unit.legacyModel) {
                    assert(migrateLegacyAnya, 'Story Anya portrait uses the old model; run build with --portrait-objects before publishing');
                    const field = matches[0];
                    recordMigration(existing, existing.fields.indexOf(field), id, type, value);
                    // Clear both serialization caches, keeping every other raw field and row untouched.
                    delete existing.raw; delete field.raw; field.value = value;
                }
                if (id === 'udty' && matches[0].type === 3 && matches[0].value === 'normal') {
                    assert(migrateLegacyArmor, 'Story portrait still uses Normal armor; run build with --portrait-objects before publishing');
                    const field = matches[0];
                    recordMigration(existing, existing.fields.indexOf(field), id, type, value);
                    delete existing.raw; delete field.raw; field.value = value;
                }
                assert(matches[0].type === type && matches[0].value === value, 'Portrait ID contains conflicting fields: ' + unit.id + ' ' + id);
            }
        } else data.tables[1].push({oldId: 'hfoo', newId: unit.id, extra: data.version === 3 ? [0] : [],
            fields: values.map(([id, type, value]) => ({id, type, value, endId: unit.id}))});
    }
    const output = serializeUnits(data), verified = parseUnits(output);
    const previous = parseUnits(bytes);
    for (const [table, rows] of previous.tables.entries()) for (const row of rows) {
        const after = verified.tables[table].find(next => next.oldId === row.oldId && next.newId === row.newId);
        if (!migratedFields.has(row.newId)) assert.deepEqual(after.raw, row.raw, 'Unrelated unit record changed');
        else {
            const migrations = migratedFields.get(row.newId);
            const added = [...migrations.keys()].filter(index => index >= row.fields.length).length;
            assert.equal(after.fields.length, row.fields.length + added, 'Portrait migration changed unexpected field count');
            const prefix = value => value.raw.subarray(0, value.raw.length - value.fields.reduce((sum, field) => sum + field.raw.length, 0) - 4);
            assert.deepEqual(prefix(after), prefix(row), 'Portrait migration changed its record header');
            for (const [i, field] of row.fields.entries()) {
                if (!migrations.has(i)) assert.deepEqual(after.fields[i].raw, field.raw, 'Portrait migration changed an unrelated field');
                else {
                    assert.equal(after.fields[i].id, field.id); assert.equal(after.fields[i].type, field.type);
                    assert.equal(after.fields[i].endId, field.endId);
                    assert.equal(after.fields[i].value, migrations.get(i).value);
                }
            }
            for (let i = row.fields.length; i < after.fields.length; i++) {
                const expected = migrations.get(i), field = after.fields[i];
                assert(['udty', 'upgr'].includes(expected?.id), 'Portrait migration added an unrelated field');
                assert.equal(field.id, expected.id); assert.equal(field.type, expected.type);
                assert.equal(field.value, expected.value); assert.equal(field.endId, row.newId);
            }
        }
    }
    return output;
}
export function validatePortraitObjects(map, bundle) {
    if (!portraitUnits.some(unit => new RegExp('FourCC\\s*\\(\\s*["\\\']' + unit.id + '["\\\']\\s*\\)').test(bundle))) return;
    for (const [name, skin] of [['war3map.w3u', false], ['war3mapSkin.w3u', true]]) {
        const bytes = map.read(name);
        assert(installPortraitUnits(bytes, skin).equals(bytes),
            'Story portrait units are missing from ' + name + '; run build with --portrait-objects before publishing');
    }
}
function preparePortraitObjects(map, snapshots) {
    const entries = new Map(), assets = new Map();
    for (const [name, skin] of [['war3map.w3u', false], ['war3mapSkin.w3u', true]]) {
        const bytes = map.read(name), assetPath = path.join(root, 'assets', name), source = fs.readFileSync(assetPath);
        // Both sources must agree on every pre-existing record before synchronization.
        const withoutOwned = value => { const data = parseUnits(value);
            data.tables = data.tables.map(table => table.filter(row => !portraitUnits.some(unit => row.newId === unit.id)));
            return serializeUnits(data); };
        assert.deepEqual(withoutOwned(source), withoutOwned(bytes), 'Asset and test map unit data diverge: ' + name);
        const output = installPortraitUnits(bytes, skin, {migrateLegacyAnya: true, migrateLegacyArmor: true, migrateLegacyUpgrades: true});
        assert.deepEqual(installPortraitUnits(source, skin, {migrateLegacyAnya: true, migrateLegacyArmor: true, migrateLegacyUpgrades: true}), output, 'Portrait asset output must match the map');
        snapshots.set(assetPath, source); entries.set(name, output); assets.set(assetPath, output);
    }
    return {entries, assets};
}
// These are gold/pawning fields only; mana, lumber, combat stats and item behaviour
// unrelated to trading are deliberately outside this migration.
export const goldObjectSpecs = {
    unit: ['ugol', 'ugor', 'ubba', 'ubdi', 'ubsi'],
    item: ['igol', 'ipaw', 'isel'],
    ability: ['Ndt1', 'Ntm1'], // Charge Gold and Lumber / Transmute, when present.
};
export function stripGoldTooltipText(text) {
    return text.replace(/판매가 \d+ 골드 · 일괄 정리는 판매 없이 삭제/g, '가방 정리 시 장비가 삭제됩니다.')
        .replace(/버리기\s*\/\s*판매\s*불가/g, '버리기 불가');
}
export function cleanItemTooltipText(text) {
    const removed = new Set([
        '자동 적용 · 레벨업 선택으로 강화', '레벨업 장신구 · 버리기 불가 · 숫자는 강화 레벨',
        '레벨 업 장신구 · 버리기 불가 · 숫자는 강화 레벨', '레벨 업으로 획득·강화',
        '가방 정리 시 장비가 삭제됩니다.', '자동 공격 스킬을 새로 부여하지 않습니다.',
        '보유 중인 해당 무기에만 적용', '기본 능력치는 각각 적용 · 동일 장비의 세트 개수는 1개',
        '세트 효과의 추가 피해는 세트 효과를 다시 일으키지 않음', '확장 인벤토리에서 장착 시 적용',
        '동일 이름은 1개로 계산 · 세트 추가 공격은 재발동하지 않음',
    ]);
    const segments = text.split(/(?<=\|n)|(?<=\n)/);
    const kept = segments.filter(segment => !removed.has(segment.replace(/\|c[0-9a-f]{8}|\|r/gi, '')
        .replace(/(?:\|n|\r?\n)$/, '').trim()));
    const cleaned = kept.length === segments.length ? text : kept.join('').replace(/(?:\|n|\r?\n)+$/, '');
    // Old native trinkets describe their level-one bonus in a longer template.
    // Retain that numeric value and flavor, using the same compact runtime labels.
    const lines = cleaned.split(/\|n|\r?\n/), step = lines.find(line => /^강화 단계마다 /.test(line));
    let summary;
    if (step) {
        summary = step.replace(/^강화 단계마다 /, '').replace(/ \(최대 \+\d+%\)$/, '')
            .replace(/^피해 증가 /, '모든 무기 피해 ')
            .replace(/^무기 크기 증가 /, '모든 무기 크기 ')
            .replace(/^무기 사정거리 증가 /, '모든 무기 사정거리 ')
            .replace(/^무기 지속 효과 증가 /, '모든 무기 지속시간 ')
            .replace(/^추가 생명력 재생 /, '생명력 재생 ');
    } else {
        const cooldown = cleaned.match(/장신구 단독 쿨다운 감소: Lv\.1 ([\d.]+)%/);
        const multicast = cleaned.match(/Lv\.1: 추가 (\d+)회 · 추가 공격 피해 (\d+)%/);
        if (cooldown) summary = '모든 무기 쿨다운 -' + cooldown[1] + '%';
        else if (multicast) summary = '추가 공격 +' + multicast[1] + '회|n추가 공격 피해 ' + multicast[2] + '%';
    }
    if (!summary) return cleaned;
    const separator = cleaned.includes('|n') ? '|n' : cleaned.includes('\r\n') ? '\r\n' : '\n';
    const flavor = lines.filter(line => /^\|cffaaaaaa.*\|r$/i.test(line));
    return summary.replaceAll('|n', separator) + (flavor.length ? separator + separator + flavor.join(separator) : '');
}
function cleanTrinketTooltipText(text) {
    return cleanItemTooltipText(text).split(/(?<=\|n)|(?<=\n)/)
        .filter(segment => !/^\|cffaaaaaa/i.test(segment.trim())).join('').replace(/(?:\|n|\r?\n)+$/, '');
}
// Clean only our item descriptions, including referenced editor strings. Other
// object fields, mechanics and unrelated authored strings retain their original bytes.
export function cleanItemTooltipEntries(entries, catalog = null) {
    const output = new Map(entries), targets = new Set(), trinketTargets = new Set(), regularTargets = new Set(), otherReferences = new Set();
    const canonicalStrings = new Map();
    const skinItems = parseObjectData(entries.get('war3mapSkin.w3t'), 'item');
    for (const name of ['war3map.w3t', 'war3mapSkin.w3t']) {
        const bytes = entries.get(name), data = parseObjectData(bytes, 'item');
        // The main data must resolve the same text even when a reader skips skins.
        for (const row of data.tables.flat().filter(row => ownedItemPattern.test(row.newId))) {
            const skin = skinItems.tables.flat().find(value => value.newId === row.newId && value.oldId === row.oldId);
            assert(skin, 'Missing owned item skin: ' + row.newId);
            for (const id of ['utub','ides']) {
                const sources = skin.fields.filter(field => field.id === id), fields = row.fields.filter(field => field.id === id);
                assert(sources.length === 1 && sources[0].type === 3 && fields.length <= 1, 'Invalid item description: ' + row.newId + '/' + id);
                if (!fields.length) {
                    delete row.raw;
                    row.fields.push({id,type:3,level:0,column:0,value:sources[0].value,endId:row.newId});
                } else if (fields[0].value !== sources[0].value) {
                    assert.equal(fields[0].type,3);delete row.raw;delete fields[0].raw;fields[0].value=sources[0].value;
                }
            }
        }
        for (const row of data.tables.flat()) for (const field of row.fields) {
            if (field.type !== 3) continue;
            const item = catalog?.get(row.newId);
            const descriptionField = ['utub','ides'].includes(field.id);
            const owned = ownedItemPattern.test(row.newId)
                && (descriptionField || item && ['unam','utip'].includes(field.id));
            const expected = owned && item ? (descriptionField ? item.description : item.name) : undefined;
            const trinket = /^HsT[1-9AB]$/.test(row.newId);
            const reference = field.value.match(/^TRIGSTR_(\d+)$/);
            if (reference) {
                const id = Number(reference[1]);
                (owned ? targets : otherReferences).add(id);
                if (owned) (trinket ? trinketTargets : regularTargets).add(id);
                if(expected!==undefined) {
                    assert(!canonicalStrings.has(id) || canonicalStrings.get(id)===expected,'Conflicting item tooltip reference: '+id);
                    canonicalStrings.set(id,expected);
                }
            }
            else if (owned) {
                const cleaned = expected ?? (trinket ? cleanTrinketTooltipText(field.value) : cleanItemTooltipText(field.value));
                if (cleaned !== field.value) { delete row.raw; delete field.raw; field.value = cleaned; }
            }
        }
        output.set(name, serializeObjectData(data));
    }
    const bytes = entries.get('war3map.wts'), strings = stringTable(bytes);
    const transform = (id, value) => canonicalStrings.get(id)
        ?? (trinketTargets.has(id) ? cleanTrinketTooltipText(value) : cleanItemTooltipText(value));
    for (const id of targets) {
        assert(strings.has(id), 'Missing item tooltip string: ' + id);
        assert(!otherReferences.has(id) || transform(id,strings.get(id)) === strings.get(id),
            'Item tooltip string is shared with unrelated data: ' + id);
        assert(!trinketTargets.has(id) || !regularTargets.has(id), 'Trinket description is shared with gear: ' + id);
    }
    const text = bytes.toString('utf8').replace(/^((?:\uFEFF)?STRING[ \t]+(\d+)[ \t]*\r?\n(?:\/\/[^\r\n]*\r?\n|[ \t]*\r?\n)*\{[ \t]*\r?\n)([\s\S]*?)(\r?\n\})/gm,
        (whole, header, id, value, end) => targets.has(Number(id)) ? header + transform(Number(id),value) + end : whole);
    const cleaned = Buffer.from(text), after = stringTable(cleaned);
    assert.equal(after.size, strings.size, 'Tooltip cleanup changed map string count');
    for (const [id,value] of strings) assert.equal(after.get(id), targets.has(id) ? transform(id,value) : value,
        'Item tooltip string readback differs: ' + id);
    output.set('war3map.wts', cleaned);
    return output;
}
export function prepareItemTooltipCleanup(map, snapshots = new Map(), preparedAssets = new Map()) {
    const names = ['war3map.w3t', 'war3mapSkin.w3t', 'war3map.wts'];
    const catalog = loadItemTooltipCatalog(snapshots);
    const entries = cleanItemTooltipEntries(new Map(names.map(name => [name, map.read(name)])),catalog);
    const sources = new Map(names.map(name => [name, fs.readFileSync(path.join(root, 'assets', name))]));
    const cleanedAssets = cleanItemTooltipEntries(new Map(names.map(name =>
        [name, preparedAssets.get(path.join(root, 'assets', name)) ?? sources.get(name)])),catalog);
    const assets = new Map();
    for (const name of names) {
        const assetPath = path.join(root, 'assets', name), source = sources.get(name);
        if (!name.endsWith('.wts')) assert.deepEqual(entries.get(name), cleanedAssets.get(name), 'Item tooltip assets diverge: ' + name);
        if (snapshots.has(assetPath)) assert.deepEqual(snapshots.get(assetPath), source, 'Item tooltip asset changed during preparation');
        else snapshots.set(assetPath, source);
        assets.set(assetPath, cleanedAssets.get(name));
    }
    return {entries, assets};
}
export function removeGoldObjectData(bytes, kind, {skin = false} = {}) {
    const before = parseObjectData(bytes, kind), data = parseObjectData(bytes, kind);
    assert.deepEqual(serializeObjectData(data), bytes, 'Object reader must round-trip losslessly');
    const fieldKey = field => `${field.id}:${field.level}:${field.column}`;
    for (const rows of data.tables) for (const row of rows) {
        const seen = new Set();
        for (const field of row.fields) {
            assert(!seen.has(fieldKey(field)), 'Duplicate object field: ' + row.newId + ' ' + fieldKey(field));
            seen.add(fieldKey(field));
            if (field.type === 3) {
                const value = stripGoldTooltipText(field.value);
                if (value !== field.value) { delete row.raw; delete field.raw; field.value = value; }
            }
            if (goldObjectSpecs[kind].includes(field.id)) {
                assert(kind === 'ability' ? field.type >= 0 && field.type <= 2 : field.type === 0,
                    'Unexpected gold field type: ' + field.id);
                if (field.value !== 0) { delete row.raw; delete field.raw; field.value = 0; }
            }
        }
        // Base overrides suppress inherited native costs and bounty. Skin files only need
        // to neutralize existing overrides; adding gameplay fields to skins is unnecessary.
        if (!skin && kind !== 'ability') for (const id of goldObjectSpecs[kind]) {
            if (row.fields.some(field => field.id === id)) continue;
            delete row.raw;
            row.fields.push({id, type: 0, level: 0, column: 0, value: 0, endId: row.newId});
        }
        if (!skin && kind === 'ability' && ['ANdt', 'ANtm'].includes(row.oldId)) {
            const id = row.oldId === 'ANdt' ? 'Ndt1' : 'Ntm1';
            const levels = row.fields.find(field => field.id === 'alev')?.value ?? 1;
            assert(Number.isInteger(levels) && levels >= 1 && levels <= 100, 'Invalid gold ability levels');
            for (let level = 1; level <= levels; level++) {
                if (row.fields.some(field => field.id === id && field.level === level && field.column === 1)) continue;
                delete row.raw;
                row.fields.push({id, type: id === 'Ndt1' ? 0 : 1, level, column: 1, value: 0, endId: row.newId});
            }
        }
    }
    const output = serializeObjectData(data), after = parseObjectData(output, kind);
    assert.equal(after.version, before.version, 'Gold migration changed object version');
    for (const [table, rows] of before.tables.entries()) {
        assert.equal(after.tables[table].length, rows.length, 'Gold migration changed object count');
        for (const [index, row] of rows.entries()) {
            const next = after.tables[table][index];
            assert.equal(next.oldId, row.oldId); assert.equal(next.newId, row.newId);
            assert.deepEqual(next.extra, row.extra, 'Gold migration changed v3 record metadata');
            // A changed field count is allowed only for new zero-cost/bounty overrides.
            const header = value => value.raw.subarray(0, value.raw.length - value.fields.reduce((sum, field) => sum + field.raw.length, 0) - 4);
            assert.deepEqual(header(next), header(row), 'Gold migration changed object header');
            for (const [i, field] of row.fields.entries()) {
                const actual = next.fields[i];
                assert.equal(fieldKey(actual), fieldKey(field), 'Gold migration reordered existing fields');
                assert.equal(actual.type, field.type); assert.equal(actual.endId, field.endId);
                const expected = goldObjectSpecs[kind].includes(field.id) ? 0
                    : field.type === 3 ? stripGoldTooltipText(field.value) : field.value;
                if (Object.is(expected, field.value)) assert.deepEqual(actual.raw, field.raw, 'Unrelated object field changed');
                else assert.equal(actual.value, expected, 'Owned gold field readback differs');
            }
            for (const field of next.fields.slice(row.fields.length)) {
                assert(goldObjectSpecs[kind].includes(field.id) && field.value === 0, 'Unexpected added gold migration field');
            }
        }
    }
    return output.equals(bytes) ? bytes : output;
}
export function removeGoldStrings(bytes) {
    const before = stringTable(bytes), text = bytes.toString('utf8'), output = Buffer.from(stripGoldTooltipText(text));
    const after = stringTable(output);
    assert.equal(after.size, before.size, 'Gold migration changed map string count');
    for (const [id, value] of before) {
        assert.equal(after.get(id), stripGoldTooltipText(value), 'Unrelated map string changed: ' + id);
    }
    return output.equals(bytes) ? bytes : output;
}
export function removeGoldMisc(bytes) {
    assert(Buffer.isBuffer(bytes), 'Missing map game constants');
    let section = '', count = 0, hasMisc = false;
    const text = bytes.toString('utf8'), newline = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/(?<=\n)/).map(line => {
        const header = line.match(/^\s*\[([^\]]+)\]/);
        if (header) { section = header[1].toLowerCase(); if (section === 'misc') hasMisc = true; }
        if (section !== 'misc' || !/^\s*PawnItemRate\s*=/i.test(line)) return line;
        count++;
        const rate = line.match(/^(\s*PawnItemRate\s*=\s*)([^;\r\n]*)/i);
        assert(rate && Number.isFinite(Number(rate[2].trim())), 'Invalid PawnItemRate');
        return Number(rate[2].trim()) === 0 ? line : line.replace(rate[1] + rate[2], rate[1] + '0.0');
    });
    assert(hasMisc && count <= 1, 'Missing Misc section or duplicate PawnItemRate');
    const output = Buffer.from(count ? lines.join('') : text.replace(/^(\s*\[Misc\][^\r\n]*)(\r?\n|$)/mi,
        (_, header, end) => header + (end || newline) + 'PawnItemRate=0.0' + newline));
    return output.equals(bytes) ? bytes : output;
}
const goldEntries = [
    ['war3map.w3u', 'unit', false], ['war3mapSkin.w3u', 'unit', true],
    ['war3map.w3t', 'item', false], ['war3mapSkin.w3t', 'item', true],
    ['war3map.w3a', 'ability', false], ['war3mapSkin.w3a', 'ability', true],
];
export function prepareGoldRemoval(map, snapshots = new Map(), preparedAssets = new Map()) {
    const entries = new Map(), assets = new Map();
    for (const [name, kind, skin] of [...goldEntries, ['war3map.wts'], ['war3mapMisc.txt']]) {
        const bytes = map.read(name), assetPath = path.join(root, 'assets', name), source = fs.readFileSync(assetPath);
        const transform = value => kind ? removeGoldObjectData(value, kind, {skin})
            : name.endsWith('.wts') ? removeGoldStrings(value) : removeGoldMisc(value);
        const output = transform(bytes), assetOutput = transform(preparedAssets.get(assetPath) ?? source);
        // WTS snapshots can have different editor strings. Preserve each independently;
        // binary object/game-constant sources must agree outside this owned migration.
        if (!name.endsWith('.wts')) assert.deepEqual(assetOutput, output, 'Asset and test map gold migration diverge: ' + name);
        if (snapshots.has(assetPath)) assert.deepEqual(source, snapshots.get(assetPath), 'Asset changed during preparation');
        else snapshots.set(assetPath, source);
        entries.set(name, output); assets.set(assetPath, assetOutput);
    }
    return {entries, assets};
}
export function validateGoldRemoval(map) {
    for (const [name, kind, skin] of [...goldEntries, ['war3map.wts'], ['war3mapMisc.txt']]) {
        const bytes = map.read(name), output = kind ? removeGoldObjectData(bytes, kind, {skin})
            : name.endsWith('.wts') ? removeGoldStrings(bytes) : removeGoldMisc(bytes);
        assert(output.equals(bytes), 'Gold costs, bounty or sale text remain in ' + name + '; run build with --remove-gold');
    }
}
// The asset owns the cumulative XP curve; patch only that gameplay constant.
// Other constants in an editor map must never be replaced by this operation.
export function installExperienceCurve(bytes, source) {
    const read = value => {
        assert(Buffer.isBuffer(value), 'Missing experience game constants');
        let section = '', levels, curve;
        for (const line of value.toString('utf8').split(/\r?\n/)) {
            const header = line.match(/^\s*\[([^\]]+)\]/);
            if (header) section = header[1].toLowerCase();
            if (section !== 'misc') continue;
            const field = line.match(/^\s*(MaxHeroLevel|NeedHeroXP)\s*=\s*([^;\r\n]*)/i);
            if (!field) continue;
            if (field[1].toLowerCase() === 'maxherolevel') {
                assert(levels === undefined, 'Duplicate MaxHeroLevel'); levels = Number(field[2].trim());
            } else {
                assert(curve === undefined, 'Duplicate NeedHeroXP'); curve = field[2].trim().split(',').map(Number);
            }
        }
        assert(Number.isInteger(levels) && levels >= 2 && levels <= 1000, 'Invalid MaxHeroLevel');
        assert(curve?.length === levels - 1, 'Experience curve must cover every level through MaxHeroLevel');
        assert(curve.every((xp, i) => Number.isSafeInteger(xp) && xp > (curve[i - 1] ?? 0)),
            'Experience thresholds must be positive and strictly increasing integers');
        return {levels, curve};
    };
    const desired = read(source), current = read(bytes);
    assert.equal(current.levels, desired.levels, 'Experience migration must preserve MaxHeroLevel');
    let section = '';
    const output = Buffer.from(bytes.toString('utf8').split(/(?<=\n)/).map(line => {
        const header = line.match(/^\s*\[([^\]]+)\]/);
        if (header) section = header[1].toLowerCase();
        if (section !== 'misc' || !/^\s*NeedHeroXP\s*=/i.test(line)) return line;
        return line.replace(/^(\s*NeedHeroXP\s*=\s*)[^;\r\n]*/i, (_, prefix) => prefix + desired.curve.join(','));
    }).join(''));
    assert.deepEqual(read(output), desired, 'Experience curve readback differs');
    return output.equals(bytes) ? bytes : output;
}
export function terrainInfo(bytes) {
    assert(bytes && bytes.toString('ascii', 0, 4) === 'W3E!', 'Invalid terrain entry');
    const version = bytes.readInt32LE(4);
    assert([11, 12].includes(version), 'Unsupported terrain version');
    let p = 13;
    const palette = () => {
        const n = bytes.readInt32LE(p); p += 4;
        assert(n >= 1 && n <= 16, 'Invalid terrain palette');
        const entries = [];
        for (let i = 0; i < n; i++, p += 4) entries.push(bytes.toString('ascii', p, p + 4));
        return entries;
    };
    const ground = palette(), cliff = palette();
    const width = bytes.readInt32LE(p), height = bytes.readInt32LE(p + 4);
    const x = bytes.readFloatLE(p + 8), y = bytes.readFloatLE(p + 12);
    assert(width > 1 && height > 1 && Number.isFinite(x) && Number.isFinite(y), 'Invalid terrain dimensions');
    assert.equal(bytes.length, p + 16 + width * height * (version === 12 ? 8 : 7), 'Unexpected terrain matrix size');
    return {version, ground, cliff, width, height, x, y};
}
// Read only the offsets needed for merging, leaving every other metadata byte intact.
// W3I layouts: War3Net.Build.Core/Serialization/Binary/Info/{MapInfo,PlayerData}.cs.
export function mapInfo(bytes) {
    assert(bytes, 'Missing map information');
    const version = bytes.readInt32LE(0);
    assert([31, 32, 33, 39].includes(version), 'Unsupported map information version: ' + version);
    let p = 28;
    const skip = n => { assert(p + n <= bytes.length, 'Truncated map information'); p += n; };
    const string = () => {
        const end = bytes.indexOf(0, p); assert(end >= p, 'Unterminated map information string');
        const value = bytes.toString('utf8', p, end); p = end + 1; return value;
    };
    const name = string(), author = string(), description = string(), recommendedPlayers = string();
    const cameraOffset = p; skip(48);
    const width = bytes.readInt32LE(p), height = bytes.readInt32LE(p + 4); skip(8);
    const flagsOffset = p, flags = bytes.readUInt32LE(p); skip(9); // flags, tileset, loading-screen background
    if (version === 39) skip(4); // race HUD
    for (let i = 0; i < 4; i++) string(); // loading path/text/title/subtitle
    skip(4); // game data set
    for (let i = 0; i < 4; i++) string(); // prologue path/text/title/subtitle
    skip(20); // fog style/heights/density/color
    if (version === 39) skip(24); // Reforged fog parameters
    skip(4); string(); skip(5); // weather, sound, light tileset, water tint
    const scriptOffset = p; skip(12); // Lua flag, graphics modes, game data version
    if (version >= 32) skip(8);
    if (version >= 33) skip(4);
    if (version === 39) skip(40); // HD water and alpha-tile parameters
    const n = bytes.readInt32LE(p); skip(4);
    assert(n > 0 && n <= 24, 'Invalid player count');
    const players = [];
    for (let i = 0; i < n; i++) {
        const offset = p;
        skip(12);
        const id = bytes.readInt32LE(offset), controller = bytes.readInt32LE(offset + 4);
        const raceOffset = offset + 8, race = bytes.readInt32LE(raceOffset);
        const raceHudOffset = version === 39 ? p : null;
        if (raceHudOffset !== null) skip(4);
        const raceHud = raceHudOffset === null ? null : bytes.readInt32LE(raceHudOffset);
        const flagsOffset = p; skip(4);
        const playerFlags = bytes.readInt32LE(flagsOffset);
        const playerName = string(), startOffset = p; skip(24);
        players.push({offset, id, controller, race, raceOffset, raceHud, raceHudOffset,
            flags: playerFlags, flagsOffset, name: playerName, startOffset,
            x: bytes.readFloatLE(startOffset), y: bytes.readFloatLE(startOffset + 4)});
    }
    return {version, name, author, description, recommendedPlayers, cameraOffset, width, height,
        flagsOffset, flags, scriptOffset, players};
}
function stripBundle(script) {
    const first = script.indexOf(firstMarker);
    if (first < 0) return script;
    const last = script.indexOf(lastMarker);
    assert(last > first && script.indexOf(firstMarker, first + 1) < 0
        && script.indexOf(lastMarker, last + 1) < 0, 'Invalid base bundle markers');
    return script.slice(0, first) + script.slice(last + lastMarker.length);
}
function refreshScript(script, bundle) {
    let native = stripBundle(script);
    for (const [name, value] of [['SetPlayerRacePreference', 'RACE_PREF_UNDEAD'],
        ['SetPlayerRaceSkin', 'RACE_PREF_UNDEAD'], ['SetPlayerRaceSelectable', 'false']]) {
        const expression = new RegExp(name + '\\s*\\(\\s*Player\\(\\s*0\\s*\\)\\s*,\\s*(?:RACE_PREF_[A-Z_]+|true|false)\\s*\\)', 'g');
        const matches = [...native.matchAll(expression)];
        assert.equal(matches.length, 1, 'Expected one base player setting: ' + name);
        native = native.replace(expression, name + '(Player(0), ' + value + ')');
    }
    const result = bundle.trimEnd() + '\n\n' + native;
    luaparse.parse(result, {luaVersion: '5.3'});
    assert(/function\s+main\s*\(/.test(native) && /function\s+config\s*\(/.test(native), 'Base needs native main/config');
    return result;
}
export function editorBundle(bytes, bundle) {
    assert(bytes && bytes.readUInt32LE(0) === 0x80000004 && bytes.readUInt32LE(4) === 1,
        'Unsupported editor custom-script layout');
    const end = bytes.indexOf(0, 8); assert(end >= 8, 'Unterminated editor comment');
    const start = end + 5, length = bytes.readUInt32LE(end + 1);
    assert(length >= 1 && start + length <= bytes.length && bytes[start + length - 1] === 0, 'Invalid editor script length');
    const original = bytes.toString('utf8', start, start + length - 1);
    const updated = original.includes(firstMarker) ? replaceBundle(original, bundle)
        : bundle.trimEnd() + '\n\n' + original;
    const script = Buffer.from(updated + '\0');
    luaparse.parse(script.toString('utf8', 0, script.length - 1), {luaVersion: '5.3'});
    const prefix = Buffer.from(bytes.subarray(0, start)); prefix.writeUInt32LE(script.length, end + 1);
    return Buffer.concat([prefix, script, bytes.subarray(start + length)]);
}
function stringTable(bytes) {
    assert(bytes, 'Missing map string table');
    const entries = new Map(), text = bytes.toString('utf8').replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
    for (const match of text.matchAll(/^STRING[ \t]+(\d+)[ \t]*\n(?:\/\/[^\n]*\n|[ \t]*\n)*\{[ \t]*\n([\s\S]*?)\n\}/gm)) {
        const id = Number(match[1]); assert(!entries.has(id), 'Duplicate map string: ' + id);
        entries.set(id, match[2]);
    }
    assert(entries.size > 0, 'Invalid map string table');
    return entries;
}
export function refreshBase(before, base, bundle) {
    const test = openMap(before), source = openMap(base), changes = new Map();
    assert(test.read('war3map.lua')?.toString('utf8').includes(firstMarker), 'Input must be a HeroSurvivor test map');
    const terrain = terrainInfo(source.read('war3map.w3e')), oldTerrain = terrainInfo(test.read('war3map.w3e'));
    for (const kind of ['ground', 'cliff']) for (const tile of oldTerrain[kind]) {
        assert(terrain[kind].includes(tile), 'Base terrain palette lost ' + tile + '; refusing a destructive refresh');
    }
    const baseInfo = source.read('war3map.w3i'), info = mapInfo(baseInfo), oldInfo = mapInfo(test.read('war3map.w3i'));
    assert.equal(info.players.length, 1, 'HeroSurvivor requires one base player');
    assert.equal(info.players[0].id, 0); assert.equal(info.players[0].controller, 1, 'Base player must be human-controlled');
    assert.equal(oldInfo.players.length, 1); assert.equal(oldInfo.players[0].race, 3, 'Input test player must be undead');
    assert.equal(baseInfo.readInt32LE(info.scriptOffset), 1, 'Base map must use Lua');
    assert(info.width > 0 && info.width <= terrain.width - 1 && info.height > 0 && info.height <= terrain.height - 1,
        'Playable size is inconsistent with terrain');
    const mergedInfo = Buffer.from(baseInfo);
    // Preserve fixed player/custom-force/object rules. Geometry, atmosphere and camera flags follow the base.
    const gameplayFlags = 0x20 | 0x40 | 0x80 | 0x100 | 0x200 | 0x4000 | 0x8000 | 0x40000;
    mergedInfo.writeUInt32LE(((info.flags & ~gameplayFlags) | (oldInfo.flags & gameplayFlags)) >>> 0, info.flagsOffset);
    mergedInfo.writeInt32LE(3, info.players[0].raceOffset);
    // The selectable-race bit is a gameplay property; keep every other base player flag.
    mergedInfo.writeInt32LE((info.players[0].flags & ~2) | (oldInfo.players[0].flags & 2), info.players[0].flagsOffset);
    changes.set('war3map.w3i', mergedInfo);
    for (const name of ['war3map.w3e', 'war3map.wpm', 'war3map.shd', 'war3map.mmp', 'war3map.doo',
        'war3mapUnits.doo', 'war3mapMap.blp', 'war3mapPreview.tga', 'war3map.w3c', 'war3map.w3r',
        'war3map.w3grp', 'war3map.w3l', 'war3map.wts', 'war3map.wtg']) {
        const entry = source.read(name);
        assert(entry || !test.read(name), 'Base is missing an existing geography/editor entry: ' + name);
        if (entry) changes.set(name, entry);
    }
    const baseStringBytes = source.read('war3map.wts');
    const baseStrings = stringTable(baseStringBytes), testStrings = stringTable(test.read('war3map.wts'));
    const retainedStrings = new Map();
    const trinketStrings = new Set();
    for (const name of ['war3map.w3t','war3mapSkin.w3t']) {
        for (const row of parseObjectData(test.read(name),'item').tables.flat().filter(row => /^HsT[1-9AB]$/.test(row.newId))) {
            for (const field of row.fields.filter(field => ['utub','ides'].includes(field.id))) {
                const match = field.value.match(/^TRIGSTR_(\d+)$/);
                if (match) trinketStrings.add(Number(match[1]));
            }
        }
    }
    for (const name of ['war3map.w3a', 'war3map.w3t', 'war3map.w3u', 'war3mapSkin.w3a',
        'war3mapSkin.w3t', 'war3mapSkin.w3u']) {
        for (const match of (test.read(name)?.toString('utf8') ?? '').matchAll(/TRIGSTR_(\d+)/g)) {
            const id = Number(match[1]);
            assert(testStrings.has(id), 'Preserved gameplay object references a missing string: ' + name + ' TRIGSTR_' + id);
            if (!baseStrings.has(id)) {
                // The editor can remove strings when a stock override is reset.
                // Retain values still used by preserved test objects without
                // restoring that override in the edited source map.
                retainedStrings.set(id, testStrings.get(id));
                continue;
            }
            // Removed sale/help sentences are owned gameplay changes. Geography refresh
            // copies the original WTS; the build cleans item tooltips before publication.
            const clean = trinketStrings.has(id) ? cleanTrinketTooltipText : cleanItemTooltipText;
            assert(clean(stripGoldTooltipText(baseStrings.get(id))) === clean(stripGoldTooltipText(testStrings.get(id))),
                'Base map string conflicts with preserved gameplay data: ' + name + ' TRIGSTR_' + id);
        }
    }
    if (retainedStrings.size) {
        const newline = baseStringBytes.includes(Buffer.from('\r\n')) ? '\r\n' : '\n';
        const additions = [...retainedStrings].sort(([a], [b]) => a - b)
            .map(([id, value]) => `STRING ${id}${newline}{${newline}${value.replaceAll('\n', newline)}${newline}}${newline}`)
            .join(newline);
        const merged = Buffer.concat([baseStringBytes, Buffer.from(newline + additions)]);
        const verified = stringTable(merged);
        assert.equal(verified.size, baseStrings.size + retainedStrings.size, 'Retained strings must not replace base entries');
        for (const [id, value] of [...baseStrings, ...retainedStrings]) assert.equal(verified.get(id), value);
        changes.set('war3map.wts', merged);
    }
    const pathing = changes.get('war3map.wpm');
    assert(pathing && pathing.toString('ascii', 0, 4) === 'MP3W', 'Missing or invalid base pathing');
    const pathWidth = (terrain.width - 1) * 4, pathHeight = (terrain.height - 1) * 4;
    assert.equal(pathing.readInt32LE(8), pathWidth); assert.equal(pathing.readInt32LE(12), pathHeight);
    assert.equal(pathing.length, 16 + pathWidth * pathHeight, 'Unexpected base pathing length');
    assert.equal(changes.get('war3map.shd')?.length, pathWidth * pathHeight, 'Unexpected base shadow length');
    const nativeScript = source.read('war3map.lua'); assert(nativeScript, 'Base has no Lua script');
    changes.set('war3map.lua', Buffer.from(refreshScript(nativeScript.toString('utf8'), bundle)));
    changes.set('war3map.wct', editorBundle(source.read('war3map.wct'), bundle));
    const patched = test.replace(changes), preserved = verifyPreserved(before, patched, [...changes.keys()]);
    const result = openMap(patched);
    for (const [name, value] of changes) assert.deepEqual(result.read(name), value, 'Refresh readback mismatch: ' + name);
    return {patched, preserved, entries: [...changes.keys()], terrain,
        playable: {width: info.width, height: info.height}, script: changes.get('war3map.lua').toString('utf8')};
}
// Prepare every payload before touching its destination. On a caught publication
// failure, restore only files that still contain our bytes, preserving concurrent edits.
// The injectable filesystem lets failure paths run in memory in build/check.mjs.
export function publishTransaction(entries, {io = fs, stamp = new Date().toISOString().replaceAll(':', '-'),
    guard = () => {}, finalize = () => []} = {}) {
    const prepared = [], committed = [], destinations = new Set(), paths = new Map();
    const current = file => io.existsSync(file) ? io.readFileSync(file) : null;
    const matches = (a, b) => a === null ? b === null : Buffer.isBuffer(b) && a.equals(b);
    function prepare(entry) {
        assert(Buffer.isBuffer(entry.bytes), 'Publication payload must be a Buffer');
        const key = path.resolve(entry.path).toLowerCase();
        assert(!destinations.has(key), 'Duplicate publication destination: ' + entry.path);
        destinations.add(key);
        const record = {...entry, before: entry.before ?? null, actual: entry.path,
            temporary: entry.path + '.' + stamp + '.tmp', ownsTemporary: false};
        assert(matches(record.before, current(record.path)), 'Destination changed before preparation: ' + record.path);
        io.mkdirSync(path.dirname(record.path), {recursive: true});
        assert(!io.existsSync(record.temporary), 'Publication temporary file already exists: ' + record.temporary);
        prepared.push(record);
        record.ownsTemporary = true;
        try { io.writeFileSync(record.temporary, record.bytes, {flag: 'wx'}); }
        catch (error) { if (error.code === 'EEXIST') record.ownsTemporary = false; throw error; }
        assert.deepEqual(io.readFileSync(record.temporary), record.bytes, 'Prepared payload readback differs');
        return record;
    }
    function publish(record) {
        assert(matches(record.before, current(record.path)), 'Destination changed during publication: ' + record.path);
        try { io.renameSync(record.temporary, record.actual); }
        catch (error) {
            if (!record.alternate || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
            assert(!io.existsSync(record.alternate), 'Alternate output already exists: ' + record.alternate);
            io.renameSync(record.temporary, record.alternate);
            record.actual = record.alternate;
            record.before = null;
        }
        record.ownsTemporary = false;
        committed.push(record);
        paths.set(record.path, record.actual);
        assert.deepEqual(io.readFileSync(record.actual), record.bytes, 'Published payload readback differs');
    }
    const failures = [];
    try {
        const files = entries.map(prepare);
        guard();
        for (const record of files) publish(record);
        // A manifest can include the actual alternate map path chosen for a locked output.
        const finalFiles = finalize(paths).map(prepare);
        for (const record of finalFiles) publish(record);
    } catch (failure) {
        failures.push(failure);
        for (const record of committed.reverse()) {
            const temporary = record.actual + '.' + stamp + '.rollback';
            let ownsRollback = false;
            try {
                assert(matches(record.bytes, current(record.actual)),
                    'Concurrent edit preserved; cannot roll back: ' + record.actual);
                if (record.before === null) io.unlinkSync(record.actual);
                else {
                    assert(!io.existsSync(temporary), 'Rollback temporary file already exists');
                    ownsRollback = true;
                    try { io.writeFileSync(temporary, record.before, {flag: 'wx'}); }
                    catch (error) { if (error.code === 'EEXIST') ownsRollback = false; throw error; }
                    assert.deepEqual(io.readFileSync(temporary), record.before, 'Rollback payload readback differs');
                    assert(matches(record.bytes, current(record.actual)),
                        'Concurrent edit preserved; cannot roll back: ' + record.actual);
                    io.renameSync(temporary, record.actual);
                    ownsRollback = false;
                    assert.deepEqual(io.readFileSync(record.actual), record.before, 'Rollback readback differs');
                }
            } catch (error) { failures.push(error); }
            finally {
                try { if (ownsRollback && io.existsSync(temporary)) io.unlinkSync(temporary); }
                catch (error) { failures.push(error); }
            }
        }
    } finally {
        for (const record of prepared) {
            try { if (record.ownsTemporary && io.existsSync(record.temporary)) io.unlinkSync(record.temporary); }
            catch (error) { failures.push(error); }
        }
    }
    if (failures.length > 1) throw new AggregateError(failures,
        'Publication failed; some files need recovery from the backup or temporary cleanup: ' + failures.map(error => error.message).join('; '));
    if (failures.length === 1) throw failures[0];
    return paths;
}

function main() {
    const args = process.argv.slice(2);
    let check = false, refresh = false, portraits = false, removeGold = false, experience = false, basePath = baseMapPath;
    let input = path.join(root, 'dist/AnyasLongNight-playtest.w3x'), output = input;
    let profile = 'playtest', outputExplicit = false, inputExplicit = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--check') check = true;
        else if (args[i] === '--refresh-base') refresh = true;
        else if (args[i] === '--portrait-objects') portraits = true;
        else if (args[i] === '--compact') {} // Accepted for older commands; output is always compacted.
        else if (args[i] === '--remove-gold') removeGold = true;
        else if (args[i] === '--experience-curve') experience = true;
        else if (args[i] === '--release') profile = 'release';
        else if (args[i] === '--profile') {
            profile = args[++i];
            assert(['development', 'playtest', 'release'].includes(profile), 'Invalid build profile');
        }
        else if (args[i] === '--input' || args[i] === '--output' || args[i] === '--base') {
            const option = args[i], value = args[++i];
            assert(value && !value.startsWith('--'), 'Missing path for ' + option);
            if (option === '--input') { input = path.resolve(value); inputExplicit = true; }
            else if (option === '--base') basePath = path.resolve(value);
            else { output = path.resolve(value); outputExplicit = true; }
        } else throw new Error('Unknown option: ' + args[i]);
    }
    if (!outputExplicit && profile !== 'playtest') output = profile === 'release'
        ? path.join(root, 'dist', 'submission', 'AnyasLongNight.w3x')
        : path.join(root, 'dist', 'AnyasLongNight-' + profile + '.w3x');
    if (check && !inputExplicit) input = output;
    const bundlePath = path.join(root, 'dist', profile === 'playtest' ? 'AnyasLongNight.lua' : 'AnyasLongNight-' + profile + '.lua');
    const relative = path.relative(path.join(root, 'dist'), output);
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && output.endsWith('.w3x'), 'Output must be a .w3x inside dist');
    if (refresh) assert.notEqual(output.toLowerCase(), basePath.toLowerCase(), 'Output must never overwrite the base map');
    const {bundle, snapshots, count} = collectSources({profile});
    const original = fs.readFileSync(input), map = openMap(original);
    const outputBefore = !check && fs.existsSync(output) ? fs.readFileSync(output) : null;
    const oldScript = map.read('war3map.lua');
    assert(oldScript, 'Input has no Lua map script');
    const base = refresh ? fs.readFileSync(basePath) : null;
    const refreshed = refresh ? refreshBase(original, base, bundle) : null;
    const script = refreshed?.script ?? replaceBundle(oldScript.toString('utf8'), bundle);
    let patched = refreshed?.patched ?? map.replace(new Map([
        ['war3map.lua', Buffer.from(script)], ['war3map.wct', editorBundle(map.read('war3map.wct'), bundle)],
    ]));
    const portraitObjects = portraits ? preparePortraitObjects(openMap(patched), snapshots) : null;
    if (portraitObjects) patched = openMap(patched).replace(portraitObjects.entries);
    const experienceAsset = path.join(root, 'assets/war3mapMisc.txt');
    const experienceSource = fs.readFileSync(experienceAsset);
    snapshots.set(experienceAsset, experienceSource);
    const constants = openMap(patched).read('war3mapMisc.txt');
    const experienceConstants = installExperienceCurve(constants, experienceSource);
    if (experience) patched = openMap(patched).replace(new Map([['war3mapMisc.txt', experienceConstants]]));
    else assert.deepEqual(constants, experienceConstants,
        'Map experience curve differs from assets; run build with --experience-curve');
    const goldRemoval = removeGold ? prepareGoldRemoval(openMap(patched), snapshots, portraitObjects?.assets) : null;
    if (goldRemoval) patched = openMap(patched).replace(goldRemoval.entries);
    const growth = prepareGrowthObjects(openMap(patched), snapshots, goldRemoval?.assets);
    patched = openMap(patched).replace(growth.entries);
    const grownAssets = new Map([...(goldRemoval?.assets ?? []), ...growth.assets]);
    const itemTooltips = prepareItemTooltipCleanup(openMap(patched), snapshots, grownAssets);
    patched = openMap(patched).replace(itemTooltips.entries);
    const uiResources = prepareUIResources(openMap(patched), snapshots);
    patched = openMap(patched).replace(uiResources);
    const interfaceTooltip = prepareInterfaceTooltip(openMap(patched),snapshots,grownAssets);
    patched = openMap(patched).replace(interfaceTooltip.entries);
    const statDetails = prepareStatDetails(openMap(patched), snapshots, interfaceTooltip.assets);
    patched = openMap(patched).replace(statDetails.entries);
    const regeneration = prepareHeroRegeneration(openMap(patched), snapshots, goldRemoval?.assets ?? portraitObjects?.assets);
    patched = openMap(patched).replace(regeneration.entries);
    const talents = prepareNativeTalents(openMap(patched), snapshots, statDetails.assets);
    patched = openMap(patched).replace(talents.entries);
    const weaponTooltips = prepareWeaponTooltips(openMap(patched),snapshots,new Map([...itemTooltips.assets,...talents.assets]));
    patched = openMap(patched).replace(weaponTooltips.entries);
    const companionAssets = new Map([...(portraitObjects?.assets ?? []), ...(goldRemoval?.assets ?? []), ...growth.assets,
        ...itemTooltips.assets, ...interfaceTooltip.assets, ...statDetails.assets, ...regeneration.assets, ...talents.assets, ...weaponTooltips.assets]);
    // replace() already compacts its own output; this also drops orphaned data an unchanged input carried in.
    const compactStats = {beforeBytes: patched.length};
    patched = openMap(patched).compact();
    compactStats.afterBytes = patched.length;
    compactStats.removedBytes = compactStats.beforeBytes - patched.length;
    const preparedMap = openMap(patched);
    validatePortraitObjects(preparedMap, bundle);
    validateGoldRemoval(preparedMap);
    const changedEntries = [...new Set([...(refreshed?.entries ?? ['war3map.lua', 'war3map.wct']),
        ...(portraitObjects?.entries.keys() ?? []), ...(goldRemoval?.entries.keys() ?? []), ...growth.entries.keys(),
        ...itemTooltips.entries.keys(), ...uiResources.keys(), ...interfaceTooltip.entries.keys(), ...statDetails.entries.keys(), ...regeneration.entries.keys(), ...talents.entries.keys(), ...weaponTooltips.entries.keys(),
        ...(map.read('(listfile)').equals(preparedMap.read('(listfile)')) ? [] : ['(listfile)']),
        ...(experience ? ['war3mapMisc.txt'] : [])])];
    const preserved = verifyPreserved(original, patched, changedEntries);
    assert.equal(preparedMap.read('war3map.lua').toString('utf8'), script);
    console.log(`Validated ${count} Lua sources; preserved ${preserved} unrelated map entries.`);
    if (compactStats.removedBytes) console.log('Archive compaction:', JSON.stringify(compactStats));
    if (refreshed) console.log('Refreshed base geography:', JSON.stringify({
        cells: [refreshed.terrain.width - 1, refreshed.terrain.height - 1],
        playable: refreshed.playable, origin: [refreshed.terrain.x, refreshed.terrain.y],
        entries: refreshed.entries}));
    const guardInputs = () => {
        for (const [name, bytes] of snapshots) assert.deepEqual(fs.readFileSync(name), bytes, 'Source changed during build: ' + name);
        assert.deepEqual(fs.readFileSync(input), original, 'Input map changed during build');
        if (base) assert.deepEqual(fs.readFileSync(basePath), base, 'Base map changed during build');
    };
    if (check) {
        guardInputs();
        const matches = changedEntries.every(name => map.read(name)?.equals(preparedMap.read(name)))
            && [...companionAssets].every(([name, bytes]) => fs.readFileSync(name).equals(bytes))
            && original.equals(patched);
        const unused = map.unusedBytes();
        if (unused) console.log('Unused archive bytes (rebuild to compact):', unused);
        console.log('Current test map matches source:', matches);
        if (!matches) process.exitCode = 1;
        return;
    }
    const guardPublication = () => {
        guardInputs();
        assert.deepEqual(fs.existsSync(output) ? fs.readFileSync(output) : null, outputBefore, 'Output map changed during build');
    };
    if (outputBefore?.equals(patched)
        && [...companionAssets].every(([name, bytes]) => fs.readFileSync(name).equals(bytes))) {
        const before = fs.existsSync(bundlePath) ? fs.readFileSync(bundlePath) : null;
        const bytes = Buffer.from(bundle);
        if (!before?.equals(bytes)) publishTransaction([{path: bundlePath, bytes, before}], {guard: guardPublication});
        else guardPublication();
        console.log('Test map already current; archive left unchanged:', output);
        return;
    }
    const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const backup = path.join(root, 'dist/backups', stamp + '-build');
    fs.mkdirSync(backup, {recursive: true});
    fs.writeFileSync(path.join(backup, 'input.w3x'), original, {flag: 'wx'});
    if (base) fs.writeFileSync(path.join(backup, 'base.w3x'), base, {flag: 'wx'});
    if (outputBefore && output !== input) fs.writeFileSync(path.join(backup, 'output-before.w3x'), outputBefore, {flag: 'wx'});
    if (fs.existsSync(bundlePath)) fs.copyFileSync(bundlePath, path.join(backup, path.basename(bundlePath)));
    for (const [assetPath] of companionAssets) fs.copyFileSync(assetPath, path.join(backup, path.basename(assetPath)));
    const files = [...companionAssets].map(([assetPath, bytes]) =>
        ({path: assetPath, bytes, before: snapshots.get(assetPath)}));
    files.push({path: bundlePath, bytes: Buffer.from(bundle), before: fs.existsSync(bundlePath) ? fs.readFileSync(bundlePath) : null});
    // Publish the map last, after all companion files have been prepared and verified.
    files.push({path: output, bytes: patched, before: outputBefore,
        alternate: output.replace(/\.w3x$/, '-' + stamp + '.w3x')});
    const published = publishTransaction(files.filter(file => !file.before?.equals(file.bytes)), {stamp,
        guard: guardPublication,
        finalize(paths) {
            const actual = paths.get(output) ?? output;
            return [{path: path.join(backup, 'manifest.json'), before: null,
                bytes: Buffer.from(JSON.stringify({input, output: actual, profile,
                    inputSha256: digest(original), outputSha256: digest(patched), bundleSha256: digest(bundle),
                    ...(base ? {base: basePath, baseSha256: digest(base), refreshedEntries: refreshed.entries} : {}),
                    ...(portraitObjects ? {portraitObjects: [...portraitObjects.entries.keys()]} : {}),
                    ...(goldRemoval ? {goldRemoval: [...goldRemoval.entries.keys()]} : {}),
                    ...(experience ? {experienceCurve: 'war3mapMisc.txt'} : {}),
                    ...(compactStats.removedBytes ? {compaction: compactStats} : {}),
                    sources: Object.fromEntries([...snapshots].map(([p, b]) => [path.relative(root, p), digest(b)]))}, null, 2) + '\n')}];
        }});
    const actual = published.get(output) ?? output;
    if (actual !== output) console.log('Requested output is locked; saved alternate test map.');
    console.log('Test map:', actual);
    console.log('Backup:', backup);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
