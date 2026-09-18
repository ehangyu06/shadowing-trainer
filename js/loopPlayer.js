/**
 * Keeps a single HTML5 video element and loops only [start, end].
 * The source is never reloaded while looping.
 *
 * End is always enforced while active — including after Pause → Play mid-clip.
 * A short seek guard prevents false end triggers while currentTime settles after jumpToStart.
 */
export function createLoopPlayer(video) {
  let start = 0;
  let end = 0;
  let active = false;
  let onCycleEnd = null;
  let rafId = 0;
  let seekGuardUntil = 0;
  let cycling = false;

  function inRange() {
    return end > start;
  }

  function armSeekGuard(ms = 320) {
    seekGuardUntil = performance.now() + ms;
  }

  function jumpToStart() {
    armSeekGuard();
    try {
      video.currentTime = start;
    } catch {
      /* ignore */
    }
  }

  function completeCycle() {
    if (!active || !inRange() || cycling) return;
    cycling = true;
    armSeekGuard();
    const shouldContinue = onCycleEnd ? onCycleEnd() : true;
    if (shouldContinue === false) {
      active = false;
      cycling = false;
      video.pause();
      return;
    }
    jumpToStart();
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
    // Release after the seek has had a moment to land inside the clip.
    setTimeout(() => {
      cycling = false;
    }, 80);
  }

  function check() {
    if (!active || !inRange()) return;
    if (video.paused) return;
    if (video.seeking) return;
    if (performance.now() < seekGuardUntil) return;

    const t = video.currentTime || 0;

    if (t < start - 0.08) {
      jumpToStart();
      return;
    }

    // Hard stop at clip end — must work even when resuming near the end.
    if (t >= end - 0.03) {
      completeCycle();
    }
  }

  function onEnded() {
    if (!active) return;
    completeCycle();
  }

  function onSeeked() {
    if (!active || !inRange()) return;
    const t = video.currentTime || 0;
    if (t >= start && t < end) {
      seekGuardUntil = 0;
    }
  }

  function tick() {
    check();
    rafId = requestAnimationFrame(tick);
  }

  video.addEventListener("timeupdate", check);
  video.addEventListener("ended", onEnded);
  video.addEventListener("seeked", onSeeked);
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
      cycling = false;
      if (!inRange()) return;
      const t = video.currentTime || 0;
      // Outside the clip → snap to start. Inside → keep position (Pause → Play resume).
      if (t < start || t >= end - 0.03) {
        jumpToStart();
      } else {
        seekGuardUntil = 0;
      }
    },
    disable() {
      active = false;
      cycling = false;
      seekGuardUntil = 0;
    },
    seekToStart() {
      cycling = false;
      jumpToStart();
    },
    isActive() {
      return active;
    },
    destroy() {
      active = false;
      cycling = false;
      cancelAnimationFrame(rafId);
      video.removeEventListener("timeupdate", check);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("seeked", onSeeked);
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
