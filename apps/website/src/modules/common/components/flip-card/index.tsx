import { useOutsideClick } from "@lib/hooks/use-click-outside";
import { useEffect, useRef, useState } from "react";
import "tailwindcss/tailwind.css";

type FlipCardProps = {
  frontContent: React.ReactNode;
  backContent: React.ReactNode;
  isFlipped?: boolean;
  onClick?: () => void;
  index: number;
  colorIndex: number;
};

const FlipCard: React.FC<FlipCardProps> = ({
  frontContent,
  backContent,
  isFlipped,
  onClick,
  index,
  colorIndex,
}) => {
  const [isFlippedState, setIsFlippedState] = useState(false);

  useEffect(() => {
    if (isFlipped !== undefined) {
      setIsFlippedState(isFlipped);
    }
  }, [isFlipped]);

  const ref = useRef(null);
  useOutsideClick(ref, () => {
    setIsFlippedState(false);
  });

  const colorArray = [
    "bg-primary-light", // Sky Blue
    "bg-accent-mint", // Mint Green
    "bg-primary-dark", // Royal Blue
    "bg-accent-lavender", // Lavender
    "bg-primary", // Light Navy
    "bg-accent-coral", // Coral
    "bg-navy-dark", // Deep Navy
    "bg-neutral-light", // Soft Gray
    "bg-neutral-dark", // Charcoal
    "bg-accent-yellow", // Golden Yellow
  ];

  const getCardColor = (index: number) => {
    return colorArray[index % colorArray.length];
  };

  const getTranslationfromIndex = (index: number) => {
    switch (index % 4) {
      case 0:
        return "md:translate-x-[165%] translate-x-[52%]";
      case 1:
        return "md:translate-x-1/2 -translate-x-[50%]";
      case 2:
        return "md:-translate-x-1/2 translate-x-[52%]";
      case 3:
        return "md:-translate-x-[165%] -translate-x-[50%]";
      default:
        return "md:translate-x-1/2 ";
    }
  };

  return (
    <div
      className={`relative w-[47%] md:w-[23.5%] h-[15rem] md:h-[17rem] perspective cursor-pointer transition-all ease-in-out duration-500 ${
        isFlippedState
          ? "fixed top-1/2 left-0  -translate-y-1/3 scale-[220%] md:scale-150 z-20 " +
            getTranslationfromIndex(index)
          : ""
      }`}
      ref={ref}
      onClick={(event) => {
        setIsFlippedState(!isFlippedState);
        onClick?.();
        //scroll to center of the card
        const card = event.currentTarget;
        const rect = card.getBoundingClientRect();
        const scrollLeft =
          window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop =
          window.pageYOffset || document.documentElement.scrollTop;

        window.scrollTo({
          top:
            rect.top + scrollTop - ((window.innerHeight - rect.height) * 2) / 3,
          left:
            rect.left + scrollLeft - ((window.innerWidth - rect.width) * 2) / 3,
          behavior: "smooth",
        });
      }}
    >
      <div
        className={`relative w-full h-full transition-transform duration-500 transform-style-preserve-3d ${
          isFlippedState ? "rotate-y-180" : ""
        }`}
        style={{
          transform: isFlippedState ? "rotateY(180deg)" : "rotateY(0deg)",
          transformStyle: "preserve-3d",
        }}
      >
        {/* Front Side */}
        <div
          className={
            "absolute w-full h-full flex items-center justify-center rounded-3xl shadow-xl " +
            getCardColor(colorIndex)
          }
          style={{ backfaceVisibility: "hidden", transform: "rotateY(0deg)" }}
        >
          {frontContent}
        </div>
        {/* Back Side */}
        <div
          className="absolute w-full h-full bg-primary-lighter flex items-center justify-center rounded-3xl border border-gray-300 shadow-lg"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {backContent}
        </div>
      </div>
    </div>
  );
};

export default FlipCard;
