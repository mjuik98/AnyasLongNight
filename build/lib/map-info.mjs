// Read-only views of terrain (w3e) and map info (w3i) headers.
import assert from 'node:assert/strict';

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
