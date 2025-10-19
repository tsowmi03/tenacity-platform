import { useState, useEffect } from "react";
import Image from "next/image";

type Photo = {
  src: string;
  title: string;
  description: string;
};

type MembersProps = {
  photos: Photo[];
};

const Members: React.FC<MembersProps> = ({ photos }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) =>
        prevIndex === photos.length - 1 ? 0 : prevIndex + 1
      );
    }, 4000);

    return () => clearInterval(interval);
  }, [photos.length]);

  const prevIndex = (currentIndex - 1 + photos.length) % photos.length;
  const nextIndex = (currentIndex + 1) % photos.length;

  return (
    <div className="relative mt-16">
      <div className="w-3/4 border-t border-gray-300 mb-4 mx-auto"></div>
      <h2 className="text-center text-gray-600 text-2xl-semi mb-4">Team</h2>
      <div className="flex flex-col md:flex-row justify-center items-center md:space-x-8 overflow-hidden">
        <div className="flex flex-col items-center">
          <div className="w-64 h-64 relative mb-4 rounded-full overflow-hidden">
            <Image
              src={photos[prevIndex].src}
              alt={photos[prevIndex].title}
              layout="fill"
              objectFit="cover"
              className="rounded-full"
            />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold">{photos[prevIndex].title}</h3>
            <p className="text-sm text-gray-600">
              {photos[prevIndex].description}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-64 h-64 relative mb-4 rounded-full overflow-hidden">
            <Image
              src={photos[currentIndex].src}
              alt={photos[currentIndex].title}
              layout="fill"
              objectFit="cover"
              className="rounded-full"
            />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold">
              {photos[currentIndex].title}
            </h3>
            <p className="text-sm text-gray-600">
              {photos[currentIndex].description}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-64 h-64 relative mb-4 rounded-full overflow-hidden">
            <Image
              src={photos[nextIndex].src}
              alt={photos[nextIndex].title}
              layout="fill"
              objectFit="cover"
              className="rounded-full"
            />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold">{photos[nextIndex].title}</h3>
            <p className="text-sm text-gray-600">
              {photos[nextIndex].description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Members;
