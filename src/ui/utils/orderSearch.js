// "Where is order X?" - the pure core of the Ctrl+F search window (plan C3).
//
// Input: the query plus a SNAPSHOT of what the store already holds - the Inbox scan (`files`),
// the Held set (`heldIds` / `heldReasons`) and the Production board (`productionStages`,
// `stageHistory`). Output: order groups, one row per FILE saying where that file is NOW.
// No IPC, no disk, no clock: the window re-runs this on every keystroke and every store change.
//
// The store alone cannot answer for an order older than the Shipped retention (cleanupShippedStages purged
// its file_stages row), so the window also sweeps the PRINTED folders in the background
// (hooks/usePrintedSearch.js, FILIP 2026-10-20: an order of last month was found only through the Batch
// tab) and hands what it listed in as `printedDays`. Those rows are the last resort: a file the
// store knows (a Production row) is never shown twice. Custom Orders stay out.
//
// One file = one row. file_stages is keyed by the filename stem (rollback deletes the row when
// the PDF returns to the Inbox), so a stem seen in BOTH places is a fresh copy waiting in the
// Inbox while an older one still sits in Production. When the query matches both, the Inbox row
// wins - it is the one the operator can act on - and keeps the stage of the other copy in
// `alsoInProduction`; when it matches only the Production row, that row is shown. The PRINTED copy of a
// stem that waits in the Inbox / Held is folded the same way (`alsoPrinted: { since }`, the newest batch time
// or null): no second row.

import { APP_VIEW } from "../constants/appViews";
import { dayKeyFromBatchPath } from "./dayKey";
import { stageFileName } from "../../shared/artworkFile";
import { orderIdFromFileName } from "../../shared/orderSource";
import { ORDER_STAGE_PIPELINE, UNKNOWN_ORDER_KEY, UNKNOWN_ORDER_LABEL } from "./groupByOrder";

// Where a file is now: the two pre-print places, a PRODUCTION_STAGE value verbatim, or HISTORY - printed and
// still in its PRINTED batch folder, but with no stage row any more (shipped and purged, or never staged).
export const ORDER_SEARCH_WHERE = {
  INBOX: "inbox",
  HELD: "held",
  HISTORY: "history",
};

// The view ids App.jsx switches on (`activeView`), taken from the one constant App.jsx itself uses. The
// target of a row is a VIEW plus the file; utils/searchTarget.js turns it into the actual navigation.
export const ORDER_SEARCH_VIEW = {
  PRINT: APP_VIEW.PRINT,
  PRODUCTION: APP_VIEW.PRODUCTION,
  BATCH: APP_VIEW.BATCH,
};

// Below this many characters (after trim) nothing is searched: one letter would match half the
// shop. "ON" alone is also too short to mean anything.
export const MIN_QUERY_LENGTH = 3;

// Rows shown at most; the rest is reported as hiddenRows ("N more").
export const MAX_RESULT_ROWS = 50;

