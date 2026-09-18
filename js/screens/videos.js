import { loadClips } from "../clipStore.js?v=20260918i";
import { loadVideos } from "../videoList.js?v=20260918i";
import {
  bindPickedFile,
  expectedFilename,
  evictVideoFromDevice,
  formatBytes,
  getLocalBinding,
  mediaStatusLabel,
  resolveVideoUrl,
} from "../videoSource.js?v=20260918i";
import { el, confirmAction } from "../ui.js?v=20260918i";

export async function renderVideos(root) {
  root.replaceChildren();
  const clips = await loadClips();
  const videos = await loadVideos();
  const videoIds = [...new Set(clips.map((clip) => clip.video_id).filter(Boolean))];

  const header = el("header", { class: "topbar" }, [
    el("div", {}, [
      el("h1", { text: "Videos" }),
      el("p", {
        class: "muted",
        text: "영화 파일은 기기 용량을 씁니다. 같은 영화는 클립이 많아도 1번만 저장됩니다. 안 쓰는 영화는 “Remove from iPad”로 용량만 비울 수 있습니다(클립 정보는 유지).",
      }),
    ]),
    el("div", { class: "topbar-actions" }, [
      el("a", { class: "btn btn-secondary", href: "#/", text: "Library" }),
    ]),
  ]);

  const list = el("div", { class: "bind-list" });
  if (!videoIds.length) {
    list.append(
      el("div", { class: "empty-card" }, [
        el("h2", { text: "No videos yet" }),
        el("p", {
          text: "Videos appear here after you create clips with Select Video File.",
        }),
        el("a", { class: "btn btn-primary", href: "#/", text: "Back to Library" }),
      ])
    );
  } else {
    list.append(
      el("p", {
        class: "muted bind-hint",
        text: "“Change Video File” replaces this source for every clip that uses it. “Remove from iPad” deletes only the big file copy — clip times/titles stay. Play again later with Select Video File.",
      })
    );
    for (const videoId of videoIds) {
      const url = await resolveVideoUrl(videoId);
      const video = videos.find((item) => item.id === videoId);
      const binding = getLocalBinding(videoId);
      const wanted = expectedFilename(video, binding);
      const users = clips.filter((clip) => String(clip.video_id) === String(videoId));
      const sizeLabel = binding?.size ? formatBytes(binding.size) : "";
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
        if (users.length > 1) {
          const ok = confirmAction(
            `This video is used by ${users.length} clips.\nReplace the file for ALL of them?\n\nTo change only one clip, use Edit → Select Video File.`
          );
          if (!ok) {
            input.value = "";
            return;
          }
        }
        try {
          const result = await bindPickedFile(file, videoId);
          if (result.persistError) {
            alert(`${result.persistError}\n\nVideo works for now, but may ask again after reload.`);
          }
        } catch (err) {
          alert(err.message || "Could not save this video.");
        }
        input.value = "";
        renderVideos(root);
      });

      const actions = el("div", { class: "bind-actions" }, [
        el("button", {
          type: "button",
          class: url ? "btn btn-secondary" : "btn btn-primary",
          text: url ? "Change Video File" : "Select Video File",
          onClick: () => input.click(),
        }),
      ]);
      if (url || binding?.size) {
        actions.append(
          el("button", {
            type: "button",
            class: "btn btn-ghost",
            text: sizeLabel ? `Remove from iPad (${sizeLabel})` : "Remove from iPad",
            onClick: async () => {
              const ok = confirmAction(
                `Remove this video file from the iPad to free space${sizeLabel ? ` (~${sizeLabel})` : ""}?\n\n` +
                  `${users.length} clip(s) keep their start/end times.\n` +
                  `To play again, select the movie file once more.`
              );
              if (!ok) return;
              try {
                await evictVideoFromDevice(videoId);
                renderVideos(root);
              } catch (err) {
                alert(err.message || "Could not remove video.");
              }
            },
          })
        );
      }

      row.append(
        el("div", { class: "bind-copy" }, [
          el("strong", { text: video?.title || videoId }),
          wanted ? el("p", { class: "bind-filename", text: wanted }) : null,
          el("p", {
            class: "muted",
            text: mediaStatusLabel(videoId, video, binding, url),
          }),
          el("p", {
            class: "muted",
            text: `Used by ${users.length} clip${users.length === 1 ? "" : "s"}`,
          }),
        ]),
        actions,
        input
      );
      list.append(row);
    }
  }

  root.append(el("section", { class: "screen videos-screen" }, [header, list]));
}
