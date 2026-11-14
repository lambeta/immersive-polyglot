/**
 * Contrast-safe foregrounds (FR-013, SC-008). CSS cannot guarantee a ratio against a page's real
 * background, and opacity cannot either (50% black on white is ~3.9:1), so gray and weakened styles
 * derive their colour from the backdrop actually rendered behind the translation.
 *
 * Pure and deterministic: the same backdrop and policy always yield the same colour.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };
export const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

const HEX_SHORT = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i;
const HEX_LONG = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i;
const RGB_FUNCTION = /^rgba?\(([^)]+)\)$/i;
const COLOR_FUNCTION = /^color\(\s*srgb\s+([^)]+)\)$/i;

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseComponent(token: string, max: number): number | null {
  const trimmed = token.trim();
  if (trimmed.endsWith("%")) {
    const percent = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(percent) ? clamp255((percent / 100) * max) : null;
  }
  const value = Number.parseFloat(trimmed);
  return Number.isFinite(value) ? clamp255(value) : null;
}

function parseAlpha(token: string | undefined): number {
  if (token === undefined) return 1;
  const trimmed = token.trim();
  if (trimmed.endsWith("%")) {
    const percent = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(percent) ? Math.max(0, Math.min(1, percent / 100)) : 1;
  }
  const value = Number.parseFloat(trimmed);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

/** Parses the shapes a computed style can produce; returns null for anything unparseable. */
export function parseColor(value: string | null | undefined): Rgba | null {
  if (!value) return null;
  const input = value.trim();
  if (input.length === 0) return null;
  if (input === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (input === "white") return { ...WHITE };
  if (input === "black") return { ...BLACK };

  const short = HEX_SHORT.exec(input);
  if (short) {
    const red = short[1] ?? "0";
    const green = short[2] ?? "0";
    const blue = short[3] ?? "0";
    const alpha = short[4];
    return {
      r: parseInt(red + red, 16),
      g: parseInt(green + green, 16),
      b: parseInt(blue + blue, 16),
      a: alpha ? parseInt(alpha + alpha, 16) / 255 : 1,
    };
  }

  const long = HEX_LONG.exec(input);
  if (long) {
    const alpha = long[4];
    return {
      r: parseInt(long[1] ?? "00", 16),
      g: parseInt(long[2] ?? "00", 16),
      b: parseInt(long[3] ?? "00", 16),
      a: alpha ? parseInt(alpha, 16) / 255 : 1,
    };
  }

  const srgb = COLOR_FUNCTION.exec(input);
  if (srgb) {
    const parts = (srgb[1] ?? "").split(/[\s/]+/).filter(Boolean);
    if (parts.length >= 3) {
      const [r, g, b] = parts;
      return {
        r: clamp255(Number.parseFloat(r ?? "0") * 255),
        g: clamp255(Number.parseFloat(g ?? "0") * 255),
        b: clamp255(Number.parseFloat(b ?? "0") * 255),
        a: parseAlpha(parts[3]),
      };
    }
    return null;
  }

  const rgb = RGB_FUNCTION.exec(input);
  if (rgb) {
    const parts = (rgb[1] ?? "").split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const r = parseComponent(parts[0] ?? "", 255);
    const g = parseComponent(parts[1] ?? "", 255);
    const b = parseComponent(parts[2] ?? "", 255);
    if (r === null || g === null || b === null) return null;
    return { r, g, b, a: parseAlpha(parts[3]) };
  }

  return null;
}

export function toCss(color: Rgba): string {
  return `rgb(${clamp255(color.r)}, ${clamp255(color.g)}, ${clamp255(color.b)})`;
}

function channelLuminance(channel: number): number {
  const scaled = channel / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Rgba): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

/** WCAG 2 contrast ratio, 1:1 to 21:1. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Alpha-composites an RGBA over an opaque background. */
export function composite(foreground: Rgba, background: Rgba): Rgba {
  const alpha = Math.max(0, Math.min(1, foreground.a));
  const outAlpha = alpha + background.a * (1 - alpha);
  if (outAlpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (foreground.r * alpha + background.r * background.a * (1 - alpha)) / outAlpha,
    g: (foreground.g * alpha + background.g * background.a * (1 - alpha)) / outAlpha,
    b: (foreground.b * alpha + background.b * background.a * (1 - alpha)) / outAlpha,
    a: outAlpha,
  };
}

export function mix(from: Rgba, to: Rgba, amount: number): Rgba {
  const t = Math.max(0, Math.min(1, amount));
  return composite({ r: to.r, g: to.g, b: to.b, a: t }, from);
}

function gray(level: number): Rgba {
  const value = clamp255(level);
  return { r: value, g: value, b: value, a: 1 };
}

/** WCAG "large text": >= 18.66px, or >= 14px when bold. */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 18.66 || (fontWeight >= 700 && fontSizePx >= 14);
}

