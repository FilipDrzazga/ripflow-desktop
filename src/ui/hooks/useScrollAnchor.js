import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

// Below this many pixels a "restore" did not really move anything, so it is not
// worth reporting to the caller.
const MIN_REPORT_DELTA = 8;

// Keeps the operator's place in a scrolling list across filter changes.
//
// The problem it solves: when a filter narrows the list, the content shrinks,
// the browser clamps scrollTop to the new scrollHeight and the original value
// is gone. Clearing the filter grows the content back but scrollTop stays
// clamped — usually at 0 — so the list jumps to the top and the operator has
// to find where they were. An empty result is the worst case: the whole list is
// replaced by a short empty-state, which guarantees scrollTop 0.
//
// The fix is an anchor rather than a remembered scrollTop, because the pixel
// offset is meaningless once the content height has changed. We remember WHICH
// row was at the top of the viewport and how far into it we were, then put that
// row back in the same place.
//
// containerRef — the scrolling element.
// filterKey    — any string describing the current filter. A CHANGE to it means
//                "restore now"; while it is stable the anchor keeps updating.
// onRestore    — optional, called with the file id the view was pulled back to,
//                so the caller can flash it. Only fires when the scroll actually
//                moved (see MIN_REPORT_DELTA) and only for a card anchor, never
//                for the day-level fallback.
export const useScrollAnchor = (containerRef, filterKey, onRestore) => {
  // { fileId, dayKey, offset } — offset is the row's top edge relative to the
  // container's, so a partially scrolled row is restored partially scrolled.
  const anchorRef = useRef(null);
  const prevKeyRef = useRef(filterKey);
  const isRestoringRef = useRef(false);
  const rafRef = useRef(0);
  // Kept in a ref so a caller passing an inline arrow does not have to be
  // memoised and cannot go stale. Refreshed inside the layout effect below, not
  // during render — assigning a ref while rendering is a React-hooks violation.
  const onRestoreRef = useRef(onRestore);

  const capture = useCallback(() => {
    const el = containerRef.current;
    // Never record while we are the ones scrolling — the programmatic scroll
    // fires scroll events mid-restore and would race with the value being used.
    if (!el || isRestoringRef.current) return;
    const containerTop = el.getBoundingClientRect().top;
    for (const card of el.querySelectorAll("[data-file-id]")) {
      const rect = card.getBoundingClientRect();
      if (rect.bottom <= containerTop) continue; // scrolled past, keep looking
      anchorRef.current = {
        fileId: card.getAttribute("data-file-id"),
        dayKey: card.closest("[data-day-key]")?.getAttribute("data-day-key") ?? null,
        offset: rect.top - containerTop,
      };
      return;
    }
    // No card in the DOM at all — an empty filter result, or every day
    // collapsed. Deliberately KEEP the previous anchor: this is exactly the
    // case where it is about to be needed (filter with no matches -> clear).
  }, [containerRef]);

  const restore = useCallback(() => {
    const el = containerRef.current;
    const anchor = anchorRef.current;
    if (!el || !anchor) return;

    let target = anchor.fileId ? el.querySelector(`[data-file-id="${CSS.escape(anchor.fileId)}"]`) : null;
    const onCard = target !== null;
    // Fallback one level out: the anchored file may not exist under the new
    // filter (another stage tab) or may be inside a collapsed day.
    if (!target && anchor.dayKey) {
      target = el.querySelector(`[data-day-key="${CSS.escape(anchor.dayKey)}"]`);
    }
    // Nothing to anchor to — leave the view alone rather than jumping blind.
    if (!target) return;

    isRestoringRef.current = true;
    const delta = target.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.offset;
    el.scrollTop += delta;
    requestAnimationFrame(() => {
      isRestoringRef.current = false;
    });

    // Report only a restore that actually moved the view. When the anchored row
    // was already sitting where it belongs there is nothing to point the eye
    // at, and flashing it on every filter keystroke would be noise.
    if (onCard && Math.abs(delta) >= MIN_REPORT_DELTA) onRestoreRef.current?.(anchor.fileId);
  }, [containerRef]);

  // Runs after EVERY commit, on purpose: restore on the commit where the filter
  // changed, otherwise keep the anchor fresh. Because the restore reads the
  // anchor recorded under the PREVIOUS filter, one rule produces both wanted
  // behaviours — applying a filter tries to hold the same row in view, and
  // clearing it returns to the row the operator was just working on.
  //
  // useLayoutEffect, not requestAnimationFrame: rAF would let the browser paint
  // one frame at the wrong offset, which reads as a visible jump.
  useLayoutEffect(() => {
    onRestoreRef.current = onRestore;
    if (filterKey !== prevKeyRef.current) {
      prevKeyRef.current = filterKey;
      restore();
    } else {
      capture();
    }
  });

  // Scrolling does not re-render, so the commit above cannot be the only place
  // the anchor is refreshed.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (rafRef.current) return; // one capture per frame at most
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        capture();
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, capture]);
};
