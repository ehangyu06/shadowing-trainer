import { CLIP_TITLES_KEY } from "./constants.js?v=20260916r";

function uniqueKeepOrder(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = String(item || "").trim();
    if (!key) continue;
    const lower = key.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(key);
  }
  return out;
}

function readStoredTitles() {
  try {
    const raw = JSON.parse(localStorage.getItem(CLIP_TITLES_KEY) || "[]");
    return Array.isArray(raw) ? raw.map((t) => String(t || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeStoredTitles(titles) {
  localStorage.setItem(CLIP_TITLES_KEY, JSON.stringify(uniqueKeepOrder(titles).slice(0, 200)));
}

export function rememberClipTitle(title) {
  const clean = String(title || "").trim();
  if (!clean) return;
  writeStoredTitles([clean, ...readStoredTitles()]);
}

export function collectClipTitles(clips = []) {
  const fromClips = (clips || []).map((clip) => String(clip.title || "").trim()).filter(Boolean);
  return uniqueKeepOrder([...readStoredTitles(), ...fromClips]);
}

function titleBase(title) {
  return String(title || "")
    .trim()
    .replace(/\s+\d+$/, "")
    .trim();
}

function nextNumberedVariant(title, usedLower) {
  const base = titleBase(title);
  if (!base) return "";
  const used = usedLower instanceof Set ? usedLower : new Set(usedLower || []);
  for (let n = 2; n <= 99; n += 1) {
    const candidate = `${base} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return "";
}

/**
 * Suggest titles for the clip being edited.
 * - Titles already used by OTHER clips are not offered as-is.
 * - This clip's own original title may appear (so it can keep it).
 * - If another clip owns a matching name, only the next free "name 2" style option is offered.
 */
export function suggestClipTitles(input, clips = [], options = {}) {
  const currentId =
    options.currentClipId != null && options.currentClipId !== ""
      ? String(options.currentClipId)
      : null;
  const ownTitle = String(options.currentTitle || "").trim();
  const ownLower = ownTitle.toLowerCase();

  const takenByOthers = new Set();
  for (const clip of clips || []) {
    if (currentId && String(clip.id) === currentId) continue;
    const title = String(clip.title || "").trim();
    if (title) takenByOthers.add(title.toLowerCase());
  }

  const history = collectClipTitles(clips);
  const pool = uniqueKeepOrder([ownTitle, ...history]);
  const q = String(input || "").trim().toLowerCase();
  const matched = pool.filter((title) => {
    if (!q) return true;
    const lower = title.toLowerCase();
    return lower.startsWith(q) || lower.includes(q);
  });

  const out = [];
  for (const title of matched) {
    const lower = title.toLowerCase();
    const isOwn = Boolean(ownLower) && lower === ownLower;
    const taken = takenByOthers.has(lower);

    if (taken && !isOwn) {
      const numbered = nextNumberedVariant(title, takenByOthers);
      if (numbered) out.push(numbered);
      continue;
    }

    out.push(title);
  }

  if (!q && !out.length) {
    return pool
      .filter((title) => {
        const lower = title.toLowerCase();
        return lower === ownLower || !takenByOthers.has(lower);
      })
      .slice(0, 12);
  }

  return uniqueKeepOrder(out).slice(0, 12);
}

export function formatClipCreatedAt(ms) {
  const n = Number(ms) || 0;
  if (!n) return "";
  try {
    return new Date(n).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
