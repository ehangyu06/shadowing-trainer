import { PHASES, PLAYBACK_RATES, SUBTITLE_MODES, formatRate } from "../constants.js";
import { loadSettings, saveSettings, totalRepeats } from "../settingsStore.js";
import { getClip, loadClips, neighborIds } from "../clipStore.js";
import { createLoopPlayer, setVideoSource } from "../loopPlayer.js";
import { bindPickedFile, resolveVideoUrl } from "../videoSource.js";
import { el } from "../ui.js";

let session = null;
let renderToken = 0;

function firstPlayablePhase(counts) {
  const index = counts.findIndex((n) => n > 0);
  return index < 0 ? 0 : index;
}

function subtitleFlags(phaseIndex, mode) {
  const resolved = mode === "auto" ? PHASES[phaseIndex].subtitle : mode;
  return {
    english: resolved === "english" || resolved === "both",
    korean: resolved === "korean" || resolved === "both",
    resolved,
  };
}

function overallProgress(state) {
  const doneBefore = state.phaseRepeats
    .slice(0, state.phase)
    .reduce((sum, n) => sum + n, 0);
  return {
    current: doneBefore + state.repeat,
    total: state.phaseRepeats.reduce((sum, n) => sum + n, 0),
  };
}

function destroySession() {
  if (!session) return;
  session.player?.destroy();
  session.video?.pause();
  session = null;
}

function applyRate(video, rate) {
  video.playbackRate = rate;
}

function buildSession(clip, settings) {
  return {
    clip,
    phase: firstPlayablePhase(settings.phases),
    repeat: 1,
    phaseRepeats: [...settings.phases],
    playbackRate: settings.playbackRate,
    subtitleMode: "auto",
    complete: false,
    started: false,
    mediaReady: false,
    neighbors: { prev: null, next: null },
  };
}

function advanceAfterCycle(state) {
  if (state.complete) return false;
  const target = state.phaseRepeats[state.phase] || 0;
  if (state.repeat < target) {
    state.repeat += 1;
    return true;
  }
  let nextPhase = state.phase + 1;
  while (nextPhase < PHASES.length && state.phaseRepeats[nextPhase] <= 0) {
    nextPhase += 1;
  }
  if (nextPhase >= PHASES.length) {
    state.complete = true;
    return false;
  }
  state.phase = nextPhase;
  state.repeat = 1;
  state.subtitleMode = "auto";
  return true;
}

export function destroyShadowing() {
  destroySession();
}

