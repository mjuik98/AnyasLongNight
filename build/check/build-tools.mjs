// Build tools: publication, bundle replacement, object data, base refresh and MPQ handling.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import luaparse from 'luaparse';
import {collectSources, replaceBundle, verifyPreserved, refreshBase, terrainInfo, mapInfo, parseUnits, serializeUnits, installPortraitUnits, portraitUnits, validatePortraitObjects, publishTransaction, editorBundle, installBonusUnits, bonusUnits, prepareBonusUnits, installEnemyCombatFields, installBonusItems, bonusItems, prepareBonusItems, parseObjectData, serializeObjectData, installStatDetails, prepareStatDetails, statDisplays, statDetailRows, installInterfaceTooltip, installHeroRegeneration, prepareHeroRegeneration, validateStrengthRegeneration, talentLua, installNativeTalents, prepareNativeTalents, loadItemTooltipCatalog, loadWeaponTooltipCatalog, cleanWeaponTooltipEntries, installGrowthObjects, weaponObjectPattern, weaponObjectCount, additionalWeaponObjects, installPutressHero, putressHero, cleanItemTooltipText, cleanItemTooltipEntries, prepareItemTooltipCleanup, removeGoldObjectData, removeGoldStrings, removeGoldMisc, prepareGoldRemoval, validateGoldRemoval, installExperienceCurve, prepareUIResources, installGameInterfaceLabel, installMapVersion, mapVersion, root, baseMapPath, mapPatchSteps, luaLocalPressure, luaLocalLimit} from '../build.mjs';
import {openMap} from '../mpq.mjs';
import {syncBase} from '../sync-base.mjs';
import {talentCatalog, testMapPath} from './harness.mjs';
import {blackTexture} from './suites-hud.mjs';
function publicationFixture(inject = () => {}) {
    const files = new Map(['asset-a', 'asset-b', 'bundle', 'map'].map(name => [name, Buffer.from('old-' + name)]));
    const io = {
        existsSync(file) { return files.has(file); },
        readFileSync(file) { inject('read', file, undefined, files); assert(files.has(file), 'Missing fixture: ' + file); return Buffer.from(files.get(file)); },
        mkdirSync() {},
        writeFileSync(file, bytes, options) {
            inject('write', file, undefined, files);
            if (options?.flag === 'wx' && files.has(file)) throw Object.assign(new Error('already exists'), {code: 'EEXIST'});
            files.set(file, Buffer.from(bytes));
        },
        renameSync(from, to) {
            inject('rename', from, to, files);
            assert(files.has(from), 'Missing prepared fixture'); files.set(to, files.get(from)); files.delete(from);
        },
        unlinkSync(file) { inject('unlink', file, undefined, files); assert(files.delete(file)); },
    };
    const entries = [...files].map(([file, before]) => ({path: file, before: Buffer.from(before), bytes: Buffer.from('new-' + file),
        ...(file === 'map' ? {alternate: 'alternate-map'} : {})}));
    const options = {io, stamp: 'fixture', finalize(paths) {
        return [{path: 'manifest', before: null, bytes: Buffer.from(paths.get('map'))}];
    }};
    return {files, entries, options};
}
for (const [label, operation, target] of [
    ['preparation', 'write', 'asset-b.fixture.tmp'], ['second asset', 'rename', 'asset-b'],
    ['map commit', 'rename', 'map'], ['success manifest', 'write', 'manifest.fixture.tmp'],
]) {
    let failed = false;
    const fixture = publicationFixture((op, from, to) => {
        if (!failed && op === operation && (op === 'rename' ? to : from) === target) {
            failed = true; throw new Error('injected ' + label + ' failure');
        }
    });
    const originalFiles = new Map([...fixture.files].map(([file, bytes]) => [file, Buffer.from(bytes)]));
    assert.throws(() => publishTransaction(fixture.entries, fixture.options), /injected/);
    assert(failed); assert.deepEqual(fixture.files, originalFiles, 'Publication failure must restore every committed companion');
    console.log('PASS publication rollback after ' + label + ' failure');
}
{
    const fixture = publicationFixture();
    const paths = publishTransaction(fixture.entries, fixture.options);
    assert.equal(paths.get('map'), 'map'); assert.equal(fixture.files.get('manifest').toString(), 'map');
    for (const file of ['asset-a', 'asset-b', 'bundle', 'map']) assert.equal(fixture.files.get(file).toString(), 'new-' + file);
    assert.equal(fixture.files.size, 5, 'Successful publication leaves no temporary files');
    console.log('PASS prepared map, companion files and actual-path manifest publish together');
}
for (const failManifest of [false, true]) {
    const fixture = publicationFixture((op, from, to) => {
        if (op === 'rename' && to === 'map') throw Object.assign(new Error('locked map'), {code: 'EBUSY'});
        if (failManifest && op === 'write' && from === 'manifest.fixture.tmp') throw new Error('injected final failure');
    });
    if (failManifest) {
        const before = new Map(fixture.files);
        assert.throws(() => publishTransaction(fixture.entries, fixture.options), /injected final/);
        assert.deepEqual(fixture.files, before);
    } else {
        const paths = publishTransaction(fixture.entries, fixture.options);
        assert.equal(paths.get('map'), 'alternate-map'); assert.equal(fixture.files.get('map').toString(), 'old-map');
        assert.equal(fixture.files.get('manifest').toString(), 'alternate-map');
    }
    console.log('PASS locked output uses a verified alternate and rollback protects its original: ' + failManifest);
}
{
    const fixture = publicationFixture((op, from, to, files) => {
        if (op === 'rename' && to === 'asset-a') files.set('asset-b', Buffer.from('external asset change'));
    });
    assert.throws(() => publishTransaction(fixture.entries, fixture.options), /changed during publication/);
    assert.equal(fixture.files.get('asset-a').toString(), 'old-asset-a');
    assert.equal(fixture.files.get('asset-b').toString(), 'external asset change');
    assert.equal(fixture.files.get('map').toString(), 'old-map');
    assert.equal(fixture.files.size, 4);
    console.log('PASS concurrent edits abort publication and survive companion rollback');
}
{
    const fixture = publicationFixture((op, from, to, files) => {
        if (op === 'rename' && to === 'map') { files.set('asset-a', Buffer.from('external post-commit change')); throw new Error('injected map failure'); }
    });
    assert.throws(() => publishTransaction(fixture.entries, fixture.options), /need recovery.*Concurrent edit preserved/);
    assert.equal(fixture.files.get('asset-a').toString(), 'external post-commit change');
    assert.equal(fixture.files.get('asset-b').toString(), 'old-asset-b');
    assert.equal(fixture.files.get('bundle').toString(), 'old-bundle');
    assert.equal(fixture.files.get('map').toString(), 'old-map');
    assert.equal(fixture.files.size, 4);
    console.log('PASS rollback refuses to overwrite a post-publication external edit');
}
{
    const fixture = publicationFixture((op, from, to, files) => {
        if (op === 'rename' && to === 'map') throw new Error('injected map failure');
        if (op === 'write' && from === 'asset-a.fixture.rollback') files.set('asset-a', Buffer.from('external edit during rollback'));
    });
    assert.throws(() => publishTransaction(fixture.entries, fixture.options), /need recovery.*Concurrent edit preserved/);
    assert.equal(fixture.files.get('asset-a').toString(), 'external edit during rollback');
    for (const name of ['asset-b', 'bundle', 'map']) assert.equal(fixture.files.get(name).toString(), 'old-' + name);
    assert.equal(fixture.files.size, 4);
    console.log('PASS rollback rechecks the destination after preparing its restoration');
}
{
    const fixture = publicationFixture((op, from, to) => {
        if (op === 'rename' && to === 'asset-b') throw new Error('original publication failure');
        if (op === 'unlink' && from === 'asset-b.fixture.tmp') throw Object.assign(new Error('temporary cleanup locked'), {code: 'EACCES'});
    });
    assert.throws(() => publishTransaction(fixture.entries, fixture.options), error => {
        assert(error instanceof AggregateError);
        assert(error.errors.some(item => /original publication failure/.test(item.message)));
        assert(error.errors.some(item => /temporary cleanup locked/.test(item.message)));
        return true;
    });
    for (const name of ['asset-a', 'asset-b', 'bundle', 'map']) assert.equal(fixture.files.get(name).toString(), 'old-' + name);
    assert.equal(fixture.files.size, 5, 'Only the locked temporary file remains');
    assert(fixture.files.has('asset-b.fixture.tmp'));
    console.log('PASS temporary cleanup continues after a failure and retains the original publication error');
}
{
    const fixture = publicationFixture();
    const before = new Map(fixture.files);
    fixture.options.guard = () => { throw new Error('source changed during build'); };
    assert.throws(() => publishTransaction(fixture.entries, fixture.options), /source changed/);
    assert.deepEqual(fixture.files, before);
    console.log('PASS source guard aborts after preparation without publishing companions');
}
{
    const fixture = publicationFixture((op, from) => {
        if (op === 'write' && from === 'manifest.fixture.tmp') throw new Error('injected manifest failure');
    });
    fixture.files.delete('map');
    fixture.entries.find(entry => entry.path === 'map').before = null;
    const before = new Map(fixture.files);
    assert.throws(() => publishTransaction(fixture.entries, fixture.options), /injected manifest/);
    assert.deepEqual(fixture.files, before, 'Rollback removes newly created outputs');
    console.log('PASS new profile output is removed when final publication fails');
}

