import { VIDEO_BINDINGS_KEY } from "./constants.js?v=20260918h";
import {
  formatBytes,
  hasMediaBlob,
  loadMediaRecord,
  saveMediaBlob,
  deleteMediaBlob,
} from "./mediaStore.js?v=20260918h";
import { bundledOrHttpUrl, getVideo, upsertVideo, videoIdFromName } from "./videoList.js?v=20260918h";

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

export function fileFingerprint(fileLike) {
  return [
    String(fileLike?.name || fileLike?.filename || ""),
    Number(fileLike?.size) || 0,
    Number(fileLike?.lastModified) || 0,
  ].join("|");
}

/** Same Photos/Files pick → reuse one stored copy (avoids filling iPad after clip 5+). */
export function findReusableVideoId(file) {
  if (!file) return null;
  const fp = fileFingerprint(file);
  if (fp === "|0|0") return null;
  const bindings = readBindings();
  for (const [id, meta] of Object.entries(bindings)) {
    if (fileFingerprint(meta) === fp) return id;
  }
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

export async function bindLocalFile(videoId, file) {
  revoke(videoId);
  rememberBinding(videoId, file);

  // Already have this exact file on disk under this id — do not write another copy.
  try {
    const existing = await loadMediaRecord(videoId);
    if (
      existing?.blob &&
      Number(existing.size) === Number(file.size || 0) &&
      (existing.filename || "") === (file.name || `${videoId}.mp4`)
    ) {
      const url = URL.createObjectURL(existing.blob);
      objectUrls.set(videoId, url);
      return url;
    }
  } catch {
    /* save fresh below */
  }

  const url = URL.createObjectURL(file);
  objectUrls.set(videoId, url);
  try {
    await saveMediaBlob(videoId, file, {
      filename: file.name || `${videoId}.mp4`,
      type: file.type || "",
      lastModified: file.lastModified || 0,
    });
  } catch (err) {
    err.sessionUrl = url;
    throw err;
  }
  return url;
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

export async function bindPickedFile(file, preferredId) {
  if (!file) throw new Error("No file selected");
  const fallbackName = preferredId ? `${preferredId}.mp4` : `clip_${Date.now()}.mp4`;
  const name = file.name || fallbackName;

  const reusedId = findReusableVideoId(file);
  const videoId =
    reusedId ||
    preferredId ||
    `${videoIdFromName(name) || "video"}_${Date.now().toString(36)}`;

  await upsertVideo({
    id: videoId,
    title: name.replace(/\.[^.]+$/, "") || videoId,
    filename: name,
  });

  // Reuse path: blob already on device — just open it.
  if (reusedId && (await hasMediaBlob(reusedId))) {
    const url = await resolveVideoUrl(reusedId);
    if (url) {
      rememberBinding(reusedId, file);
      return { videoId: reusedId, url, persisted: true, reused: true };
    }
  }

  try {
    const url = await bindLocalFile(videoId, file);
    return { videoId, url, persisted: true, reused: Boolean(reusedId) };
  } catch (err) {
    if (err.sessionUrl) {
      return {
        videoId,
        url: err.sessionUrl,
        persisted: false,
        persistError: err.message,
        reused: Boolean(reusedId),
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
