import React from "react";
import Section from "@modules/common/components/section/index";

const SECTION_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="500" viewBox="0 0 700 500"><rect width="700" height="500" fill="#eef5fb"/><rect x="80" y="90" width="540" height="320" rx="16" fill="#d6ebf7"/><rect x="140" y="150" width="420" height="24" rx="4" fill="#1c71af"/><rect x="140" y="200" width="420" height="24" rx="4" fill="#1c71af"/><rect x="140" y="250" width="260" height="24" rx="4" fill="#1c71af"/></svg>`;
const SECTION_IMG = `data:image/svg+xml,${encodeURIComponent(SECTION_SVG)}`;

export function Left() {
  return (
    <Section
      id="approach"
      side="left"
      title="Our approach"
      text="Small classes of no more than six students mean every child gets real feedback, not just a worksheet."
      imagePath={SECTION_IMG}
    />
  );
}

export function Right() {
  return (
    <Section
      id="results"
      side="right"
      title="Real results"
      text="Our Year 10 students lift an average of one full grade within two terms of starting small-group classes."
      imagePath={SECTION_IMG}
    />
  );
}

export function LongText() {
  return (
    <Section
      id="programs"
      side="left"
      title="Programs for every year level"
      text="From Year 5 NAPLAN preparation through to Year 10 exam revision, our Maths and English programs are built around the NSW syllabus, with weekly homework review and regular progress reports for parents."
      imagePath={SECTION_IMG}
    />
  );
}
