import { getClip, loadClips, nextClipId, upsertClip, deleteClip } from "../clipStore.js";
import { loadVideos, uploadVideo } from "../videoList.js";
import { bindPickedFile, resolveVideoUrl } from "../videoSource.js";
import { createLoopPlayer, setVideoSource } from "../loopPlayer.js";
import { formatClock, roundTenth, clamp } from "../time.js";
import { el, seekFixPad, confirmAction } from "../ui.js";

function waitForVideoReady(videoEl, timeoutMs = 20000) {
  if (videoEl.readyState >= 1 && Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Video took too long to open"));
    }, timeoutMs);
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("This video cannot be played in Safari"));
    };
    function cleanup() {
      clearTimeout(timer);
      videoEl.removeEventListener("loadedmetadata", onReady);
      videoEl.removeEventListener("error", onError);
    }
    videoEl.addEventListener("loadedmetadata", onReady, { once: true });
    videoEl.addEventListener("error", onError, { once: true });
  });
}

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

  let activeMark = null;
  let startFixed = !isNew && draft.end > draft.start;
  let endFixed = !isNew && draft.end > draft.start;

  const currentTimeEl = el("p", { class: "time-readout", text: "Current: 00:00.0" });
  const rangeBoard = el("div", { class: "range-board hidden" }, [
    el("div", { class: "range-cell" }, [
      el("span", { class: "range-label", text: "Start =>" }),
      el("strong", { class: "range-value", "data-role": "start", text: "00:00.0" }),
    ]),
    el("div", { class: "range-cell" }, [
      el("span", { class: "range-label", text: "End =>" }),
      el("strong", { class: "range-value", "data-role": "end", text: "00:00.0" }),
    ]),
    el("div", { class: "range-cell" }, [
      el("span", { class: "range-label", text: "Duration :" }),
      el("strong", { class: "range-value", "data-role": "duration", text: "0.0" }),
    ]),
  ]);
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

  function refreshConfirmedBoard() {
    const ready = startFixed && endFixed && draft.end > draft.start;
    rangeBoard.classList.toggle("hidden", !ready);
    if (!ready) return;
    rangeBoard.querySelector('[data-role="start"]').textContent = formatClock(draft.start);
    rangeBoard.querySelector('[data-role="end"]').textContent = formatClock(draft.end);
    rangeBoard.querySelector('[data-role="duration"]').textContent = roundTenth(
      draft.end - draft.start
    ).toFixed(1);
  }

  function updateActivePadState() {
    const t = currentSafeTime();
    const playing = !video.paused;
    if (activeMark === "start" && !startFixed) {
      startPad.setState(`${t.toFixed(1)}s : ${playing ? "play" : "pause"}`);
    }
    if (activeMark === "end" && !endFixed) {
      endPad.setState(`${t.toFixed(1)}s : ${playing ? "play" : "pause"}`);
    }
  }

  function setActiveMark(which) {
    activeMark = which;
    startPad.setActive(which === "start");
    endPad.setActive(which === "end");
    refreshPlayButtons();
    updateActivePadState();
  }

  function refreshPlayButtons() {
    const playing = !video.paused;
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
    updateActivePadState();
  }

  function stopPreviewMode() {
    if (!previewing) return;
    previewing = false;
    previewBtn.textContent = "Preview Loop";
    previewBtn.classList.remove("btn-danger");
    player?.disable();
  }

  function currentSafeTime() {
    return clamp(roundTenth(video.currentTime || 0), 0, duration > 0 ? duration : Number.POSITIVE_INFINITY);
  }

  function nudgePlayhead(delta) {
    stopPreviewMode();
    player?.disable();
    video.pause();
    const max = duration > 0 ? duration : Number.POSITIVE_INFINITY;
    const next = clamp(roundTenth((video.currentTime || 0) + delta), 0, max);
    try {
      video.currentTime = next;
    } catch {
      status.textContent = "Video is not ready yet.";
      return;
    }
    currentTimeEl.textContent = `Current: ${formatClock(next)} (${next.toFixed(1)}s)`;
    status.textContent = `Moved to ${next.toFixed(1)}s`;
    if (activeMark === "start") startFixed = false;
    if (activeMark === "end") endFixed = false;
    refreshPlayButtons();
    refreshConfirmedBoard();
  }

  async function togglePlayPause() {
    stopPreviewMode();
    player?.disable();
    const wasPaused = video.paused;
    if (wasPaused) {
      try {
        const playPromise = video.play();
        if (playPromise && typeof playPromise.then === "function") {
          await playPromise;
        }
      } catch {
        status.textContent = "Could not play. Tap the video once, then press ▶ again.";
        refreshPlayButtons();
        return;
      }
    } else {
      video.pause();
    }
    if (activeMark === "start") startFixed = false;
    if (activeMark === "end") endFixed = false;
    refreshPlayButtons();
    refreshConfirmedBoard();
  }

  function setStart(value) {
    const max = duration > 0 ? duration : Number.POSITIVE_INFINITY;
    draft.start = clamp(roundTenth(value), 0, max);
    if (player) player.setRange(draft.start, draft.end);
  }

  function setEnd(value) {
    const max = duration > 0 ? duration : Number.POSITIVE_INFINITY;
    draft.end = clamp(roundTenth(value), 0, max);
    if (player) player.setRange(draft.start, draft.end);
  }

  function fixStart() {
    setActiveMark("start");
    player?.disable();
    video.pause();
    const t = currentSafeTime();
    setStart(t);
    startFixed = true;
    startPad.setState(`${t.toFixed(1)} → fix`, { fixed: true });
    status.textContent = `Start fixed at ${t.toFixed(1)}s`;
    refreshPlayButtons();
    refreshConfirmedBoard();
  }

  function fixEnd() {
    setActiveMark("end");
    player?.disable();
    video.pause();
    const t = currentSafeTime();
    setEnd(t);
    endFixed = true;
    endPad.setState(`${t.toFixed(1)} → fix`, { fixed: true });
    status.textContent = `End fixed at ${t.toFixed(1)}s`;
    refreshPlayButtons();
    refreshConfirmedBoard();
  }

  function undoStart() {
    setActiveMark("start");
    player?.disable();
    video.pause();
    startFixed = false;
    try {
      video.currentTime = draft.start;
    } catch {
      /* ignore */
    }
    const t = currentSafeTime();
    startPad.setState(`${t.toFixed(1)}s : pause`);
    status.textContent = "Start unlocked — adjust again, then Fix.";
    refreshPlayButtons();
    refreshConfirmedBoard();
  }

  function undoEnd() {
    setActiveMark("end");
    player?.disable();
    video.pause();
    endFixed = false;
    try {
      video.currentTime = draft.end > draft.start ? draft.end : draft.start;
    } catch {
      /* ignore */
    }
    const t = currentSafeTime();
    endPad.setState(`${t.toFixed(1)}s : pause`);
    status.textContent = "End unlocked — adjust again, then Fix.";
    refreshPlayButtons();
    refreshConfirmedBoard();
  }

  const startPad = seekFixPad({
    label: "Start",
    onActivate: () => setActiveMark("start"),
    onNudge: nudgePlayhead,
    onTogglePlay: togglePlayPause,
    onFix: fixStart,
    onUndo: undoStart,
  });

  const endPad = seekFixPad({
    label: "End",
    onActivate: () => {
      setActiveMark("end");
      // After Start is fixed, jump near the start so End editing is ready to play.
      if (startFixed && video.paused) {
        try {
          const target =
            draft.end > draft.start ? draft.start : Math.min(currentSafeTime(), duration || currentSafeTime());
          if (Math.abs((video.currentTime || 0) - target) > 0.15) {
            video.currentTime = target;
          }
        } catch {
          /* ignore */
        }
      }
    },
    onNudge: nudgePlayhead,
    onTogglePlay: togglePlayPause,
    onFix: fixEnd,
    onUndo: undoEnd,
  });

  if (startFixed) startPad.setState(`${draft.start.toFixed(1)} → fix`, { fixed: true });
  else startPad.setState("—");
  if (endFixed) endPad.setState(`${draft.end.toFixed(1)} → fix`, { fixed: true });
  else endPad.setState("—");

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
      return false;
    }
    setVideoSource(video, url);
    try {
      await waitForVideoReady(video);
      duration = video.duration || 0;
      if (isNew && draft.end <= draft.start) setEnd(duration);
      return true;
    } catch (err) {
      status.textContent = err.message || "Could not open video.";
      return false;
    }
  }

  video.addEventListener("loadedmetadata", () => {
    duration = video.duration || 0;
    if (isNew && draft.end <= draft.start) {
      setEnd(duration);
    }
  });

  video.addEventListener("timeupdate", () => {
    currentTimeEl.textContent = `Current: ${formatClock(video.currentTime)} (${roundTenth(video.currentTime).toFixed(1)}s)`;
    updateActivePadState();
  });
  video.addEventListener("play", refreshPlayButtons);
  video.addEventListener("pause", refreshPlayButtons);

  fillVideoSelect();
  videoSelect.addEventListener("change", async () => {
    draft.video_id = videoSelect.value;
    await loadSelectedVideo();
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
    refreshPlayButtons();
  });

  const fileInput = el("input", {
    type: "file",
    accept: "video/*,.mp4,.mov,.m4v",
    class: "file-input",
  });

  async function handlePickedFile(file) {
    if (!file) {
      status.textContent = "No file was selected.";
      return;
    }
    status.textContent = `Opening ${file.name || "video"}…`;
    stopPreviewMode();
    video.pause();
    try {
      const { videoId, url } = await bindPickedFile(file);
      draft.video_id = videoId;
      const fresh = await loadVideos();
      videos.splice(0, videos.length, ...fresh);
      fillVideoSelect();
      videoSelect.value = draft.video_id;
      setVideoSource(video, url);
      await waitForVideoReady(video);
      duration = video.duration || 0;
      if (draft.end <= draft.start) setEnd(duration);
      attachPlayer();
      uploadVideo(file).catch(() => {});
      status.textContent = `Ready: ${file.name || videoId} (${duration.toFixed(1)}s)`;
    } catch (err) {
      status.textContent = err.message || "Could not open this video. Try Files app → Browse, or another format.";
    } finally {
      fileInput.value = "";
    }
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    handlePickedFile(file);
  });

  const pickBtn = el("button", {
    type: "button",
    class: "btn btn-secondary btn-block",
    text: "Select Video File",
    onClick: () => fileInput.click(),
  });

  const sticky = el("div", { class: "editor-sticky" }, [
    el("div", { class: "video-shell" }, [video]),
    currentTimeEl,
    rangeBoard,
    el("div", { class: "btn-grid editor-set-row" }, [
      el("button", {
        type: "button",
        class: "btn btn-primary",
        text: "Set Start",
        onClick: fixStart,
      }),
      el("button", {
        type: "button",
        class: "btn btn-primary",
        text: "Set End",
        onClick: fixEnd,
      }),
    ]),
    pickBtn,
    fileInput,
    status,
  ]);

  const screen = el("section", { class: "editor-screen" }, [
    el("div", { class: "editor-top" }, [
      el("header", { class: "topbar editor-topbar" }, [
        el("h1", { text: isNew ? "New Clip" : "Edit Clip" }),
        el("a", { class: "btn btn-ghost", href: "#/", text: "Library" }),
      ]),
      sticky,
    ]),
    el("div", { class: "editor-body", id: "editor-scroll" }, [
      previewBtn,
      startPad,
      endPad,
      el("label", { class: "field-label", text: "Video" }),
      videoSelect,
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
    ]),
  ]);

  document.documentElement.classList.add("editor-lock");
  document.body.classList.add("editor-lock");
  refreshConfirmedBoard();
  refreshPlayButtons();
  root.replaceChildren(screen);
  if (draft.video_id) loadSelectedVideo();
  attachPlayer();
}
