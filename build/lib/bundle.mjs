// The combined Lua bundle: source order, syntax and local-budget checks, and script replacement.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import luaparse from 'luaparse';
import {openMap} from '../mpq.mjs';
import {firstMarker, lastMarker, root} from './project.mjs';
import {loadTalentCatalog, talentLua} from './catalog.mjs';

// Lua 5.3 allows at most 200 active locals per function (LUAI_MAXVARS). Every module's
// do-block lives in the bundle's main chunk, so a large module can stop the whole map
// from compiling. Numeric/generic for loops hold three hidden control locals.
export const luaLocalLimit = 200, luaLocalBudget = 150;
export function luaLocalPressure(ast) {
    const results = [];
    function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(visit); return; }
        if (node.type === 'FunctionDeclaration') { analyze(node); return; }
        for (const key of Object.keys(node)) if (key !== 'loc' && key !== 'range') visit(node[key]);
    }
    function analyze(fn) {
        const name = fn.identifier ? (fn.identifier.name ?? `${fn.identifier.base?.name}${fn.identifier.indexer}${fn.identifier.identifier?.name}`)
            : '(anonymous)';
        const entry = {name, line: fn.loc?.start.line ?? 0, max: fn.parameters?.length ?? 0};
        results.push(entry);
        block(fn.body, entry.max, entry);
    }
    function block(statements, active, entry) {
        for (const s of statements) {
            if (s.type === 'LocalStatement') { visit(s.init); active += s.variables.length; }
            else if (s.type === 'FunctionDeclaration' && s.isLocal) { active += 1; analyze(s); }
            else if (s.type === 'DoStatement') block(s.body, active, entry);
            else if (s.type === 'WhileStatement') { visit(s.condition); block(s.body, active, entry); }
            else if (s.type === 'RepeatStatement') { block(s.body, active, entry); visit(s.condition); }
            else if (s.type === 'IfStatement') for (const clause of s.clauses) { visit(clause.condition); block(clause.body, active, entry); }
            else if (s.type === 'ForNumericStatement') { visit([s.start, s.end, s.step]); block(s.body, active + 4, entry); }
            else if (s.type === 'ForGenericStatement') { visit(s.iterators); block(s.body, active + 3 + s.variables.length, entry); }
            else visit(s);
            entry.max = Math.max(entry.max, active);
        }
    }
    const main = {name: '(main chunk)', line: 1, max: 0};
    results.push(main);
    block(ast.body, 0, main);
    return results.sort((a, b) => b.max - a.max);
}
function checkLocalBudget(name, text) {
    const pressure = luaLocalPressure(luaparse.parse(text, {luaVersion: '5.3', locations: true}));
    for (const entry of pressure) {
        assert(entry.max <= luaLocalLimit, `${name}:${entry.line} ${entry.name} has ${entry.max} active locals (Lua limit ${luaLocalLimit})`);
    }
    return pressure.filter(entry => entry.max > luaLocalBudget).map(entry => `${name}:${entry.line} ${entry.name} ${entry.max}`);
}
export function collectSources({profile = 'playtest'} = {}) {
    assert(['development', 'playtest', 'release'].includes(profile), 'Invalid build profile');
    const orderPath = path.join(root, 'build/source-order.json');
    const orderBytes = fs.readFileSync(orderPath);
    const order = JSON.parse(orderBytes);
    assert.equal(new Set(order).size, order.length, 'Duplicate source');
    assert.equal(order.at(-1), 'src/00_bootstrap/AnyasLongNight.lua');
    const snapshots = new Map([[orderPath, orderBytes]]), crowded = [];
    const chunks = [firstMarker, `ANYAS_LONG_NIGHT_PROFILE = "${profile}"`,
        '-- Native objects/constants: assets/war3map.w3a, assets/war3map.w3t, assets/war3map.w3u, assets/war3mapMisc.txt.',
        talentLua(loadTalentCatalog(snapshots))];
    for (const name of order) {
        assert(/^src\/[\w/]+\.lua$/.test(name), 'Invalid source path: ' + name);
        const absolute = path.join(root, name), bytes = fs.readFileSync(absolute);
        snapshots.set(absolute, bytes);
        const text = bytes.toString('utf8').replaceAll('\r\n', '\n').trimEnd();
        // Vendor libraries are kept as published; only the hard limit applies to them.
        const pressure = checkLocalBudget(name, text);
        if (!name.startsWith('src/05_vendor/')) crowded.push(...pressure);
        chunks.push('-- ===== BEGIN ' + name + ' =====', text, '-- ===== END ' + name + ' =====', '');
    }
    const bundle = chunks.join('\n');
    luaparse.parse(bundle, {luaVersion: '5.3'});
    // Module do-blocks share the bundle's main chunk: enforce the hard limit there and
    // report any module function past the headroom budget.
    checkLocalBudget('bundle', bundle);
    if (crowded.length) console.warn(`Lua local budget (${luaLocalBudget}/${luaLocalLimit}) exceeded; split the module:`, crowded.join(', '));
    return {bundle, snapshots, count: order.length, profile};
}
export function replaceBundle(script, bundle) {
    const first = script.indexOf(firstMarker), last = script.indexOf(lastMarker);
    assert(first >= 0 && last > first, 'Input must contain a marked AnyasLongNight test bundle');
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
function stripBundle(script) {
    const first = script.indexOf(firstMarker);
    if (first < 0) return script;
    const last = script.indexOf(lastMarker);
    assert(last > first && script.indexOf(firstMarker, first + 1) < 0
        && script.indexOf(lastMarker, last + 1) < 0, 'Invalid base bundle markers');
    return script.slice(0, first) + script.slice(last + lastMarker.length);
}
export function refreshScript(script, bundle) {
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
