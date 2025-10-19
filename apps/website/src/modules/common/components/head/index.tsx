import NextHead from "next/head";
import React from "react";

type HeadProps = {
  title?: string;
  description?: string | null;
  image?: string;
  children?: React.ReactNode;
};

const Head: React.FC<HeadProps> = ({ title, description, image, children }) => {
  const defaultDescription =
    "Welcome to Tenacity Tutoring! Providing expert tutoring in Maths, English, and Programming for students from Years 5–12. Unlock your child's potential with our tailored learning approach.";
  const defaultImg = `/cropped-meta.jpg`;

  return (
    <NextHead>
      <title>
        {title
          ? `${title} | Tenacity Tutoring`
          : "Tenacity Tutoring | Determination Meets Success"}
      </title>
      <meta property="og:type" content="website" />
      <meta
        property="og:title"
        content={
          title
            ? `${title} | Tenacity Tutoring`
            : "Tenacity Tutoring | Determination Meets Success"
        }
      />
      <meta
        itemProp="name"
        content={
          title
            ? `${title} | Tenacity Tutoring`
            : "Tenacity Tutoring | Determination Meets Success"
        }
      />
      <meta
        itemProp="description"
        content={description || defaultDescription}
      />
      <meta name="description" content={description || defaultDescription} />
      <meta
        property="og:description"
        content={description || defaultDescription}
      />
      <meta itemProp="image" content={image || defaultImg} />
      <meta property="og:image" content={image || defaultImg} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:type" content="image/jpeg" />
      <meta
        property="og:title"
        content="Tenacity Tutoring: Inspiring Students to Achieve with Expert Tutoring"
      />
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
