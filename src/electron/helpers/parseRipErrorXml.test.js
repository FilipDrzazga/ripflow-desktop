import { describe, it, expect, vi } from "vitest";
import { parseRipErrorXml } from "./parseRipErrorXml.js";
import { RIP_ERROR_SCOPE } from "../../shared/constants.js";

// The fixtures follow the element structure of two real PrintFactory exports from the shop's
// AUTOMATION_WORKFLOW_ERROR folder (2026-10-14), names replaced:
//   - "Layout does not fit on any mediasize" (15-09): failed AFTER the Split node - the job-level
//     <Documents> lists ONE document and the job <Name> is that pdf.
//   - "Conversion to Aur failed" (30-09): failed at the Hotfolder, BEFORE the split - the
//     job-level <Documents> lists ALL 14 documents and the job <Name> is the batch's XML name.
//     The old parser made that name the one file_id, so the error reached no file.
const BATCH_NAME = "30-09-2026_PRINTED_090007-Organic_Poplin-DGEN";
const pdf = (n) => `ON9000${n}_Test_Customer_1of1_Organic Poplin_1x_Linear Meter - 1m increments_XWD000${n}abc_FF.pdf`;
const stem = (n) => pdf(n).replace(/\.pdf$/, "");

const ripFlowDoc = (name) => `<Document><Name>${name}</Name><DocumentId>XWDunused</DocumentId></Document>`;
const jobDoc = (name) =>
  `<Document GUID="g-${name.length}" Name="${name}"><UserData><DocumentId>XWDunused</DocumentId></UserData></Document>`;

const errorXml = ({ ripFlowDocs, jobDocs, jobName, error, journal }) => `<?xml version="1.0" encoding="utf-8" ?>
<Job Version="3">
  <JobGUID>job-guid-1</JobGUID>
  <Created>2026-09-30T08:16:10</Created>
  <ProcessNodes WorkflowID="w" WorkflowName="wf">
    <XML ID="x" Name="AUTOMATION_WORKFLOW_COTTON" WorkflowResult="Fail">
      <RipFlowJob>
        <BatchId>30-09-2026/PRINTED_090007-Organic Poplin-DGEN</BatchId>
        <NestingGroup>nest-1</NestingGroup>
        ${ripFlowDocs == null ? "" : `<Documents>${ripFlowDocs.map(ripFlowDoc).join("")}</Documents>`}
      </RipFlowJob>
    </XML>
  </ProcessNodes>
  <WFState Time="2026-09-30T08:20:21" Modified="false" Error="${error}">Running</WFState>
  <Name>${jobName}</Name>
  ${jobDocs == null ? "" : `<Documents>${jobDocs.map(jobDoc).join("")}</Documents>`}
  <Journal>${journal}</Journal>
</Job>`;

const HOTFOLDER_FAIL = `<Creation Process="Hotfolder" Date="2026-09-30T08:16:10" Error="Conversion to Aur failed" />`;
const LAYOUT_FAIL =
  `<Creation Process="Hotfolder" Date="d" /><Workflow Process="Split" Date="d" />` +
  `<Workflow Process="Layout: 1420MM" Date="d" Error="Layout does not fit on any mediasize" />`;

describe("parseRipErrorXml - one failed file (after the split)", () => {
  it("one job-level document -> one FILE row for that pdf", () => {
    const rows = parseRipErrorXml(
      errorXml({
        ripFlowDocs: [pdf(1), pdf(2)],
        jobDocs: [pdf(1)],
        jobName: pdf(1),
        error: "Layout does not fit on any mediasize",
        journal: LAYOUT_FAIL,
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      scope: RIP_ERROR_SCOPE.FILE,
      fileId: stem(1),
      jobGuid: "job-guid-1",
      batchId: "30-09-2026/PRINTED_090007-Organic Poplin-DGEN",
      failedNode: "Layout: 1420MM",
      errorMessage: "Layout does not fit on any mediasize",
      documentId: "XWD0001abc",
    });
  });

  it("one document but the job named after the batch (a one-file batch failing early) -> the pdf, not the batch name", () => {
    const rows = parseRipErrorXml(
      errorXml({ ripFlowDocs: [pdf(1)], jobDocs: [pdf(1)], jobName: BATCH_NAME, error: "Conversion to Aur failed", journal: HOTFOLDER_FAIL }),
    );
    expect(rows.map((r) => r.fileId)).toEqual([stem(1)]);
  });
});

describe("parseRipErrorXml - the whole batch failed (before the split)", () => {
  it("several job-level documents -> one BATCH row per file of the batch, none named after the batch", () => {
    const rows = parseRipErrorXml(
      errorXml({
        ripFlowDocs: [pdf(1), pdf(2), pdf(3)],
        jobDocs: [pdf(3), pdf(1), pdf(2)],
        jobName: BATCH_NAME,
        error: "Conversion to Aur failed",
        journal: HOTFOLDER_FAIL,
      }),
    );
    expect(rows.map((r) => r.fileId)).toEqual([stem(1), stem(2), stem(3)]);
    expect(rows.every((r) => r.scope === RIP_ERROR_SCOPE.BATCH)).toBe(true);
    expect(rows.every((r) => r.jobGuid === "job-guid-1" && r.failedNode === "Hotfolder")).toBe(true);
    expect(rows.map((r) => r.fileId)).not.toContain(BATCH_NAME);
    expect(rows.map((r) => r.documentId)).toEqual(["XWD0001abc", "XWD0002abc", "XWD0003abc"]);
  });

  it("no job-level documents at all (input not found) -> BATCH rows from RipFlow's own list", () => {
    const rows = parseRipErrorXml(
      errorXml({
        ripFlowDocs: [pdf(1), pdf(2)],
        jobDocs: null,
        jobName: BATCH_NAME,
        error: "File not found or not accesible",
        journal: `<Creation Process="Hotfolder" Date="d" Error="File not found or not accesible" />`,
      }),
    );
    expect(rows.map((r) => [r.fileId, r.scope])).toEqual([
      [stem(1), RIP_ERROR_SCOPE.BATCH],
      [stem(2), RIP_ERROR_SCOPE.BATCH],
    ]);
  });

  it("RipFlow's list missing -> the job-level documents name the files", () => {
    const rows = parseRipErrorXml(
      errorXml({ ripFlowDocs: null, jobDocs: [pdf(1), pdf(2)], jobName: BATCH_NAME, error: "Conversion to Aur failed", journal: HOTFOLDER_FAIL }),
    );
    expect(rows.map((r) => r.fileId)).toEqual([stem(1), stem(2)]);
    expect(rows.every((r) => r.scope === RIP_ERROR_SCOPE.BATCH)).toBe(true);
  });
});

describe("parseRipErrorXml - not an error", () => {
  it("a job without a Fail node or a WFState error -> no rows", () => {
    const ok = errorXml({ ripFlowDocs: [pdf(1)], jobDocs: [pdf(1)], jobName: pdf(1), error: "", journal: "" })
      .replace('WorkflowResult="Fail"', 'WorkflowResult="OK"')
      .replace(' Error=""', "");
    expect(parseRipErrorXml(ok)).toEqual([]);
  });

  it("garbage -> no rows, no throw", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(parseRipErrorXml("<Job><unclosed")).toEqual([]);
    expect(parseRipErrorXml("")).toEqual([]);
  });
});