export type ForegroundPolicy = "hue-blend" | "neutral";

export interface SafeForegroundOptions {
  largeText?: boolean;
}

/**
 * The original colour, or the nearest passing one.
 *
 * - `hue-blend` keeps the translation's hue and fades it toward the backdrop only as far as the
 *   threshold allows.
 * - `neutral` picks the least saturated gray that passes.
 *
 * If the inherited colour already fails, the black-or-white pole is returned; one of them always
 * reaches at least 4.58:1 on any opaque backdrop, so the threshold is never silently missed.
 */
export function safeForeground(
  backdrop: Rgba,
  policy: ForegroundPolicy,
  inherited: Rgba = BLACK,
  options: SafeForegroundOptions = {},
): Rgba {
  // A small margin keeps the measured ratio at or above the WCAG threshold after rounding the
  // chosen colour to 8-bit channels.
  const target = (options.largeText === true ? 3 : 4.5) + 0.1;
  const background = composite(backdrop, WHITE);
  const pole =
    contrastRatio(BLACK, background) >= contrastRatio(WHITE, background) ? BLACK : WHITE;

  if (policy === "neutral") {
    // A neutral gray is pushed to a stronger 7:1 where the backdrop allows it, so it reads as a
    // deliberate dark gray rather than as a barely-passing fade (which is what "weakened" is).
    // On mid-luminance backdrops where 7:1 is impossible the pole itself is the answer.
    const preferred = Math.max(target, 7);
    const poleIsBlack = pole.r === 0;
    let low = 0;
    let high = 255;
    let best: number | null = null;
    for (let step = 0; step < 24; step += 1) {
      const middle = (low + high) / 2;
      const candidate = gray(middle);
      if (contrastRatio(candidate, background) >= preferred) {
        best = Math.round(middle);
        if (poleIsBlack) low = middle;
        else high = middle;
      } else if (poleIsBlack) {
        high = middle;
      } else {
        low = middle;
      }
    }
    return best === null ? pole : gray(best);
  }

  const base = inherited.a > 0 ? composite(inherited, background) : pole;
  if (contrastRatio(base, background) < target) return pole;

  let low = 0;
  let high = 1;
  for (let step = 0; step < 20; step += 1) {
    const middle = (low + high) / 2;
    if (contrastRatio(mix(base, background, middle), background) >= target) low = middle;
    else high = middle;
  }
  return mix(base, background, low);
}

/**
 * The opaque colour actually rendered behind an element, compositing translucent ancestor
 * backgrounds over a white canvas assumption. Bounded so a pathological DOM cannot stall a render.
 */
export function effectiveBackdrop(element: Element, view: Window): Rgba {
  const layers: Rgba[] = [];
  let node: Element | null = element;
  let depth = 0;
  while (node && depth < 50) {
    depth += 1;
    let color: Rgba | null = null;
    try {
      color = parseColor(view.getComputedStyle(node).backgroundColor);
    } catch {
      color = null;
    }
    if (color && color.a > 0) {
      layers.push(color);
      if (color.a >= 1) break;
    }
    node = node.parentElement;
  }

  let result: Rgba = { ...WHITE };
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (layer) result = composite(layer, result);
  }
  return result;
}
