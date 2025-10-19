import InfiniteScrollCarousel from "@modules/common/components/Infinite-scroll";
import React from "react";

function SchoolSystems() {
  return (
    <div className="w-full justify-center text-navy justify-items-center px-6 md:px-16">
      <div className="text-center text-2xl lg:text-4xl font-bold text-navy mb-16">
        Guiding Learners from
        <br /> Primary school to HSC!
      </div>
      <div className="w-full relative overflow-x-clip mt-16 justify-center justify-items-center">
        {/* Infinite Scroll Carousel */}
        <div className="w-full md:w-full justify-center overflow-x-clip relative self-center">
          <InfiniteScrollCarousel
            images={[
              {
                src: "/icons/primary.svg",
                title: "Primary",
                subtitle: "(Years 5-6)",
              },
              {
                src: "/icons/high-school.svg",
                title: "High School",
                subtitle: "(Years 7-10)",
              },
              {
                src: "/icons/senior-high.svg",
                title: "Maths Standard ",
                subtitle: "(Year 11-12)",
              },
              {
                src: "/icons/senior-high-advanced.svg",
                title: "Maths Advanced",
                subtitle: "(Year 11-12)",
              },
              {
                src: "/icons/senior-high-extension.svg",
                title: "Maths Extension",
                subtitle: "(Year 11-12)",
              },
            ]}
          />
          <div className="absolute bottom-0 top-0 left-0 w-1/4 h-full bg-gradient-to-r from-neutral-light to-transparent pointer-events-none z-10"></div>
          <div className="absolute bottom-0 top-0 right-0 w-1/4 h-full bg-gradient-to-l from-neutral-light to-transparent pointer-events-none z-10"></div>
        </div>
      </div>
    </div>
  );
}

export default SchoolSystems;
