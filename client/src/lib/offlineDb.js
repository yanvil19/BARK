/**
 * NU-BOARD Offline Database Layer
 * Built on native IndexedDB with Promises. Zero external dependencies.
 * Designed with iOS Safari persistence & quota constraints in mind.
 */

const DB_NAME = 'nu_board_offline_db';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      return reject(new Error('IndexedDB not supported in this environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. User profile store: stores { id: 'current', me, offlineSyncTicket, updatedAt }
      if (!db.objectStoreNames.contains('profile')) {
        db.createObjectStore('profile', { keyPath: 'id' });
      }

      // 2. Exams store: stores { _id: examId, name, questions, passingThreshold, ... }
      if (!db.objectStoreNames.contains('exams')) {
        db.createObjectStore('exams', { keyPath: '_id' });
      }

      // 3. Question Image blobs: stores { key: '/api/questions/image/...', blob, mimeType, size }
      if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images', { keyPath: 'key' });
      }

      // 4. Pending Sync attempts: stores { clientAttemptId, examId, answers, startTime, endTime, status }
      if (!db.objectStoreNames.contains('pendingSync')) {
        const store = db.createObjectStore('pendingSync', { keyPath: 'clientAttemptId' });
        store.createIndex('examId', 'examId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }

      // 5. Metadata: stores { id: 'meta', lastSyncedAt, examCount, imageCount, storagePersisted }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      dbPromise = null;
      reject(event.target.error);
    };
  });

  return dbPromise;
}

// -------------------------------------------------------------
// Transaction Helpers
// -------------------------------------------------------------
async function getTransaction(storeName, mode = 'readonly') {
  const db = await openDb();
  return db.transaction(storeName, mode);
}

function reqPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// -------------------------------------------------------------
// Storage Persistence (iOS Safari & Android Chrome)
// -------------------------------------------------------------
export async function requestStoragePersistence() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      await setMeta('storagePersisted', isPersisted);
      return isPersisted;
    } catch {
      return false;
    }
  }
  return false;
}

export async function isStoragePersisted() {
  if (navigator.storage && navigator.storage.persisted) {
    try {
      return await navigator.storage.persisted();
    } catch {
      return false;
    }
  }
  return false;
}

// -------------------------------------------------------------
// Metadata & Eviction Integrity Check
// -------------------------------------------------------------
export async function setMeta(key, value) {
  const tx = await getTransaction('meta', 'readwrite');
  const store = tx.objectStore('meta');
  const existing = (await reqPromise(store.get('meta'))) || { id: 'meta' };
  existing[key] = value;
  await reqPromise(store.put(existing));
}

export async function getMeta() {
  try {
    const tx = await getTransaction('meta', 'readonly');
    const store = tx.objectStore('meta');
    return (await reqPromise(store.get('meta'))) || null;
  } catch {
    return null;
  }
}

/**
 * Checks if iOS evicted the data silently.
 * Returns { ok: boolean, wasEvicted: boolean, lastSyncedAt: string|null }
 */
export async function checkStorageIntegrity() {
  try {
    const meta = await getMeta();
    if (!meta || !meta.lastSyncedAt || !meta.examCount) {
      return { ok: true, wasEvicted: false, lastSyncedAt: null, examCount: 0 };
    }

    // Verify if exams store still actually has the count
    const tx = await getTransaction('exams', 'readonly');
    const store = tx.objectStore('exams');
    const actualCount = await reqPromise(store.count());

    if (actualCount === 0 && meta.examCount > 0) {
      // Storage was wiped by iOS eviction!
      return {
        ok: false,
        wasEvicted: true,
        lastSyncedAt: meta.lastSyncedAt,
        expectedExamCount: meta.examCount,
        actualCount: 0,
      };
    }

    return {
      ok: true,
      wasEvicted: false,
      lastSyncedAt: meta.lastSyncedAt,
      examCount: actualCount,
    };
  } catch {
    return { ok: true, wasEvicted: false, lastSyncedAt: null };
  }
}

// -------------------------------------------------------------
// Profile Store
// -------------------------------------------------------------
export async function saveOfflineProfile(me, offlineSyncTicket) {
  if (!me) return;
  const tx = await getTransaction('profile', 'readwrite');
  const store = tx.objectStore('profile');
  await reqPromise(
    store.put({
      id: 'current',
      me,
      offlineSyncTicket: offlineSyncTicket || null,
      updatedAt: new Date().toISOString(),
    })
  );
}

export async function getOfflineProfile() {
  try {
    const tx = await getTransaction('profile', 'readonly');
    const store = tx.objectStore('profile');
    return (await reqPromise(store.get('current'))) || null;
  } catch {
    return null;
  }
}

export async function clearOfflineProfile() {
  try {
    const tx = await getTransaction('profile', 'readwrite');
    const store = tx.objectStore('profile');
    await reqPromise(store.delete('current'));
  } catch {
    // Ignore
  }
}

