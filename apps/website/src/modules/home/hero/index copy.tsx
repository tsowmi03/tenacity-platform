import ComboboxComponent from "@modules/common/components/ComboBox";
import EmblaCarousel from "@modules/common/components/embla-carousel";
import Link from "next/link";
import { useState } from "react";

function Hero() {
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
    <div className="flex w-screen px-4 lg:px-[4.5rem] lg:h-[84vh] flex-col-reverse lg:flex-row gap-4">
      <div className="w-full lg:w-1/2 h-1/2  text-primary content-center lg:h-auto lg:mr-10">
        {/* <h1 className=" lg:text-[4vw] lg:text-7xl text-3xl">
          <span className="text-navy font-myFont">Tenacity Tutoring</span>{" "}
        </h1>
        <h2 className="lg:text-[2.1rem] text-3xl leading-10 mt-4">
          Where Determination meets Success!{" "}
        </h2> */}

        <h1 className=" lg:text-[3.4vw] lg:text-6xl text-3xl">
          <span className="text-navy font-myFont lg:text-[4.25vw] lg:text-6xl">
            Tenacity Tutoring
          </span>{" "}
          <br />
          Where Determination
          <br />
          meets Success!
        </h1>

        {/* <p className="text-neutral text-lg lg:text-[1vw] lg:mt-10 mt-6 lg:w-3/4">
          At Tenacity Tutoring, we specialize in creating tailored learning
          experiences for students of all levels. Whether you’re mastering the
          basics or excelling in advanced subjects, our dedicated tutors are
          here to guide you every step of the way. Let us help you achieve your
          goals and unlock your full potential.
        </p> */}
        <p className="text-neutral-700 text-sm lg:text-[1vw] lg:mt-10 mt-6 lg:w-3/4 w-5/6 md:w-full">
          ✔︎ Specialised tutoring in Maths, English, and Programming <br />
          ✔︎ Programming lessons tailored for students in Years 5–12 <br />
          ✔︎ Advanced Maths options for Year 11 and 12, including Extension
          levels <br />
          ✔︎ Focus on building determination, resilience, and problem-solving
          skills <br />
          ✔︎ Personalised learning plans to cater to each student’s unique needs{" "}
          <br />
        </p>
        <div className="flex lg:mt-10 mt-6 max-w-sm ">
          <div className="w-1/2">
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
            className="w-1/2"
          >
            <button className="relative bg-primary border border-primary rounded-lg text-neutral-light w-full py-3 px-3 cursor-pointer text-secondary flex items-center gap-4 h-fit  font-semibold -ml-2 shadow-lg justify-center">
              Get Started!
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
      <div className="w-full lg:w-1/2 relative h-[calc(1.041*(100vw-9rem))] lg:h-auto self-center flex">
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
          objectFit="scale-down"
          width={1268}
          height={1320}
          layout="responsive"
          loading="eagerFirst"
        />
      </div>
    </div>
  );
}

export default Hero;
