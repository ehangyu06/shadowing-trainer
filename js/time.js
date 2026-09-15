export function roundTenth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function parseTimeInput(raw) {
  const text = String(raw).trim();
  if (!text) return null;
  if (text.includes(":")) {
    const parts = text.split(":");
    if (parts.length === 2) {
      const minutes = Number(parts[0]);
      const seconds = Number(parts[1]);
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
      return roundTenth(minutes * 60 + seconds);
    }
  }
  const n = Number(text);
  return Number.isFinite(n) ? roundTenth(n) : null;
}

export function formatClock(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const totalTenths = Math.round(safe * 10);
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${tenths}`;
}

export function formatDuration(seconds) {
  const safe = Math.max(0, roundTenth(seconds));
  if (safe < 60) return `${safe.toFixed(1)} sec`;
  return formatClock(safe);
}
