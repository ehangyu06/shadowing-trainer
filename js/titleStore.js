import { CLIP_TITLES_KEY } from "./constants.js?v=20260916i";

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

function nextNumberedVariant(title, known) {
  const base = String(title || "")
    .trim()
    .replace(/\s+\d+$/, "")
    .trim();
  if (!base) return "";
  const used = new Set(known.map((t) => t.toLowerCase()));
  for (let n = 2; n <= 99; n += 1) {
    const candidate = `${base} ${n}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return "";
}

/**
 * Prefix/includes match + numbered follow-ups (e.g. "아쿠아리움… 2").
 */
export function suggestClipTitles(input, clips = []) {
  const history = collectClipTitles(clips);
  const q = String(input || "").trim().toLowerCase();
  const matched = history.filter((title) => {
    if (!q) return true;
    const lower = title.toLowerCase();
    return lower.startsWith(q) || lower.includes(q);
  });
  const out = [];
  for (const title of matched) {
    out.push(title);
    const numbered = nextNumberedVariant(title, history);
    if (numbered) out.push(numbered);
  }
  if (!q && !out.length) return history.slice(0, 12);
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
