// Project-local copy of ../LoTKT/build/mpq.mjs, copied 2026-09-24.
// MPQ v0 support for updating entries and adding generated assets.
// Only zlib-compressed or uncompressed input entries are decoded.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';

const crypt = new Uint32Array(1280);
let seed = 0x100001;
for (let low = 0; low < 256; low++) {
    for (let high = 0; high < 5; high++) {
        seed = (seed * 125 + 3) % 0x2aaaab;
        const first = (seed & 0xffff) << 16;
        seed = (seed * 125 + 3) % 0x2aaaab;
        crypt[high * 256 + low] = (first | (seed & 0xffff)) >>> 0;
    }
}
function hash(name, type) {
    let a = 0x7fed7fed, b = 0xeeeeeeee;
    for (const c of Buffer.from(name.replaceAll('/', '\\').toUpperCase(), 'ascii')) {
        a = (crypt[type * 256 + c] ^ (a + b)) >>> 0;
        b = (c + a + b + (b << 5) + 3) >>> 0;
    }
    return a;
}

function transform(input, key, encrypt = false) {
    const bytes = Buffer.from(input);
    let state = 0xeeeeeeee;
    for (let i = 0; i + 4 <= bytes.length; i += 4) {
        state = (state + crypt[1024 + (key & 255)]) >>> 0;
        const inputWord = bytes.readUInt32LE(i);
        const outputWord = (inputWord ^ (key + state)) >>> 0;
        bytes.writeUInt32LE(outputWord, i);
        key = (((~key << 21) + 0x11111111) | (key >>> 11)) >>> 0;
        state = ((encrypt ? inputWord : outputWord) + state + (state << 5) + 3) >>> 0;
    }
    return bytes;
}

export function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

