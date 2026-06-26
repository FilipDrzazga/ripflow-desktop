import path from "path";
import { XMLParser } from "fast-xml-parser";

// PrintFactory drops a <name>.xml per failed job into WORKFLOW_ERROR/. Structure (verified
// against real exports):
//   parsed.Job                                  ← true root: JobGUID, Created, WFState, Name,
//                                                  Journal, and (Shape A only) a job-level
//                                                  <Documents> listing the single failed file
//   parsed.Job.ProcessNodes.XML.RipFlowJob      ← batch context: BatchId, NestingGroup,
//                                                  <Documents> with ALL batch documents
// Two shapes:
//   Shape A (post-split, common): a job-level <Documents> is present → exactly ONE failed
//     file = stem of the job-level <Name>.
//   Shape B (pre-split, rarer): no job-level <Documents> → every document under
//     RipFlowJob.Documents is affected → one row each.
// XWD/documentId is taken from the filename (UserData.DocumentId is unreliable across
// exports). This parser returns an ARRAY of error rows; it never throws (malformed/odd xml
// → [] logged, missing fields → null).

const ATTR_PREFIX = "@_";

// ignoreAttributes:false keeps @_-prefixed attributes; processEntities (default true)
// decodes &amp; etc. so error messages come through clean.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
});

// Read an attribute value off a parsed node (returns undefined if absent).
const attr = (node, name) =>
  node && typeof node === "object" ? node[`${ATTR_PREFIX}${name}`] : undefined;

// Element text: scalar → string; element-with-attrs object → its "#text"; else null.
const textOf = (value) => {
  if (value == null) return null;
  if (typeof value === "object") {
    return value["#text"] != null ? String(value["#text"]) : null;
  }
  return String(value);
};

// First occurrence (by key) of an element value anywhere in the tree.
const findFirst = (obj, key) => {
  if (!obj || typeof obj !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  for (const value of Object.values(obj)) {
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (child && typeof child === "object") {
        const found = findFirst(child, key);
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
};

// True if any node in the tree carries WorkflowResult="Fail".
const anyFail = (obj) => {
  if (!obj || typeof obj !== "object") return false;
  if (obj[`${ATTR_PREFIX}WorkflowResult`] === "Fail") return true;
  for (const value of Object.values(obj)) {
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (child && typeof child === "object" && anyFail(child)) return true;
    }
  }
  return false;
};

// Normalize a <Documents> container into an array of <Document> entries.
const docList = (documentsNode) => {
  if (!documentsNode || typeof documentsNode !== "object") return [];
  const d = documentsNode.Document;
  if (d == null) return [];
  return Array.isArray(d) ? d : [d];
};

// A <Document> may carry its name as an attribute (Document Name="…") or a child <Name>.
const docName = (doc) => attr(doc, "Name") ?? textOf(doc?.Name);
const docDocId = (doc) => attr(doc, "DocumentId") ?? textOf(doc?.DocumentId);

// file_id = pdf filename with the trailing extension stripped (matches file_stages.file_id).
const stemOf = (name) => {
  if (name == null) return null;
  const stem = path.parse(String(name)).name;
  return stem || null;
};

// XWD token embedded in the filename — the reliable documentId source (UserData.DocumentId
// is absent in real exports). Returns null when the name carries no XWD token.
const xwdFromName = (name) => {
  if (name == null) return null;
  const m = String(name).match(/XWD[0-9a-f]+/i);
  return m ? m[0] : null;
};

// The first Journal entry (Workflow/Creation/Connector/…) whose Error= attribute is set.
const findJournalErrorEntry = (journal) => {
  if (!journal || typeof journal !== "object") return null;
  for (const value of Object.values(journal)) {
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      if (entry && typeof entry === "object" && attr(entry, "Error") != null) return entry;
    }
  }
  return null;
};

export const parseRipErrorXml = (xmlString) => {
  try {
    if (typeof xmlString !== "string" || xmlString.trim() === "") return [];

    const parsed = parser.parse(xmlString);

    // Anchor on the real <Job> root. Defensive fallbacks if the root key ever differs.
    const job = parsed?.Job ?? parsed;

    // Detection: an error xml has a Fail node OR a Job WFState with an Error attribute.
    const wfState = job.WFState ?? findFirst(parsed, "WFState");
    const wfStateError = attr(wfState, "Error");
    if (!anyFail(parsed) && wfStateError == null) return [];

    // RipFlowJob lives at Job.ProcessNodes.XML.RipFlowJob; resolve it by key to stay robust
    // to the exact nesting / a single-vs-array wrapper.
    const ripFlowJobRaw = findFirst(job, "RipFlowJob");
    const ripFlowJob = Array.isArray(ripFlowJobRaw) ? ripFlowJobRaw[0] : ripFlowJobRaw;

    // Message: prefer WFState@Error, fall back to the Journal entry that carries Error=.
    const journal = job.Journal ?? findFirst(parsed, "Journal");
    const journalErrorEntry = findJournalErrorEntry(journal);
    const errorMessage =
      wfStateError != null
        ? String(wfStateError)
        : (attr(journalErrorEntry, "Error") != null ? String(attr(journalErrorEntry, "Error")) : null);

    // failedNode = the Process of the journal entry that failed (Shape B → "Hotfolder").
    const failedNode = attr(journalErrorEntry, "Process") != null ? String(attr(journalErrorEntry, "Process")) : null;

    const jobGuid = textOf(job.JobGUID ?? findFirst(parsed, "JobGUID"));
    const batchId = textOf(ripFlowJob?.BatchId ?? findFirst(parsed, "BatchId"));
    const nestingGroup = textOf(ripFlowJob?.NestingGroup ?? findFirst(parsed, "NestingGroup"));
    const createdAt = textOf(job.Created ?? findFirst(parsed, "Created"));

    const base = { jobGuid, batchId, nestingGroup, failedNode, errorMessage, createdAt };
    const rows = [];

    // Shape discriminator: a JOB-LEVEL <Documents> (direct child of <Job>, distinct from the
    // RipFlowJob one) means post-split → exactly one failed file = stem of the job-level
    // <Name>. Otherwise pre-split → one row per document under RipFlowJob.Documents.
    if (job.Documents) {
      const name = textOf(job.Name) ?? docName(docList(job.Documents)[0]);
      rows.push({ ...base, fileId: stemOf(name), documentId: xwdFromName(name) });
    } else {
      for (const doc of docList(ripFlowJob?.Documents)) {
        const name = docName(doc);
        rows.push({ ...base, fileId: stemOf(name), documentId: xwdFromName(name) ?? docDocId(doc) ?? null });
      }
    }

    // A row without a resolvable file_id can't be mapped to a file_stages row — drop it.
    return rows.filter((r) => r.fileId);
  } catch (err) {
    console.error("[parseRipErrorXml] failed to parse error xml:", err);
    return [];
  }
};