// Sort position of a row inside its order: Inbox, Held, the pipeline order, then History. A stage the
// pipeline does not list (rejected / overridden - legacy rows) sorts after everything.
const WHERE_RANK = new Map([
  [ORDER_SEARCH_WHERE.INBOX, 0],
  [ORDER_SEARCH_WHERE.HELD, 1],
  ...ORDER_STAGE_PIPELINE.map((stage, i) => [stage, i + 2]),
  [ORDER_SEARCH_WHERE.HISTORY, ORDER_STAGE_PIPELINE.length + 2],
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

const inboxRow = ({ item, held, heldReason, production }) => {
  const name = text(item.file?.name);
  return {
    fileId: item.id,
    fileName: name,
    // An item the parser gave no orderId (an invalid file) still shows under the ON number in its name,
    // like the order column of the Inbox list does.
    orderKey: orderKeyOf(text(item.orderId) || orderIdFromFileName(name)),
    customerName: text(item.customerName) || null,
    where: held ? ORDER_SEARCH_WHERE.HELD : ORDER_SEARCH_WHERE.INBOX,
    since: isoOf(item.createdAt),
    reason: held ? heldReason || null : null,
    batchPath: null,
    dayKey: null,
    alsoInProduction: production?.stage ?? null,
    alsoPrinted: null,
    target: { view: ORDER_SEARCH_VIEW.PRINT, fileId: item.id, dayKey: null },
  };
};

const stageRow = ({ row, history }) => {
  const batchPath = text(row.batch_path) || null;
  const dayKey = dayKeyFromBatchPath(batchPath);
  return {
    fileId: row.file_id,
    fileName: stageFileName(row),
    orderKey: orderKeyOf(row.order_id),
    customerName: text(row.customer_name) || null,
    where: row.stage,
    since: stageSince(row, history),
    reason: null,
    batchPath,
    dayKey,
    alsoInProduction: null,
    alsoPrinted: null,
    target: { view: ORDER_SEARCH_VIEW.PRODUCTION, fileId: row.file_id, dayKey },
  };
};

// When a PRINTED batch was made, from the day folder (dd-mm-yyyy) and the batch folder's hhmmss
// (PRINTED_hhmmss-GROUP-PRINTER), as an ISO string; null for a day folder that is not a real date. The
// batch time is local time, like the folder names. A batch name without the hhmmss keeps the day (00:00).
const printedBatchTime = (dayFolder, batchName) => {
  const d = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text(dayFolder));
  if (!d) return null;
  const t = /^PRINTED_(\d{2})(\d{2})(\d{2})/.exec(text(batchName));
  const [day, month, year] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const at = new Date(year, month - 1, day, t ? Number(t[1]) : 0, t ? Number(t[2]) : 0, t ? Number(t[3]) : 0);
  // 31-02-2026 would roll over into March: a folder name that is not a date has no time.
  if (Number.isNaN(at.getTime()) || at.getDate() !== day || at.getMonth() !== month - 1) return null;
  return at.toISOString();
};

const historyRow = ({ file, batch, dayFolder }) => {
  const name = text(file.name);
  const stem = stemOf(name);
  return {
    fileId: stem,
    fileName: name,
    orderKey: orderKeyOf(text(file.orderId) || orderIdFromFileName(name)),
    customerName: text(file.customerName) || null,
    where: ORDER_SEARCH_WHERE.HISTORY,
    since: printedBatchTime(dayFolder, batch.name),
    reason: null,
    batchPath: text(batch.path) || null,
    dayKey: dayFolder,
    alsoInProduction: null,
    alsoPrinted: null,
    target: { view: ORDER_SEARCH_VIEW.BATCH, fileId: stem, dayKey: dayFolder, batchPath: text(batch.path) || null },
  };
};

// Newest first; a row without a time sorts after the dated ones.
const byNewest = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

/**
 * @param {string} query
 * @param {{ files?: object[] (store.files: groups with `items`; a flat item list also works), heldIds?: Set<string>, heldReasons?: Map<string,string>,
 *           productionStages?: Record<string, object>, stageHistory?: Record<string, object[]>,
 *           printedDays?: { dayFolder: string, batches: { name, path, printer, files: { name, orderId, customerName }[] }[] }[] } snapshot
 *   the store slices of the same names; every one is optional (a slice not loaded yet is empty). `printedDays`
 *   is what the history sweep has listed so far (readPrintedDayNames), not a store slice.
 * @returns {{ status: "short" | "ok", query: string, groups: object[], totalRows: number,
 *             shownRows: number, hiddenRows: number }}
 *   groups: [{ orderKey, orderId, customerName, isUnknown, rows }] - exact order id first, then
 *   the order with the most recent file, the unknown-order bucket last. Rows: see inboxRow /
 *   stageRow (`where`, `since`, `dayKey`, `target`, ...).
 */
export const searchOrders = (query, snapshot = {}) => {
  const q = text(query);
  const empty = (status) => ({ status, query: q, groups: [], totalRows: 0, shownRows: 0, hiddenRows: 0 });
  if (q.length < MIN_QUERY_LENGTH) return empty("short");

  const { files, heldIds, heldReasons, productionStages, stageHistory, printedDays } = snapshot;
  const tokens = tokensOf(q);
  const rows = [];

  const stems = new Set();
  const inboxRowByStem = new Map();
  for (const item of inboxItemsOf(files)) {
    if (!item?.id) continue;
    const name = text(item.file?.name);
    const stem = stemOf(name);
    const production = stem ? productionStages?.[stem] : null;
    if (!matches(tokens, item.orderId, item.customerName, name)) continue;
    if (stem) stems.add(stem);
    const row = inboxRow({
      item,
      held: !!heldIds?.has(item.id),
      heldReason: heldReasons?.get(item.id),
      production,
    });
    rows.push(row);
    if (stem) inboxRowByStem.set(stem, row);
  }

  for (const row of Object.values(productionStages ?? {})) {
    if (!row?.file_id || stems.has(row.file_id)) continue;
    if (!matches(tokens, row.order_id, row.customer_name, row.file_id)) continue;
    rows.push(stageRow({ row, history: stageHistory?.[row.file_id] }));
  }

  // The PRINTED folders: last resort, one row per file stem like everywhere else. A stem the store holds as a
  // Production row is not listed again (that row is the live one, and is shown whenever it matches); a stem
  // that waits in the Inbox / Held (a reprint of an old order) is folded into that row as `alsoPrinted`; a stem
  // printed in several batches (a reprint) keeps the newest.
  const historyByStem = new Map();
  for (const day of printedDays ?? []) {
    for (const batch of day?.batches ?? []) {
      for (const file of batch?.files ?? []) {
        const stem = stemOf(file?.name);
        if (!stem || productionStages?.[stem]) continue;
        if (!matches(tokens, file.orderId, file.customerName, file.name)) continue;
        const row = historyRow({ file, batch, dayFolder: day.dayFolder });
        const waiting = inboxRowByStem.get(stem);
        if (waiting) {
          waiting.alsoPrinted ??= { since: null };
          if ((row.since ?? "") > (waiting.alsoPrinted.since ?? "")) waiting.alsoPrinted.since = row.since;
          continue;
        }
        const kept = historyByStem.get(stem);
        if (!kept || (row.since ?? "") > (kept.since ?? "")) historyByStem.set(stem, row);
      }
    }
  }
  rows.push(...historyByStem.values());

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
