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
    filename: file.name,
    size: file.size,
    lastModified: file.lastModified,
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
  const videoId = preferredId || videoIdFromName(file.name);
  await upsertVideo({
    id: videoId,
    title: file.name.replace(/\.[^.]+$/, ""),
    filename: file.name,
  });
  bindLocalFile(videoId, file);
  return videoId;
}

export function expectedFilename(video, binding) {
  return binding?.filename || video?.filename || "";
}
