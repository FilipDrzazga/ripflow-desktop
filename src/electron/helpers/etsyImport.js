import path from "node:path";
import { ETSY_IMPORT_INTERRUPTED_REASON, ETSY_IMPORT_STATE, ETSY_XWD_INPUT_RE } from "../../shared/constants.js";
import { isImageFileName } from "../../shared/artworkFile.js";
import { MAX_UNLISTED_RETRY_ORDERS } from "../../shared/etsyImportInterval.js";
import { etsyShipByOf } from "../../shared/etsyShipBy.js";
import { isEtsyFileName } from "../../shared/orderSource.js";
import { resolveEtsyFabric } from "./etsyFabric.js";
import { suggestXwdForTitle } from "./etsySuggestion.js";
import {
  xwdOfTransaction,
  fabricValueOfTransaction,
  typeTextCandidates,
  libraryFilesFor,
  repeatOfLibraryName,
  buildEtsyTileName,
} from "./etsyTransaction.js";

// The Etsy import of ONE station (plan E3b-2): open orders of the shop -> one image tile per order line in the
// inbox folder of its fabric. Everything the world supplies is injected (the API, the database, the disk, the
// parser, the clock), so the whole of it runs in tests without Electron, a network or a share.
//
// The rules it keeps - each one is a test:
// - FAIL CLOSED (W3): no database, flag off, station not the importer, paths or token missing -> `gate()` says
//   why and the tick does nothing.
// - A line that cannot be read as ONE thing (XWD, fabric, print type, library file) is recorded NEEDS_REVIEW
//   with its reason and no file is written. Never a silent skip, never the nearest guess.
// - The name is proved before the line is claimed (W4): it is read back through the parser and must give the
//   same order, fabric, quantity, type, XWD and source - else NEEDS_REVIEW.
// - ORDER OF WRITES (W5): claim (INSERT OR IGNORE on the UNIQUE) -> copy to a .tmp in the SAME folder -> rename
//   without overwrite -> DONE. The library is only ever copied from, never moved.
// - A PENDING row is never copied a second time on its own (W2): the file may have left for a batch before
//   DONE reached the share. An old PENDING with its file in the folder is DONE, without the file it is
//   NEEDS_REVIEW.
// - A problem of the ENVIRONMENT (library unreachable, a folder that cannot be read) is not a verdict on the
//   order: it ends the tick and leaves the line without a row, so the next tick tries it again.
// - RETRY (E4) is a person's request, written from the Inbox bar of ANY station; only this importer acts on it,
//   and only for a line of an order Etsy still says is paid and open - the tick's list, or, for an order the list
//   does not hold (older than the start date, or no longer open), the order fetched by its number (retryUnlisted):
//   a refused one (also Etsy's 404, or a line the order no longer carries) goes back to NEEDS_REVIEW with Etsy's
//   answer, never ending the tick for the orders behind it. The XWD number typed in (manualXwd) replaces the
//   one read from the line - six digits, checked here as well as in the IPC. The line moves on by a CAS
//   (RETRY -> PENDING, or RETRY -> NEEDS_REVIEW with the NEW reason), so a person who dismissed it in the
//   meantime wins, and the copy is the same claim-less half of copyIn. DISMISSED is never looked at again.
// - Every row the import writes carries what a person needs to recognise the line in the bar: title, quantity,
//   listing id.
// - SUGGESTION (E4c): a line that stops for want of an XWD number - none on the line, or none in the library - is
//   written with the number its listing title points to in the library (etsySuggestion.js), when exactly one does.
//   Only a hint for the bar: it is never used to name or copy a file. Not finding one, or not being able to look,
//   costs nothing - the line is recorded without it.
// - IMPORT THIS ORDER (E5): one receipt a person named runs through the same lines as the tick (runReceipts), with
//   the tick's gate minus the start date, after Etsy confirms it is paid and open (oneOffRefusal).
// - SHIP BY (plan ETA): the line's expected_ship_date (epoch s) is written at the claim and by every move of a RETRY,
//   and a line that already has a row gets it refreshed whenever Etsy sends a valid date that differs from the stored
//   one (a backfill, or Etsy moved it) - compared in memory first, so an unchanged date costs no write. A missing or
//   invalid date never clears a stored one, and a failed write of it is logged and costs only the date: the line
//   goes on exactly as without it. The dry run never writes it.

