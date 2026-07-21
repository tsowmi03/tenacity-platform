import React, { useState, useEffect } from "react";
import Image from "next/image";

interface SectionProps {
  id: string;
  imagePath: string;
  text: string;
  side: "left" | "right";
  title: string;
}

const Section: React.FC<SectionProps> = ({
  id,
  imagePath,
  text,
  side,
  title,
}) => {
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [scrolledSection, setScrolledSection] = useState<string | null>(null);
  const [imageWidth, setImageWidth] = useState<string>("35rem");

  useEffect(() => {
    const handleScroll = () => {
      const sections = document.querySelectorAll(".section");
      sections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        if (rect.top < windowHeight / 2 && rect.bottom > windowHeight / 2) {
          setScrolledSection(section.id);
        }
      });
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 640) {
        setImageWidth("90vw");
      } else {
        setImageWidth("35rem");
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleHover = (id: string) => {
    setHoveredSection(id);
  };

  return (
    <>
      <hr className="mx-[15%] w-[70%] mb-8" />
      <h3 className="mb-16 text-gray-600 text-base-regular text-center">
        {title}
      </h3>{" "}
      <div
        id={id}
        className="flex flex-col md:flex-row items-center section"
        onMouseEnter={() => handleHover(id)}
        onMouseLeave={() => setHoveredSection(null)}
      >
        <div
          className={`w-full md:w-1/2 ${
            side === "right" ? "md:order-2 md:ml-4" : "md:mr-4"
          } relative rounded-lg overflow-hidden ${
            (hoveredSection === id && window.innerWidth > 640) ||
            (scrolledSection === id && window.innerWidth <= 640)
              ? ""
              : "grayscale"
          }`}
          style={{
            width: imageWidth,
            height: "25rem",
            boxShadow: "0 0.5rem 2rem rgba(0, 0, 0, 0.5)",
            marginBottom: "3rem",
          }}
        >
          <Image
            src={imagePath}
            alt="Section Image"
            layout="fill"
            objectFit="cover"
          />
        </div>
        <div
          className={`w-full md:w-1/2 text-center md:text-${side} mt-2 md:mt-0 md:pl-4`}
        >
          <p className="mb-1">{text}</p>
        </div>
        <style jsx>{`
          .grayscale {
            filter: grayscale(100%);
          }
        `}</style>
      </div>
    </>
  );
};

export default Section;
