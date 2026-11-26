// Transactional publication of build outputs with restore on failure.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Prepare every payload before touching its destination. On a caught publication
// failure, restore only files that still contain our bytes, preserving concurrent edits.
// The injectable filesystem lets failure paths run in memory in build/check.mjs.
export function publishTransaction(entries, {io = fs, stamp = new Date().toISOString().replaceAll(':', '-'),
    guard = () => {}, finalize = () => []} = {}) {
    const prepared = [], committed = [], destinations = new Set(), paths = new Map();
    const current = file => io.existsSync(file) ? io.readFileSync(file) : null;
    const matches = (a, b) => a === null ? b === null : Buffer.isBuffer(b) && a.equals(b);
    function prepare(entry) {
        assert(Buffer.isBuffer(entry.bytes), 'Publication payload must be a Buffer');
        const key = path.resolve(entry.path).toLowerCase();
        assert(!destinations.has(key), 'Duplicate publication destination: ' + entry.path);
        destinations.add(key);
        const record = {...entry, before: entry.before ?? null, actual: entry.path,
            temporary: entry.path + '.' + stamp + '.tmp', ownsTemporary: false};
        assert(matches(record.before, current(record.path)), 'Destination changed before preparation: ' + record.path);
        io.mkdirSync(path.dirname(record.path), {recursive: true});
        assert(!io.existsSync(record.temporary), 'Publication temporary file already exists: ' + record.temporary);
        prepared.push(record);
        record.ownsTemporary = true;
        try { io.writeFileSync(record.temporary, record.bytes, {flag: 'wx'}); }
        catch (error) { if (error.code === 'EEXIST') record.ownsTemporary = false; throw error; }
        assert.deepEqual(io.readFileSync(record.temporary), record.bytes, 'Prepared payload readback differs');
        return record;
    }
    function publish(record) {
        assert(matches(record.before, current(record.path)), 'Destination changed during publication: ' + record.path);
        try { io.renameSync(record.temporary, record.actual); }
        catch (error) {
            if (!record.alternate || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
            assert(!io.existsSync(record.alternate), 'Alternate output already exists: ' + record.alternate);
            io.renameSync(record.temporary, record.alternate);
            record.actual = record.alternate;
            record.before = null;
        }
        record.ownsTemporary = false;
        committed.push(record);
        paths.set(record.path, record.actual);
        assert.deepEqual(io.readFileSync(record.actual), record.bytes, 'Published payload readback differs');
    }
    const failures = [];
    try {
        const files = entries.map(prepare);
        guard();
        for (const record of files) publish(record);
        // A manifest can include the actual alternate map path chosen for a locked output.
        const finalFiles = finalize(paths).map(prepare);
        for (const record of finalFiles) publish(record);
    } catch (failure) {
        failures.push(failure);
        for (const record of committed.reverse()) {
            const temporary = record.actual + '.' + stamp + '.rollback';
            let ownsRollback = false;
            try {
                assert(matches(record.bytes, current(record.actual)),
                    'Concurrent edit preserved; cannot roll back: ' + record.actual);
                if (record.before === null) io.unlinkSync(record.actual);
                else {
                    assert(!io.existsSync(temporary), 'Rollback temporary file already exists');
                    ownsRollback = true;
                    try { io.writeFileSync(temporary, record.before, {flag: 'wx'}); }
                    catch (error) { if (error.code === 'EEXIST') ownsRollback = false; throw error; }
                    assert.deepEqual(io.readFileSync(temporary), record.before, 'Rollback payload readback differs');
                    assert(matches(record.bytes, current(record.actual)),
                        'Concurrent edit preserved; cannot roll back: ' + record.actual);
                    io.renameSync(temporary, record.actual);
                    ownsRollback = false;
                    assert.deepEqual(io.readFileSync(record.actual), record.before, 'Rollback readback differs');
                }
            } catch (error) { failures.push(error); }
            finally {
                try { if (ownsRollback && io.existsSync(temporary)) io.unlinkSync(temporary); }
                catch (error) { failures.push(error); }
            }
        }
    } finally {
        for (const record of prepared) {
            try { if (record.ownsTemporary && io.existsSync(record.temporary)) io.unlinkSync(record.temporary); }
            catch (error) { failures.push(error); }
        }
    }
    if (failures.length > 1) throw new AggregateError(failures,
        'Publication failed; some files need recovery from the backup or temporary cleanup: ' + failures.map(error => error.message).join('; '));
    if (failures.length === 1) throw failures[0];
    return paths;
}
