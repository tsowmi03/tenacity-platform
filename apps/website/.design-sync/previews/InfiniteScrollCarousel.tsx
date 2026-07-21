import React from "react";
import InfiniteScrollCarousel from "@modules/common/components/Infinite-scroll/index";

const BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#1c71af"/><path d="M50 24 L74 38 L50 52 L26 38 Z" fill="#eef5fb"/><path d="M34 44 V60 Q50 70 66 60 V44" fill="none" stroke="#eef5fb" stroke-width="4"/></svg>`;
const BADGE = `data:image/svg+xml,${encodeURIComponent(BADGE_SVG)}`;

const PROGRAMS = [
  { src: BADGE, title: "Maths Tutoring", subtitle: "Years 5-10" },
  { src: BADGE, title: "English Tutoring", subtitle: "Years 5-10" },
  { src: BADGE, title: "Selective School Prep", subtitle: "Year 6 entry" },
  { src: BADGE, title: "NAPLAN Prep", subtitle: "Years 5 & 7" },
  { src: BADGE, title: "OC Test Prep", subtitle: "Year 4 entry" },
  { src: BADGE, title: "HSC Coaching", subtitle: "Years 11-12" },
];

export function Default() {
  return <InfiniteScrollCarousel images={PROGRAMS} />;
}

export function FewItems() {
  return (
    <InfiniteScrollCarousel
      images={[
        { src: BADGE, title: "Maths Tutoring", subtitle: "Years 5-10" },
        { src: BADGE, title: "English Tutoring", subtitle: "Years 5-10" },
        { src: BADGE, title: "Small-group classes", subtitle: "Max 6 students" },
      ]}
    />
  );
}
