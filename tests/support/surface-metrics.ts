import type { Page } from "@playwright/test";

/**
 * Measurements of the two extension surfaces as a browser renders them (feature 006, T014/T029/T030).
 *
 * These read live geometry and colour out of the page rather than asserting on source: a height, an
 * overflow or a contrast ratio is a property of the rendered result, and jsdom has no layout engine
 * to ask. Every helper takes the page the test already opened, so a failure localises to a surface.
 */

export interface ContrastReading {
  selector: string;
  ratio: number;
  color: string;
  ground: string;
}

/** The content height of the surface, which is what the browser caps at 600 px for a panel. */
export async function surfaceHeight(page: Page): Promise<number> {
  return page.evaluate(() => document.body.scrollHeight);
}

/**
 * Horizontal overflow of the document, or of one element if a selector is given.
 * Zero means the surface fits its column; anything above 1 px is a sideways scroll.
 */
export async function overflowOf(page: Page, selector?: string): Promise<number> {
  return page.evaluate((sel) => {
    const target = sel ? document.querySelector(sel) : document.documentElement;
    if (!target) throw new Error(`no element for ${sel ?? "document"}`);
    return target.scrollWidth - target.clientWidth;
  }, selector);
}

/**
 * Contrast of each element's text against the first opaque ground behind it, with the same
 * compositing the a11y suite uses. Alpha is composited but the common case here is opaque grounds.
 */
export async function contrastOf(page: Page, selectors: string[]): Promise<ContrastReading[]> {
  return page.evaluate((list) => {
    type Colour = { r: number; g: number; b: number; a: number };
    // Parens are not matched: a colour is read by its leading function name and its numbers,
    // so a formatting change in the computed value cannot silently turn a ratio into NaN.
    const parse = (value: string): Colour | null => {
      if (!value.startsWith("rgb")) return null;
      const numbers = value.match(/[0-9]*[.]?[0-9]+/g);
      if (!numbers || numbers.length < 3) return null;
      const [r, g, b, a] = numbers.map(Number);
      if (r === undefined || g === undefined || b === undefined) return null;
      return { r, g, b, a: a ?? 1 };
    };
    const luminance = (colour: Colour): number => {
      const channel = (value: number): number => {
        const scaled = value / 255;
        return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b);
    };
    const over = (front: Colour, back: Colour): Colour => ({
      r: front.r * front.a + back.r * (1 - front.a),
      g: front.g * front.a + back.g * (1 - front.a),
      b: front.b * front.a + back.b * (1 - front.a),
      a: 1,
    });
    const ratioOf = (a: Colour, b: Colour): number => {
      const first = luminance(a);
      const second = luminance(b);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const groundOf = (element: Element): Colour => {
      let node: Element | null = element;
      while (node) {
        const colour = parse(getComputedStyle(node).backgroundColor);
        if (colour && colour.a >= 0.9) return colour;
        node = node.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };

    return list.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`no element for ${selector}`);
      const style = getComputedStyle(element);
      const foreground = parse(style.color);
      if (!foreground) throw new Error(`unreadable colour for ${selector}`);
      const ground = groundOf(element);
      const ratio = ratioOf(over(foreground, ground), ground);
      return {
        selector,
        ratio: Number(ratio.toFixed(2)),
        color: style.color,
        ground: `rgb(${ground.r}, ${ground.g}, ${ground.b})`,
      };
    });
  }, selectors);
}

/** Requests the page made that are neither the extension itself nor its own fixtures/stub. */
export function trackExternalRequests(page: Page, allowedOrigins: string[]): string[] {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    if (allowedOrigins.some((origin) => url.startsWith(origin))) return;
    external.push(url);
  });
  return external;
}

/** Whether both bundled families really loaded, rather than silently falling back. */
export async function fontsLoaded(page: Page): Promise<{ host: boolean; mono: boolean }> {
  return page.evaluate(() => ({
    host: document.fonts.check('16px "Host Grotesk"'),
    mono: document.fonts.check('16px "JetBrains Mono"'),
  }));
}
