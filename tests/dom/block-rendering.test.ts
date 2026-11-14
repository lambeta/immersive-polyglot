import { describe, expect, it } from "vitest";
import {
  AbortableCaller,
  DeferredCaller,
  FailingCaller,
  FakeCaller,
  PREFIX,
  abstractPage,
  longParagraph,
  partsOf,
  phrase,
  startJob,
} from "./job-harness.js";

/**
 * US1/US2: one source block, however many parts, presents one complete passage in source order,
 * and does so in every display mode. The provider boundary is the only double.
 */

function abstractSource(page: { body: HTMLElement }): HTMLElement {
  return page.body.querySelector("p.abstract") as HTMLElement;
}

function shuffled(seed: number): (indices: number[]) => number[] {
  return (indices) => {
    const copy = [...indices];
    let state = seed;
    for (let index = copy.length - 1; index > 0; index -= 1) {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      const swap = state % (index + 1);
      const left = copy[index] as number;
      const right = copy[swap] as number;
      copy[index] = right;
      copy[swap] = left;
    }
    return copy;
  };
}

describe("a long block is one complete passage", () => {
  it("renders every part once, in source order, in one container", async () => {
    const { page, job } = startJob(abstractPage());
    const source = abstractSource(page);
    const beforeParent = source.parentNode;
    const beforeText = source.textContent;
    await job.run();

    const container = source.nextElementSibling as HTMLElement;
    expect(container.getAttribute("data-ipt")).toBe("target");
    expect(page.body.querySelectorAll('[data-ipt="target"]')).toHaveLength(3);
    expect(container.textContent).toBe(partsOf(job, source).join(" "));
    expect(source.parentNode).toBe(beforeParent);
    expect(source.textContent).toBe(beforeText);

    const inserts = job.journal
      .entries()
      .filter((entry) => entry.kind === "insert" && entry.node === container);
    expect(inserts).toHaveLength(1);
  });

  it("keeps a single-part block rendered once, next to a split block", async () => {
    const { page, job } = startJob(abstractPage());
    const short = page.body.querySelector("article > p:last-child") as HTMLElement;
    await job.run();

    expect(short.nextElementSibling?.textContent).toBe(`${PREFIX}Short.`);
    expect(page.body.querySelectorAll('[data-ipt="target"]')).toHaveLength(3);
  });
});

describe("arrival order does not change the passage", () => {
  it("produces the same text when replies arrive reversed", async () => {
    const forward = startJob(abstractPage());
    await forward.job.run();
    const expected = abstractSource(forward.page).nextElementSibling?.textContent;

    const reversed = startJob(abstractPage(), {
      caller: new FakeCaller((indices) => [...indices].reverse()),
    });
    await reversed.job.run();
    expect(abstractSource(reversed.page).nextElementSibling?.textContent).toBe(expected);
  });

  it("produces the same text under 20 shuffled arrivals", async () => {
    const forward = startJob(abstractPage());
    await forward.job.run();
    const expected = abstractSource(forward.page).nextElementSibling?.textContent;

    for (let seed = 1; seed <= 20; seed += 1) {
      const shuffledRun = startJob(abstractPage(), { caller: new FakeCaller(shuffled(seed)) });
      await shuffledRun.job.run();
      expect(abstractSource(shuffledRun.page).nextElementSibling?.textContent).toBe(expected);
    }
  });

  it("re-rendering the same block is idempotent", async () => {
    const { job } = startJob(abstractPage());
    await job.run();
    const before = job.journal.size;
    await job.run();
    expect(job.journal.size).toBe(before);
  });
});

describe("display modes keep the whole passage", () => {
  it("translation-only hides the source once and shows the complete passage", async () => {
    const { page, job } = startJob(abstractPage(), { displayMode: "only" });
    const source = abstractSource(page);
    await job.run();

    expect(source.hasAttribute("hidden")).toBe(true);
    expect(source.style.display).toBe("none");
    const container = source.nextElementSibling as HTMLElement;
    expect(container.getAttribute("data-ipt")).toBe("target");
    expect(container.textContent).toBe(partsOf(job, source).join(" "));
  });

  it("switching bilingual, above and only keeps one container and the same text", async () => {
    const { page, job } = startJob(abstractPage());
    const source = abstractSource(page);
    await job.run();
    const container = job.renderer.renderedElement(source) as HTMLElement;
    const text = container.textContent;
    expect(text).toBe(partsOf(job, source).join(" "));

    job.setDisplayMode("above");
    expect(source.previousElementSibling === container).toBe(true);
    expect(container.textContent).toBe(text);

    job.setDisplayMode("only");
    expect(source.hasAttribute("hidden")).toBe(true);
    expect(container.textContent).toBe(text);

    job.setDisplayMode("bilingual");
    expect(source.nextElementSibling === container).toBe(true);
    expect(source.hasAttribute("hidden")).toBe(false);
    expect(container.textContent).toBe(text);
    expect(page.body.querySelectorAll('[data-ipt="target"]')).toHaveLength(3);
  });

  it("switching while parts are still arriving ends complete", async () => {
    const caller = new DeferredCaller();
    const { page, job } = startJob(abstractPage(), { caller });
    const running = job.run();
    job.setDisplayMode("only");
    caller.release();
    await running;

    const source = abstractSource(page);
    expect(source.hasAttribute("hidden")).toBe(true);
    expect(source.nextElementSibling?.textContent).toBe(partsOf(job, source).join(" "));
  });
});

