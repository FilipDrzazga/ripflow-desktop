import { ETSY_LISTING_PRINT_TYPES } from "../../shared/constants";

// Settings > Etsy > "Remembered choices" (plan FAB): the fabric and the print type a person chose in the Inbox bar for an
// Etsy listing. Pure texts and rules of that list; the view only renders them.

// What names the listing: the title Etsy gave a line of it, else its number.
export const choiceTitle = (row) => (typeof row?.title === "string" && row.title.trim() !== "" ? row.title.trim() : `Listing ${row?.listingId}`);

// The label of a remembered print type code; a code nobody can choose now is shown as it is stored.
export const printTypeLabel = (code) => (Object.hasOwn(ETSY_LISTING_PRINT_TYPES, code) ? ETSY_LISTING_PRINT_TYPES[code] : String(code));

export const FORGET_KIND = Object.freeze({ FABRIC: "fabric", PRINT_TYPE: "printType" });

const kindWord = (kind) => (kind === FORGET_KIND.FABRIC ? "fabric" : "product type");

const valueOf = (row, kind) => (kind === FORGET_KIND.FABRIC ? row?.fabric : printTypeLabel(row?.printType));

export const forgetConfirmMessage = (row, kind) =>
  `Forget the ${kindWord(kind)} "${valueOf(row, kind)}" remembered for "${choiceTitle(row)}"?\n\n` +
  `Its next order will stop in the Inbox bar again until a ${kindWord(kind)} is chosen (or the order line names one itself).`;

const failure = (res, fallbackTitle) => {
  const error = res?.error ?? res?.errors?.[0];
  return {
    type: error?.type === "Warning" ? "Warning" : "Error",
    title: error?.title || fallbackTitle,
    message: error?.message || "No answer from RipFlow's main process.",
  };
};

// The notice after a forget: an error, a warning when there was nothing left to forget (another station was first), or
// a success.
export const forgetNotice = (res, row, kind) => {
  if (!res?.success) return failure(res, "Forgetting the Etsy choice failed");
  if (!res.deleted) {
    return { type: "Warning", title: "Etsy choice", message: `The ${kindWord(kind)} of "${choiceTitle(row)}" was already forgotten - the list is reloaded.` };
  }
  return { type: "Success", title: "Etsy choice forgotten", message: `The ${kindWord(kind)} of "${choiceTitle(row)}" is no longer remembered.` };
};

// The answer of the list -> the rows to show, or null when it could not be read (the view then says so, it never shows
// an empty list for that). A row with neither choice cannot exist; one that arrives anyway is dropped.
export const choiceRows = (res) => {
  if (!res?.success || !Array.isArray(res.data)) return null;
  return res.data.filter((row) => row && typeof row.listingId === "string" && (row.fabric || row.printType));
};

export const choicesLoadError = (res) => failure(res, "Reading the remembered Etsy choices failed");

// The code main answers with while features.etsy is Off (etsyImportRequests.js guard). Not a failure: the list has nothing to show
// for a shop that does not use the import, so the view renders nothing instead of a red error.
export const ETSY_DISABLED_CODE = "ETSY_DISABLED";

export const choicesSwitchedOff = (res) => res?.success === false && res.error?.code === ETSY_DISABLED_CODE;
