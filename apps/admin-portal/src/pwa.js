// Service worker registration.
//
// The virtual module is imported dynamically so that importing this file from
// a component never drags vite-plugin-pwa's virtual module into the test
// environment — only registerServiceWorker(), which main.jsx alone calls,
// touches it.

let updateSW = null;
const listeners = new Set();

/** Notified when a new build is waiting. Returns an unsubscribe. */
export function onNeedRefresh(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Activates the waiting worker and reloads. No-op if nothing is waiting. */
export function applyUpdate() {
  if (updateSW) updateSW(true);
}

export async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const { registerSW } = await import("virtual:pwa-register");
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        for (const listener of listeners) listener();
      },
    });
  } catch (error) {
    // A failed registration must never take the app down with it.
    console.warn("Service worker registration failed", error);
  }
}
