import Image from "next/image";
import React from "react";

interface HeroProps {
  title: string;
  imagePath: string;
  overlayOpacity?: number;
  backgroundColor?: string;
}

const Hero: React.FC<HeroProps> = ({
  title,
  imagePath,
  overlayOpacity,
  backgroundColor,
}) => {
  return (
    <div id="hero" className="h-[40vh] md:h-[60vh] w-full relative">
      <Image
        src={imagePath}
        loading="eager"
        priority={true}
        quality={90}
        alt="Photo by @thevoncomplex https://unsplash.com/@thevoncomplex"
        className="absolute inset-0"
        draggable="false"
        fill
        sizes="100vw"
        style={{
          objectFit: "cover",
        }}
      />
      <div
        className="overlay bg-primary absolute inset-0 z-10"
        style={{
          opacity: overlayOpacity ?? 0.6,
          backgroundColor: backgroundColor ?? "#00000",
        }}
      ></div>
      <div className="text-secondary absolute inset-0 z-10 flex flex-col justify-center items-center text-center small:text-left small:justify-end small:items-start small:p-32">
        <h1 className="text-3xl-semi drop-shadow-md shadow-black w-[80vw] mx-auto text-center md:text-[4rem] md:leading-[4rem] md:w-5/12 md:mb-6">
          {title}
        </h1>
      </div>
    </div>
  );
};

export default Hero;
