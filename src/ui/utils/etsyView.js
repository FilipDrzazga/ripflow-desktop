// What Settings -> Etsy says (plan E2). Pure, so it can carry tests without rendering.

import { ETSY_TICK_MAX_REQUESTS } from "../../shared/etsyImportInterval";
import { etsyShipByOf } from "../../shared/etsyShipBy";
import { etsyBuyerNoteOf } from "../../shared/etsyBuyerNote";
import { suggestionFileFits } from "./etsyImportBar";

const day = (iso) => {
  const ms = Date.parse(iso ?? "");
  return Number.isFinite(ms) ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
};

// The connection in one line: { tone: "ok" | "warn" | "off", text }.
// status null = main did not answer, which is not the same as "not connected".
export const etsyStatusLine = (status, now = Date.now()) => {
  if (!status) return { tone: "warn", text: "Status unknown - RipFlow could not read the Etsy connection." };
  if (!status.encryption) return { tone: "warn", text: "Windows cannot encrypt data for this user - Etsy keys cannot be stored on this PC." };
  if (!status.readable) return { tone: "warn", text: "The saved key cannot be read on this Windows account. Enter the key again." };
  if (!status.hasKey) return { tone: "off", text: "No Etsy key on this station." };
  if (!status.connected) return { tone: "off", text: `Key ${status.keyHint} saved - not connected. Press Connect and sign in as the shop owner.` };
  const shop = status.shopName ? `${status.shopName} (shop ${status.shopId})` : `shop ${status.shopId}`;
  const expires = Date.parse(status.refreshExpiresAt ?? "");
  if (Number.isFinite(expires) && expires <= now) {
    return { tone: "warn", text: `Sign-in to ${shop} has expired. Press Connect.` };
  }
  const until = day(status.refreshExpiresAt);
  return { tone: "ok", text: `Connected to ${shop}${until ? ` - sign-in valid until ${until} if unused` : ""}.` };
};

// An IPC answer -> the notify() payload. A cancelled sign-in is a Warning, not an Error.
export const etsyResultNotice = (res, { title, success }) => {
  if (res?.success) return { type: "Success", title, message: success };
  const error = res?.errors?.[0];
  return {
    type: error?.type === "Warning" ? "Warning" : "Error",
    title: error?.title && error.title !== "Etsy" ? error.title : `${title} failed`,
    message: error?.message || "No answer from RipFlow's main process.",
  };
};

// "Test connection" -> rows to show: what the newest paid order carries per item, so the
// fields that hold the pattern number, the fabric and the print type can be read off it.
export const etsyTestRows = (test) => {
  if (!test) return [];
  const rows = [{ label: "Shop", value: `${test.shop?.name ?? "-"} (${test.shop?.id ?? "-"})` }];
  if (Number.isFinite(test.paidOrders)) rows.push({ label: "Paid orders", value: String(test.paidOrders) });
  const latest = test.latest;
  if (!latest) {
    rows.push({ label: "Newest order", value: "none - no paid order yet" });
    return rows;
  }
  rows.push({ label: "Newest order", value: `${latest.receiptId}${latest.created ? `, ${day(latest.created)}` : ""}` });
  latest.items.forEach((item, i) => {
    const variations = item.variations.map((v) => `${v.name}: ${v.value}`).join(", ");
    rows.push({
      label: `Item ${i + 1}`,
      value: [
        item.title,
        `listing ${item.listingId ?? "-"}`,
        `SKU ${item.sku || "(empty)"}`,
        `qty ${item.quantity ?? "-"}`,
        variations || "no variations",
      ]
        .filter(Boolean)
        .join(" | "),
    });
  });
  return rows;
};

// ---- "Check newest order": the dry run of the import (plan E4c follow-up) ----------------------------------------
// The answer is { receipt, lines, gate } (main: ipc/etsyPreview.js). Nothing was imported; this only words it.

const STATE_WORDS = {
  pending: "being copied",
  done: "already imported",
  needs_review: "waiting for a person in the Etsy bar",
  failed: "failed earlier",
  retry: "waiting for a retry",
  dismissed: "marked as not a print",
};

// -> [{ tone: "ok" | "warn" | "off", text }]: would the background tick take this ORDER, and does it run here.
export const previewOrderNotes = (res) => {
  if (!res?.receipt) return [{ tone: "off", text: "The shop has no paid order yet." }];
  const { receipt, gate } = res;
  const notes = [];
  if (receipt.shipped === true) notes.push({ tone: "warn", text: "The import skips this order: it is already shipped." });
  if (receipt.afterStart === false) {
    notes.push({ tone: "warn", text: "The import skips this order: it was placed before the import was switched on here. A newer order would be taken." });
  } else if (receipt.afterStart === null) {
    notes.push({ tone: "off", text: "There is no start date yet (the import was never switched on here), so the import would take nothing." });
  }
  notes.push(
    gate ? { tone: "warn", text: `The background import does not run on this station now: ${gate}.` } : { tone: "ok", text: "The background import is ready on this station." },
  );
  return notes;
};

