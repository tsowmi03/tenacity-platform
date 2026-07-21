import React from "react";
import { useState } from "react";
import FlipCard from "@modules/common/components/flip-card/index";

type Program = {
  title: string;
  duration: string;
  tutor: string;
  classesPerWeek: number;
  description: string;
};

const PROGRAMS: Program[] = [
  {
    title: "Mathematics Extension 2 (Year 12)",
    duration: "12 weeks",
    tutor: "John Smith",
    classesPerWeek: 2,
    description:
      "The highest level of Year 12 Mathematics, designed for top students seeking an in-depth understanding of mathematical theory and applications.",
  },
  {
    title: "English Advanced (Year 11)",
    duration: "10 weeks",
    tutor: "Priya Nair",
    classesPerWeek: 1,
    description:
      "Small-group English Advanced classes covering close text analysis, essay technique and exam strategy for Year 11 students.",
  },
  {
    title: "Mathematics Advanced (Year 10)",
    duration: "10 weeks",
    tutor: "Daniel Wu",
    classesPerWeek: 2,
    description:
      "Builds strong foundations in algebra, geometry and statistics ahead of the senior Maths courses, with weekly homework review.",
  },
  {
    title: "English Standard (Year 9)",
    duration: "8 weeks",
    tutor: "Priya Nair",
    classesPerWeek: 1,
    description:
      "Confidence-building English classes focused on reading comprehension, creative writing and clear, structured expression.",
  },
];

function FrontContent({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 text-center text-white">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="18" fill="rgba(255,255,255,0.25)" />
        <path
          d="M12 24l8-8 8 8"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h2 className="text-xl font-semibold">{title}</h2>
    </div>
  );
}

function BackContent({ program }: { program: Program }) {
  return (
    <div className="flex flex-col p-4 text-[8px] md:text-xs text-navy-dark">
      <h2 className="font-semibold mb-4 self-center text-center">
        {program.title}
      </h2>
      <p>{program.description}</p>
      <p>
        <b>Duration:</b> {program.duration}
      </p>
      <p>
        <b>Tutor:</b> {program.tutor}
      </p>
      <p>
        <b>Classes per week:</b> {program.classesPerWeek}
      </p>
    </div>
  );
}

export function ProgramGrid() {
  return (
    <div className="w-full flex flex-wrap content-between gap-4 p-8 bg-neutral-light">
      {PROGRAMS.map((program, idx) => (
        <FlipCard
          key={idx}
          index={idx}
          colorIndex={idx}
          onClick={() => {}}
          frontContent={<FrontContent title={program.title} />}
          backContent={<BackContent program={program} />}
        />
      ))}
    </div>
  );
}

export function Flipped() {
  const program = PROGRAMS[0];
  return (
    <div className="w-full flex flex-wrap content-between gap-4 p-8 bg-neutral-light">
      <FlipCard
        index={0}
        colorIndex={0}
        isFlipped
        onClick={() => {}}
        frontContent={<FrontContent title={program.title} />}
        backContent={<BackContent program={program} />}
      />
    </div>
  );
}

export function Interactive() {
  const [selected, setSelected] = useState<number | undefined>(undefined);
  return (
    <div className="w-full flex flex-wrap content-between gap-4 p-8 bg-neutral-light">
      {PROGRAMS.map((program, idx) => (
        <FlipCard
          key={idx}
          index={idx}
          colorIndex={idx}
          isFlipped={selected === idx}
          onClick={() => setSelected(idx)}
          frontContent={<FrontContent title={program.title} />}
          backContent={<BackContent program={program} />}
        />
      ))}
    </div>
  );
}
