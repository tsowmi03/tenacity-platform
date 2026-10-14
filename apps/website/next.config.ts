import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  productionBrowserSourceMaps: true, // Enables source maps in production
  images: {
    domains: ["images.unsplash.com", "randomuser.me"],
    // unoptimized: true,
  },
  // PostHog US Cloud through our own domain, so ad blockers don't drop
  // analytics (WEB-8). See docs/analytics.md.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/array/:path*",
        destination: "https://us-assets.i.posthog.com/array/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/meet-our-team",
        destination: "/about#team",
        permanent: true, // Set to `false` for temporary redirect (307)
      },
      {
        source: "/about-us",
        destination: "/about",
        permanent: true, // Set to `false` for temporary redirect (307)
      },
      {
        source: "/faqs",
        destination: "/#faq",
        permanent: true, // Set to `false` for temporary redirect (307)
      },
      {
        source: "/enrol-now",
        destination: "/",
        permanent: true, // Set to `false` for temporary redirect (307)
      },
      {
        source: "/payment",
        destination: "/register",
        permanent: true, // Set to `false` for temporary redirect (307)
      },
      {
        source: "/modules",
        destination: "/programs",
        permanent: true,
      },
      // The T&Cs were a PDF until WEB-9; old links and emails still point at it.
      {
        source: "/T&Cs.pdf",
        destination: "/terms",
        permanent: true,
      },
      {
        source: "/T%26Cs.pdf",
        destination: "/terms",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
