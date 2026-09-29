import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import style from "./RollingNumber.module.css";

gsap.registerPlugin(useGSAP);

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// How far the number swells on a change: from SWELL_MIN at small values up to SWELL_MAX at
// `swellFullAt` and above - the bigger the value, the harder it "puffs up" before it bounces
// back to its size.
const SWELL_MIN = 0.06;
const SWELL_MAX = 0.4;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// A number whose digits roll like an odometer to the new value, then swells and bounces back.
// Each digit is a column holding 0-9 that slides by yPercent; columns are keyed from the RIGHT,
// so the units keep their element (and roll) when the number grows a digit on the left.
const RollingNumber = ({ value, decimals = 2, swellFullAt = 50, className = "" }) => {
  const rootRef = useRef(null);
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const text = safe.toFixed(decimals);
  const chars = text.split("");

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      const strips = root.querySelectorAll("[data-digit]");

      if (prefersReducedMotion()) {
        strips.forEach((strip) => gsap.set(strip, { yPercent: -10 * Number(strip.dataset.digit) }));
        gsap.set(root, { scale: 1 });
        return;
      }

      strips.forEach((strip) => {
        gsap.to(strip, {
          yPercent: -10 * Number(strip.dataset.digit),
          duration: 0.7,
          ease: "power3.out",
          overwrite: true,
        });
      });

      // A new change interrupts the swell of the previous one instead of stacking on it.
      gsap.killTweensOf(root);
      if (safe <= 0) {
        gsap.to(root, { scale: 1, duration: 0.2 });
        return;
      }
      const peak = 1 + SWELL_MIN + (SWELL_MAX - SWELL_MIN) * Math.min(safe / swellFullAt, 1);
      gsap
        .timeline()
        .to(root, { scale: peak, duration: 0.14, ease: "power2.out" })
        .to(root, { scale: 1, duration: 0.75, ease: "bounce.out" });
    },
    { dependencies: [text], scope: rootRef },
  );

  return (
    <span ref={rootRef} className={`${style.root} ${className}`} role="img" aria-label={text}>
      {chars.map((ch, i) => {
        const key = chars.length - i;
        if (ch < "0" || ch > "9") {
          return (
            <span key={key} className={style.symbol} aria-hidden="true">
              {ch}
            </span>
          );
        }
        return (
          <span key={key} className={style.column} aria-hidden="true">
            <span className={style.strip} data-digit={ch}>
              {DIGITS.map((d) => (
                <span key={d} className={style.digit}>
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
};

export default RollingNumber;
