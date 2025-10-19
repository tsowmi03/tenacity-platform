import FlipCard from "@modules/common/components/flip-card";
import UnderlineLink from "@modules/common/components/underline-link";
import { getSubjectSvg } from "@pages/modules";
import React from "react";

function FeaturedPrograms() {
  const [selected, setSelected] = React.useState<number | undefined>();
  const featuredPrograms = [
    {
      title: "Mathematics Extension 2 (Year 12)",
      schoolYear: 12,
      subject: "Mathematics extension",
      duration: "12 weeks",
      tutor: "John Smith",
      classesPerWeek: 2,
      description:
        "The highest level of Year 12 Mathematics, Extension 2 is designed for top students seeking an in-depth understanding of mathematical theory and applications.",
      image: "/image/12-extension2.jpg",
    },
    {
      title: "Mathematics Advanced (Year 12)",
      schoolYear: 12,
      subject: "Mathematics advanced",
      duration: "12 weeks",
      tutor: "John Smith",
      classesPerWeek: 2,
      description:
        "Comprehensive Year 12 Advanced Mathematics program, ensuring students master key concepts needed for high HSC performance.",
      image: "/image/12-advanced.jpg",
    },
    {
      title: "Mathematics Extension 1 (Year 11)",
      schoolYear: 11,
      subject: "Mathematics extension",
      duration: "10 weeks",
      tutor: "John Smith",
      classesPerWeek: 2,
      description:
        "Specialized Mathematics Extension 1 course designed for high-achieving Year 11 students aiming for top performance in their HSC.",
      image: "/image/11-extension1.jpg",
    },
  ];
  return (
    <div className="w-full justify-center text-navy justify-items-center py-8 px-6 md:px-16 ">
      {/* <div className="w-full flex flex-col lg:flex-row text-left px-4 lg:px-16 justify-between">
        <h2 className="text-2xl lg:text-4xl font-semibold max-w-screen-xsmall mt-3">
          {" "}
          Explore our Programs, all tailored to your needs
        </h2>
      </div> */}
      <div className="text-center text-2xl lg:text-4xl font-bold text-navy mb-16">
        Explore our Programs, <br /> all tailored to your needs
      </div>
      <div className="w-full relative  mt-16 justify-center justify-items-center">
        {/* Infinite Scroll Carousel */}
        <div className="w-full md:w-full justify-center flex-wrap gap-4 relative self-center flex content-between text-white">
          {featuredPrograms.map((module, idx) => (
            <FlipCard
              key={idx}
              isFlipped={
                selected !== undefined && selected === idx ? true : false
              }
              onClick={() => setSelected(idx)}
              index={idx}
              colorIndex={idx}
              frontContent={
                <div className="flex flex-col items-center md:gap-4 ">
                  {getSubjectSvg(module.subject)}
                  <h2 className="text-xl font-semibold my-4 px-4 text-center">
                    {module.title}
                  </h2>
                </div>
              }
              backContent={
                <div className="flex text-[8px] md:text-xs flex-col p-4 text-navy-dark">
                  <h2 className="font-semibold mb-4 self-center">
                    {module.title}
                  </h2>
                  <p>{module.description}</p>
                  <p>
                    <b>Duration:</b> {module.duration}
                  </p>
                  <p>
                    <b>Tutor:</b> {module.tutor}
                  </p>
                  <p>
                    <b>Classes per week:</b> {module.classesPerWeek}
                  </p>
                  <UnderlineLink
                    href="/register"
                    className="text-navy-dark self-center "
                  >
                    Register Now
                  </UnderlineLink>
                </div>
              }
            />
          ))}
          <div className="px-6 flex flex-col items-center justify-center gap-4 w-[47%] md:w-[22.5%] bg-primary  h-[15rem] md:h-[17rem] rounded-3xl ">
            <UnderlineLink
              href="/modules"
              className="text-xl self-center font-semibold text-white "
            >
              All Programs
            </UnderlineLink>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FeaturedPrograms;
