import { ASSET_VERSION } from "../constants.js?v=20260916l";
import { loadClips, deleteClip } from "../clipStore.js?v=20260916l";
import { loadVideos } from "../videoList.js?v=20260916l";
import {
  bindPickedFile,
  expectedFilename,
  getLocalBinding,
  mediaStatusLabel,
  resolveVideoUrl,
} from "../videoSource.js?v=20260916l";
import { totalRepeats, loadSettings } from "../settingsStore.js?v=20260916l";
import { el, confirmAction } from "../ui.js?v=20260916l";
import { formatDuration } from "../time.js?v=20260916l";
import {
  clearLibraryFocusClip,
  resolveLibraryFocusClip,
} from "../navMemory.js?v=20260916l";

export async function renderLibrary(root) {
  root.replaceChildren();
  const settings = loadSettings();
  const clips = await loadClips();
  const videos = await loadVideos();
  const total = totalRepeats(settings);
  const videoIds = [...new Set(clips.map((clip) => clip.video_id).filter(Boolean))];
  const statusByVideo = {};
  const focusId = resolveLibraryFocusClip();

  const header = el("header", { class: "topbar" }, [
    el("div", {}, [
      el("h1", { text: "Shadowing Trainer" }),
      el("p", {
        class: "muted",
        text: `Default session: ${settings.phases.join(" + ")} = ${total} loops · v${ASSET_VERSION}`,
      }),
    ]),
    el("div", { class: "topbar-actions" }, [
      el("a", { class: "btn btn-secondary", href: "#/settings", text: "Settings" }),
      el("a", { class: "btn btn-primary", href: "#/new", text: "New Clip" }),
    ]),
  ]);

  const bindBox = el("div", { class: "bind-list" });
  if (videoIds.length) {
    bindBox.append(
      el("p", {
        class: "muted bind-hint",
        text: "Workplace tip: select each video once. It stays saved on this iPad until Safari clears site data.",
      })
    );
  }
  for (const videoId of videoIds) {
    const url = await resolveVideoUrl(videoId);
    const video = videos.find((item) => item.id === videoId);
    const binding = getLocalBinding(videoId);
    const wanted = expectedFilename(video, binding);
    statusByVideo[videoId] = { url, wanted };
    const row = el("div", {
      class: url ? "bind-row bind-row-ready" : "bind-row bind-row-need",
    });
    const input = el("input", {
      type: "file",
      accept: "video/*,.mp4,.mov,.m4v",
      class: "file-input",
    });
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const result = await bindPickedFile(file, videoId);
        if (result.persistError) {
          alert(`${result.persistError}\n\nVideo works for now, but may ask again after reload.`);
        }
      } catch (err) {
        alert(err.message || "Could not save this video.");
      }
      input.value = "";
      renderLibrary(root);
    });
    row.append(
      el("div", { class: "bind-copy" }, [
        el("strong", { text: videoId }),
        wanted
          ? el("p", { class: "bind-filename", text: wanted })
          : null,
        el("p", {
          class: "muted",
          text: mediaStatusLabel(videoId, video, binding, url),
        }),
      ]),
      el("button", {
        type: "button",
        class: url ? "btn btn-secondary" : "btn btn-primary",
        text: url ? "Change Video File" : "Select Video File",
        onClick: () => input.click(),
      }),
      input
    );
    bindBox.append(row);
  }

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

  const screen = el("section", { class: "screen library-screen" }, [
    header,
    videoIds.length ? bindBox : null,
    list,
  ]);
  root.append(screen);

  if (focusCard) {
    requestAnimationFrame(() => {
      focusCard.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
      clearLibraryFocusClip();
    });
  }
}
