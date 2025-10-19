import UnderlineLink from "@modules/common/components/underline-link";
import Head from "@modules/common/components/head";
import FlipCard from "@modules/common/components/flip-card";
import { useState } from "react";
import animation from "../../../public/animation/step1.json";
import dynamic from "next/dynamic";

const primaryModules = [
  {
    title: "Mathematics (Years 5-6)",
    schoolYears: "5-6",
    subject: "Mathematics primary",
    duration: "8 weeks",
    tutor: "Sarah Johnson",
    classesPerWeek: 2,
    description:
      "Fun and engaging Mathematics program for Year 5-6 students. Strengthen core numeracy skills, problem-solving techniques, and build a strong foundation for high school.",
    image: "/image/mathematics-5-6.jpg",
  },
  {
    title: "English (Years 5-6)",
    schoolYears: "5-6",
    subject: "English",
    duration: "8 weeks",
    tutor: "Sarah Johnson",
    classesPerWeek: 2,
    description:
      "Comprehensive English program for Year 5-6 students, focusing on reading comprehension, grammar, creative writing, and critical thinking skills.",
    image: "/image/english-5-6.jpg",
  },
];

const highSchoolModules = [
  {
    title: "Mathematics (Years 7-10)",
    schoolYears: "7-10",
    subject: "Mathematics standard",
    duration: "10 weeks",
    tutor: "Michael Brown",
    classesPerWeek: 2,
    description:
      "Comprehensive Mathematics program for high school students in Years 7-10. Covers key topics, problem-solving strategies, and prepares students for senior high school and HSC success.",
    image: "/image/mathematics-7-10.jpg",
  },
  {
    title: "English (Years 7-10)",
    schoolYears: "7-10",
    subject: "English",
    duration: "10 weeks",
    tutor: "Michael Brown",
    classesPerWeek: 2,
    description:
      "High school English program for Years 7-10, focusing on text analysis, essay writing, and creative writing. Helps students develop strong literacy and critical thinking skills.",
    image: "/image/english-7-10.jpg",
  },
];

