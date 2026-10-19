// "Where is order X?" - the pure core of the Ctrl+F search window (plan C3).
//
// Input: the query plus a SNAPSHOT of what the store already holds - the Inbox scan (`files`),
// the Held set (`heldIds` / `heldReasons`) and the Production board (`productionStages`,
// `stageHistory`). Output: order groups, one row per FILE saying where that file is NOW.
// No IPC, no disk, no clock: the window re-runs this on every keystroke and every store change.
//
// What it does NOT cover, on purpose (plan C3): the PRINTED folders (an SMB read), Custom Orders,
// and Shipped rows older than the retention (cleanupShippedStages purged them). Every file that
// was ever submitted has a file_stages row (submitBatch), so the Production rows already span
// Printed..Shipped; an order older than that is an empty result, and the window says so.
//
// One file = one row. file_stages is keyed by the filename stem (rollback deletes the row when
// the PDF returns to the Inbox), so a stem seen in BOTH places is a fresh copy waiting in the
// Inbox while an older one still sits in Production. When the query matches both, the Inbox row
// wins - it is the one the operator can act on - and keeps the stage of the other copy in
// `alsoInProduction`; when it matches only the Production row, that row is shown.

import { printerOfBatch } from "../../shared/batchFolderName";
import { APP_VIEW } from "../constants/appViews";
import { dayKeyFromBatchPath } from "./dayKey";
import { ORDER_STAGE_PIPELINE, UNKNOWN_ORDER_KEY, UNKNOWN_ORDER_LABEL } from "./groupByOrder";

// Where a file is now: the two pre-print places, or a PRODUCTION_STAGE value verbatim.
export const ORDER_SEARCH_WHERE = {
  INBOX: "inbox",
  HELD: "held",
};

// The view ids App.jsx switches on (`activeView`), taken from the one constant App.jsx itself uses. The
// target of a row is a VIEW plus the file; utils/searchTarget.js turns it into the actual navigation.
export const ORDER_SEARCH_VIEW = {
  PRINT: APP_VIEW.PRINT,
  PRODUCTION: APP_VIEW.PRODUCTION,
};

// Below this many characters (after trim) nothing is searched: one letter would match half the
// shop. "ON" alone is also too short to mean anything.
export const MIN_QUERY_LENGTH = 3;

// Rows shown at most; the rest is reported as hiddenRows ("N more").
export const MAX_RESULT_ROWS = 50;

// Sort position of a row inside its order: Inbox, Held, then the pipeline order. A stage the
// pipeline does not list (rejected / overridden - legacy rows) sorts after everything.
const WHERE_RANK = new Map([
  [ORDER_SEARCH_WHERE.INBOX, 0],
  [ORDER_SEARCH_WHERE.HELD, 1],
  ...ORDER_STAGE_PIPELINE.map((stage, i) => [stage, i + 2]),
]);
const whereRank = (where) => WHERE_RANK.get(where) ?? WHERE_RANK.size;

const text = (v) => (typeof v === "string" ? v.trim() : "");
const stemOf = (name) => text(name).replace(/\.[^./\\]+$/, "");

// The order id as the groups key it: trimmed, upper-case ("on401365" and "ON401365" are one
// order). null when the file carries none.
const orderKeyOf = (orderId) => {
  const id = text(orderId).toUpperCase();
  return id === "" ? null : id;
};

// ISO strings compare lexicographically, but createdAt may arrive as a Date (tests, a direct
// call) or as the string the IPC serialised - normalise both to an ISO string, or null.
const isoOf = (v) => {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const s = text(v);
  return s === "" || Number.isNaN(Date.parse(s)) ? null : s;
};

// When the file ENTERED its current stage: the newest history entry for that stage (a file
// that was rolled back and re-run has several), else the row's updated_at.
const stageSince = (row, history) => {
  let latest = null;
  for (const entry of history ?? []) {
    if (entry?.stage !== row.stage) continue;
    const at = isoOf(entry.entered_at);
    if (at && (!latest || at > latest)) latest = at;
  }
  return latest ?? isoOf(row.updated_at);
};

// store.files is the readFolders answer: a list of GROUPS (one per fabric folder), each with its `items`.
// A flat list of items is accepted too (the first tests, a direct call) - an element without `items` is
// an item itself.
const inboxItemsOf = (files) =>
  (Array.isArray(files) ? files : []).flatMap((entry) => (Array.isArray(entry?.items) ? entry.items : [entry]));

const tokensOf = (query) => text(query).toLowerCase().split(/\s+/).filter(Boolean);

// Every token must appear somewhere in order id + customer + file name (so "ruby 401365" works
// across the fields; the file name already carries both, the explicit fields cover rows whose
// name was cut or whose customer the parser left empty).
const matches = (tokens, ...fields) => {
  const hay = fields.map(text).join(" ").toLowerCase();
  return tokens.every((t) => hay.includes(t));
};

// The name as the window SHOWS it: without the artwork-id tail ("_XWD<hex>_FF.pdf" of the XWD-based files, FILIP
// 2026-10-19 12:04) - the operator reads the order, customer and product part, and the tail only made the line too
// long. Display only: matching, sorting and the row's title keep the full `fileName`, so the id still finds the row.
// A name without an XWD token, or one that starts with it, is returned whole.
const XWD_TAIL = /[\s_-]*XWD[0-9a-f]+.*$/i;

export const displayFileName = (name) => text(name).replace(XWD_TAIL, "") || text(name);

