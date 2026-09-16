export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function stepper({
  value,
  step = 1,
  min = 0,
  max = 999,
  decimals = 0,
  minusLabel = "−",
  plusLabel = "+",
  onChange,
}) {
  const wrap = el("div", { class: "stepper" });
  const minus = el("button", { type: "button", class: "stepper-btn", text: minusLabel });
  const input = el("input", {
    type: "number",
    class: "stepper-input",
    inputmode: decimals ? "decimal" : "numeric",
    step: String(step),
  });
  const plus = el("button", { type: "button", class: "stepper-btn", text: plusLabel });

  function apply(next, fromInput = false) {
    let n = Number(next);
    if (!Number.isFinite(n)) n = value;
    n = Math.min(max, Math.max(min, n));
    if (decimals > 0) n = Math.round(n * 10 ** decimals) / 10 ** decimals;
    else n = Math.round(n);
    value = n;
    input.value = decimals ? n.toFixed(decimals) : String(n);
    if (!fromInput) onChange?.(n);
    return n;
  }

  minus.addEventListener("click", () => apply(value - step));
  plus.addEventListener("click", () => apply(value + step));
  input.addEventListener("change", () => {
    const n = apply(input.value, true);
    onChange?.(n);
  });

  apply(value, true);
  wrap.append(minus, input, plus);
  wrap.setValue = (next) => apply(next, true);
  wrap.getValue = () => value;
  return wrap;
}

export function confirmAction(message) {
  return window.confirm(message);
}

/**
 * Editor control: −0.1 | Play/Pause | +0.1 | Fix | Undo
 * Only the active pad mirrors the video play/pause state.
 */
export function seekFixPad({
  label,
  step = 0.1,
  onActivate,
  onNudge,
  onTogglePlay,
  onFix,
  onUndo,
}) {
  let active = false;
  let fixed = false;

  const wrap = el("div", { class: "mark-pad" });
  const title = el("strong", { class: "mark-pad-title", text: label });
  const stateEl = el("p", { class: "mark-pad-state", text: "—" });
  const head = el("div", { class: "mark-pad-head" }, [
    title,
    stateEl,
    el("span", {
      class: "muted mark-pad-hint",
      text: "−0.1 / Play·Pause / +0.1 → Fix / Undo",
    }),
  ]);
  const row = el("div", { class: "mark-pad-row" });
  const minus = el("button", { type: "button", class: "btn btn-primary mark-step", text: "−0.1" });
  const playBtn = el("button", {
    type: "button",
    class: "btn btn-secondary mark-play",
    text: "▶",
  });
  const plus = el("button", { type: "button", class: "btn btn-primary mark-step", text: "+0.1" });
  const fix = el("button", { type: "button", class: "btn btn-primary mark-fix", text: "Fix" });
  const undo = el("button", { type: "button", class: "btn btn-ghost mark-undo", text: "Undo" });

  function setPlaying(playing) {
    if (!active) {
      playBtn.textContent = "▶";
      playBtn.classList.remove("btn-danger");
      playBtn.classList.add("btn-secondary");
      return;
    }
    playBtn.textContent = playing ? "⏸" : "▶";
    playBtn.classList.toggle("btn-danger", Boolean(playing));
    playBtn.classList.toggle("btn-secondary", !playing);
  }

  function setActive(next) {
    active = Boolean(next);
    wrap.classList.toggle("is-active", active);
    if (!active) setPlaying(false);
  }

  function setState(text, options = {}) {
    stateEl.textContent = text;
    fixed = Boolean(options.fixed);
    stateEl.classList.toggle("is-fixed", fixed);
    undo.disabled = !fixed;
    undo.classList.toggle("is-disabled", !fixed);
  }

  function activate() {
    onActivate?.();
  }

  minus.addEventListener("click", (event) => {
    event.stopPropagation();
    activate();
    onNudge?.(-step);
  });
  plus.addEventListener("click", (event) => {
    event.stopPropagation();
    activate();
    onNudge?.(step);
  });
  playBtn.addEventListener("click", async (event) => {
    event.stopPropagation();
    activate();
    await onTogglePlay?.();
  });
  fix.addEventListener("click", (event) => {
    event.stopPropagation();
    // Do not activate() first — End pad activate used to seek to Start,
    // which made Fix capture the start time instead of the playhead.
    onFix?.();
  });
  undo.addEventListener("click", (event) => {
    event.stopPropagation();
    onUndo?.();
  });

  row.append(minus, playBtn, plus, fix, undo);
  wrap.append(head, row);
  wrap.setPlaying = setPlaying;
  wrap.setActive = setActive;
  wrap.setState = setState;
  wrap.isActive = () => active;
  undo.disabled = true;
  undo.classList.add("is-disabled");
  return wrap;
}
