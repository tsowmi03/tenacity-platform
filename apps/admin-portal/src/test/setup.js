import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom ships no matchMedia. useMediaQuery (and therefore every screen that
// renders a Table or the AppShell) needs one. Defaults to the desktop branch;
// tests that want the mobile branch call setMatchMediaMatches(true).
let matchMediaMatches = false;

export function setMatchMediaMatches(matches) {
  matchMediaMatches = matches;
}

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: matchMediaMatches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  matchMediaMatches = false;
});
