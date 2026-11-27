// Shared harness: test arguments, the Lua suite runner and the source lists suites load.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import fengari from 'fengari';
import {loadTalentCatalog, talentLua, root} from '../build.mjs';
export const testArgs = process.argv.slice(2);
assert(testArgs.length === 0 || testArgs.length === 2 && testArgs[0] === '--input', 'Usage: npm test -- --input <test-map>');
export const testMapPath = testArgs.length ? path.resolve(testArgs[1]) : path.join(root, 'dist/AnyasLongNight-playtest.w3x');
console.log('Verifying test map:', testMapPath);
export const {lua, lauxlib, lualib, to_luastring, to_jsstring} = fengari;
export const talentCatalog = loadTalentCatalog();
export function suite(name, before, files, after) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    try {
        for (const [label, source] of [['talents',talentLua(talentCatalog)],['mocks', before], ...files.flat().map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]), ['assertions', after]]) {
            let status = lauxlib.luaL_loadbuffer(L, to_luastring(source), null, to_luastring(label));
            if (status === lua.LUA_OK) status = lua.lua_pcall(L, 0, 0, 0);
            if (status !== lua.LUA_OK) throw new Error(name + ': ' + to_jsstring(lua.lua_tostring(L, -1)));
        }
        console.log('PASS', name);
    } finally { lua.lua_close(L); }
}

// Configuration and the shared runtime helpers every module uses.
export const config = ['src/00_bootstrap/SurvivorConfig.lua', 'src/00_bootstrap/SurvivorUtil.lua'];
export const metrics = 'src/20_system/SurvivorMetrics.lua';
export const augments = 'src/20_system/SurvivorAugments.lua';
export const combat = ['src/30_gameplay/SurvivorCombatStatus.lua', 'src/30_gameplay/SurvivorCombatSets.lua',
    'src/30_gameplay/SurvivorCombatHazards.lua', 'src/30_gameplay/SurvivorCombatSupplies.lua', 'src/30_gameplay/SurvivorCombatHero.lua',
    'src/30_gameplay/SurvivorCombatEnemies.lua', 'src/30_gameplay/SurvivorCombatWeapons.lua', 'src/30_gameplay/SurvivorCombat.lua'];
export const uiModules = ['src/30_gameplay/SurvivorScreenEffects.lua', 'src/30_gameplay/SurvivorNativeHUD.lua',
    'src/30_gameplay/SurvivorDamageBoard.lua', 'src/30_gameplay/SurvivorSpeech.lua',
    'src/30_gameplay/SurvivorNarrativeUI.lua', 'src/30_gameplay/SurvivorUI.lua'];

export const equipment = 'src/20_system/SurvivorEquipment.lua';
// The run lifecycle and the modules it splits out (setup choices, level rewards, chat commands).
export const lifecycle = ['src/30_gameplay/SurvivorSetup.lua', 'src/30_gameplay/SurvivorProgression.lua',
    'src/30_gameplay/SurvivorDebugCommands.lua', 'src/00_bootstrap/AnyasLongNight.lua'];
