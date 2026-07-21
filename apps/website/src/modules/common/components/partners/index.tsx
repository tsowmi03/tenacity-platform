import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

interface SliderProps {
  photos: { imageUrl: string; text?: string; link?: string }[];
}

const Slider: React.FC<SliderProps> = ({ photos }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % photos.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [photos.length]);

  const handleDotClick = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <div className="relative">
      <div className="w-full mx-auto overflow-hidden relative shadow-xl rounded-lg sm:w-96">
        <div className="image-container relative">
          {photos.map((photo, index) => (
            <div
              key={index}
              className={`image flex justify-center items-end ${
                index === currentIndex ? "active" : ""
              }`}
              style={{
                transform: `translateX(-${currentIndex * 100}%)`,
                transition: "transform 2s ease",
                minWidth: "100%",
              }}
            >
              <Image
                src={photo.imageUrl}
                alt={`Slide ${index}`}
                layout="fill"
                objectFit="cover"
              />
              {photo.link ? (
                <Link
                  rel="noopener noreferrer"
                  target="_blank"
                  href={photo.link}
                  className="text-neutral-light relative z-10 min-w-28 text-center w-fit bg-gray-500 bg-opacity-60 mb-3 px-3 py-0.5 underline cursor-pointer"
                >
                  {photo.text}
                </Link>
              ) : (
                photo.text && (
                  <div className="text-neutral-light relative z-10 min-w-28 text-center w-fit bg-gray-500 bg-opacity-60 mb-3 px-3 py-0.5">
                    {photo.text}
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="dots-container flex justify-center mt-4">
        {photos.map((_, index) => (
          <button
            key={index}
            onClick={() => handleDotClick(index)}
            className={`dot ${index === currentIndex ? "active" : ""}`}
          ></button>
        ))}
      </div>
      <style jsx>{`
        .image-container {
          width: 100%;
          height: 15rem;
          overflow: hidden;
          position: relative;
          display: flex;
        }

        .image {
          width: 100%;
          height: 100%;
          flex-shrink: 0;
        }

        .image.active {
          opacity: 1;
        }

        .dots-container {
          display: flex;
          justify-content: center;
          margin-top: 1rem;
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background-color: #ccc;
          margin: 0 5px;
          cursor: pointer;
          transition: background-color 0.3s ease;
        }

        .dot.active {
          background-color: #2bb673e3;
        }
      `}</style>
    </div>
  );
};

export default Slider;
