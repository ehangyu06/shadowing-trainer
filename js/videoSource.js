import { VIDEO_BINDINGS_KEY } from "./constants.js";
import { bundledOrHttpUrl, getVideo, upsertVideo, videoIdFromName } from "./videoList.js";

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

export function getLocalBinding(videoId) {
  return readBindings()[videoId] || null;
}

export function getLocalFileUrl(videoId) {
  return objectUrls.get(videoId) || null;
}

export function bindLocalFile(videoId, file) {
  revoke(videoId);
  const url = URL.createObjectURL(file);
  objectUrls.set(videoId, url);
  const bindings = readBindings();
  bindings[videoId] = {
    filename: file.name || `${videoId}.mp4`,
    size: file.size,
    lastModified: file.lastModified,
    type: file.type || "",
  };
  writeBindings(bindings);
  return url;
}

/**
 * LocalFileVideoSource: iPad/Mac file picker or a small bundled/http relative file.
 * HomeServerVideoSource: add resolveHomeServerUrl() later for Mac mini + Tailscale.
 */
export async function resolveHomeServerUrl(_videoId) {
  return null;
}

export async function resolveVideoUrl(videoId) {
  if (!videoId) return null;
  const local = getLocalFileUrl(videoId);
  if (local) return local;

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
  const url = bindLocalFile(videoId, file);
  return { videoId, url };
}

export function expectedFilename(video, binding) {
  return binding?.filename || video?.filename || "";
}
