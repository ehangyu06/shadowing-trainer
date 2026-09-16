import {
  SETTINGS_KEY,
  DEFAULT_PHASE_COUNTS,
  DEFAULT_PLAYBACK_RATE,
  PLAYBACK_RATES,
  MIN_PHASE_COUNT,
  MAX_PHASE_COUNT,
} from "./constants.js?v=20260916u";

function sanitizeCount(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_PHASE_COUNT, Math.max(MIN_PHASE_COUNT, Math.round(n)));
}

function sanitizeRate(value) {
  const n = Number(value);
  return PLAYBACK_RATES.includes(n) ? n : DEFAULT_PLAYBACK_RATE;
}

export function defaultSettings() {
  return {
    phases: [...DEFAULT_PHASE_COUNTS],
    playbackRate: DEFAULT_PLAYBACK_RATE,
  };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw);
    const phases = DEFAULT_PHASE_COUNTS.map((fallback, i) =>
      sanitizeCount(parsed?.phases?.[i], fallback)
    );
    return {
      phases,
      playbackRate: sanitizeRate(parsed?.playbackRate),
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings) {
  const next = {
    phases: DEFAULT_PHASE_COUNTS.map((fallback, i) =>
      sanitizeCount(settings?.phases?.[i], fallback)
    ),
    playbackRate: sanitizeRate(settings?.playbackRate),
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function resetSettings() {
  const next = defaultSettings();
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function totalRepeats(settings) {
  const s = settings || loadSettings();
  return s.phases.reduce((sum, n) => sum + n, 0);
}
