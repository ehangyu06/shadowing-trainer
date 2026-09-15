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
 * Editor control: −0.1 | play/pause at mark | +0.1 | Fix
 */
export function timeMarkPad({
  label,
  value,
  step = 0.1,
  min = 0,
  max = 24 * 60 * 60,
  onAdjust,
  onTogglePlay,
  onFix,
}) {
  let mark = Number(value) || 0;
  let playing = false;

  const wrap = el("div", { class: "mark-pad" });
  const head = el("div", { class: "settings-label" }, [
    el("strong", { text: label }),
    el("span", { class: "muted", text: "−0.1 / play / +0.1 → Fix" }),
  ]);
  const row = el("div", { class: "mark-pad-row" });
  const minus = el("button", { type: "button", class: "btn btn-primary mark-step", text: "−0.1" });
  const playBtn = el("button", { type: "button", class: "btn btn-secondary mark-play" });
  const plus = el("button", { type: "button", class: "btn btn-primary mark-step", text: "+0.1" });
  const fix = el("button", { type: "button", class: "btn btn-primary mark-fix", text: "Fix" });

  function formatMark() {
    return mark.toFixed(1);
  }

  function refreshPlayLabel() {
    playBtn.textContent = playing ? `⏸ ${formatMark()}s` : `▶ ${formatMark()}s`;
    playBtn.classList.toggle("btn-danger", playing);
    playBtn.classList.toggle("btn-secondary", !playing);
  }

  function setMark(next, announce = true) {
    let n = Number(next);
    if (!Number.isFinite(n)) n = mark;
    n = Math.min(max, Math.max(min, Math.round(n * 10) / 10));
    mark = n;
    refreshPlayLabel();
    if (announce) onAdjust?.(mark);
    return mark;
  }

  minus.addEventListener("click", () => {
    playing = false;
    refreshPlayLabel();
    setMark(mark - step);
  });
  plus.addEventListener("click", () => {
    playing = false;
    refreshPlayLabel();
    setMark(mark + step);
  });
  playBtn.addEventListener("click", async () => {
    const nextPlaying = await onTogglePlay?.(mark, playing);
    playing = Boolean(nextPlaying);
    refreshPlayLabel();
  });
  fix.addEventListener("click", () => {
    playing = false;
    refreshPlayLabel();
    onFix?.(mark);
  });

  refreshPlayLabel();
  row.append(minus, playBtn, plus, fix);
  wrap.append(head, row);
  wrap.setValue = (next) => setMark(next, false);
  wrap.getValue = () => mark;
  wrap.setPlaying = (flag) => {
    playing = Boolean(flag);
    refreshPlayLabel();
  };
  wrap.setMax = (nextMax) => {
    max = nextMax;
    setMark(mark, false);
  };
  return wrap;
}
