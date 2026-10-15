// Responsiveness probe: numbers, not eyes. `probeOverflow` runs INSIDE the page (page.evaluate inlines
// fn.toString(), so it must stay self-contained - no imports, no outer variables).
//
//   pageScrollX / pageScrollY  how far the PAGE scrolls (scrollWidth - clientWidth, same for height). Anything
//                              above 0 is a bug at every size: the app is a fixed-viewport shell.
//   outside                    visible elements that, AFTER clipping by their ancestors, still stick out of the
//                              window. Clipping = every ancestor with overflow other than `visible` on that axis
//                              (a scroll container, an overflow:hidden clip) cuts the element's box to its own box,
//                              so scrolled-away list rows and clipped digit strips do not count, while a scroll
//                              container that itself sticks out of the window does. position:fixed ignores
//                              ancestors, position:absolute only those from its containing block up.
//   cut                        a CONTROL (button, link, input, select, role=button/tab/menuitem) or a scroll container that an
//                              overflow:hidden/clip ancestor cuts off - less than 90% of its box is visible. Those
//                              ancestors hide content silently (no scrollbar), so a control cut by one is
//                              unreachable: the bottom of a navigation bar on a short window, for example.
//                              A control inside a scroll container is judged against the container, not the window
//                              (a scrolled-away row is normal).
//   outsideCount               outside + cut; `outside` keeps the first 12 as a readable label ("CUT" prefix).
export const probeOverflow = () => {
  const doc = document.documentElement;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const label = (el) => {
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean)[0] : "";
    const text = (el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 24);
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${text ? ` "${text}"` : ""}`;
  };
  // The part of the element's box that can actually be seen; null when clipped away entirely.
  const visibleBox = (el, st) => {
    const r = el.getBoundingClientRect();
    let { left, top, right, bottom } = r;
    if (st.position !== "fixed") {
      let reached = st.position !== "absolute";
      for (let p = el.parentElement; p && p !== document.body && p !== doc; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (!reached && ps.position !== "static") reached = true;
        if (!reached) continue;
        const clipX = ps.overflowX !== "visible";
        const clipY = ps.overflowY !== "visible";
        if (!clipX && !clipY) continue;
        const pr = p.getBoundingClientRect();
        if (clipX) {
          left = Math.max(left, pr.left);
          right = Math.min(right, pr.right);
        }
        if (clipY) {
          top = Math.max(top, pr.top);
          bottom = Math.min(bottom, pr.bottom);
        }
        if (right <= left || bottom <= top) return null;
      }
    }
    return { left, top, right, bottom };
  };
  const CONTROL = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="menuitem"]';
  const scrolls = (st) => ["auto", "scroll"].includes(st.overflowX) || ["auto", "scroll"].includes(st.overflowY);
  // Share of the element's box left after overflow:hidden/clip ancestors. The walk stops at the first scroll
  // container: what lies beyond its edge is reached by scrolling, and the container itself is checked as a
  // candidate (a region cut off from the window is the same bug as a control cut off).
  const shownShare = (el, st) => {
    const r = el.getBoundingClientRect();
    if (st.position === "fixed") return 1;
    let { left, top, right, bottom } = r;
    let reached = st.position !== "absolute";
    for (let p = el.parentElement; p && p !== document.body && p !== doc; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (scrolls(ps)) break;
      if (!reached && ps.position !== "static") reached = true;
      if (!reached) continue;
      const hides = (o) => o === "hidden" || o === "clip";
      if (!hides(ps.overflowX) && !hides(ps.overflowY)) continue;
      const pr = p.getBoundingClientRect();
      if (hides(ps.overflowX)) {
        left = Math.max(left, pr.left);
        right = Math.min(right, pr.right);
      }
      if (hides(ps.overflowY)) {
        top = Math.max(top, pr.top);
        bottom = Math.min(bottom, pr.bottom);
      }
    }
    const shown = Math.max(0, right - left) * Math.max(0, bottom - top);
    return shown / (r.width * r.height);
  };
  const outside = [];
  let count = 0;
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none" || st.opacity === "0") continue;
    if ((el.matches(CONTROL) || scrolls(st)) && shownShare(el, st) < 0.9) {
      count++;
      if (outside.length < 12) outside.push(`CUT ${label(el)} [${Math.round(r.left)},${Math.round(r.top)} -> ${Math.round(r.right)},${Math.round(r.bottom)}]`);
      continue;
    }
    const box = visibleBox(el, st);
    if (!box) continue;
    if (!(box.right > vw + 1 || box.left < -1 || box.bottom > vh + 1 || box.top < -1)) continue;
    count++;
    if (outside.length < 12) {
      outside.push(`${label(el)} [${Math.round(box.left)},${Math.round(box.top)} -> ${Math.round(box.right)},${Math.round(box.bottom)}]`);
    }
  }
  return {
    viewport: `${vw}x${vh}`,
    pageScrollX: Math.max(0, doc.scrollWidth - doc.clientWidth, document.body.scrollWidth - document.body.clientWidth),
    pageScrollY: Math.max(0, doc.scrollHeight - doc.clientHeight, document.body.scrollHeight - document.body.clientHeight),
    outsideCount: count,
    outside,
  };
};
