/**
 * User content backup (clips, settings, video catalog metadata).
 *
 * Design rule: APP CODE (GitHub / ASSET_VERSION) and USER CONTENT (these keys +
 * IndexedDB video blobs) are separate. Shipping a new app version must never
 * clear or rewrite user keys. Export/Import is how content survives Safari
 * data clears and device changes.
 *
 * Library → Export writes a file only when clips were added/changed/removed
 * since the last successful export (no duplicate unchanged saves).
 * The file always contains the full current clip library for easy restore.
 *
 * Video file bytes in IndexedDB are NOT included (too large for iPad share).
 * After Import, re-select each video once via Select Video File if needed.
 */

import {
  SETTINGS_KEY,
  CLIPS_KEY,
  CLIPS_DELETED_KEY,
  VIDEO_BINDINGS_KEY,
  CLIP_TITLES_KEY,
  LAST_PLAYED_CLIP_KEY,
  LIBRARY_FOCUS_CLIP_KEY,
  LAST_EXPORT_SNAPSHOT_KEY,
  ASSET_VERSION,
} from "./constants.js?v=20260918d";
import { VIDEO_CATALOG_KEY } from "./videoList.js?v=20260918d";

export const BACKUP_FORMAT = "shadowing-trainer-backup";
export const BACKUP_VERSION = 1;

/** Keys that hold user content. Do not rename without a migration. */
export const USER_CONTENT_KEYS = [
  CLIPS_KEY,
  CLIPS_DELETED_KEY,
  SETTINGS_KEY,
  VIDEO_BINDINGS_KEY,
  CLIP_TITLES_KEY,
  VIDEO_CATALOG_KEY,
  LAST_PLAYED_CLIP_KEY,
  LIBRARY_FOCUS_CLIP_KEY,
  LAST_EXPORT_SNAPSHOT_KEY,
];

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null || raw === "") return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function clipFingerprint(clip) {
  return [
    clip.id,
    clip.updated_at || 0,
    clip.created_at || 0,
    clip.video_id || "",
    clip.title || "",
    clip.start,
    clip.end,
    clip.english || "",
    clip.korean || "",
  ].join("|");
}

function readClips() {
  const clips = readJson(CLIPS_KEY, []);
  return Array.isArray(clips) ? clips : [];
}

function readSnapshot() {
  const snap = readJson(LAST_EXPORT_SNAPSHOT_KEY, null);
  if (!snap || typeof snap !== "object") return { fingerprints: {} };
  const fingerprints =
    snap.fingerprints && typeof snap.fingerprints === "object" ? snap.fingerprints : {};
  return { ...snap, fingerprints };
}

function writeSnapshot(clips) {
  const fingerprints = {};
  for (const clip of clips) {
    fingerprints[String(clip.id)] = clipFingerprint(clip);
  }
  writeJson(LAST_EXPORT_SNAPSHOT_KEY, {
    exportedAt: new Date().toISOString(),
    clipCount: clips.length,
    fingerprints,
  });
}

/**
 * Compare current clips to the last successful Export.
 * Returns which clips are new/changed and whether a new save is needed.
 */
export function diffClipsSinceLastExport(clips = readClips()) {
  const list = Array.isArray(clips) ? clips : [];
  const { fingerprints: prev } = readSnapshot();
  const prevIds = new Set(Object.keys(prev));
  const added = [];
  const changed = [];
  const currentIds = new Set();

  for (const clip of list) {
    const id = String(clip.id);
    currentIds.add(id);
    const fp = clipFingerprint(clip);
    if (!prev[id]) added.push(clip);
    else if (prev[id] !== fp) changed.push(clip);
  }

  const removedIds = [...prevIds].filter((id) => !currentIds.has(id));
  const hasChanges = added.length > 0 || changed.length > 0 || removedIds.length > 0;

  return {
    clips: list,
    added,
    changed,
    removedIds,
    hasChanges,
    isFirstExport: prevIds.size === 0,
  };
}

export function buildBackup() {
  const clips = readClips();
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: ASSET_VERSION,
    note:
      "Clip times, titles, subtitles, and settings. Re-select video files after restore if playback asks for them.",
    data: {
      clips,
      clipsDeleted: readJson(CLIPS_DELETED_KEY, []),
      settings: readJson(SETTINGS_KEY, null),
      videos: readJson(VIDEO_CATALOG_KEY, []),
      bindings: readJson(VIDEO_BINDINGS_KEY, {}),
      titles: readJson(CLIP_TITLES_KEY, []),
      lastPlayedClip: localStorage.getItem(LAST_PLAYED_CLIP_KEY) || "",
      libraryFocusClip: localStorage.getItem(LIBRARY_FOCUS_CLIP_KEY) || "",
    },
  };
}

export function summarizeBackup(backup) {
  const clips = backup?.data?.clips;
  const n = Array.isArray(clips) ? clips.length : 0;
  const when = backup?.exportedAt ? String(backup.exportedAt).slice(0, 19).replace("T", " ") : "unknown";
  return { clipCount: n, exportedAt: when };
}

