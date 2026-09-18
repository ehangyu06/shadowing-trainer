/**
 * Keeps a single HTML5 video element and loops only [start, end].
 * The source is never reloaded while looping.
 */
export function createLoopPlayer(video) {
  let start = 0;
  let end = 0;
  let active = false;
  let primed = false;
  let safeFrames = 0;
  let onCycleEnd = null;
  let rafId = 0;

  function inRange() {
    return end > start;
  }

  function inSafeZone(t) {
    const span = end - start;
    if (span <= 0) return false;
    const latest = start + Math.max(span * 0.45, Math.min(0.2, span * 0.8));
    return t >= start && t < Math.min(latest, end - 0.08);
  }

  function jumpToStart() {
    video.currentTime = start;
  }

  function completeCycle() {
    if (!active || !primed || !inRange()) return;
    primed = false;
    safeFrames = 0;
    const shouldContinue = onCycleEnd ? onCycleEnd() : true;
    if (shouldContinue === false) {
      active = false;
      video.pause();
      return;
    }
    jumpToStart();
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  }

  function check() {
    if (!active || !inRange()) return;
    const t = video.currentTime;
    if (!primed) {
      if (inSafeZone(t)) {
        safeFrames += 1;
        if (safeFrames >= 6) primed = true;
      } else {
        safeFrames = 0;
      }
      return;
    }
    if (video.seeking) return;
    if (t >= end || (!video.paused && t >= end - 0.04)) {
      completeCycle();
    } else if (!video.paused && t < start - 0.08) {
      jumpToStart();
    }
  }

  function onEnded() {
    if (!active) return;
    completeCycle();
  }

  function tick() {
    check();
    rafId = requestAnimationFrame(tick);
  }

  video.addEventListener("timeupdate", check);
  video.addEventListener("ended", onEnded);
  rafId = requestAnimationFrame(tick);

  return {
    setRange(nextStart, nextEnd) {
      start = Number(nextStart) || 0;
      end = Number(nextEnd) || 0;
    },
    setOnCycleEnd(fn) {
      onCycleEnd = fn;
    },
    enable() {
      active = true;
      primed = false;
      safeFrames = 0;
      // If playhead is outside the clip, snap in so we never leak into full-video play.
      if (inRange()) {
        const t = video.currentTime || 0;
        if (t < start || t >= end) jumpToStart();
      }
    },
    disable() {
      active = false;
      primed = false;
      safeFrames = 0;
    },
    seekToStart() {
      primed = false;
      safeFrames = 0;
      jumpToStart();
    },
    isActive() {
      return active;
    },
    destroy() {
      active = false;
      primed = false;
      cancelAnimationFrame(rafId);
      video.removeEventListener("timeupdate", check);
      video.removeEventListener("ended", onEnded);
    },
  };
}

export function setVideoSource(video, src) {
  if (!src) {
    video.removeAttribute("src");
    video.load();
    return true;
  }
  if (String(src).startsWith("blob:")) {
    if (video.src === src) return false;
    video.src = src;
    return true;
  }
  const next = new URL(src, window.location.href).href;
  const current = video.currentSrc || video.src;
  if (current === next) return false;
  video.src = src;
  return true;
}
