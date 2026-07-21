import React, { useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay, { AutoplayOptionsType } from "embla-carousel-autoplay";
import { EmblaCarouselType } from "embla-carousel";
import Image from "next/image";

const testimonials = [
  {
    name: "Norman Mikhail",
    sub: "Director of MarksPlus Tutoring",
    details:
      "Josh and Tom are dedicated tutors who know each student's learning needs. They customise the learning to cater for upcoming assessments and address identified gaps. Josh and Tom motivate students by building positive relationships and showing genuine care. I refer to Tenacity Tutoring.",
    photo: "/testimonials/image-0.jpeg",
  },
  {
    name: "Rasha Farag",
    details:
      "My boys love working with Thomas and Josh, they have great resources and give good feedback to allow them to grow, and importantly have excellent rapport with the kids which encourages them to work hard. Highly recommend!",
    photo: "/testimonials/image-1.jpg",
  },
  {
    name: "Jonathan Said",
    details:
      "Josh and Tom at Tenacity have been amazing tutors, helping my son gain confidence and improve his math skills. Thanks to their support and knowledge, my son is now achieving better results at school and enjoying math more than ever!",
    photo: "/testimonials/image-2.jpg",
  },
  {
    name: "Simone Said",
    details:
      "My daughter has been working with Josh and Tom for about a year and we have seen significant improvements in both her academic results and her confidence. They have been so patient in working through difficult concepts with her. Their warm and approachable nature has encouraged her to ask more questions and further challenge herself. We are so grateful we found Tenacity Tutoring!",
    photo: "/testimonials/image-3.png",
  },
  {
    name: "Maria Saeed",
    details:
      "Tenacity Tutoring has been incredible for both my daughters’ confidence and progress in maths! Tom and Josh are not only fantastic tutors, but they also take the time to understand each child’s individual needs, making learning both engaging and effective. Before starting with Tenacity, my daughters found maths challenging and often felt frustrated. However, with Tom and Josh’s patience and encouragement, they now approach Maths with a completely different attitude. My daughters enjoy their lessons, feel more confident in their abilities, and even push themselves to work harder—not just to improve, but because they do not want to let their tutors down! Their support has made such a difference, and I can’t recommend Tenacity Tutoring highly enough!",
    photo: "/testimonials/image-4.jpg",
  },
  {
    name: "Susie Krcmar",
    details:
      "My eldest daughter reluctantly started at Tenacity Tutoring in Year 9 for English. After two terms, she began to enjoy the subject and improved so much that she was moved to the Advanced English class mid-year. My second daughter, in Year 8, didn't require tutoring but found the math and English workshops helpful for her Advanced English and Accelerated Math classes. My youngest daughter started English tutoring at Tenacity when she entered Year 7. Despite English being a challenging subject for her, Tom and Josh made learning fun, positive, and attainable, resulting in her finishing Year 7 in the top three of her class. The environment at Tenacity Tutoring has not only fostered great school results but also provided an enjoyable experience for my daughters.",
    photo: "/testimonials/image-5.jpg",
  },
  {
    name: "Basem Dawoud",
    details:
      "My daughter, Angelina, has been attending Tenacity Tutoring for English, and I couldn’t be more grateful for the support she’s received. Josh and Tom have not only helped her improve her marks but have also given her the confidence to believe in her abilities. Since starting, we’ve seen a great improvement in her writing and comprehension skills, and she now approaches English with a newfound sense of enthusiasm. Their dedication and encouragement have made all the difference, I highly recommend them.",
    photo: "/testimonials/image-6.jpg",
  },

  {
    name: "Adriana Sharkawi",
    details:
      "I cannot recommend Josh and Tom from Tenacity Tutoring enough! They have been absolutely amazing in supporting my son’s learning journey. Their dedication, patience, and expertise have not only helped him improve academically, but have also developed his learning skills and focus. The additional support they provide, along with the workshops they run over the school holidays and during exam periods, is absolutely wonderful. A huge bonus as a mum is having tutors who are such positive role models and can truly engage with my son. It makes such a difference knowing he is learning from people who inspire and support him. I’ve seen incredible progress, and I’m truly grateful for the positive impact they’ve had.",
    photo: "/testimonials/image-8.png",
  },
  // {
  //   name: "Georgia Whitbread",
  //   details:
  //     "We really appreciate that Thomas and Josh take the time to make sure the kids understand the concepts before moving on. Both create an environment where our kids feel confident to ask questions and try to apply what they have learnt.",
  //   photo: "",
  // },
  // {
  //   name: "Ellie Sorial",
  //   details:
  //     "Thomas and Josh are very caring and professional teachers. They helped my boy gain confidence and motivation. Also, their teaching inspired my boy to engage with his work. Highly recommend to anyone who is looking for academic improvement.",
  //   photo: "",
  // },
  {
    name: "Mariam El-Sabawy",
    details:
      "My son Kerelous has come a long way since starting English tutoring at Tenacity Tutoring. With Josh and Tom’s guidance, his confidence has grown, and his marks have improved significantly. Their teaching approach is both supportive and motivating, making learning more enjoyable and helping him feel more capable and engaged. It’s been amazing to see his progress, not just in his academic performance but also in his attitude toward English. I’m so grateful for their dedication and highly recommend them to any parent looking for quality tutoring.",
    photo: "/testimonials/image-7.jpg",
  },
];

const Quotes = () => (
  <svg
    fill="currentColor"
    height="100%"
    width="100%"
    version="1.1"
    id="Icons"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
  >
    <g>
      <path
        d="M13,11c0.6,0,1-0.4,1-1s-0.4-1-1-1c-5,0-9,4-9,9c0,2.8,2.2,5,5,5s5-2.2,5-5s-2.2-5-5-5c-0.3,0-0.7,0-1,0.1
		C9.3,11.8,11,11,13,11z"
      />
      <path
        d="M23,13c-0.3,0-0.7,0-1,0.1c1.3-1.3,3-2.1,5-2.1c0.6,0,1-0.4,1-1s-0.4-1-1-1c-5,0-9,4-9,9c0,2.8,2.2,5,5,5s5-2.2,5-5
		S25.8,13,23,13z"
      />
    </g>
  </svg>
);

const Card = (props: {
  index: number;
  selected: number;
  handleClick: () => void;
  testmonial: { name: string; details: string; photo: string; sub?: string };
}) => {
  return (
    <div>
      <div
        className={`bg-white px-4 py-6 md:p-10 rounded-lg shadow-lg transition-all duration-300 scale-75 ${
          props.selected === props.index - 1 ? "!scale-100" : "scale-80"
        }`}
        onClick={props.handleClick}
      >
        <div className="text-center">
          <div className="w-20 h-20 rounded-full mx-auto relative overflow-clip bg-gray-300">
            <Image src={props.testmonial.photo} alt="" fill objectFit="cover" />
          </div>
          <h2 className="text-xl text-gray-700 font-semibold mt-4">
            {props.testmonial.name}
          </h2>
          {props.testmonial.sub && (
            <div className="mt-2 text-sm font-normal text-primary">
              - {props.testmonial.sub} -
            </div>
          )}
          <div className="text-gray-500 mt-4 z-10">
            <div className="text-primary-light absolute top-0 left-0 -mt-8 -ml-5 h-16 w-16 z-0 opacity-25 ">
              <Quotes />
            </div>
            <p
              className={`z-10 md:text-base text-sm ${
                props.selected === props.index - 1
                  ? ""
                  : "text-ellipsis line-clamp-4"
              }`}
            >
              {props.testmonial.details}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

function Index() {
  const [selected, setSelected] = useState(0);

  const autoplayOptions: AutoplayOptionsType = { delay: 40000 };
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, skipSnaps: false },
    [Autoplay(autoplayOptions)]
  );

  const logEmblaEvent = (emblaApi: EmblaCarouselType) => {
    setSelected(emblaApi.selectedScrollSnap());
  };

  useEffect(() => {
    if (emblaApi) {
      emblaApi.on("select", () => logEmblaEvent(emblaApi));
    }
  }, [emblaApi]);

  return (
    <div className="py-8 bg-primary-lighter">
      {/* <div className="text-base text-center mt-10 mb-4 text-neutral-500 ">
        Testimonials
      </div> */}
      <div className="text-center text-2xl lg:text-4xl font-bold text-navy mb-16">
        What people say about us:
      </div>
      <div className="text-center text-gray-500 mt-2 font-semibold w-full overflow-x-clip">
        <div className="embla !overflow-visible" ref={emblaRef}>
          <div className="embla__container flex w-full">
            {testimonials.map((testmonial, i) => {
              const index = i + 1;
              return (
                <div
                  className="embla__slide flex-shrink-0 !min-w-[70%] !max-w-[70%] md:!min-w-[33.33%] md:!max-w-[33.33%]"
                  key={index}
                >
                  <Card
                    index={index}
                    selected={selected}
                    testmonial={testmonial}
                    handleClick={() => {
                      if (index - 1 !== selected) {
                        setSelected(index);
                        emblaApi?.scrollTo(index - 1);
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Index;
