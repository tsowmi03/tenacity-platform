import React from "react";
import Hero from "@modules/common/components/pages-hero/index";

const HERO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#1c71af"/><circle cx="1300" cy="180" r="220" fill="#eef5fb" opacity="0.18"/><rect x="0" y="600" width="1600" height="300" fill="#d6ebf7" opacity="0.15"/><path d="M500 520 L800 380 L1100 520 L1100 700 L800 620 L500 700 Z" fill="#eef5fb" opacity="0.3"/></svg>`;
const HERO_IMG = `data:image/svg+xml,${encodeURIComponent(HERO_SVG)}`;

export function Default() {
  return (
    <Hero
      title="Small-group Maths and English tutoring in Narwee for Years 5-10"
      imagePath={HERO_IMG}
    />
  );
}

export function LightOverlay() {
  return (
    <Hero
      title="Book a free trial lesson today"
      imagePath={HERO_IMG}
      overlayOpacity={0.25}
      backgroundColor="#1c71af"
    />
  );
}

export function DarkOverlay() {
  return (
    <Hero
      title="Confident learners. Real results."
      imagePath={HERO_IMG}
      overlayOpacity={0.8}
      backgroundColor="#000000"
    />
  );
}
