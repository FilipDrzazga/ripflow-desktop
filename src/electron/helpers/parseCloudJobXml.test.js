import { describe, it, expect } from "vitest";
import { parseCloudJobXml } from "./parseCloudJobXml.js";

// Fixtures follow the structure of real Cloud job XML (names, GUIDs and the ink data removed):
// Statistics.Summary.Height in 1/18 inch, Journal.Print entries, PageCopies.Page@Done.
const job = ({ height = 2480.399902, prints = [], pageCopies = null, summary = true } = {}) => `<?xml version="1.0"?>
<Job Version="3"><JobGUID>11111111-1111-1111-1111-111111111111</JobGUID>
<Statistics>${summary ? `<Summary Number="0"><Height>${height}</Height><Width>1063.07</Width><Count>14</Count></Summary>` : ""}<Page Number="1"><Height>${height}</Height></Page></Statistics>
<Journal><Creation Process="Automation" Date="2026-10-16T09:51:01.1331279Z" />${prints.join("")}</Journal>
${pageCopies === null ? "" : `<PageCopies>${pageCopies}</PageCopies>`}</Job>`;

const print = (date, { message, error, copies } = {}) =>
  `<Print Process="Spooler" Date="${date}"${error ? ` Error="${error}"` : ""}>${copies ? `<Copies>${copies}</Copies>` : ""}${message ? `<Message>${message}</Message>` : ""}</Print>`;

// 2480.399902 units / 18 * 0.0254 = 3.5 m
const THREE_AND_A_HALF = (2480.399902 / 18) * 0.0254;

describe("parseCloudJobXml", () => {
  it("reads the metres of one print and its date as UTC (the journal date has no zone)", () => {
    const out = parseCloudJobXml(job({ prints: [print("2026-10-16T09:58:44", { message: "Completed" })], pageCopies: '<Page Requested="1" Done="1" />' }));
    expect(out.metresPerPrint).toBeCloseTo(THREE_AND_A_HALF, 6);
    expect(out.prints).toEqual([{ printedAt: "2026-10-16T09:58:44.000Z", copies: 1 }]);
  });

  it("YUMI / YOKO write no message at all: still a print", () => {
    const out = parseCloudJobXml(job({ prints: [print("2026-10-15T10:18:41")], pageCopies: '<Page Requested="1" Done="1" />' }));
    expect(out.prints).toHaveLength(1);
  });

  it("a failed attempt (Error attribute) is not a print, even next to a good one", () => {
    const out = parseCloudJobXml(job({
      prints: [print("2026-10-14T09:36:50", { error: "Communication with the printer failed" }), print("2026-10-15T10:18:41")],
      pageCopies: '<Page Requested="1" Done="1" />',
    }));
    expect(out.prints).toEqual([{ printedAt: "2026-10-15T10:18:41.000Z", copies: 1 }]);
  });

  it("a message that says it failed is not a print", () => {
    const out = parseCloudJobXml(job({ prints: [print("2026-10-15T10:18:41", { message: "Print failed" })] }));
    expect(out.prints).toEqual([]);
  });

  it("only the Done count of copies is counted: two valid entries but Done=1 is one print, the last one", () => {
    // a 49 m job whose first entry says Completed after 16 minutes (connection dropped), then the real run
    const out = parseCloudJobXml(job({
      prints: [print("2026-10-15T12:22:46", { message: "Completed" }), print("2026-10-15T14:23:51", { message: "Completed" })],
      pageCopies: '<Page Requested="1" Done="1" Send="true" />',
    }));
    expect(out.prints).toEqual([{ printedAt: "2026-10-15T14:23:51.000Z", copies: 1 }]);
  });

  it("a job printed twice (Done=2, two entries) is two copies, each on its own date", () => {
    const out = parseCloudJobXml(job({
      prints: [print("2026-10-15T23:58:00"), print("2026-10-16T00:03:00")],
      pageCopies: '<Page Requested="2" Done="2" />',
    }));
    expect(out.prints).toEqual([
      { printedAt: "2026-10-15T23:58:00.000Z", copies: 1 },
      { printedAt: "2026-10-16T00:03:00.000Z", copies: 1 },
    ]);
  });

  it("an entry that made several copies at once counts them all", () => {
    const out = parseCloudJobXml(job({ prints: [print("2026-10-16T08:00:00", { copies: 3 })], pageCopies: '<Page Requested="3" Done="3" />' }));
    expect(out.prints).toEqual([{ printedAt: "2026-10-16T08:00:00.000Z", copies: 3 }]);
  });

  it("no PageCopies at all: the valid entries are the count", () => {
    const out = parseCloudJobXml(job({ prints: [print("2026-10-16T08:00:00"), print("2026-10-16T09:00:00")] }));
    expect(out.prints.map((p) => p.copies)).toEqual([1, 1]);
  });

  it("Done=0 (requested, never printed) is no print", () => {
    const out = parseCloudJobXml(job({ prints: [print("2026-10-16T08:00:00")], pageCopies: '<Page Requested="1" Done="0" />' }));
    expect(out.prints).toEqual([]);
    expect(out.metresPerPrint).toBeCloseTo(THREE_AND_A_HALF, 6);
  });

  it("a job that never printed has metres per print but no prints", () => {
    const out = parseCloudJobXml(job());
    expect(out.prints).toEqual([]);
    expect(out.metresPerPrint).toBeCloseTo(THREE_AND_A_HALF, 6);
  });

  it("without a Summary the page heights are added", () => {
    const out = parseCloudJobXml(job({ summary: false, prints: [print("2026-10-16T08:00:00")] }));
    expect(out.metresPerPrint).toBeCloseTo(THREE_AND_A_HALF, 6);
  });

  it("never throws: malformed, empty and non-job input answer nothing", () => {
    for (const bad of ["", "not xml", "<Job>", "<Other/>", null, undefined]) {
      expect(parseCloudJobXml(bad)).toEqual({ metresPerPrint: null, prints: [] });
    }
  });
});