const year11Modules = [
  {
    title: "Mathematics Standard (Year 11)",
    schoolYear: 11,
    subject: "Mathematics standard",
    duration: "10 weeks",
    tutor: "John Smith",
    classesPerWeek: 2,
    description:
      "Year 11 Standard Mathematics program focusing on essential mathematical concepts to support students in their HSC preparation.",
    image: "/image/11-standard.jpg",
  },
  {
    title: "Mathematics Advanced (Year 11)",
    schoolYear: 11,
    subject: "Mathematics advanced",
    duration: "10 weeks",
    tutor: "John Smith",
    classesPerWeek: 2,
    description:
      "Advanced Year 11 Mathematics course, preparing students for higher-level mathematical concepts essential for HSC success.",
    image: "/image/11-advanced.jpg",
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

const year12Modules = [
  {
    title: "Mathematics Standard (Year 12)",
    schoolYear: 12,
    subject: "Mathematics standard",
    duration: "12 weeks",
    tutor: "John Smith",
    classesPerWeek: 2,
    description:
      "Year 12 Standard Mathematics program covering key topics for HSC preparation. Build problem-solving skills and mathematical confidence.",
    image: "/image/12-standard.jpg",
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
    title: "Mathematics Extension 1 (Year 12)",
    schoolYear: 12,
    subject: "Mathematics extension",
    duration: "12 weeks",
    tutor: "John Smith",
    classesPerWeek: 2,
    description:
      "Intensive Extension 1 Mathematics program for Year 12 students aiming to excel in complex mathematical topics and ace their HSC exams.",
    image: "/image/12-extension1.jpg",
  },
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
];

const LottiePlayer = dynamic(() => import("lottie-react"), { ssr: false });

export const getSubjectSvg = (subject: string) => {
  switch (subject) {
    case "Mathematics primary":
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="70"
        height="70"
        color="currentColor"
        fill="none"
      >
        <path
          d="M3 10C3 6.22876 3 4.34315 4.17157 3.17157C5.34315 2 7.22876 2 11 2H13C16.7712 2 18.6569 2 19.8284 3.17157C21 4.34315 21 6.22876 21 10V16H3V10Z"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
        <path
          d="M2 16H22"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <path
          d="M4 22L7 16"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <path
          d="M20 22L17 16"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
        <path
          d="M13 9H11"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M8 11L8 7L7 8"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M17 11L17 7L16 8"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M12 20L12 16"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>;

    case "Mathematics standard":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="70"
          height="70"
          color="currentColor"
          fill="none"
        >
          <path
            d="M5.5 3V8M8 5.5L3 5.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M8 16L6 18M6 18L4 20M6 18L8 20M6 18L4 16"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M20 6L16 6"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M20 18.5L16 18.5M20 15.5L16 15.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M22 12L2 12"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M12 22L12 2"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      );
    case "Mathematics advanced":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="70"
          height="70"
          color="currentColor"
          fill="none"
        >
          <path
            d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <path
            d="M5.5 12.5L5.97454 12.1836C6.44849 11.8677 6.68546 11.7097 6.91293 11.7803C7.1404 11.851 7.24617 12.1154 7.45772 12.6443L9 16.5L11.0883 10.2351C11.5283 8.91505 11.7483 8.25503 12.2721 7.87752C12.7959 7.5 13.4916 7.5 14.883 7.5H18.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M17 12L15.5 13.5M15.5 13.5L14 15M15.5 13.5L17 15M15.5 13.5L14 12"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      );
    case "Mathematics extension":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="70"
          height="70"
          color="currentColor"
          fill="none"
        >
          <path
            d="M21 2C21 10.2843 16.9706 17 12 17C7.02944 17 3 10.2843 3 2"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
          <path
            d="M3 20H4.05882M15.7059 20H16.7647M19.9412 20H21M7.23529 20H8.29412"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M9.5 4.5C11.1 2.68572 11.45 2 12 2M14.5 4.5C12.9 2.68572 12.55 2 12 2M12 2V22"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      );

    case "English":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="70"
          height="70"
          color="currentColor"
          fill="none"
        >
          <path
            d="M13 15C10.7083 21 4.29167 15 2 21"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M15.5 15H17.0013C19.3583 15 20.5368 15 21.2691 14.2678C22.0013 13.5355 22.0013 12.357 22.0013 10V8C22.0013 5.64298 22.0013 4.46447 21.2691 3.73223C20.5368 3 19.3583 3 17.0013 3H13.0013C10.6443 3 9.46576 3 8.73353 3.73223C8.11312 4.35264 8.01838 5.29344 8.00391 7"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle
            cx="7.5"
            cy="12.5"
            r="2.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M12 7H18M18 11H15"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      );
    default:
      return "/svg/subject.svg";
  }
};

export default function Modules() {
  const [selected, setSelected] = useState<
    { groupIndex: number; moduleIndex: number } | undefined
  >(undefined);

  return (
    <div className="text-white ">
      <Head title="Our Modules"></Head>
      <div className="flex text-center flex-col justify-center items-center align-middle bg-primary-light pt-16">
        <h1 className="text-4xl font-bold text-white uppercase">
          Our Programs
        </h1>
        <LottiePlayer
          animationData={animation}
          loop={true}
          autoplay
          className="w-48 md:w-72"
        />
      </div>

      <div className="content-container flex flex-col items-center my-16 text-center">
        <p className="max-w-2xl mb-4 text-navy-dark text-2xl mx-4">
          &quot;Education is not preparation for life; education is life
          itself.&quot; <br />
          <i>John Dewey</i>
        </p>
      </div>

      {/* Render Modules in Groups */}
      {[
        { title: "Year 12", data: year12Modules },
        { title: "Year 11", data: year11Modules },
        { title: "Years 7-10 (High School)", data: highSchoolModules },
        { title: "Years 5-6 (Primary School)", data: primaryModules },
      ].map((group, index) => (
        <div key={index} className="mx-auto my-8 px-6 md:px-16 w-full">
          <h2 className="text-3xl font-semibold text-navy-dark mb-6 text-center">
            {group.title}
          </h2>
          <div className="flex flex-wrap justify-start gap-4">
            {group.data.map((module, idx) => (
              <FlipCard
                key={idx}
                isFlipped={
                  selected?.groupIndex === index &&
                  selected?.moduleIndex === idx
                }
                onClick={() =>
                  setSelected({ groupIndex: index, moduleIndex: idx })
                }
                index={idx}
                colorIndex={(idx + index * 2) % 6}
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
                      className="text-navy-dark self-center"
                    >
                      Register Now
                    </UnderlineLink>
                  </div>
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
