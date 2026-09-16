import { LAST_PLAYED_CLIP_KEY, LIBRARY_FOCUS_CLIP_KEY } from "./constants.js?v=20260916t";

function readId(key) {
  try {
    const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
    if (raw == null || raw === "") return null;
    return String(raw);
  } catch {
    return null;
  }
}

function writeId(key, id, persistent = false) {
  if (id == null || id === "") return;
  const value = String(id);
  try {
    sessionStorage.setItem(key, value);
    if (persistent) localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function setLastPlayedClip(id) {
  writeId(LAST_PLAYED_CLIP_KEY, id, true);
}

export function getLastPlayedClip() {
  return readId(LAST_PLAYED_CLIP_KEY);
}

export function setLibraryFocusClip(id) {
  writeId(LIBRARY_FOCUS_CLIP_KEY, id, false);
}

export function clearLibraryFocusClip() {
  try {
    sessionStorage.removeItem(LIBRARY_FOCUS_CLIP_KEY);
  } catch {
    /* ignore */
  }
}

/** Prefer explicit focus (edit target); otherwise last played clip. */
export function resolveLibraryFocusClip({ preferId } = {}) {
  if (preferId != null && preferId !== "") return String(preferId);
  return readId(LIBRARY_FOCUS_CLIP_KEY) || getLastPlayedClip();
}

export function rememberReturnToLibrary({ editedClipId = null, isNew = false } = {}) {
  if (!isNew && editedClipId != null && editedClipId !== "") {
    setLibraryFocusClip(editedClipId);
    return;
  }
  const played = getLastPlayedClip();
  if (played) setLibraryFocusClip(played);
}
