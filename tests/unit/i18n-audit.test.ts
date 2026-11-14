import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Principle V audit (T086): no user-visible string may bypass the catalog. This test is the
 * mechanical form of that rule — it fails when a literal leaks into markup or a key is missing.
 */

const ROOT = join(import.meta.dirname, "../..");
const CATALOG = JSON.parse(
  readFileSync(join(ROOT, "src/_locales/en/messages.json"), "utf8"),
) as Record<string, { message: string }>;

function walk(dir: string, extensions: string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path, extensions));
    else if (extensions.some((extension) => entry.endsWith(extension))) out.push(path);
  }
  return out;
}

const HTML_FILES = walk(join(ROOT, "src/ui"), [".html"]);
const TS_FILES = walk(join(ROOT, "src"), [".ts"]);
const CATALOG_KEYS = new Set(Object.keys(CATALOG));

describe("i18n catalog coverage", () => {
  it("every data-i18n attribute in markup resolves to a catalog key", () => {
    const missing: string[] = [];
    for (const file of HTML_FILES) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/data-i18n(?:-title|-aria-label|-placeholder)?="([^"]+)"/g)) {
        const key = match[1];
        if (key && !CATALOG_KEYS.has(key)) missing.push(`${file}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("markup carries no literal user-visible text", () => {
    const offenders: string[] = [];
    for (const file of HTML_FILES) {
      const source = readFileSync(file, "utf8");
      const withoutCode = source
        .replace(/<script[\s\S]*?<\/script>/g, "")
        .replace(/<style[\s\S]*?<\/style>/g, "")
        .replace(/<!--[\s\S]*?-->/g, "");
      for (const match of withoutCode.matchAll(/>([^<>]+)</g)) {
        const text = (match[1] ?? "").trim();
        if (text.length > 0 && /[A-Za-z]{2,}/.test(text)) offenders.push(`${file}: ${text}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every literal t() key in source exists in the catalog", () => {
    const missing: string[] = [];
    for (const file of TS_FILES) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\bt\(\s*"([a-zA-Z0-9_.-]+)"/g)) {
        const key = match[1];
        if (key && !CATALOG_KEYS.has(key)) missing.push(`${file}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every catalog entry has a non-empty message", () => {
    for (const [key, entry] of Object.entries(CATALOG)) {
      expect(entry.message.trim().length, key).toBeGreaterThan(0);
    }
  });

  it("every failure class a user can meet has a message", () => {
    const types = readFileSync(join(ROOT, "src/shared/types.ts"), "utf8");
    const start = types.indexOf("export type ErrorClass");
    // Only the ErrorClass union itself, up to its terminating semicolon.
    const end = types.indexOf(";", start);
    const classes = Array.from(types.slice(start, end).matchAll(/"([a-zA-Z]+)"/g)).map(
      (match) => match[1] ?? "",
    );
    expect(classes.length).toBeGreaterThan(5);
    for (const errorClass of classes) {
      const key = `error${errorClass.charAt(0).toUpperCase()}${errorClass.slice(1)}`;
      expect(CATALOG_KEYS.has(key), `missing catalog entry ${key}`).toBe(true);
    }
  });
});