export async function renderShadowing(root, clipId) {
  const token = ++renderToken;
  const clip = await getClip(clipId);
  if (token !== renderToken) return;
  if (!clip) {
    root.replaceChildren(
      el("section", { class: "screen" }, [
        el("p", { text: "Clip not found." }),
        el("a", { class: "btn btn-primary", href: "#/", text: "Back to Library" }),
      ])
    );
    return;
  }

  const sameClip = session && session.clip.id === clip.id && session.root === root;
  if (sameClip) return;

  destroySession();
  const settings = loadSettings();
  const clips = await loadClips();
  const state = buildSession(clip, settings);
  state.neighbors = neighborIds(clips, clip.id);
  state.root = root;

  const video = el("video", {
    class: "train-player",
    playsinline: true,
    preload: "auto",
  });
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("webkit-playsinline", "true");
  video.controls = false;
  video.playsInline = true;

  const player = createLoopPlayer(video);
  player.setRange(clip.start, clip.end);
  player.disable();

  const phaseTitle = el("h2", { class: "phase-title" });
  const phaseCount = el("p", { class: "phase-count" });
  const overallCount = el("p", { class: "overall-count" });
  const englishEl = el("p", { class: "subtitle english" });
  const koreanEl = el("p", { class: "subtitle korean" });
  const completeTitle = el("h2", { text: "Shadowing Complete" });
  const startNote = el("p", {
    class: "muted",
    text: "Tap once. After that, this clip repeats automatically through every phase.",
  });
  const startBtn = el("button", {
    type: "button",
    class: "btn btn-primary btn-block",
    text: "Start Shadowing",
  });
  const pickInput = el("input", {
    type: "file",
    accept: "video/mp4,video/quicktime,video/*",
    class: "file-input",
  });
  const pickBtn = el("label", { class: "btn btn-secondary btn-block file-btn hidden" }, [
    "Select Video File",
    pickInput,
  ]);
  const startOverlay = el("div", { class: "overlay start-overlay" }, [
    el("div", { class: "overlay-card" }, [
      el("h2", { text: "Start Shadowing" }),
      startNote,
      startBtn,
      pickBtn,
    ]),
  ]);
  const completeOverlay = el("div", { class: "overlay complete-overlay hidden", hidden: true }, [
    el("div", { class: "overlay-card" }, [
      completeTitle,
      el("button", {
        type: "button",
        class: "btn btn-primary btn-block",
        text: "Repeat This Clip",
        onClick: () => restartSession(true),
      }),
      el("button", {
        type: "button",
        class: "btn btn-secondary btn-block",
        text: "Next Clip",
        onClick: () => {
          if (state.neighbors.next != null) location.hash = `#/train/${state.neighbors.next}`;
          else location.hash = "#/";
        },
      }),
    ]),
  ]);

  const playBtn = el("button", { type: "button", class: "btn btn-primary", text: "Play" });
  const phaseButtons = PHASES.map((phase, index) =>
    el("button", {
      type: "button",
      class: "phase-btn",
      text: phase.short,
      onClick: () => jumpToPhase(index),
    })
  );
  const speedButtons = PLAYBACK_RATES.map((rate) =>
    el("button", {
      type: "button",
      class: "chip",
      text: formatRate(rate),
      onClick: () => {
        state.playbackRate = rate;
        applyRate(video, rate);
        saveSettings({ ...loadSettings(), playbackRate: rate });
        refreshChrome();
      },
    })
  );
  const subtitleButtons = SUBTITLE_MODES.map((mode) =>
    el("button", {
      type: "button",
      class: "chip",
      text: mode.label,
      onClick: () => {
        state.subtitleMode = mode.id;
        refreshChrome();
      },
    })
  );

  function refreshChrome() {
    const phase = PHASES[state.phase];
    const repeats = state.phaseRepeats[state.phase] || 0;
    const overall = overallProgress(state);
    phaseTitle.textContent = `Phase ${phase.id} — ${phase.name}`;
    phaseCount.textContent = `${state.repeat} / ${repeats}`;
    overallCount.textContent = `${overall.current} / ${overall.total || totalRepeats(settings)}`;
    const flags = subtitleFlags(state.phase, state.subtitleMode);
    englishEl.textContent = flags.english ? state.clip.english : "";
    koreanEl.textContent = flags.korean ? state.clip.korean : "";
    englishEl.classList.toggle("hidden", !flags.english || !state.clip.english);
    koreanEl.classList.toggle("hidden", !flags.korean || !state.clip.korean);
    playBtn.textContent = video.paused ? "Play" : "Pause";
    phaseButtons.forEach((btn, i) => btn.classList.toggle("chip-active", i === state.phase));
    speedButtons.forEach((btn, i) =>
      btn.classList.toggle("chip-active", PLAYBACK_RATES[i] === state.playbackRate)
    );
    subtitleButtons.forEach((btn, i) =>
      btn.classList.toggle("chip-active", SUBTITLE_MODES[i].id === state.subtitleMode)
    );
    completeOverlay.classList.toggle("hidden", !state.complete);
    completeOverlay.hidden = !state.complete;
    startOverlay.classList.toggle("hidden", state.started);
    startOverlay.hidden = state.started;
  }

  function showComplete() {
    state.complete = true;
    player.disable();
    video.pause();
    refreshChrome();
  }

  player.setOnCycleEnd(() => {
    const keepGoing = advanceAfterCycle(state);
    refreshChrome();
    if (!keepGoing) {
      showComplete();
      return false;
    }
    return true;
  });

  async function playFromStart() {
    if (!state.mediaReady) return;
    player.setRange(state.clip.start, state.clip.end);
    applyRate(video, state.playbackRate);
    if (video.readyState < 1) {
      try {
        await new Promise((resolve, reject) => {
          video.addEventListener("loadedmetadata", resolve, { once: true });
          video.addEventListener("error", () => reject(new Error("video")), { once: true });
        });
      } catch {
        state.started = false;
        refreshChrome();
        return;
      }
    }
    player.seekToStart();
    player.enable();
    try {
      await video.play();
      state.started = true;
    } catch {
      state.started = false;
    }
    refreshChrome();
  }

  function restartSession(autoplay) {
    const latest = loadSettings();
    state.phaseRepeats = [...latest.phases];
    state.playbackRate = latest.playbackRate;
    state.phase = firstPlayablePhase(state.phaseRepeats);
    state.repeat = 1;
    state.subtitleMode = "auto";
    state.complete = false;
    if (state.phaseRepeats.every((n) => n <= 0)) {
      showComplete();
      return;
    }
    if (autoplay) playFromStart();
    else {
      player.disable();
      video.pause();
      player.seekToStart();
      refreshChrome();
    }
  }

  function jumpToPhase(index) {
    if (state.complete) state.complete = false;
    state.phase = index;
    state.repeat = 1;
    state.subtitleMode = "auto";
    if (state.phaseRepeats[index] <= 0) {
      refreshChrome();
      return;
    }
    if (state.started) playFromStart();
    else refreshChrome();
  }

  startBtn.addEventListener("click", () => playFromStart());
  pickInput.addEventListener("change", async () => {
    const file = pickInput.files?.[0];
    if (!file) return;
    await bindPickedFile(file, state.clip.video_id);
    await attachMedia();
    refreshChrome();
  });
  playBtn.addEventListener("click", async () => {
    if (!state.started) {
      await playFromStart();
      return;
    }
    if (state.complete) return;
    if (video.paused) {
      player.enable();
      try {
        await video.play();
      } catch {
        /* iOS may still require the start overlay */
      }
    } else {
      video.pause();
    }
    refreshChrome();
  });
  video.addEventListener("play", refreshChrome);
  video.addEventListener("pause", refreshChrome);
  video.addEventListener("loadedmetadata", () => {
    player.setRange(state.clip.start, state.clip.end);
    player.seekToStart();
  });
  video.addEventListener("error", () => {
    startNote.textContent = `Video is not available for ${state.clip.video_id}. Select Video File from Files.`;
    pickBtn.classList.remove("hidden");
    startBtn.classList.add("hidden");
    state.mediaReady = false;
  });

  const screen = el("section", { class: "screen train-screen" }, [
    el("div", { class: "train-layout" }, [
      el("div", { class: "train-video" }, [video, startOverlay, completeOverlay]),
      el("div", { class: "train-side" }, [
        el("div", { class: "progress-block" }, [phaseTitle, phaseCount, overallCount]),
        el("div", { class: "phase-row" }, phaseButtons),
        el("div", { class: "subtitle-box" }, [englishEl, koreanEl]),
        el("div", { class: "btn-grid" }, [
          playBtn,
          el("button", {
            type: "button",
            class: "btn btn-secondary",
            text: "Restart Clip",
            onClick: () => {
              if (state.complete) return;
              player.seekToStart();
              if (state.started) video.play().catch(() => {});
            },
          }),
          el("button", {
            type: "button",
            class: "btn btn-secondary",
            text: "Previous Clip",
            disabled: state.neighbors.prev == null,
            onClick: () => {
              if (state.neighbors.prev != null) location.hash = `#/train/${state.neighbors.prev}`;
            },
          }),
          el("button", {
            type: "button",
            class: "btn btn-secondary",
            text: "Next Clip",
            disabled: state.neighbors.next == null,
            onClick: () => {
              if (state.neighbors.next != null) location.hash = `#/train/${state.neighbors.next}`;
            },
          }),
          el("button", {
            type: "button",
            class: "btn btn-secondary",
            text: "Restart Session",
            onClick: () => restartSession(state.started),
          }),
          el("a", { class: "btn btn-ghost", href: "#/settings", text: "Settings" }),
        ]),
        el("p", { class: "field-label", text: "Playback Speed" }),
        el("div", { class: "chip-row" }, speedButtons),
        el("p", { class: "field-label", text: "Subtitle Mode" }),
        el("div", { class: "chip-row" }, subtitleButtons),
        el("a", { class: "btn btn-ghost btn-block", href: "#/", text: "Back to Library" }),
      ]),
    ]),
  ]);

  root.replaceChildren(screen);
  async function attachMedia() {
    const url = await resolveVideoUrl(state.clip.video_id);
    if (!url) {
      state.mediaReady = false;
      startNote.textContent = `Select the video file for ${state.clip.video_id}. Clip times stay saved.`;
      pickBtn.classList.remove("hidden");
      startBtn.classList.add("hidden");
      return;
    }
    state.mediaReady = true;
    pickBtn.classList.add("hidden");
    startBtn.classList.remove("hidden");
    startNote.textContent =
      "Tap once. After that, this clip repeats automatically through every phase.";
    setVideoSource(video, url);
    applyRate(video, state.playbackRate);
    player.seekToStart();
  }
  await attachMedia();
  refreshChrome();

  session = { ...state, video, player, root };
}

export { destroySession as stopShadowing };
