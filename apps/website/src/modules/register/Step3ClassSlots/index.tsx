import React from "react";
import { Class, DaysOfWeekEnum, StudentYearsEnum, Subject } from "../constants";

interface Props {
  year: StudentYearsEnum;
  subjects: Subject[];
  onClassSlotChoice: (cl: Class) => void;
  classes: Class[];
  selectedClasses: Class[];
  handleNext: () => void;
}

function Index(props: Props) {
  const { onClassSlotChoice, year, subjects, selectedClasses, handleNext } =
    props;

  const getSlotsFromYearAndSubject = (
    grade: StudentYearsEnum,
    selectedSubjects: Subject[],
    day: DaysOfWeekEnum
  ) => {
    const subjectToTypeMap: Record<Subject, string[]> = {
      [Subject.Math11Standard]: ["stdmath11"],
      [Subject.Math11Advanced]: ["advmath11"],
      [Subject.Math11Extension1]: ["ex1math11"],
      [Subject.Math12Standard]: ["stdmath12"],
      [Subject.Math12Advanced]: ["advmath12"],
      [Subject.Math12Extension1]: ["ex1math12"],
      [Subject.Math12Extension2]: ["ex2math12"],
      [Subject.Maths]: ["5-10"], // General maths subjects for Years 5-10
      [Subject.English]: ["5-10"], // General English subjects for Years 5-10
      // New English Subjects for Year 11 and Year 12 (commented)
      // [Subject.English11Standard]: ["stdeng11"],
      // [Subject.English11Advanced]: ["adveng11"],
      // [Subject.English11Extension1]: ["ex1eng11"],
      // [Subject.English12Standard]: ["stdeng12"],
      // [Subject.English12Advanced]: ["adveng12"],
      // [Subject.English12Extension1]: ["ex1eng12"],
      // [Subject.English12Extension2]: ["ex2eng12"],
    };

    const slots = props.classes
      .filter((cls) => {
        const isAvailable = cls.enrolledStudents.length < cls.capacity;
        const isCorrectDay = cls.day === day;

        if (!isAvailable || !isCorrectDay) return false;

        switch (grade) {
          case StudentYearsEnum.Year5:
          case StudentYearsEnum.Year6:
          case StudentYearsEnum.Year7:
          case StudentYearsEnum.Year8:
          case StudentYearsEnum.Year9:
          case StudentYearsEnum.Year10:
            return (
              (cls.type === "" || cls.type === "5-10") &&
              (selectedSubjects.includes(Subject.Maths) ||
                selectedSubjects.includes(Subject.English))
            );

          case StudentYearsEnum.Year11:
          case StudentYearsEnum.Year12:
            return selectedSubjects.some((subject) =>
              subjectToTypeMap[subject]?.includes(cls.type)
            );

          default:
            return false;
        }
      })
      .map((slot) => {
        return {
          ...slot,
          day: slot.day,
        };
      });

    return slots;
  };

  const from24to12 = (time: string) => {
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours);
    const m = parseInt(minutes);
    // Ensure minutes are always shown with two digits
    const formattedMinutes = m.toString().padStart(2, "0");
    if (h === 0) {
      return `12:${formattedMinutes} AM`;
    } else if (h < 12) {
      return `${h}:${formattedMinutes} AM`;
    } else if (h === 12) {
      return `${h}:${formattedMinutes} PM`;
    } else {
      return `${h - 12}:${formattedMinutes} PM`;
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="text-primary text-3xl font-bold text-center">
        Which slot would suit you the best?
      </div>
      <div className="text-base text-gray-500 text-center font-semibold mt-2">
        Let&apos;s find you a slot for each subject that fits your schedule.
        {subjects.length > 1
          ? "You should choose a different slot for each subject. " +
            "(selected: " +
            selectedClasses.length +
            "/" +
            subjects.length +
            ")"
          : ""}
      </div>
      <div className="w-full overflow-x-scroll">
        <div className="grid grid-cols-5 gap-4 mt-8 text-center min-w-max ">
          {Object.values(DaysOfWeekEnum).map((day, index) => {
            const slots = getSlotsFromYearAndSubject(year, subjects, day);

            // if (slots.length === 0) {
            //   return null;
            // }
            return (
              <div key={index} className="flex flex-col items-center gap-4">
                <div className="text-navy w-full border-2 rounded-md border-primary-lighter py-4 px-2 bg-primary-lighter font-bold">
                  {day}
                </div>

                {slots.length === 0 && (
                  <div className="text-gray-500 text-center font-semibold py-4 px-2">
                    Sorry! <br /> We’re full
                  </div>
                )}

                {slots.map((slot, index) => (
                  <button
                    key={index + slot.id}
                    type="button"
                    disabled={
                      selectedClasses.length === props.subjects.length &&
                      !selectedClasses.map((c) => c.id)?.includes(slot.id)
                    }
                    className={`text-navy border-2 cursor-pointer rounded-md border-white py-4 px-2 bg-white md:hover:border-primary disabled:hover:border-red-400 transition-all duration-300 w-full
                      ${
                        selectedClasses.map((c) => c.id)?.includes(slot.id)
                          ? "!border-primary "
                          : ""
                      }
                      `}
                    onClick={() => onClassSlotChoice(slot)}
                  >
                    {from24to12(slot.startTime)}- <br />
                    {from24to12(slot.endTime)}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <button
        className="w-full mt-8 text-white border-2 cursor-pointer rounded-md border-primary py-2 px-2 bg-primary hover:border-navy transition-all duration-300 md:w-1/2 disabled:bg-gray-400 disabled:border-gray-400 disabled:opacity-70"
        onClick={() => handleNext()}
        disabled={selectedClasses.length !== subjects.length}
        type="button"
      >
        Next
      </button>
    </div>
  );
}

export default Index;
