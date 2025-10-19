import "@styles/globals.css";
// import FooterCTA from "@modules/layout/footer-cta";
import FooterNav from "@modules/layout/footer-nav";
import Nav from "@modules/layout/nav";
import Providers from "@modules/providers";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Providers>
      <link
        rel="preload"
        href="/fonts/Massilia-Medium.woff2"
        as="font"
        type="font/woff2"
      />

      <Nav />
      <Component {...pageProps} />
      {/* <FooterCTA />
      <FooterNav /> */}
      <FooterNav />
    </Providers>
  );
}
