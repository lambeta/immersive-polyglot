import { DISPLAY_STYLES, displayStyleById, type DisplayStyleIcon } from "../../shared/display-styles.js";
import type { DisplayStyleId } from "../../shared/types.js";
import { t } from "./i18n.js";

/**
 * Preview icons (FR-007, FR-008, FR-010). One inline SVG per catalogue entry, generated from the
 * entry's own descriptor so the icon cannot drift from the treatment it names. Vector, currentColor,
 * shape-based (so it survives a colour-blind or grayscale rendering), and labelled for assistive
 * technology.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
let iconCounter = 0;

const PATTERN_DASHES: Record<string, string | null> = {
  solid: null,
  dashed: "3 2",
  dotted: "1 2",
};

function svgElement<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const element = doc.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

function textBar(doc: Document, x: number, y: number, width: number): SVGElement {
  return svgElement(doc, "rect", {
    x,
    y,
    width,
    height: 2.6,
    rx: 1.2,
    class: "style-icon-text",
    fill: "currentColor",
  });
}

/** The decorative mark of one icon, drawn over the abstract text bars. */
function drawMark(doc: Document, icon: DisplayStyleIcon, unique: string): SVGElement[] {
  const marks: SVGElement[] = [];
  const stroke = "currentColor";
  const dash = icon.pattern ? PATTERN_DASHES[icon.pattern] ?? null : null;

  switch (icon.mark) {
    case "none":
      break;
    case "underline": {
      const line = svgElement(doc, "line", {
        x1: 4,
        y1: 14,
        x2: 20,
        y2: 14,
        stroke,
        "stroke-width": 1.6,
      });
      if (dash) line.setAttribute("stroke-dasharray", dash);
      marks.push(line);
      break;
    }
    case "border": {
      const rect = svgElement(doc, "rect", {
        x: 1.6,
        y: 1.6,
        width: 20.8,
        height: 12.8,
        rx: 2,
        fill: "none",
        stroke,
        "stroke-width": 1.4,
      });
      if (dash) rect.setAttribute("stroke-dasharray", dash);
      marks.push(rect);
      break;
    }
    case "rule":
      marks.push(
        svgElement(doc, "line", {
          x1: 2,
          y1: 2.4,
          x2: 22,
          y2: 2.4,
          stroke,
          "stroke-width": 1.6,
        }),
      );
      break;
    case "fill":
      marks.push(
        svgElement(doc, "rect", {
          x: 2,
          y: 1.6,
          width: 20,
          height: 12.8,
          rx: 2,
          fill: stroke,
          opacity: 0.28,
        }),
      );
      break;
    case "band":
      marks.push(
        svgElement(doc, "rect", {
          x: 2,
          y: 8.6,
          width: 20,
          height: 5.8,
          rx: 1,
          fill: stroke,
          opacity: 0.38,
        }),
      );
      break;
    case "band-slanted":
      marks.push(
        svgElement(doc, "path", {
          d: "M2 14.4 L22 7.2 L22 13.2 L2 13.2 Z",
          fill: stroke,
          opacity: 0.34,
        }),
      );
      break;
    case "bar":
      marks.push(
        svgElement(doc, "rect", { x: 2.4, y: 1.6, width: 2.6, height: 12.8, rx: 1, fill: stroke }),
      );
      break;
    case "blur":
      marks.push(
        svgElement(doc, "rect", {
          x: 2,
          y: 1.6,
          width: 20,
          height: 12.8,
          fill: stroke,
          opacity: 0.22,
          filter: `url(#${unique}-blur)`,
        }),
      );
      break;
    case "dim":
      marks.push(
        svgElement(doc, "rect", {
          x: 2,
          y: 1.6,
          width: 20,
          height: 12.8,
          rx: 2,
          fill: "none",
          stroke,
          "stroke-width": 1.2,
          "stroke-dasharray": "2 2",
          opacity: 0.4,
        }),
      );
      break;
    case "fade":
      marks.push(
        svgElement(doc, "rect", {
          x: 2,
          y: 1.6,
          width: 20,
          height: 12.8,
          rx: 2,
          fill: `url(#${unique}-fade)`,
        }),
      );
      break;
    case "hatch":
      marks.push(
        svgElement(doc, "rect", {
          x: 2,
          y: 1.6,
          width: 20,
          height: 12.8,
          rx: 2,
          fill: `url(#${unique}-hatch)`,
          opacity: 0.7,
        }),
      );
      break;
    default:
      break;
  }
  return marks;
}

function drawDefs(doc: Document, icon: DisplayStyleIcon, unique: string): SVGElement {
  const defs = svgElement(doc, "defs", {});
  if (icon.mark === "blur") {
    const filter = svgElement(doc, "filter", { id: `${unique}-blur`, x: "-20%", y: "-20%", width: "140%", height: "140%" });
    filter.append(svgElement(doc, "feGaussianBlur", { stdDeviation: 1.1 }));
    defs.append(filter);
  }
  if (icon.mark === "fade") {
    const gradient = svgElement(doc, "linearGradient", { id: `${unique}-fade`, x1: "0", y1: "0", x2: "1", y2: "0" });
    gradient.append(svgElement(doc, "stop", { offset: "0", "stop-color": "currentColor", "stop-opacity": 0.9 }));
    gradient.append(svgElement(doc, "stop", { offset: "1", "stop-color": "currentColor", "stop-opacity": 0.1 }));
    defs.append(gradient);
  }
  if (icon.mark === "hatch") {
    const pattern = svgElement(doc, "pattern", {
      id: `${unique}-hatch`,
      width: 4,
      height: 4,
      patternUnits: "userSpaceOnUse",
      patternTransform: "rotate(45)",
    });
    pattern.append(
      svgElement(doc, "rect", { width: 1.2, height: 4, fill: "currentColor", opacity: 0.8 }),
    );
    defs.append(pattern);
  }
  return defs;
}

/** The icon for one style; the document is injectable so tests do not need a global DOM. */
export function previewIcon(styleId: DisplayStyleId, doc: Document = document): SVGSVGElement {
  const style = displayStyleById(styleId);
  iconCounter += 1;
  const unique = `ipt-style-icon-${iconCounter}`;
  const titleId = `${unique}-title`;

  const svg = svgElement(doc, "svg", {
    viewBox: "0 0 24 16",
    width: 22,
    height: 16,
    class: "style-icon",
    role: "img",
    "aria-labelledby": titleId,
    focusable: "false",
  });
  const title = svgElement(doc, "title", { id: titleId });
  title.textContent = t(style.nameKey);
  svg.append(title);

  const defs = drawDefs(doc, style.icon, unique);
  if (defs.childNodes.length > 0) svg.append(defs);

  const group = svgElement(doc, "g", {});
  const offset = style.icon.mark === "bar" ? 7 : 4;
  group.append(textBar(doc, offset, 4, 16 - (offset - 4)));
  group.append(textBar(doc, offset, 9.4, 10));
  for (const mark of drawMark(doc, style.icon, unique)) group.append(mark);
  svg.append(group);
  return svg as SVGSVGElement;
}

/** Every catalogued id has exactly one icon; used by the audit test. */
export function previewIconForAll(doc: Document = document): Map<DisplayStyleId, SVGSVGElement> {
  return new Map(DISPLAY_STYLES.map((style) => [style.id, previewIcon(style.id, doc)]));
}
