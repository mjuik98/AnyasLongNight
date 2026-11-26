// Tool-managed game objects: supply items/units, enemy combat fields, stat details, native talents,
// growth objects, hero regeneration, Putress and the portrait units.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {goldObjectSpecs, parseObjectData, parseUnits, serializeObjectData, serializeUnits} from './object-data.mjs';
import {root} from './project.mjs';
import {growthLevels, loadItemTooltipCatalog, loadTalentCatalog, weaponObjectCount} from './catalog.mjs';

export const bonusUnits = [
    // Old hsBR/hsBX definitions in existing maps stay intact; only hsBC is spawned.
    {id: 'hsBC', name: '낡은 보급 상자', model: 'Doodads\\LordaeronSummer\\Terrain\\Crates\\Crates0.mdl',
        legacyModel: 'Objects\\InventoryItems\\TreasureChest\\treasurechest.mdl',
        icon: 'ReplaceableTextures\\CommandButtons\\BTNChestOfGold.blp'},
];
export const bonusItems = [
    {id: 'hsHR', base: 'rhe1', name: '회복의 룬', icon: 'ReplaceableTextures\\CommandButtons\\BTNRune.blp',
        description: '접근하거나 습득하면 최대 생명력의 20%를 회복합니다.'},
    {id: 'hsEX', base: 'texp', name: '경험치의 서', icon: 'ReplaceableTextures\\CommandButtons\\BTNTomeBrown.blp',
        description: '접근하거나 습득하면 경험치 250을 얻습니다. 스테이지에 따라 증가합니다.'},
    {id: 'hsPU', base: 'rdis', name: '소멸의 룬', icon: 'ReplaceableTextures\\CommandButtons\\BTNDeathAndDecay.blp',
        description: '영웅 주변 700 범위의 일반·정예 적을 처치합니다. 보스는 최대 생명력의 10%만큼 감소하며 이 효과로 처치되지 않습니다.'},
    {id: 'hsTS', base: 'rspd', name: '정지의 룬', icon: 'ReplaceableTextures\\CommandButtons\\BTNStasisTrap.blp',
        legacyDescription: '8초 동안 적과 적 투사체·장판을 멈춥니다. 영웅은 계속 이동·공격할 수 있습니다. 보스의 동작은 1초 동안 멈춥니다.',
        description: '8초 동안 보스를 포함한 모든 적과 적 투사체·장판을 멈춥니다. 정지된 적은 어둡게 표시됩니다. 영웅은 계속 이동·공격할 수 있습니다.'},
];
export function installBonusItems(bytes, skin = false) {
    const data = parseObjectData(bytes, 'item');
    const migrated = new Set();
    assert.deepEqual(serializeObjectData(data), bytes, 'Item reader must round-trip losslessly');
    for (const item of bonusItems) {
        const text = [['unam', 3, item.name], ['utip', 3, item.name], ['utub', 3, item.description],
            ['ides', 3, item.description], ['iico', 3, item.icon]];
        // Native abilities are empty: all healing/XP comes from the collection callback.
        // Powerups auto-use on acquisition, so manual collection needs no free bag slot.
        const values = skin ? text : [...text, ['iabi', 3, ''], ['icla', 3, 'PowerUp'], ['ipow', 0, 1],
            ['iper', 0, 1], ['iuse', 0, 1], ['iusa', 0, 0], ['iprn', 0, 0], ...goldObjectSpecs.item.map(id => [id, 0, 0])];
        const rows = data.tables.flat().filter(row => (row.newId === '\0\0\0\0' ? row.oldId : row.newId) === item.id);
        assert(rows.length <= 1, 'Duplicate bonus item ID: ' + item.id);
        if (rows.length) {
            const row = rows[0];
            assert(row.oldId === item.base && row.newId === item.id, 'Bonus item ID collides with another item: ' + item.id);
            for (const [id, type, value] of values) {
                const fields = row.fields.filter(field => field.id === id);
                if (item.legacyDescription && ['utub', 'ides'].includes(id) && fields.length === 1
                    && fields[0].type === type && fields[0].value === item.legacyDescription) {
                    delete row.raw; delete fields[0].raw; fields[0].value = value;
                    migrated.add(item.id);
                }
                assert(fields.length === 1 && fields[0].type === type && fields[0].value === value,
                    'Bonus item field conflicts: ' + item.id + ' ' + id);
            }
        } else data.tables[1].push({oldId: item.base, newId: item.id, extra: data.version === 3 ? [0] : [],
            fields: values.map(([id, type, value]) => ({id, type, value, endId: item.id}))});
    }
    const output = serializeObjectData(data), verified = parseObjectData(output, 'item');
    for (const [i, rows] of parseObjectData(bytes, 'item').tables.entries()) for (const row of rows) {
        const after = verified.tables[i].find(next => next.oldId === row.oldId && next.newId === row.newId);
        if (!migrated.has(row.newId)) assert.deepEqual(after.raw, row.raw, 'Bonus installation changed an existing item');
        else {
            assert.equal(after.fields.length, row.fields.length, 'Bonus description migration changed field count');
            for (const [index, field] of row.fields.entries()) {
                const next = after.fields[index];
                if (['utub', 'ides'].includes(field.id) && field.value === bonusItems.find(item => item.id === row.newId).legacyDescription) {
                    assert.equal(next.id, field.id); assert.equal(next.type, field.type); assert.equal(next.endId, field.endId);
                    assert.equal(next.value, bonusItems.find(item => item.id === row.newId).description);
                } else assert.deepEqual(next.raw, field.raw, 'Bonus description migration changed an unrelated field');
            }
        }
    }
    return output;
}
export function prepareBonusItems(map, snapshots = new Map(), preparedAssets = new Map()) {
    const entries = new Map(), assets = new Map();
    for (const [name, skin] of [['war3map.w3t', false], ['war3mapSkin.w3t', true]]) {
        const asset = path.join(root, 'assets', name), source = fs.readFileSync(asset);
        const output = installBonusItems(map.read(name), skin);
        assert.deepEqual(installBonusItems(preparedAssets.get(asset) ?? source, skin), output,
            'Asset and test map bonus items diverge: ' + name);
        if (snapshots.has(asset)) assert.deepEqual(snapshots.get(asset), source, 'Asset changed during preparation');
        else snapshots.set(asset, source);
        entries.set(name, output); assets.set(asset, output);
    }
    return {entries, assets};
}
export function installBonusUnits(bytes, skin = false) {
    const data = parseUnits(bytes);
    const migrated = new Set();
    assert.deepEqual(serializeUnits(data), bytes, 'Unit reader must round-trip losslessly');
    for (const unit of bonusUnits) {
        const values = skin
            ? [['umdl', 3, unit.model], ['unam', 3, unit.name], ['uico', 3, unit.icon], ['usnd', 3, ''], ['ushu', 3, '']]
            : [['uabi', 3, ''], ['uaen', 0, 0], ['umvs', 0, 0], ['umvt', 3, ''], ['ucol', 2, 0],
                ['ufoo', 0, 0], ['uhom', 0, 1], ['uhpm', 0, 2], ['uhpr', 1, 0], ['uhrt', 3, 'none'],
                ['udef', 0, 0], ['upgr', 3, ''], ...goldObjectSpecs.unit.map(id => [id, 0, 0])];
        const rows = data.tables.flat().filter(row => (row.newId === '\0\0\0\0' ? row.oldId : row.newId) === unit.id);
        assert(rows.length <= 1, 'Duplicate bonus prop ID: ' + unit.id);
        if (rows.length) {
            const row = rows[0];
            assert(row.oldId === 'hfoo' && row.newId === unit.id, 'Bonus prop ID collides with another unit: ' + unit.id);
            for (const [id, type, value] of values) {
                const fields = row.fields.filter(field => field.id === id);
                if (id === 'umdl' && fields.length === 1 && fields[0].type === type && fields[0].value === unit.legacyModel) {
                    delete row.raw; delete fields[0].raw; fields[0].value = value; migrated.add(unit.id);
                }
                assert(fields.length === 1 && fields[0].type === type && fields[0].value === value,
                    'Bonus prop field conflicts: ' + unit.id + ' ' + id);
            }
        } else data.tables[1].push({oldId: 'hfoo', newId: unit.id, extra: data.version === 3 ? [0] : [],
            fields: values.map(([id, type, value]) => ({id, type, value, endId: unit.id}))});
    }
    const output = serializeUnits(data), verified = parseUnits(output);
    for (const [i, rows] of parseUnits(bytes).tables.entries()) for (const row of rows) {
        const after = verified.tables[i].find(next => next.oldId === row.oldId && next.newId === row.newId);
        if (!migrated.has(row.newId)) assert.deepEqual(after.raw, row.raw, 'Bonus installation changed an existing unit');
        else {
            assert.equal(after.fields.length, row.fields.length);
            for (const [index, field] of row.fields.entries()) {
                const next = after.fields[index];
                if (field.id === 'umdl') {
                    assert.equal(next.id, field.id); assert.equal(next.type, field.type); assert.equal(next.endId, field.endId);
                    assert.equal(next.value, bonusUnits.find(unit => unit.id === row.newId).model);
                } else assert.deepEqual(next.raw, field.raw, 'Bonus model migration changed an unrelated field');
            }
        }
    }
    return output;
}
// Combat fields are shared by all five stages, including elite variants of these types.
export function installEnemyCombatFields(bytes) {
    const data = parseUnits(bytes);
    for (const kind of ['m', 'r']) for (let stage = 1; stage <= 5; stage++) {
        const id = `s${kind}0${stage}`, rows = data.tables[1].filter(row => row.newId === id);
        assert.equal(rows.length, 1, 'Missing or duplicate enemy: ' + id);
        const row = rows[0]; assert.equal(row.oldId, kind === 'm' ? 'ugho' : 'ucry');
        // Ranged fire uses Lua; mirror its range in native data as well.
        for (const [fieldId, type, value] of [['ucol', 2, 8], ['ua1r', 0, kind === 'm' ? 80 : 400]]) {
            const fields = row.fields.filter(field => field.id === fieldId);
            assert(fields.length <= 1 && (!fields.length || fields[0].type === type), 'Invalid enemy field: ' + id + '/' + fieldId);
            if (!fields.length) {
                delete row.raw; row.fields.push({id: fieldId, type, value, endId: id});
            } else if (fields[0].value !== value) { delete row.raw; delete fields[0].raw; fields[0].value = value; }
        }
    }
    return serializeUnits(data);
}
export function prepareBonusUnits(map, snapshots = new Map(), preparedAssets = new Map()) {
    const entries = new Map(), assets = new Map();
    for (const [name, skin] of [['war3map.w3u', false], ['war3mapSkin.w3u', true]]) {
        const asset = path.join(root, 'assets', name), source = fs.readFileSync(asset);
        const output = installEnemyCombatFields(installBonusUnits(map.read(name), skin));
        assert.deepEqual(installEnemyCombatFields(installBonusUnits(preparedAssets.get(asset) ?? source, skin)), output,
            'Asset and test map bonus props diverge: ' + name);
        if (snapshots.has(asset)) assert.deepEqual(snapshots.get(asset), source, 'Asset changed during preparation');
        else snapshots.set(asset, source);
        entries.set(name, output); assets.set(asset, output);
    }
    return {entries, assets};
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
export const weaponObjectPattern = /^HsW[1-9A-S]$/;
export const additionalWeaponObjects = [
    ['HsWD', 'BTNEnvenomedSpear'], ['HsWE', 'BTNPlagueCloud'], ['HsWF', 'BTNCorrosiveBreath'], ['HsWG', 'BTNOrbOfVenom'],
    ['HsWH', 'BTNDeathCoil'], ['HsWI', 'BTNCurse'], ['HsWJ', 'BTNUnholyFrenzy'], ['HsWK', 'BTNShadowStrike'],
    ['HsWP', 'BTNBanshee'], ['HsWQ', 'BTNSkeletonArcher'], ['HsWR', 'BTNGhoul'], ['HsWS', 'BTNAbomination'],
    ['HsWL', 'BTNUnstableConcoction'], ['HsWM', 'BTNRejuvenationPotion'], ['HsWN', 'BTNChemicalRage'], ['HsWO', 'BTNHealingSalve'],
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
    for (const object of additionalWeaponObjects) {
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
    for (const object of additionalWeaponObjects) {
        const rows = skins.tables[1].filter(row => row.newId === object.id);
        assert(rows.length <= 1, 'Duplicate weapon skin: ' + object.id);
        if (rows.length) {
            // The icon follows the Lua catalog; every other field stays as stored.
            const art = rows[0].fields.filter(field => field.id === 'aart');
            assert(art.length === 1 && art[0].type === 3, 'Unexpected weapon icon field: ' + object.id);
            if (art[0].value !== object.icon) { delete rows[0].raw; delete art[0].raw; art[0].value = object.icon; }
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
// so both heroes start identical, except the primary attribute (intelligence).
// The skin row only changes presentation.
export const putressHero = {id: 'HsPu', base: 'Uany', name: '퓨트리스', primary: 'INT',
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
        : [...source[0].fields.filter(field => field.id !== 'upra').map(field => ({id: field.id, type: field.type,
            level: field.level, column: field.column, value: field.value, endId: putressHero.id})),
            {id: 'upra', type: 3, level: 0, column: 0, value: putressHero.primary, endId: putressHero.id}];
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
export function preparePortraitObjects(map, snapshots, preparedAssets = new Map()) {
    const entries = new Map(), assets = new Map();
    for (const [name, skin] of [['war3map.w3u', false], ['war3mapSkin.w3u', true]]) {
        const bytes = map.read(name), assetPath = path.join(root, 'assets', name), source = fs.readFileSync(assetPath);
        const preparedSource = preparedAssets.get(assetPath) ?? source;
        // Both sources must agree on every pre-existing record before synchronization.
        const withoutOwned = value => { const data = parseUnits(value);
            data.tables = data.tables.map(table => table.filter(row => !portraitUnits.some(unit => row.newId === unit.id)));
            return serializeUnits(data); };
        assert.deepEqual(withoutOwned(preparedSource), withoutOwned(bytes), 'Asset and test map unit data diverge: ' + name);
        const output = installPortraitUnits(bytes, skin, {migrateLegacyAnya: true, migrateLegacyArmor: true, migrateLegacyUpgrades: true});
        assert.deepEqual(installPortraitUnits(preparedSource, skin, {migrateLegacyAnya: true, migrateLegacyArmor: true, migrateLegacyUpgrades: true}), output, 'Portrait asset output must match the map');
        snapshots.set(assetPath, source); entries.set(name, output); assets.set(assetPath, output);
    }
    return {entries, assets};
}
