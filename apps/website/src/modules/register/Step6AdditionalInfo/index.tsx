import React, { useEffect, useState } from "react";
import { Control, Controller, UseFormWatch } from "react-hook-form";
import { EnrolmentFormData } from "../form";
import Link from "next/link";

interface Props {
  control: Control<EnrolmentFormData, unknown>;
  handleNext: () => void;
  watch: UseFormWatch<EnrolmentFormData>;
  isSubmitting: boolean;
  turnstileRef?: React.RefObject<HTMLDivElement>;
  turnstileError?: string;
}

function Index(props: Props) {
  const {
    control,
    handleNext,
    watch,
    isSubmitting,
    turnstileRef,
    turnstileError,
  } = props;
  const [errors, setErrors] = useState({
    emergencyContactFirstName: "",
    emergencyContactLastName: "",
    emergencyContactPhone: "",
    emergencyContactRelation: "",
    termsAccepted: "",
  });

  const carerFirstName = watch("carerFirstName");
  const carerLastName = watch("carerLastName");
  const carerPhone = watch("carerPhone");

  const [isSameAsCarer, setIsSameAsCarer] = useState(false);

  useEffect(() => {
    if (isSameAsCarer) {
      control._formValues.emergencyContactFirstName = carerFirstName || "";
      control._formValues.emergencyContactLastName = carerLastName || "";
      control._formValues.emergencyContactPhone = carerPhone || "";
    }
  }, [
    isSameAsCarer,
    carerFirstName,
    carerLastName,
    carerPhone,
    control._formValues,
  ]);

  const handleClick = () => {
    const formValues = control._formValues;

    if (
      !formValues.emergencyContactFirstName ||
      !formValues.emergencyContactLastName ||
      !formValues.emergencyContactPhone ||
      !formValues.emergencyContactRelation
    ) {
      setErrors((prev) => ({
        ...prev,
        emergencyContactFirstName: !formValues.emergencyContactFirstName
          ? "Please enter the first name"
          : "",
        emergencyContactLastName: !formValues.emergencyContactLastName
          ? "Please enter the last name"
          : "",
        emergencyContactPhone: !formValues.emergencyContactPhone
          ? "Please enter the phone number"
          : "",
        emergencyContactRelation: !formValues.emergencyContactRelation
          ? "Please enter the relationship"
          : "",
      }));
      return;
    }

    if (!formValues.termsAccepted) {
      setErrors((prev) => ({
        ...prev,
        termsAccepted: "Please accept the terms and conditions",
      }));
      return;
    }
    handleNext();
  };

  return (
    <div>
      <div className="text-primary text-3xl font-bold text-center">
        Emergency Contact Details
      </div>

      <div className="grid grid-cols-1 gap-4 mt-8 text-center justify-center justify-items-center md:mx-[20%]">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="sameAsCarer"
            checked={isSameAsCarer}
            onChange={(e) => setIsSameAsCarer(e.target.checked)}
          />
          <label htmlFor="sameAsCarer" className="text-sm text-gray-600">
            Same as Carer
          </label>
        </div>

        {/* Emergency Contact First Name */}
        <Controller
          name="emergencyContactFirstName"
          control={control}
          render={({ field }) => (
            <div className="w-full">
              <input
                {...field}
                id="emergencyContactFirstName"
                placeholder="First Name"
                value={isSameAsCarer ? carerFirstName : field.value || ""}
                disabled={isSameAsCarer}
                className={`w-full p-2 border rounded ${
                  errors.emergencyContactFirstName ? "border-red-500" : ""
                }`}
              />
              <span className="text-red-500 text-sm">
                {errors.emergencyContactFirstName}
              </span>
            </div>
          )}
        />

        {/* Emergency Contact Last Name */}
        <Controller
          name="emergencyContactLastName"
          control={control}
          render={({ field }) => (
            <div className="w-full">
              <input
                {...field}
                id="emergencyContactLastName"
                placeholder="Last Name"
                value={isSameAsCarer ? carerLastName : field.value || ""}
                disabled={isSameAsCarer}
                className={`w-full p-2 border rounded ${
                  errors.emergencyContactLastName ? "border-red-500" : ""
                }`}
              />
              <span className="text-red-500 text-sm">
                {errors.emergencyContactLastName}
              </span>
            </div>
          )}
        />

        {/* Emergency Contact Phone Number */}
        <Controller
          name="emergencyContactPhone"
          control={control}
          render={({ field }) => (
            <div className="w-full">
              <input
                {...field}
                id="emergencyContactPhone"
                placeholder="Phone Number"
                value={isSameAsCarer ? carerPhone : field.value || ""}
                disabled={isSameAsCarer}
                className={`w-full p-2 border rounded ${
                  errors.emergencyContactPhone ? "border-red-500" : ""
                }`}
              />
              <span className="text-red-500 text-sm">
                {errors.emergencyContactPhone}
              </span>
            </div>
          )}
        />

        {/* Emergency Contact Relationship */}
        <Controller
          name="emergencyContactRelation"
          control={control}
          render={({ field }) => (
            <div className="w-full">
              <input
                {...field}
                id="emergencyContactRelation"
                placeholder="Relationship to Student"
                className={`w-full p-2 border rounded ${
                  errors.emergencyContactRelation ? "border-red-500" : ""
                }`}
              />
              <span className="text-red-500 text-sm">
                {errors.emergencyContactRelation}
              </span>
            </div>
          )}
        />
      </div>

      <div className="text-primary text-3xl font-bold text-center mt-8">
        Additional Information
      </div>

      <div className="grid grid-cols-1 gap-4 mt-4 text-center justify-center justify-items-center md:mx-[10%]">
        {/* Permission to Leave */}
        <Controller
          name="permissionToLeave"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                {...{ ...field, value: undefined }}
                id="permissionToLeave"
                checked={field.value}
              />
              <label
                htmlFor="permissionToLeave"
                className="text-sm text-gray-600"
              >
                Does the student have permission to make their own way home?
              </label>
            </div>
          )}
        />

        {/* Allergies */}
        <Controller
          name="allergies"
          control={control}
          render={({ field }) => (
            <textarea
              {...field}
              id="allergies"
              placeholder="Does the student have any allergies or medical conditions?"
              className="w-full p-2 border rounded resize-none"
            />
          )}
        />

        {/* Additional Info */}
        <Controller
          name="additionalInfo"
          control={control}
          render={({ field }) => (
            <textarea
              {...field}
              id="additionalInfo"
              placeholder="Is there anything else you'd like us to know?"
              className="w-full p-2 border rounded resize-none"
            />
          )}
        />

        {/* Terms and Conditions */}
        <Controller
          name="termsAccepted"
          control={control}
          rules={{ required: "Please accept the terms and conditions" }}
          render={({ field }) => (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 ">
                <input
                  type="checkbox"
                  {...{ ...field, value: undefined }}
                  id="termsAccepted"
                  checked={field.value}
                />
                <label
                  htmlFor="termsAccepted"
                  className="text-sm text-gray-600"
                >
                  I accept the{" "}
                  <Link
                    className="text-primary cursor-pointer"
                    href="/T&Cs.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    terms and conditions
                  </Link>
                </label>
              </div>{" "}
              <span className="text-red-500 text-sm">
                {errors.termsAccepted}
              </span>
            </div>
          )}
        />

        <div className="w-full flex flex-col items-center">
          <div ref={turnstileRef} />
          {turnstileError ? (
            <span className="text-red-500 text-sm">{turnstileError}</span>
          ) : null}
        </div>

        {/* Next Button */}
        <button
          className="w-full text-white border-2 cursor-pointer rounded-md border-primary py-2 px-2 bg-primary hover:border-navy transition-all duration-300"
          onClick={handleClick}
          type="button"
          disabled={isSubmitting}
        >
          Submit!
        </button>
      </div>
    </div>
  );
}

export default Index;
