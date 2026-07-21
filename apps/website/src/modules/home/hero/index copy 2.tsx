import ComboboxComponent from "@modules/common/components/ComboBox";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

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
      <Image
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
          // objectPosition: "80%",
          filter: "blur(1px)",
          // left: "-50%",
        }}
      />
      <div className="overlay bg-navy-dark opacity-60 absolute inset-0 z-10"></div>
      <div className="text-secondary absolute inset-0 z-10 flex flex-col justify-center  text-center small:text-left  small:p-32 items-center text-white">
        <p className="mt-16 font-semibold text-[1.25rem] max-w-[13rem] mb-4 drop-shadow-md shadow-black  md:block md:mt-0 md:max-w-[32rem]">
          Tenacity Tutoring
        </p>

        <h1 className="text-3xl-semi  drop-shadow-lg shadow-navy-dark w-[80vw] md:text-[4rem] md:leading-[4rem] md:w-7/12 md:mb-6 text-center">
          Determination
          <br />
          meets Success!
        </h1>

        <div className="flex lg:mt-10 mt-6 max-w-lg w-10/12 md:w-1/2 bg-navy-dark p-2 bg-opacity-30 rounded-full outline  outline-primary-light gap-2">
          <div className="w-3/4">
            <ComboboxComponent
              label="Assignee"
              options={options}
              selected={selected?.value || ""}
              onChange={(value) =>
                setSelected(value as unknown as { id: number; value: string })
              }
              placeHolder="&#x1F50D;  Search a Year"
            />
          </div>
          <Link
            href={{
              pathname: "/register",
              query: selected ? { year: selected.id } : undefined,
            }}
            className="w-1/4"
          >
            <button className="relative bg-primary-light border border-primary-light rounded-full text-neutral-light w-full py-3 px-3 cursor-pointer text-secondary flex items-center gap-4 h-fit  font-semibold shadow-lg justify-center">
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
    </div>
  );
};

export default Hero;