describe("duplicates, late content, failure and selection", () => {
  it("renders a repeated long paragraph complete at both occurrences", async () => {
    const html = `<article><p id="a">${longParagraph()}</p><p id="b">${longParagraph()}</p></article>`;
    const { page, job, caller } = startJob(html);
    const first = page.body.querySelector("#a") as HTMLElement;
    const second = page.body.querySelector("#b") as HTMLElement;
    await job.run();

    const firstText = partsOf(job, first).join(" ");
    expect(first.nextElementSibling?.textContent).toBe(firstText);
    expect(second.nextElementSibling?.textContent).toBe(firstText);
    expect(page.body.querySelectorAll('[data-ipt="target"]')).toHaveLength(2);

    const sent = caller.requests.flatMap((request) => request.segments);
    expect(sent.filter((text) => text === job.units[0]?.sourceText)).toHaveLength(1);
  });

  it("reproduces a sentence repeated inside one block as many times as it occurs", async () => {
    const sentence = `${"z".repeat(250)}.`;
    const { page, job } = startJob(`<article><p>${sentence} ${sentence}</p></article>`);
    const source = page.body.querySelector("p") as HTMLElement;
    await job.run();

    const text = source.nextElementSibling?.textContent ?? "";
    expect(text.split(`${PREFIX}${sentence}`).length - 1).toBe(2);
  });

  it("shows the successful parts when one part fails, without placeholder text", async () => {
    const { page, job } = startJob(abstractPage(), { caller: new FailingCaller([0]) });
    const source = page.body.querySelector("p.abstract") as HTMLElement;
    const result = await job.run();

    const container = source.nextElementSibling as HTMLElement;
    expect(container.getAttribute("data-ipt")).toBe("target");
    const text = container.textContent ?? "";
    expect(text).not.toContain("Alpha");
    expect(text).toContain("Bravo");
    expect(text).not.toMatch(/unavailable|placeholder|\.\.\./u);
    expect(result.counts.failed).toBe(1);
  });

  it("leaves no fabricated part when a run is cancelled", async () => {
    const { page, job } = startJob(abstractPage(), { caller: new AbortableCaller() });
    const running = job.run();
    job.cancel();
    await running;

    expect(job.state).toBe("cancelled");
    expect(page.body.querySelectorAll('[data-ipt="target"]')).toHaveLength(0);
  });

  it("renders late content complete and does not duplicate it on re-collect", async () => {
    const { page, job } = startJob('<article><p id="first">Short one.</p></article>');
    await job.run();

    const late = page.document.createElement("p");
    late.textContent = longParagraph();
    page.body.appendChild(late);

    await job.translateElements([late]);
    expect(late.nextElementSibling?.textContent).toBe(partsOf(job, late).join(" "));

    await job.translateElements([late]);
    expect(page.body.querySelectorAll('[data-ipt="target"]')).toHaveLength(2);
  });

  it("gives a selected long block the same complete treatment", async () => {
    const { page, job } = startJob(abstractPage());
    const source = page.body.querySelector("p.abstract") as HTMLElement;
    await job.translateElements([source]);

    expect(source.nextElementSibling?.textContent).toBe(partsOf(job, source).join(" "));
    expect(page.body.querySelectorAll('[data-ipt="target"]')).toHaveLength(1);
  });
});


describe("scale", () => {
  it("renders 100 four-part blocks under one second without dropping a part", async () => {
    const body = Array.from({ length: 100 }, (_, index) => {
      const sentences = [0, 1, 2, 3].map(
        (part) => `Block ${index} part ${part} ${phrase}, ${phrase}.`,
      );
      return `<p id="p${index}">${sentences.join(" ")}</p>`;
    }).join("");
    const { page, job, caller } = startJob(`<article>${body}</article>`);

    const startedAt = performance.now();
    await job.run();
    const elapsed = performance.now() - startedAt;

    expect(elapsed).toBeLessThan(1_000);
    expect(page.body.querySelectorAll('[data-ipt="target"]')).toHaveLength(100);
    for (let index = 0; index < 100; index += 1) {
      const source = page.body.querySelector(`#p${index}`) as HTMLElement;
      expect(source.nextElementSibling?.textContent).toBe(partsOf(job, source).join(" "));
    }
    // Batched: one request per batch, never one per part.
    expect(caller.requests.length).toBeLessThan(job.units.length);
  });
});