// A PENDING row younger than this may belong to a copy another process is making right now.
export const STALE_PENDING_MS = 10 * 60 * 1000;

// The bound of retryUnlisted lives with the import's pace (the renderer counts requests with it); re-exported for
// the tests of this engine.
export { MAX_UNLISTED_RETRY_ORDERS };

// Longest full path the import writes. Windows' MAX_PATH is 260 and the PRINTED copy lives deeper.
const MAX_PATH_LENGTH = 240;

class EtsyEnvironmentError extends Error {}

const env = (message) => new EtsyEnvironmentError(message);

const tmpNameOf = (receiptId, transactionId) => `.etsy-${receiptId}-${transactionId}.tmp`;

const idOf = (value) => (value === null || value === undefined ? "" : String(value).trim());

// What the Inbox bar shows of a line; db.js stores NULL for anything that is not the expected type.
const detailsOf = (transaction) => ({
  title: transaction?.title,
  quantity: transaction?.quantity,
  listingId: transaction?.listing_id,
  shipBy: transaction?.expected_ship_date,
});

// -> { xwd } or { reason }: the number a person typed in, else the one the line carries.
const xwdOf = (transaction, manualXwd) => {
  if (manualXwd === null || manualXwd === undefined || manualXwd === "") return xwdOfTransaction(transaction);
  const typed = String(manualXwd).trim();
  if (!ETSY_XWD_INPUT_RE.test(typed)) return { reason: `The XWD number typed in (${typed}) is not six digits.` };
  return { xwd: typed };
};

// Why "Import this order" (E5) must not take this receipt, or null. The same orders the tick lists (paid, not
// shipped, not cancelled) and nothing else: Etsy's own status must be "paid" (= paid and ready for shipping);
// anything Etsy did not say is a "no".
export const oneOffRefusal = (receipt, receiptId) => {
  if (!receipt || idOf(receipt.receipt_id) !== receiptId) return `Etsy did not send order ET${receiptId}.`;
  if (receipt.is_paid !== true) return `Order ET${receiptId} is not paid.`;
  if (receipt.is_shipped !== false) return `Order ET${receiptId} is already shipped (or Etsy did not say).`;
  const status = typeof receipt.status === "string" ? receipt.status.trim().toLowerCase() : "";
  if (status !== "paid") return `Order ET${receiptId} has the status "${receipt.status ?? "unknown"}" - only a paid order waiting for shipping is imported.`;
  return null;
};

