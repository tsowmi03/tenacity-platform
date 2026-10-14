import "@styles/globals.css";
import "@styles/claude-design.css";
import { initAnalytics } from "@lib/analytics";
import Providers from "@modules/providers";
import type { AppProps } from "next/app";

// Before the first render, not in a useEffect: React runs a page's effects
// before the app's, so pages that track on mount (registration step 1, a
// referral link landing) would otherwise fire before PostHog exists.
if (typeof window !== "undefined") initAnalytics();

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Providers>
      <Component {...pageProps} />
    </Providers>
  );
}
