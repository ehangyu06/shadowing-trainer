import { CLIPS_KEY, CLIPS_DELETED_KEY } from "./constants.js?v=20260916u";
import { roundTenth } from "./time.js?v=20260916u";
import { videoIdFromName } from "./videoList.js?v=20260916u";
import { rememberClipTitle } from "./titleStore.js?v=20260916u";

function normalizeClip(clip, index = 0) {
  const legacyPath = String(clip.video || "");
  return {
    id: Number(clip.id) || index + 1,
    video_id: String(clip.video_id || videoIdFromName(legacyPath) || ""),
    title: String(clip.title || clip.name || "").trim(),
    start: roundTenth(clip.start ?? clip.start_time ?? 0),
    end: roundTenth(clip.end ?? clip.end_time ?? 0),
    english: String(clip.english || ""),
    korean: String(clip.korean || ""),
    created_at: Number(clip.created_at) || 0,
    updated_at: Number(clip.updated_at) || 0,
  };
}

function normalizeClips(clips) {
  if (!Array.isArray(clips)) return [];
  return clips.map((clip, i) => normalizeClip(clip, i));
}

function readDeletedIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(CLIPS_DELETED_KEY) || "[]");
    return new Set((Array.isArray(raw) ? raw : []).map((id) => String(id)));
  } catch {
    return new Set();
  }
}

function writeDeletedIds(ids) {
  localStorage.setItem(CLIPS_DELETED_KEY, JSON.stringify([...ids]));
}

function markDeleted(ids) {
  const deleted = readDeletedIds();
  for (const id of [].concat(ids)) deleted.add(String(id));
  writeDeletedIds(deleted);
}

function unmarkDeleted(id) {
  const deleted = readDeletedIds();
  deleted.delete(String(id));
  writeDeletedIds(deleted);
}

function sortClips(clips) {
  return [...clips].sort((a, b) => Number(a.id) - Number(b.id));
}

function readLocalRaw() {
  try {
    const raw = localStorage.getItem(CLIPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeClips(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function writeLocalRaw(clips) {
  const next = sortClips(normalizeClips(clips));
  const payload = JSON.stringify(next);
  try {
    localStorage.setItem(CLIPS_KEY, payload);
  } catch (err) {
    throw new Error(
      err?.name === "QuotaExceededError"
        ? "Storage full. Delete old clips/videos and try again."
        : "Could not write clips to device storage."
    );
  }
  // Verify immediately — Safari can appear to succeed then drop data.
  const check = readLocalRaw();
  if (check.length !== next.length) {
    throw new Error("Clip save did not stick in storage. Try again.");
  }
  for (const clip of next) {
    if (!check.some((item) => Number(item.id) === Number(clip.id))) {
      throw new Error(`Clip ${clip.id} missing after save.`);
    }
  }
  return check;
}

/**
 * Device localStorage is the only source of truth for clips on GitHub Pages.
 * App updates (ASSET_VERSION) must never clear CLIPS_KEY.
 * Backup/restore: Settings → Export / Import Backup (js/userData.js).
 * Seed/API merges previously caused new clips to disappear — do not bring that back.
 */
export async function loadClips() {
  const deleted = readDeletedIds();
  const raw = readLocalRaw();
  const local = raw.filter((clip) => !deleted.has(String(clip.id)));
  if (local.length !== raw.length) {
    writeLocalRaw(local);
  }
  return local;
}

export const getClips = loadClips;

export async function saveClips(clips) {
  // Do not filter by deleted here — callers decide. Persist exactly.
  return writeLocalRaw(clips);
}

export async function getClip(id) {
  const clips = await loadClips();
  return clips.find((clip) => String(clip.id) === String(id)) || null;
}

export function nextClipId(clips) {
  const list = clips || readLocalRaw();
  return list.reduce((max, clip) => Math.max(max, Number(clip.id) || 0), 0) + 1;
}

export async function upsertClip(partial) {
  const local = readLocalRaw();
  const deleted = readDeletedIds();
  const asNew =
    Boolean(partial.__asNew) ||
    partial.id == null ||
    partial.id === "" ||
    !Number(partial.id);

  let id;
  let index = -1;

  if (asNew) {
    id = nextClipId(local);
    while (local.some((item) => Number(item.id) === id) || deleted.has(String(id))) {
      id += 1;
    }
  } else {
    id = Number(partial.id);
    index = local.findIndex((item) => Number(item.id) === id);
    if (index < 0) {
      id = nextClipId(local);
      while (local.some((item) => Number(item.id) === id) || deleted.has(String(id))) {
        id += 1;
      }
    }
  }

  unmarkDeleted(id);

  const prev = index >= 0 ? local[index] : null;
  const now = Date.now();
  const clip = normalizeClip({
    id,
    video_id: partial.video_id,
    title: partial.title,
    start: partial.start,
    end: partial.end,
    english: partial.english,
    korean: partial.korean,
    created_at: prev?.created_at || partial.created_at || now,
    updated_at: now,
  });

  const next = local.slice();
  if (index >= 0) next[index] = clip;
  else next.push(clip);

  if (clip.title) rememberClipTitle(clip.title);

  const savedList = writeLocalRaw(next);
  const found = savedList.find((item) => Number(item.id) === Number(id));
  if (!found) throw new Error("Save failed: clip not found after write.");
  return found;
}

export const saveClip = upsertClip;
export const updateClip = upsertClip;

export async function deleteClip(id) {
  markDeleted(id);
  const local = readLocalRaw().filter((clip) => String(clip.id) !== String(id));
  writeLocalRaw(local);
  return local;
}

export async function deleteClipsByVideoId(videoId) {
  const local = readLocalRaw();
  const removed = local.filter((clip) => String(clip.video_id) === String(videoId));
  if (removed.length) markDeleted(removed.map((clip) => clip.id));
  const kept = local.filter((clip) => String(clip.video_id) !== String(videoId));
  writeLocalRaw(kept);
  return kept;
}

export function neighborIds(clips, id) {
  const index = clips.findIndex((clip) => String(clip.id) === String(id));
  if (index < 0) return { prev: null, next: null };
  return {
    prev: index > 0 ? clips[index - 1].id : null,
    next: index < clips.length - 1 ? clips[index + 1].id : null,
  };
}
