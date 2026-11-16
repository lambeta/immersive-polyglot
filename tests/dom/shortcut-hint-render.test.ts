import { describe, expect, it } from "vitest";
import { applyShortcutHint } from "../../src/ui/popup/shortcut-hint.js";
import { buildPage } from "./helpers.js";

/**
 * The applier is the only part of the hint that touches the DOM (feature 009 FR-019, FR-022,
 * FR-023). It must show the key as part of the button's own name, and show nothing at all when
 * there is no binding — never a placeholder chip. jsdom proves the structure; the real accessible
 * name is read from Chromium in tests/e2e/shortcut-hint.spec.ts.
 */

const MARKUP = `
  <button id="translate" class="btn btn--primary btn--wide" type="button">
    <span id="translate-label">Translate this page</span>
    <kbd id="translate-key" class="btn__key" hidden></kbd>
  </button>
`;

function mount(): { button: HTMLButtonElement; chip: HTMLElement; label: HTMLElement } {
  const { document } = buildPage(MARKUP);
  const button = document.querySelector<HTMLButtonElement>("#translate");
  const chip = document.querySelector<HTMLElement>("#translate-key");
  const label = document.querySelector<HTMLElement>("#translate-label");
  if (!button || !chip || !label) throw new Error("fixture markup is incomplete");
  return { button, chip, label };
}

describe("applyShortcutHint (FR-019, FR-022, FR-023)", () => {
  it("shows the browser's string inside the button, as part of its name", () => {
    const { button, chip } = mount();
    applyShortcutHint(button, "⌥A");

    expect(chip.hidden).toBe(false);
    expect(chip.textContent).toBe("⌥A");
    expect(button.textContent).toContain("Translate this page");
    expect(button.textContent).toContain("⌥A");
  });

  it("hides the chip entirely when nothing is bound — no placeholder survives", () => {
    const { button, chip } = mount();
    applyShortcutHint(button, "Ctrl+Shift+Y");
    applyShortcutHint(button, null);

    expect(chip.hidden).toBe(true);
    expect(chip.textContent).toBe("");
    // Whitespace between the markup's elements is not content; the words are unchanged.
    expect((button.textContent ?? "").replace(/\s+/g, " ").trim()).toBe("Translate this page");
  });

  it("leaves the action words alone across rebinds", () => {
    const { button, label } = mount();
    applyShortcutHint(button, "⌥A");
    expect(label.textContent).toBe("Translate this page");

    applyShortcutHint(button, "Alt+A");
    expect(label.textContent).toBe("Translate this page");
  });

  it("adds no aria-keyshortcuts and no focus stop of its own", () => {
    const { button, chip } = mount();
    applyShortcutHint(button, "⌥A");

    expect(button.hasAttribute("aria-keyshortcuts")).toBe(false);
    expect(chip.hasAttribute("tabindex")).toBe(false);
    expect(chip.tabIndex).toBe(-1);
  });

  it("does nothing to a button that has no chip, and never throws", () => {
    const { document } = buildPage(`<button id="plain" type="button">Plain</button>`);
    const button = document.querySelector<HTMLButtonElement>("#plain");
    if (!button) throw new Error("fixture markup is incomplete");
    expect(() => applyShortcutHint(button, "Alt+A")).not.toThrow();
    expect(button.textContent).toBe("Plain");
  });
});
