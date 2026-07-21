import React from "react";
import Action from "@modules/common/components/action/index";

const CLASSROOM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="700" viewBox="0 0 600 700"><rect width="600" height="700" fill="#1b3f71"/><rect x="80" y="120" width="440" height="280" rx="16" fill="#1c71af"/><circle cx="300" cy="260" r="60" fill="#d6ebf7"/><rect x="150" y="440" width="300" height="20" rx="10" fill="#5aa5e3"/><rect x="180" y="480" width="240" height="14" rx="7" fill="#5aa5e3"/></svg>`;
const IMAGE = `data:image/svg+xml,${encodeURIComponent(CLASSROOM_SVG)}`;

export function Default() {
  return (
    <Action
      titleText="Year 10 Mathematics Advanced"
      bodyText="Small-group HSC-pathway tuition with weekly classes and practice papers."
      footerText="6 weeks, twice weekly"
      hoverText="Book a free trial"
      imageSrc={IMAGE}
      redirectUrl="/programs/year-10-mathematics-advanced"
    />
  );
}
