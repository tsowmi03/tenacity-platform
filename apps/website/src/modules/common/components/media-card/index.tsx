import React from "react";

interface MediaItem {
  title: string;
  description: string;
  link: string;
}

interface MediaCardProps {
  mediaItems: MediaItem[];
}

const MediaCard = ({ mediaItems }: MediaCardProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
      {mediaItems.map((item, index) => (
        <div
          key={index}
          className="media-card bg-neutral-light shadow-lg rounded-lg overflow-hidden flex flex-col"
        >
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col h-full"
          >
            <div className="p-4 flex-grow">
              <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
              <p className="text-gray-600 mb-4">{item.description}</p>
            </div>
            <div className="p-4 pt-0">
              <button className="text-primary font-bold underline">
                Read More
              </button>
            </div>
          </a>
        </div>
      ))}
    </div>
  );
};

export default MediaCard;
