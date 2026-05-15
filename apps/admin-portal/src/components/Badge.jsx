import React from "react";

export default function Badge({ children, tone = "neutral", dot = false, outline = false }) {
  const className = outline ? "badge badge-outline" : `badge badge-${tone}`;
  return (
    <span className={className}>
      {dot ? <span className="dot-glyph" /> : null}
      {children}
    </span>
  );
}
