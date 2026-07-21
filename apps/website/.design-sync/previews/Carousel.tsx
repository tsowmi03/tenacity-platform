import React from "react";
import Carousel from "@modules/common/components/carousel/index";

// The component's root <div> has no positioning/sizing of its own — it
// expects a parent to size it. Wrapping it here the way it's actually used
// (a sized container), matching the pattern already established for
// EmblaCarouselSlide.
function photoSvg(bg: string, accent: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="${bg}"/><circle cx="130" cy="140" r="50" fill="${accent}"/><rect x="210" y="110" width="150" height="16" rx="8" fill="${accent}"/><rect x="210" y="140" width="110" height="12" rx="6" fill="${accent}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const IMAGES = [
  photoSvg("#eef5fb", "#1c71af"),
  photoSvg("#d6ebf7", "#145a8a"),
  photoSvg("#eef5fb", "#5aa5e3"),
];

export function Default() {
  return (
    <div className="relative w-full h-[320px] rounded-lg overflow-hidden">
      <Carousel images={IMAGES} />
    </div>
  );
}
