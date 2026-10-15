import { useEffect, useRef } from "react";
import { useStore } from "../store/useStore";
import { pollsStand, pollsResumed } from "../utils/pollingGate";

// The ONE reader of "do the periodic polls stand right now" (B2a): power pause OR hidden window,
// computed in the selector so a component can never read just one of the two. Every poll's effect
// takes this and starts no interval while it is true - a NEW poll must do the same.
export const usePollingPaused = () => useStore((state) => pollsStand(state));

// Runs `callback` once on the edge stopped -> running (the window came back, or the pause ended
// while the window is visible): one tick at once instead of waiting a full interval. Not on mount.
export const useOnPollingResume = (callback) => {
  const stopped = usePollingPaused();
  const wasStoppedRef = useRef(stopped);
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });
  useEffect(() => {
    if (pollsResumed(wasStoppedRef.current, stopped)) callbackRef.current();
    wasStoppedRef.current = stopped;
  }, [stopped]);
};