export function parseBackupText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Not a valid JSON backup file.");
  }
  if (!parsed || parsed.format !== BACKUP_FORMAT) {
    throw new Error("This file is not a Shadowing Trainer backup.");
  }
  if (!parsed.data || typeof parsed.data !== "object") {
    throw new Error("Backup file is missing data.");
  }
  if (!Array.isArray(parsed.data.clips)) {
    throw new Error("Backup file has no clips list.");
  }
  return parsed;
}

/**
 * Replace device user content with backup.
 * Does not touch IndexedDB media blobs or app code.
 */
export function restoreBackup(backup) {
  const parsed = backup.format === BACKUP_FORMAT ? backup : parseBackupText(JSON.stringify(backup));
  const d = parsed.data;

  writeJson(CLIPS_KEY, Array.isArray(d.clips) ? d.clips : []);
  writeJson(CLIPS_DELETED_KEY, Array.isArray(d.clipsDeleted) ? d.clipsDeleted : []);
  if (d.settings && typeof d.settings === "object") {
    writeJson(SETTINGS_KEY, d.settings);
  }
  writeJson(VIDEO_CATALOG_KEY, Array.isArray(d.videos) ? d.videos : []);
  writeJson(
    VIDEO_BINDINGS_KEY,
    d.bindings && typeof d.bindings === "object" ? d.bindings : {}
  );
  writeJson(CLIP_TITLES_KEY, Array.isArray(d.titles) ? d.titles : []);

  if (d.lastPlayedClip) localStorage.setItem(LAST_PLAYED_CLIP_KEY, String(d.lastPlayedClip));
  else localStorage.removeItem(LAST_PLAYED_CLIP_KEY);

  if (d.libraryFocusClip) localStorage.setItem(LIBRARY_FOCUS_CLIP_KEY, String(d.libraryFocusClip));
  else localStorage.removeItem(LIBRARY_FOCUS_CLIP_KEY);

  writeSnapshot(Array.isArray(d.clips) ? d.clips : []);

  return summarizeBackup(parsed);
}

async function deliverBackupFile(backup, { filenamePrefix = "shadowing-backup" } = {}) {
  const summary = summarizeBackup(backup);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}-${stamp}.json`;
  const text = JSON.stringify(backup, null, 2);
  const blob = new Blob([text], { type: "application/json" });

  try {
    const file = new File([blob], filename, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: "Shadowing Trainer backup",
        text: `${summary.clipCount} clips`,
      });
      return { method: "share", filename, ...summary };
    }
  } catch (err) {
    if (err && err.name === "AbortError") {
      return { method: "cancelled", filename, ...summary };
    }
    /* fall through to download */
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { method: "download", filename, ...summary };
}

/** Always write a full backup file (Settings / forced). */
export async function shareOrDownloadBackup() {
  const backup = buildBackup();
  const result = await deliverBackupFile(backup);
  if (result.method !== "cancelled") {
    writeSnapshot(backup.data.clips || []);
  }
  return result;
}

/**
 * Library Export: skip if nothing changed since last export.
 * When there are changes, save a full backup (all current clips) once.
 */
export async function exportLibraryClipsIfChanged() {
  const diff = diffClipsSinceLastExport();
  if (!diff.clips.length) {
    return {
      skipped: true,
      reason: "empty",
      message: "저장할 클립이 없습니다. 먼저 클립을 만드세요.",
      added: 0,
      changed: 0,
      removed: 0,
      clipCount: 0,
    };
  }
  if (!diff.hasChanges) {
    return {
      skipped: true,
      reason: "unchanged",
      message: "이미 최신입니다. 추가·변경된 클립이 없어 다시 저장하지 않습니다.",
      added: 0,
      changed: 0,
      removed: 0,
      clipCount: diff.clips.length,
    };
  }

  const backup = buildBackup();
  const result = await deliverBackupFile(backup);
  if (result.method === "cancelled") {
    return {
      skipped: true,
      reason: "cancelled",
      message: "내보내기가 취소되었습니다.",
      added: diff.added.length,
      changed: diff.changed.length,
      removed: diff.removedIds.length,
      clipCount: diff.clips.length,
    };
  }

  writeSnapshot(diff.clips);
  const parts = [];
  if (diff.isFirstExport) parts.push(`전체 ${diff.clips.length}개`);
  else {
    if (diff.added.length) parts.push(`추가 ${diff.added.length}`);
    if (diff.changed.length) parts.push(`변경 ${diff.changed.length}`);
    if (diff.removedIds.length) parts.push(`삭제 반영 ${diff.removedIds.length}`);
    parts.push(`전체 ${diff.clips.length}개`);
  }
  return {
    skipped: false,
    ...result,
    added: diff.added.length,
    changed: diff.changed.length,
    removed: diff.removedIds.length,
    message: `${parts.join(" · ")} 저장됨 → ${result.filename}`,
  };
}

export async function readBackupFile(file) {
  if (!file) throw new Error("No file selected.");
  const text = await file.text();
  return parseBackupText(text);
}