const {bundle, count} = collectSources();
const original = fs.readFileSync(testMapPath);
const map = openMap(original), old = map.read('war3map.lua').toString('utf8');
{
    for (const version of [1, 2, 3]) for (const skin of [false, true]) {
        const before = serializeUnits({version, kind: 'unit', tables: [[], [{oldId: 'hfoo', newId: 'keep',
            extra: version === 3 ? [0] : [], fields: [{id: 'unam', type: 3, value: 'keep', endId: 'keep'}]}]]});
        const installed = installBonusUnits(before, skin), data = parseUnits(installed);
        assert.deepEqual(installBonusUnits(installed, skin), installed, 'Bonus object installation is idempotent');
        if (skin) {
            const legacy = parseUnits(installed), row = legacy.tables[1].find(row => row.newId === 'hsBC');
            const field = row.fields.find(field => field.id === 'umdl');
            delete row.raw; delete field.raw; field.value = bonusUnits[0].legacyModel;
            assert.deepEqual(installBonusUnits(serializeUnits(legacy), skin), installed, 'Migrate only the old treasure chest model');
            field.value = 'custom-model.mdl';
            assert.throws(() => installBonusUnits(serializeUnits(legacy), skin), /conflicts/);
        }
        assert.deepEqual(data.tables[1][0].raw, parseUnits(before).tables[1][0].raw);
        for (const unit of bonusUnits) {
            const row = data.tables[1].find(row => row.newId === unit.id);
            const fields = new Map(row.fields.map(field => [field.id, field.value]));
            if (skin) assert.equal(fields.get('umdl'), unit.model);
            else {
                assert.equal(fields.get('uabi'), ''); assert.equal(fields.get('uaen'), 0);
                assert.equal(fields.get('ucol'), 0); assert.equal(fields.get('uhpm'), 2);
                for (const id of ['ugol', 'ugor', 'ubba', 'ubdi', 'ubsi']) assert.equal(fields.get(id), 0);
            }
        }
        assert.equal(bonusUnits.length, 1, 'Only one bonus prop type is installed for gameplay');
        data.tables[1].find(row => row.newId === 'hsBC').oldId = 'ugho';
        for (const row of data.tables[1]) delete row.raw;
        assert.throws(() => installBonusUnits(serializeUnits(data), skin), /collides/);
    }
    const prepared = prepareBonusUnits(map), installed = map.replace(prepared.entries);
    verifyPreserved(original, installed, [...prepared.entries.keys()]);
    const synced = syncBase(fs.readFileSync(baseMapPath), collectSources().bundle);
    for (const [name] of prepared.entries) {
        const assetPath = path.join(root, 'assets', name), skin = name.includes('Skin');
        assert.deepEqual(openMap(installed).read(name), installEnemyCombatFields(installBonusUnits(map.read(name), skin)));
        assert.deepEqual(prepared.assets.get(assetPath), openMap(installed).read(name));
        for (const unit of bonusUnits) for (const archive of [openMap(installed), openMap(synced.patched)]) {
            assert(parseUnits(archive.read(name)).tables[1].some(row => row.newId === unit.id));
        }
    }
    console.log('PASS bonus units preserve existing records, reject ID collisions and synchronize both maps and assets');
}
{
    for (const name of ['war3map.w3u', 'war3mapSkin.w3u']) {
        const source = map.read(name), output = installEnemyCombatFields(source);
        assert.deepEqual(installEnemyCombatFields(output), output);
        const strip = bytes => {
            const data = parseUnits(bytes);
            for (const row of data.tables.flat()) if (/^s[mr]0[1-5]$/.test(row.newId)) {
                delete row.raw; row.fields = row.fields.filter(field => !['ucol', 'ua1r'].includes(field.id));
            }
            return serializeUnits(data);
        };
        assert.deepEqual(strip(output), strip(source), 'Enemy collision/range updates preserve every other field and unit');
        const rows = parseUnits(output).tables[1].filter(row => /^s[mr]0[1-5]$/.test(row.newId));
        assert.equal(rows.length, 10);
        for (const row of rows) {
            assert.equal(row.fields.find(field => field.id === 'ucol').value, 8);
            assert.equal(row.fields.find(field => field.id === 'ua1r').value, row.newId[1] === 'm' ? 80 : 400);
        }
        for (const archive of [openMap(syncBase(fs.readFileSync(baseMapPath), bundle).patched), map]) {
            for (const row of parseUnits(archive.read(name)).tables[1].filter(row => /^s[mr]0[1-5]$/.test(row.newId))) {
                assert.equal(row.fields.find(field => field.id === 'ucol').value, 8, 'Both maps carry collision size 8');
                assert.equal(row.fields.find(field => field.id === 'ua1r').value, row.newId[1] === 'm' ? 80 : 400,
                    'Both maps carry melee range 80 and ranged range 400');
            }
        }
    }
    console.log('PASS melee/ranged enemy collision 8 and ranges 80/400 in all stages preserve other unit fields');
}
{
    for (const version of [1, 2, 3]) for (const skin of [false, true]) {
        const before = serializeObjectData({version, kind: 'item', tables: [[], [{oldId: 'ches', newId: 'keep',
            extra: version === 3 ? [0] : [], fields: [{id: 'unam', type: 3, value: 'keep', endId: 'keep'}]}]]});
        const output = installBonusItems(before, skin), data = parseObjectData(output, 'item');
        assert.deepEqual(installBonusItems(output, skin), output);
        const legacy = parseObjectData(output, 'item'), stop = legacy.tables[1].find(row => row.newId === 'hsTS');
        const stopCatalog = bonusItems.find(item => item.id === 'hsTS');
        delete stop.raw;
        for (const field of stop.fields.filter(field => ['utub', 'ides'].includes(field.id))) {
            delete field.raw; field.value = stopCatalog.legacyDescription;
        }
        assert.deepEqual(installBonusItems(serializeObjectData(legacy), skin), output,
            'Only the known one-second boss description is migrated, preserving all other item bytes');
        stop.fields.find(field => field.id === 'utub').value = 'custom description';
        assert.throws(() => installBonusItems(serializeObjectData(legacy), skin), /conflicts/);
        assert.deepEqual(data.tables[1][0].raw, parseObjectData(before, 'item').tables[1][0].raw);
        for (const item of bonusItems) {
            const row = data.tables[1].find(row => row.newId === item.id);
            assert.equal(row.oldId, item.base);
            const fields = new Map(row.fields.map(field => [field.id, field.value]));
            assert.equal(fields.get('unam'), item.name);
            if (!skin) {
                assert.equal(fields.get('ipow'), 1, 'Native pickup automatically uses the powerup');
                assert.equal(fields.get('icla'), 'PowerUp');
                assert.equal(fields.get('iabi'), '', 'No native heal/XP can duplicate the scripted reward');
                for (const id of ['igol', 'ipaw', 'isel']) assert.equal(fields.get(id), 0);
            }
        }
        const collision = data.tables[1].find(row => row.newId === 'hsHR');
        delete collision.raw; collision.oldId = 'phea';
        assert.throws(() => installBonusItems(serializeObjectData(data), skin), /collides/);
    }
    const prepared = prepareBonusItems(map), installed = map.replace(prepared.entries);
    verifyPreserved(original, installed, [...prepared.entries.keys()]);
    const synced = openMap(syncBase(fs.readFileSync(baseMapPath), bundle).patched);
    for (const [name, bytes] of prepared.entries) {
        assert.deepEqual(prepared.assets.get(path.join(root, 'assets', name)), bytes);
        for (const archive of [openMap(installed), synced]) {
            const rows = parseObjectData(archive.read(name), 'item').tables[1];
            for (const item of bonusItems) assert(rows.some(row => row.newId === item.id));
        }
    }
    console.log('PASS bonus pickup definitions have no native reward and preserve unrelated items across both maps and assets');
}
{
    for (const [tier,entries] of talentCatalog.tiers.entries()) {
        assert.deepEqual(entries.map(entry=>Object.keys(entry.bonuses)), tier%2===0
            ? [['damagePct'],['speedPct'],['maxLife']] : [['sizePct'],['rangePct'],['durationPct']],
            'Talent rows must use the requested effect order without hidden secondary bonuses');
    }
    const snapshots = new Map(), prepared = prepareItemTooltipCleanup(map,snapshots);
    const again = cleanItemTooltipEntries(prepared.entries);
    for (const [name,bytes] of prepared.entries) assert.deepEqual(again.get(name),bytes);
    const tooltipStrings = new Map([...prepared.entries.get('war3map.wts').toString('utf8')
        .matchAll(/^STRING (\d+)\r?\n(?:\/\/[^\r\n]*\r?\n)*\{\r?\n([\s\S]*?)\r?\n\}/gm)].map(match=>[Number(match[1]),match[2]]));
    const mainItems = parseObjectData(prepared.entries.get('war3map.w3t'),'item');
    const skinItems = parseObjectData(prepared.entries.get('war3mapSkin.w3t'),'item');
    for(const row of mainItems.tables.flat().filter(row=>/^H(?:sT[1-9AB]|[seitabnchvpgrlfmuoxyjkzw]\d{2})$/.test(row.newId))) {
        const skin=skinItems.tables.flat().find(value=>value.newId===row.newId);
        for(const id of ['utub','ides']) {
            const field=row.fields.find(field=>field.id===id),skinField=skin.fields.find(field=>field.id===id);
            assert.equal(field.value,skinField.value,'Both native item readers must resolve the same clean text');
            const text=tooltipStrings.get(Number(field.value.slice(8)))??field.value;
            assert(text.length>0 && !/가방 정리 시 장비가 삭제됩니다\.|자동 공격 스킬을 새로 부여하지 않습니다\.|보유 중인 해당 무기에만 적용|기본 능력치는 각각 적용|세트 효과의 추가 피해는 세트 효과를 다시 일으키지 않음|확장 인벤토리에서 장착 시 적용/.test(text));
            if(/^HsT/.test(row.newId))assert(!text.includes('|cffaaaaaa') && !/단독 기준|강화 단계마다|자동 적용/.test(text));
        }
    }
    assert.deepEqual(cleanItemTooltipText('피해 +10%|n|cffaaaaaa보유 중인 해당 무기에만 적용|r|n풍미 문장'), '피해 +10%|n풍미 문장');
    assert.deepEqual(cleanItemTooltipText('체력 +100\r\n가방 정리 시 장비가 삭제됩니다.\r\n풍미 문장'), '체력 +100\r\n풍미 문장');
    const fixture = new Map(prepared.entries), skin = parseObjectData(fixture.get('war3mapSkin.w3t'),'item');
    const row = skin.tables.flat().find(row=>row.newId==='He05'), field = row.fields.find(field=>field.id==='utub');
    delete row.raw; delete field.raw;
    field.value='피해 +10%|n가방 정리 시 장비가 삭제됩니다.|n풍미 문장';
    fixture.set('war3mapSkin.w3t',serializeObjectData(skin));
    const inline = cleanItemTooltipEntries(fixture);
    assert.equal(parseObjectData(inline.get('war3mapSkin.w3t'),'item').tables.flat().find(row=>row.newId==='He05')
        .fields.find(field=>field.id==='utub').value,'피해 +10%|n풍미 문장');
    verifyPreserved(original,map.replace(prepared.entries),[...prepared.entries.keys()]);
    assert.equal(snapshots.size,7);
    console.log('PASS requested talent categories and item tooltip cleanup preserve stats, flavor, unrelated data and repeated builds');
}
{
    const catalog=loadItemTooltipCatalog();
    assert.equal(catalog.get('HsT2').name,'신속의 인장');
    assert.equal(catalog.get('HsT3').name,'추적의 인장');
    assert.equal(catalog.get('HsT4').name,'가속의 인장');
    assert.equal(catalog.get('HsT5').name,'확대의 인장');
    assert.equal(catalog.get('HsTB').name,'수호의 인장');
    assert.equal(catalog.get('HsTB').description,'방어력 +2');
    const unwanted=/단계 특성 · 셋 중 하나 선택|이번 수색 동안 유지|자동 적용|레벨업 선택으로 강화|버리기 불가|숫자는 강화 레벨|가방 정리 시 장비가 삭제됩니다|자동 공격 스킬을 새로 부여하지 않습니다|보유 중인 해당 무기에만 적용|기본 능력치는 각각 적용|세트 효과의 추가 피해는 세트 효과를 다시 일으키지 않음|확장 인벤토리에서 장착 시 적용|해당 무기 보유 시 적용|장착 시 회복 없음|단독 기준|별도의 장비입니다/;
    for(const filename of [baseMapPath,testMapPath]) {
        const candidate=openMap(fs.readFileSync(filename));
        const strings=new Map([...candidate.read('war3map.wts').toString('utf8')
            .matchAll(/^STRING (\d+)\r?\n(?:\/\/[^\r\n]*\r?\n)*\{\r?\n([\s\S]*?)\r?\n\}/gm)].map(match=>[Number(match[1]),match[2]]));
        const resolve=field=>/^TRIGSTR_\d+$/.test(field.value)?strings.get(Number(field.value.slice(8))):field.value;
        for(const name of ['war3map.w3t','war3mapSkin.w3t']) {
            const rows=parseObjectData(candidate.read(name),'item').tables.flat();
            for(const [id,expected]of catalog) {
                const row=rows.find(row=>row.newId===id);assert(row,filename+' missing '+id);
                if (expected.base) {
                    const rgb = expected.name.match(/^\|cff([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
                    for (const [index,field] of ['iclr','iclg','iclb'].entries())
                        assert.equal(row.fields.find(value=>value.id===field)?.value,parseInt(rgb[index+1],16),filename+' '+id+' rarity RGB');
                }
                for(const field of ['utub','ides']) {
                    const value=resolve(row.fields.find(value=>value.id===field));
                    assert.equal(value,expected.description,filename+' '+id+'/'+field+' differs from runtime');
                    assert(!unwanted.test(value),'A removed notice remains in '+id);
                }
                for(const field of row.fields.filter(field=>['unam','utip'].includes(field.id)))assert.equal(resolve(field),expected.name);
            }
        }
        for(const name of ['war3map.w3a','war3mapSkin.w3a']) {
            const rows=parseObjectData(candidate.read(name),'ability').tables[1];
            for(const entry of talentCatalog.tiers.flat())assert.equal(rows.find(row=>row.newId===entry.id)
                .fields.find(field=>field.id==='aub1').value,entry.text);
            const controller=rows.find(row=>row.newId===talentCatalog.controller);
            for(let level=1;level<=5;level++)assert.equal(controller.fields.find(field=>field.id==='aub1'&&field.level===level).value,talentCatalog.controllerText);
            const interfaceRow=parseObjectData(candidate.read(name),'ability').tables[0].find(row=>row.oldId==='ASpc');
            assert(interfaceRow,'Both maps must store the short default interface tooltip');
            assert.equal(interfaceRow.fields.find(field=>field.id==='atp1').value,talentCatalog.interface.title);
            assert.equal(interfaceRow.fields.find(field=>field.id==='aub1').value,talentCatalog.interface.defaultText);
            assert.deepEqual(installInterfaceTooltip(candidate.read(name),talentCatalog),candidate.read(name));
        }
    }
    const weapons=loadWeaponTooltipCatalog();
    for(const filename of [baseMapPath,testMapPath]) {
        const candidate=openMap(fs.readFileSync(filename));
        const entries=new Map(['war3map.w3a','war3mapSkin.w3a','war3map.wts'].map(name=>[name,candidate.read(name)]));
        for(const [name,bytes]of cleanWeaponTooltipEntries(entries,weapons))assert.deepEqual(bytes,entries.get(name),'Saved weapon tooltip differs from runtime: '+filename+'/'+name);
    }
    const grown=installGrowthObjects(new Map(['war3map.w3a','war3mapSkin.w3a','war3map.w3t','war3mapSkin.w3t'].map(name=>[name,map.read(name)])));
    const weaponEntries=new Map(['war3map.w3a','war3mapSkin.w3a','war3map.wts'].map(name=>[name,grown.get(name)??map.read(name)]));
    const installed=cleanWeaponTooltipEntries(weaponEntries,weapons);
    const strip=bytes=>{
        const data=parseObjectData(bytes,'ability');
        for(const row of data.tables[1].filter(row=>weaponObjectPattern.test(row.newId))) {
            row.fields=row.fields.filter(field=>!['anam','atp1','aub1'].includes(field.id));delete row.raw;
        }
        return serializeObjectData(data);
    };
    for(const name of ['war3map.w3a','war3mapSkin.w3a'])assert.deepEqual(strip(installed.get(name)),strip(weaponEntries.get(name)),
        'Weapon tooltip synchronization must preserve every combat field and unrelated ability');
    console.log('PASS complete original/test audit: 15 talents, 11 trinkets, '+[...catalog.values()].filter(item=>item.base).length+' equipment items and '+weaponObjectCount*7+' weapon levels match runtime');
}
{
    const snapshots=new Map(),prepared=prepareNativeTalents(map,snapshots);
    const ids=new Set([talentCatalog.controller,...talentCatalog.tiers.flat().map(entry=>entry.id)]);
    for(const [name,skin]of [['war3map.w3a',false],['war3mapSkin.w3a',true]]) {
        const source=map.read(name),output=prepared.entries.get(name),data=parseObjectData(output,'ability');
        const controller=data.tables[1].find(row=>row.newId===talentCatalog.controller);
        assert.equal(controller.oldId,'ATua');
        if(!skin) {
            assert.equal(controller.fields.find(field=>field.id==='alev').value,5);
            const tiers=controller.fields.filter(field=>field.id==='aabi');
            assert.equal(tiers.length,5);
            for(let i=0;i<5;i++)assert.deepEqual([tiers[i].level,tiers[i].column,tiers[i].value],
                [i+1,0,talentCatalog.tiers[i].map(entry=>entry.id).join(',')]);
        }
        for(const entry of talentCatalog.tiers.flat()) {
            const row=data.tables[1].find(row=>row.newId===entry.id);assert.equal(row.oldId,'Aamk');
            assert.equal(row.fields.find(field=>field.id==='aub1').value,entry.text,
                'Both base and skin data must contain only the concise talent effect');
            if(skin) {
                assert.equal(row.fields.find(field=>field.id==='abpy').value,-11);
                assert.equal(row.fields.find(field=>field.id==='aub1').value,entry.text);
            } else for(const id of ['Iagi','Iint','Istr'])assert.equal(row.fields.find(field=>field.id===id).value,0);
        }
        const strip=value=>{const d=parseObjectData(value,'ability');d.tables[1]=d.tables[1].filter(row=>!ids.has(row.newId));return serializeObjectData(d);};
        assert.deepEqual(strip(output),strip(source),'All unrelated ability rows must retain exact raw bytes');
        assert.deepEqual(installNativeTalents(output,skin,talentCatalog),output);
        const collision=parseObjectData(output,'ability');collision.tables[1].find(row=>row.newId==='Ht1A').oldId='AHbz';
        assert.throws(()=>installNativeTalents(serializeObjectData({...collision,tables:collision.tables.map(table=>table.map(row=>{
            if(row.newId==='Ht1A')delete row.raw;return row;
        }))}),skin,talentCatalog),/collision/);
    }
    const installed=map.replace(prepared.entries),saved=openMap(installed);
    for(const [name,bytes]of prepared.entries)assert.deepEqual(saved.read(name),bytes);
    verifyPreserved(original,installed,['war3map.w3a','war3mapSkin.w3a']);
    assert(snapshots.size===3 && prepared.assets.size===2);
    assert(bundle.includes(talentLua(talentCatalog)),'Native objects and runtime must use the same guarded catalog');
    console.log('PASS ATua-based five-tier tree, fifteen hidden zero-stat markers, catalog consistency, raw preservation, collision guards and MPQ readback');
}
{
    const source = map.read('war3map.w3a'), snapshots = new Map();
    const prepared = prepareStatDetails(map, snapshots);
    const output = prepared.entries.get('war3map.w3a');
    const data = parseObjectData(output, 'ability');
    const row = data.tables[0].find(row => row.oldId === 'ASde');
    assert(row, 'Native ASde must have an explicit supported-stat list');
    const field = row.fields.find(field => field.id === 'Asdf');
    assert.deepEqual([field.type, field.level, field.column, field.value], [3, 1, 1, 'AS01,AS07,AS09,AS0E,AS0C,AS0A,AS04,AS10']);
    // Bases and DataA..DataC columns from the installed 3.0.0.24268 AbilityMetaData/AbilityData.
    const expected={HsCD:['AIcr','Icr1',{Icr2:[0,2]}],HsDM:['AIap','Isa1',{Isa2:[0,2],Isa3:[0,3]}],
        HsAR:['AIlv','Ilv1',{Ilv2:[0,2]}],HsSZ:['AIsv','Isv1',{Isv2:[0,2]}],HsRG:['ALs1','Ivam',{}],
        HsDU:['AIxr','Ocr1',{Ixr2:[2,2],Ixr3:[2,3]}],HsPS:['AIsc','Ocr1',{Ixr2:[2,2]}]};
    assert.deepEqual(statDisplays.map(spec=>spec.id),Object.keys(expected));
    for(const [id,[base,value,zeros]]of Object.entries(expected)){
        const display=data.tables[1].find(row=>row.newId===id);
        assert.equal(display.oldId,base,id);
        assert.equal(display.fields.find(field=>field.id==='alev').value,2);
        assert.equal(display.fields.find(field=>field.id==='abpy').value,-11);
        assert.equal(display.fields.find(field=>field.id==='aite').value,0);
        assert.equal(display.fields.length,6+2*(1+Object.keys(zeros).length),'No unexpected fields on '+id);
        for(let level=1;level<=2;level++) {
            const rate=display.fields.find(field=>field.id===value&&field.level===level);
            assert.deepEqual([rate.type,rate.column,rate.value],[2,1,0],id+' starts at zero');
            for(const [zero,[type,column]]of Object.entries(zeros)){
                const flag=display.fields.find(field=>field.id===zero&&field.level===level);
                assert.deepEqual([flag.type,flag.column,flag.value],[type,column,0],'Percentage mode and zero multipliers: '+id+'.'+zero);
            }
        }
    }
    assert.deepEqual(installStatDetails(output), output, 'ASde installation must be idempotent');
    const stripOwned = bytes => {const d = parseObjectData(bytes, 'ability');
        d.tables[0] = d.tables[0].filter(row => row.oldId !== 'ASde');
        d.tables[1] = d.tables[1].filter(row => !statDisplays.some(spec => spec.id === row.newId));return serializeObjectData(d);};
    assert.deepEqual(stripOwned(output), stripOwned(source), 'Every unrelated ability record retains its raw bytes');
    for (const version of [1,2,3]) {
        const fixture = {version, kind: 'ability', tables: [[{oldId:'ASde',newId:'\0\0\0\0',extra:version===3?[0]:[],fields:[
            {id:'Asdf',type:3,level:1,column:4,value:'AS01,AS03,AS0F',endId:'ASde'},
            {id:'anam',type:3,level:0,column:0,value:'keep native text',endId:'ASde'}]}],[]]};
        const bytes = serializeObjectData(fixture), installed = installStatDetails(bytes);
        const before = parseObjectData(bytes, 'ability').tables[0][0], after = parseObjectData(installed, 'ability').tables[0][0];
        assert.equal(after.fields[0].value, statDetailRows);assert.deepEqual(after.fields[1].raw, before.fields[1].raw);
        assert.deepEqual(installStatDetails(bytes, true), installed, 'A skin override cannot restore unsupported stats');
        fixture.tables[0][0].fields[0].column = 2;
        assert.throws(() => installStatDetails(serializeObjectData(fixture)), /field layout/);
        fixture.tables[0][0].fields[0].column=1;
        fixture.tables[1].push({oldId:'Aamk',newId:'HsCD',extra:version===3?[0]:[],fields:[]});
        assert.throws(()=>installStatDetails(serializeObjectData(fixture)),/base collision: HsCD/);
        fixture.tables[1][0].oldId='AIcr';fixture.tables[1].push({oldId:'AIcr',newId:'HsRG',extra:version===3?[0]:[],fields:[]});
        assert.throws(()=>installStatDetails(serializeObjectData(fixture)),/base collision: HsRG/);
        fixture.tables[1].length=0;fixture.tables[0].push({oldId:'HsDM',newId:'\0\0\0\0',extra:version===3?[0]:[],fields:[]});
        assert.throws(()=>installStatDetails(serializeObjectData(fixture)),/native override: HsDM/);
    }
    const patched = map.replace(prepared.entries), saved = openMap(patched);
    assert.deepEqual(saved.read('war3map.w3a'), output);
    assert.deepEqual(prepareStatDetails(saved).entries.get('war3map.w3a'), output);
    verifyPreserved(original, patched, ['war3map.w3a','war3mapSkin.w3a']);
    assert(snapshots.size===2 && prepared.assets.size===2);
    assert.deepEqual(fs.readFileSync(path.join(root,'assets/war3map.w3a')), source, 'Preparation must not publish assets');
    console.log('PASS ASde shows seven renamed common-stat rows through hidden item-stat passives; bases, columns, modes, skins, collisions, raw bytes and MPQ readback are preserved');
}
{
    const prepared = prepareHeroRegeneration(map), source = map.read('war3map.w3u');
    const output = prepared.entries.get('war3map.w3u');
    const row = parseUnits(output).tables[0].find(row => row.oldId === 'Uany');
    assert.equal(row.fields.find(field => field.id === 'uhrt').type, 3,
        'regenType is an editor string, not the runtime UNIT_IF integer enum');
    assert.equal(row.fields.find(field => field.id === 'uhrt').value, 'always');
    assert.equal(row.fields.find(field => field.id === 'uhpr').value, 0);
    const stripOwned = bytes => {const data = parseUnits(bytes);
        for (const row of data.tables[0]) if (row.oldId === 'Uany') {
            row.fields = row.fields.filter(field => !['uhrt','uhpr'].includes(field.id)); delete row.raw;
        }return serializeUnits(data);};
    assert.deepEqual(stripOwned(output),stripOwned(source),'Only native regeneration fields may change on Anya');
    assert.deepEqual(installHeroRegeneration(output),output);
    for (const version of [1,2,3]) for (const [type,value] of [
        ...['none','always','blight','day','night'].map(value=>[3,value]),
        ...[0,1,2,3,4].map(value=>[0,value]), // Repair maps published with the wrong runtime enum.
    ]) {
        const fixture = {version,kind:'unit',tables:[[{oldId:'Uany',newId:'\0\0\0\0',extra:version===3?[0,7]:[],fields:[
            {id:'uhrt',type,value,endId:'Uany'}, {id:'uhpr',type:1,value:2,endId:'Uany'},
            {id:'umdl',type:3,value:'keep-model',endId:'Uany'}]}],[]]};
        const before=serializeUnits(fixture),after=installHeroRegeneration(before);
        const repaired=parseUnits(after).tables[0][0].fields.find(field=>field.id==='uhrt');
        assert.deepEqual({type:repaired.type,value:repaired.value},{type:3,value:'always'});
        assert.deepEqual(stripOwned(after),stripOwned(before));
        assert.deepEqual(installHeroRegeneration(before,true),after,'An explicit skin cannot disable always-on regeneration');
        assert.deepEqual(installHeroRegeneration(after),after);
    }
    validateStrengthRegeneration(map.read('war3mapMisc.txt'));
    for (const text of ['[Misc]\nStrRegenBonus=0.05','[Misc]\nStrRegenBonus=0\nStrRegenBonus=0',
        '[Other]\nStrRegenBonus=0','[Misc]\nStrRegenBonus=']) {
        assert.throws(()=>validateStrengthRegeneration(Buffer.from(text)),/StrRegenBonus/);
    }
    const saved=map.replace(prepared.entries);
    assert.deepEqual(openMap(saved).read('war3map.w3u'),output);
    verifyPreserved(original,saved,['war3map.w3u','war3mapSkin.w3u']);
    assert.deepEqual(fs.readFileSync(path.join(root,'assets/war3map.w3u')),source,'Preparation must not publish unit assets');
    assert(!bundle.includes('SurvivorCombat.Regenerate('),'The old periodic Lua heal must not survive in the runtime bundle');
    console.log('PASS Anya always regenerates natively with no inherited base or STR bonus; skins, field bytes and saved MPQ remain consistent');
}
{
    const snapshots = new Map(), entries = prepareUIResources(map, snapshots);
    const texture = entries.get('AnyasLongNightUI\\Transparent.tga');
    const planeName = 'AnyasLongNightUI\\WarningPlane.mdx';
    const plane = entries.get(planeName);
    assert(texture && snapshots.size === 4, 'Textures, warning plane and game interface labels are guarded build inputs');
    const vignetteName = 'AnyasLongNightUI\\HitVignette.tga';
    assert.deepEqual(entries.get(vignetteName), fs.readFileSync(path.join(root,'assets/war3mapImported/AnyasLongNightUI/HitVignette.tga')));
    assert.deepEqual(plane, fs.readFileSync(path.join(root,'assets/war3mapImported/AnyasLongNightUI/WarningPlane.mdx')));
    const planeChunks = new Map();
    for (let at=4;at<plane.length;) {
        const size=plane.readUInt32LE(at+4);planeChunks.set(plane.toString('ascii',at,at+4),plane.subarray(at+8,at+8+size));at+=8+size;
    }
    assert.deepEqual([...planeChunks.keys()],['VERS','MODL','SEQS','MTLS','TEXS','GEOS','BONE','PIVT']);
    assert.equal(planeChunks.get('SEQS').length,132);
    assert.equal(planeChunks.get('SEQS').toString('ascii',0,80).split('\0')[0],'Stand');
    const geoset=planeChunks.get('GEOS');const corners=new Set();
    for(let i=0;i<4;i++)corners.add([0,1,2].map(axis=>geoset.readFloatLE(12+i*12+axis*4)).join(','));
    assert.equal(corners.size,4,'Four distinct corners form the rectangular warning');
    assert.equal(planeChunks.get('MTLS').length,48,'The warning has no animated alpha tracks');
    assert.equal(planeChunks.get('MTLS').readFloatLE(44),1);
    const definition=fs.readFileSync(path.join(root,'assets/war3mapSkin.txt'));
    const lines=bytes=>bytes.toString('utf8').split(/\r?\n/);
    const sectionOf=(text,key)=>{let section=null;for(const line of lines(text)){const header=line.match(/^\[([^\]]+)\]/);
        if(header)section=header[1];else if(line.startsWith(key+'='))return section;}return undefined;};
    for(const before of [undefined,
        // The 0.1a build wrongly wrote stat text into [CustomSkin]; it must move to [FrameDef].
        Buffer.from('[CustomSkin]\nAS07_LABEL=공통 무기 쿨다운 감소\n'),
        Buffer.from('[CustomSkin]\r\nKeep=unchanged\r\nAS07_LABEL=old label\r\n[FrameDef]\r\nGOLD=TRIGSTR_7\r\nAS09_LABEL=old\r\n\r\n[Other]\r\nAS07_LABEL=other section\r\n'),
        Buffer.from('[CustomSkin]\nKeep=unchanged\n[Other]\nKeep=also unchanged'),Buffer.from('[Other]\nKeep=unchanged')]) {
        const after=installGameInterfaceLabel(before,definition);
        const text=after.toString('utf8');
        for(const [key,name]of [['AS07','공통 무기 쿨다운 감소'],['AS09','공통 무기 피해 증가'],['AS0E','공통 무기 범위 증가'],['AS0C','공통 무기 크기 증가'],
            ['AS0A','공통 무기 사거리 증가'],['AS04','공통 무기 지속시간 증가'],['AS10','공통 투사체 속도 증가']]){
            assert.equal(lines(after).filter(line=>line===key+'_LABEL='+name).length,1,key+' label');
            assert.equal(lines(after).filter(line=>line.startsWith(key+'_TOOLTIP=모든 ')).length,1,key+' tooltip');
            assert(!lines(after).some(line=>line.startsWith(key+'_TOOLTIP=')&&line.includes('무기 설명에서')),'Stat tooltips stay one sentence: '+key);
            assert.equal(sectionOf(after,key+'_LABEL'),'FrameDef','GlobalStrings overrides belong to [FrameDef]: '+key);
            assert.equal(sectionOf(after,key+'_TOOLTIP'),'FrameDef');
        }
        assert.equal(lines(after).filter(line=>line==='[FrameDef]').length,1,'One FrameDef section');
        assert(!/\[CustomSkin\]\r?\n(?:AS|$|\[)/.test(text),'No stat text or empty section remains in CustomSkin');
        assert.deepEqual(installGameInterfaceLabel(after,definition),after);
        if(before)for(const line of lines(before).filter(line=>/^(Keep|GOLD)=/.test(line)||line==='AS07_LABEL=other section'))
            assert(lines(after).includes(line),'Unrelated interface entries must survive');
    }
    const legacy=installGameInterfaceLabel(Buffer.from('[CustomSkin]\nAS07_LABEL=공통 무기 쿨다운 감소\n'),definition).toString('utf8');
    assert(legacy.startsWith('[FrameDef]\n')&&!legacy.includes('CustomSkin'),'A section holding only the old label is dropped');
    assert.throws(()=>installGameInterfaceLabel(Buffer.from('[FrameDef]\nAS07_LABEL=a\nAS07_LABEL=b\n'),definition),/Duplicate AS07_LABEL/);
    assert.throws(()=>installGameInterfaceLabel(Buffer.from('[FrameDef]\nas09_tooltip=a\nAS09_TOOLTIP=b\n'),definition),/Duplicate AS09_TOOLTIP/);
    assert.throws(()=>installGameInterfaceLabel(null,Buffer.from('[FrameDef]\nAS07_LABEL=a\nAS07_LABEL=b\n')),/Duplicate interface definition/);
    assert.throws(()=>installGameInterfaceLabel(null,Buffer.from('[CustomSkin]\nAS07_LABEL=a\n')),/belong to \[FrameDef\]/);
    assert.throws(()=>installGameInterfaceLabel(Buffer.from('[FrameDef]\n[framedef]\n'),definition),/Duplicate FrameDef/);
    for (let i = 21; i < texture.length; i += 4) assert.equal(texture[i], 0);
    const installed = map.replace(entries), readback = openMap(installed);
    assert.deepEqual(readback.read('AnyasLongNightUI\\Transparent.tga'), texture);
    assert.deepEqual(readback.read(planeName),plane);
    assert(readback.read('war3map.imp').includes(Buffer.from(planeName+'\0')));
    assert.deepEqual(readback.read(vignetteName),entries.get(vignetteName));
    assert(readback.read('war3map.imp').includes(Buffer.from(vignetteName+'\0')),'The editor must retain the hit vignette on save');
    assert.deepEqual(openMap(fs.readFileSync(baseMapPath)).read(planeName),plane,'Editor and playtest maps share the exact warning plane');
    assert(readback.read('(listfile)').toString('utf8').includes('AnyasLongNightUI\\Transparent.tga'));
    assert.deepEqual(readback.replace(entries), installed, 'Resource installation is idempotent');
    assert.deepEqual(readback.replace(prepareUIResources(readback)), installed, 'Editor import registration is idempotent');
    const oldImports = map.read('war3map.imp'), imports = readback.read('war3map.imp');
    assert.deepEqual(imports.subarray(8, oldImports.length), oldImports.subarray(8), 'Existing import paths and flags are preserved');
    assert(imports.includes(Buffer.from('AnyasLongNightUI\\Transparent.tga\0')), 'The editor must retain the imported texture on save');
    assert.deepEqual(readback.read('war3mapSkin.txt'),entries.get('war3mapSkin.txt'));
    verifyPreserved(original, installed, ['AnyasLongNightUI\\Transparent.tga', 'AnyasLongNightUI\\WarningPlane.mdx', vignetteName, 'war3map.imp', 'war3mapSkin.txt', '(listfile)']);
    console.log('PASS fully transparent container texture is imported, listed, byte-verified and preserves unrelated map data');
}
{
    const ui = fs.readFileSync(path.join(root, 'src/30_gameplay/SurvivorNarrativeUI.lua'), 'utf8');
    const match = ui.match(/BlzFrameSetTexture\(introRoot,\s*"((?:\\.|[^"\\])*)"/);
    assert(match, 'The intro backdrop must declare its actual texture path');
    const texturePath = JSON.parse('"' + match[1] + '"');
    assert.equal(texturePath, 'AnyasLongNightUI\\Black.tga', 'Runtime texture paths use the actual MPQ import name');
    assert.deepEqual(map.read(texturePath), blackTexture, 'The runtime path must resolve to the exact opaque black asset inside the saved map');
    console.log('PASS runtime intro texture path resolves to the unchanged opaque black asset in the saved MPQ');
}
{
    const wts = map.read('war3map.wts'), info = map.read('war3map.w3i');
    const labelled = installMapVersion(wts, info, '9.9z'), text = labelled.toString('utf8');
    assert(text.includes('|cff8080ff포세이큰: 안야의 긴 밤 9.9z|r') && text.includes('포세이큰 왕국 이전의 하룻밤 9.9z'));
    assert.equal(text.length - wts.toString('utf8').length, 0, 'Same-length labels keep every other byte');
    assert.deepEqual(installMapVersion(labelled, info, '9.9z'), labelled, 'Map version installation is idempotent');
    assert.deepEqual(installMapVersion(installMapVersion(wts, info, '9.9z'), info), installMapVersion(wts, info));
    assert.throws(() => installMapVersion(wts, info, '0.1'), /Invalid map version/);
    assert(mapVersion === '0.1d' && map.read('war3map.wts').toString('utf8').includes('안야의 긴 밤 ' + mapVersion + '|r'),
        'The test map carries the current version label');
    console.log('PASS map name and loading subtitle carry the managed version label');
}
const changed = replaceBundle(old, bundle);
const result = map.replace(new Map([['war3map.lua', Buffer.from(changed)]]));
const preserved = verifyPreserved(original, result);
assert.equal(replaceBundle(changed, bundle), changed, 'Repeated build must be idempotent');
assert.throws(() => replaceBundle('function main() end', bundle), /marked/);
assert.throws(() => replaceBundle(old + old, bundle), /Duplicate/);
assert.equal(old.slice(old.lastIndexOf('-- ===== END src/00_bootstrap/AnyasLongNight.lua =====')),
    changed.slice(changed.lastIndexOf('-- ===== END src/00_bootstrap/AnyasLongNight.lua =====')));
console.log(`PASS Lua syntax (${count} sources), repeated bundle replacement, native map script and ${preserved} unrelated entries preserved`);
{
    const wct = map.read('war3map.wct'), commentEnd = wct.indexOf(0, 8), start = commentEnd + 5;
    const oldLength = wct.readUInt32LE(commentEnd + 1);
    const nativePrefix = '-- Authored prefix\nlocal nativePrefix = "keep"\n';
    const nativeSuffix = '\n-- Authored suffix\nlocal nativeSuffix = "keep"\n';
    const customScript = Buffer.from(nativePrefix + wct.toString('utf8', start, start + oldLength - 1) + nativeSuffix + '\0');
    const prefix = Buffer.from(wct.subarray(0, start)); prefix.writeUInt32LE(customScript.length, commentEnd + 1);
    const tail = wct.subarray(start + oldLength);
    let current = Buffer.concat([prefix, customScript, tail]);
    for (const profile of ['release', 'development', 'playtest']) {
        const nextBundle = collectSources({profile}).bundle;
        current = editorBundle(current, nextBundle);
        const length = current.readUInt32LE(commentEnd + 1);
        const text = current.toString('utf8', start, start + length - 1);
        assert(text.startsWith(nativePrefix) && text.endsWith(nativeSuffix), 'Native custom script must survive profile changes');
        assert(text.includes(nextBundle.trimEnd()), 'Editor source must contain the selected profile');
        assert.deepEqual(current.subarray(0, commentEnd + 1), wct.subarray(0, commentEnd + 1), 'Editor header/comment must be preserved');
        assert.deepEqual(current.subarray(start + length), tail, 'Following editor records must be preserved');
        assert.deepEqual(editorBundle(current, nextBundle), current, 'Editor synchronization must not accumulate newlines');
    }
    console.log('PASS editor profile synchronization preserves authored scripts, metadata and repeated-build bytes');
}

// Encode economic fields independently so the surgical transform cannot pass by
// merely agreeing with its own serializer; unrelated stats/models must survive.
{
    const integer = value => { const bytes = Buffer.alloc(4); bytes.writeInt32LE(value); return bytes; };
    const field = (id, type, value, endId = 'HsXX') => {
        let data;
        if (type === 3) data = Buffer.from(value + '\0');
        else if (type === 0) data = integer(value);
        else { data = Buffer.alloc(4); data.writeFloatLE(value); }
        return Buffer.concat([Buffer.from(id), integer(type), data, Buffer.from(endId)]);
    };
    const fixture = (kind, version, extraFields = []) => {
        const fields = [field(kind === 'item' ? 'iabi' : 'umdl', 3, 'unchanged-resource'),
            field(kind === 'item' ? 'ilev' : 'uhpm', 0, 150), field(kind === 'item' ? 'isca' : 'ucol', 2, 1.25),
            ...extraFields];
        return Buffer.concat([integer(version), integer(0), integer(1), Buffer.from(kind === 'item' ? 'ring' : 'hfoo'),
            Buffer.from('HsXX'), ...(version === 3 ? [integer(2), integer(0), integer(7)] : []),
            integer(fields.length), ...fields]);
    };
    for (const kind of ['item', 'unit']) {
        const owned = kind === 'item' ? ['igol', 'ipaw', 'isel'] : ['ugol', 'ugor', 'ubba', 'ubdi', 'ubsi'];
        for (const version of [1, 2, 3]) {
            const before = fixture(kind, version, [field(owned[0], 0, 120)]);
            const after = removeGoldObjectData(before, kind), previous = parseObjectData(before, kind), parsed = parseObjectData(after, kind);
            assert.equal(parsed.version, version);
            assert.equal(parsed.tables[1].length, 1);
            const row = parsed.tables[1][0], previousRow = previous.tables[1][0];
            assert.deepEqual([row.oldId, row.newId, row.extra], [previousRow.oldId, previousRow.newId, previousRow.extra]);
            for (const oldField of previousRow.fields.filter(value => !owned.includes(value.id)))
                assert.deepEqual(row.fields.find(value => value.id === oldField.id).raw, oldField.raw, 'A non-economic object field changed');
            for (const id of owned) {
                const values = row.fields.filter(value => value.id === id);
                assert.equal(values.length, 1, 'Explicitly override the inherited gold/sale field: ' + id);
                assert.equal(values[0].type, 0); assert.equal(values[0].value, 0);
                assert.equal(values[0].endId, 'HsXX');
            }
            assert.deepEqual(removeGoldObjectData(after, kind), after, 'Gold removal is idempotent');
            const skin = removeGoldObjectData(before, kind, {skin: true}), skinRow = parseObjectData(skin, kind).tables[1][0];
            assert.equal(skinRow.fields.length, previousRow.fields.length, 'Skin patch must not add unrelated inherited overrides');
            assert.equal(skinRow.fields.find(value => value.id === owned[0]).value, 0);
            assert.throws(() => removeGoldObjectData(fixture(kind, version, [field(owned[0], 0, 1), field(owned[0], 0, 2)]), kind),
                'Ambiguous duplicated economic fields must be rejected');
            assert.throws(() => removeGoldObjectData(fixture(kind, version, [field(owned[0], 3, '120')]), kind),
                'Economic fields with a wrong type must be rejected');
        }
    }
    console.log('PASS independent object versions, inherited cost/bounty/sale overrides, byte-preserved stats, skins and conflict refusal');
    const strings = Buffer.from('STRING 1\r\n{\r\n모든 무기 피해 +10%|n판매가 25 골드 · 일괄 정리는 판매 없이 삭제|n세트 2/3\r\n}\r\nSTRING 2\r\n{\r\n레벨 업 장신구 · 버리기/판매 불가 · 숫자는 강화 레벨\r\n}\r\nSTRING 3\r\n{\r\n수정 금지 문장\r\n}\r\n');
    const cleanedStrings = removeGoldStrings(strings), text = cleanedStrings.toString('utf8');
    assert(text.includes('모든 무기 피해 +10%|n가방 정리 시 장비가 삭제됩니다.|n세트 2/3'));
    assert(text.includes('버리기 불가 · 숫자는 강화 레벨') && !text.includes('판매'));
    assert(text.includes('수정 금지 문장'), 'Unrelated map strings remain unchanged');
    const unrelatedText = Buffer.from('STRING 1\n{\n무관한 골드 모델 이름\n}\n');
    assert.deepEqual(removeGoldStrings(unrelatedText), unrelatedText, 'Migration owns only the identified economic tooltip segments');
    assert.deepEqual(removeGoldStrings(cleanedStrings), cleanedStrings);
    const misc = Buffer.from('[Misc]\r\nPawnItemRate=0.5\r\nDropItemRange=10000.0\r\n');
    const cleanedMisc = removeGoldMisc(misc);
    assert.equal(cleanedMisc.toString('utf8'), '[Misc]\r\nPawnItemRate=0.0\r\nDropItemRange=10000.0\r\n');
    assert.deepEqual(removeGoldMisc(cleanedMisc), cleanedMisc);
    console.log('PASS gold tooltip cleanup preserves string IDs, game stats, unrelated text and game constants');
}
{
    const snapshots = new Map(), removal = prepareGoldRemoval(map, snapshots);
    const economicMap = openMap(map.replace(removal.entries));
    validateGoldRemoval(economicMap);
    for (const [name, bytes] of removal.entries)
        assert.deepEqual(economicMap.read(name), bytes, 'Economic map entries must survive MPQ readback');
    for (const [filename, bytes] of snapshots)
        assert.deepEqual(fs.readFileSync(filename), bytes, 'Preparation must not write source assets');
    assert(!economicMap.read('war3map.wts').toString('utf8').match(/판매|골드/));
    const data = parseObjectData(economicMap.read('war3map.w3t'), 'item');
    data.tables[1][0].fields.find(field => field.id === 'igol').value = 50;
    delete data.tables[1][0].raw;
    delete data.tables[1][0].fields.find(field => field.id === 'igol').raw;
    assert.throws(() => validateGoldRemoval(openMap(economicMap.replace(new Map([
        ['war3map.w3t', serializeObjectData(data)],
    ])))), /--remove-gold/, 'Ordinary publication must refuse a reintroduced item price');
    const pricedStrings = Buffer.concat([economicMap.read('war3map.wts'), Buffer.from('\nSTRING 9999\n{\n판매가 8 골드 · 일괄 정리는 판매 없이 삭제\n}\n')]);
    assert.throws(() => validateGoldRemoval(openMap(economicMap.replace(new Map([
        ['war3map.wts', pricedStrings],
    ])))), /--remove-gold/, 'Restored editor strings must not reintroduce sale text');
    console.log('PASS economic asset preparation is read-only and publication rejects returned prices or sale text');
}

{
    const asset = fs.readFileSync(path.join(root, 'assets/war3mapMisc.txt'));
    const values = asset.toString('utf8').match(/^NeedHeroXP=([^\r\n]+)/m)[1].split(',').map(Number);
    assert.equal(values.length, 69);
    assert.deepEqual(values.slice(0, 4), [120, 280, 480, 720], 'Opening levels retain their existing kill requirements');
    for (let i = 1; i < values.length; i++) {
        assert(values[i] > values[i - 1]);
        if (i > 1) assert(values[i] - values[i - 1] > values[i - 1] - values[i - 2], 'Each later level costs more XP');
    }
    assert.equal(values[18], 28320); assert.equal(values[38], 135120); assert.equal(values[68], 445320);
    assert.equal(1 + values.filter(xp => xp <= 7950).length, 11, 'Old level-20 XP must no longer permit early multi-weapon completion');
    assert.equal(1 + values.filter(xp => xp <= 12000).length, 14, 'A strong first-stage kill count still leaves room for later growth');
    const source = map.read('war3mapMisc.txt');
    assert.deepEqual(installExperienceCurve(source, asset), source, 'Saved map must use the authoritative XP table');
    const old = Buffer.from(source.toString('utf8').replace(/^NeedHeroXP=[^\r\n]+/m,
        'NeedHeroXP=' + Array.from({length: 69}, (_, i) => (i + 1) * 120).join(',')));
    const upgraded = installExperienceCurve(old, asset);
    const withoutCurve = bytes => bytes.toString('utf8').replace(/^NeedHeroXP=[^\r\n]+/m, 'NeedHeroXP=');
    assert.equal(withoutCurve(upgraded), withoutCurve(old), 'Only the XP table may change');
    assert.deepEqual(installExperienceCurve(upgraded, asset), upgraded);
    for (const invalid of [asset.toString('utf8').replace('120,280', '120,120'),
        asset.toString('utf8').replace('120,280', '120,1.5'),
        asset.toString('utf8').replace('MaxHeroLevel=70', 'MaxHeroLevel=69'),
        asset.toString('utf8') + '\nNeedHeroXP=120\n'])
        assert.throws(() => installExperienceCurve(source, Buffer.from(invalid)));
    console.log('PASS experience curve opening pace, all 69 thresholds, saved map, single-field migration and malformed-table guards');
}

// Prepare the exact resized archive in memory: these checks never publish a map.
const baseBytes = fs.readFileSync(baseMapPath);
const baseMap = openMap(baseBytes), baseTerrain = terrainInfo(baseMap.read('war3map.w3e'));
const baseMetadata = mapInfo(baseMap.read('war3map.w3i'));
// Build player records independently of mapInfo: v39 inserts RaceHud before Flags.
const baseInfoBytes = baseMap.read('war3map.w3i');
if (baseMetadata.version === 39) {
    const firstPlayer = baseMetadata.players[0].offset;
    const fixturePlayer = (id, controller, race, raceHud, flags, name, x, y) => {
        const record = Buffer.alloc(20);
        [id, controller, race, raceHud, flags].forEach((value, index) => record.writeInt32LE(value, index * 4));
        const positionAndMasks = Buffer.alloc(24);
        positionAndMasks.writeFloatLE(x, 0); positionAndMasks.writeFloatLE(y, 4);
        return Buffer.concat([record, Buffer.from(name + '\0'), positionAndMasks]);
    };
    const prefix = Buffer.from(baseInfoBytes.subarray(0, firstPlayer));
    prefix.writeInt32LE(2, prefix.length - 4);
    const firstRecord = fixturePlayer(0, 1, 3, 64, 3, 'Anya', -7616, 7040);
    const secondRecord = fixturePlayer(1, 2, 4, 65, 17, 'Second player', 12.5, -1401.25);
    const fixture = Buffer.concat([prefix, firstRecord, secondRecord]);
    const parsed = mapInfo(fixture);
    assert.deepEqual(parsed.players.map(({id, controller, race, raceHud, flags, name, x, y}) =>
        ({id, controller, race, raceHud, flags, name, x, y})), [
        {id: 0, controller: 1, race: 3, raceHud: 64, flags: 3, name: 'Anya', x: -7616, y: 7040},
        {id: 1, controller: 2, race: 4, raceHud: 65, flags: 17, name: 'Second player', x: 12.5, y: -1401.25},
    ]);
    assert.equal(parsed.players[0].flagsOffset, firstPlayer + 16);
    assert.equal(parsed.players[1].offset, firstPlayer + firstRecord.length);
    const playerNameEnd = baseInfoBytes.indexOf(0, firstPlayer + 20);
    assert.equal(baseMetadata.players[0].flags, baseInfoBytes.readInt32LE(firstPlayer + 16));
    assert.equal(baseMetadata.players[0].raceHud, baseInfoBytes.readInt32LE(firstPlayer + 12));
    assert.equal(baseMetadata.players[0].name, baseInfoBytes.toString('utf8', firstPlayer + 20, playerNameEnd));
    const nativeStart = baseMap.read('war3map.lua').toString('utf8')
        .match(/DefineStartLocation\(0,\s*([-\d.]+),\s*([-\d.]+)\)/);
    assert(nativeStart, 'Independent native script start location is required');
    assert.deepEqual([baseInfoBytes.readFloatLE(playerNameEnd + 1), baseInfoBytes.readFloatLE(playerNameEnd + 5)],
        nativeStart.slice(1).map(Number));
    assert.deepEqual([baseMetadata.players[0].x, baseMetadata.players[0].y], nativeStart.slice(1).map(Number));
    assert.throws(() => mapInfo(fixture.subarray(0, firstPlayer + firstRecord.length + 10)),
        'Truncated second-player records must not be accepted');
    console.log('PASS independent W3I v39 two-player records, RaceHud, flags, names, native coordinates and truncation');
}
const refreshed = refreshBase(original, baseBytes, bundle), refreshedMap = openMap(refreshed.patched);
assert.deepEqual(terrainInfo(refreshedMap.read('war3map.w3e')), baseTerrain);
assert.deepEqual(refreshed.playable, {width: baseMetadata.width, height: baseMetadata.height});
for (const name of ['war3map.w3e', 'war3map.wpm', 'war3map.shd', 'war3map.mmp', 'war3map.doo',
    'war3mapUnits.doo', 'war3mapMap.blp', 'war3map.w3c', 'war3map.w3r', 'war3map.wtg']) {
    assert.deepEqual(refreshedMap.read(name), baseMap.read(name), 'Base geography must match byte for byte: ' + name);
}
assert.deepEqual(refreshedMap.read('war3map.wts').subarray(0, baseMap.read('war3map.wts').length), baseMap.read('war3map.wts'),
    'Every authored base string byte must survive; only missing protected strings may be appended');
for (const name of ['war3map.w3a', 'war3map.w3t', 'war3map.w3u', 'war3mapMisc.txt',
    'war3mapSkin.w3a', 'war3mapSkin.w3t', 'war3mapSkin.w3u', 'CustomTooltip.fdf', 'CustomTooltip.toc']) {
    assert.deepEqual(refreshedMap.read(name), map.read(name), 'Test gameplay asset must survive: ' + name);
}
const mergedMetadata = mapInfo(refreshedMap.read('war3map.w3i'));
assert.equal(mergedMetadata.players[0].race, 3);
assert.equal(mergedMetadata.flags & 0x20, 0x20, 'Fixed player settings must survive');
assert.deepEqual([mergedMetadata.players[0].x, mergedMetadata.players[0].y],
    [baseMetadata.players[0].x, baseMetadata.players[0].y]);
const nativeMarker = '-- ===== END src/00_bootstrap/AnyasLongNight.lua =====';
const native = refreshed.script.slice(refreshed.script.indexOf(nativeMarker) + nativeMarker.length).trim();
const expectedNative = baseMap.read('war3map.lua').toString('utf8')
    .replace(/SetPlayerRacePreference\(Player\(0\), RACE_PREF_\w+\)/, 'SetPlayerRacePreference(Player(0), RACE_PREF_UNDEAD)')
    .replace(/SetPlayerRaceSkin\(Player\(0\), RACE_PREF_\w+\)/, 'SetPlayerRaceSkin(Player(0), RACE_PREF_UNDEAD)')
    .replace(/SetPlayerRaceSelectable\(Player\(0\), (?:true|false)\)/, 'SetPlayerRaceSelectable(Player(0), false)');
// A base with an older bundle is also accepted; compare its native body after the same marker.
assert.equal(native, (expectedNative.includes(nativeMarker)
    ? expectedNative.slice(expectedNative.indexOf(nativeMarker) + nativeMarker.length) : expectedNative).trim());
assert(refreshedMap.read('war3map.wct').includes(Buffer.from(bundle.trimEnd())), 'Editor globals must receive current source');
const repeatedRefresh = refreshBase(refreshed.patched, baseBytes, bundle);
for (const name of refreshed.entries) assert.deepEqual(openMap(repeatedRefresh.patched).read(name), refreshedMap.read(name),
    'Repeated base refresh must not change content: ' + name);
const terrainWithMissingSnow = Buffer.from(baseMap.read('war3map.w3e'));
const snowOffset = terrainWithMissingSnow.indexOf(Buffer.from('Nsnw')); assert(snowOffset >= 0);
terrainWithMissingSnow.write('Ldrt', snowOffset, 'ascii');
assert.throws(() => refreshBase(original, baseMap.replace(new Map([['war3map.w3e', terrainWithMissingSnow]])), bundle),
    /palette lost Nsnw/, 'A missing stage tile must block refresh instead of silently reverting snow to dirt');
const badPathing = Buffer.from(baseMap.read('war3map.wpm')); badPathing.writeInt32LE(1, 8);
assert.throws(() => refreshBase(original, baseMap.replace(new Map([['war3map.wpm', badPathing]])), bundle),
    /AssertionError/, 'Terrain/pathing mismatch must be refused');
const selectableBaseInfo = Buffer.from(baseMap.read('war3map.w3i'));
selectableBaseInfo.writeInt32LE(baseMetadata.players[0].flags | 3, baseMetadata.players[0].flagsOffset);
const selectableRefresh = refreshBase(original, baseMap.replace(new Map([['war3map.w3i', selectableBaseInfo]])), bundle);
const fixedFlags = mapInfo(openMap(selectableRefresh.patched).read('war3map.w3i')).players[0].flags;
assert.equal(fixedFlags & 1, 1, 'Fixed start-position geography follows the new base');
assert.equal(fixedFlags & 2, 0, 'Undead race stays non-selectable');
if (baseMetadata.version === 39) {
    const playerOffset = baseMetadata.players[0].offset;
    const refreshedBytes = openMap(selectableRefresh.patched).read('war3map.w3i');
    assert.equal(refreshedBytes.readInt32LE(playerOffset + 16) & 3, 1,
        'Independent v39 flags bytes preserve fixed start and remove selectable race');
    assert.deepEqual(refreshedBytes.subarray(playerOffset + 12, playerOffset + 16),
        baseInfoBytes.subarray(playerOffset + 12, playerOffset + 16), 'RaceHud must never be edited as flags');
}
const strings = baseMap.read('war3map.wts').toString('utf8');
const referencedIds = new Set(['war3map.w3a', 'war3map.w3t', 'war3map.w3u', 'war3mapSkin.w3a', 'war3mapSkin.w3t', 'war3mapSkin.w3u']
    .flatMap(name => [...(map.read(name)?.toString('utf8') ?? '').matchAll(/TRIGSTR_(\d+)/g)].map(match => Number(match[1]))));
const protectedEntry = [...strings.matchAll(/^(STRING (\d+)\r?\n(?:\/\/[^\r\n]*\r?\n)*\{\r?\n)([\s\S]*?)(\r?\n\})/gm)]
    .find(match => referencedIds.has(Number(match[2])));
assert(protectedEntry, 'Map has an ability/unit string for collision verification');
const conflictingStrings = Buffer.from(strings.replace(protectedEntry[0], protectedEntry[1] + 'Incorrect preserved unit name' + protectedEntry[4]));
assert.throws(() => refreshBase(original, baseMap.replace(new Map([['war3map.wts', conflictingStrings]])), bundle),
    new RegExp('string conflicts.*TRIGSTR_' + Number(protectedEntry[2]) + '(?!\\d)'),
    'New metadata strings must never silently corrupt preserved gameplay objects');
{
    const readStrings = bytes => new Map([...bytes.toString('utf8').replaceAll('\r\n', '\n')
        .matchAll(/^STRING (\d+)\n(?:\/\/[^\n]*\n|[ \t]*\n)*\{\n([\s\S]*?)\n\}/gm)]
        .map(match => [Number(match[1]), match[2]]));
    const protectedId = Number(protectedEntry[2]), oldStrings = readStrings(map.read('war3map.wts'));
    const withOrphan = map.replace(new Map([['war3map.wts', Buffer.concat([map.read('war3map.wts'),
        Buffer.from('\nSTRING 90000\n{\nunused test-only text\n}\n')])]]));
    for (const newline of ['\n', '\r\n']) {
        const missing = Buffer.from(strings.replace(protectedEntry[0], '').replaceAll('\r\n', '\n').replaceAll('\n', newline));
        const baseWithoutString = baseMap.replace(new Map([['war3map.wts', missing]]));
        const result = refreshBase(withOrphan, baseWithoutString, bundle);
        const output = openMap(result.patched).read('war3map.wts'), values = readStrings(removeGoldStrings(output));
        assert.deepEqual(output.subarray(0, missing.length), missing, 'All existing source bytes survive string retention');
        assert.equal(values.get(protectedId), oldStrings.get(protectedId), 'A deleted protected value comes from its preserved object data');
        assert(!values.has(90000), 'Unused test strings must not be imported into the base refresh');
        for (const id of referencedIds) assert.equal(values.get(id), oldStrings.get(id));
        const repeat = refreshBase(result.patched, baseWithoutString, bundle);
        assert.deepEqual(openMap(repeat.patched).read('war3map.wts'), output, 'Retained strings are deterministic and never duplicate');
    }
    const missingFromTest = map.read('war3map.wts').toString('utf8').replace(
        new RegExp('^STRING ' + protectedId + '\\r?\\n(?:\\/\\/[^\\r\\n]*\\r?\\n)*\\{\\r?\\n[\\s\\S]*?\\r?\\n\\}\\r?\\n?', 'm'), '');
    assert.throws(() => refreshBase(map.replace(new Map([['war3map.wts', Buffer.from(missingFromTest)]])), baseBytes, bundle),
        /Preserved gameplay object references a missing string/, 'Invalid existing test references cannot be silently repaired');
    console.log('PASS base string deletion retains only referenced gameplay text, source bytes, LF/CRLF, idempotence and collision guards');
}
assert.deepEqual(fs.readFileSync(baseMapPath), baseBytes, 'Dry verification changed original');
assert.deepEqual(fs.readFileSync(testMapPath), original, 'Dry verification published output');
console.log(`PASS resized-base refresh (${baseTerrain.width - 1}x${baseTerrain.height - 1} cells), native geography, undead rules, editor source, ${refreshed.preserved} gameplay entries and palette/pathing guards`);

const unitEntries = new Map();
const unitAssetSnapshots = new Map();
for (const [name, skin] of [['war3map.w3u', false], ['war3mapSkin.w3u', true]]) {
    const before = map.read(name), assetBefore = fs.readFileSync(path.join(root, 'assets', name));
    unitAssetSnapshots.set(name, assetBefore);
    const output = installPortraitUnits(before, skin, {migrateLegacyAnya: true, migrateLegacyArmor: true, migrateLegacyUpgrades: true}), data = parseUnits(output);
    assert.deepEqual(serializeUnits(parseUnits(before)), before, 'Existing unit fields must round-trip byte for byte');
    assert.deepEqual(installPortraitUnits(output, skin), output, 'Portrait installation must be idempotent');
    assert.deepEqual(installPortraitUnits(assetBefore, skin, {migrateLegacyAnya: true, migrateLegacyArmor: true, migrateLegacyUpgrades: true}), output,
        'Asset source and archive receive identical portrait definitions and migrations');
    for (const unit of portraitUnits) {
        const row = data.tables[1].find(row => row.newId === unit.id);
        assert(row && row.oldId === 'hfoo' && /^[a-z]/.test(unit.id), 'Portrait proxy must be a lowercase non-hero custom unit');
        if (skin) assert.equal(row.fields.find(field => field.id === 'umdl').value, unit.model,
            'The native unit model must be the actual speaker, including Putress');
        else {
            assert.equal(row.fields.find(field => field.id === 'ucol').value, 0, 'Portrait units must not block gameplay movement');
            const armor = row.fields.find(field => field.id === 'udty');
            assert(armor && armor.type === 3 && armor.value === 'hero', 'Both speakers must display Hero armor without becoming actual heroes');
        }
        assert(!row.fields.some(field => field.id === 'upat'), 'Do not mistake a pathing texture field for a portrait override');
    }
    const conflicting = parseUnits(output), row = conflicting.tables[1].find(row => row.newId === 'hsPP');
    const field = row.fields.find(field => field.id === (skin ? 'umdl' : 'ucol'));
    delete row.raw; delete field.raw; field.value = skin ? 'FallbackWrongSpeaker.mdl' : 100;
    assert.throws(() => installPortraitUnits(serializeUnits(conflicting), skin, {migrateLegacyAnya: true, migrateLegacyArmor: true, migrateLegacyUpgrades: true}), /conflicting fields/,
        'Existing conflicting proxy data must not be silently overwritten');
    unitEntries.set(name, output);
}
const portraitMapBytes = map.replace(unitEntries), portraitMap = openMap(portraitMapBytes);
validatePortraitObjects(portraitMap, bundle);
verifyPreserved(original, portraitMapBytes, [...unitEntries.keys()]);
const missingUnits = new Map([...unitEntries].map(([name, bytes]) => {
    const data = parseUnits(bytes);
    data.tables[1] = data.tables[1].filter(row => !portraitUnits.some(unit => unit.id === row.newId));
    return [name, serializeUnits(data)];
}));
assert.throws(() => validatePortraitObjects(openMap(map.replace(missingUnits)), bundle), /--portrait-objects/,
    'Ordinary builds must reject a story bundle whose native portrait objects are not installed');
const oldAnyaModel = 'Units\\Creeps\\BansheeRanger\\BansheeRanger.mdl';
const newAnyaModel = 'Units\\Forsaken\\HeroAnya\\HeroAnya.mdl';
assert.equal(portraitUnits.find(unit => unit.id === 'hsPA').model, newAnyaModel);
const oldSkin = parseUnits(unitEntries.get('war3mapSkin.w3u'));
const oldAnya = oldSkin.tables[1].find(row => row.newId === 'hsPA');
const oldModelField = oldAnya.fields.find(field => field.id === 'umdl');
delete oldAnya.raw; delete oldModelField.raw; oldModelField.value = oldAnyaModel;
oldAnya.fields.push({id: 'usca', type: 2, value: 1.125, endId: 'hsPA'});
const legacySkin = serializeUnits(oldSkin), legacyObjects = new Map(unitEntries);
legacyObjects.set('war3mapSkin.w3u', legacySkin);
assert.throws(() => installPortraitUnits(legacySkin, true), /--portrait-objects/,
    'An installed old model requires an explicit migration option');
assert.throws(() => validatePortraitObjects(openMap(map.replace(legacyObjects)), bundle), /--portrait-objects/,
    'Ordinary Lua-only builds must not accept the old portrait as current');
const migratedSkin = installPortraitUnits(legacySkin, true, {migrateLegacyAnya: true});
assert.deepEqual(installPortraitUnits(migratedSkin, true), migratedSkin, 'Migration is idempotent without the legacy option');
const legacyData = parseUnits(legacySkin), migratedData = parseUnits(migratedSkin);
let changedFields = 0;
for (const [table, rows] of legacyData.tables.entries()) {
    assert.equal(migratedData.tables[table].length, rows.length, 'Migration never adds or removes existing records');
    for (const [index, row] of rows.entries()) {
        const after = migratedData.tables[table][index];
        if (row.newId !== 'hsPA') assert.deepEqual(after.raw, row.raw, 'Migration rewrote another record, including Uany or hsPP');
        else {
            const header = value => value.raw.subarray(0, value.raw.length - value.fields.reduce((sum, field) => sum + field.raw.length, 0));
            assert.deepEqual(header(after), header(row), 'Migration preserves the portrait record header');
            assert.equal(after.fields.length, row.fields.length);
            for (const [i, field] of row.fields.entries()) {
                if (field.id !== 'umdl') assert.deepEqual(after.fields[i].raw, field.raw, 'Migration rewrote an unrelated hsPA field');
                else { assert.equal(after.fields[i].value, newAnyaModel); changedFields++; }
            }
        }
    }
}
assert.equal(changedFields, 1, 'Change only the single hsPA model field');
const migratedObjects = new Map(legacyObjects); migratedObjects.set('war3mapSkin.w3u', migratedSkin);
const migratedMapBytes = map.replace(migratedObjects), migratedMap = openMap(migratedMapBytes);
assert.deepEqual(migratedMap.read('war3mapSkin.w3u'), migratedSkin, 'MPQ readback retains the exact surgical model migration');
validatePortraitObjects(migratedMap, bundle);
verifyPreserved(original, migratedMapBytes, [...migratedObjects.keys()]);
const wrongAnya = parseUnits(legacySkin), wrongRow = wrongAnya.tables[1].find(row => row.newId === 'hsPA');
const wrongField = wrongRow.fields.find(field => field.id === 'umdl');
delete wrongRow.raw; delete wrongField.raw; wrongField.value = 'UnexpectedReplacement.mdl';
assert.throws(() => installPortraitUnits(serializeUnits(wrongAnya), true, {migrateLegacyAnya: true}), /conflicting fields/,
    'Explicit installation only permits the known BansheeRanger-to-HeroAnya migration');
assert.deepEqual(fs.readFileSync(baseMapPath), baseBytes, 'Portrait preparation changed original');
assert.deepEqual(fs.readFileSync(testMapPath), original, 'Portrait preparation published a map');
for (const [name, bytes] of unitAssetSnapshots) assert.deepEqual(fs.readFileSync(path.join(root, 'assets', name)), bytes,
    'Portrait dry preparation must not write its asset source');
console.log('PASS native portrait unit definitions, real speaker models, byte-preserved rows, assets, idempotence and missing-object guard');
console.log('PASS explicit Anya model migration, single-field changes, unrelated records, legacy guard, MPQ readback and conflict refusal');

{
    for (const skin of [false, true]) {
        const beforeData = parseUnits(unitEntries.get(skin ? 'war3mapSkin.w3u' : 'war3map.w3u'));
        for (const id of ['hsPA', 'hsPP']) {
            const row = beforeData.tables[1].find(row => row.newId === id);
            delete row.raw;
            row.fields = row.fields.filter(field => field.id !== 'upgr');
            if (id === 'hsPP' || skin) row.fields.push({id: 'upgr', type: 3, value: 'Rguv', endId: id});
        }
        const before = serializeUnits(beforeData);
        assert.throws(() => installPortraitUnits(before, skin), /--portrait-objects/);
        const after = installPortraitUnits(before, skin, {migrateLegacyUpgrades: true});
        const result = parseUnits(after);
        for (const [table, rows] of parseUnits(before).tables.entries()) for (const row of rows) {
            const next = result.tables[table].find(value => value.oldId === row.oldId && value.newId === row.newId);
            if (!['hsPA', 'hsPP'].includes(row.newId)) assert.deepEqual(next.raw, row.raw);
            else {
                const upgrades = next.fields.filter(field => field.id === 'upgr');
                assert.equal(upgrades.length, 1); assert.equal(upgrades[0].type, 3); assert.equal(upgrades[0].value, '');
                assert.equal(next.fields.length, row.fields.length + (row.fields.some(field => field.id === 'upgr') ? 0 : 1));
                for (const field of row.fields.filter(field => field.id !== 'upgr'))
                    assert.deepEqual(next.fields.find(value => value.id === field.id).raw, field.raw);
            }
        }
        assert.deepEqual(installPortraitUnits(after, skin), after);
    }
    console.log('PASS portrait inherited/explicit Rguv removal, skin overrides, unrelated fields, gameplay units and idempotence');
}

{
    const legacy = parseUnits(unitEntries.get('war3map.w3u'));
    const anya = legacy.tables[1].find(row => row.newId === 'hsPA'), putress = legacy.tables[1].find(row => row.newId === 'hsPP');
    delete anya.raw; anya.fields = anya.fields.filter(field => field.id !== 'udty');
    const armor = putress.fields.find(field => field.id === 'udty');
    delete putress.raw; delete armor.raw; armor.value = 'normal';
    const before = serializeUnits(legacy);
    assert.throws(() => installPortraitUnits(before), /--portrait-objects/, 'Old speaker armor requires explicit migration');
    const output = installPortraitUnits(before, false, {migrateLegacyArmor: true}), data = parseUnits(output);
    for (const [table, rows] of parseUnits(before).tables.entries()) for (const row of rows) {
        const after = data.tables[table].find(value => value.oldId === row.oldId && value.newId === row.newId);
        if (!['hsPA','hsPP'].includes(row.newId)) assert.deepEqual(after.raw, row.raw, 'Speaker armor migration changed Uany or another unit');
        else {
            const owned = after.fields.filter(field => field.id === 'udty');
            assert.equal(owned.length, 1); assert.equal(owned[0].type, 3); assert.equal(owned[0].value, 'hero');
            assert.equal(after.fields.length, row.fields.length + (row.newId === 'hsPA' ? 1 : 0));
            for (const field of row.fields.filter(value => value.id !== 'udty'))
                assert.deepEqual(after.fields.find(value => value.id === field.id).raw, field.raw, 'Speaker armor migration changed another field');
        }
    }
    assert.deepEqual(installPortraitUnits(output), output, 'Speaker Hero armor migration is idempotent');
    for (const [type, value] of [[3,'large'],[0,5]]) {
        const conflicting = parseUnits(output), row = conflicting.tables[1].find(row => row.newId === 'hsPA');
        const field = row.fields.find(field => field.id === 'udty');
        delete row.raw; delete field.raw; field.type = type; field.value = value;
        assert.throws(() => installPortraitUnits(serializeUnits(conflicting), false, {migrateLegacyArmor: true}), /conflicting fields/);
    }
    const skin = parseUnits(unitEntries.get('war3mapSkin.w3u')), row = skin.tables[1].find(value => value.newId === 'hsPP');
    delete row.raw; row.fields.push({id:'udty',type:3,value:'normal',endId:'hsPP'});
    const skinBefore = serializeUnits(skin);
    assert.throws(() => installPortraitUnits(skinBefore, true), /--portrait-objects/, 'A skin override must not mask Hero armor');
    const skinAfter = installPortraitUnits(skinBefore, true, {migrateLegacyArmor:true});
    assert.equal(parseUnits(skinAfter).tables[1].find(value => value.newId === 'hsPP').fields.find(value => value.id === 'udty').value, 'hero');
    console.log('PASS speaker Hero armor migration, inherited and skin overrides, explicit guard and gameplay unit preservation');
}

// Fixture codec only: inspect encrypted MPQ tables without relying on compact's
// readback verification. Fixtures remain in memory and never publish map files.
const fixtureCrypt = new Uint32Array(1280);
let fixtureSeed = 0x100001;
for (let low = 0; low < 256; low++) for (let high = 0; high < 5; high++) {
    fixtureSeed = (fixtureSeed * 125 + 3) % 0x2aaaab;
    const first = (fixtureSeed & 0xffff) << 16;
    fixtureSeed = (fixtureSeed * 125 + 3) % 0x2aaaab;
    fixtureCrypt[high * 256 + low] = (first | (fixtureSeed & 0xffff)) >>> 0;
}
function fixtureHash(name, type = 3) {
    let a = 0x7fed7fed, b = 0xeeeeeeee;
    for (const c of Buffer.from(name.replaceAll('/', '\\').toUpperCase(), 'ascii')) {
        a = (fixtureCrypt[type * 256 + c] ^ (a + b)) >>> 0;
        b = (c + a + b + (b << 5) + 3) >>> 0;
    }
    return a;
}
function fixtureTransform(input, key, encrypt = false) {
    const output = Buffer.from(input);
    let state = 0xeeeeeeee;
    for (let p = 0; p + 4 <= output.length; p += 4) {
        state = (state + fixtureCrypt[1024 + (key & 255)]) >>> 0;
        const word = output.readUInt32LE(p), transformed = (word ^ (key + state)) >>> 0;
        output.writeUInt32LE(transformed, p);
        key = (((~key << 21) + 0x11111111) | (key >>> 11)) >>> 0;
        state = ((encrypt ? word : transformed) + state + (state << 5) + 3) >>> 0;
    }
    return output;
}
function fixtureTables(bytes) {
    const offset = bytes.indexOf(Buffer.from([77, 80, 81, 26]));
    const hashStart = offset + bytes.readUInt32LE(offset + 16), blockStart = offset + bytes.readUInt32LE(offset + 20);
    const hashes = fixtureTransform(bytes.subarray(hashStart, hashStart + bytes.readUInt32LE(offset + 24) * 16), fixtureHash('(hash table)'));
    const blocks = fixtureTransform(bytes.subarray(blockStart, blockStart + bytes.readUInt32LE(offset + 28) * 16), fixtureHash('(block table)'));
    return {offset, hashStart, blockStart, hashes, blocks};
}
function fixtureBlockIndex(tables, name) {
    for (let p = 0; p < tables.hashes.length; p += 16) {
        if (tables.hashes.readUInt32LE(p) === fixtureHash(name, 1) &&
            tables.hashes.readUInt32LE(p + 4) === fixtureHash(name, 2)) return tables.hashes.readUInt32LE(p + 12);
    }
    throw new Error('Missing fixture block: ' + name);
}
const compactBytes = map.compact(), compactMap = openMap(compactBytes);
const beforeTables = fixtureTables(original), afterTables = fixtureTables(compactBytes);
assert(compactBytes.length <= original.length, 'Compaction cannot enlarge an already packed archive');
assert.strictEqual(compactMap.compact(), compactBytes, 'Repeated compaction is an exact no-op');
assert.strictEqual(map.replace(new Map()), original, 'No changes leave the archive buffer untouched');
assert.strictEqual(map.replace(new Map([['WAR3MAP.LUA', map.read('war3map.lua')]])), original,
    'Case-insensitive equal entries leave the archive untouched');
assert.deepEqual(compactBytes.subarray(0, beforeTables.offset), original.subarray(0, beforeTables.offset));
assert.deepEqual(afterTables.hashes, beforeTables.hashes, 'Hashes, locale/platform and block indices must survive compaction');
for (const name of new Set(['(listfile)', '(attributes)', ...map.read('(listfile)').toString('utf8').split(/\r?\n/).filter(Boolean)])) {
    assert.deepEqual(compactMap.read(name), map.read(name), 'Compaction changed decoded content: ' + name);
}
for (let p = 0; p < beforeTables.blocks.length; p += 16) {
    const flags = beforeTables.blocks.readUInt32LE(p + 12);
    if (!(flags & 0x80000000)) continue;
    assert.deepEqual(afterTables.blocks.subarray(p + 4, p + 16), beforeTables.blocks.subarray(p + 4, p + 16),
        'Packed length, decoded length and flags must stay unchanged');
}
const fixtureName = 'fixture/unnamed-compaction.dat', fixturePayload = Buffer.from('live content omitted from the listfile');
let anonymousBytes = map.replace(new Map([[fixtureName, fixturePayload]]));
anonymousBytes = openMap(anonymousBytes).replace(new Map([['(listfile)', map.read('(listfile)')]]));
assert(!openMap(anonymousBytes).read('(listfile)').includes(Buffer.from(fixtureName)));
assert.deepEqual(openMap(openMap(anonymousBytes).compact()).read(fixtureName), fixturePayload,
    'Compaction must preserve live blocks absent from the listfile');
const unreferencedBytes = Buffer.from(anonymousBytes), unreferencedTables = fixtureTables(anonymousBytes);
const fixtureIndex = fixtureBlockIndex(unreferencedTables, fixtureName);
for (let p = 0; p < unreferencedTables.hashes.length; p += 16) {
    if (unreferencedTables.hashes.readUInt32LE(p + 12) === fixtureIndex) unreferencedTables.hashes.writeUInt32LE(0xfffffffe, p + 12);
}
fixtureTransform(unreferencedTables.hashes, fixtureHash('(hash table)'), true).copy(unreferencedBytes, unreferencedTables.hashStart);
const unreferencedCompact = openMap(unreferencedBytes).compact(), unreferencedAfter = fixtureTables(unreferencedCompact);
const fixtureRow = fixtureIndex * 16, fixtureLength = unreferencedTables.blocks.readUInt32LE(fixtureRow + 4);
const fixtureFrom = unreferencedTables.offset + unreferencedTables.blocks.readUInt32LE(fixtureRow);
const fixtureTo = unreferencedAfter.offset + unreferencedAfter.blocks.readUInt32LE(fixtureRow);
assert.deepEqual(unreferencedCompact.subarray(fixtureTo, fixtureTo + fixtureLength),
    unreferencedBytes.subarray(fixtureFrom, fixtureFrom + fixtureLength), 'Even live blocks with no hash entry must survive');
const mixedBytes = map.replace(new Map([['war3map.lua', Buffer.from(old + '\n-- fixture change\n')],
    ['war3map.w3e', map.read('war3map.w3e')]]));
const mixedTables = fixtureTables(mixedBytes);
const terrainRow = fixtureBlockIndex(beforeTables, 'war3map.w3e') * 16;
// replace() compacts, so an unchanged entry may move; everything but its offset must survive.
assert.deepEqual(mixedTables.blocks.subarray(terrainRow + 4, terrainRow + 16), beforeTables.blocks.subarray(terrainRow + 4, terrainRow + 16),
    'An unchanged entry mixed with actual replacements must retain its block lengths and flags');
const terrainPayload = (bytes, tables) => {
    const start = tables.offset + tables.blocks.readUInt32LE(terrainRow);
    return bytes.subarray(start, start + tables.blocks.readUInt32LE(terrainRow + 4));
};
assert.deepEqual(terrainPayload(mixedBytes, mixedTables), terrainPayload(original, beforeTables),
    'An unchanged entry mixed with actual replacements must retain its exact packed payload');
const mixedCompactTables = fixtureTables(openMap(mixedBytes).compact());
let encryptedFixtureIndex = -1;
for (let p = 0; p < mixedTables.blocks.length; p += 16) {
    if ((mixedTables.blocks.readUInt32LE(p + 12) & 0x30000) === 0x30000 &&
        mixedTables.blocks.readUInt32LE(p) !== mixedCompactTables.blocks.readUInt32LE(p)) encryptedFixtureIndex = p / 16;
}
if (encryptedFixtureIndex >= 0) {
    const unknownKeyBytes = Buffer.from(mixedBytes), unknownHashes = Buffer.from(mixedTables.hashes);
    for (let p = 0; p < unknownHashes.length; p += 16) {
        if (unknownHashes.readUInt32LE(p + 12) === encryptedFixtureIndex) {
            unknownHashes.writeUInt32LE(0x12345678, p); unknownHashes.writeUInt32LE(0x87654321, p + 4);
        }
    }
    fixtureTransform(unknownHashes, fixtureHash('(hash table)'), true).copy(unknownKeyBytes, mixedTables.hashStart);
    assert.throws(() => openMap(unknownKeyBytes).compact(), /unknown or ambiguous key/,
        'Unknown FIX_KEY files must fail safely instead of relocating encrypted bytes');
    const crcBytes = Buffer.from(mixedBytes), crcBlocks = Buffer.from(mixedTables.blocks);
    const flagOffset = encryptedFixtureIndex * 16 + 12;
    crcBlocks.writeUInt32LE((crcBlocks.readUInt32LE(flagOffset) | 0x4000000) >>> 0, flagOffset);
    fixtureTransform(crcBlocks, fixtureHash('(block table)'), true).copy(crcBytes, mixedTables.blockStart);
    assert.throws(() => openMap(crcBytes).compact(), /CRC/,
        'Unsupported encrypted CRC layouts must not be published');
}
assert.deepEqual(fs.readFileSync(testMapPath), original);
assert.deepEqual(fs.readFileSync(baseMapPath), baseBytes);
console.log('PASS MPQ no-op patching, compaction, prefix/locale/attributes, unnamed live blocks and encrypted FIX_KEY safety');
{
    // Rebuild the pre-compaction failure: orphaned payload bytes left between live data and the tables.
    function withOrphan(bytes, junk) {
        const tables = fixtureTables(bytes), dataEnd = tables.hashStart - tables.offset;
        const result = Buffer.concat([bytes.subarray(0, tables.hashStart), junk, bytes.subarray(tables.hashStart)]);
        result.writeUInt32LE(result.length - tables.offset, tables.offset + 8);
        result.writeUInt32LE(dataEnd + junk.length, tables.offset + 16);
        result.writeUInt32LE(tables.blockStart - tables.offset + junk.length, tables.offset + 20);
        return result;
    }
    const clean = openMap(compactBytes), junk = Buffer.alloc(4099, 0x5a), dirty = withOrphan(compactBytes, junk);
    assert.equal(clean.unusedBytes(), 0, 'A compacted archive reports no unused bytes');
    assert.equal(openMap(dirty).unusedBytes(), junk.length, 'Orphaned payload bytes are reported exactly');
    assert.deepEqual(openMap(dirty).compact(), compactBytes, 'Compaction removes orphaned payload bytes');
    let patched = compactBytes;
    for (const suffix of ['-- first', '-- second', '-- third']) {
        patched = openMap(patched).replace(new Map([['war3map.lua', Buffer.from(map.read('war3map.lua').toString('utf8') + suffix)]]));
        assert.equal(openMap(patched).unusedBytes(), 0, 'replace() must never leave orphaned payloads: ' + suffix);
    }
    const replacedSizes = ['-- a', '-- b'].map(suffix => openMap(compactBytes).replace(new Map([['war3map.lua',
        Buffer.from(map.read('war3map.lua').toString('utf8') + suffix)]])).length);
    // Compressed sizes vary by a few bytes with content; an orphaned copy would add the whole script.
    assert(Math.abs(patched.length - replacedSizes[0]) < 64 && Math.abs(replacedSizes[0] - replacedSizes[1]) < 64,
        'Repeated patches keep the archive at a single-copy size');
    const {bundle} = collectSources({profile: 'playtest'});
    const synced = syncBase(dirty, bundle), syncedMap = openMap(synced.patched);
    assert.equal(synced.unusedBefore, junk.length, 'Base sync reports the unused bytes it removes');
    assert.equal(syncedMap.unusedBytes(), 0, 'Base sync always publishes a compacted archive');
    assert.deepEqual(syncBase(synced.patched, bundle).patched, synced.patched, 'Base sync is idempotent');
    assert.equal(syncBase(synced.patched, bundle).changed.length, 0, 'A synchronized base reports no stale entries');
    assert.equal(openMap(baseMapPath).unusedBytes(), 0, 'The editor base map must not carry unused archive bytes (run npm run sync:base)');
}
console.log('PASS MPQ replace/base sync never accumulate unused archive bytes and the base map is compact');
{
    let inflates = 0;
    const inflate = zlib.inflateSync;
    zlib.inflateSync = function(...args) { inflates++; return inflate.apply(this, args); };
    try {
        const cached = openMap(original), first = cached.read('war3map.lua'), expected = Buffer.from(first);
        const initialInflates = inflates;
        assert(initialInflates > 0, 'Use an actually compressed fixture');
        first.fill(0);
        for (let i = 0; i < 40; i++) assert.deepEqual(cached.read(i % 2 ? 'WAR3MAP.LUA' : 'war3map.lua'), expected);
        assert.equal(inflates, initialInflates, 'Repeat reads reuse decoded content instead of decompressing sectors again');
        assert.equal(cached.read('missing-cache-fixture'), null); assert.equal(cached.read('MISSING-CACHE-FIXTURE'), null);
        const toc = cached.read('war3mapImported/CustomTooltip.toc');
        assert.deepEqual(cached.read('WAR3MAPIMPORTED\\CUSTOMTOOLTIP.TOC'), toc, 'Slash and case variants share one entry');
        assert.deepEqual(fs.readFileSync(testMapPath), original,
            'Mutating a read result must not modify the archive');
        console.log('PASS MPQ decoded cache avoids repeated inflate and isolates mutable read buffers');
    } finally { zlib.inflateSync = inflate; }
    const duplicate = Buffer.from(original), hashes = Buffer.from(beforeTables.hashes);
    const existingIndex = fixtureBlockIndex(beforeTables, 'war3map.lua');
    let sourceSlot = -1, freeSlot = -1;
    for (let p = 0; p < hashes.length; p += 16) {
        if (hashes.readUInt32LE(p + 12) === existingIndex) sourceSlot = p;
        if (hashes.readUInt32LE(p + 12) >= 0xfffffffe) freeSlot = p;
    }
    assert(sourceSlot >= 0 && freeSlot >= 0);
    hashes.copy(hashes, freeSlot, sourceSlot, sourceSlot + 16);
    hashes.writeUInt16LE(1033, freeSlot + 8);
    fixtureTransform(hashes, fixtureHash('(hash table)'), true).copy(duplicate, beforeTables.hashStart);
    assert.throws(() => openMap(duplicate).read('war3map.lua'), /Multiple locale/,
        'The lookup cache must retain duplicate-locale refusal');
    console.log('PASS MPQ indexed lookup preserves duplicate-locale rejection');
}
{
    const asset=fs.readFileSync(path.join(root,'assets/war3map.w3u')),skinAsset=fs.readFileSync(path.join(root,'assets/war3mapSkin.w3u'));
    assert.deepEqual(installPutressHero(asset,false),asset,'Putress hero installation is idempotent');
    assert.deepEqual(installPutressHero(skinAsset,true),skinAsset);
    for(const [bytes,skin]of [[asset,false],[skinAsset,true]]) {
        const data=parseUnits(bytes);data.tables[1]=data.tables[1].filter(row=>row.newId!==putressHero.id);
        const installed=parseUnits(installPutressHero(serializeUnits(data),skin));
        const row=installed.tables[1].find(row=>row.newId===putressHero.id),anya=installed.tables[0].find(row=>row.oldId==='Uany');
        assert.equal(row.oldId,'Uany');
        if(skin)assert.deepEqual(row.fields.map(field=>[field.id,field.value]),[['umdl',putressHero.model],['unam','퓨트리스'],['uico',putressHero.icon],['upro','퓨트리스'],['usnd','']]);
        else {
            assert.deepEqual(row.fields.filter(field=>field.id!=='upra').map(field=>[field.id,field.value]),
                anya.fields.filter(field=>field.id!=='upra').map(field=>[field.id,field.value]),'Putress copies every Anya gameplay override');
            assert.deepEqual(row.fields.filter(field=>field.id==='upra').map(field=>[field.type,field.value]),[[3,'INT']],'Putress uses intelligence');
        }
    }
    const abilities=parseObjectData(fs.readFileSync(path.join(root,'assets/war3mapSkin.w3a')),'ability');
    for(const object of additionalWeaponObjects)assert.equal(abilities.tables[1].find(row=>row.newId===object.id).fields.find(field=>field.id==='aart').value,object.icon);
    assert.equal(parseObjectData(fs.readFileSync(path.join(root,'assets/war3map.w3a')),'ability').tables[1].filter(row=>weaponObjectPattern.test(row.newId)).length,weaponObjectCount);
    console.log('PASS Putress hero copies Anya overrides and all 28 weapon indicators carry their icons');
}
{
    const ids = mapPatchSteps.map(step => step.id);
    assert.equal(new Set(ids).size, ids.length, 'Map patch ids are unique');
    for (const step of mapPatchSteps) {
        assert.equal(typeof step.prepare, 'function', 'Every map patch prepares the test map: ' + step.id);
        assert(!step.base || typeof step.apply === 'function', 'A base patch needs apply: ' + step.id);
        assert(!(step.base && step.option), 'Optional migrations stay test-map only: ' + step.id);
    }
    console.log('PASS map patch registry: unique ids, base steps apply, optional migrations stay test-map only');
}
{
    const source = ['local a, b = 1, 2', 'do local c = 3 end', 'for i = 1, 2 do local d end',
        'local function f(x) local y, z end'].join('\n');
    const pressure = luaLocalPressure(luaparse.parse(source, {luaVersion: '5.3', locations: true}));
    const main = pressure.find(entry => entry.name === '(main chunk)'), f = pressure.find(entry => entry.name === 'f');
    // a, b + three numeric-for control locals + i + d; f counts its parameter and body locals.
    assert.equal(main.max, 7, 'Block, loop control and loop body locals are active together');
    assert.equal(f.max, 3, 'Parameters count as locals');
    const crowded = ['do', ...Array.from({length: luaLocalLimit + 1}, (_, i) => `local v${i} = ${i}`), 'end'].join('\n');
    assert(luaLocalPressure(luaparse.parse(crowded, {luaVersion: '5.3', locations: true}))[0].max > luaLocalLimit);
    console.log('PASS Lua local pressure counts block, loop and parameter locals against the 200-local limit');
}
