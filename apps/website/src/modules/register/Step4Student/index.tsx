import React, { useEffect, useState } from "react";
import { Control, Controller, UseFormWatch } from "react-hook-form";
import { EnrolmentFormData } from "../form";

interface Props {
  control: Control<EnrolmentFormData, unknown>;
  handleNext: () => void;
  watch: UseFormWatch<EnrolmentFormData>;
}

function Index(props: Props) {
  const { control, handleNext, watch } = props;
  const [errors, setErrors] = useState({
    studentFirstName: "",
    studentLastName: "",
    // studentDOB: "",
  });

  const handleClick = () => {
    const formValues = control._formValues;

    if (
      !formValues.studentFirstName ||
      !formValues.studentLastName
      // ||      !formValues.studentDOB
    ) {
      setErrors((prev) => ({
        ...prev,
        studentFirstName: !formValues.studentFirstName
          ? "Please enter your first name"
          : "",
        studentLastName: !formValues.studentLastName
          ? "Please enter your last name"
          : "",
        // studentDOB: !formValues.studentDOB
        //   ? "Please enter your date of birth"
        //   : "",
      }));
      return;
    }
    handleNext();
  };

  const studentFirstName = watch("studentFirstName");
  const studentLastName = watch("studentLastName");
  // const studentDOB = watch("studentDOB");

  useEffect(() => {
    setErrors({
      studentFirstName: "",
      studentLastName: "",
      // studentDOB: "",
    });
  }, [studentFirstName, studentLastName]);

  return (
    <div>
      <div className="text-primary text-3xl font-bold text-center">
        Student Information
      </div>

      <div className="grid grid-cols-1 gap-4 mt-8 text-center justify-center justify-items-center md:mx-[20%] ">
        <Controller
          name="studentFirstName"
          control={control}
          render={({ field }) => (
            <div className="w-full">
              <input
                {...field}
                id="firstName"
                placeholder="First name"
                value={field.value || ""}
                className={`w-full p-2 border rounded ${
                  errors.studentFirstName ? "border-red-500" : ""
                }
                `}
              />
              <span className="text-red-500 text-sm  float-start">
                {errors.studentFirstName}
              </span>
            </div>
          )}
        />

        <Controller
          name="studentLastName"
          control={control}
          render={({ field }) => (
            <div className="w-full">
              <input
                {...field}
                id="lastName"
                placeholder="Last name"
                value={field.value || ""}
                className={`w-full p-2 border rounded ${
                  errors.studentLastName ? "border-red-500" : ""
                }`}
              />
              <span className="text-red-500 text-sm float-start">
                {errors.studentLastName}
              </span>
            </div>
          )}
        />

        {/* <div className="text-base text-gray-500 text-center font-semibold mt-2">
          Birthday:
        </div>
        <Controller
          name="studentDOB"
          control={control}
          render={({ field }) => (
            <div className="w-full">
              <input
                {...field}
                id="studentDOB"
                placeholder="Date of birth"
                type="date"
                value={field.value || ""}
                className={`w-full p-2 border rounded appearance-none !min-h-6 ${
                  errors.studentDOB ? "border-red-500" : ""
                }`}
                style={{
                  padding: "10px",
                }}
                onFocus={(e) => e.target.showPicker()}
              />
              <span className="text-red-500 text-sm float-start">
                {errors.studentDOB}
              </span>
            </div>
          )}
        /> */}
        <button
          className="w-full text-white border-2 cursor-pointer rounded-md border-primary py-2 px-2 bg-primary hover:border-navy transition-all duration-300"
          onClick={handleClick}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default Index;
