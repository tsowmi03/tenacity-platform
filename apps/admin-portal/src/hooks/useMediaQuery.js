import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query from JS.
 *
 * The portal is a client-only SPA, so there is no server snapshot to reconcile
 * against — the first render already knows the real viewport. Environments
 * without matchMedia (jsdom without a stub) report false rather than throwing.
 */
export default function useMediaQuery(query) {
  const subscribe = useCallback(
    (onStoreChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);

      // Safari below 14 only has the deprecated add/removeListener pair.
      if (list.addEventListener) {
        list.addEventListener("change", onStoreChange);
        return () => list.removeEventListener("change", onStoreChange);
      }
      list.addListener(onStoreChange);
      return () => list.removeListener(onStoreChange);
    },
    [query]
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** The single breakpoint the layout switches on, shared with app.css. */
export const MOBILE_QUERY = "(max-width: 760px)";

export function useIsMobile() {
  return useMediaQuery(MOBILE_QUERY);
}
