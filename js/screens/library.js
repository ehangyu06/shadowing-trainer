import { ASSET_VERSION } from "../constants.js?v=20260916r";
import { loadClips, deleteClip } from "../clipStore.js?v=20260916r";
import { loadVideos } from "../videoList.js?v=20260916r";
import {
  expectedFilename,
  getLocalBinding,
  resolveVideoUrl,
} from "../videoSource.js?v=20260916r";
import { totalRepeats, loadSettings } from "../settingsStore.js?v=20260916r";
import { el, confirmAction } from "../ui.js?v=20260916r";
import { formatDuration } from "../time.js?v=20260916r";
import {
  clearLibraryFocusClip,
  resolveLibraryFocusClip,
} from "../navMemory.js?v=20260916r";

export async function renderLibrary(root) {
  root.replaceChildren();
  const settings = loadSettings();
  const clips = await loadClips();
  const videos = await loadVideos();
  const total = totalRepeats(settings);
  const videoIds = [...new Set(clips.map((clip) => clip.video_id).filter(Boolean))];
  const statusByVideo = {};
  const focusId = resolveLibraryFocusClip();

  for (const videoId of videoIds) {
    const url = await resolveVideoUrl(videoId);
    const video = videos.find((item) => item.id === videoId);
    const binding = getLocalBinding(videoId);
    const wanted = expectedFilename(video, binding);
    statusByVideo[videoId] = { url, wanted };
  }

  const header = el("header", { class: "topbar" }, [
    el("div", {}, [
      el("h1", { text: "Shadowing Trainer" }),
      el("p", {
        class: "muted",
        text: `Default session: ${settings.phases.join(" + ")} = ${total} loops · v${ASSET_VERSION}`,
      }),
    ]),
    el("div", { class: "topbar-actions" }, [
      el("a", { class: "btn btn-secondary", href: "#/videos", text: "Videos" }),
      el("a", { class: "btn btn-secondary", href: "#/settings", text: "Settings" }),
      el("a", { class: "btn btn-primary", href: "#/new", text: "New Clip" }),
    ]),
  ]);

  const list = el("div", { class: "clip-list" });
  let focusCard = null;
  if (!clips.length) {
    list.append(
      el("div", { class: "empty-card" }, [
        el("h2", { text: "No clips yet" }),
        el("p", {
          text: "Create a clip at home, or select a video file and use Set Start / Set End.",
        }),
        el("a", { class: "btn btn-primary", href: "#/new", text: "Create First Clip" }),
      ])
    );
  } else {
    clips.forEach((clip, index) => {
      const duration = Math.max(0, clip.end - clip.start);
      const card = el("article", {
        class: "clip-card",
        "data-clip-id": String(clip.id),
      });
      if (focusId && String(clip.id) === String(focusId)) {
        card.classList.add("clip-card-focus");
        focusCard = card;
      }
      const open = el("a", { class: "clip-main", href: `#/train/${clip.id}` }, [
        el("div", { class: "clip-kicker", text: clip.title || `Clip ${index + 1}` }),
        clip.english
          ? el("p", { class: "clip-english", text: clip.english })
          : null,
        clip.korean
          ? el("p", { class: "clip-korean muted", text: clip.korean })
          : null,
        el("p", {
          class: "clip-meta muted",
          text: (() => {
            const status = statusByVideo[clip.video_id] || {};
            const name = status.wanted || clip.video_id || "no video";
            const ready = status.url ? "saved" : "needs file";
            return `${formatDuration(duration)} · ${name} · ${ready}`;
          })(),
        }),
      ]);
      const actions = el("div", { class: "clip-actions" }, [
        el("a", { class: "btn btn-secondary clip-action-btn", href: `#/edit/${clip.id}`, text: "Edit" }),
        el("button", {
          type: "button",
          class: "btn btn-ghost clip-action-btn",
          text: "Delete",
          onClick: async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!confirmAction("Delete this clip?")) return;
            try {
              await deleteClip(clip.id);
              await renderLibrary(root);
            } catch (err) {
              alert(err.message || "Could not delete clip.");
            }
          },
        }),
      ]);
      card.append(open, actions);
      list.append(card);
    });
  }

  root.append(el("section", { class: "screen library-screen" }, [header, list]));

  if (focusCard) {
    requestAnimationFrame(() => {
      focusCard.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
      clearLibraryFocusClip();
    });
  }
}
