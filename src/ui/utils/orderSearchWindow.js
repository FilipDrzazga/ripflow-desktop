// The logic of the Ctrl+F order search WINDOW (plan C3-2), kept out of the component so it can be
// tested without a renderer: the shortcut, "may it open now", keyboard movement, the row labels.
// The matching itself lives in orderSearch.js.

import { STAGE_COLOR, STAGE_LABEL } from "../../shared/constants";
import { MIN_QUERY_LENGTH, ORDER_SEARCH_WHERE } from "./orderSearch";

// The id of the window's input: App.jsx focuses and selects it on a second Ctrl+F.
export const ORDER_SEARCH_INPUT_ID = "order-search-input";

// Ctrl+F (Cmd+F). Matched on the key AND the physical key, so a non-Latin keyboard layout still opens it.
// Shift / Alt combinations are somebody else's shortcuts.
export const isOrderSearchShortcut = (e) => {
  if (!e || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false;
  return String(e.key).toLowerCase() === "f" || e.code === "KeyF";
};

// One mechanism for "something is already in front of the app": every modal carries aria-modal="true"
// (orderSearchModalWiring.test.js pins that for each modal in the sources), so the window needs no list
// of modals. The first-run wizard has the attribute too; `showSetup` is checked as well because the
// wizard can be mounted a frame before its markup is in the document.
export const orderSearchBlockedBy = ({ isLoading, showSetup, doc }) => {
  if (isLoading) return "startup";
  if (showSetup) return "setup";
  if (doc?.querySelector?.('[aria-modal="true"]')) return "modal";
  return null;
};

// Arrow keys move the highlighted row and wrap around; anything else leaves it. -1 (no rows) stays -1.
export const moveActiveIndex = (current, key, count) => {
  if (count <= 0) return -1;
  if (key === "ArrowDown") return current < 0 ? 0 : (current + 1) % count;
  if (key === "ArrowUp") return current <= 0 ? count - 1 : current - 1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return Math.min(Math.max(current, 0), count - 1);
};

// Rows in the order they are shown (group by group), each with the id the highlight and
// aria-activedescendant use. Unique: a file stem is one row (orderSearch.js), Inbox ids are folder_job.
export const rowKeyOf = (row) => `${row.where}|${row.fileId}`;
export const flattenRows = (result) => result.groups.flatMap((g) => g.rows);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const startOfDay = (d) => {
  const copy = new Date(d.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "since" as a person says it: 12 min ago, 3 h ago, Yesterday, 4 days ago, then the date. `now` is a
// parameter (the window passes its own clock) so the function is pure. null for a missing/bad time.
export const sinceLabel = (iso, now) => {
  const at = typeof iso === "string" ? new Date(iso) : iso;
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return null;
  const diff = now.getTime() - at.getTime();
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  const dayGap = Math.round((startOfDay(now) - startOfDay(at)) / (24 * HOUR));
  if (dayGap <= 0) return `${Math.floor(diff / HOUR)} h ago`;
  if (dayGap === 1) return "Yesterday";
  if (dayGap < 7) return `${dayGap} days ago`;
  return `${String(at.getDate()).padStart(2, "0")} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`;
};

// The exact local time for the tooltip: "18 Oct 2026, 11:32".
export const sinceTitle = (iso) => {
  const at = typeof iso === "string" ? new Date(iso) : iso;
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return "";
  const hh = String(at.getHours()).padStart(2, "0");
  const mm = String(at.getMinutes()).padStart(2, "0");
  return `${String(at.getDate()).padStart(2, "0")} ${MONTHS[at.getMonth()]} ${at.getFullYear()}, ${hh}:${mm}`;
};

const WHERE_LABEL = {
  [ORDER_SEARCH_WHERE.INBOX]: "Inbox",
  [ORDER_SEARCH_WHERE.HELD]: "Held",
};
const WHERE_COLOR = {
  [ORDER_SEARCH_WHERE.INBOX]: { bg: "#e0f2fe", color: "#075985" },
  [ORDER_SEARCH_WHERE.HELD]: { bg: "#ffe7e5", color: "#b42318" },
};
const FALLBACK_COLOR = { bg: "#f0f0f0", color: "#616161" };

export const whereLabel = (where) => WHERE_LABEL[where] ?? STAGE_LABEL[where] ?? String(where);
export const whereColors = (where) => WHERE_COLOR[where] ?? STAGE_COLOR[where] ?? FALLBACK_COLOR;

// What the window says instead of a list. `result` is searchOrders' answer; an empty box and a query
// below the minimum read differently from "looked, found nothing".
export const emptyState = (query, result) => {
  if (String(query ?? "").trim() === "") {
    return { title: "Find an order", hint: "Type an order number, a customer or part of a file name." };
  }
  if (result.status === "short") {
    return { title: "Keep typing", hint: `At least ${MIN_QUERY_LENGTH} characters, so a letter or two does not match half the shop.` };
  }
  if (result.totalRows === 0) {
    return {
      title: "Not found in Inbox, Held or Production",
      hint: "Orders shipped long ago are cleared from Production - look in Batch history.",
    };
  }
  return null;
};
