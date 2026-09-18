import { VIDEO_BINDINGS_KEY } from "./constants.js?v=20260918i";
import {
  formatBytes,
  hasMediaBlob,
  loadMediaRecord,
  saveMediaBlob,
  deleteMediaBlob,
} from "./mediaStore.js?v=20260918i";
import { bundledOrHttpUrl, getVideo, upsertVideo, videoIdFromName } from "./videoList.js?v=20260918i";

export { formatBytes };

const objectUrls = new Map();

function readBindings() {
  try {
    return JSON.parse(localStorage.getItem(VIDEO_BINDINGS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function writeBindings(bindings) {
  localStorage.setItem(VIDEO_BINDINGS_KEY, JSON.stringify(bindings));
}

function revoke(videoId) {
  const prev = objectUrls.get(videoId);
  if (prev) URL.revokeObjectURL(prev);
  objectUrls.delete(videoId);
}

function fileName(fileLike) {
  return String(fileLike?.name || fileLike?.filename || "").trim().toLowerCase();
}

/**
 * Photos/iCloud often changes lastModified on every pick — do NOT use it for matching.
 * name + size is enough to treat it as the same movie.
 */
export function fileFingerprint(fileLike) {
  return `${fileName(fileLike)}|${Number(fileLike?.size) || 0}`;
}

/** Prefer an id that already has a blob on disk. */
export async function findReusableVideoId(file) {
  if (!file) return null;
  const name = fileName(file);
  const size = Number(file.size) || 0;
  if (!name && !size) return null;

  const bindings = readBindings();
  const entries = Object.entries(bindings);

  const nameSizeHits = entries.filter(
    ([, meta]) => fileName(meta) === name && Number(meta.size) === size
  );
  for (const [id] of nameSizeHits) {
    if (await hasMediaBlob(id)) return id;
  }
  if (nameSizeHits.length) return nameSizeHits[0][0];

  const nameHits = entries.filter(([, meta]) => fileName(meta) === name);
  for (const [id] of nameHits) {
    if (await hasMediaBlob(id)) return id;
  }
  if (nameHits.length === 1) return nameHits[0][0];

  return null;
}

function rememberBinding(videoId, fileLike) {
  const bindings = readBindings();
  bindings[videoId] = {
    filename: fileLike.name || fileLike.filename || `${videoId}.mp4`,
    size: fileLike.size || 0,
    lastModified: fileLike.lastModified || 0,
    type: fileLike.type || "",
    savedAt: Date.now(),
  };
  writeBindings(bindings);
  return bindings[videoId];
}

export function getLocalBinding(videoId) {
  return readBindings()[videoId] || null;
}

export function clearLocalBinding(videoId) {
  if (!videoId) return;
  const bindings = readBindings();
  delete bindings[videoId];
  writeBindings(bindings);
  revoke(videoId);
}

/**
 * Free device space used by the video file. Clip metadata is kept;
 * playback will ask to Select Video File again.
 */
export async function evictVideoFromDevice(videoId) {
  if (!videoId) return;
  clearLocalBinding(videoId);
  await deleteMediaBlob(videoId);
}

export function getLocalFileUrl(videoId) {
  return objectUrls.get(videoId) || null;
}

export async function bindLocalFile(videoId, file, { persist = true } = {}) {
  revoke(videoId);
  rememberBinding(videoId, file);

  try {
    const existing = await loadMediaRecord(videoId);
    if (
      existing?.blob &&
      Number(existing.size) === Number(file.size || 0) &&
      fileName(existing) === fileName(file)
    ) {
      const url = URL.createObjectURL(existing.blob);
      objectUrls.set(videoId, url);
      return { url, persisted: true, reusedBlob: true };
    }
  } catch {
    /* save fresh below */
  }

  const url = URL.createObjectURL(file);
  objectUrls.set(videoId, url);

  if (!persist) {
    return { url, persisted: false, reusedBlob: false };
  }

  try {
    await saveMediaBlob(videoId, file, {
      filename: file.name || `${videoId}.mp4`,
      type: file.type || "",
      lastModified: file.lastModified || 0,
    });
    return { url, persisted: true, reusedBlob: false };
  } catch (err) {
    err.sessionUrl = url;
    throw err;
  }
}

export async function resolveHomeServerUrl(_videoId) {
  return null;
}

async function restoreFromDisk(videoId) {
  const record = await loadMediaRecord(videoId);
  if (!record?.blob) return null;
  revoke(videoId);
  const url = URL.createObjectURL(record.blob);
  objectUrls.set(videoId, url);
  rememberBinding(videoId, {
    name: record.filename,
    size: record.size,
    lastModified: record.lastModified,
    type: record.type,
  });
  return url;
}

export async function resolveVideoUrl(videoId) {
  if (!videoId) return null;
  const local = getLocalFileUrl(videoId);
  if (local) return local;

  const restored = await restoreFromDisk(videoId);
  if (restored) return restored;

  const video = await getVideo(videoId);
  const httpUrl = await bundledOrHttpUrl(video);
  if (httpUrl) return httpUrl;

  return resolveHomeServerUrl(videoId);
}

/**
 * Attach a picked file. Always prefers reusing an on-device copy.
 * If Safari site storage is full, still opens the file for this session
 * so Save Clip can succeed without writing another multi‑GB blob.
 */
export async function bindPickedFile(file, preferredId) {
  if (!file) throw new Error("No file selected");
  const fallbackName = preferredId ? `${preferredId}.mp4` : `clip_${Date.now()}.mp4`;
  const name = file.name || fallbackName;

  const reusedId = await findReusableVideoId(file);
  const videoId =
    reusedId ||
    preferredId ||
    `${videoIdFromName(name) || "video"}_${Date.now().toString(36)}`;

  await upsertVideo({
    id: videoId,
    title: name.replace(/\.[^.]+$/, "") || videoId,
    filename: name,
  });

  if (reusedId && (await hasMediaBlob(reusedId))) {
    const url = await resolveVideoUrl(reusedId);
    if (url) {
      rememberBinding(reusedId, file);
      return { videoId: reusedId, url, persisted: true, reused: true };
    }
  }

  try {
    const result = await bindLocalFile(videoId, file, { persist: true });
    return {
      videoId,
      url: result.url,
      persisted: result.persisted,
      reused: Boolean(reusedId) || result.reusedBlob,
    };
  } catch (err) {
    // Safari site quota (NOT iPad free space). Keep session playback; allow Save Clip.
    if (err.sessionUrl) {
      // Last resort: any same-name blob already on device
      const fallbackId = await findReusableVideoId(file);
      if (fallbackId && fallbackId !== videoId && (await hasMediaBlob(fallbackId))) {
        const url = await resolveVideoUrl(fallbackId);
        if (url) {
          return {
            videoId: fallbackId,
            url,
            persisted: true,
            reused: true,
            persistError: null,
          };
        }
      }
      return {
        videoId,
        url: err.sessionUrl,
        persisted: false,
        reused: false,
        persistError:
          "Safari 사이트 저장 한도(아이패드 여유 용량과 별개)에 닿았습니다. 이번 세션에서는 재생·저장 가능합니다. Videos에서 Remove from iPad로 중복 영상을 지운 뒤, “이전 클립과 같은 영상”을 쓰세요.",
      };
    }
    throw err;
  }
}

export function expectedFilename(video, binding) {
  return binding?.filename || video?.filename || "";
}

export function mediaStatusLabel(videoId, video, binding, url) {
  const wanted = expectedFilename(video, binding);
  if (url) {
    const size = binding?.size ? ` · ${formatBytes(binding.size)}` : "";
    return wanted
      ? `Saved on this device: ${wanted}${size}`
      : `Saved on this device${size}`;
  }
  return wanted
    ? `Need once: select “${wanted}” from Photos / Files`
    : `Need once: select the video for ${videoId}`;
}
