import { expect, test } from "@playwright/test";
import { launchWithExtension, type LaunchedExtension } from "../support/load-extension.js";

/**
 * SC-011: the picker must survive a locale whose strings run 30% longer than English, at 200% zoom.
 * No translated catalogue ships yet, so the growth is injected into the rendered labels directly.
 */

let extension: LaunchedExtension;

test.beforeEach(async () => {
  extension = await launchWithExtension();
});

test.afterEach(async () => {
  await extension.close();
});

test("style names clipped neither at 30% growth nor at 200% zoom", async () => {
  const options = await extension.openOptions();
  await options.click('button[aria-controls="panel-display"]');

  const measured = await options.evaluate(() => {
    document.body.style.zoom = "2";
    const names = Array.from(document.querySelectorAll<HTMLElement>(".style-picker-name"));
    const offenders: string[] = [];
    for (const name of names) {
      const text = name.textContent ?? "";
      // A 30% longer locale: same words plus a proportional suffix.
      name.textContent = text + " " + text.slice(0, Math.ceil(text.length * 0.3));
      const box = name.getBoundingClientRect();
      const row = (name.closest(".style-picker-option") as HTMLElement).getBoundingClientRect();
      if (name.scrollWidth > name.clientWidth + 1) offenders.push(text + " (clipped)");
      if (box.right > row.right + 1 || box.left < row.left - 1) offenders.push(text + " (overflow)");
    }

    const options = Array.from(document.querySelectorAll<HTMLElement>(".style-picker-option"))
      .map((element) => element.getBoundingClientRect())
      .sort((a, b) => a.top - b.top);
    for (let index = 1; index < options.length; index += 1) {
      const previous = options[index - 1];
      const current = options[index];
      if (previous && current && previous.bottom > current.top + 1 && previous.right > current.left + 1) {
        offenders.push("rows overlap");
      }
    }

    	const panel = document.querySelector<HTMLElement>("#panel-display");
    return {
      offenders,
      horizontal: panel ? panel.scrollWidth - panel.clientWidth : 0,
      icons: document.querySelectorAll("svg.style-icon").length,
    };
  });

  expect(measured.offenders).toEqual([]);
  expect(measured.horizontal).toBeLessThanOrEqual(1);
  expect(measured.icons).toBe(15);
});
