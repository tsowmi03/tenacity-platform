import React from "react";
import { StudentYearsEnum, Subject } from "../constants";

interface Props {
  year: StudentYearsEnum;
  onSubjectSelect: (subject: Subject) => void;
  selectedSubjects: Subject[];
  handleNextClick?: () => void;
}

function Index(props: Props) {
  const { onSubjectSelect, year, selectedSubjects, handleNextClick } = props;

  const subjectsOptions = (year: StudentYearsEnum) => {
    switch (year) {
      case "Year 11":
        return [
          Subject.Math11Advanced,
          Subject.Math11Standard,
          Subject.Math11Extension1,
        ];
      case "Year 12":
        return [
          Subject.Math12Advanced,
          Subject.Math12Standard,
          Subject.Math12Extension1,
          Subject.Math12Extension2,
        ];
      default:
        return [Subject.Maths, Subject.English];
    }
  };

  return (
    <div>
      <div className="text-primary text-3xl font-bold text-center">
        Which subject would you like help with?
      </div>
      {/* <div className="text-base text-gray-500 text-center font-semibold mt-2">
        This helps us to find you tutors with the right experience.
      </div> */}
      <div className="grid grid-cols-2 gap-4 mt-8 text-center md:mx-16">
        {subjectsOptions(year).map((subject, index) => (
          <button
            key={index + subject}
            type="button"
            className={`text-navy border-2 cursor-pointer rounded-md border-white py-4 px-2 bg-white md:hover:border-primary-light transition-all duration-300
              ${selectedSubjects?.includes(subject) ? "!border-primary " : ""}`}
            onClick={() => onSubjectSelect(subject)}
          >
            {subject}
          </button>
        ))}
      </div>
      {handleNextClick && (
        <div className="mt-16 flex justify-center">
          <button
            className="w-full  text-white border-2 cursor-pointer rounded-md border-primary py-2 px-2 bg-primary hover:border-navy transition-all duration-300 md:w-1/2 disabled:bg-gray-400 disabled:border-gray-400 disabled:opacity-70"
            onClick={handleNextClick}
            type="button"
            disabled={selectedSubjects.length === 0}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default Index;
