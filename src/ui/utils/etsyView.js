// What Settings -> Etsy says (plan E2). Pure, so it can carry tests without rendering.

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
    if (line.suggestedXwd) rows.push({ label: "Suggestion", value: `XWD${line.suggestedXwd} - the library file that matches the listing title` });
  }
  if (line.recordedState) rows.push({ label: "Already in the import list", value: STATE_WORDS[line.recordedState] ?? line.recordedState });
  return { ok: line.ok === true, headline: what, rows };
};

export const previewDate = (iso) => day(iso);
