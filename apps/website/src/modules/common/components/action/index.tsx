import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";

interface ActionProps {
  titleText: string;
  bodyText: string;
  footerText: string;
  hoverText: string;
  imageSrc: string;
  redirectUrl: string;
}

const Action: React.FC<ActionProps> = ({
  titleText,
  bodyText,
  footerText,
  hoverText,
  imageSrc,
  redirectUrl,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleOnClick = () => {
    window.location.href = redirectUrl;
  };

  const handleHover = (hovered: boolean) => {
    setIsHovered(hovered);
  };

  const handleScroll = () => {
    if (isSmallScreen) {
      const container = containerRef.current;
      if (container) {
        const scrollPosition = container.getBoundingClientRect().top;
        const isElementVisible = scrollPosition < window.innerHeight / 3;
        setIsHovered(isElementVisible);
      }
    }
  };

  useEffect(() => {
    const updateScreenSize = () => {
      setIsSmallScreen(window.innerWidth < 768);
    };

    updateScreenSize();
    window.addEventListener("resize", updateScreenSize);

    return () => {
      window.removeEventListener("resize", updateScreenSize);
    };
  }, []);

  useEffect(() => {
    if (isSmallScreen) {
      window.addEventListener("scroll", handleScroll);
    }

    return () => {
      if (isSmallScreen) {
        window.removeEventListener("scroll", handleScroll);
      }
    };
  }, [isSmallScreen, handleScroll]);

  return (
    <div
      ref={containerRef}
      className={`relative max-w-md overflow-hidden cursor-pointer ${
        isHovered ? "sm:hover:effect-applied" : ""
      }`}
      style={{
        width: "22rem",
        height: isSmallScreen ? "20rem" : "25rem",
        boxShadow: "0 0.2rem 1rem rgba(0, 0, 0, 0.7)",
        transition: "transform 0.5s ease-in-out",
        transform: isHovered ? "translateY(-5px)" : "translateY(0)",
      }}
      onMouseEnter={() => handleHover(true)}
      onMouseLeave={() => handleHover(false)}
      onClick={handleOnClick}
    >
      <div className="overlay bg-black opacity-30 absolute inset-0 z-10"></div>
      <Image
        src={imageSrc}
        alt="Card Image"
        layout="fill"
        objectFit="cover"
        className={`w-full h-auto transition-filter duration-300 ${
          isHovered ? "filter brightness-50" : "filter brightness-75"
        }`}
      />
      <div
        className={`relative text-left p-8 text-neutral-light text-xl-semi transition-all duration-1000 z-20`}
        style={{
          textShadow: "1px 1px rgba(0,0,0,.7)",
          transform: isHovered
            ? "translateY(-100%) translateX(0%)"
            : "translateY(0) translateX(0)",
          opacity: isHovered ? 0 : 1,
        }}
      >
        {titleText}
        <div className="text-large-regular py-2 leading-8">{bodyText}</div>
      </div>
      <div
        className={`absolute top-1/2 left-1/2 transform -translate-x-1/2  -translate-y-1/2 text-center text-neutral-light text-3xl-semi opacity-${
          isHovered ? 100 : 0
        } transition-opacity duration-1000 z-20`}
      >
        {isHovered && hoverText}
      </div>

      <div
        className="absolute bottom-0 right-0 p-8  text-center text-neutral-light  text-large-regular z-20 transition-all duration-1000"
        style={{
          textShadow: "1px 1px rgba(0,0,0,.7)",
          transform: isHovered
            ? "translateY(100%) translateX(0%)"
            : "translateY(0) translateX(0)",
        }}
      >
        {footerText}
      </div>
    </div>
  );
};

export default Action;
