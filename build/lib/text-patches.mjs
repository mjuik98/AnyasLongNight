// Tool-managed text and UI data: interface labels and tooltips, UI resources, item/weapon tooltip
// synchronization, gold removal, the experience curve and the map version label.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {mapVersion, root} from './project.mjs';
import {goldObjectSpecs, parseObjectData, serializeObjectData} from './object-data.mjs';
import {growthLevels, loadItemTooltipCatalog, loadTalentCatalog, loadWeaponTooltipCatalog, ownedItemPattern, weaponObjectCount} from './catalog.mjs';
import {weaponObjectPattern} from './object-patches.mjs';
import {mapInfo} from './map-info.mjs';

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
    const name = 'AnyasLongNightUI\\Transparent.tga';
    const asset = path.join(root, 'assets/war3mapImported/AnyasLongNightUI/Transparent.tga');
    const bytes = fs.readFileSync(asset);
    assert.equal(bytes.length, 18 + 8 * 8 * 4, 'Unexpected transparent UI texture size');
    assert.equal(bytes[0], 0); assert.equal(bytes[1], 0); assert.equal(bytes[2], 2);
    assert.equal(bytes.readUInt16LE(12), 8); assert.equal(bytes.readUInt16LE(14), 8);
    assert.equal(bytes[16], 32); assert.equal(bytes[17] & 15, 8);
    for (let i = 21; i < bytes.length; i += 4) assert.equal(bytes[i], 0, 'UI container texture must be fully transparent');
    snapshots.set(asset, bytes);
    const planeName = 'AnyasLongNightUI\\WarningPlane.mdx';
    const planeAsset = path.join(root, 'assets/war3mapImported/AnyasLongNightUI/WarningPlane.mdx');
    const plane = fs.readFileSync(planeAsset), chunks = new Map();
    assert.equal(plane.toString('ascii', 0, 4), 'MDLX', 'Invalid warning plane model');
    for (let at = 4; at < plane.length;) {
        assert(at + 8 <= plane.length, 'Truncated warning plane chunk');
        const tag = plane.toString('ascii', at, at + 4), end = at + 8 + plane.readUInt32LE(at + 4);
        assert(end <= plane.length && !chunks.has(tag), 'Invalid warning plane chunk');
        chunks.set(tag, plane.subarray(at + 8, end)); at = end;
    }
    assert.equal(chunks.get('VERS')?.readUInt32LE(0), 800, 'Warning plane must support classic and HD graphics');
    const geometry = chunks.get('GEOS');
    assert(geometry?.length === 316 && geometry.toString('ascii', 4, 8) === 'VRTX' && geometry.readUInt32LE(8) === 4);
    for (let vertex = 0; vertex < 4; vertex++) {
        const at = 12 + vertex * 12;
        assert(Math.abs(geometry.readFloatLE(at)) === 50 && Math.abs(geometry.readFloatLE(at + 4)) === 50
            && geometry.readFloatLE(at + 8) === 0, 'Warning plane must span exactly 100 by 100 units');
    }
    assert.equal(chunks.get('TEXS')?.toString('ascii', 4, 264).split('\0')[0], 'ReplaceableTextures\\CameraMasks\\White_mask.blp');
    snapshots.set(planeAsset, plane);
    // Red edge flash on hero damage; the frame's alpha sets the strength.
    const vignetteName = 'AnyasLongNightUI\\HitVignette.tga';
    const vignetteAsset = path.join(root, 'assets/war3mapImported/AnyasLongNightUI/HitVignette.tga');
    const vignette = fs.readFileSync(vignetteAsset);
    assert.equal(vignette.length, 18 + 128 * 128 * 4, 'Unexpected hit vignette texture size');
    assert.equal(vignette[2], 2); assert.equal(vignette.readUInt16LE(12), 128); assert.equal(vignette.readUInt16LE(14), 128);
    assert.equal(vignette[16], 32); assert.equal(vignette[17] & 15, 8);
    const centre = 18 + (64 * 128 + 64) * 4, corner = 18;
    assert(vignette[centre + 3] === 0 && vignette[corner + 3] === 255, 'Hit vignette must keep the screen centre clear');
    snapshots.set(vignetteAsset, vignette);
    const resources = new Map([[name, bytes], [planeName, plane], [vignetteName, vignette]]);
    const imports = map.read('war3map.imp');
    assert(imports && imports.length >= 8 && imports.readUInt32LE(0) === 1, 'Invalid map import table');
    const count = imports.readUInt32LE(4);
    let p = 8;
    const present = new Set();
    for (let i = 0; i < count; i++) {
        assert(p < imports.length, 'Truncated map import table');
        const flag = imports[p++], end = imports.indexOf(0, p);
        assert([5, 8, 10, 13].includes(flag) && end >= p, 'Invalid map import entry');
        const entry = imports.toString('utf8', p, end);
        const actual = flag === 10 || flag === 13 ? entry : 'war3mapImported\\' + entry;
        present.add(actual.replaceAll('/', '\\').toLowerCase());
        p = end + 1;
    }
    assert.equal(p, imports.length, 'Trailing map import data');
    let updated = imports;
    const missing = [...resources.keys()].filter(entry => !present.has(entry.toLowerCase()));
    if (missing.length) {
        const header = Buffer.from(imports.subarray(0, 8)); header.writeUInt32LE(count + missing.length, 4);
        updated = Buffer.concat([header, imports.subarray(8),
            ...missing.flatMap(entry => [Buffer.from([13]), Buffer.from(entry + '\0')])]);
    }
    const skinAsset = path.join(root, 'assets/war3mapSkin.txt'), definition = fs.readFileSync(skinAsset);
    snapshots.set(skinAsset, definition);
    const skin = installGameInterfaceLabel(map.read('war3mapSkin.txt'), definition);
    return new Map([...resources, ['war3map.imp', updated], ['war3mapSkin.txt', skin]]);
}
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
export function prepareInterfaceTooltip(map,snapshots,preparedAssets=new Map()) {
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
export function cleanTrinketTooltipText(text) {
    return cleanItemTooltipText(text).split(/(?<=\|n)|(?<=\n)/)
        .filter(segment => !/^\|cffaaaaaa/i.test(segment.trim())).join('').replace(/(?:\|n|\r?\n)+$/, '');
}
// Synchronize owned descriptions/editor strings and equipment model RGB.
// Other object fields, mechanics and unrelated authored strings retain their original bytes.
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
            const item = catalog?.get(row.newId);
            if (item?.base) {
                // The runtime rarity name is the single source for name and ground-model colors.
                const rgb = item.name.match(/^\|cff([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
                assert(rgb, 'Equipment lacks a rarity color: ' + row.newId);
                for (const [index, id] of ['iclr', 'iclg', 'iclb'].entries()) {
                    const value = parseInt(rgb[index + 1], 16), fields = row.fields.filter(field => field.id === id);
                    assert(fields.length <= 1 && (!fields.length || fields[0].type === 0), 'Invalid item RGB: ' + row.newId);
                    if (!fields.length) { delete row.raw; row.fields.push({id, type: 0, value, endId: row.newId}); }
                    else if (fields[0].value !== value) { delete row.raw; delete fields[0].raw; fields[0].value = value; }
                }
            }
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
export function stringTable(bytes) {
    assert(bytes, 'Missing map string table');
    const entries = new Map(), text = bytes.toString('utf8').replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
    for (const match of text.matchAll(/^STRING[ \t]+(\d+)[ \t]*\n(?:\/\/[^\n]*\n|[ \t]*\n)*\{[ \t]*\n([\s\S]*?)\n\}/gm)) {
        const id = Number(match[1]); assert(!entries.has(id), 'Duplicate map string: ' + id);
        entries.set(id, match[2]);
    }
    assert(entries.size > 0, 'Invalid map string table');
    return entries;
}
const mapVersionStrings = [
    {key: 'name', pattern: /^(\|cff8080ff포세이큰: 안야의 긴 밤 )\d+\.\d+[a-z](\|r)$/},
    {key: 'subtitle', pattern: /^(포세이큰 왕국 이전의 하룻밤 )\d+\.\d+[a-z]()$/},
];
export function installMapVersion(wts, info, version = mapVersion) {
    assert(/^\d+\.\d+[a-z]$/.test(version), 'Invalid map version: ' + version);
    const strings = stringTable(wts), expected = new Map();
    for (const {key, pattern} of mapVersionStrings) {
        const ids = [...strings].filter(([, text]) => pattern.test(text)).map(([id]) => id);
        assert.equal(ids.length, 1, 'Expected one versioned map string: ' + key);
        expected.set(ids[0], strings.get(ids[0]).replace(pattern, (_, head, tail) => head + version + tail));
        if (key === 'name') assert.equal(Number(mapInfo(info).name.match(/^TRIGSTR_(\d+)$/)?.[1]), ids[0],
            'Map name must use the versioned string');
    }
    const updated = Buffer.from(wts.toString('utf8').replace(/^((?:﻿)?STRING[ \t]+(\d+)[ \t]*\r?\n(?:\/\/[^\r\n]*\r?\n|[ \t]*\r?\n)*\{[ \t]*\r?\n)([\s\S]*?)(\r?\n\})/gm,
        (whole, header, id, text, end) => expected.has(Number(id)) ? header + expected.get(Number(id)) + end : whole));
    const after = stringTable(updated); assert.equal(after.size, strings.size, 'Map version changed string count');
    for (const [id, text] of strings) assert.equal(after.get(id), expected.get(id) ?? text, 'Map version readback differs: ' + id);
    return updated;
}
// The experience curve is owned by assets/war3mapMisc.txt and patched only on request;
// otherwise the map must already carry it.
export function prepareExperienceCurve(map, snapshots, preparedAssets, options) {
    const asset = path.join(root, 'assets/war3mapMisc.txt'), source = fs.readFileSync(asset);
    snapshots.set(asset, source);
    const constants = map.read('war3mapMisc.txt'), output = installExperienceCurve(constants, source);
    if (!options.experience) {
        assert.deepEqual(constants, output, 'Map experience curve differs from assets; run build with --experience-curve');
        return {entries: new Map(), assets: new Map()};
    }
    return {entries: new Map([['war3mapMisc.txt', output]]), assets: new Map()};
}
