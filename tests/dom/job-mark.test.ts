import { describe, expect, it } from "vitest";
import { AbortableCaller, DeferredCaller, FailingCaller, PREFIX, startJob } from "./job-harness.js";

/** Feature 007 US1: a dispatched passage wears exactly one mark until its translation lands. */

const page = (body: string) => `<article>${body}</article>`;

describe("a mark appears while a passage's translation is on its way", () => {
  it("shows the mark before the provider is asked, and replaces it with the translation", async () => {
    const { page: testPage, job, caller } = startJob(page("<p>Alpha passage.</p>"), {
      caller: new DeferredCaller(),
    });
    const source = testPage.document.querySelector("p") as Element;

    const running = job.run();
    await Promise.resolve();

    expect(caller.requests).toHaveLength(1);
    const mark = source.nextElementSibling as Element;
    expect(mark.getAttribute("data-ipt")).toBe("pending");
    expect(mark.textContent).toBe("");

    caller.release();
    await running;

    expect(testPage.document.querySelectorAll('[data-ipt="pending"]')).toHaveLength(0);
    const container = source.nextElementSibling as Element;
    expect(container).toBe(mark);
    expect(container.getAttribute("data-ipt")).toBe("target");
    expect(container.textContent).toBe(`${PREFIX}Alpha passage.`);
  });

  it("never puts a mark on a passage it skipped", async () => {
    const { page: testPage, job } = startJob(
      page("<p>Alpha passage.</p><p>Alpha passage.</p><p>Bravo passage.</p><pre>code()</pre>"),
    );
    const [, duplicate, third] = Array.from(testPage.document.querySelectorAll("p"));

    await job.run();

    // The repeated passage is filled from the first translation, without a mark of its own.
    expect(duplicate?.nextElementSibling?.getAttribute("data-ipt")).toBe("target");
    expect(third?.getAttribute("data-ipt")).toBe("source");
    expect(testPage.document.querySelectorAll('[data-ipt="pending"]')).toHaveLength(0);
  });

  it("removes the mark when the passage fails, showing nothing in its place", async () => {
    const { page: testPage, job } = startJob(page("<p>Alpha passage.</p>"), {
      caller: new FailingCaller([0]),
    });
    const source = testPage.document.querySelector("p") as Element;

    await job.run();

    expect(testPage.document.querySelectorAll('[data-ipt="pending"]')).toHaveLength(0);
    expect(testPage.document.querySelectorAll('[data-ipt="target"]')).toHaveLength(0);
    expect(source.hasAttribute("data-ipt")).toBe(false);
  });

  it("does not count a mark among the translated passages", async () => {
    const { job, caller } = startJob(page("<p>Alpha passage.</p>"), {
      caller: new DeferredCaller(),
    });

    const running = job.run();
    await Promise.resolve();
    expect(job.counts.translated).toBe(0);
    expect(job.counts.failed).toBe(0);
    expect(job.counts.skipped).toBe(0);

    caller.release();
    await running;
    expect(job.counts.translated).toBe(1);
  });

  it("leaves no mark after cancellation", async () => {
    const { page: testPage, job } = startJob(page("<p>Alpha passage.</p>"), {
      caller: new AbortableCaller(),
    });

    const running = job.run();
    await Promise.resolve();
    expect(testPage.document.querySelectorAll('[data-ipt="pending"]')).toHaveLength(1);

    job.cancel();
    await running;

    expect(testPage.document.querySelectorAll('[data-ipt="pending"]')).toHaveLength(0);
  });
});
