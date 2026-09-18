export const PHASES = [
  { id: 1, name: "No Subtitle", short: "1 No Subtitle", subtitle: "none" },
  { id: 2, name: "Korean Only", short: "2 Korean", subtitle: "korean" },
  { id: 3, name: "Korean + English", short: "3 Korean + English", subtitle: "both" },
  { id: 4, name: "English Only", short: "4 English", subtitle: "english" },
  { id: 5, name: "No Subtitle", short: "5 No Subtitle", subtitle: "none" },
];

export const SUBTITLE_MODES = [
  { id: "auto", label: "Auto" },
  { id: "none", label: "None" },
  { id: "korean", label: "Korean" },
  { id: "english", label: "English" },
  { id: "both", label: "Korean + English" },
];

export const PLAYBACK_RATES = [0.75, 0.9, 1.0, 1.1, 1.25];

export function formatRate(rate) {
  if (rate === 0.75 || rate === 1.25) return `${rate}x`;
  return `${Number(rate).toFixed(1)}x`;
}

export const SETTINGS_KEY = "shadowing-trainer:settings";
export const CLIPS_KEY = "shadowing-trainer:clips";
/** Redundant localStorage copy — used if primary clips key is empty. */
export const CLIPS_MIRROR_KEY = "shadowing-trainer:clips-mirror";
export const CLIPS_DELETED_KEY = "shadowing-trainer:clips-deleted";
export const VIDEO_BINDINGS_KEY = "shadowing-trainer:video-bindings";
export const CLIP_TITLES_KEY = "shadowing-trainer:clip-titles";
export const LAST_PLAYED_CLIP_KEY = "shadowing-trainer:last-played-clip";
export const LIBRARY_FOCUS_CLIP_KEY = "shadowing-trainer:library-focus-clip";
export const LIBRARY_CLEANUP_KEY = "shadowing-trainer:library-cleanup-v2";
/** Fingerprints of clips included in the last successful Export (skip duplicate exports). */
export const LAST_EXPORT_SNAPSHOT_KEY = "shadowing-trainer:last-export-snapshot";

/**
 * App code version (cache bust). Bumping this updates UI/JS only.
 * Never clear or rename the keys above when bumping — user content must survive.
 * Backup/restore: Library → Export, Settings → Import Backup (js/userData.js).
 */
export const ASSET_VERSION = "20260918j";

export const DEFAULT_PHASE_COUNTS = [3, 3, 3, 20, 20];
export const DEFAULT_PLAYBACK_RATE = 1.0;

export const MIN_PHASE_COUNT = 0;
export const MAX_PHASE_COUNT = 999;
export const TIME_STEP = 0.1;
