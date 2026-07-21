import { animate, motion, useMotionValue } from "framer-motion";
import { useEffect, useState } from "react";
import useMeasure from "react-use-measure";
import Image from "next/image";

export default function InfiniteScrollCarousel(props: {
  images: { src: string; title: string; subtitle?: string }[];
}) {
  const images = props.images;
  const FAST_DURATION = 35;
  const SLOW_DURATION = 75;

  const [duration, setDuration] = useState(FAST_DURATION);
  const [ref, { width }] = useMeasure();

  const xTranslation = useMotionValue(0);

  const [mustFinish, setMustFinish] = useState(false);
  const [rerender, setRerender] = useState(false);

  useEffect(() => {
    let controls;
    const finalPosition = -width / 2 - 8;

    if (mustFinish) {
      controls = animate(xTranslation, [xTranslation.get(), finalPosition], {
        ease: "linear",
        duration: duration * (1 - xTranslation.get() / finalPosition),
        onComplete: () => {
          setMustFinish(false);
          setRerender(!rerender);
        },
      });
    } else {
      controls = animate(xTranslation, [0, finalPosition], {
        ease: "linear",
        duration: duration,
        repeat: Infinity,
        repeatType: "loop",
        repeatDelay: 0,
      });
    }

    return controls?.stop;
  }, [rerender, xTranslation, duration, width, mustFinish]);

  return (
    <main className="py-8 h-[100px] lg:h-[220px] ">
      <motion.div
        className="absolute left-0 top-0 flex gap-16 lg:gap-40"
        style={{ x: xTranslation }}
        ref={ref}
        drag="x"
        dragConstraints={{ left: -width, right: 0 }}
        onHoverStart={() => {
          setMustFinish(true);
          setDuration(SLOW_DURATION);
        }}
        onHoverEnd={() => {
          setMustFinish(true);
          setDuration(FAST_DURATION);
        }}
        onDragEnd={() => {
          // Adjust logic for when dragging ends, such as continuing the animation
          setMustFinish(true);
          setRerender(!rerender);
        }}
      >
        {[...images, ...images, ...images].map((item, idx) => (
          <motion.div
            className="relative overflow-x h-[70px] lg:h-[100px] min-w-[100px] lg:min-w-[100px] rounded-xl flex justify-center items-center "
            key={idx}
          >
            <Image
              src={item.src}
              alt={item.src}
              fill
              style={{ objectFit: "contain" }}
              draggable={false}
            />
            <div className="absolute bottom-0 translate-y-[150%] text-navy text-lg lg:text-xl font-semibold w-[max-content] max-w-[170px] text-center">
              {item.title}
              <br />
              <span
                className="text-sm lg:text-base text-gray-500
              "
              >
                {item.subtitle}
              </span>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </main>
  );
}
