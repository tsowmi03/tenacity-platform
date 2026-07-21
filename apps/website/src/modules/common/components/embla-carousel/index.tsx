import { useEffect } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Image from "next/image";
import Autoplay, { AutoplayOptionsType } from "embla-carousel-autoplay";
import Fade from "embla-carousel-fade";

function EmblaCarouselSlide({
  srcList,
  disableAutoPlay,
  objectFit,
  imageIndex, // Optional prop to control the image index
  disableManualSwitching,
  unoptimized = false,
  height,
  width,
  layout,
  loading,
}: {
  srcList: string[];
  disableAutoPlay?: boolean;
  imageIndex?: number;
  objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  disableManualSwitching?: boolean;
  unoptimized?: boolean;
  height?: number;
  width?: number;
  layout?: "fill" | "fixed" | "intrinsic" | "responsive";
  loading?: "lazy" | "eager" | "eagerFirst";
}) {
  const autoplayOptions: AutoplayOptionsType = { delay: 5000 }; // Customize this value
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, watchDrag: !disableManualSwitching },
    disableAutoPlay ? [Fade()] : [Autoplay(autoplayOptions), Fade()]
  );

  useEffect(() => {
    if (emblaApi && typeof imageIndex === "number") {
      emblaApi.scrollTo(imageIndex); // Switch to the specified image index
    }
  }, [emblaApi, imageIndex]);

  return (
    <div className="embla" ref={emblaRef}>
      <div className="embla__container">
        {srcList.map((src, index) => (
          <div className="embla__slide" key={index}>
            <Image
              src={src}
              unoptimized={unoptimized}
              alt={`Slide ${index + 1}`}
              loading={
                loading === "eagerFirst"
                  ? index === 0
                    ? "eager"
                    : "lazy"
                  : loading
              }
              width={width}
              height={height}
              layout={layout || "fill"} // Ensures the image fills the container
              objectFit={objectFit} // Adjusts how the image is displayed
              priority={
                loading === "eagerFirst" ? (index === 0 ? true : false) : false
              } // Prioritize the first image for faster loading
              className="rounded-2xl"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default EmblaCarouselSlide;
