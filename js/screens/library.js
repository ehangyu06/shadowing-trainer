import { loadClips, deleteClip } from "../clipStore.js";
import { loadVideos } from "../videoList.js";
import {
  bindPickedFile,
  expectedFilename,
  getLocalBinding,
  resolveVideoUrl,
} from "../videoSource.js";
import { totalRepeats, loadSettings } from "../settingsStore.js";
import { el, confirmAction } from "../ui.js";
import { formatDuration } from "../time.js";

export async function renderLibrary(root) {
  root.replaceChildren();
  const settings = loadSettings();
  const clips = await loadClips();
  const videos = await loadVideos();
  const total = totalRepeats(settings);
  const videoIds = [...new Set(clips.map((clip) => clip.video_id).filter(Boolean))];

  const header = el("header", { class: "topbar" }, [
    el("div", {}, [
      el("h1", { text: "Shadowing Trainer" }),
      el("p", {
        class: "muted",
        text: `Default session: ${settings.phases.join(" + ")} = ${total} loops`,
      }),
    ]),
    el("div", { class: "topbar-actions" }, [
      el("a", { class: "btn btn-secondary", href: "#/settings", text: "Settings" }),
      el("a", { class: "btn btn-primary", href: "#/new", text: "New Clip" }),
    ]),
  ]);

  const bindBox = el("div", { class: "bind-list" });
  for (const videoId of videoIds) {
    const url = await resolveVideoUrl(videoId);
    const video = videos.find((item) => item.id === videoId);
    const binding = getLocalBinding(videoId);
    const wanted = expectedFilename(video, binding);
    const row = el("div", { class: "bind-row" });
    const input = el("input", {
      type: "file",
    accept: "video/*,.mp4,.mov,.m4v",
    class: "file-input",
  });
  input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      await bindPickedFile(file, videoId);
      input.value = "";
      renderLibrary(root);
    });
    row.append(
      el("div", {}, [
        el("strong", { text: videoId }),
        el("p", {
          class: "muted",
          text: url
            ? "Ready on this device"
            : wanted
              ? `Select ${wanted} from Files`
              : "Select Video File from Files",
        }),
      ]),
      el("button", {
        type: "button",
        class: "btn btn-secondary",
        text: url ? "Change Video File" : "Select Video File",
        onClick: () => input.click(),
      }),
      input
    );
    bindBox.append(row);
  }

  const list = el("div", { class: "clip-list" });
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
      const card = el("article", { class: "clip-card" });
      const open = el("a", { class: "clip-main", href: `#/train/${clip.id}` }, [
        el("div", { class: "clip-kicker", text: `Clip ${index + 1}` }),
        el("p", {
          class: "clip-english",
          text: clip.english || "(No English subtitle)",
        }),
        el("p", {
          class: "clip-korean muted",
          text: clip.korean || "",
        }),
        el("p", {
          class: "clip-meta muted",
          text: `${formatDuration(duration)} · ${clip.video_id || "no video"}`,
        }),
      ]);
      const actions = el("div", { class: "clip-actions" }, [
        el("a", { class: "btn btn-secondary", href: `#/edit/${clip.id}`, text: "Edit Clip" }),
        el(
          "button",
          {
            type: "button",
            class: "btn btn-ghost",
            text: "Delete",
            onClick: async () => {
              if (!confirmAction("Delete this clip?")) return;
              await deleteClip(clip.id);
              renderLibrary(root);
            },
          }
        ),
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
}
