import { PHASES, PLAYBACK_RATES, formatRate } from "../constants.js?v=20260916p";
import { loadSettings, saveSettings, totalRepeats, defaultSettings } from "../settingsStore.js?v=20260916p";
import { el, stepper } from "../ui.js?v=20260916p";

export function renderSettings(root) {
  const settings = loadSettings();
  let draft = {
    phases: [...settings.phases],
    playbackRate: settings.playbackRate,
  };

  root.replaceChildren();

  const totalEl = el("p", { class: "settings-total" });
  function refreshTotal() {
    totalEl.textContent = `Total repeats per clip: ${totalRepeats(draft)}`;
  }
  refreshTotal();

  const phaseRows = PHASES.map((phase, index) => {
    const row = el("div", { class: "settings-row" }, [
      el("div", { class: "settings-label" }, [
        el("strong", { text: `Phase ${phase.id}` }),
        el("span", { class: "muted", text: phase.name }),
      ]),
    ]);
    const control = stepper({
      value: draft.phases[index],
      min: 0,
      max: 999,
      step: 1,
      onChange: (n) => {
        draft.phases[index] = n;
        refreshTotal();
      },
    });
    row.append(control);
    return row;
  });

  const speedRow = el("div", { class: "speed-row" });
  function renderSpeed() {
    speedRow.replaceChildren(
      ...PLAYBACK_RATES.map((rate) =>
        el("button", {
          type: "button",
          class: `chip ${rate === draft.playbackRate ? "chip-active" : ""}`,
          text: formatRate(rate),
          onClick: () => {
            draft.playbackRate = rate;
            renderSpeed();
          },
        })
      )
    );
  }
  renderSpeed();

  const status = el("p", { class: "status-line" });

  const screen = el("section", { class: "screen settings-screen" }, [
    el("header", { class: "topbar" }, [
      el("h1", { text: "Shadowing Settings" }),
    ]),
    el("div", { class: "settings-card" }, phaseRows),
    totalEl,
    el("h2", { class: "section-title", text: "Playback Speed" }),
    speedRow,
    el("div", { class: "stack-actions" }, [
      el("button", {
        type: "button",
        class: "btn btn-primary btn-block",
        text: "Save Settings",
        onClick: () => {
          draft = saveSettings(draft);
          status.textContent = "Saved. New sessions will use these repeat counts.";
        },
      }),
      el("button", {
        type: "button",
        class: "btn btn-secondary btn-block",
        text: "Reset to Default",
        onClick: () => {
          draft = defaultSettings();
          saveSettings(draft);
          renderSettings(root);
        },
      }),
      el("a", {
        class: "btn btn-ghost btn-block",
        href: "#/",
        text: "Back to Library",
      }),
    ]),
    status,
  ]);

  root.append(screen);
}