const inboxRow =({ item, held, heldReason, production }) => {
  const name = text(item.file?.name);
  return {
    fileId: item.id,
    fileName: name,
    // An item the parser gave no orderId (an invalid file) still shows under the ON number in its name,
    // like the order column of the Inbox list does.
    orderKey: orderKeyOf(text(item.orderId) || name.match(/ON\d+/i)?.[0]),
    customerName: text(item.customerName) || null,
    where: held ? ORDER_SEARCH_WHERE.HELD : ORDER_SEARCH_WHERE.INBOX,
    since: isoOf(item.createdAt),
    reason: held ? heldReason || null : null,
    batchPath: null,
    batch: null,
    printer: null,
    dayKey: null,
    alsoInProduction: production?.stage ?? null,
    target: { view: ORDER_SEARCH_VIEW.PRINT, fileId: item.id, dayKey: null },
  };
};

const stageRow = ({ row, history }) => {
  const batchPath = text(row.batch_path) || null;
  const dayKey = dayKeyFromBatchPath(batchPath);
  return {
    fileId: row.file_id,
    fileName: `${row.file_id}.pdf`,
    orderKey: orderKeyOf(row.order_id),
    customerName: text(row.customer_name) || null,
    where: row.stage,
    since: stageSince(row, history),
    reason: null,
    batchPath,
    batch: batchPath ? batchPath.split(/[/\\]/).filter(Boolean).pop() : null,
    printer: printerOfBatch(batchPath),
    dayKey,
    alsoInProduction: null,
    target: { view: ORDER_SEARCH_VIEW.PRODUCTION, fileId: row.file_id, dayKey },
  };
};

// Newest first; a row without a time sorts after the dated ones.
const byNewest = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

/**
 * @param {string} query
 * @param {{ files?: object[] (store.files: groups with `items`; a flat item list also works), heldIds?: Set<string>, heldReasons?: Map<string,string>,
 *           productionStages?: Record<string, object>, stageHistory?: Record<string, object[]> }} snapshot
 *   the store slices of the same names; every one is optional (a slice not loaded yet is empty).
 * @returns {{ status: "short" | "ok", query: string, groups: object[], totalRows: number,
 *             shownRows: number, hiddenRows: number }}
 *   groups: [{ orderKey, orderId, customerName, isUnknown, rows }] - exact order id first, then
 *   the order with the most recent file, the unknown-order bucket last. Rows: see inboxRow /
 *   stageRow (`where`, `since`, `batch`, `printer`, `dayKey`, `target`, ...).
 */
export const searchOrders = (query, snapshot = {}) => {
  const q = text(query);
  const empty = (status) => ({ status, query: q, groups: [], totalRows: 0, shownRows: 0, hiddenRows: 0 });
  if (q.length < MIN_QUERY_LENGTH) return empty("short");

  const { files, heldIds, heldReasons, productionStages, stageHistory } = snapshot;
  const tokens = tokensOf(q);
  const rows = [];

  const stems = new Set();
  for (const item of inboxItemsOf(files)) {
    if (!item?.id) continue;
    const name = text(item.file?.name);
    const stem = stemOf(name);
    const production = stem ? productionStages?.[stem] : null;
    if (!matches(tokens, item.orderId, item.customerName, name)) continue;
    if (stem) stems.add(stem);
    rows.push(inboxRow({
      item,
      held: !!heldIds?.has(item.id),
      heldReason: heldReasons?.get(item.id),
      production,
    }));
  }

  for (const row of Object.values(productionStages ?? {})) {
    if (!row?.file_id || stems.has(row.file_id)) continue;
    if (!matches(tokens, row.order_id, row.customer_name, row.file_id)) continue;
    rows.push(stageRow({ row, history: stageHistory?.[row.file_id] }));
  }

  // Group by order. The first non-empty customer name wins, as in groupByOrder.
  const byOrder = new Map();
  for (const r of rows) {
    const key = r.orderKey ?? UNKNOWN_ORDER_KEY;
    if (!byOrder.has(key)) {
      byOrder.set(key, {
        orderKey: key,
        orderId: r.orderKey ?? UNKNOWN_ORDER_LABEL,
        customerName: null,
        isUnknown: r.orderKey === null,
        rows: [],
      });
    }
    const group = byOrder.get(key);
    group.rows.push(r);
    if (!group.customerName && r.customerName) group.customerName = r.customerName;
  }

  const exact = q.toUpperCase();
  const newestOf = (g) => g.rows.reduce((m, r) => (r.since && (!m || r.since > m) ? r.since : m), "");
  const groups = [...byOrder.values()].sort((a, b) => {
    if (a.isUnknown !== b.isUnknown) return a.isUnknown ? 1 : -1;
    const ea = a.orderKey === exact;
    const eb = b.orderKey === exact;
    if (ea !== eb) return ea ? -1 : 1;
    return byNewest(newestOf(a), newestOf(b)) || a.orderKey.localeCompare(b.orderKey);
  });
  for (const g of groups) {
    g.rows.sort((a, b) => (
      whereRank(a.where) - whereRank(b.where)
      || byNewest(a.since ?? "", b.since ?? "")
      || a.fileName.localeCompare(b.fileName)
    ));
  }

  // Cap the rows, not the groups: one order with 80 files must not push every other order out,
  // and the cap must not leave a group header with no row under it.
  const totalRows = rows.length;
  let budget = MAX_RESULT_ROWS;
  const shown = [];
  for (const g of groups) {
    if (budget <= 0) break;
    const take = g.rows.slice(0, budget);
    budget -= take.length;
    shown.push({ ...g, rows: take });
  }
  const shownRows = Math.min(totalRows, MAX_RESULT_ROWS);
  return { status: "ok", query: q, groups: shown, totalRows, shownRows, hiddenRows: totalRows - shownRows };
};
