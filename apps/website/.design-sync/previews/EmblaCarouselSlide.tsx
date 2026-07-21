import React from "react";
import EmblaCarouselSlide from "@modules/common/components/embla-carousel/index";

// The component's internal `.embla` / `.embla__container` / `.embla__slide`
// class names are only styled in src/styles/globals.css, which this sync's
// cssEntry intentionally excludes (see .design-sync/NOTES.md — it also
// contains unrelated internal engineering content). Without that layout CSS,
// the fill-positioned <img> shim (position:absolute) has no positioned
// ancestor and the flex slide track has no `display:flex`, so the carousel
// would render collapsed. Reproducing just the structural (non-brand) rules
// locally here, scoped to this preview file only — no shared config touched.
function EmblaStructuralCss() {
  return (
    <style>{`
      .embla { position: relative; overflow: hidden; width: 100%; height: 100%; }
      .embla__container { align-items: center; display: flex; height: 100%; }
      .embla__slide { position: relative; min-width: 100%; height: 100%; }
    `}</style>
  );
}

const MATHS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#1c71af"/><g stroke="#eef5fb" stroke-width="2" opacity="0.5"><line x1="0" y1="125" x2="800" y2="125"/><line x1="0" y1="250" x2="800" y2="250"/><line x1="0" y1="375" x2="800" y2="375"/><line x1="200" y1="0" x2="200" y2="500"/><line x1="400" y1="0" x2="400" y2="500"/><line x1="600" y1="0" x2="600" y2="500"/></g><circle cx="400" cy="250" r="70" fill="#d6ebf7"/><path d="M370 250h60M400 220v60" stroke="#1c71af" stroke-width="6" stroke-linecap="round"/></svg>`;
const ENGLISH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#eef5fb"/><rect x="260" y="140" width="280" height="220" rx="12" fill="#ffffff" stroke="#1c71af" stroke-width="3"/><line x1="290" y1="190" x2="510" y2="190" stroke="#1c71af" stroke-width="5" stroke-linecap="round"/><line x1="290" y1="230" x2="510" y2="230" stroke="#1c71af" stroke-width="5" stroke-linecap="round"/><line x1="290" y1="270" x2="450" y2="270" stroke="#1c71af" stroke-width="5" stroke-linecap="round"/></svg>`;
const GROUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#d6ebf7"/><circle cx="320" cy="220" r="55" fill="#1c71af"/><path d="M230 380c0-70 40-115 90-115s90 45 90 115" fill="#1c71af"/><circle cx="480" cy="240" r="45" fill="#145a8a"/><path d="M410 380c0-58 32-95 70-95s70 37 70 95" fill="#145a8a"/></svg>`;

const toDataUri = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

const TUTORING_PHOTOS = [
  toDataUri(MATHS_SVG),
  toDataUri(ENGLISH_SVG),
  toDataUri(GROUP_SVG),
];

export function Default() {
  return (
    <>
      <EmblaStructuralCss />
      <div className="relative w-full h-[360px] rounded-2xl overflow-hidden">
        <EmblaCarouselSlide
          srcList={TUTORING_PHOTOS}
          objectFit="cover"
          layout="fill"
          disableAutoPlay
        />
      </div>
    </>
  );
}

export function SingleImage() {
  return (
    <>
      <EmblaStructuralCss />
      <div className="relative w-full h-[360px] rounded-2xl overflow-hidden">
        <EmblaCarouselSlide
          srcList={[TUTORING_PHOTOS[0]]}
          objectFit="cover"
          layout="fill"
          disableAutoPlay
          loading="eager"
        />
      </div>
    </>
  );
}

export function ContainFit() {
  return (
    <>
      <EmblaStructuralCss />
      <div className="relative w-full h-[360px] rounded-2xl overflow-hidden bg-navy-dark">
        <EmblaCarouselSlide
          srcList={[TUTORING_PHOTOS[1], TUTORING_PHOTOS[2]]}
          objectFit="contain"
          layout="fill"
          disableAutoPlay
        />
      </div>
    </>
  );
}
