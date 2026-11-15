import { afterEach, describe, expect, it, vi } from "vitest";
import { StylePicker } from "../../src/ui/shared/style-picker.js";
import { previewIcon } from "../../src/ui/shared/style-preview.js";
import { DISPLAY_STYLES } from "../../src/shared/display-styles.js";

/**
 * The shared picker, pinned as a component (feature 006, T010). It is the one control both
 * surfaces render, and the redesign moved its options into a grid while keeping them a real radio
 * group; these tests hold that shape so neither surface can drift into a div grid with a click
 * handler, and so the page-like sample keeps its source line.
 *
 * jsdom only proves structure and state, never layout: the grid's columns, the 30% growth case and
 * the 200% zoom case are measured in a real browser by tests/e2e/long-labels.spec.ts.
 */

function build(overrides: Partial<ConstructorParameters<typeof StylePicker>[0]> = {}): {
  picker: StylePicker;
  onChange: ReturnType<typeof vi.fn>;
} {
  const onChange = vi.fn();
  const picker = new StylePicker({
    name: "display-style",
    showIcons: true,
    iconFor: previewIcon,
    showSample: true,
    sampleText: "This is how a translated sentence looks.",
    sampleSource: "The ferry leaves the northern pier at seven.",
    onChange,
    ...overrides,
  });
  document.body.append(picker.element);
  return { picker, onChange };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("StylePicker structure", () => {
  it("is one fieldset with a legend and one named radio group of fifteen options", () => {
    build();
    const fieldset = document.querySelector("fieldset.style-picker");
    expect(fieldset).not.toBeNull();
    expect(fieldset?.querySelector("legend")?.textContent).toBe("Translation display style");

    const radios = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios).toHaveLength(15);
    expect(new Set(radios.map((radio) => radio.name))).toEqual(new Set(["display-style"]));
    expect(new Set(radios.map((radio) => radio.value))).toEqual(
      new Set(DISPLAY_STYLES.map((style) => style.id)),
    );
    // Exactly one option is checked, which is what makes it a radio group and not a set of toggles.
    expect(radios.filter((radio) => radio.checked)).toHaveLength(1);
  });

  it("puts every option inside the grid wrapper, with its own preview icon and name", () => {
    build();
    const grid = document.querySelector(".style-picker > .style-picker__grid");
    expect(grid).not.toBeNull();
    const rows = Array.from(grid?.children ?? []);
    expect(rows).toHaveLength(15);
    for (const row of rows) {
      expect(row.classList.contains("style-picker-option")).toBe(true);
      expect(row.querySelectorAll('input[type="radio"]')).toHaveLength(1);
      expect(row.querySelector("svg.style-icon")).not.toBeNull();
      expect(row.querySelector(".style-picker-name")?.textContent?.trim().length).toBeGreaterThan(0);
    }
    // The icon is titled with the same name, so an icon-only surface still announces the style.
    const titles = Array.from(document.querySelectorAll(".style-picker svg title")).map(
      (title) => title.textContent,
    );
    expect(titles).toHaveLength(15);
    expect(titles[0]).toBe("None");
    expect(titles[14]).toBe("Gray");
  });

  it("renders the sample as a page: the source line above the styled translation", () => {
    build();
    const wrapper = document.querySelector(".style-picker__sample");
    expect(wrapper).not.toBeNull();
    const children = Array.from(wrapper?.children ?? []).map((child) => child.className);
    expect(children).toEqual(["style-picker__source", "ipt-style-sample"]);
    expect(document.querySelector(".style-picker__source")?.textContent).toBe(
      "The ferry leaves the northern pier at seven.",
    );
    expect(document.querySelector(".ipt-style-sample")?.getAttribute("data-ipt-style")).toBe("none");
  });

  it("omits the source line when no page line is supplied", () => {
    build({ sampleSource: undefined });
    expect(document.querySelector(".style-picker__source")).toBeNull();
    expect(document.querySelector(".ipt-style-sample")).not.toBeNull();
  });
});

describe("StylePicker state", () => {
  it("setValue moves the checked radio and the sample without notifying the caller", () => {
    const { picker, onChange } = build();
    picker.setValue("marker");
    const checked = document.querySelector<HTMLInputElement>('input[type="radio"]:checked');
    expect(checked?.value).toBe("marker");
    expect(document.querySelector(".ipt-style-sample")?.getAttribute("data-ipt-style")).toBe("marker");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("notifies once when the reader changes the selection", () => {
    const { onChange } = build();
    const radio = document.querySelector<HTMLInputElement>("#display-style-quote");
    expect(radio).not.toBeNull();
    if (!radio) return;
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("quote");
    expect(document.querySelector(".ipt-style-sample")?.getAttribute("data-ipt-style")).toBe("quote");
  });

  it("falls back to none for an unknown stored value", () => {
    const { picker } = build({ value: "not-a-style" });
    expect(picker.value).toBe("none");
    const checked = document.querySelector<HTMLInputElement>('input[type="radio"]:checked');
    expect(checked?.value).toBe("none");
  });

  it("destroys its contents without leaving radios behind", () => {
    const { picker } = build();
    picker.destroy();
    expect(document.querySelectorAll('input[type="radio"]')).toHaveLength(0);
  });
});
