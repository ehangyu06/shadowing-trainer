import { CLIPS_KEY } from "./constants.js?v=20260916g";
import { roundTenth } from "./time.js?v=20260916g";
import { fetchJsonIfOk, resourceUrl } from "./http.js?v=20260916g";
import { videoIdFromName } from "./videoList.js?v=20260916g";

function normalizeClip(clip, index = 0) {
  const legacyPath = String(clip.video || "");
  return {
    id: Number(clip.id) || index + 1,
    video_id: String(clip.video_id || videoIdFromName(legacyPath) || ""),
    start: roundTenth(clip.start ?? clip.start_time ?? 0),
    end: roundTenth(clip.end ?? clip.end_time ?? 0),
    english: String(clip.english || ""),
    korean: String(clip.korean || ""),
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

function mergeById(seed, local) {
  const map = new Map();
  for (const clip of seed) map.set(String(clip.id), clip);
  for (const clip of local) map.set(String(clip.id), clip);
  return [...map.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

export async function loadClips() {
  const fromApi = await fetchJsonIfOk(resourceUrl("api/clips"));
  const seed = normalizeClips(
    fromApi || (await fetchJsonIfOk(resourceUrl("data/clips.json"))) || []
  );
  const local = readLocal();
  if (fromApi) {
    writeLocal(seed);
    return seed;
  }
  if (!local) {
    writeLocal(seed);
    return seed;
  }
  const merged = mergeById(seed, local);
  writeLocal(merged);
  return merged;
}

export const getClips = loadClips;

export async function saveClips(clips) {
  const next = normalizeClips(clips);
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
  const clip = normalizeClip({ ...partial, id });
  const index = clips.findIndex((item) => item.id === id);
  if (index >= 0) clips[index] = clip;
  else clips.push(clip);
  await saveClips(clips);
  return clip;
}

export const saveClip = upsertClip;
export const updateClip = upsertClip;

export async function deleteClip(id) {
  const clips = (await loadClips()).filter((clip) => String(clip.id) !== String(id));
  await saveClips(clips);
  return clips;
}

export function neighborIds(clips, id) {
  const index = clips.findIndex((clip) => String(clip.id) === String(id));
  if (index < 0) return { prev: null, next: null };
  return {
    prev: index > 0 ? clips[index - 1].id : null,
    next: index < clips.length - 1 ? clips[index + 1].id : null,
  };
}
