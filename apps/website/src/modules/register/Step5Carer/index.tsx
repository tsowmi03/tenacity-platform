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
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
  });

  const handleClick = () => {
    const formValues = control._formValues;

    if (
      !formValues.carerFirstName ||
      !formValues.carerLastName ||
      !formValues.carerEmail ||
      !formValues.carerPhone
    ) {
      setErrors((prev) => ({
        ...prev,
        carerFirstName: !formValues.carerFirstName
          ? "Please enter your first name"
          : "",
        carerLastName: !formValues.carerLastName
          ? "Please enter your last name"
          : "",
        carerEmail: !formValues.carerEmail ? "Please enter a valid email" : "",
        carerPhone: !formValues.carerPhone
          ? "Please enter your phone number"
          : "",
      }));
      return;
    }
    handleNext();
  };

  const firstName = watch("carerFirstName");
  const lastName = watch("carerLastName");
  const email = watch("carerEmail");
  const phoneNumber = watch("carerPhone");

  useEffect(() => {
    setErrors({
      firstName: "",
      lastName: "",
      email: "",
      phoneNumber: "",
    });
  }, [firstName, lastName, email, phoneNumber]);

  return (
    <div>
      <div className="text-primary text-3xl font-bold text-center">
        Carer Information
      </div>

      <div className="grid grid-cols-1 gap-4 mt-8 text-center justify-center justify-items-center md:mx-[20%]">
        {/* First Name */}
        <Controller
          name="carerFirstName"
          control={control}
          render={({ field }) => (
            <div className="w-full">
              <input
                {...field}
                id="firstName"
                placeholder="First name"
                value={field.value || ""}
                className={`w-full p-2 border rounded ${
                  errors.firstName ? "border-red-500" : ""
                }`}
              />
              <span className="text-red-500 text-sm float-start">
                {errors.firstName}
              </span>
            </div>
          )}
        />

        {/* Last Name */}
        <Controller
          name="carerLastName"
          control={control}
          render={({ field }) => (
            <div className="w-full">
              <input
                {...field}
                id="lastName"
                placeholder="Last name"
                value={field.value || ""}
                className={`w-full p-2 border rounded ${
                  errors.lastName ? "border-red-500" : ""
                }`}
              />
              <span className="text-red-500 text-sm float-start">
                {errors.lastName}
              </span>
            </div>
          )}
        />

        {/* Email */}
        <Controller
          name="carerEmail"
          control={control}
          render={({ field }) => (
            <div className="w-full">
              <input
                {...field}
                id="email"
                placeholder="Email"
                value={field.value || ""}
                type="email"
                className={`w-full p-2 border rounded ${
                  errors.email ? "border-red-500" : ""
                }`}
              />
              <span className="text-red-500 text-sm float-start">
                {errors.email}
              </span>
            </div>
          )}
        />

        {/* Phone Number */}
        <Controller
          name="carerPhone"
          control={control}
          render={({ field }) => (
            <div className="w-full">
              <input
                {...field}
                id="phoneNumber"
                placeholder="Phone number"
                value={field.value || ""}
                type="tel"
                className={`w-full p-2 border rounded ${
                  errors.phoneNumber ? "border-red-500" : ""
                }`}
              />
              <span className="text-red-500 text-sm float-start">
                {errors.phoneNumber}
              </span>
            </div>
          )}
        />

        {/* Next Button */}
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
