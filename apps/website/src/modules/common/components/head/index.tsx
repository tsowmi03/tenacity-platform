import NextHead from "next/head";
import React from "react";

type HeadProps = {
  title?: string;
  description?: string | null;
  image?: string;
  canonicalPath?: string;
  children?: React.ReactNode;
};

const Head: React.FC<HeadProps> = ({
  title,
  description,
  image,
  canonicalPath,
  children,
}) => {
  const defaultDescription =
    "Small-group Maths and English tutoring in Narwee for Years 5-10. Personal classes, clear feedback and confident learning.";
  const defaultImg = `/cropped-meta.jpg`;
  const metaTitle = title?.includes("Tenacity Tutoring")
    ? title
    : title
    ? `${title} | Tenacity Tutoring`
    : "Tenacity Tutoring | Determination Meets Success";
  const metaDescription = description || defaultDescription;

  return (
    <NextHead>
      <title>{metaTitle}</title>
      <meta property="og:type" content="website" />
      <meta property="og:title" content={metaTitle} />
      <meta itemProp="name" content={metaTitle} />
      <meta itemProp="description" content={metaDescription} />
      <meta name="description" content={metaDescription} />
      <meta property="og:description" content={metaDescription} />
      <meta itemProp="image" content={image || defaultImg} />
      <meta property="og:image" content={image || defaultImg} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:type" content="image/jpeg" />
      {canonicalPath && <link rel="canonical" href={canonicalPath} />}
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
