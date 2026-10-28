// In-memory cache for protected question/answer images.
//
// Question images are confidential, so this cache never writes anything to disk
// or persistent storage: requests use `cache: 'no-store'` (and the server sends
// `Cache-Control: no-store`), and decoded images live only as blob: URLs in this
// tab's memory. Entries are shared between components showing the same image,
// released when no component uses them, evicted least-recently-used beyond a size
// cap, and wiped on logout or session expiry.
import { buildAuthHeaders } from './api';

const API_BASE = import.meta.env.VITE_API_URL || '';
const PROTECTED_PATH = '/api/questions/image/';

const MAX_CACHE_BYTES = 40 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 120;

export const SESSION_CLEARED_EVENT = 'session-cleared';

// key -> { key, refs, size, objectUrl, lastUsed, promise }
const entries = new Map();
// Bumped on every clear so requests that finish afterwards are thrown away
let generation = 0;

export function isProtectedImageUrl(src) {
  return typeof src === 'string' && src.includes(PROTECTED_PATH);
}

export function resolveImageUrl(src) {
  if (!src) return '';
  return src.startsWith('/') ? `${API_BASE}${src}` : src;
}

// Same image whether it is referenced as "/api/..." or "<API_BASE>/api/..."
function toCacheKey(src) {
  return src.slice(src.indexOf(PROTECTED_PATH));
}

async function loadEntry(entry, entryGeneration) {
  try {
    const res = await fetch(resolveImageUrl(entry.key), {
      headers: buildAuthHeaders(),
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Image request failed (${res.status})`);

    const blob = await res.blob();
    if (entryGeneration !== generation || entries.get(entry.key) !== entry) {
      throw new Error('Image cache was cleared');
    }

    entry.objectUrl = URL.createObjectURL(blob);
    entry.size = blob.size;
    trimCache();
    return entry.objectUrl;
  } catch (err) {
    // Failed loads are not kept, so the next request tries again
    if (entries.get(entry.key) === entry) entries.delete(entry.key);
    throw err;
  }
}

function evict(entry) {
  if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  entries.delete(entry.key);
}

// Drops unused images, oldest first, until the cache is back under its limits.
// Images a component is still showing are never evicted.
function trimCache() {
  const loaded = [...entries.values()].filter((entry) => entry.objectUrl);
  let totalBytes = loaded.reduce((sum, entry) => sum + entry.size, 0);
  let count = loaded.length;

  const unused = loaded.filter((entry) => entry.refs === 0).sort((a, b) => a.lastUsed - b.lastUsed);
  for (const entry of unused) {
    if (totalBytes <= MAX_CACHE_BYTES && count <= MAX_CACHE_ENTRIES) break;
    totalBytes -= entry.size;
    count -= 1;
    evict(entry);
  }
}

// Starts using a protected image. Returns the promise of its blob: URL and a
// release function that must be called once the image is no longer shown.
export function acquireImage(src) {
  const key = toCacheKey(src);
  let entry = entries.get(key);

  if (!entry) {
    entry = { key, refs: 0, size: 0, objectUrl: null, lastUsed: 0, promise: null };
    entries.set(key, entry);
    entry.promise = loadEntry(entry, generation);
  }

  entry.refs += 1;
  entry.lastUsed = Date.now();

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    entry.refs = Math.max(0, entry.refs - 1);
    entry.lastUsed = Date.now();
    trimCache();
  };

  return { promise: entry.promise, release };
}

// Seeds the cache with a file the user just uploaded, so showing it right
// after the upload does not download it again.
export function primeImage(src, file) {
  if (!isProtectedImageUrl(src) || !(file instanceof Blob)) return;
  const key = toCacheKey(src);
  if (entries.has(key)) return;

  const objectUrl = URL.createObjectURL(file);
  entries.set(key, {
    key,
    refs: 0,
    size: file.size,
    objectUrl,
    lastUsed: Date.now(),
    promise: Promise.resolve(objectUrl),
  });
  trimCache();
}

// Forgets every cached image and frees its memory
export function clearImageCache() {
  generation += 1;
  for (const entry of entries.values()) {
    if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
  }
  entries.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener(SESSION_CLEARED_EVENT, clearImageCache);
}
