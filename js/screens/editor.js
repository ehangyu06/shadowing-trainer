import { getClip, loadClips, nextClipId, upsertClip, deleteClip } from "../clipStore.js";
import { loadVideos, uploadVideo } from "../videoList.js";
import { bindPickedFile, resolveVideoUrl } from "../videoSource.js";
import { createLoopPlayer, setVideoSource } from "../loopPlayer.js";
import { formatClock, formatDuration, roundTenth, clamp } from "../time.js";
import { el, timeMarkPad, confirmAction } from "../ui.js";

export async function renderEditor(root, clipId) {
  const videos = await loadVideos();
  const clips = await loadClips();
  const existing = clipId ? await getClip(clipId) : null;
  const isNew = !existing;

  const draft = existing
    ? { ...existing }
    : {
        id: nextClipId(clips),
        video_id: videos[0]?.id || "",
        start: 0,
        end: 0,
        english: "",
        korean: "",
      };

  let duration = 0;
  let previewing = false;
  let player = null;
  let activeMark = null;

  root.replaceChildren();

  const video = el("video", {
    class: "editor-video",
    playsinline: true,
    "webkit-playsinline": true,
    controls: true,
    preload: "auto",
  });
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");

  const currentTimeEl = el("p", { class: "time-readout", text: "Current: 00:00.0" });
  const rangeEl = el("p", { class: "time-readout" });
  const status = el("p", { class: "status-line" });

  const englishInput = el("textarea", {
    class: "text-input",
    rows: "3",
    placeholder: "English subtitle",
  });
  englishInput.value = draft.english;
  const koreanInput = el("textarea", {
    class: "text-input",
    rows: "3",
    placeholder: "한글 자막",
  });
  koreanInput.value = draft.korean;

  const videoSelect = el("select", { class: "select-input" });

  function fillVideoSelect() {
    videoSelect.replaceChildren();
    if (!videos.length) {
      videoSelect.append(el("option", { value: "", text: "No videos yet" }));
      return;
    }
    for (const item of videos) {
      const opt = el("option", { value: item.id, text: `${item.title} (${item.id})` });
      if (item.id === draft.video_id) opt.selected = true;
      videoSelect.append(opt);
    }
    if (draft.video_id && !videos.some((item) => item.id === draft.video_id)) {
      videoSelect.append(
        el("option", { value: draft.video_id, text: `${draft.video_id} (missing)`, selected: true })
      );
    }
  }

  function refreshRange() {
    const len = Math.max(0, roundTenth(draft.end - draft.start));
    rangeEl.textContent = `Start: ${formatClock(draft.start)}   End: ${formatClock(draft.end)}   Duration: ${formatDuration(len)}`;
  }

  function stopPreviewMode() {
    if (!previewing) return;
    previewing = false;
    previewBtn.textContent = "Preview Loop";
    previewBtn.classList.remove("btn-danger");
    player?.disable();
  }

  function syncMarkPlaying() {
    const playing = !video.paused && !previewing;
    if (activeMark === "start") {
      startPad.setPlaying(playing);
      endPad.setPlaying(false);
    } else if (activeMark === "end") {
      endPad.setPlaying(playing);
      startPad.setPlaying(false);
    } else {
      startPad.setPlaying(false);
      endPad.setPlaying(false);
    }
  }

  async function playFromMark(which, mark, currentlyPlaying) {
    stopPreviewMode();
    if (currentlyPlaying) {
      video.pause();
      activeMark = null;
      syncMarkPlaying();
      return false;
    }
    activeMark = which;
    const t = clamp(roundTenth(mark), 0, duration > 0 ? duration : mark);
    try {
      video.currentTime = t;
    } catch {
      /* metadata may not be ready */
    }
    try {
      await video.play();
      status.textContent = `${which === "start" ? "Start" : "End"} preview from ${t.toFixed(1)}s — tap the center button again to stop.`;
      syncMarkPlaying();
      return true;
    } catch {
      status.textContent = "Tap Play on the video once, then try again.";
      activeMark = null;
      syncMarkPlaying();
      return false;
    }
  }

  function seekToMark(mark) {
    stopPreviewMode();
    activeMark = null;
    video.pause();
    try {
      video.currentTime = clamp(roundTenth(mark), 0, duration > 0 ? duration : mark);
    } catch {
      /* ignore */
    }
    syncMarkPlaying();
  }

  function setStart(value) {
    const max = duration > 0 ? duration : Number.POSITIVE_INFINITY;
    draft.start = clamp(roundTenth(value), 0, max);
    startPad.setValue(draft.start);
    refreshRange();
    if (player) player.setRange(draft.start, draft.end);
  }

  function setEnd(value) {
    const max = duration > 0 ? duration : Number.POSITIVE_INFINITY;
    draft.end = clamp(roundTenth(value), 0, max);
    endPad.setValue(draft.end);
    refreshRange();
    if (player) player.setRange(draft.start, draft.end);
  }

  const startPad = timeMarkPad({
    label: "Start",
    value: draft.start,
    onAdjust: (mark) => {
      seekToMark(mark);
      status.textContent = `Start candidate ${mark.toFixed(1)}s — Fix when it looks right.`;
    },
    onTogglePlay: (mark, playing) => playFromMark("start", mark, playing),
    onFix: (mark) => {
      setStart(mark);
      seekToMark(draft.start);
      status.textContent = `Start fixed at ${draft.start.toFixed(1)}s`;
    },
  });

  const endPad = timeMarkPad({
    label: "End",
    value: draft.end,
    onAdjust: (mark) => {
      seekToMark(mark);
      status.textContent = `End candidate ${mark.toFixed(1)}s — Fix when it looks right.`;
    },
    onTogglePlay: (mark, playing) => playFromMark("end", mark, playing),
    onFix: (mark) => {
      setEnd(mark);
      seekToMark(draft.end);
      status.textContent = `End fixed at ${draft.end.toFixed(1)}s`;
    },
  });

  function attachPlayer() {
    if (player) player.destroy();
    player = createLoopPlayer(video);
    player.setRange(draft.start, draft.end);
    player.setOnCycleEnd(() => previewing);
    if (previewing) player.enable();
    else player.disable();
  }

  async function loadSelectedVideo() {
    if (!draft.video_id) return;
    const url = await resolveVideoUrl(draft.video_id);
    if (!url) {
      status.textContent = `Select a video file for ${draft.video_id}.`;
      return;
    }
    setVideoSource(video, url);
    video.load();
  }

  video.addEventListener("loadedmetadata", () => {
    duration = video.duration || 0;
    startPad.setMax(duration || 24 * 60 * 60);
    endPad.setMax(duration || 24 * 60 * 60);
    if (isNew && draft.end <= draft.start) {
      setEnd(duration);
    }
  });

  video.addEventListener("timeupdate", () => {
    currentTimeEl.textContent = `Current: ${formatClock(video.currentTime)} (${roundTenth(video.currentTime).toFixed(1)}s)`;
  });
  video.addEventListener("play", syncMarkPlaying);
  video.addEventListener("pause", () => {
    if (!previewing) {
      activeMark = null;
      syncMarkPlaying();
    }
  });

  fillVideoSelect();
  videoSelect.addEventListener("change", () => {
    draft.video_id = videoSelect.value;
    loadSelectedVideo();
    attachPlayer();
  });

  const previewBtn = el("button", {
    type: "button",
    class: "btn btn-secondary",
    text: "Preview Loop",
  });
  previewBtn.addEventListener("click", async () => {
    if (draft.end <= draft.start) {
      status.textContent = "Fix End later than Start before previewing.";
      return;
    }
    activeMark = null;
    startPad.setPlaying(false);
    endPad.setPlaying(false);
    previewing = !previewing;
    previewBtn.textContent = previewing ? "Stop Preview" : "Preview Loop";
    previewBtn.classList.toggle("btn-danger", previewing);
    player.setRange(draft.start, draft.end);
    if (previewing) {
      player.seekToStart();
      player.enable();
      try {
        await video.play();
      } catch {
        status.textContent = "Tap Play on the video, then Preview Loop again.";
        previewing = false;
        player.disable();
        previewBtn.textContent = "Preview Loop";
        previewBtn.classList.remove("btn-danger");
      }
    } else {
      player.disable();
      video.pause();
    }
  });

  const fileInput = el("input", {
    type: "file",
    accept: "video/mp4,video/quicktime,video/*",
    class: "file-input",
  });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    status.textContent = "Linking video file…";
    const videoId = await bindPickedFile(file);
    draft.video_id = videoId;
    const fresh = await loadVideos();
    videos.splice(0, videos.length, ...fresh);
    fillVideoSelect();
    videoSelect.value = draft.video_id;
    try {
      await uploadVideo(file);
    } catch {
      // GitHub Pages and iPad have no upload API. Local file binding is enough.
    }
    await loadSelectedVideo();
    attachPlayer();
    status.textContent = `Linked ${file.name} to ${videoId}`;
  });

  const screen = el("section", { class: "screen editor-screen" }, [
    el("header", { class: "topbar" }, [
      el("h1", { text: isNew ? "New Clip" : "Edit Clip" }),
      el("a", { class: "btn btn-ghost", href: "#/", text: "Library" }),
    ]),
    el("div", { class: "video-shell" }, [video]),
    currentTimeEl,
    rangeEl,
    el("div", { class: "btn-grid" }, [
      el("button", {
        type: "button",
        class: "btn btn-primary",
        text: "Set Start",
        onClick: () => {
          setStart(video.currentTime || 0);
          status.textContent = `Start fixed at ${draft.start.toFixed(1)}s`;
        },
      }),
      el("button", {
        type: "button",
        class: "btn btn-primary",
        text: "Set End",
        onClick: () => {
          setEnd(video.currentTime || 0);
          status.textContent = `End fixed at ${draft.end.toFixed(1)}s`;
        },
      }),
      previewBtn,
    ]),
    startPad,
    endPad,
    el("label", { class: "field-label", text: "Video" }),
    videoSelect,
    el("label", { class: "btn btn-secondary btn-block file-btn" }, [
      "Select Video File",
      fileInput,
    ]),
    el("label", { class: "field-label", text: "English subtitle" }),
    englishInput,
    el("label", { class: "field-label", text: "한글 자막" }),
    koreanInput,
    el("div", { class: "stack-actions" }, [
      el("button", {
        type: "button",
        class: "btn btn-primary btn-block",
        text: "Save Clip",
        onClick: async () => {
          draft.english = englishInput.value.trim();
          draft.korean = koreanInput.value.trim();
          if (!draft.video_id) {
            status.textContent = "Choose or select a video first.";
            return;
          }
          if (draft.end <= draft.start) {
            status.textContent = "End must be later than Start.";
            return;
          }
          await upsertClip(draft);
          status.textContent = "Clip saved.";
          location.hash = "#/";
        },
      }),
      !isNew &&
        el("button", {
          type: "button",
          class: "btn btn-ghost btn-block",
          text: "Delete Clip",
          onClick: async () => {
            if (!confirmAction("Delete this clip?")) return;
            await deleteClip(draft.id);
            location.hash = "#/";
          },
        }),
      el("a", { class: "btn btn-ghost btn-block", href: "#/", text: "Cancel" }),
    ]),
    status,
  ]);

  refreshRange();
  root.append(screen);
  if (draft.video_id) loadSelectedVideo();
  attachPlayer();
}
