import "@styles/globals.css";
import "@styles/claude-design.css";
import Providers from "@modules/providers";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Providers>
      <Component {...pageProps} />
    </Providers>
  );
}
