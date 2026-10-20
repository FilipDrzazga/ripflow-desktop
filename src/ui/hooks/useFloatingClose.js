import { useEffect, useRef } from "react";
import { CLOSE_FLOATING_EVENT } from "../utils/floatingLayers";

// Calls onClose when closeFloatingLayers() is asked for (Ctrl+F opening the order search, D59). `active` = false while the
// layer is closed: nothing is subscribed then. onClose may change on every render - the latest one is called.
export const useFloatingClose = (onClose, active = true) => {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    if (!active) return undefined;
    const handler = () => onCloseRef.current();
    window.addEventListener(CLOSE_FLOATING_EVENT, handler);
    return () => window.removeEventListener(CLOSE_FLOATING_EVENT, handler);
  }, [active]);
};