export function openMap(input) {
    const bytes = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
    const offset = bytes.indexOf(Buffer.from([77, 80, 81, 26]));
    assert(offset >= 0, 'MPQ header not found');
    const header = bytes.subarray(offset, offset + 32);
    assert.equal(header.length, 32, 'Truncated MPQ header');
    assert.equal(header.readUInt16LE(12), 0, 'Only MPQ v0 archives are supported');
    assert.equal(header.readUInt32LE(4), 32, 'Unsupported MPQ header size');
    const archiveEnd = offset + header.readUInt32LE(8);
    assert.equal(archiveEnd, bytes.length, 'Archive has a trailer/signature; refusing to modify it');
    const sectorSize = 512 * 2 ** header.readUInt16LE(14);
    const hashCount = header.readUInt32LE(24), blockCount = header.readUInt32LE(28);
    function table(field, count, name) {
        const start = offset + header.readUInt32LE(field);
        assert(start >= offset + 32 && start + count * 16 <= archiveEnd, 'Invalid MPQ table');
        return transform(bytes.subarray(start, start + count * 16), hash(name, 3));
    }
    const hashTable = table(16, hashCount, '(hash table)');
    const blockTable = table(20, blockCount, '(block table)');
    const hashMatches = new Map(), indicesByName = new Map(), decodedByName = new Map();
    const canonical = name => name.replaceAll('/', '\\').toUpperCase();
    for (let i = 0; i < hashCount; i++) {
        const p = i * 16, index = hashTable.readUInt32LE(p + 12);
        if (index >= blockCount) continue;
        const key = hashTable.readUInt32LE(p) + ':' + hashTable.readUInt32LE(p + 4);
        if (!hashMatches.has(key)) hashMatches.set(key, []);
        hashMatches.get(key).push(index);
    }

    function indexOf(name) {
        const key = canonical(name);
        if (indicesByName.has(key)) return indicesByName.get(key);
        const matches = hashMatches.get(hash(name, 1) + ':' + hash(name, 2)) ?? [];
        assert(matches.length <= 1, 'Multiple locale entries require explicit handling: ' + name);
        const index = matches[0] ?? -1;
        indicesByName.set(key, index);
        return index;
    }

    function decode(name) {
        const index = indexOf(name);
        if (index < 0) return null;
        const p = index * 16, start = blockTable.readUInt32LE(p);
        const packed = blockTable.readUInt32LE(p + 4), length = blockTable.readUInt32LE(p + 8);
        const flags = blockTable.readUInt32LE(p + 12);
        assert(flags & 0x80000000, 'Entry is not live: ' + name);
        assert.equal(flags & 0x100, 0, 'PKWARE compression is unsupported: ' + name);
        // Warcraft III ignores SINGLE_UNIT, unlike generic MPQ readers.
        // Accepting it here would let a self-readable but unplayable map pass validation.
        assert.equal(flags & 0x1000000, 0, 'Warcraft III does not support single-unit MPQ entries: ' + name);
        assert(offset + start + packed <= archiveEnd, 'Entry outside archive: ' + name);
        const data = bytes.subarray(offset + start, offset + start + packed);
        let key = hash(name.split(/[\\/]/).pop(), 3);
        if (flags & 0x20000) key = ((key + start) ^ length) >>> 0;
        function unpack(chunk, expected) {
            if (chunk.length === expected) return chunk;
            assert(flags & 0x200, 'Uncompressed length mismatch: ' + name);
            assert.equal(chunk[0], 2, 'Unsupported compression mask: ' + name);
            const result = zlib.inflateSync(chunk.subarray(1), { maxOutputLength: expected });
            assert.equal(result.length, expected);
            return result;
        }
        if (!(flags & 0x200)) {
            assert(!(flags & 0x10000), 'Encrypted raw sectors are unsupported');
            assert.equal(packed, length);
            return data;
        }
        const count = Math.ceil(length / sectorSize), tableSize = (count + 1) * 4;
        const sectors = flags & 0x10000 ? transform(data.subarray(0, tableSize), (key - 1) >>> 0) : data.subarray(0, tableSize);
        const chunks = [];
        for (let i = 0; i < count; i++) {
            const a = sectors.readUInt32LE(i * 4), b = sectors.readUInt32LE(i * 4 + 4);
            assert(a >= tableSize && b >= a && b <= data.length, 'Invalid sector offsets');
            let chunk = data.subarray(a, b);
            if (flags & 0x10000) chunk = transform(chunk, (key + i) >>> 0);
            chunks.push(unpack(chunk, Math.min(sectorSize, length - i * sectorSize)));
        }
        return Buffer.concat(chunks);
    }

    function read(name) {
        const key = canonical(name);
        if (!decodedByName.has(key)) {
            const decoded = decode(name);
            // Never expose an archive view or the cached decoded bytes to callers.
            decodedByName.set(key, decoded === null ? null : Buffer.from(decoded));
        }
        const decoded = decodedByName.get(key);
        return decoded === null ? null : Buffer.from(decoded);
    }

    function replace(entries) {
        assert.equal(indexOf('(signature)'), -1, 'Signed maps are not supported');
        const changes = new Map(entries);
        assert.equal(new Set([...changes.keys()].map(canonical)).size, changes.size, 'Duplicate MPQ paths');
        for (const [name, contents] of changes) {
            assert(name.length > 0 && !/[\0\r\n]/.test(name), 'Invalid MPQ entry name');
            assert.notEqual(canonical(name), '(ATTRIBUTES)', 'Attributes are updated automatically');
            assert(Buffer.isBuffer(contents), 'Replacement contents must be a Buffer');
            if (read(name)?.equals(contents)) changes.delete(name);
        }
        if (!changes.size) return bytes;
        const additions = [...changes.keys()].filter(name => indexOf(name) < 0);
        if (additions.length) {
            const list = changes.get('(listfile)') ?? read('(listfile)');
            assert(list, 'Adding assets requires an existing MPQ listfile');
            const names = list.toString('utf8').split(/\r?\n/).filter(Boolean);
            const known = new Set(names.map(canonical));
            for (const name of additions) {
                if (!known.has(canonical(name))) { names.push(name); known.add(canonical(name)); }
            }
            changes.set('(listfile)', Buffer.from(names.join('\r\n') + '\r\n'));
            if (read('(listfile)')?.equals(changes.get('(listfile)'))) changes.delete('(listfile)');
        }
        const hashes = Buffer.from(hashTable), indices = new Map();
        let nextBlock = blockCount;
        for (const name of changes.keys()) {
            let index = indexOf(name);
            if (index < 0) {
                let slot = -1;
                for (let step = 0; step < hashCount; step++) {
                    const p = ((hash(name, 0) + step) % hashCount) * 16;
                    if (hashes.readUInt32LE(p + 12) >= 0xfffffffe) { slot = p; break; }
                }
                assert(slot >= 0, 'MPQ hash table is full; cannot add ' + name);
                index = nextBlock++;
                hashes.writeUInt32LE(hash(name, 1), slot);
                hashes.writeUInt32LE(hash(name, 2), slot + 4);
                hashes.writeUInt32LE(0, slot + 8); // Neutral locale/platform.
                hashes.writeUInt32LE(index, slot + 12);
            }
            indices.set(name, index);
        }
        const attributes = read('(attributes)');
        if (attributes) {
            assert.equal(attributes.readUInt32LE(0), 100, 'Unsupported attributes version');
            const flags = attributes.readUInt32LE(4);
            assert.equal(flags & ~7, 0, 'Unsupported attribute flags');
            const expected = 8 + blockCount * ((flags & 1 ? 4 : 0) + (flags & 2 ? 8 : 0) + (flags & 4 ? 16 : 0));
            assert.equal(attributes.length, expected, 'Unexpected attributes size');
            const updated = Buffer.alloc(8 + nextBlock * ((flags & 1 ? 4 : 0) + (flags & 2 ? 8 : 0) + (flags & 4 ? 16 : 0)));
            attributes.copy(updated, 0, 0, 8);
            let oldStart = 8, newStart = 8;
            for (const [flag, stride] of [[1, 4], [2, 8], [4, 16]]) {
                if (!(flags & flag)) continue;
                attributes.copy(updated, newStart, oldStart, oldStart + blockCount * stride);
                oldStart += blockCount * stride;
                newStart += nextBlock * stride;
            }
            for (const [name, contents] of changes) {
                const index = indices.get(name);
                if (flags & 1) updated.writeUInt32LE(crc32(contents), 8 + index * 4);
                // Preserve timestamps; builds are deterministic for the same inputs.
                if (flags & 4) {
                    const start = 8 + nextBlock * ((flags & 1 ? 4 : 0) + (flags & 2 ? 8 : 0));
                    createHash('md5').update(contents).digest().copy(updated, start + index * 16);
                }
            }
            changes.set('(attributes)', updated);
            indices.set('(attributes)', indexOf('(attributes)'));
        }
        const blocks = Buffer.alloc(nextBlock * 16), chunks = [Buffer.from(bytes)];
        blockTable.copy(blocks);
        let cursor = bytes.length;
        for (const [name, contents] of changes) {
            // W3X files require a sector offset table for compressed entries.
            const count = Math.ceil(contents.length / sectorSize);
            const sectors = Buffer.alloc((count + 1) * 4);
            const compressed = [sectors];
            let sectorOffset = sectors.length;
            for (let i = 0; i < count; i++) {
                sectors.writeUInt32LE(sectorOffset, i * 4);
                const raw = contents.subarray(i * sectorSize, (i + 1) * sectorSize);
                const packedSector = Buffer.concat([Buffer.from([2]), zlib.deflateSync(raw)]);
                const sector = packedSector.length < raw.length ? packedSector : raw;
                compressed.push(sector);
                sectorOffset += sector.length;
            }
            sectors.writeUInt32LE(sectorOffset, count * 4);
            const packed = Buffer.concat(compressed);
            const data = packed.length < contents.length ? packed : contents;
            const p = indices.get(name) * 16;
            blocks.writeUInt32LE(cursor - offset, p);
            blocks.writeUInt32LE(data.length, p + 4);
            blocks.writeUInt32LE(contents.length, p + 8);
            blocks.writeUInt32LE(data === packed ? 0x80000200 : 0x80000000, p + 12);
            chunks.push(data);
            cursor += data.length;
        }
        const hashOffset = cursor - offset;
        chunks.push(transform(hashes, hash('(hash table)', 3), true));
        cursor += hashes.length;
        const blockOffset = cursor - offset;
        chunks.push(transform(blocks, hash('(block table)', 3), true));
        cursor += blocks.length;
        assert(cursor - offset <= 0xffffffff, 'MPQ v0 size limit exceeded');
        const result = Buffer.concat(chunks);
        result.writeUInt32LE(cursor - offset, offset + 8);
        result.writeUInt32LE(hashOffset, offset + 16);
        result.writeUInt32LE(blockOffset, offset + 20);
        result.writeUInt32LE(nextBlock, offset + 28);
        const verified = openMap(result);
        for (const [name, contents] of changes) assert.deepEqual(verified.read(name), contents, 'MPQ readback mismatch: ' + name);
        const changedIndices = new Set([...changes.keys()].map(indexOf));
        for (let i = 0; i < blockCount; i++) {
            if (changedIndices.has(i)) continue;
            assert.deepEqual(blocks.subarray(i * 16, i * 16 + 16), blockTable.subarray(i * 16, i * 16 + 16));
        }
        return result;
    }

    function compact() {
        assert.equal(indexOf('(signature)'), -1, 'Signed maps are not supported');
        // Keep block indices, locales and attribute arrays intact. No filename inventory is
        // needed: even unnamed blocks and existing blocks without a hash entry survive.
        const blocks = Buffer.from(blockTable), chunks = [bytes.subarray(0, offset), Buffer.from(header)];
        for (let i = 0; i < hashCount; i++) {
            const index = hashTable.readUInt32LE(i * 16 + 12);
            if (index >= 0xfffffffe) continue;
            assert(index < blockCount, 'Invalid MPQ hash block index');
            assert(blockTable.readUInt32LE(index * 16 + 12) & 0x80000000, 'Hash references a deleted MPQ block');
        }
        const tables = [[header.readUInt32LE(16), hashCount * 16], [header.readUInt32LE(20), blockCount * 16]];
        let knownKeys;
        const movedEncrypted = new Map();
        function keyForBlock(index) {
            if (!knownKeys) {
                knownKeys = new Map();
                const list = read('(listfile)');
                const names = new Set(['(listfile)', '(attributes)', ...(list?.toString('utf8').split(/\r?\n/).filter(Boolean) ?? [])]);
                for (const name of names) {
                    const a = hash(name, 1), b = hash(name, 2), key = hash(name.split(/[\\/]/).pop(), 3);
                    for (const target of hashMatches.get(a + ':' + b) ?? []) {
                        if (!knownKeys.has(target)) knownKeys.set(target, new Map());
                        knownKeys.get(target).set(key, name);
                    }
                }
            }
            const matches = knownKeys.get(index);
            assert(matches?.size === 1, 'Cannot compact an encrypted FIX_KEY block with an unknown or ambiguous key: ' + index);
            return [...matches][0];
        }
        function rekey(payload, oldKey, newKey, length, flags) {
            // Compressed multi-sector files use key - 1 for the offset table and key + i
            // for sector i. Refuse layouts whose footer/raw encryption we cannot verify.
            assert((flags & 0x200) && !(flags & (0x100 | 0x1000000 | 0x4000000 | 0x100000)),
                'Cannot compact this encrypted FIX_KEY layout (raw, PKWARE, single-unit, CRC or patch sectors)');
            const count = Math.ceil(length / sectorSize), tableSize = (count + 1) * 4;
            assert(payload.length >= tableSize, 'Truncated encrypted FIX_KEY sector table');
            const sectors = transform(payload.subarray(0, tableSize), (oldKey - 1) >>> 0);
            assert.equal(sectors.readUInt32LE(0), tableSize, 'Unexpected encrypted FIX_KEY sector-table padding');
            assert.equal(sectors.readUInt32LE(count * 4), payload.length, 'Unexpected encrypted FIX_KEY footer');
            const output = Buffer.from(payload);
            transform(sectors, (newKey - 1) >>> 0, true).copy(output);
            for (let i = 0; i < count; i++) {
                const a = sectors.readUInt32LE(i * 4), b = sectors.readUInt32LE(i * 4 + 4);
                assert(a >= tableSize && b >= a && b <= payload.length, 'Invalid encrypted FIX_KEY sector offsets');
                const plain = transform(payload.subarray(a, b), (oldKey + i) >>> 0);
                const encrypted = transform(plain, (newKey + i) >>> 0, true);
                assert.deepEqual(transform(encrypted, (newKey + i) >>> 0), plain, 'FIX_KEY sector re-encryption readback failed');
                encrypted.copy(output, a);
            }
            return output;
        }
        let cursor = 32;
        for (let i = 0; i < blockCount; i++) {
            const p = i * 16, start = blockTable.readUInt32LE(p), packed = blockTable.readUInt32LE(p + 4);
            const flags = blockTable.readUInt32LE(p + 12);
            if (!(flags & 0x80000000)) {
                // Unused rows have no payload; retain their indices for the attributes entry.
                blocks.fill(0, p, p + 16);
                continue;
            }
            assert(start >= 32 && offset + start + packed <= archiveEnd, 'Live MPQ block outside archive: ' + i);
            for (const [tableStart, tableSize] of tables) {
                assert(!packed || start + packed <= tableStart || start >= tableStart + tableSize,
                    'Live MPQ block overlaps a table: ' + i);
            }
            // Only FIX_KEY encryption depends on the block offset. Obtain its filename key
            // from the existing hash/listfile data, or refuse instead of guessing.
            let payload = bytes.subarray(offset + start, offset + start + packed);
            if (start !== cursor && (flags & 0x10000) && (flags & 0x20000)) {
                const [key, name] = keyForBlock(i), length = blockTable.readUInt32LE(p + 8);
                const oldKey = ((key + start) ^ length) >>> 0, newKey = ((key + cursor) ^ length) >>> 0;
                payload = rekey(payload, oldKey, newKey, length, flags);
                movedEncrypted.set(i, {oldKey, newKey, name});
            }
            blocks.writeUInt32LE(cursor, p);
            chunks.push(payload);
            cursor += packed;
        }
        const hashOffset = cursor;
        // Hash encryption does not depend on location; copy the exact original table.
        chunks.push(bytes.subarray(offset + tables[0][0], offset + tables[0][0] + tables[0][1]));
        cursor += hashTable.length;
        const blockOffset = cursor;
        chunks.push(transform(blocks, hash('(block table)', 3), true));
        cursor += blocks.length;
        assert(cursor <= 0xffffffff, 'MPQ v0 size limit exceeded');
        const result = Buffer.concat(chunks);
        result.writeUInt32LE(cursor, offset + 8);
        result.writeUInt32LE(hashOffset, offset + 16);
        result.writeUInt32LE(blockOffset, offset + 20);
        assert.deepEqual(result.subarray(0, offset), bytes.subarray(0, offset), 'MPQ prefix changed during compaction');
        // Reopen the finished archive, then compare every payload and all metadata other
        // than the moved offset. This also covers unsupported encodings and unnamed files.
        const verified = openMap(result);
        const verifiedHashes = transform(result.subarray(offset + hashOffset, offset + hashOffset + hashTable.length), hash('(hash table)', 3));
        const verifiedBlocks = transform(result.subarray(offset + blockOffset, offset + blockOffset + blocks.length), hash('(block table)', 3));
        assert.deepEqual(verifiedHashes, hashTable, 'MPQ hashes/locales changed during compaction');
        for (let i = 0; i < blockCount; i++) {
            const p = i * 16;
            if (!(blockTable.readUInt32LE(p + 12) & 0x80000000)) continue;
            assert.deepEqual(verifiedBlocks.subarray(p + 4, p + 16), blockTable.subarray(p + 4, p + 16),
                'Live MPQ block metadata changed during compaction: ' + i);
            const from = offset + blockTable.readUInt32LE(p), to = offset + verifiedBlocks.readUInt32LE(p);
            const packed = blockTable.readUInt32LE(p + 4);
            const moved = movedEncrypted.get(i);
            const actual = moved ? rekey(result.subarray(to, to + packed), moved.newKey, moved.oldKey,
                blockTable.readUInt32LE(p + 8), blockTable.readUInt32LE(p + 12)) : result.subarray(to, to + packed);
            assert.deepEqual(actual, bytes.subarray(from, from + packed),
                'Live MPQ block payload changed during compaction: ' + i);
            if (moved) assert.deepEqual(verified.read(moved.name), read(moved.name), 'FIX_KEY file readback changed: ' + moved.name);
        }
        return result.equals(bytes) ? bytes : result;
    }
    return { read, replace, compact };
}
