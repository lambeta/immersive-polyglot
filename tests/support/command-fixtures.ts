/**
 * The five shapes `chrome.commands.getAll()` can answer with, as the real browser reported them
 * during the plan's probe (macOS renders the declared `Alt+A` as `⌥A`).
 */

export interface CommandEntry {
  name: string;
  shortcut: string;
}

export const COMMAND_NAME = "toggle-translation";

/** Chrome's own built-in entry, always present, always empty here. */
export const CHROME_ACTION_COMMAND: CommandEntry = { name: "_execute_action", shortcut: "" };

export const MAC_DEFAULT: CommandEntry[] = [
  CHROME_ACTION_COMMAND,
  { name: COMMAND_NAME, shortcut: "⌥A" },
];

export const WINDOWS_DEFAULT: CommandEntry[] = [
  CHROME_ACTION_COMMAND,
  { name: COMMAND_NAME, shortcut: "Alt+A" },
];

export const REBOUND: CommandEntry[] = [
  CHROME_ACTION_COMMAND,
  { name: COMMAND_NAME, shortcut: "Ctrl+Shift+Y" },
];

export const UNBOUND: CommandEntry[] = [
  CHROME_ACTION_COMMAND,
  { name: COMMAND_NAME, shortcut: "" },
];

export const MISSING: CommandEntry[] = [CHROME_ACTION_COMMAND];
