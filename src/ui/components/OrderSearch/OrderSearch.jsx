import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuSearch } from "react-icons/lu";
import FileIcon from "../FileIcon/FileIcon";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { useStore } from "@/store/useStore";
import { MIN_QUERY_LENGTH, searchOrders } from "@/utils/orderSearch";
import { usePrintedSearch } from "@/hooks/usePrintedSearch";
import {
  ORDER_SEARCH_INPUT_ID,
  emptyState,
  flattenRows,
  moveActiveIndex,
  printedScanNote,
  rowKeyOf,
  sinceLabel,
  sinceTitle,
  whereColors,
  whereLabel,
} from "@/utils/orderSearchWindow";
import style from "./OrderSearch.module.css";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// The Ctrl+F window (plan C3-2): "where is order X right now?". Read-only - it shows rows from what the
// store already holds (Inbox, Held, every Production stage), then the PRINTED folders as they are listed in
// the background (usePrintedSearch: an order older than the Shipped retention is only there), and hands the
// chosen row to `onSelect`.
//
// FOCUS NEVER LEAVES THE INPUT. The rows are not focusable: the arrow keys move a highlight and the input
// points at it with aria-activedescendant. That is also what keeps the Production barcode scanner quiet
// while the window is open - its handler ignores keys typed into an INPUT - so a scan lands in the box.
const OrderSearch = ({ onClose, onSelect }) => {
  const files = useStore((s) => s.files);
  const heldIds = useStore((s) => s.heldIds);
  const heldReasons = useStore((s) => s.heldReasons);
  const productionStages = useStore((s) => s.productionStages);
  const stageHistory = useStore((s) => s.stageHistory);

  const [query, setQuery] = useState("");
  // The history sweep starts with the first query long enough to search and then runs to the end, whatever is
  // typed next (the listing does not depend on the query). Set from the input handler, never from an effect.
  const [historyArmed, setHistoryArmed] = useState(false);
  const printed = usePrintedSearch(historyArmed);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const pointerRef = useRef(null);
  const dropRef = useRef(null);
  const listId = useId();

  // Back to where the operator was (a local search field, a card) when the window closes.
  useEffect(() => {
    const before = document.activeElement;
    inputRef.current?.focus();
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, []);

  const result = useMemo(
    () =>
      searchOrders(query, {
        files,
        heldIds,
        heldReasons,
        productionStages,
        stageHistory,
        printedDays: printed.days,
      }),
    [query, files, heldIds, heldReasons, productionStages, stageHistory, printed.days],
  );
  const rows = useMemo(() => flattenRows(result), [result]);
  // The store moves under an open window (the polls): keep the highlight on a row that still exists.
  const active = rows.length === 0 ? -1 : Math.min(activeIndex, rows.length - 1);
  const activeRow = active >= 0 ? rows[active] : null;
  const optionId = (row) => `${listId}-${rowKeyOf(row).replace(/[^\w-]/g, "_")}`;

  // Arrow keys scroll the highlighted row into view.
  useEffect(() => {
    if (!activeRow) return;
    document.getElementById(optionId(activeRow))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionId is derived from listId + the row
  }, [activeRow?.fileId, activeRow?.where]);

  const now = new Date();
  const empty = emptyState(query, result, printed);
  const scanNote = printedScanNote(printed);
  // An empty box shows the search field alone (FILIP 2026-10-19 08:16): the placeholder already says what to type,
  // so no "Find an order" invitation and no key legend until the first character.
  const idle = query.trim() === "";

  // The block under the field unfolds from where it stood to its new height (FILIP 2026-10-19 08:25) whenever the
  // PHASE changes: nothing -> message ("Keep typing", 1-2 characters) -> list (3+) -> back. From nothing it also
  // fades in. Keystrokes inside one phase only swap the content, no motion. The panel's top edge is fixed, so it
  // grows downwards; clearProps hands the height back to the flex layout (the list still shrinks and scrolls).
  const phase = idle ? "idle" : empty ? "message" : "list";
  const naturalHeightRef = useRef(0);
  useGSAP(
    () => {
      const el = dropRef.current;
      if (!el) {
        naturalHeightRef.current = 0;
        return;
      }
      if (prefersReducedMotion()) return;
      // Mid-tween the inline height IS the height on screen; otherwise it is the last settled height.
      const tweening = gsap.isTweening(el);
      const from = tweening ? el.offsetHeight : naturalHeightRef.current;
      // A phase change in the middle of a fade-in carries on from the opacity on screen, no jump to 1.
      const fromOpacity = tweening ? Number(gsap.getProperty(el, "opacity")) : from === 0 ? 0 : 1;
      gsap.fromTo(
        el,
        { height: from, opacity: fromOpacity },
        {
          height: "auto",
          opacity: 1,
          duration: 0.28,
          ease: "power2.out",
          clearProps: "height,opacity",
          overwrite: true,
          onComplete: () => {
            naturalHeightRef.current = el.offsetHeight;
          },
        },
      );
    },
    { dependencies: [phase] },
  );
  // Remember the settled height of the block whenever its content or phase changed and it is not mid-animation
  // (not on every render: a mouse move only moves the highlight, and reading offsetHeight forces a layout).
  useEffect(() => {
    const el = dropRef.current;
    if (el && !gsap.isTweening(el)) naturalHeightRef.current = el.offsetHeight;
  }, [result, phase]);

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      // Functional: two keydowns in one tick (a held key, a fast hand) must both count.
      const count = rows.length;
      setActiveIndex((prev) => moveActiveIndex(Math.min(prev, count - 1), e.key, count));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (activeRow) onSelect(activeRow);
      return;
    }
    // One focusable thing in the window: Tab would walk out of it into the page behind.
    if (e.key === "Tab") e.preventDefault();
  };

  return createPortal(
    <>
      <div className={style.backdrop} onClick={onClose} />
      <div
        className={style.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Find an order"
        onMouseDown={(e) => {
          // A click on a row or the padding must not take the focus off the input.
          if (e.target !== inputRef.current) e.preventDefault();
        }}
      >
        <div className={`${style.search_row} ${idle ? style.search_row_alone : ""}`}>
          <LuSearch size={18} className={style.search_icon} aria-hidden="true" />
          <input
            ref={inputRef}
            id={ORDER_SEARCH_INPUT_ID}
            className={style.input}
            type="text"
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls={idle || empty ? undefined : listId}
            aria-autocomplete="list"
            aria-activedescendant={activeRow ? optionId(activeRow) : undefined}
            placeholder="Order number, customer or file name"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
              if (e.target.value.trim().length >= MIN_QUERY_LENGTH) setHistoryArmed(true);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>

        {idle ? null : (
          <div ref={dropRef} className={style.drop}>
            {empty ? (
              <div className={style.empty}>
                <p className={style.empty_title}>{empty.title}</p>
                <p className={style.empty_hint}>{empty.hint}</p>
              </div>
            ) : (
              <div id={listId} className={style.list} role="listbox" aria-label="Orders found">
                {result.groups.map((group) => (
                  <div key={group.orderKey} className={style.group} role="group" aria-label={group.orderId}>
                    <div className={style.group_header}>
                      <span className={`${style.order_id} ${group.isUnknown ? style.order_unknown : ""}`}>
                        {group.orderId}
                      </span>
                      {group.customerName && <span className={style.customer}>{group.customerName}</span>}
                      <span className={style.group_count}>
                        {group.rows.length} {group.rows.length === 1 ? "file" : "files"}
                      </span>
                    </div>
                    {group.rows.map((row) => {
                      const isActive = row === activeRow;
                      const colors = whereColors(row.where);
                      const since = sinceLabel(row.since, now);
                      return (
                        <div
                          key={rowKeyOf(row)}
                          id={optionId(row)}
                          role="option"
                          aria-selected={isActive}
                          className={`${style.row} ${isActive ? style.row_active : ""}`}
                          onMouseMove={(e) => {
                            // Chrome repeats a mousemove when the list moves under a still pointer (arrow
                            // keys scrolling it, a new result list): only a pointer that really moved counts.
                            const last = pointerRef.current;
                            pointerRef.current = { x: e.clientX, y: e.clientY };
                            if (last && last.x === e.clientX && last.y === e.clientY) return;
                            const at = rows.indexOf(row);
                            if (at !== active) setActiveIndex(at);
                          }}
                          onClick={() => onSelect(row)}
                        >
                          <span
                            className={style.where}
                            style={{
                              backgroundColor: colors.bg,
                              color: colors.color,
                            }}
                            title={row.reason ? `Held: ${row.reason}` : undefined}
                          >
                            {whereLabel(row.where)}
                          </span>
                          {/* One line like a Production card: the file name centred in a fixed-height row, its notes after it. The
                              batch folder and the printer are not shown (FILIP 2026-10-19 09:11): the "where" pill says enough. */}
                          <FileIcon fileName={row.fileName} size={17} className={style.file_icon} aria-hidden="true" />
                          <span className={style.file_name} title={row.fileName}>
                            {row.fileName}
                          </span>
                          <span className={style.row_meta}>
                            {row.reason && <span className={style.note}>{row.reason}</span>}
                            {row.alsoInProduction && (
                              <span className={style.note}>
                                also in Production: {whereLabel(row.alsoInProduction)}
                              </span>
                            )}
                            {row.alsoPrinted && (
                              <span className={style.note} title={sinceTitle(row.alsoPrinted.since)}>
                                also printed{row.alsoPrinted.since ? `: ${sinceLabel(row.alsoPrinted.since, now)}` : ""}
                              </span>
                            )}
                          </span>
                          {since && (
                            <span className={style.since} title={sinceTitle(row.since)}>
                              {since}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
                {result.hiddenRows > 0 && (
                  <p className={style.more}>{result.hiddenRows} more - type more of the name to narrow it down</p>
                )}
                {scanNote && (
                  <p className={style.more} role="status">
                    {scanNote}
                  </p>
                )}
              </div>
            )}

            <div className={style.footer}>
              <span className={style.key}>↑ ↓</span> move <span className={style.key}>Enter</span> show{" "}
              <span className={style.key}>Esc</span> close
            </div>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
};

export default OrderSearch;
