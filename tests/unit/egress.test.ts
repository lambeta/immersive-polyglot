import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  buildRequestBody,
  callProvider,
  clearEgressLog,
  egressLog,
} from "../../src/background/provider-client.js";
import { startStubProvider, type StubProvider } from "../support/stub-provider.js";

/**
 * Feature 008: T22, FR-024 — the feature that shows a price must not talk to anyone to get it.
 * This is a regression guard over behaviour that already exists, not a new behaviour.
 */

const ROOT = join(import.meta.dirname, "../..");

let stub: StubProvider;

beforeAll(async () => {
  stub = await startStubProvider();
});

afterAll(async () => {
  await stub.close();
});

beforeEach(() => {
  stub.reset();
  clearEgressLog();
});

const provider = () => ({
  id: "p1",
  endpoint: `${stub.origin}/v1/chat/completions`,
  model: "deepseek-flash",
  extraHeaders: {},
  timeoutMs: 5_000,
});

describe("no new destination", () => {
  it("keeps the outbound body to exactly model, temperature and messages", () => {
    const body = JSON.parse(buildRequestBody({ model: "deepseek-flash" }, "instruction", ["a"])) as
      Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["messages", "model", "temperature"]);
  });

  it("adds no request of its own: one translation batch is one egress entry", async () => {
    stub.setMode("success", { usage: "deepseek" });
    await callProvider({
      provider: provider(),
      secret: "sk-test",
      systemInstruction: "instruction",
      segments: ["Hello"],
    });
    expect(egressLog).toEqual([`${stub.origin}/v1/chat/completions`]);
    expect(stub.requests).toHaveLength(1);
  });

  it("keeps the manifest's permissions and hosts unchanged", () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, "src/manifest.json"), "utf8")) as {
      permissions?: string[];
      host_permissions?: string[];
    };
    expect(manifest.permissions).toEqual(["storage"]);
    expect(manifest.host_permissions).toEqual(["<all_urls>"]);
  });
});
