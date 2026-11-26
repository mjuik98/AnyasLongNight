// Project paths, the map version label and the bundle markers.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

// build/lib/project.mjs -> the repository root.
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const baseMapPath = path.join(root, 'AnyasLongNight.w3x');
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const firstMarker = '-- AnyasLongNight Lua prototype. Import at map script scope before main().';
export const lastMarker = '-- ===== END src/00_bootstrap/AnyasLongNight.lua =====';
// Release label shown in the map name and loading-screen subtitle. World Editor keeps both
// in war3map.wts; the map name string must be the one war3map.w3i references.
export const mapVersion = '0.1d';
