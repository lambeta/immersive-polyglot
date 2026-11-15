import { DISPLAY_STYLES, resolveDisplayStyle } from "../../shared/display-styles.js";
import type { DisplayStyleId } from "../../shared/types.js";
import { clear, el } from "./dom.js";
import { t } from "./i18n.js";

/**
 * The style picker shared by the options page and the page control (contracts/display-style-catalog.md
 * section 4). A native radio group gives keyboard and screen-reader behaviour for free; every option
 * carries its localised name and, from US2 on, a preview icon.
 */

export interface StylePickerOptions {
  /** Radio group name; must be unique on the page. */
  name: string;
  /** Legend text; defaults to the shared label. */
  legend?: string;
  value?: unknown;
  showSample?: boolean;
  sampleText?: string;
  /** A line of the page's own language shown above the sample, so the preview reads as a page. */
  sampleSource?: string;
  /** Render a preview icon per option (FR-007). */
  showIcons?: boolean;
  /** Builds the icon node for a style; supplied by the UI so the component stays DOM-only. */
  iconFor?: (styleId: DisplayStyleId) => Node;
  onChange?: (styleId: DisplayStyleId) => void;
}

export class StylePicker {
  readonly element: HTMLFieldSetElement;
  readonly #radios = new Map<DisplayStyleId, HTMLInputElement>();
  readonly #options: StylePickerOptions;
  #sample: HTMLElement | null = null;
  #value: DisplayStyleId;

  constructor(options: StylePickerOptions) {
    this.#options = options;
    this.#value = resolveDisplayStyle(options.value);

    const fieldset = el("fieldset", { class: "style-picker", "data-style-picker": options.name });
    const legend = el("legend", { text: options.legend ?? t("displayStyleLabel") });
    fieldset.append(legend);

    // The options live in their own grid: a fieldset's legend is not a reliable grid item, and
    // the surface needs two columns on the settings page and five icon tiles in the panel.
    const grid = el("div", { class: "style-picker__grid" });
    fieldset.append(grid);

    for (const style of DISPLAY_STYLES) {
      const inputId = `${options.name}-${style.id}`;
      const input = el("input", {
        type: "radio",
        name: options.name,
        id: inputId,
        value: style.id,
      });
      input.checked = style.id === this.#value;
      input.addEventListener("change", () => {
        if (!input.checked) return;
        this.apply(style.id, true);
      });
      this.#radios.set(style.id, input);

      const nameText = el("span", { class: "style-picker-name", text: t(style.nameKey) });
      const label = el("label", { for: inputId, class: "style-picker-text" }, [nameText]);
      const row = el("div", { class: "style-picker-option", title: t(style.nameKey) }, [input]);
      if (options.showIcons && options.iconFor) {
        // The icon is labelled in its own right (FR-008) and sits beside the radio's label, so
        // the radio's accessible name stays exactly the style name.
        row.append(el("span", { class: "style-picker-icon" }, [options.iconFor(style.id)]));
      }
      row.append(label);
      grid.append(row);
    }

    if (options.showSample) {
      const wrapper = el("div", { class: "style-picker__sample" });
      if (options.sampleSource) {
        wrapper.append(el("p", { class: "style-picker__source", text: options.sampleSource }));
      }
      const sample = el("div", {
        class: "ipt-style-sample",
        "data-ipt-style": this.#value,
        text: options.sampleText ?? t("displayStyleSample"),
      });
      this.#sample = sample;
      wrapper.append(sample);
      fieldset.append(wrapper);
    }

    this.element = fieldset;
  }

  get value(): DisplayStyleId {
    return this.#value;
  }

  /** Update the selection without notifying (used when storage changes elsewhere). */
  setValue(value: unknown): void {
    this.apply(resolveDisplayStyle(value), false);
  }

  private apply(styleId: DisplayStyleId, notify: boolean): void {
    this.#value = styleId;
    for (const [id, radio] of this.#radios) radio.checked = id === styleId;
    if (this.#sample) this.#sample.setAttribute("data-ipt-style", styleId);
    if (notify) this.#options.onChange?.(styleId);
  }

  destroy(): void {
    clear(this.element);
    this.#radios.clear();
  }
}
