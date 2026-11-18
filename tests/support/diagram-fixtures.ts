import { expect, type Page } from "@playwright/test";
import type { LaunchedExtension } from "./load-extension.js";
import type { StubProvider } from "./stub-provider.js";
import { configureProviders, jobStatus } from "./e2e-fixtures.js";

/** The measured Chinese translations from research R4, so the captured fixture is deterministic. */
export const CAPTURED_LABELS: Record<string, string> = {
  "Curate ~100 goldens (inputs & expected outputs)": "整理约100个黄金样本（输入和预期输出）",
  "Define 3-5 key metrics": "定义3-5个关键指标",
  "Update prompt, model, or logic": "更新提示词、模型或逻辑",
  "Generate outputs for test cases": "为测试用例生成输出",
  "Return metric scores": "返回指标分数",
  "[Iterate until pass]": "[迭代直到通过]",
};

export function translateCaptured(text: string): string {
  return CAPTURED_LABELS[text] ?? `【译】${text}`;
}

export async function seedDiagramProvider(
  extension: LaunchedExtension,
  stub: StubProvider,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await configureProviders(
    extension,
    [
      {
        id: "p_diagram",
        name: "Diagram stub",
        endpoint: `${stub.origin}/v1/chat/completions`,
        model: "stub-model",
        secret: "sk-e2e-diagram-123456",
      },
    ],
    overrides,
  );
}

export async function waitForTranslated(
  extension: LaunchedExtension,
  url: string,
  minimum: number,
): Promise<void> {
  await expect
    .poll(async () => (await jobStatus(extension, url)).counts.translated, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(minimum);
}

export interface SvgText {
  text: string;
  size: string;
}

export async function svgTexts(page: Page): Promise<SvgText[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("svg text")).map((text) => ({
      text: text.textContent ?? "",
      size: window.getComputedStyle(text).fontSize,
    })),
  );
}

/** Shape geometry inside the SVG's own user space, so page-level shifts cannot affect the compare. */
export async function shapeBoxes(page: Page): Promise<number[][]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("svg rect, svg line, svg path")).map((shape) => {
      const box = (shape as SVGGraphicsElement).getBBox();
      return [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 100) / 100);
    }),
  );
}

export async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

export function sentBodies(stub: StubProvider): string {
  return stub.requests.map((request) => JSON.stringify(request.body)).join("\n");
}
