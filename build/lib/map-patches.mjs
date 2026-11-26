// The ordered list of every tool-managed map patch and its application.
import {openMap} from '../mpq.mjs';
import {installBonusItems, installBonusUnits, installEnemyCombatFields, installGrowthObjects, prepareBonusItems, prepareBonusUnits, prepareGrowthObjects, prepareHeroRegeneration, prepareNativeTalents, preparePortraitObjects, prepareStatDetails} from './object-patches.mjs';
import {cleanItemTooltipEntries, cleanWeaponTooltipEntries, installMapVersion, prepareExperienceCurve, prepareGoldRemoval, prepareInterfaceTooltip, prepareItemTooltipCleanup, prepareUIResources, prepareWeaponTooltips} from './text-patches.mjs';
import {loadItemTooltipCatalog, loadWeaponTooltipCatalog} from './catalog.mjs';

const objectPair = (name, install) => read => new Map([[name, install(read(name), false)],
    [name.replace('war3map.', 'war3mapSkin.'), install(read(name.replace('war3map.', 'war3mapSkin.')), true)]]);
const readEntries = (read, names) => new Map(names.map(name => [name, read(name)]));
// Every tool-managed map patch, in application order.
// prepare(map, snapshots, preparedAssets, options): the test-map build applies the step and
//   checks that the assets/ snapshot (as patched by earlier steps) gives the same result;
//   it returns {entries, assets} for the map and the companion asset files.
// base: sync:base also applies the step to the editor map through apply(read, map, snapshots),
//   where read(name) returns the entry as patched by the earlier base steps.
// option: the build flag that enables a test-map-only step.
export const mapPatchSteps = [
    // Normalize new pickup rows before migrations compare assets with the input.
    // A locked primary can still lack the rows published with an alternate map.
    {id: 'bonus items', prepare: prepareBonusItems, base: true, apply: objectPair('war3map.w3t', installBonusItems)},
    {id: 'bonus props', prepare: prepareBonusUnits, base: true,
        apply: objectPair('war3map.w3u', (bytes, skin) => installEnemyCombatFields(installBonusUnits(bytes, skin)))},
    {id: 'portrait objects', option: 'portraits', prepare: preparePortraitObjects},
    {id: 'experience curve', prepare: prepareExperienceCurve},
    {id: 'gold removal', option: 'removeGold', prepare: prepareGoldRemoval},
    {id: 'growth objects', prepare: prepareGrowthObjects, base: true,
        apply: read => installGrowthObjects(readEntries(read, ['war3map.w3a', 'war3mapSkin.w3a', 'war3map.w3t', 'war3mapSkin.w3t']))},
    {id: 'item tooltips', prepare: prepareItemTooltipCleanup, base: true,
        apply: read => cleanItemTooltipEntries(readEntries(read, ['war3map.w3t', 'war3mapSkin.w3t', 'war3map.wts']), loadItemTooltipCatalog())},
    {id: 'UI resources', prepare: (map, snapshots) => ({entries: prepareUIResources(map, snapshots), assets: new Map()}),
        base: true, apply: (read, map, snapshots) => prepareUIResources(map, snapshots)},
    {id: 'interface tooltip', prepare: prepareInterfaceTooltip},
    {id: 'stat details', prepare: prepareStatDetails},
    {id: 'hero regeneration', prepare: prepareHeroRegeneration},
    {id: 'native talents', prepare: prepareNativeTalents},
    {id: 'weapon tooltips', prepare: prepareWeaponTooltips, base: true,
        apply: read => cleanWeaponTooltipEntries(readEntries(read, ['war3map.w3a', 'war3mapSkin.w3a', 'war3map.wts']), loadWeaponTooltipCatalog())},
    {id: 'map version', prepare: map => ({entries: new Map([['war3map.wts', installMapVersion(map.read('war3map.wts'), map.read('war3map.w3i'))]]),
        assets: new Map()}), base: true, apply: read => new Map([['war3map.wts', installMapVersion(read('war3map.wts'), read('war3map.w3i'))]])},
];
// Applies the enabled steps in order. Each step sees the assets already patched by the
// earlier steps; the last version of every touched asset is a companion file of the build.
export function applyMapPatches(patched, snapshots, options = {}) {
    const preparedAssets = new Map(), entries = new Map();
    for (const step of mapPatchSteps) {
        if (step.option && !options[step.option]) continue;
        const result = step.prepare(openMap(patched), snapshots, preparedAssets, options);
        patched = openMap(patched).replace(result.entries);
        for (const [asset, bytes] of result.assets) preparedAssets.set(asset, bytes);
        entries.set(step.id, result.entries);
    }
    return {patched, entries, companionAssets: preparedAssets};
}
