// Ordinary builds synchronize game/editor Lua; --refresh-base imports edited geography.
// The tooling lives in build/lib (project, catalog, bundle, object-data, map-info,
// object-patches, text-patches, map-patches, base-map, publish); this file is the CLI and
// re-exports their public functions for sync-base and the checks.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {openMap} from './mpq.mjs';
import {baseMapPath, digest, root} from './lib/project.mjs';
import {collectSources, editorBundle, replaceBundle, verifyPreserved} from './lib/bundle.mjs';
import {refreshBase} from './lib/base-map.mjs';
import {applyMapPatches} from './lib/map-patches.mjs';
import {validatePortraitObjects} from './lib/object-patches.mjs';
import {validateGoldRemoval} from './lib/text-patches.mjs';
import {publishTransaction} from './lib/publish.mjs';
export {root, baseMapPath, mapVersion} from './lib/project.mjs';
export {loadTalentCatalog, talentLua, ownedItemPattern, loadItemTooltipCatalog, loadWeaponTooltipCatalog, growthLevels, weaponObjectCount, itemObjectCount} from './lib/catalog.mjs';
export {luaLocalLimit, luaLocalBudget, luaLocalPressure, collectSources, replaceBundle, verifyPreserved, editorBundle} from './lib/bundle.mjs';
export {installGameInterfaceLabel, prepareUIResources, installInterfaceTooltip, cleanWeaponTooltipEntries, prepareWeaponTooltips, stripGoldTooltipText, cleanItemTooltipText, cleanItemTooltipEntries, prepareItemTooltipCleanup, removeGoldObjectData, removeGoldStrings, removeGoldMisc, prepareGoldRemoval, validateGoldRemoval, installExperienceCurve, installMapVersion} from './lib/text-patches.mjs';
export {parseObjectData, serializeObjectData, parseUnits, serializeUnits, goldObjectSpecs} from './lib/object-data.mjs';
export {bonusUnits, bonusItems, installBonusItems, prepareBonusItems, installBonusUnits, installEnemyCombatFields, prepareBonusUnits, statDetailRows, statDisplays, installStatDetails, prepareStatDetails, installNativeTalents, prepareNativeTalents, weaponObjectPattern, additionalWeaponObjects, armorTrinket, itemTemplates, installGrowthObjects, prepareGrowthObjects, installHeroRegeneration, putressHero, installPutressHero, validateStrengthRegeneration, prepareHeroRegeneration, portraitUnits, installPortraitUnits, validatePortraitObjects} from './lib/object-patches.mjs';
export {terrainInfo, mapInfo} from './lib/map-info.mjs';
export {mapPatchSteps, applyMapPatches} from './lib/map-patches.mjs';
export {refreshBase} from './lib/base-map.mjs';
export {publishTransaction} from './lib/publish.mjs';

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
    const steps = applyMapPatches(patched, snapshots, {portraits, removeGold, experience});
    const {companionAssets} = steps;
    patched = steps.patched;
    const portraitObjects = steps.entries.get('portrait objects'), goldRemoval = steps.entries.get('gold removal');
    // replace() already compacts its own output; this also drops orphaned data an unchanged input carried in.
    const compactStats = {beforeBytes: patched.length};
    patched = openMap(patched).compact();
    compactStats.afterBytes = patched.length;
    compactStats.removedBytes = compactStats.beforeBytes - patched.length;
    const preparedMap = openMap(patched);
    validatePortraitObjects(preparedMap, bundle);
    validateGoldRemoval(preparedMap);
    const changedEntries = [...new Set([...(refreshed?.entries ?? ['war3map.lua', 'war3map.wct']),
        ...[...steps.entries.values()].flatMap(entries => [...entries.keys()]),
        ...(map.read('(listfile)').equals(preparedMap.read('(listfile)')) ? [] : ['(listfile)'])])];
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
                    ...(portraitObjects ? {portraitObjects: [...portraitObjects.keys()]} : {}),
                    ...(goldRemoval ? {goldRemoval: [...goldRemoval.keys()]} : {}),
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
