import { useState, useEffect } from "react";

export function useIsElementCentered(ref: React.RefObject<HTMLElement>) {
  const [isCentered, setIsCentered] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsCentered(entry.isIntersecting);
        }
      },
      { threshold: [0.7] }
    );

    if (ref.current) observer.observe(ref.current);

    return () => observer.disconnect();
  }, [ref]);

  return isCentered;
}
