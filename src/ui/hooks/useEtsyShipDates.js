import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store/useStore";
import { usePollingPaused, useOnPollingResume } from "./usePollingPaused";
import { isFeatureEnabled } from "../utils/featureVisibility";
import { getEtsyShipDates } from "../services/etsyImportService";
import { ETSY_SHIP_DATES_POLL_MS, shipDateReceiptIds } from "../utils/etsyShipBadge";

const NONE = Object.freeze({});

// The ONE hook behind the "Ship by" badge of Inbox and Production (plan ETA-2): the order numbers on screen in, the
// answer { [receiptId]: { shipBy: epoch s | null, buyerNote: text | null } } out (the "Ship by" badge and the buyer's-note
// bubble read the same answer - plan MSG-2, no second ask). Asks main (only the digits cross, never the table) when the set of Etsy
// numbers changes and then on a slow poll that stands while the polls stand (usePollingPaused / useOnPollingResume).
// features.etsy off, a profile that could not be read or a failed answer: nothing - a badge is information, so it
// fails closed by being absent, and the last good answer stays until a better one arrives (no flicker between asks).
export const useEtsyShipDates = (orderIds) => {
  const shopProfile = useStore((s) => s.shopProfile);
  const enabled = isFeatureEnabled("etsy", shopProfile);
  const pollingPaused = usePollingPaused();
  const key = shipDateReceiptIds(orderIds).join(",");
  const [dates, setDates] = useState(NONE);
  const aliveRef = useRef(true);
  const keyRef = useRef(key);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  // Takes the list it asks about, so the callback itself never changes (the bar's `load` is the same shape).
  const load = useCallback(async (askedKey) => {
    if (askedKey === "") return;
    try {
      const res = await getEtsyShipDates(askedKey.split(","));
      // An answer to an older list is dropped: the effect for the new list asks by itself.
      if (!aliveRef.current || keyRef.current !== askedKey || !res?.success || !res.data) return;
      setDates(res.data);
    } catch (err) {
      console.error("[useEtsyShipDates] ship dates failed:", err);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    // Deferred, like the other effects that start a read: no setState in the effect body (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => load(key), 0);
    return () => clearTimeout(timer);
  }, [enabled, key, load]);

  useEffect(() => {
    if (!enabled || pollingPaused || !key) return undefined;
    const id = setInterval(() => load(key), ETSY_SHIP_DATES_POLL_MS);
    return () => clearInterval(id);
  }, [enabled, pollingPaused, key, load]);

  useOnPollingResume(() => {
    if (enabled) load(key);
  });

  return enabled ? dates : NONE;
};
