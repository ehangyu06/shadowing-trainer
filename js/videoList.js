import { fetchJsonIfOk, resourceUrl, urlLooksReachable, isLocalMediaHost } from "./http.js?v=20260916m";
import { VIDEO_BINDINGS_KEY } from "./constants.js?v=20260916m";
import { deleteMediaBlob } from "./mediaStore.js?v=20260916m";

export const VIDEO_CATALOG_KEY = "shadowing-trainer:videos";

export function videoIdFromName(name) {
  const base = String(name || "")
    .split("/")
    .pop()
    .replace(/\.[^.]+$/, "");
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return slug || `video_${Date.now().toString(36)}`;
}

function normalizeVideo(item) {
  const filename = String(item.filename || "").split("/").pop() || "";
  const legacyFile = String(item.file || "").split("/").pop() || "";
  const file = filename || legacyFile;
  const id = String(item.id || videoIdFromName(file || item.title || "video"));
  return {
    id,
    title: String(item.title || file.replace(/\.[^.]+$/, "") || id),
    filename: file,
    bundled: Boolean(item.bundled),
  };
}

function readLocalCatalog() {
  try {
    const raw = localStorage.getItem(VIDEO_CATALOG_KEY);
    if (!raw) return [];
    return JSON.parse(raw).map(normalizeVideo);
  } catch {
    return [];
  }
}

function writeLocalCatalog(videos) {
  localStorage.setItem(VIDEO_CATALOG_KEY, JSON.stringify(videos));
}

function mergeVideos(lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const item of list || []) {
      const video = normalizeVideo(item);
      const prev = byId.get(video.id) || {};
      byId.set(video.id, { ...prev, ...video });
    }
  }
  return [...byId.values()];
}

export async function loadVideos() {
  const seed = (await fetchJsonIfOk(resourceUrl("data/videos.json"))) || [];
  const local = readLocalCatalog();
  const api = (await fetchJsonIfOk(resourceUrl("api/videos"))) || [];
  const videos = mergeVideos([seed, api, local]);
  writeLocalCatalog(videos);
  return videos;
}

export async function getVideo(videoId) {
  const videos = await loadVideos();
  return videos.find((item) => item.id === videoId) || null;
}

export async function upsertVideo(partial) {
  const videos = await loadVideos();
  const video = normalizeVideo(partial);
  const index = videos.findIndex((item) => item.id === video.id);
  if (index >= 0) videos[index] = { ...videos[index], ...video };
  else videos.push(video);
  writeLocalCatalog(videos);
  return video;
}

export function removeVideos(videoIds) {
  const ids = new Set([].concat(videoIds || []).map((id) => String(id)).filter(Boolean));
  if (!ids.size) return [];
  const videos = readLocalCatalog().filter((item) => !ids.has(String(item.id)));
  writeLocalCatalog(videos);
  try {
    const bindings = JSON.parse(localStorage.getItem(VIDEO_BINDINGS_KEY) || "{}") || {};
    for (const id of ids) delete bindings[id];
    localStorage.setItem(VIDEO_BINDINGS_KEY, JSON.stringify(bindings));
  } catch {
    /* ignore */
  }
  for (const id of ids) {
    deleteMediaBlob(id).catch(() => {});
  }
  return videos;
}

export async function uploadVideo(file) {
  if (!isLocalMediaHost()) {
    return { ok: false, skipped: true };
  }
  const body = new FormData();
  body.append("file", file, file.name || "video.mp4");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(resourceUrl("api/upload"), {
      method: "POST",
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Upload failed");
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function bundledOrHttpUrl(video) {
  if (!video?.filename) return null;
  const relative = `videos/${video.filename}`;
  if (video.bundled) return relative;
  const url = resourceUrl(relative);
  if (await urlLooksReachable(url)) return relative;
  return null;
}
