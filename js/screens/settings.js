import { PHASES, PLAYBACK_RATES, formatRate } from "../constants.js?v=20260918c";
import { loadSettings, saveSettings, totalRepeats, defaultSettings } from "../settingsStore.js?v=20260918c";
import {
  readBackupFile,
  restoreBackup,
  summarizeBackup,
} from "../userData.js?v=20260918c";
import { el, stepper, confirmAction } from "../ui.js?v=20260918c";

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
  const backupStatus = el("p", { class: "status-line" });

  const importInput = el("input", {
    type: "file",
    accept: "application/json,.json",
    class: "file-input",
  });

  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;
    try {
      const backup = await readBackupFile(file);
      const summary = summarizeBackup(backup);
      const ok = confirmAction(
        `Restore backup from ${summary.exportedAt}?\n\n` +
          `${summary.clipCount} clips will replace the clips currently on this iPad.\n` +
          `Video files are not inside the backup — re-select them if playback asks.`
      );
      if (!ok) {
        backupStatus.textContent = "Import cancelled.";
        return;
      }
      const result = restoreBackup(backup);
      backupStatus.textContent = `Restored ${result.clipCount} clips (${result.exportedAt}). Open Library to see them.`;
    } catch (err) {
      backupStatus.textContent = err.message || "Could not import backup.";
    }
  });

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
    ]),
    status,
    el("h2", { class: "section-title", text: "Restore backup" }),
    el("p", {
      class: "muted backup-help",
      text:
        "Export is on the Library screen (top Export button). It saves only when clips were added or changed. Use Import here to restore a backup file from Files / iCloud.",
    }),
    el("div", { class: "stack-actions" }, [
      el("button", {
        type: "button",
        class: "btn btn-secondary btn-block",
        text: "Import Backup",
        onClick: () => importInput.click(),
      }),
      importInput,
      el("a", {
        class: "btn btn-ghost btn-block",
        href: "#/",
        text: "Back to Library",
      }),
    ]),
    backupStatus,
  ]);

  root.append(screen);
}
