import React from "react";
import SideMenu from "@modules/common/components/side-menu/index";

// SideMenu renders with `-mt-24` (a -96px top margin) baked into its root
// element, intended to sit directly under a hero/banner that provides the
// negative space above it. In isolation that pulls the menu up above the
// story's top edge, so each story here wraps it in a spacer that restores
// the margin the component expects from its normal page context, and sits
// it next to a placeholder content column the way it's actually used
// (a sticky-ish side nav next to page copy).
const PAGE_COPY = [
  { heading: "Our approach", body: "Small-group Maths and English tutoring in Narwee for Years 5-10, with personal classes and clear feedback." },
  { heading: "Programs", body: "From foundational skills to HSC preparation, every student gets a plan matched to their level." },
  { heading: "Book a free trial", body: "Meet your tutor, see how a class runs, and get a plan for the term ahead." },
];

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ paddingTop: 120, display: "flex", gap: 24 }}>
      <div style={{ flex: 1, maxWidth: 480 }}>
        {PAGE_COPY.map((section) => (
          <div key={section.heading} style={{ marginBottom: 24 }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 600, color: "#1c2a3a" }}>
              {section.heading}
            </h3>
            <p style={{ margin: 0, fontSize: 14, color: "#4b5563", lineHeight: 1.5 }}>{section.body}</p>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

export function Default() {
  return (
    <PageShell>
      <SideMenu
        title="On this page"
        menuItems={[
          { text: "Our approach", sectionId: "approach" },
          { text: "Programs", sectionId: "programs" },
          { text: "Book a free trial", sectionId: "trial" },
        ]}
      />
    </PageShell>
  );
}

export function LongList() {
  return (
    <PageShell>
      <SideMenu
        title="Explore programs"
        menuItems={[
          { text: "Maths Years 5-6", sectionId: "maths-5-6" },
          { text: "Maths Years 7-10", sectionId: "maths-7-10" },
          { text: "English Years 5-6", sectionId: "english-5-6" },
          { text: "English Years 7-10", sectionId: "english-7-10" },
          { text: "HSC Preparation", sectionId: "hsc-prep" },
          { text: "Book a free trial", sectionId: "trial" },
        ]}
      />
    </PageShell>
  );
}
