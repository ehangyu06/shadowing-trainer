/**
 * Durable mirror of user content (clips/settings metadata — not video bytes).
 *
 * App version bumps never touch this. If localStorage clips are empty but a
 * vault/mirror copy still exists, we restore automatically on launch.
 *
 * Files/iCloud Export is still required for survival after full Safari
 * "Clear Website Data" (that wipes both localStorage and IndexedDB).
 */

import {
  CLIPS_KEY,
  CLIPS_MIRROR_KEY,
  ASSET_VERSION,
} from "./constants.js?v=20260918g";
import {
  buildBackup,
  restoreBackup,
  diffClipsSinceLastExport,
} from "./userData.js?v=20260918g";

const DB_NAME = "shadowing-trainer-vault";
const STORE = "backups";
const RECORD_ID = "latest";
const VERSION = 1;

let vaultTimer = 0;

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
    req.onerror = () => reject(req.error || new Error("Vault DB open failed"));
  });
}

function readClipsFromLocal() {
  try {
    const raw = localStorage.getItem(CLIPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readClipsFromMirror() {
  try {
    const raw = localStorage.getItem(CLIPS_MIRROR_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function mirrorClipsPayload(payload) {
  try {
    if (typeof payload === "string") localStorage.setItem(CLIPS_MIRROR_KEY, payload);
  } catch {
    /* ignore mirror failures */
  }
}

export async function saveContentVault(backup = buildBackup()) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Vault write failed"));
      tx.objectStore(STORE).put({
        id: RECORD_ID,
        savedAt: Date.now(),
        appVersion: ASSET_VERSION,
        backup,
      });
    });
  } finally {
    db.close();
  }
  return backup;
}

export async function loadContentVault() {
  let db;
  try {
    db = await openDb();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(RECORD_ID);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    return row?.backup || null;
  } catch {
    return null;
  } finally {
    if (db) db.close();
  }
}

/** Write mirror + vault from current device state (non-blocking friendly). */
export async function syncContentVault() {
  const backup = buildBackup();
  const clipsJson = localStorage.getItem(CLIPS_KEY);
  if (clipsJson) mirrorClipsPayload(clipsJson);
  await saveContentVault(backup);
  return backup;
}

export function scheduleContentVaultSync() {
  if (vaultTimer) clearTimeout(vaultTimer);
  vaultTimer = setTimeout(() => {
    vaultTimer = 0;
    syncContentVault().catch(() => {});
  }, 200);
}

/**
 * If primary clips storage is empty, restore from mirror or IndexedDB vault.
 * Safe to call on every app launch — never clears existing clips.
 */
export async function hydrateUserContentIfNeeded() {
  const primary = readClipsFromLocal();
  if (primary.length > 0) {
    scheduleContentVaultSync();
    return { restored: false, source: null, clipCount: primary.length };
  }

  const mirror = readClipsFromMirror();
  if (mirror.length > 0) {
    try {
      localStorage.setItem(CLIPS_KEY, JSON.stringify(mirror));
      scheduleContentVaultSync();
      return { restored: true, source: "mirror", clipCount: mirror.length };
    } catch {
      /* fall through */
    }
  }

  const vault = await loadContentVault();
  const vaultClips = vault?.data?.clips;
  if (Array.isArray(vaultClips) && vaultClips.length > 0) {
    restoreBackup(vault);
    return { restored: true, source: "vault", clipCount: vaultClips.length };
  }

  return { restored: false, source: null, clipCount: 0 };
}

export function backupReminderMessage() {
  const diff = diffClipsSinceLastExport();
  if (!diff.clips.length) return "";
  if (diff.isFirstExport) {
    return `클립 ${diff.clips.length}개가 이 iPad에만 있습니다. 상단 Export로 Files/iCloud에 백업하세요. (앱 업데이트는 클립을 지우지 않습니다.)`;
  }
  if (diff.hasChanges) {
    return `추가 ${diff.added.length} · 변경 ${diff.changed.length}개 클립이 Export되지 않았습니다. Export를 눌러 백업하세요.`;
  }
  return "";
}
