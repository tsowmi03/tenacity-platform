// Design-sync preview shim for `next/link` — no Next.js router exists in the
// bundled preview runtime, so this renders a plain anchor with the same
// href/children contract the real components already use.
import React from "react";

type LinkShimProps = {
  href: string | { pathname?: string };
  children?: React.ReactNode;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

export default function Link({
  href,
  children,
  prefetch,
  replace,
  scroll,
  shallow,
  passHref,
  legacyBehavior,
  ...rest
}: LinkShimProps) {
  const resolvedHref = typeof href === "string" ? href : href?.pathname ?? "#";
  return (
    <a href={resolvedHref} {...rest}>
      {children}
    </a>
  );
}
