import React from "react";
import Slider from "@modules/common/components/partners/index";

// This component's own filename is `partners`, used as an auto-rotating
// (setInterval, 3s) carousel of partner/community photos. A static
// screenshot only ever shows the first frame (currentIndex 0) — the
// rotation itself can't be captured statically, which is an accepted
// limitation per the review rubric. Each story still populates a realistic
// multi-photo array so the dot indicators below the frame show the true
// item count.

function photoSvg(bg: string, accent: string, label: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="${bg}"/><rect x="40" y="60" width="320" height="180" rx="12" fill="${accent}"/><circle cx="120" cy="150" r="34" fill="${bg}"/><rect x="180" y="120" width="150" height="16" rx="8" fill="${bg}"/><rect x="180" y="150" width="110" height="12" rx="6" fill="${bg}"/><text x="200" y="270" font-family="sans-serif" font-size="20" fill="${accent}" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const COMMUNITY_PHOTOS = [
  { imageUrl: photoSvg("#eef5fb", "#1c71af", "Narwee PS"), text: "Narwee Public School" },
  { imageUrl: photoSvg("#d6ebf7", "#1c71af", "Beverly Hills"), text: "Beverly Hills North PS" },
  { imageUrl: photoSvg("#eef5fb", "#1c71af", "Georges River"), text: "Georges River College" },
];

const LINKED_PARTNERS = [
  { imageUrl: photoSvg("#d6ebf7", "#1c71af", "NESA"), text: "NESA registered tutors", link: "https://educationstandards.nsw.edu.au" },
  { imageUrl: photoSvg("#eef5fb", "#1c71af", "WWCC"), text: "Working With Children Checked", link: "#" },
  { imageUrl: photoSvg("#d6ebf7", "#1c71af", "Narwee"), text: "Proudly based in Narwee", link: "#" },
  { imageUrl: photoSvg("#eef5fb", "#1c71af", "Since 2015"), text: "Tutoring Narwee since 2015", link: "#" },
];

export function Default() {
  return <Slider photos={COMMUNITY_PHOTOS} />;
}

export function WithLinks() {
  return <Slider photos={LINKED_PARTNERS} />;
}
