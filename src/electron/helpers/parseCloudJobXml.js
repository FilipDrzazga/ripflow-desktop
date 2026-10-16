import { XMLParser } from "fast-xml-parser";

// What the metres tile needs from a PrintFactory Cloud Job XML (GET /api/v2/job/{guid}, schema
// https://printfactory.cloud/schema/2.0/PrintFactoryJob.xsd), verified against real jobs:
//   Job.Statistics.Summary.Height  - height of ONE print of the job's content, in PrintFactory
//                                    units (1/18 inch)
//   Job.Journal.Print              - one entry per attempt to print: @Date is when the spooler
//                                    finished it (UTC, written WITHOUT a zone designator,
//                                    "2026-10-16T09:58:44"); a failed attempt carries @Error.
//   Job.PageCopies.Page@Done       - how many copies came out (a 1 m job printed twice: Done=2,
//                                    two Print entries two minutes apart)
// The metres are the height of the CONTENT (no gaps between jobs), so they sit a few percent
// above the length written in a job name ("Drill_17.85m" printed 16.15 m of content).
// Never throws: anything unreadable answers { metresPerPrint: null, prints: [] }.

const PF_UNITS_PER_INCH = 18;
const METRES_PER_INCH = 0.0254;

// A Print entry with an Error attribute ("Communication with the printer failed") or a message
// that says it failed did not print. No message at all counts as a print: YUMI / YOKO write
// none, and they printed.
const FAILED_PRINT = /fail|cancel|error|abort/i;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) => name === "Print" || name === "Page" || name === "Summary",
});

const toArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

// A journal date has no zone designator and is UTC; one that carries a designator is kept as is.
const toIsoUtc = (value) => {
  if (typeof value !== "string" || value.trim() === "") return null;
  const text = value.trim();
  const iso = /(Z|[+-]\d\d:\d\d)$/.test(text) ? text : `${text}Z`;
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
};

export const parseCloudJobXml = (xml) => {
  const empty = { metresPerPrint: null, prints: [] };
  try {
    const job = parser.parse(xml)?.Job;
    if (!job) return empty;

    const summary = toArray(job.Statistics?.Summary)[0];
    let height = toNumber(summary?.Height);
    if (height === null) {
      // No summary: the job's own pages, one entry per page.
      const pages = toArray(job.Statistics?.Page).map((p) => toNumber(p?.Height)).filter((h) => h !== null);
      height = pages.length > 0 ? pages.reduce((a, b) => a + b, 0) : null;
    }
    const metresPerPrint = height !== null && height >= 0 ? (height / PF_UNITS_PER_INCH) * METRES_PER_INCH : null;

    const entries = [];
    for (const entry of toArray(job.Journal?.Print)) {
      const printedAt = toIsoUtc(entry?.["@_Date"]);
      if (printedAt === null) continue;
      if (entry["@_Error"] || (typeof entry.Message === "string" && FAILED_PRINT.test(entry.Message))) continue;
      // At least one copy: an entry without a <Copies> count still printed once.
      entries.push({ printedAt, copies: Math.max(1, Math.floor(toNumber(entry.Copies) ?? 1)) });
    }

    // How many copies really came out is PageCopies.Page@Done (seen live: a 49 m job whose
    // first Print entry says Completed after 16 minutes - the connection dropped - and whose
    // second one is the real run; Done=1). Entries only tell WHEN. Without any Done attribute
    // (no PageCopies at all) the entries themselves are the count; a Done of 0 is a job that
    // never printed.
    const doneAttrs = toArray(job.PageCopies?.Page).map((p) => toNumber(p?.["@_Done"])).filter((n) => n !== null);
    let remaining = doneAttrs.length > 0 ? doneAttrs.reduce((a, b) => a + b, 0) : entries.reduce((a, e) => a + e.copies, 0);

    // The last entries are the ones that count.
    const prints = [];
    for (let i = entries.length - 1; i >= 0 && remaining > 0; i--) {
      const copies = Math.min(entries[i].copies, remaining);
      prints.unshift({ printedAt: entries[i].printedAt, copies });
      remaining -= copies;
    }

    return { metresPerPrint, prints };
  } catch {
    return empty;
  }
};
