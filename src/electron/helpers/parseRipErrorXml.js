import path from "path";
import { XMLParser } from "fast-xml-parser";

// PrintFactory drops a <name>.xml per failed job into WORKFLOW_ERROR/. Two shapes exist
// (see CONTEXT): Shape A = post-split, one failed document → one row from the top-level
// <Name>; Shape B = pre-split, whole batch → one row per <Document> under <RipFlowJob>.
// This parser turns one xml string into an ARRAY of error rows. It never throws: malformed
// xml or odd structure → [] (logged), missing fields → null.

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

// The object that directly contains `key` (i.e. the parent of that element).
const findNodeWithKey = (obj, key) => {
  if (!obj || typeof obj !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj;
  for (const value of Object.values(obj)) {
    const children = Array.isArray(value) ? value : [value];
    for (const child of children) {
      if (child && typeof child === "object") {
        const found = findNodeWithKey(child, key);
        if (found) return found;
      }
    }
  }
  return null;
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

    // Detection: an error xml has a Fail node OR a WFState with an Error attribute.
    const wfState = findFirst(parsed, "WFState");
    const wfStateError = attr(wfState, "Error");
    if (!anyFail(parsed) && wfStateError == null) return [];

    // Job root = the object holding <RipFlowJob>; the top-level Name/Documents/UserData/
    // WFState/JobGUID/Created live as its siblings. Fall back to the parsed root.
    const jobNode = findNodeWithKey(parsed, "RipFlowJob") ?? parsed;
    const ripFlowJobRaw = jobNode.RipFlowJob;
    const ripFlowJob = Array.isArray(ripFlowJobRaw) ? ripFlowJobRaw[0] : ripFlowJobRaw;

    // Message: prefer WFState@Error, fall back to the Journal entry that carries Error=.
    const journal = jobNode.Journal ?? findFirst(parsed, "Journal");
    const journalErrorEntry = findJournalErrorEntry(journal);
    const errorMessage =
      wfStateError != null
        ? String(wfStateError)
        : (attr(journalErrorEntry, "Error") != null ? String(attr(journalErrorEntry, "Error")) : null);

    // failedNode = the Process of the journal entry that failed (Shape B → "Hotfolder").
    const failedNode = attr(journalErrorEntry, "Process") != null ? String(attr(journalErrorEntry, "Process")) : null;

    const jobGuid = textOf(jobNode.JobGUID ?? findFirst(parsed, "JobGUID"));
    const batchId = textOf(ripFlowJob?.BatchId ?? findFirst(parsed, "BatchId"));
    const nestingGroup = textOf(ripFlowJob?.NestingGroup ?? findFirst(parsed, "NestingGroup"));
    const createdAt = textOf(jobNode.Created ?? findFirst(parsed, "Created"));

    const base = { jobGuid, batchId, nestingGroup, failedNode, errorMessage, createdAt };
    const rows = [];

    // Shape A vs B: a job-level <Documents> (sibling of RipFlowJob) means post-split →
    // a single row from the top-level <Name>. Otherwise pre-split → one row per document
    // listed under <RipFlowJob><Documents>.
    if (jobNode.Documents) {
      const firstDoc = docList(jobNode.Documents)[0];
      const name = textOf(jobNode.Name) ?? docName(firstDoc);
      const documentId = textOf(jobNode.UserData?.DocumentId) ?? docDocId(firstDoc);
      rows.push({ ...base, fileId: stemOf(name), documentId: documentId ?? null });
    } else {
      for (const doc of docList(ripFlowJob?.Documents)) {
        rows.push({ ...base, fileId: stemOf(docName(doc)), documentId: docDocId(doc) ?? null });
      }
    }

    // A row without a resolvable file_id can't be mapped to a file_stages row — drop it.
    return rows.filter((r) => r.fileId);
  } catch (err) {
    console.error("[parseRipErrorXml] failed to parse error xml:", err);
    return [];
  }
};