// -------------------------------------------------------------
// Exams Store
// -------------------------------------------------------------
export async function saveOfflineExams(exams = []) {
  const tx = await getTransaction('exams', 'readwrite');
  const store = tx.objectStore('exams');
  for (const exam of exams) {
    if (exam && exam._id) {
      await reqPromise(store.put({ ...exam, cachedAt: new Date().toISOString() }));
    }
  }
}

export async function getOfflineExams() {
  try {
    const tx = await getTransaction('exams', 'readonly');
    const store = tx.objectStore('exams');
    return (await reqPromise(store.getAll())) || [];
  } catch {
    return [];
  }
}

export async function getOfflineExam(examId) {
  try {
    const tx = await getTransaction('exams', 'readonly');
    const store = tx.objectStore('exams');
    return (await reqPromise(store.get(String(examId)))) || null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// Question Images Store
// -------------------------------------------------------------
export async function saveOfflineImage(key, blob) {
  if (!key || !blob) return;
  const tx = await getTransaction('images', 'readwrite');
  const store = tx.objectStore('images');
  await reqPromise(
    store.put({
      key,
      blob,
      size: blob.size,
      type: blob.type || 'image/jpeg',
      cachedAt: new Date().toISOString(),
    })
  );
}

export async function getOfflineImage(key) {
  try {
    const tx = await getTransaction('images', 'readonly');
    const store = tx.objectStore('images');
    const record = await reqPromise(store.get(key));
    return record?.blob || null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// Pending Sync (Attempts) Store - ISOLATED LIFECYCLE
// -------------------------------------------------------------
export async function savePendingAttempt(attempt) {
  if (!attempt?.clientAttemptId) return;
  const tx = await getTransaction('pendingSync', 'readwrite');
  const store = tx.objectStore('pendingSync');
  await reqPromise(
    store.put({
      ...attempt,
      updatedAt: new Date().toISOString(),
    })
  );
}

export async function getPendingAttempts() {
  try {
    const tx = await getTransaction('pendingSync', 'readonly');
    const store = tx.objectStore('pendingSync');
    return (await reqPromise(store.getAll())) || [];
  } catch {
    return [];
  }
}

export async function getPendingAttempt(clientAttemptId) {
  try {
    const tx = await getTransaction('pendingSync', 'readonly');
    const store = tx.objectStore('pendingSync');
    return (await reqPromise(store.get(clientAttemptId))) || null;
  } catch {
    return null;
  }
}

export async function removePendingAttempt(clientAttemptId) {
  try {
    const tx = await getTransaction('pendingSync', 'readwrite');
    const store = tx.objectStore('pendingSync');
    await reqPromise(store.delete(clientAttemptId));
  } catch {
    // Ignore
  }
}

// -------------------------------------------------------------
// Pruning & Cleanup
// -------------------------------------------------------------
/**
 * Prunes expired exams and uncached images after 14 days or past endDateTime.
 * NOTE: pendingSync is NEVER touched by this function.
 */
export async function pruneExpiredExams() {
  try {
    const now = new Date().getTime();
    const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

    const txExams = await getTransaction('exams', 'readwrite');
    const examsStore = txExams.objectStore('exams');
    const allExams = (await reqPromise(examsStore.getAll())) || [];

    const activeImageKeys = new Set();

    for (const exam of allExams) {
      let shouldPrune = false;
      if (exam.cachedAt && now - new Date(exam.cachedAt).getTime() > FOURTEEN_DAYS_MS) {
        shouldPrune = true;
      }
      if (exam.endDateTime && new Date(exam.endDateTime).getTime() < now) {
        shouldPrune = true;
      }

      if (shouldPrune) {
        await reqPromise(examsStore.delete(exam._id));
      } else {
        (exam.questions || []).forEach((q) => {
          (q.images || []).forEach((img) => activeImageKeys.add(img));
        });
      }
    }

    // Prune unreferenced images
    const txImgs = await getTransaction('images', 'readwrite');
    const imgsStore = txImgs.objectStore('images');
    const allImages = (await reqPromise(imgsStore.getAll())) || [];
    for (const imgRecord of allImages) {
      if (!activeImageKeys.has(imgRecord.key)) {
        await reqPromise(imgsStore.delete(imgRecord.key));
      }
    }
  } catch (err) {
    console.error('pruneExpiredExams error:', err);
  }
}

/**
 * Total purge on explicit user logout.
 */
export async function clearAllOfflineData() {
  try {
    const db = await openDb();
    const storeNames = ['profile', 'exams', 'images', 'meta'];
    const tx = db.transaction(storeNames, 'readwrite');
    for (const name of storeNames) {
      await reqPromise(tx.objectStore(name).clear());
    }
  } catch (err) {
    console.error('clearAllOfflineData error:', err);
  }
}
