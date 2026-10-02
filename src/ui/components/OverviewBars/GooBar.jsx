import { useEffect, useId, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { withLeaving } from "./withLeaving";
import style from "./OverviewBars.module.css";

gsap.registerPlugin(useGSAP);

// One bar of the overview: rounded segments side by side, widths proportional to `weight`, glued
// into one jelly by an SVG "gooey" filter (blur, then a hard threshold on the alpha channel).
//   segments: [{ key, weight, value, color, title, breakBefore? }]  (stable key, weight > 0)
// weight is the share of the bar; value is the segment's own counter (metres, files, alerts) - a
// segment PULSES only when its value grows. breakBefore widens the gap in front of a segment (the
// start of the next class): the blur reaches across the normal gap but not across the wide one.
//
// GSAP owns the layout of the segments (flex-grow, min-width, margin) so a change of data TWEENS
// instead of jumping; React only owns colour and title. The filter sits on the segment layer
// alone - the card's text and chips are outside it (the blur would smear them).
//
// No loop in the background: everything here runs once per change of data, then stops (production
// stations). prefers-reduced-motion gets the end state at once, the way RollingNumber does.
const SEGMENT_GAP = 4;
const CLASS_GAP = 8;
const MIN_WIDTH = 6;
const BLUR = 3;
const PULSE_SWELL_PX = 10;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// The segment swells and bounces back; both neighbours are pushed aside and return - under the
// filter the whole thing moves like one jelly. A newer pulse takes over from the running one.
const pulse = (target, neighbours) => {
  gsap.killTweensOf([target, ...neighbours.map((n) => n.el)], "x,scaleX,scaleY");
  // The swell is a few pixels wide whatever the width of the segment (12% of a full-width bar
  // would be tens of pixels), and a clear step taller.
  const swellX = 1 + Math.min(0.12, PULSE_SWELL_PX / Math.max(target.offsetWidth, 1));
  const timeline = gsap.timeline();
  timeline
    .to(target, { scaleX: swellX, scaleY: 1.35, duration: 0.14, ease: "power2.out" }, 0)
    .to(target, { scaleX: 1, scaleY: 1, duration: 0.9, ease: "elastic.out(1, 0.35)" }, 0.14);
  neighbours.forEach(({ el, direction }) => {
    timeline
      .to(el, { x: direction * 4, duration: 0.14, ease: "power2.out" }, 0)
      .to(el, { x: 0, duration: 0.9, ease: "elastic.out(1, 0.35)" }, 0.14);
  });
};

const GooBar = ({ segments, label }) => {
  const barRef = useRef(null);
  const previousRef = useRef(null); // key -> last value; null until the first run
  const leavingRef = useRef(new Set()); // keys whose shrink-out tween is already running
  const filterId = `goo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  // A remount (React StrictMode runs the effects twice in dev) starts the bar from scratch.
  useEffect(
    () => () => {
      previousRef.current = null;
      leavingRef.current.clear();
    },
    [],
  );

  // Adjusted during render, not in an effect (react-hooks/set-state-in-effect): a segment that
  // left is kept at weight 0 until its tween ends - unless the user asked for no motion.
  const [source, setSource] = useState(segments);
  const [rendered, setRendered] = useState(segments);
  if (source !== segments) {
    setSource(segments);
    setRendered(prefersReducedMotion() ? segments : withLeaving(rendered, segments));
  }

  useGSAP(
    () => {
      const root = barRef.current;
      if (!root) return;
      const reduced = prefersReducedMotion();
      const previous = previousRef.current;
      // 0 -> N after a start or a reload is the bar ENTERING, not "a new order arrived".
      const wasEmpty = previous === null || [...previous.values()].every((value) => value <= 0);
      const elements = new Map();
      root.querySelectorAll("[data-segment]").forEach((el) => elements.set(el.dataset.segment, el));

      const live = []; // elements of the segments that stay, in order
      const grown = []; // indexes into `live` whose counter went up
      rendered.forEach((segment) => {
        const el = elements.get(segment.key);
        if (!el) return;

        if (segment.leaving) {
          if (leavingRef.current.has(segment.key)) return;
          leavingRef.current.add(segment.key);
          gsap.to(el, {
            flexGrow: 0,
            minWidth: 0,
            marginLeft: 0,
            duration: 0.5,
            ease: "power2.in",
            overwrite: "auto",
            onComplete: () => {
              leavingRef.current.delete(segment.key);
              setRendered((current) => current.filter((s) => !(s.leaving && s.key === segment.key)));
            },
          });
          return;
        }
        leavingRef.current.delete(segment.key);

        const marginLeft = live.length === 0 ? 0 : segment.breakBefore ? CLASS_GAP : SEGMENT_GAP;
        const target = { flexGrow: segment.weight, minWidth: MIN_WIDTH, marginLeft };
        const before = previous?.get(segment.key);
        if (reduced) {
          gsap.set(el, target);
        } else if (before === undefined) {
          // First paint: grow in one after another. A newcomer on a bar that is already showing
          // something springs out instead.
          gsap.fromTo(
            el,
            { flexGrow: 0, minWidth: 0, marginLeft: 0 },
            {
              ...target,
              duration: wasEmpty ? 0.8 : 0.9,
              delay: wasEmpty ? live.length * 0.07 : 0,
              ease: wasEmpty ? "power3.out" : "elastic.out(1, 0.5)",
              overwrite: "auto",
            },
          );
        } else {
          gsap.to(el, { ...target, duration: 0.6, ease: "power3.out", overwrite: "auto" });
          if (before > 0 && segment.value > before) grown.push(live.length);
        }
        live.push(el);
      });

      if (!reduced) {
        grown.forEach((index) => {
          const neighbours = [
            { el: live[index - 1], direction: -1 },
            { el: live[index + 1], direction: 1 },
          ].filter((neighbour) => neighbour.el);
          pulse(live[index], neighbours);
        });
      }

      previousRef.current = new Map(rendered.map((segment) => [segment.key, segment.value]));
    },
    { dependencies: [rendered], scope: barRef },
  );

  const isEmpty = rendered.every((segment) => segment.leaving);

  return (
    <div ref={barRef} className={style.bar} role="img" aria-label={label}>
      <svg className={style.bar_filter} aria-hidden="true" focusable="false">
        <defs>
          <filter id={filterId} x="-10%" y="-100%" width="120%" height="300%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation={BLUR} result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" />
          </filter>
        </defs>
      </svg>
      {isEmpty && <span className={style.bar_empty} />}
      <div className={style.bar_layer} style={{ filter: `url(#${filterId})` }}>
        {rendered.map((segment) => (
          <span
            key={segment.key}
            data-segment={segment.key}
            className={style.bar_segment}
            style={{ background: segment.color }}
            title={segment.leaving ? undefined : segment.title}
          />
        ))}
      </div>
    </div>
  );
};

export default GooBar;
