import { VIDEO_BINDINGS_KEY } from "./constants.js?v=20260916u";
import { formatBytes, loadMediaRecord, saveMediaBlob } from "./mediaStore.js?v=20260916u";
import { bundledOrHttpUrl, getVideo, upsertVideo, videoIdFromName } from "./videoList.js?v=20260916u";

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

export function getLocalFileUrl(videoId) {
  return objectUrls.get(videoId) || null;
}

export async function bindLocalFile(videoId, file) {
  revoke(videoId);
  const url = URL.createObjectURL(file);
  objectUrls.set(videoId, url);
  rememberBinding(videoId, file);
  try {
    await saveMediaBlob(videoId, file, {
      filename: file.name || `${videoId}.mp4`,
      type: file.type || "",
      lastModified: file.lastModified || 0,
    });
  } catch (err) {
    // Keep the in-memory URL for this session even if disk save fails.
    err.sessionUrl = url;
    throw err;
  }
  return url;
}

/**
 * LocalFileVideoSource: iPad/Mac file picker or a small bundled/http relative file.
 * HomeServerVideoSource: add resolveHomeServerUrl() later for Mac mini + Tailscale.
 */
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
  const videoId = preferredId || videoIdFromName(name);
  await upsertVideo({
    id: videoId,
    title: name.replace(/\.[^.]+$/, "") || videoId,
    filename: name,
  });
  try {
    const url = await bindLocalFile(videoId, file);
    return { videoId, url, persisted: true };
  } catch (err) {
    if (err.sessionUrl) {
      return { videoId, url: err.sessionUrl, persisted: false, persistError: err.message };
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
