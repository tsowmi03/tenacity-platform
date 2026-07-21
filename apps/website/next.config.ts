import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  productionBrowserSourceMaps: true, // Enables source maps in production
  images: {
    domains: ["images.unsplash.com", "randomuser.me"],
    // unoptimized: true,
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
    ];
  },
};

export default nextConfig;
