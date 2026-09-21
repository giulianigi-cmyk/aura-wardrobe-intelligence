import { useEffect, useState } from "react";

/** Guards against the mobile Safari "click-through" quirk: on touch
 *  devices the real click lands a beat after the physical touch, so a
 *  sheet whose backdrop mounts at the tapped position can be closed by
 *  the very gesture that opened it. While `open` is true this returns
 *  false for a short window on touch devices (backdrop clicks ignored),
 *  and true immediately on desktop pointers where the quirk doesn't
 *  exist. Resets to false as soon as the sheet closes. */
export function useSheetCanClose(open: boolean): boolean {
  const [canClose, setCanClose] = useState(false);

  useEffect(() => {
    if (!open) {
      setCanClose(false);
      return;
    }
    const isTouch =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window);
    if (!isTouch) {
      setCanClose(true);
      return;
    }
    setCanClose(false);
    const t = window.setTimeout(() => setCanClose(true), 400);
    return () => window.clearTimeout(t);
  }, [open]);

  return canClose;
}
