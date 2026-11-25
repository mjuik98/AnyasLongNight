// Synchronize the editor base map's runtime Lua and WCT with the playtest sources.
// Every map patch marked base in build.mjs mapPatchSteps is applied too, in the same
// order as the test-map build; unrelated entries stay intact.
// Usage: npm run sync:base            (back up, patch, compact and publish)
//        npm run sync:base -- --check (report only; exit 1 if stale or carrying unused data)
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {openMap} from './mpq.mjs';
import {root, baseMapPath, collectSources, replaceBundle, editorBundle, verifyPreserved, publishTransaction,
    mapPatchSteps} from './build.mjs';

export function syncBase(base, bundle, snapshots = new Map()) {
    const map = openMap(base);
    const oldScript = map.read('war3map.lua');
    assert(oldScript, 'Base map has no Lua map script');
    const changes = new Map([
        ['war3map.lua', Buffer.from(replaceBundle(oldScript.toString('utf8'), bundle))],
        ['war3map.wct', editorBundle(map.read('war3map.wct'), bundle)],
    ]);
    const read = name => changes.get(name) ?? map.read(name);
    for (const step of mapPatchSteps.filter(step => step.base)) {
        for (const [name, bytes] of step.apply(read, map, snapshots)) changes.set(name, bytes);
    }
    // replace() leaves an already-current archive untouched, so compact explicitly as well.
    const patched = openMap(map.replace(changes)).compact();
    const preserved = verifyPreserved(base, patched, [...changes.keys(),
        ...(map.read('(listfile)').equals(openMap(patched).read('(listfile)')) ? [] : ['(listfile)'])]);
    const result = openMap(patched);
    for (const [name, bytes] of changes) assert.deepEqual(result.read(name), bytes, 'Base sync readback mismatch: ' + name);
    assert.equal(result.unusedBytes(), 0, 'Synchronized base map still carries unused archive bytes');
    const changed = [...changes].filter(([name, bytes]) => !map.read(name)?.equals(bytes)).map(([name]) => name);
    return {patched, preserved, changed, unusedBefore: map.unusedBytes()};
}

function main() {
    const args = process.argv.slice(2);
    for (const arg of args) assert(arg === '--check', 'Unknown option: ' + arg);
    const check = args.includes('--check');
    const {bundle, snapshots, count} = collectSources({profile: 'playtest'});
    const base = fs.readFileSync(baseMapPath);
    const {patched, preserved, changed, unusedBefore} = syncBase(base, bundle, snapshots);
    console.log(`Validated ${count} Lua sources; preserved ${preserved} unrelated base map entries.`);
    if (unusedBefore) console.log('Unused base archive bytes:', unusedBefore);
    if (check) {
        const current = !changed.length && !unusedBefore;
        console.log('Base map matches source and is compact:', current, changed.length ? changed : '');
        if (!current) process.exitCode = 1;
        return;
    }
    if (patched.equals(base)) {
        console.log('Base map already current; archive left unchanged:', baseMapPath);
        return;
    }
    const stamp = new Date().toISOString().replaceAll(':', '-');
    const backup = path.join(root, 'dist/backups', stamp + '-before-sync-base');
    fs.mkdirSync(backup, {recursive: true});
    fs.writeFileSync(path.join(backup, path.basename(baseMapPath)), base, {flag: 'wx'});
    const guard = () => {
        for (const [name, bytes] of snapshots) assert.deepEqual(fs.readFileSync(name), bytes, 'Source changed during sync: ' + name);
    };
    try { publishTransaction([{path: baseMapPath, bytes: patched, before: base}], {stamp, guard}); }
    catch (error) {
        if (['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) error.message += ' (close World Editor and retry)';
        throw error;
    }
    console.log(`Base map synchronized (${changed.join(', ') || 'compaction only'}): ${base.length} -> ${patched.length} bytes`);
    console.log('Backup:', backup);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
