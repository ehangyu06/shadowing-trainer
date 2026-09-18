const DB_NAME = "shadowing-trainer-media";
const STORE = "videos";
const VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
}

/**
 * Persist the picked video blob under video_id so it survives reloads
 * on this device (until the browser clears site data / quota pressure).
 */
export async function saveMediaBlob(videoId, blob, meta = {}) {
  if (!videoId || !blob) throw new Error("Missing video or file");
  // Clone to a plain Blob so Safari keeps a durable copy after the file input clears.
  const type = blob.type || meta.type || "video/mp4";
  const durable =
    blob instanceof Blob ? blob.slice(0, blob.size, type) : new Blob([blob], { type });
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB write aborted"));
      tx.objectStore(STORE).put({
        id: videoId,
        blob: durable,
        filename: meta.filename || "",
        size: durable.size || 0,
        type,
        lastModified: meta.lastModified || 0,
        savedAt: Date.now(),
      });
    });
  } catch (err) {
    if (err && (err.name === "QuotaExceededError" || err.code === 22)) {
      throw new Error(
        "Safari website storage limit reached (this is separate from iPad free space). In Videos, use Remove from iPad on duplicate movies, then reuse the same video for new clips."
      );
    }
    throw err;
  } finally {
    db.close();
  }
}

export async function loadMediaRecord(videoId) {
  if (!videoId) return null;
  let db;
  try {
    db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(videoId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  } finally {
    if (db) db.close();
  }
}

export async function hasMediaBlob(videoId) {
  const row = await loadMediaRecord(videoId);
  return !!(row && row.blob);
}

export async function deleteMediaBlob(videoId) {
  if (!videoId) return;
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB delete failed"));
      tx.objectStore(STORE).delete(videoId);
    });
  } finally {
    db.close();
  }
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