// The buyer's note of the order (plan MSG; main sends it as `buyerNote`, next to `receipt`), or null when there is none
// worth showing. Cleaned again here by the same rule, so the page never relies on main having done it.
export const previewBuyerNote = (res) => etsyBuyerNoteOf(res?.buyerNote);

// One order line -> { ok, headline, rows: [{ label, value }] }.
export const previewLineView = (line) => {
  const what = [line.title || "Order line without a title", Number.isInteger(line.quantity) ? `qty ${line.quantity}` : null].filter(Boolean).join(" | ");
  const rows = [];
  if (line.ok) {
    rows.push({ label: "Would make", value: line.fileName });
    rows.push({ label: "In folder", value: line.folder });
    rows.push({ label: "From library file", value: line.libraryFile });
  } else {
    rows.push({ label: "Would NOT import", value: line.reason });
    if (line.suggestedXwd) rows.push({ label: "Suggestion", value: suggestionFileFits(line.suggestedXwd, line.suggestedFile) ? `XWD${line.suggestedXwd} - ${line.suggestedFile}` : `XWD${line.suggestedXwd} - the library file that matches the listing title` });
  }
  const shipBy = shipByDay(line.shipBy);
  if (shipBy) rows.push({ label: "Ship by", value: shipBy });
  if (line.recordedState) rows.push({ label: "Already in the import list", value: STATE_WORDS[line.recordedState] ?? line.recordedState });
  return { ok: line.ok === true, headline: what, rows };
};

// Etsy's expected_ship_date (epoch s) as the day it falls on in this station's time zone, e.g. "Tue 27 Oct 2026";
// null for anything etsyShipByOf refuses. Built from the parts, so the punctuation does not depend on the ICU build.
export const shipByDay = (seconds) => {
  const value = etsyShipByOf(seconds);
  if (value === null) return null;
  const format = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const parts = Object.fromEntries(format.formatToParts(new Date(value * 1000)).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
};

export const previewDate = (iso) => day(iso);

// ---- "Import this order" (plan E5): the importer imports the order the dry run showed, once ------------------------

export const importOrderConfirm = (receiptId) =>
  `Import Etsy order ET${receiptId} now?\n\nIts lines go to the inbox like any Etsy order (or to the Etsy bar when they cannot be read). If this order was already printed by hand, it will be in the inbox twice. The import start date does not change.`;

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The IPC answer -> the notify() payload. busy and "did not run" are Warnings; a pass that stopped half way is an Error.
export const importOrderNotice = (res, receiptId) => {
  const title = `Etsy order ET${receiptId}`;
  if (!res?.success) return etsyResultNotice(res, { title: "Etsy order import" });
  if (res.busy) return { type: "Warning", title, message: "The Etsy import is running right now - try again in a moment." };
  if (!res.ran) return { type: "Warning", title, message: `Not imported: ${res.reason ?? "no reason given"}.` };
  const counts = [
    `${plural(res.imported ?? 0, "file")} imported`,
    res.needsReview ? `${plural(res.needsReview, "line")} in the Etsy bar` : null,
    res.failed ? `${plural(res.failed, "line")} failed` : null,
    res.skipped ? `${plural(res.skipped, "line")} already in the import list` : null,
  ]
    .filter(Boolean)
    .join(", ");
  if (res.reason) return { type: "Error", title, message: `Stopped: ${res.reason}. So far: ${counts}.` };
  return { type: res.failed || res.needsReview ? "Warning" : "Success", title, message: `${counts}.` };
};

// The import's pace beside Etsy's allowance (FILIP 2026-10-22: "how many requests a day may I make?"). A tick is
// one page of the order list (+1 per 100 open orders) and the orders fetched by number for a Retry, so a day
// costs between 1 and ETSY_TICK_MAX_REQUESTS requests a tick. limits: what Etsy reported on its last answer to this
// station (null when it has not answered yet).
export const etsyPaceLine = (minutes, limits) => {
  const ticks = Math.round((24 * 60) / minutes);
  const use = `Every ${minutes} min the import makes ${ticks.toLocaleString("en-GB")} to ${(ticks * ETSY_TICK_MAX_REQUESTS).toLocaleString("en-GB")} Etsy requests a day.`;
  if (!Number.isInteger(limits?.perDay)) return `${use} Etsy shows this app's daily limit on its answers - press Test connection to read it.`;
  const left = Number.isInteger(limits.remainingToday) ? ` (${limits.remainingToday.toLocaleString("en-GB")} left in the last 24 h)` : "";
  return `${use} Etsy allows this app ${limits.perDay.toLocaleString("en-GB")} a day${left}.`;
};
