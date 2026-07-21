"use client";

import { MobileMenuProvider } from "@lib/context/mobile-menu-context";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <MobileMenuProvider>{children}</MobileMenuProvider>;
}
