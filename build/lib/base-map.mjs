// Importing edited geography from the editor map (--refresh-base).
import assert from 'node:assert/strict';
import {openMap} from '../mpq.mjs';
import {firstMarker} from './project.mjs';
import {mapInfo, terrainInfo} from './map-info.mjs';
import {cleanItemTooltipText, cleanTrinketTooltipText, stringTable, stripGoldTooltipText} from './text-patches.mjs';
import {parseObjectData} from './object-data.mjs';
import {editorBundle, refreshScript, verifyPreserved} from './bundle.mjs';

export function refreshBase(before, base, bundle) {
    const test = openMap(before), source = openMap(base), changes = new Map();
    assert(test.read('war3map.lua')?.toString('utf8').includes(firstMarker), 'Input must be a AnyasLongNight test map');
    const terrain = terrainInfo(source.read('war3map.w3e')), oldTerrain = terrainInfo(test.read('war3map.w3e'));
    for (const kind of ['ground', 'cliff']) for (const tile of oldTerrain[kind]) {
        assert(terrain[kind].includes(tile), 'Base terrain palette lost ' + tile + '; refusing a destructive refresh');
    }
    const baseInfo = source.read('war3map.w3i'), info = mapInfo(baseInfo), oldInfo = mapInfo(test.read('war3map.w3i'));
    assert.equal(info.players.length, 1, 'AnyasLongNight requires one base player');
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
