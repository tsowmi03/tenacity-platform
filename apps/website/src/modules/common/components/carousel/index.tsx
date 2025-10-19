import { useState, useEffect } from "react";
import Image from "next/image";
interface CarouselProps {
  images: string[];
}

const Carousel: React.FC<CarouselProps> = ({ images }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, [currentIndex, images.length]);
  //  grayscale hover:grayscale-0
  return (
    <div>
      <Image
        className="transition-all duration-300 rounded-lg"
        src={images[currentIndex]}
        alt={`slide-${currentIndex}`}
        layout="fill"
        objectFit="cover"
        style={{
          objectFit: "cover",
        }}
      />
    </div>
  );
};

export default Carousel;