export const createEtsyImporter = ({
  gate, // ({ anyStartDate }?) => null | "reason the tick must not run"
  listReceipts, // async () => receipts[]
  getReceipt = async () => null, // async (receiptId) => one receipt with its lines, fetched from Etsy (E5)
  getFabrics, // () => [{ name }] | null
  getFabricMap, // () => [{ etsyKey, fabricName }] | null
  getProfile, // () => shop profile | null
  storageRoot, // () => absolute path of the inbox root (storagePath)
  libraryRoot, // () => absolute path of the Etsy pattern folder
  imports, // { get, claim, setState, move, listRetries, setShipBy } - the etsy_imports functions of db.js
  fs, // { readdir, stat, copyFile, unlink, constants }
  renameNoOverwrite,
  parse, // parsePrintFileName
  now = () => Date.now(),
  log = () => {},
}) => {
  const filesOf = async (dir) => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.filter((e) => e.isFile()).map((e) => e.name);
    } catch (err) {
      throw env(`Cannot read the folder ${dir} (${err.code ?? err.message}).`);
    }
  };

  const folderExists = async (dir) => {
    try {
      return (await fs.stat(dir)).isDirectory();
    } catch (err) {
      if (err.code === "ENOENT" || err.code === "ENOTDIR") return false;
      throw env(`Cannot look at the folder ${dir} (${err.code ?? err.message}).`);
    }
  };

  // The proof of W4: the name we are about to write reads back as the order line we built it from.
  const readBackProblem = (name, plan) => {
    const out = parse(name, { dir: path.join(storageRoot(), plan.fabric.name), fullPath: null, shopConfig: plan.profile });
    if (!out) return "the parser returned nothing";
    if (Array.isArray(out.errors) && out.errors.length > 0) return `the parser refuses it (${out.errors.map((e) => e.code ?? e).join(", ")})`;
    const wrong = [];
    if (out.orderId !== `ET${plan.receiptId}`) wrong.push("order number");
    if (out.source !== "ETSY") wrong.push("source");
    if (out.material !== plan.fabric.name) wrong.push("material");
    if (out.qty !== plan.qty) wrong.push("quantity");
    if (out.artworkId !== `XWD${plan.xwd}`) wrong.push("XWD");
    if (out.x !== plan.index || out.y !== plan.total) wrong.push("x of y");
    if (out.repeatType !== plan.repeat) wrong.push("repeat type");
    if (!["LM", "FQ", "SAMPLE"].includes(out.printTypeCode)) wrong.push("print type");
    if (!isEtsyFileName(name)) wrong.push("Etsy name shape");
    return wrong.length > 0 ? `it reads back with a different ${wrong.join(", ")}` : null;
  };

  // -> { plan } or { reason }. Reads the disk only through the folder listings of this tick (`library`).
  const prepare = async ({ receipt, transaction, index, total, library, manualXwd = null }) => {
    const receiptId = idOf(receipt.receipt_id);
    const transactionId = idOf(transaction.transaction_id);

    const xwd = xwdOf(transaction, manualXwd);
    if (xwd.reason) return { reason: xwd.reason, suggest: true };

    const qty = transaction.quantity;
    if (!Number.isInteger(qty) || qty <= 0) return { reason: `The quantity of the order line is not a whole number above 0 (${qty}).` };

    const fabricText = fabricValueOfTransaction(transaction);
    if (fabricText.reason) return { reason: fabricText.reason };
    const fabrics = getFabrics();
    const map = getFabricMap();
    if (!Array.isArray(fabrics) || !Array.isArray(map)) throw env("The Fabrics catalogue or the Etsy -> Fabrics table could not be read.");
    const resolved = resolveEtsyFabric(fabricText.value, { map, fabrics });
    if (resolved.reason) return { reason: resolved.reason };
    const fabric = resolved.fabric;

    if (!(await folderExists(path.join(storageRoot(), fabric.name)))) {
      return { reason: `There is no inbox folder "${fabric.name}" in the storage folder.` };
    }

    const files = libraryFilesFor(xwd.xwd, await library(), isImageFileName);
    if (files.length === 0) return { reason: `No image with XWD${xwd.xwd} in the Etsy library folder.`, suggest: true };
    if (files.length > 1) return { reason: `${files.length} images carry XWD${xwd.xwd} in the Etsy library folder (${files.join(", ")}) - one is expected.` };
    const libraryFile = files[0];

    const repeat = repeatOfLibraryName(libraryFile, xwd.xwd);
    if (!repeat) return { reason: `The library file ${libraryFile} has no repeat type (Basic, Half-Drop, Half-Brick, Center, Mirror) after XWD${xwd.xwd}.` };

    const profile = getProfile();
    if (!profile) throw env("The shop profile is not loaded.");

    const base = {
      receiptId,
      transactionId,
      index,
      total,
      qty,
      xwd: xwd.xwd,
      repeat,
      fabric,
      profile,
      libraryFile,
      ext: libraryFile.slice(libraryFile.lastIndexOf(".") + 1),
    };

    // The print type: whichever variation text makes a name that reads back as a Linear Meter, Fat Quarter or
    // Sample. Exactly one text may do that - two different ones are an order line we cannot tell apart.
    const candidates = typeTextCandidates(transaction);
    const accepted = [];
    const problems = [];
    for (const typeText of candidates) {
      const fileName = buildEtsyTileName({ ...base, customerName: receipt.name, material: fabric.name, typeText });
      const problem = readBackProblem(fileName, { ...base });
      if (problem) problems.push(`"${typeText}": ${problem}`);
      else accepted.push({ typeText, fileName });
    }
    if (accepted.length === 0) {
      return {
        reason:
          candidates.length === 0
            ? "The order line has no variation that could name the print type (Linear Meter, Fat Quarter, Sample Print)."
            : `No variation reads as a print type - ${problems.join("; ")}.`,
      };
    }
    if (accepted.length > 1) return { reason: `More than one variation reads as a print type (${accepted.map((a) => `"${a.typeText}"`).join(", ")}).` };

    const { fileName } = accepted[0];
    if (path.join(storageRoot(), fabric.name, fileName).length >= MAX_PATH_LENGTH) {
      return { reason: `The file name is too long for the inbox path (${fileName.length} characters).` };
    }
    return { plan: { ...base, fileName } };
  };

  const record = (key, state, extra = {}) => imports.claim({ ...key, state, ...extra });

  // The bar's suggestion for a line that stopped at the XWD number: a six-digit string, or null. An unreadable
  // library is not an answer about this line (the tick meets the same folder at the next line that needs it).
  const suggestionFor = async (transaction, library) => {
    try {
      return suggestXwdForTitle(transaction?.title, await library(), isImageFileName);
    } catch {
      return null;
    }
  };

  // The ship-by date of a line that already has a row: written only when Etsy sends a valid date and the row holds a
  // different one. `row.shipBy` undefined = the table has no column for it (nothing to write to). Never throws - the
  // date is not worth a line.
  const refreshShipBy = (key, row, value) => {
    const shipBy = etsyShipByOf(value);
    if (shipBy === null || row.shipBy === undefined || row.shipBy === shipBy || typeof imports.setShipBy !== "function") return;
    try {
      if (imports.setShipBy({ ...key, shipBy }) === null) log(`[etsy-import] receipt ${key.receiptId} line ${key.transactionId}: the ship-by date could not be written.`);
    } catch (err) {
      log(`[etsy-import] receipt ${key.receiptId} line ${key.transactionId}: the ship-by date could not be written (${err?.message ?? err}).`);
    }
  };

  // A PENDING row found by a later tick (W2). Never copies.
  const settlePending = async (row, summary) => {
    const age = now() - Date.parse(row.updatedAt);
    if (Number.isFinite(age) && age < STALE_PENDING_MS) {
      summary.skipped += 1;
      return;
    }
    const key = { receiptId: row.receiptId, transactionId: row.transactionId };
    const target = row.folder && row.fileName ? path.join(storageRoot(), row.folder, row.fileName) : null;
    let present = false;
    if (target) {
      try {
        await fs.stat(target);
        present = true;
      } catch (err) {
        if (err.code !== "ENOENT" && err.code !== "ENOTDIR") throw env(`Cannot look at ${target} (${err.code ?? err.message}).`);
      }
    }
    if (present) {
      imports.setState({ ...key, state: ETSY_IMPORT_STATE.DONE, reason: null });
      summary.imported += 1;
      return;
    }
    // The tmp of the interrupted copy is ours (the claim named it) and half a file: gone, by its own name.
    if (row.folder) await fs.unlink(path.join(storageRoot(), row.folder, tmpNameOf(row.receiptId, row.transactionId))).catch(() => {});
    imports.setState({
      ...key,
      state: ETSY_IMPORT_STATE.NEEDS_REVIEW,
      reason: ETSY_IMPORT_INTERRUPTED_REASON,
    });
    summary.needsReview += 1;
  };

  const copyIn = async (plan, summary, details) => {
    const key = { receiptId: plan.receiptId, transactionId: plan.transactionId };
    const claimed = record(key, ETSY_IMPORT_STATE.PENDING, { fileName: plan.fileName, folder: plan.fabric.name, details });
    if (claimed === null) throw env("The import table could not be written.");
    if (claimed === false) {
      summary.skipped += 1;
      return;
    }
    await copyClaimed(plan, summary);
  };

  // The copy of a line this tick owns (a claim, or the CAS of a RETRY): .tmp -> rename without overwrite -> DONE.
  const copyClaimed = async (plan, summary) => {
    const key = { receiptId: plan.receiptId, transactionId: plan.transactionId };
    const folderPath = path.join(storageRoot(), plan.fabric.name);
    const tmp = path.join(folderPath, tmpNameOf(plan.receiptId, plan.transactionId));
    const finalPath = path.join(folderPath, plan.fileName);
    const source = path.join(libraryRoot(), plan.libraryFile);

    const fail = async (state, reason) => {
      await fs.unlink(tmp).catch(() => {});
      imports.setState({ ...key, state, reason });
      if (state === ETSY_IMPORT_STATE.NEEDS_REVIEW) summary.needsReview += 1;
      else summary.failed += 1;
      log(`[etsy-import] ${plan.fileName}: ${reason}`);
    };

    try {
      await fs.copyFile(source, tmp, fs.constants.COPYFILE_EXCL);
      const [from, to] = await Promise.all([fs.stat(source), fs.stat(tmp)]);
      if (from.size !== to.size) {
        await fail(ETSY_IMPORT_STATE.FAILED, `The copy is ${to.size} bytes, the library file ${from.size}.`);
        return;
      }
    } catch (err) {
      await fail(ETSY_IMPORT_STATE.FAILED, `Copying ${plan.libraryFile} failed (${err.code ?? err.message}).`);
      return;
    }
    try {
      await renameNoOverwrite(tmp, finalPath);
    } catch (err) {
      if (err.code === "EEXIST") await fail(ETSY_IMPORT_STATE.NEEDS_REVIEW, `A file named ${plan.fileName} is already in the inbox folder.`);
      else await fail(ETSY_IMPORT_STATE.FAILED, `Naming the copy failed (${err.code ?? err.message}).`);
      return;
    }
    imports.setState({ ...key, state: ETSY_IMPORT_STATE.DONE, reason: null });
    summary.imported += 1;
    log(`[etsy-import] ${plan.fileName} imported`);
  };

  const processLine = async ({ receipt, transaction, index, total, library }, summary) => {
    const receiptId = idOf(receipt.receipt_id);
    const transactionId = idOf(transaction?.transaction_id);
    if (!receiptId || !transactionId) {
      summary.skipped += 1;
      return;
    }
    const key = { receiptId, transactionId };

    const existing = imports.get(receiptId, transactionId);
    if (existing === undefined) throw env("The import table could not be read.");
    const details = detailsOf(transaction);
    if (existing) {
      // A RETRY carries the date in its own move (retryLine); every other state is refreshed here.
      if (existing.state !== ETSY_IMPORT_STATE.RETRY) refreshShipBy(key, existing, details.shipBy);
      if (existing.state === ETSY_IMPORT_STATE.PENDING) await settlePending(existing, summary);
      else if (existing.state === ETSY_IMPORT_STATE.RETRY) await retryLine(existing, { receipt, transaction, index, total, library }, summary);
      else summary.skipped += 1; // DONE, NEEDS_REVIEW, FAILED, DISMISSED: a person decides, not the tick
      return;
    }

    const prepared = await prepare({ receipt, transaction, index, total, library });
    if (prepared.reason) {
      const suggestedXwd = prepared.suggest ? await suggestionFor(transaction, library) : null;
      const claimed = record(key, ETSY_IMPORT_STATE.NEEDS_REVIEW, { reason: prepared.reason, details: { ...details, suggestedXwd } });
      if (claimed === null) throw env("The import table could not be written.");
      if (claimed) {
        summary.needsReview += 1;
        log(`[etsy-import] receipt ${receiptId} line ${transactionId}: ${prepared.reason}`);
      } else summary.skipped += 1;
      return;
    }
    await copyIn(prepared.plan, summary, details);
  };

  // A RETRY row of a line of an open order (E4). The line is judged again - with the number typed in, when there
  // is one - and leaves RETRY only by a CAS: a person who dismissed it meanwhile, or another tick that moved it,
  // makes this one do nothing. manual_xwd stays on the row either way, so the bar shows what was tried.
  const retryLine = async (row, line, summary) => {
    const key = { receiptId: row.receiptId, transactionId: row.transactionId };
    const details = detailsOf(line.transaction);
    const prepared = await prepare({ ...line, manualXwd: row.manualXwd ?? null });
    const from = [ETSY_IMPORT_STATE.RETRY];
    if (prepared.reason) {
      const suggestedXwd = prepared.suggest ? await suggestionFor(line.transaction, line.library) : null;
      const moved = imports.move({ ...key, from, state: ETSY_IMPORT_STATE.NEEDS_REVIEW, reason: prepared.reason, details: { ...details, suggestedXwd } });
      if (moved === null) throw env("The import table could not be written.");
      if (moved) {
        summary.needsReview += 1;
        log(`[etsy-import] retry of receipt ${row.receiptId} line ${row.transactionId}: ${prepared.reason}`);
      } else summary.skipped += 1;
      return;
    }
    const { plan } = prepared;
    const moved = imports.move({ ...key, from, state: ETSY_IMPORT_STATE.PENDING, reason: null, fileName: plan.fileName, folder: plan.fabric.name, details });
    if (moved === null) throw env("The import table could not be written.");
    if (!moved) {
      summary.skipped += 1;
      return;
    }
    await copyClaimed(plan, summary);
  };

  // Every line of every receipt through processLine - the ONE way a line is imported, for the tick and for
  // "Import this order" alike. The library is listed once per pass, and only when a line gets that far.
  // `only` (transaction => boolean) skips the other lines; their place in the order (index / total) stays.
  // -> the receipts it went through (the tick's list, for retryUnlisted).
  const runReceipts = async (receipts, summary, only = () => true) => {
    let listing = null;
    const library = () => {
      if (!listing) listing = filesOf(libraryRoot());
      return listing;
    };
    const all = Array.isArray(receipts) ? receipts : [];
    for (const receipt of all) {
      const transactions = Array.isArray(receipt?.transactions) ? receipt.transactions : [];
      for (let i = 0; i < transactions.length; i += 1) {
        if (!only(transactions[i])) continue;
        await processLine({ receipt, transaction: transactions[i], index: i + 1, total: transactions.length, library }, summary);
      }
    }
    return all;
  };

  // RETRY rows of orders the tick did NOT list (FILIP 2026-10-22: a Retry "did nothing" for good) - an order older
  // than the start date, which only "Import this order" brings in, or one Etsy no longer lists as open. Each such
  // order is fetched by its number, as "Import this order" does: still paid and open -> its RETRY lines, and only
  // those, go through processLine; refused (shipped, cancelled, not sent) -> each RETRY line goes back to
  // NEEDS_REVIEW by the same CAS with Etsy's answer as the reason, so the bar says why instead of waiting.
  // An answer about ONE order is a verdict on that order, not on the tick (D77): Etsy's 404 (no such order in this
  // shop - deleted, or another shop's after "Connect again") and a RETRY line the fetched order no longer carries
  // both go back to NEEDS_REVIEW, else the oldest such row would end every tick before the orders behind it, or hold
  // one of the fetches for good. Any other failure of the fetch is the environment's and still ends the tick.
  // listRetries absent (the dry run's table) or unable to answer (null) = nothing to do here.
  const backToReview = (receiptId, transactionIds, reason, summary) => {
    for (const transactionId of transactionIds) {
      const moved = imports.move({ receiptId, transactionId, from: [ETSY_IMPORT_STATE.RETRY], state: ETSY_IMPORT_STATE.NEEDS_REVIEW, reason });
      if (moved === null) throw env("The import table could not be written.");
      if (moved) {
        summary.needsReview += 1;
        log(`[etsy-import] retry of receipt ${receiptId} line ${transactionId}: ${reason}`);
      } else summary.skipped += 1;
    }
  };

  const fetchUnlisted = async (receiptId) => {
    try {
      return await getReceipt(receiptId);
    } catch (err) {
      if (err?.status === 404) return { notFound: true };
      throw err;
    }
  };

  const retryUnlisted = async (listed, summary) => {
    const rows = typeof imports.listRetries === "function" ? imports.listRetries() : null;
    if (!Array.isArray(rows) || rows.length === 0) return;
    const seen = new Set((Array.isArray(listed) ? listed : []).map((r) => idOf(r?.receipt_id)));
    const wanted = new Map();
    for (const row of rows) {
      const receiptId = idOf(row?.receiptId);
      if (!/^\d+$/.test(receiptId) || seen.has(receiptId)) continue;
      if (!wanted.has(receiptId)) wanted.set(receiptId, new Set());
      wanted.get(receiptId).add(idOf(row.transactionId));
    }
    for (const [receiptId, lines] of [...wanted].slice(0, MAX_UNLISTED_RETRY_ORDERS)) {
      const receipt = await fetchUnlisted(receiptId);
      if (receipt?.notFound) {
        backToReview(receiptId, lines, `Etsy has no order ET${receiptId} in this shop (404).`, summary);
        continue;
      }
      const refused = oneOffRefusal(receipt, receiptId);
      if (refused) {
        backToReview(receiptId, lines, refused, summary);
        continue;
      }
      await runReceipts([receipt], summary, (transaction) => lines.has(idOf(transaction?.transaction_id)));
      const carried = new Set((Array.isArray(receipt.transactions) ? receipt.transactions : []).map((t) => idOf(t?.transaction_id)));
      const gone = [...lines].filter((transactionId) => !carried.has(transactionId));
      backToReview(receiptId, gone, `Etsy's order ET${receiptId} no longer has this line.`, summary);
    }
  };

  const stoppedReason = (err) => (err instanceof EtsyEnvironmentError ? err.message : `Etsy import stopped: ${err.message ?? err}`);

  const emptySummary = () => ({ ran: false, reason: null, imported: 0, needsReview: 0, failed: 0, skipped: 0 });

  // One pass. Never throws: the answer says what happened.
  const tick = async () => {
    const summary = emptySummary();
    const blocked = gate();
    if (blocked) return { ...summary, reason: blocked };
    summary.ran = true;
    try {
      const listed = await runReceipts(await listReceipts(), summary);
      await retryUnlisted(listed, summary);
    } catch (err) {
      return { ...summary, reason: stoppedReason(err) };
    }
    return summary;
  };

  // "Import this order" (E5): ONE receipt a person named, on the importer station only. The same gate as the tick
  // but without the start date (the date only decides what the tick LISTS); the receipt is fetched from Etsy here,
  // never taken from the screen, and must still be paid and open; then the same runReceipts as the tick, so a line
  // that already has a row is treated exactly as the tick treats it (never a second copy). The start date itself
  // is never touched. Never throws: ran false = nothing was looked at, with the reason.
  tick.importReceipt = async (receiptId) => {
    const summary = emptySummary();
    const blocked = gate({ anyStartDate: true });
    if (blocked) return { ...summary, reason: blocked };
    try {
      const receipt = await getReceipt(receiptId);
      const refused = oneOffRefusal(receipt, receiptId);
      if (refused) return { ...summary, reason: refused };
      summary.ran = true;
      await runReceipts([receipt], summary);
    } catch (err) {
      return { ...summary, reason: stoppedReason(err) };
    }
    return summary;
  };

  // The DRY RUN (Settings > Etsy > Check newest order): what the import would make of each line of ONE receipt,
  // through the same prepare() the tick uses. It reads the disk, the catalogue and the import table and writes
  // NOTHING - no claim, no copy, no state; `imports` is only asked `get`. The gate is not consulted (the caller
  // reports it): a station that is switched off can still be asked. Throws the environment errors of prepare
  // (an unreadable library or catalogue) - there is no tick to end here, the caller shows the message.
  tick.preview = async (receipt) => {
    const transactions = Array.isArray(receipt?.transactions) ? receipt.transactions : [];
    let listing = null;
    const library = () => {
      if (!listing) listing = filesOf(libraryRoot());
      return listing;
    };
    const lines = [];
    for (let i = 0; i < transactions.length; i += 1) {
      const transaction = transactions[i];
      const receiptId = idOf(receipt.receipt_id);
      const transactionId = idOf(transaction?.transaction_id);
      const recorded = receiptId && transactionId ? imports.get(receiptId, transactionId) : null;
      const line = {
        transactionId,
        title: typeof transaction?.title === "string" ? transaction.title : null,
        quantity: Number.isInteger(transaction?.quantity) ? transaction.quantity : null,
        recordedState: recorded?.state ?? null,
      };
      // Etsy's ship-by date, only when it sent a valid one (no key = no date) - shown, never written.
      const shipBy = etsyShipByOf(transaction?.expected_ship_date);
      if (shipBy !== null) line.shipBy = shipBy;
      const prepared = await prepare({ receipt, transaction: transaction ?? {}, index: i + 1, total: transactions.length, library });
      if (prepared.reason) {
        const suggestedXwd = prepared.suggest ? await suggestionFor(transaction, library) : null;
        lines.push({ ...line, ok: false, reason: prepared.reason, suggestedXwd });
      } else {
        const { plan } = prepared;
        lines.push({ ...line, ok: true, fileName: plan.fileName, folder: plan.fabric.name, libraryFile: plan.libraryFile, xwd: plan.xwd });
      }
    }
    return lines;
  };

  return tick;
};
