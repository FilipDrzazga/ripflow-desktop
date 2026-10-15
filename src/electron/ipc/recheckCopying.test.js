import { describe, it, expect } from "vitest";
import { PDF_STATE } from "../../shared/inboxReadiness.js";
import { rememberCopying, recheckCopying } from "./recheckCopying.js";

const checkFrom = (verdicts) => async (p) => {
  const v = verdicts[p];
  if (v instanceof Error) throw v;
  return v;
};

describe("recheckCopying - only the rows the last scan listed as copying", () => {
  it("asks about exactly those paths and reports the ones that finished", async () => {
    rememberCopying(new Map([["G_a.pdf", "C:/in/G/a.pdf"], ["G_b.pdf", "C:/in/G/b.pdf"], ["G_c.pdf", "C:/in/G/c.pdf"]]));
    const asked = [];
    const check = async (p) => {
      asked.push(p);
      return { "C:/in/G/a.pdf": { state: PDF_STATE.READY }, "C:/in/G/b.pdf": { state: PDF_STATE.COPYING, reason: "x" }, "C:/in/G/c.pdf": { state: PDF_STATE.READY_NO_EOF } }[p];
    };
    const res = await recheckCopying({ check });
    expect(asked).toEqual(["C:/in/G/a.pdf", "C:/in/G/b.pdf", "C:/in/G/c.pdf"]);
    expect(res).toEqual({
      success: true,
      updates: [{ id: "G_a.pdf", state: PDF_STATE.READY }, { id: "G_c.pdf", state: PDF_STATE.READY_NO_EOF }],
    });
  });

  it("a file that finished is not asked about again; one still copying is", async () => {
    rememberCopying(new Map([["G_a.pdf", "p/a"], ["G_b.pdf", "p/b"]]));
    await recheckCopying({ check: checkFrom({ "p/a": { state: PDF_STATE.READY }, "p/b": { state: PDF_STATE.COPYING } }) });
    const asked = [];
    await recheckCopying({ check: async (p) => (asked.push(p), { state: PDF_STATE.COPYING }) });
    expect(asked).toEqual(["p/b"]);
  });

  it("a file that vanished or stopped being a PDF is dropped and reported as nothing", async () => {
    rememberCopying(new Map([["G_a.pdf", "p/a"], ["G_b.pdf", "p/b"]]));
    const res = await recheckCopying({ check: checkFrom({ "p/a": { state: PDF_STATE.GONE }, "p/b": { state: PDF_STATE.NOT_PDF } }) });
    expect(res).toEqual({ success: true, updates: [] });
    const asked = [];
    await recheckCopying({ check: async (p) => (asked.push(p), { state: PDF_STATE.COPYING }) });
    expect(asked).toEqual([]);
  });

  it("an unreadable file is skipped this tick and asked again at the next", async () => {
    rememberCopying(new Map([["G_a.pdf", "p/a"], ["G_b.pdf", "p/b"]]));
    const first = await recheckCopying({ check: checkFrom({ "p/a": Object.assign(new Error("EIO"), { code: "EIO" }), "p/b": { state: PDF_STATE.READY } }) });
    expect(first.updates).toEqual([{ id: "G_b.pdf", state: PDF_STATE.READY }]);
    const second = await recheckCopying({ check: checkFrom({ "p/a": { state: PDF_STATE.READY } }) });
    expect(second.updates).toEqual([{ id: "G_a.pdf", state: PDF_STATE.READY }]);
  });

  it("a new scan replaces the list", async () => {
    rememberCopying(new Map([["G_old.pdf", "p/old"]]));
    rememberCopying(new Map([["G_new.pdf", "p/new"]]));
    const asked = [];
    await recheckCopying({ check: async (p) => (asked.push(p), { state: PDF_STATE.COPYING }) });
    expect(asked).toEqual(["p/new"]);
  });

  it("with nothing copying it reads nothing", async () => {
    rememberCopying(new Map());
    const res = await recheckCopying({ check: async () => { throw new Error("must not be called"); } });
    expect(res).toEqual({ success: true, updates: [] });
  });
});
