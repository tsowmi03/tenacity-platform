import { absoluteUrl } from "@lib/site";
import { organisationSchema } from "@lib/structuredData";
import type { StructuredData } from "@lib/structuredData";
import NextHead from "next/head";
import { useRouter } from "next/router";
import React from "react";

type HeadProps = {
  title?: string;
  description?: string | null;
  image?: string;
  /** Overrides the canonical path, which is otherwise the page's own path. */
  canonicalPath?: string;
  /** Keeps the page out of search results: no canonical, no structured data. */
  noindex?: boolean;
  /** Page-specific schema.org data, added to the business data. */
  structuredData?: StructuredData[];
  children?: React.ReactNode;
};

const Head: React.FC<HeadProps> = ({
  title,
  description,
  image,
  canonicalPath,
  noindex = false,
  structuredData = [],
  children,
}) => {
  const router = useRouter();
  const defaultDescription =
    "Small-group Maths and English tutoring in Narwee from Year 5 to the HSC, with Year 11 classes starting in 2027. Personal classes, clear feedback and confident learning.";
  const defaultImg = `/cropped-meta.jpg`;
  const metaTitle = title?.includes("Tenacity Tutoring")
    ? title
    : title
    ? `${title} | Tenacity Tutoring`
    : "Tenacity Tutoring | Determination Meets Success";
  const metaDescription = description || defaultDescription;
  // The path without its query or hash, so a referral or prefill link shares
  // the canonical address of the page it opens.
  const path = canonicalPath ?? (router.asPath.split(/[?#]/)[0] || "/");
  const canonicalUrl = absoluteUrl(path);
  const imageUrl = absoluteUrl(image || defaultImg);
  const schemas = noindex ? [] : [organisationSchema(), ...structuredData];

  return (
    <NextHead>
      <title>{metaTitle}</title>
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Tenacity Tutoring" />
      <meta property="og:locale" content="en_AU" />
      <meta property="og:title" content={metaTitle} />
      <meta itemProp="name" content={metaTitle} />
      <meta itemProp="description" content={metaDescription} />
      <meta name="description" content={metaDescription} />
      <meta property="og:description" content={metaDescription} />
      <meta itemProp="image" content={imageUrl} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:type" content="image/jpeg" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:image" content={imageUrl} />
      {noindex ? (
        <meta name="robots" content="noindex,nofollow" />
      ) : (
        <>
          <link rel="canonical" href={canonicalUrl} />
          <meta property="og:url" content={canonicalUrl} />
        </>
      )}
      {process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? (
        <meta
          name="google-site-verification"
          content={process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION}
        />
      ) : null}
      {process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? (
        <meta
          name="msvalidate.01"
          content={process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION}
        />
      ) : null}
      {schemas.map((schema, index) => (
        <script
          key={`structured-data-${index}`}
          type="application/ld+json"
          // "<" is escaped so no text can close the script element early.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
          }}
        />
      ))}
      <link
        rel="apple-touch-icon"
        sizes="180x180"
        href="/apple-touch-icon.png"
      />
      <link
        rel="icon"
        type="image/png"
        sizes="32x32"
        href="/favicon-32x32.png"
      />
      <link
        rel="icon"
        type="image/png"
        sizes="16x16"
        href="/favicon-16x16.png"
      />
      {children}
    </NextHead>
  );
};

export default Head;
