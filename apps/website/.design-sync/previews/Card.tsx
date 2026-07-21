import React from "react";
import Card from "@modules/common/components/card/index";

const PROGRAM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="#1c71af"/><circle cx="150" cy="120" r="45" fill="#d6ebf7"/><rect x="80" y="190" width="140" height="16" rx="8" fill="#eef5fb"/><rect x="100" y="220" width="100" height="12" rx="6" fill="#eef5fb"/></svg>`;
const IMAGE = `data:image/svg+xml,${encodeURIComponent(PROGRAM_SVG)}`;

export function Default() {
  return <Card image={IMAGE} />;
}
