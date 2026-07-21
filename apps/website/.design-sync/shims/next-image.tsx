// Design-sync preview shim for `next/image` — Next's Image component reads
// process.env/router internals that don't exist in the bundled preview
// runtime. Renders a plain <img> with the same src/alt/fill/style contract
// the real components already use.
import React from "react";

type StaticSrc = { src: string } | string;

type ImageShimProps = {
  src: StaticSrc;
  alt: string;
  fill?: boolean;
  /** Legacy Next.js Image API (pre-v13) — still used by some components here. */
  layout?: "fill" | "fixed" | "intrinsic" | "responsive";
  objectFit?: React.CSSProperties["objectFit"];
  objectPosition?: React.CSSProperties["objectPosition"];
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
  className?: string;
  priority?: boolean;
  sizes?: string;
  quality?: number;
  unoptimized?: boolean;
  loading?: "eager" | "lazy";
  placeholder?: string;
  blurDataURL?: string;
} & Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src" | "width" | "height" | "style"
>;

export default function Image({
  src,
  alt,
  fill,
  layout,
  objectFit,
  objectPosition,
  style,
  width,
  height,
  priority,
  quality,
  unoptimized,
  sizes,
  placeholder,
  blurDataURL,
  loading,
  ...rest
}: ImageShimProps) {
  const resolvedSrc = typeof src === "string" ? src : src?.src ?? "";
  const fills = fill || layout === "fill";
  const resolvedStyle: React.CSSProperties = fills
    ? {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: objectFit ?? "cover",
        objectPosition,
        ...style,
      }
    : { objectFit, objectPosition, ...style };

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      style={resolvedStyle}
      width={fills ? undefined : width}
      height={fills ? undefined : height}
      loading={loading ?? (priority ? "eager" : "lazy")}
      {...rest}
    />
  );
}
