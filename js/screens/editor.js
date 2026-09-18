import { getClip, loadClips, upsertClip, deleteClip } from "../clipStore.js?v=20260918j";
import { loadVideos, uploadVideo } from "../videoList.js?v=20260918j";
import { bindPickedFile, resolveVideoUrl } from "../videoSource.js?v=20260918j";
import { createLoopPlayer, setVideoSource } from "../loopPlayer.js?v=20260918j";
import { formatClock, roundTenth, clamp, formatDuration } from "../time.js?v=20260918j";
import { el, seekFixPad, confirmAction } from "../ui.js?v=20260918j";
import {
  formatClipCreatedAt,
  suggestClipTitles,
  nextNumberedVariant,
} from "../titleStore.js?v=20260918j";
import { setLibraryFocusClip, rememberReturnToLibrary } from "../navMemory.js?v=20260918j";

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
        id: null,
        video_id: "",
        title: "",
        start: 0,
        end: 0,
        english: "",
        korean: "",
        created_at: 0,
      };
  if (draft.title == null) draft.title = "";
  if (!draft.created_at) draft.created_at = existing?.created_at || 0;

  // New clip: automatically keep using the last clip's movie — no extra steps.
  if (isNew && !draft.video_id) {
    const last = [...clips].reverse().find((c) => c.video_id);
    if (last?.video_id) draft.video_id = last.video_id;
  }

  function goLibrary() {
    rememberReturnToLibrary({ editedClipId: draft.id, isNew });
    location.hash = "#/";
  }

  function goLibraryAfterSave(savedId) {
    setLibraryFocusClip(savedId);
    location.hash = "#/";
  }

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
  const clipInfoEl = el("div", { class: "editor-clip-info" });
  let titleInput = null;

  function refreshClipInfo() {
    const title = (titleInput?.value || draft.title || "").trim() || "(이름 없음)";
    const span =
      draft.end > draft.start ? formatDuration(draft.end - draft.start) : "—";
    const made = formatClipCreatedAt(draft.created_at) || (isNew ? "새 클립" : "—");
    clipInfoEl.replaceChildren(
      el("p", { class: "editor-clip-info-title", text: title }),
      el("p", {
        class: "muted editor-clip-info-meta",
        text: `길이 ${span} · ${made}`,
      })
    );
  }

  const titleSuggest = el("div", { class: "title-suggest hidden" });
  titleInput = el("input", {
    type: "text",
    class: "text-input title-input",
    placeholder: "비디오 이름",
    autocomplete: "off",
    autocorrect: "off",
    spellcheck: "false",
  });
  titleInput.value = draft.title || "";

  // New clip: offer next number after existing series (e.g. …5 → …6).
  if (isNew && !draft.title && clips.length) {
    const taken = new Set(
      clips.map((c) => String(c.title || "").trim().toLowerCase()).filter(Boolean)
    );
    const latest = [...clips].reverse().find((c) => String(c.title || "").trim());
    if (latest?.title) {
      const suggested = nextNumberedVariant(latest.title, taken);
      if (suggested) {
        titleInput.value = suggested;
        draft.title = suggested;
      }
    }
  }

  function hideTitleSuggest() {
    titleSuggest.classList.add("hidden");
    titleSuggest.replaceChildren();
  }

  function showTitleSuggest() {
    const suggestions = suggestClipTitles(titleInput.value, clips, {
      currentClipId: draft.id,
      currentTitle: existing?.title || "",
    });
    titleSuggest.replaceChildren();
    if (!suggestions.length) {
      hideTitleSuggest();
      return;
    }
    for (const suggestion of suggestions) {
      titleSuggest.append(
        el("button", {
          type: "button",
          class: "title-suggest-item",
          text: suggestion,
          onClick: () => {
            titleInput.value = suggestion;
            draft.title = suggestion;
            hideTitleSuggest();
            refreshClipInfo();
          },
        })
      );
    }
    titleSuggest.classList.remove("hidden");
  }

  titleInput.addEventListener("input", () => {
    draft.title = titleInput.value.trim();
    refreshClipInfo();
    showTitleSuggest();
  });
  titleInput.addEventListener("focus", () => showTitleSuggest());
  titleInput.addEventListener("blur", () => {
    setTimeout(hideTitleSuggest, 180);
  });

  const titleField = el("div", { class: "title-field" }, [
    el("label", { class: "field-label", text: "비디오 이름" }),
    titleInput,
    titleSuggest,
  ]);

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

  function refreshConfirmedBoard() {
    const ready = startFixed && endFixed && draft.end > draft.start;
    rangeBoard.classList.toggle("hidden", !ready);
    if (!ready) {
      refreshClipInfo();
      return;
    }
    rangeBoard.querySelector('[data-role="start"]').textContent = formatClock(draft.start);
    rangeBoard.querySelector('[data-role="end"]').textContent = formatClock(draft.end);
    rangeBoard.querySelector('[data-role="duration"]').textContent = roundTenth(
      draft.end - draft.start
    ).toFixed(1);
    refreshClipInfo();
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

  function clearEndFixed(message) {
    endFixed = false;
    const shown = draft.end > 0 ? `${draft.end.toFixed(1)}s : pause` : "—";
    endPad.setState(shown);
    if (message) status.textContent = message;
  }

  function fixStart() {
    setActiveMark("start");
    stopPreviewMode();
    player?.disable();
    video.pause();
    const t = currentSafeTime();
    setStart(t);
    startFixed = true;
    startPad.setState(`${t.toFixed(1)} → fix`, { fixed: true });
    if (endFixed && !(draft.end > draft.start)) {
      clearEndFixed(
        `Start fixed at ${t.toFixed(1)}s — move later and Fix End again (End must be after Start).`
      );
    } else {
      status.textContent = endFixed
        ? `Start fixed at ${t.toFixed(1)}s — Preview Loop ready.`
        : `Start fixed at ${t.toFixed(1)}s — now set End later, then Fix.`;
    }
    refreshPlayButtons();
    refreshConfirmedBoard();
  }

  function fixEnd() {
    setActiveMark("end");
    stopPreviewMode();
    player?.disable();
    video.pause();
    const t = currentSafeTime();
    if (!startFixed) {
      status.textContent = `Fix Start first, then move later and Fix End. Now at ${t.toFixed(1)}s.`;
      return;
    }
    if (!(t > draft.start)) {
      status.textContent = `End must be later than Start (${draft.start.toFixed(1)}s). Now at ${t.toFixed(1)}s.`;
      return;
    }
    setEnd(t);
    endFixed = true;
    endPad.setState(`${t.toFixed(1)} → fix`, { fixed: true });
    status.textContent = `End fixed at ${t.toFixed(1)}s — Preview Loop ready.`;
    refreshPlayButtons();
    refreshConfirmedBoard();
  }

  function undoStart() {
    setActiveMark("start");
    stopPreviewMode();
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
    stopPreviewMode();
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
    onActivate: () => setActiveMark("end"),
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
    if (!draft.video_id) return false;
    status.textContent = isNew ? "이전 클립 영상 불러오는 중…" : `Opening ${draft.video_id}…`;
    const url = await resolveVideoUrl(draft.video_id);
    if (!url) {
      status.textContent = isNew
        ? "이전 영상을 찾지 못했습니다. 아래에서 영화 파일을 한 번만 선택하세요."
        : `Select a video file for ${draft.video_id}.`;
      return false;
    }
    setVideoSource(video, url);
    try {
      await waitForVideoReady(video);
      duration = video.duration || 0;
      if (isNew && draft.end <= draft.start) setEnd(duration);
      const seekTo =
        draft.start > 0 && draft.start < duration ? draft.start : 0;
      try {
        video.currentTime = seekTo;
      } catch {
        /* ignore */
      }
      currentTimeEl.textContent = `Current: ${formatClock(seekTo)} (${seekTo.toFixed(1)}s)`;
      status.textContent = isNew
        ? `준비됨 (${duration.toFixed(1)}s). Start → End → Fix → Save Clip 만 하면 됩니다.`
        : `Ready: ${draft.video_id} (${duration.toFixed(1)}s)`;
      attachPlayer();
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

  const previewBtn = el("button", {
    type: "button",
    class: "btn btn-secondary btn-block editor-rail-btn",
    text: "Preview Loop",
  });
  previewBtn.addEventListener("click", async () => {
    if (previewing) {
      stopPreviewMode();
      video.pause();
      status.textContent = "Preview stopped.";
      refreshPlayButtons();
      return;
    }
    if (!startFixed || !endFixed) {
      status.textContent = !startFixed
        ? "Fix Start, then Fix End, before previewing."
        : "Fix End later than Start before previewing.";
      return;
    }
    if (!(draft.end > draft.start)) {
      status.textContent = "Fix End later than Start before previewing.";
      return;
    }
    if (!player) {
      status.textContent = "Video is not ready yet.";
      return;
    }
    previewing = true;
    previewBtn.textContent = "Stop Preview";
    previewBtn.classList.add("btn-danger");
    player.setRange(draft.start, draft.end);
    player.seekToStart();
    player.enable();
    try {
      await video.play();
      status.textContent = `Previewing ${draft.start.toFixed(1)}s → ${draft.end.toFixed(1)}s (loop).`;
    } catch {
      status.textContent = "Tap Play on the video, then Preview Loop again.";
      stopPreviewMode();
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
      const result = await bindPickedFile(file);
      const { videoId, url } = result;
      draft.video_id = videoId;
      const fresh = await loadVideos();
      videos.splice(0, videos.length, ...fresh);
      setVideoSource(video, url);
      await waitForVideoReady(video);
      duration = video.duration || 0;
      if (draft.end <= draft.start) setEnd(duration);
      attachPlayer();
      uploadVideo(file).catch(() => {});
      pickBtn.textContent = "Select Movie";
      status.textContent = result.reused
        ? `준비됨 (${duration.toFixed(1)}s). Start → End → Fix → Save Clip`
        : `준비됨 (${duration.toFixed(1)}s). Start → End → Fix → Save Clip`;
      if (result.persistError) {
        status.textContent += " (이번만 임시 재생 — 저장은 가능)";
      }
    } catch (err) {
      status.textContent =
        err.message || "영상을 열 수 없습니다. Files에서 다시 선택해 주세요.";
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
    class: "btn btn-secondary btn-block editor-rail-btn",
    text: "Select Movie",
    onClick: () => fileInput.click(),
  });

  const saveNote = el("p", { class: "status-line save-note" });
  const saveBtn = el("button", {
    type: "button",
    class: "btn btn-primary btn-block save-clip-btn editor-rail-btn editor-rail-btn-save",
    text: "Save Clip",
  });

  const deleteBtn = !isNew
    ? el("button", {
        type: "button",
        class: "btn btn-ghost btn-block editor-rail-btn editor-rail-btn-muted",
        text: "Delete Clip",
        onClick: async () => {
          if (!confirmAction("Delete this clip?")) return;
          await deleteClip(draft.id);
          rememberReturnToLibrary({ isNew: true });
          location.hash = "#/";
        },
      })
    : null;

  const cancelBtn = el("a", {
    class: "btn btn-ghost btn-block editor-rail-btn editor-rail-btn-muted",
    href: "#/",
    text: "Cancel",
    onClick: (event) => {
      event.preventDefault();
      goLibrary();
    },
  });

  let saving = false;

  function setSavePressed(on) {
    saveBtn.classList.toggle("is-pressed", on);
  }

  saveBtn.addEventListener("pointerdown", () => {
    if (!saving) setSavePressed(true);
  });
  for (const evt of ["pointerup", "pointercancel", "pointerleave"]) {
    saveBtn.addEventListener(evt, () => {
      if (!saving) setSavePressed(false);
    });
  }

  saveBtn.addEventListener("click", async () => {
    if (saving) return;
    draft.title = titleInput.value.trim();
    draft.english = englishInput.value.trim();
    draft.korean = koreanInput.value.trim();
    if (!draft.title) {
      saveNote.textContent = "비디오 이름을 입력해 주세요.";
      status.textContent = saveNote.textContent;
      saveBtn.classList.remove("is-pressed", "is-saving", "is-saved");
      titleInput.focus();
      return;
    }
    if (!draft.video_id) {
      saveNote.textContent = "먼저 영화를 선택해 주세요.";
      status.textContent = saveNote.textContent;
      saveBtn.classList.remove("is-pressed", "is-saving", "is-saved");
      return;
    }
    if (!(draft.end > draft.start)) {
      saveNote.textContent = "End가 Start보다 뒤여야 합니다. Fix로 구간을 정해 주세요.";
      status.textContent = saveNote.textContent;
      saveBtn.classList.remove("is-pressed", "is-saving", "is-saved");
      return;
    }

    saving = true;
    saveBtn.disabled = true;
    saveBtn.classList.add("is-pressed", "is-saving");
    saveBtn.classList.remove("is-saved");
    saveBtn.textContent = "Saving…";
    saveNote.textContent = "Saving clip…";
    status.textContent = "Saving clip…";

    try {
      const payload = {
        ...draft,
        title: draft.title,
        english: draft.english,
        korean: draft.korean,
        video_id: draft.video_id,
        start: draft.start,
        end: draft.end,
      };
      if (isNew || payload.id == null) {
        delete payload.id;
        payload.__asNew = true;
      }
      const saved = await upsertClip(payload);
      draft.id = saved.id;
      saveBtn.classList.remove("is-saving");
      saveBtn.classList.add("is-saved", "is-pressed");
      saveBtn.textContent = "Saved ✓";
      saveNote.textContent = `Saved “${saved.title}” (#${saved.id})`;
      status.textContent = saveNote.textContent;
      await new Promise((resolve) => setTimeout(resolve, 600));
      goLibraryAfterSave(saved.id);
    } catch (err) {
      saving = false;
      saveBtn.disabled = false;
      saveBtn.classList.remove("is-pressed", "is-saving", "is-saved");
      saveBtn.textContent = "Save Clip";
      saveNote.textContent = err.message || "Could not save clip.";
      status.textContent = saveNote.textContent;
    }
  });

  const sticky = el("div", { class: "editor-sticky" }, [
    el("div", { class: "video-shell" }, [video]),
    currentTimeEl,
    rangeBoard,
  ]);

  const rail = el("aside", { class: "editor-rail" }, [
    el("div", { class: "editor-rail-stack" }, [
      pickBtn,
      fileInput,
      previewBtn,
      saveBtn,
      deleteBtn,
      cancelBtn,
    ]),
    el("div", { class: "editor-rail-meta" }, [clipInfoEl, status, saveNote]),
  ]);

  const main = el("div", { class: "editor-main" }, [
    el("div", { class: "editor-top" }, [
      el("header", { class: "topbar editor-topbar" }, [
        el("h1", { text: isNew ? "New Clip" : "Edit Clip" }),
        el("a", {
          class: "btn btn-ghost",
          href: "#/",
          text: "Library",
          onClick: (event) => {
            event.preventDefault();
            goLibrary();
          },
        }),
      ]),
      sticky,
    ]),
    el("div", { class: "editor-body", id: "editor-scroll" }, [
      titleField,
      startPad,
      endPad,
      el("label", { class: "field-label", text: "English subtitle" }),
      englishInput,
      el("label", { class: "field-label", text: "한글 자막" }),
      koreanInput,
    ]),
  ]);

  const screen = el("section", { class: "editor-screen" }, [rail, main]);

  document.documentElement.classList.add("editor-lock");
  document.body.classList.add("editor-lock");
  refreshConfirmedBoard();
  refreshClipInfo();
  refreshPlayButtons();
  root.replaceChildren(screen);
  attachPlayer();
  if (draft.video_id) {
    loadSelectedVideo().catch(() => {
      status.textContent = `Select a video file for ${draft.video_id}.`;
    });
  }
}
