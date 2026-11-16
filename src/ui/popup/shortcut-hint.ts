/**
 * The shortcut hint for the panel's primary action (feature 009, US2).
 *
 * Two pure-ish pieces: which string the browser reports, and how it is shown. Neither imports
 * `chrome.*`, so both are exercised without an extension context; the live API is read in
 * `popup.ts` and proven in tests/e2e/shortcut-hint.spec.ts.
 */

export interface CommandBinding {
  /** Chrome types this as optional on its own `Command`, so an unnamed entry is allowed here. */
  name?: string;
  shortcut?: string;
}

const TRANSLATE_COMMAND = "toggle-translation";

/**
 * The combination bound to the translate/restore command, verbatim — the browser's own notation
 * (`⌥A` on macOS, `Alt+A` elsewhere) — or null when nothing is bound (FR-018, FR-021, FR-027).
 * Selection is by name: Chrome also answers with its own `_execute_action` entry.
 */
export function shortcutFor(
  commands: readonly CommandBinding[],
  name: string = TRANSLATE_COMMAND,
): string | null {
  const entry = commands.find((command) => command.name === name);
  const shortcut = entry?.shortcut?.trim() ?? "";
  return shortcut.length > 0 ? shortcut : null;
}

/**
 * Shows the key inside the button, as part of its accessible name, or removes it entirely.
 * No `aria-keyshortcuts`: the browser's notation is not that attribute's grammar, and re-spelling
 * it would break FR-027 (research R8). Returns the chip it wrote, for the caller's convenience.
 */
export function applyShortcutHint(
  button: HTMLButtonElement,
  shortcut: string | null,
): HTMLElement | null {
  const chip = button.querySelector<HTMLElement>(".btn__key");
  if (!chip) return null;
  chip.textContent = shortcut ?? "";
  chip.hidden = shortcut === null;
  return chip;
}
