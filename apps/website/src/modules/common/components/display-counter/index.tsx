"use client";
import React, { useEffect, useRef, useState } from "react";

const DisplayCounter = ({
  number,
  speed = 5,
  unit,
}: {
  number: number;
  speed?: number;
  unit?: string;
}) => {
  const [currentNum, setCurrentNum] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const counterRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref to store the timeout ID

  // Easing function - ease out
  const easeOutQuad = (t: number) => t * (2 - t);

  useEffect(() => {
    let frame = 0;
    const totalFrames = (speed * 1000) / 50; // Number of updates

    const updateCounter = () => {
      if (frame <= totalFrames) {
        // Apply easing function to the progress ratio
        const progress = easeOutQuad(frame / totalFrames);
        const current = Math.min(progress * number, number);
        setCurrentNum(current);
        frame++;

        if (isVisible) {
          timeoutRef.current = setTimeout(updateCounter, 50); // Update every 50ms
        }
      }
    };

    if (isVisible) {
      updateCounter();
    } else {
      setCurrentNum(0); // Reset counter when not visible
    }

    return () => {
      setCurrentNum(0); // Reset on unmount
    };
  }, [number, speed, isVisible]);

  const checkVisibility = () => {
    if (counterRef.current) {
      const rect = counterRef.current.getBoundingClientRect();
      const currentlyVisible =
        rect.top >= 0 && rect.bottom <= window.innerHeight;
      setIsVisible(currentlyVisible);

      if (!currentlyVisible && timeoutRef.current) {
        clearTimeout(timeoutRef.current); // Clear timeout when not visible
        setCurrentNum(0); // Reset counter when not visible
      }
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.addEventListener("scroll", checkVisibility);
      checkVisibility();

      return () => {
        window.removeEventListener("scroll", checkVisibility);
      };
    }
  }, []);

  return (
    <div ref={counterRef} className="relative inline-block">
      <span className="invisible">
        {number}
        {unit}
      </span>
      <span className="absolute top-0 left-0">
        {Math.round(currentNum)}
        {unit}
      </span>
    </div>
  );
};

export default DisplayCounter;
