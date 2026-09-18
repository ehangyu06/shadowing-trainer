import { ASSET_VERSION } from "../constants.js?v=20260918h";
import { loadClips, deleteClip } from "../clipStore.js?v=20260918h";
import { loadVideos } from "../videoList.js?v=20260918h";
import {
  expectedFilename,
  getLocalBinding,
  resolveVideoUrl,
} from "../videoSource.js?v=20260918h";
import { totalRepeats, loadSettings } from "../settingsStore.js?v=20260918h";
import { exportLibraryClipsIfChanged } from "../userData.js?v=20260918h";
import { backupReminderMessage, syncContentVault } from "../contentVault.js?v=20260918h";
import { el, confirmAction } from "../ui.js?v=20260918h";
import { formatDuration } from "../time.js?v=20260918h";
import {
  clearLibraryFocusClip,
  resolveLibraryFocusClip,
} from "../navMemory.js?v=20260918h";

export async function renderLibrary(root, hydrateInfo = null) {
  root.replaceChildren();
  const settings = loadSettings();
  const clips = await loadClips();
  syncContentVault().catch(() => {});
  const videos = await loadVideos();
  const total = totalRepeats(settings);
  const videoIds = [...new Set(clips.map((clip) => clip.video_id).filter(Boolean))];
  const statusByVideo = {};
  const focusId = resolveLibraryFocusClip();
  const reminder = backupReminderMessage();

  for (const videoId of videoIds) {
    const url = await resolveVideoUrl(videoId);
    const video = videos.find((item) => item.id === videoId);
    const binding = getLocalBinding(videoId);
    const wanted = expectedFilename(video, binding);
    statusByVideo[videoId] = { url, wanted };
  }

  const exportStatus = el("p", { class: "muted export-status", text: "" });
  if (hydrateInfo?.restored) {
    exportStatus.textContent = `복구됨: 백업 저장소에서 클립 ${hydrateInfo.clipCount}개를 되살렸습니다. 지금 Export로 Files에도 저장하세요.`;
    exportStatus.classList.add("export-status-warn");
  } else if (reminder) {
    exportStatus.textContent = reminder;
    exportStatus.classList.add("export-status-warn");
  }

  const exportBtn = el("button", {
    type: "button",
    class: "btn btn-secondary",
    text: "Export",
  });
  exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    exportStatus.textContent = "Exporting…";
    exportStatus.classList.remove("export-status-warn");
    try {
      await syncContentVault();
      const result = await exportLibraryClipsIfChanged();
      exportStatus.textContent = result.message || "";
      if (!result.skipped) exportStatus.classList.remove("export-status-warn");
      else if (result.reason === "unchanged") {
        exportStatus.textContent = result.message;
      }
    } catch (err) {
      exportStatus.textContent = err.message || "Could not export.";
    } finally {
      exportBtn.disabled = false;
    }
  });

  const nav = el("nav", { class: "library-nav-fixed", "aria-label": "Library actions" }, [
    el("a", { class: "btn btn-secondary", href: "#/videos", text: "Videos" }),
    el("a", { class: "btn btn-secondary", href: "#/settings", text: "Settings" }),
    exportBtn,
    el("a", { class: "btn btn-primary", href: "#/new", text: "New Clip" }),
  ]);

  const header = el("header", { class: "topbar library-topbar" }, [
    el("div", {}, [
      el("h1", { text: "Shadowing Trainer" }),
      el("p", {
        class: "muted",
        text: `Default session: ${settings.phases.join(" + ")} = ${total} loops · v${ASSET_VERSION}`,
      }),
      el("p", {
        class: "muted storage-note",
        text: "앱 업데이트(버전 숫자)는 클립을 지우지 않습니다. Safari 사이트 데이터를 지우면 사라집니다 — Export로 Files/iCloud에 백업하세요.",
      }),
      exportStatus,
    ]),
  ]);

  const list = el("div", { class: "clip-list" });
  let focusCard = null;
  if (!clips.length) {
    list.append(
      el("div", { class: "empty-card" }, [
        el("h2", { text: "No clips yet" }),
        el("p", {
          text: "Create a clip, or restore from Settings → Import Backup if you saved an Export file earlier.",
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

  root.append(el("section", { class: "screen library-screen" }, [nav, header, list]));

  if (focusCard) {
    requestAnimationFrame(() => {
      focusCard.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
      clearLibraryFocusClip();
    });
  }
}
