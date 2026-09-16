import {
  CLIPS_KEY,
  CLIPS_DELETED_KEY,
  LIBRARY_CLEANUP_KEY,
} from "./constants.js?v=20260916q";
import { roundTenth } from "./time.js?v=20260916q";
import { fetchJsonIfOk, resourceUrl } from "./http.js?v=20260916q";
import { videoIdFromName, removeVideos } from "./videoList.js?v=20260916q";
import { rememberClipTitle } from "./titleStore.js?v=20260916q";

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

function readLocal() {
  const raw = localStorage.getItem(CLIPS_KEY);
  if (!raw) return null;
  try {
    return normalizeClips(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocal(clips) {
  localStorage.setItem(CLIPS_KEY, JSON.stringify(clips));
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
  return deleted;
}

function unmarkDeleted(id) {
  const deleted = readDeletedIds();
  deleted.delete(String(id));
  writeDeletedIds(deleted);
}

function sortClips(clips) {
  return [...clips].sort((a, b) => Number(a.id) - Number(b.id));
}

/** One-time: drop old demo / requested leftover videos from this device. */
function runLibraryCleanup(clips) {
  try {
    if (localStorage.getItem(LIBRARY_CLEANUP_KEY) === "1") {
      return clips;
    }
  } catch {
    /* continue */
  }

  const purgeVideos = new Set(["sample", "img_1136", "img_1137"]);
  const kept = [];
  const removedIds = [];
  for (const clip of clips) {
    if (purgeVideos.has(String(clip.video_id))) removedIds.push(clip.id);
    else kept.push(clip);
  }
  if (removedIds.length) markDeleted(removedIds);
  removeVideos([...purgeVideos]);

  try {
    localStorage.setItem(LIBRARY_CLEANUP_KEY, "1");
  } catch {
    /* ignore */
  }
  return kept;
}

export async function loadClips() {
  const fromApi = await fetchJsonIfOk(resourceUrl("api/clips"));
  const seed = normalizeClips(
    fromApi || (await fetchJsonIfOk(resourceUrl("data/clips.json"))) || []
  );
  const deleted = readDeletedIds();
  const local = readLocal();

  if (fromApi) {
    const next = sortClips(seed.filter((clip) => !deleted.has(String(clip.id))));
    const cleaned = runLibraryCleanup(next);
    writeLocal(cleaned);
    return cleaned;
  }

  if (!local) {
    const next = sortClips(seed.filter((clip) => !deleted.has(String(clip.id))));
    const cleaned = runLibraryCleanup(next);
    writeLocal(cleaned);
    return cleaned;
  }

  // Local is source of truth. Seed may only add brand-new ids that were never deleted.
  const byId = new Map(local.map((clip) => [String(clip.id), clip]));
  for (const clip of seed) {
    const id = String(clip.id);
    if (deleted.has(id) || byId.has(id)) continue;
    byId.set(id, clip);
  }
  const next = sortClips(
    [...byId.values()].filter((clip) => !deleted.has(String(clip.id)))
  );
  const cleaned = runLibraryCleanup(next);
  writeLocal(cleaned);
  return cleaned;
}

export const getClips = loadClips;

export async function saveClips(clips) {
  const next = normalizeClips(clips).filter((clip) => !readDeletedIds().has(String(clip.id)));
  writeLocal(next);
  try {
    await fetch(resourceUrl("api/clips"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next, null, 2),
    });
  } catch {
    // localStorage already holds the clips
  }
  return next;
}

export async function getClip(id) {
  const clips = await loadClips();
  return clips.find((clip) => String(clip.id) === String(id)) || null;
}

export function nextClipId(clips) {
  return clips.reduce((max, clip) => Math.max(max, Number(clip.id) || 0), 0) + 1;
}

export async function upsertClip(partial) {
  const clips = await loadClips();
  const id = Number(partial.id) || nextClipId(clips);
  unmarkDeleted(id);
  const index = clips.findIndex((item) => item.id === id);
  const prev = index >= 0 ? clips[index] : null;
  const now = Date.now();
  const clip = normalizeClip({
    ...partial,
    id,
    created_at: prev?.created_at || partial.created_at || now,
    updated_at: now,
  });
  if (index >= 0) clips[index] = clip;
  else clips.push(clip);
  if (clip.title) rememberClipTitle(clip.title);
  await saveClips(clips);
  return clip;
}

export const saveClip = upsertClip;
export const updateClip = upsertClip;

export async function deleteClip(id) {
  markDeleted(id);
  const local = readLocal() || [];
  const clips = local.filter((clip) => String(clip.id) !== String(id));
  await saveClips(clips);
  return clips;
}

export async function deleteClipsByVideoId(videoId) {
  const clips = await loadClips();
  const removed = clips.filter((clip) => String(clip.video_id) === String(videoId));
  if (removed.length) markDeleted(removed.map((clip) => clip.id));
  const kept = clips.filter((clip) => String(clip.video_id) !== String(videoId));
  await saveClips(kept);
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
