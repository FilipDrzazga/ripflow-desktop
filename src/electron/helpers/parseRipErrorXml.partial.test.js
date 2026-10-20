import { describe, it, expect } from "vitest";
import { parseRipErrorXml } from "./parseRipErrorXml.js";
import { RIP_ERROR_SCOPE } from "../../shared/constants.js";

// D34 (debt repayment 2026-10-20): a job-level <Documents> that lists SEVERAL documents, but only a part of the batch.
// The shape has not been seen live; the fixture follows the element structure of parseRipErrorXml.test.js.
const pdf = (n) => `ON9000${n}_Test_Customer_1of1_Organic Poplin_1x_Linear Meter - 1m increments_XWD000${n}abc_FF.pdf`;
const stem = (n) => pdf(n).replace(/\.pdf$/, "");

const xml = ({ batch, job }) => `<?xml version="1.0" encoding="utf-8" ?>
<Job Version="3">
  <JobGUID>job-guid-2</JobGUID>
  <Created>2026-10-20T08:16:10</Created>
  <ProcessNodes>
    <XML Name="AUTOMATION_WORKFLOW_COTTON" WorkflowResult="Fail">
      <RipFlowJob>
        <BatchId>20-10-2026/PRINTED_081610-Organic Poplin-DGEN</BatchId>
        <Documents>${batch.map((n) => `<Document><Name>${n}</Name></Document>`).join("")}</Documents>
      </RipFlowJob>
    </XML>
  </ProcessNodes>
  <WFState Error="Nester failed">Running</WFState>
  <Name>some-job</Name>
  <Documents>${job.map((n) => `<Document GUID="g" Name="${n}" />`).join("")}</Documents>
  <Journal><Workflow Process="Nester" Date="d" Error="Nester failed" /></Journal>
</Job>`;

describe("parseRipErrorXml - several job-level documents, but not all of the batch (D34)", () => {
  it("two of four -> one FILE row for each of those two, none for the other two", () => {
    const rows = parseRipErrorXml(xml({ batch: [pdf(1), pdf(2), pdf(3), pdf(4)], job: [pdf(2), pdf(4)] }));
    expect(rows.map((r) => r.fileId)).toEqual([stem(2), stem(4)]);
    expect(rows.every((r) => r.scope === RIP_ERROR_SCOPE.FILE)).toBe(true);
    expect(rows[0]).toMatchObject({ jobGuid: "job-guid-2", failedNode: "Nester", documentId: "XWD0002abc" });
  });

  it("the file name with .pdf in the job-level list gives the same stem as the batch list", () => {
    const rows = parseRipErrorXml(xml({ batch: [pdf(1), pdf(2), pdf(3)], job: [pdf(1), pdf(3)] }));
    expect(rows.map((r) => r.fileId)).toEqual([stem(1), stem(3)]);
  });

  it("the same documents as the batch -> still the whole batch (BATCH rows, one per file)", () => {
    const rows = parseRipErrorXml(xml({ batch: [pdf(1), pdf(2), pdf(3)], job: [pdf(3), pdf(1), pdf(2)] }));
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.scope === RIP_ERROR_SCOPE.BATCH)).toBe(true);
  });

  it("a job-level name the batch does not know -> the old reading: BATCH rows for the batch's own files", () => {
    const rows = parseRipErrorXml(xml({ batch: [pdf(1), pdf(2), pdf(3), pdf(4)], job: [pdf(2), "ON9999_unknown_FF.pdf"] }));
    expect(rows.map((r) => r.fileId)).toEqual([stem(1), stem(2), stem(3), stem(4)]);
    expect(rows.every((r) => r.scope === RIP_ERROR_SCOPE.BATCH)).toBe(true);
  });

  it("one job-level document is still the FILE case of the split, not this one", () => {
    const rows = parseRipErrorXml(xml({ batch: [pdf(1), pdf(2), pdf(3)], job: [pdf(2)] }));
    expect(rows.map((r) => [r.fileId, r.scope])).toEqual([[stem(2), RIP_ERROR_SCOPE.FILE]]);
  });
});
