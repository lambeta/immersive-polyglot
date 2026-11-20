// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ChatSnapshot } from "@deepseek-ai/dsh-client-ui-chat/client";
import { HeaderControl } from "../../../src/plugin/client/HeaderControl.js";
import { TurnTranslation } from "../../../src/plugin/client/TurnTranslation.js";
import { en } from "../../../src/plugin/client/locales.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const snapshot = {
  legacy: {
    nodes: [
      { kind: "user", seq: 0, turn: 1 },
      { kind: "assistant", seq: 1, turn: 1, messageId: "m-1", blocks: [] },
    ],
  },
} as unknown as ChatSnapshot;

const useChat = ((selector: (value: ChatSnapshot) => unknown) => selector(snapshot)) as never;
const t = (key: keyof typeof en): string => en[key];

let root: Root | undefined;
let container: HTMLDivElement | undefined;

/** Mount one element and let effects settle. */
function mount(element: ReactElement): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(element);
  });
}

/** Stub fetch so the first read settles without a Host. */
function stubFetch(respond: (url: string) => unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const body = respond(String(input));
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
}

describe("HeaderControl", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
  });

  it("renders the idle label and enables itself when the page has answers", async () => {
    stubFetch((url) => (url.includes("/records") ? { records: [] } : { control: { on: false }, translated: [], pending: [], limits: { answers: 4 } }));
    mount(<HeaderControl sessionId="s-dom-header" useChat={useChat} t={t} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const button = container?.querySelector("button");
    expect(button?.textContent).toContain(en.controlLabel);
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("TurnTranslation", () => {
  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
  });

  it("renders nothing while translation is off, even with stored records", async () => {
    stubFetch((url) =>
      url.includes("/records")
        ? { records: [{ schemaVersion: 1, sessionId: "s-dom-off", messageId: "m-1", targetLang: "zh", sourceHash: "hash", sections: [{ blockIndex: 0, kind: "paragraph", text: "不该出现的译文" }] }] }
        : { control: { on: false }, translated: [], pending: [] },
    );
    mount(<TurnTranslation sessionId="s-dom-off" turn={{ turn: 1 }} useChat={useChat} t={t} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container?.textContent).toBe("");
    expect(container?.querySelector("[data-immersive-polyglot='sections']")).toBeNull();
  });

  it("renders the stored sections of this turn's answers", async () => {
    stubFetch((url) =>
      url.includes("/records")
        ? {
            records: [
              {
                schemaVersion: 1,
                sessionId: "s-dom-turn",
                messageId: "m-1",
                targetLang: "zh",
                sourceHash: "hash",
                sections: [{ blockIndex: 0, kind: "paragraph", text: "第一段译文" }],
              },
            ],
          }
        : { control: { on: true }, translated: [], pending: [] },
    );
    mount(<TurnTranslation sessionId="s-dom-turn" turn={{ turn: 1 }} useChat={useChat} t={t} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container?.textContent).toContain("第一段译文");
    expect(container?.querySelector("[data-immersive-polyglot='sections']")).not.toBeNull();
  });

  it("renders a translated section as Markdown instead of one plain paragraph", async () => {
    const text = [
      "## 安装步骤",
      "",
      "- 先 `npm install`",
      "- 再 **构建**",
      "",
      "```bash",
      "npm run build:plugin",
      "```",
    ].join("\n");
    stubFetch((url) =>
      url.includes("/records")
        ? {
            records: [
              {
                schemaVersion: 1,
                sessionId: "s-dom-markdown",
                messageId: "m-1",
                targetLang: "zh",
                sourceHash: "hash",
                sections: [{ blockIndex: 0, kind: "heading", text }],
              },
            ],
          }
        : { control: { on: true }, translated: [], pending: [] },
    );
    mount(<TurnTranslation sessionId="s-dom-markdown" turn={{ turn: 1 }} useChat={useChat} t={t} />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const root = container?.querySelector("[data-immersive-polyglot='sections']");
    expect(root?.querySelector("h3")?.textContent).toBe("安装步骤");
    expect(root?.querySelectorAll("ul li")).toHaveLength(2);
    expect(root?.querySelector("ul li code")?.textContent).toBe("npm install");
    expect(root?.querySelector("ul li strong")?.textContent).toBe("构建");
    expect(root?.querySelector("pre code")?.textContent).toBe("npm run build:plugin");
  });
});
