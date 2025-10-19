import { useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { Listbox } from "@headlessui/react";
import ChevronDown from "@modules/common/icons/chevron-down";
import CurvyButton from "@modules/common/components/curvy-button";
import Calendar from "@modules/common/icons/calendar";
import { sendEmailForm } from "@lib/utils/apiHelper";
import { StudentYearsEnum } from "@modules/register/constants";

// Reusable Text Input Component
const TextInput = ({
  label,
  placeholder,
  register,
  required,
  errorMessage,
  className = "",
}: {
  label?: string;
  placeholder: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  required?: boolean;
  errorMessage?: string;
  className?: string;
}) => {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-sm text-navy">{label}</label>}
      <input
        {...register}
        placeholder={placeholder}
        required={required}
        className="w-full bg-neutral-200 border border-primary rounded-md p-3 focus:ring-1 focus:ring-primary text-navy focus:outline-none"
      />
      {errorMessage && (
        <span className="text-red-500 text-xs">{errorMessage}</span>
      )}
    </div>
  );
};

// Reusable Dropdown Component
const Dropdown = ({
  label,
  options,
  selected,
  onChange,
  className = "",
  placeHolder,
  errorMessage,
  register,
}: {
  label?: string;
  options: { value: string; label: string }[];
  selected: string;
  onChange: (value: string) => void;
  className?: string;
  placeHolder?: string;
  errorMessage?: string; // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register?: any;
}) => {
  return (
    <div className={`relative ${className}`}>
      {label && <label className="text-sm text-navy mb-1 block">{label}</label>}
      <input type="hidden" {...register} />
      <Listbox value={selected} onChange={onChange}>
        <div className="relative">
          <Listbox.Button
            className={`w-full bg-neutral-200 border border-primary rounded-md p-3  text-left flex justify-between items-center focus:ring-1 focus:ring-primary text-navy ${
              options.find((option) => option.value === selected)?.label
                ? ""
                : "text-opacity-60"
            }`}
          >
            {options.find((option) => option.value === selected)?.label ||
              placeHolder ||
              "Select"}
            <ChevronDown className="w-5 h-5 text-primary" />
          </Listbox.Button>
          <Listbox.Options className="absolute z-10 w-full bg-primary-dark border border-primary rounded-md mt-1 shadow-lg text-white overflow-clip max-h-[30vh] overflow-y-scroll">
            {options.map((option) => (
              <Listbox.Option
                key={option.value}
                value={option.value}
                className={({ active }) =>
                  `p-2 cursor-pointer ${active ? "bg-white text-primary" : ""}`
                }
              >
                {option.label}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </div>
      </Listbox>
      {errorMessage && (
        <span className="text-red-500 text-xs">{errorMessage}</span>
      )}
    </div>
  );
};

// Main Form Component
type FormInputs = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  year: string;
  email: string;
  message: string;
};

const DemoForm: React.FC = () => {
  // Add loading, success and error states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormInputs>();

  const onSubmit: SubmitHandler<FormInputs> = (data) => {
    // Reset states and start loading
    setIsSubmitting(true);
    setSubmitSuccess(false);
    setSubmitError(null);

    //mock api call
    sendEmailForm({
      name: data.firstName + " " + data.lastName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      additionalInfo: data.message,
      reason: "Enquiry Request for " + data.year,
    })
      .then((res) => {
        console.log(res);
        setSubmitSuccess(true);
        reset(); // Clear form on success
      })
      .catch((err) => {
        console.log(err);
        setSubmitError("Failed to send your message. Please try again later.");
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  return (
    <div
      id="contact"
      className="text-center md:text-left w-full grid grid-cols-1 md:grid-cols-2 gap-8 bg-navy text-white p-6  shadow-md lg:px-16 md:py-20"
    >
      <div>
        <h2 className="text-3xl md:text-[2.5rem] font-bold text-primary-light leading-normal">
          Inspire <span className="text-neutral-light">Growth</span>
        </h2>
        <p className="text-3xl md:text-[2.5rem] font-semibold">
          Through Expert Tutoring!
        </p>
      </div>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-2 gap-5"
      >
        {/* Form fields remain the same... */}
        <TextInput
          placeholder="First name*"
          register={register("firstName", {
            required: "First name is required",
          })}
          errorMessage={errors.firstName?.message}
        />
        <TextInput
          placeholder="Last name*"
          register={register("lastName", {
            required: "Last name is required",
          })}
          errorMessage={errors.lastName?.message}
        />
        <div className="col-span-1">
          <TextInput
            placeholder="Phone number*"
            register={register("phoneNumber", {
              required: "Phone number is required",
            })}
            errorMessage={errors.phoneNumber?.message}
          />
        </div>
        <Dropdown
          options={Object.entries(StudentYearsEnum).map(([value, label]) => ({
            value,
            label,
          }))}
          selected={watch("year")}
          onChange={(val) => {
            setValue("year", val);
          }}
          className="col-span-1"
          placeHolder="Year"
          errorMessage={errors.year?.message}
          register={register("year", {})}
        />
        <TextInput
          placeholder="Email"
          register={register("email", {
            pattern: {
              value: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/,
              message: "Enter a valid email address",
            },
          })}
          errorMessage={errors.email?.message}
          className="col-span-2"
        />
        <textarea
          {...register("message")}
          placeholder="Your message"
          className="col-span-2 bg-neutral-200 border border-primary rounded-md p-2 focus:ring-1 focus:outline-none focus:ring-primary text-navy"
        />

        {/* Status messages */}
        {submitSuccess && (
          <div className="col-span-2 bg-green-700/30 p-3 rounded text-green-300 font-medium">
            Thank you! Your message has been sent successfully.
          </div>
        )}
        {submitError && (
          <div className="col-span-2 bg-red-700/30 p-3 rounded text-red-300 font-medium">
            {submitError}
          </div>
        )}

        <CurvyButton
          type="submit"
          disabled={isSubmitting}
          className={`!bg-primary-lighter !font-medium text-navy py-2.5 px-8 rounded-full justify-center w-max ${
            isSubmitting ? "opacity-70 cursor-not-allowed" : ""
          }`}
        >
          {isSubmitting ? (
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Submitting...
            </div>
          ) : (
            <>
              <Calendar />
              Get in touch
            </>
          )}
        </CurvyButton>
      </form>
    </div>
  );
};

export default DemoForm;
