// Surgical reader/writer for Warcraft object data (w3u/w3t/w3a): untouched records keep their bytes.
import assert from 'node:assert/strict';

// Surgical object reader: untouched records and fields retain their exact raw bytes.
export function parseObjectData(bytes, kind = 'unit') {
    assert(['unit', 'item', 'ability'].includes(kind), 'Unsupported object kind: ' + kind);
    const hasLevels = kind === 'ability';
    assert(Buffer.isBuffer(bytes), 'Missing object data');
    let p = 0;
    const take = n => { assert(n >= 0 && p + n <= bytes.length, 'Truncated unit object data');
        const value = bytes.subarray(p, p + n); p += n; return value; };
    const integer = () => take(4).readInt32LE(0), id = () => take(4).toString('latin1');
    const count = minimum => { const value = integer();
        assert(value >= 0 && value <= Math.floor((bytes.length - p) / minimum), 'Invalid unit object count'); return value; };
    const version = integer(); assert([1, 2, 3].includes(version), 'Unsupported unit object version');
    const tables = [[], []], known = new Set();
    for (let table = 0; table < 2; table++) {
        const length = count(12);
        for (let index = 0; index < length; index++) {
            const start = p, oldId = id(), newId = id(), extra = [];
            assert(table === 0 ? newId === '\0\0\0\0' : newId !== '\0\0\0\0', 'Invalid unit object ID layout');
            const objectId = table === 0 ? oldId : newId;
            assert(!known.has(objectId), 'Duplicate unit object ID: ' + objectId); known.add(objectId);
            if (version === 3) { const length = count(4); for (let i = 0; i < length; i++) extra.push(integer()); }
            const fields = [], n = count(hasLevels ? 21 : 13);
            for (let i = 0; i < n; i++) {
                const fieldStart = p, fieldId = id(), type = integer();
                assert(type >= 0 && type <= 3, 'Invalid unit field type');
                const level = hasLevels ? integer() : 0, column = hasLevels ? integer() : 0;
                let value;
                if (type === 3) { const end = bytes.indexOf(0, p); assert(end >= p, 'Unterminated unit string');
                    value = take(end - p + 1).subarray(0, -1).toString('utf8'); }
                else value = type === 0 ? integer() : take(4).readFloatLE(0);
                const endId = id(); fields.push({id: fieldId, type, level, column, value, endId, raw: bytes.subarray(fieldStart, p)});
            }
            tables[table].push({oldId, newId, extra, fields, raw: bytes.subarray(start, p)});
        }
    }
    assert.equal(p, bytes.length, 'Trailing unit object data');
    return {version, kind, tables};
}
export function serializeObjectData(data) {
    const hasLevels = data.kind === 'ability';
    const integer = value => { const bytes = Buffer.alloc(4); bytes.writeInt32LE(value); return bytes; };
    const field = value => {
        if (value.raw) return value.raw;
        const bytes = value.type === 3 ? Buffer.from(value.value + '\0') : Buffer.alloc(4);
        if (value.type === 0) bytes.writeInt32LE(value.value);
        else if (value.type !== 3) bytes.writeFloatLE(value.value);
        return Buffer.concat([Buffer.from(value.id, 'latin1'), integer(value.type),
            ...(hasLevels ? [integer(value.level), integer(value.column)] : []), bytes, Buffer.from(value.endId, 'latin1')]);
    };
    return Buffer.concat([integer(data.version), ...data.tables.flatMap(table => [integer(table.length),
        ...table.map(row => row.raw ?? Buffer.concat([Buffer.from(row.oldId, 'latin1'), Buffer.from(row.newId, 'latin1'),
            ...(data.version === 3 ? [integer(row.extra.length), ...row.extra.map(integer)] : []),
            integer(row.fields.length), ...row.fields.map(field)]))])]);
}
export const parseUnits = bytes => parseObjectData(bytes, 'unit');
export const serializeUnits = data => serializeObjectData({...data, kind: 'unit'});
// These are gold/pawning fields only; mana, lumber, combat stats and item behaviour
// unrelated to trading are deliberately outside this migration.
export const goldObjectSpecs = {
    unit: ['ugol', 'ugor', 'ubba', 'ubdi', 'ubsi'],
    item: ['igol', 'ipaw', 'isel'],
    ability: ['Ndt1', 'Ntm1'], // Charge Gold and Lumber / Transmute, when present.
};
