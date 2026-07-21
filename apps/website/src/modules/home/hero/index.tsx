import ComboboxComponent from "@modules/common/components/ComboBox";
import ArrowRight from "@modules/common/icons/arrow-right";
import Link from "next/link";
import { useState } from "react";
import EmblaCarousel from "@modules/common/components/embla-carousel";

const Hero = () => {
  const [selected, setSelected] = useState<
    { id: number; value: string } | undefined
  >();

  const options = [
    { id: 5, name: "Year 5" },
    { id: 6, name: "Year 6" },
    { id: 7, name: "Year 7" },
    { id: 8, name: "Year 8" },
    { id: 9, name: "Year 9" },
    { id: 10, name: "Year 10" },
    { id: 11, name: "Year 11" },
    { id: 12, name: "Year 12" },
  ];
  return (
    <div className="h-[60vh] md:h-[80vh] w-full relative ">
      {/* <Image
        src="/image/3 of 15.jpg"
        loading="eager"
        priority={true}
        quality={90}
        alt="Photo by @thevoncomplex https://unsplash.com/@thevoncomplex"
        // className="absolute inset-0 "
        draggable="false"
        fill
        sizes="100vw"
        style={{
          objectFit: "cover",
          // left: "-50%",
        }}
      /> */}
      <EmblaCarousel
        srcList={[
          // "/hero--1.jpg",
          "/image/1 of 15.jpg",
          // "/image/2 of 15.jpg",
          "/image/3 of 15.jpg",
          // "/image/4 of 15.jpg",
          // "/image/5 of 15.jpg",
          // "/image/6 of 15.jpg",
          // "/image/7 of 15.jpg",
          // "/image/8 of 15.jpg",
          // "/image/9 of 15.jpg",
          // "/image/10 of 15.jpg",
          "/image/11 of 15.jpg",
          "/image/12 of 15.jpg",
          // "/image/13 of 15.jpg",
          // "/image/14 of 15.jpg",
          // "/image/15 of 15.jpg",
        ]}
        objectFit="cover"
        // width={1268}
        // height={1320}
        layout="fill"
        loading="eagerFirst"
      />
      <div className="overlay bg-navy-dark opacity-70 absolute inset-0 z-10"></div>
      <div className="text-secondary absolute inset-0 z-10 flex flex-col justify-center  text-center small:text-left  small:p-32 items-center text-white">
        {/* <p className="text-regular md:text-[1.5rem] text-[1.2rem] max-w-[13rem] mb-4 drop-shadow-md shadow-black  md:block md:mt-0 md:max-w-[32rem]">
          Tenacity Tutoring
        </p>

        <h1 className="text-[2.2rem] leading-10 drop-shadow-md shadow-black w-[90vw] md:text-[4rem] md:leading-[4rem] md:w-7/12 md:mb-6 text-center">
          Determination
          <br />
          Meets Success!
        </h1> */}
        <h1 className="text-[2.2rem]  drop-shadow-md shadow-black w-[90vw] md:text-[4rem] md:leading-[4rem] md:w-7/12 md:mb-6 text-center">
          Tenacity Tutoring
        </h1>
        <p className="text-regular text-[1.25rem] md:text-[2.3rem]  mb-4 drop-shadow-md shadow-black  md:block mt-2 md:mt-0 s">
          Determination Meets Success
        </p>

        <div className="flex lg:mt-10 mt-10 max-w-lg w-[90%] md:w-1/2 bg-white p-1 md:p-2 bg-opacity-50 rounded-full outline outline-primary-light gap-1 md:gap-2">
          <div className="w-full md:w-3/4">
            <ComboboxComponent
              label="Assignee"
              options={options}
              selected={selected?.value || ""}
              onChange={(value) =>
                setSelected(value as unknown as { id: number; value: string })
              }
              placeHolder="Search a Year"
            />
          </div>
          <Link
            href={{
              pathname: "/register",
              query: selected ? { year: selected.id } : undefined,
            }}
            className="md:w-1/4"
          >
            <button className="relative h-full bg-primary border border-primary rounded-full text-neutral-light w-full py-3 px-3 cursor-pointer text-secondary flex items-center gap-4  font-semibold shadow-lg justify-center">
              <span className="hidden md:block">Get Started!</span>
              <span className="block md:hidden">
                <ArrowRight className="mx-1" />
              </span>
            </button>
          </Link>
          {/* 
          <UnderlineLink
            className="text-navy"
            href="/#products"
            areaLabel="View our products"
          >
            Our Programs
          </UnderlineLink> */}
          {/* <Button className="text-navy text-lg">View all products</Button> */}
        </div>
      </div>
    </div>
  );
};

export default Hero;
