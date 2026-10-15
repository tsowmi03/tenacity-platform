import "@styles/globals.css";
import "@styles/claude-design.css";
import { initAnalytics, syncRegistrationRecording } from "@lib/analytics";
import Providers from "@modules/providers";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import { useEffect } from "react";

// Before the first render, not in a useEffect: React runs a page's effects
// before the app's, so pages that track on mount (registration step 1, a
// referral link landing) would otherwise fire before PostHog exists.
if (typeof window !== "undefined") initAnalytics();

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  // Session replay covers registration only: stop it when the visitor moves
  // on to another page within the site.
  useEffect(() => {
    const onRouteChange = (url: string) =>
      syncRegistrationRecording(new URL(url, window.location.origin).pathname);
    router.events.on("routeChangeComplete", onRouteChange);
    return () => router.events.off("routeChangeComplete", onRouteChange);
  }, [router.events]);

  return (
    <Providers>
      <Component {...pageProps} />
    </Providers>
  );
}
