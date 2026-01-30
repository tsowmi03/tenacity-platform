import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Step1Year from "../Step1Year";
import Step2Subject from "../Step2Subject";
import { Class, StudentYearsEnum, Subject } from "../constants";
import Step3ClassSlots from "../Step3ClassSlots";
import Step4Student from "../Step4Student";
import Step5Carer from "../Step5Carer";
import Step6AdditionalInfo from "../Step6AdditionalInfo";
import Link from "next/link";
import ArrowRight from "@modules/common/icons/arrow-right";
import X from "@modules/common/icons/x";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Step1 from "../../../../public/animation/step1.json";
import Step2 from "../../../../public/animation/step2.json";
import Step3 from "../../../../public/animation/step3.json";
import Step4 from "../../../../public/animation/step4.json";
import Step5 from "../../../../public/animation/step5.json";
import Step6 from "../../../../public/animation/step6.json";
import { db } from "@lib/firebaseConfig";
import { addDoc, collection, getDocs } from "firebase/firestore";
// import { sendNotification } from "@lib/utils/apiHelper";
import { CircularProgress } from "@mui/material";

export type EnrolmentFormData = {
  carerFirstName: string;
  carerLastName: string;
  carerEmail: string;
  carerPhone: string;
  studentFirstName: string;
  studentLastName: string;
  // studentDOB: string;
  studentYear: StudentYearsEnum | "";
  studentSubjects: Subject[];
  classes: Class[];
  emergencyContactFirstName: string;
  emergencyContactLastName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  permissionToLeave: boolean;
  allergies: string;
  additionalInfo: string;
  termsAccepted: boolean;
  archived?: boolean;
};

const LottiePlayer = dynamic(() => import("lottie-react"), { ssr: false });

const canSelectMultipleSubjects = (year: StudentYearsEnum) => {
  return year !== StudentYearsEnum.Year11 && year !== StudentYearsEnum.Year12;
};

const EnrolmentForm = () => {
  const [step, setStep] = useState(1);
  const [classes, setClasses] = useState<Class[]>([]);
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchSlots = async () => {
      const slotsRef = collection(db, "classes");

      const querySnapshot = await getDocs(slotsRef);
      const classesData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      console.log("slotsData", querySnapshot, classesData);
      setClasses(classesData as Class[]);
    };

    fetchSlots();
  }, []);

  // useEffect(() => {
  //   const fetchSlots = async () => {
  //     const slotsRef = collection(db, "enrolments");
  //     const querySnapshot = await getDocs(slotsRef);
  //     const enrolments = querySnapshot.docs.map((doc) => ({
  //       id: doc.id,
  //       ...doc.data(),
  //     }));

  //     console.log("enrolments", querySnapshot, enrolments);
  //   };

  //   fetchSlots();
  // }, []);

  const { control, handleSubmit, watch, setValue } = useForm<EnrolmentFormData>(
    {
      defaultValues: {
        carerFirstName: "",
        carerLastName: "",
        carerEmail: "",
        carerPhone: "",
        studentFirstName: "",
        studentLastName: "",
        // studentDOB: "",
        classes: [],
        studentYear: "",
        studentSubjects: [],
        emergencyContactFirstName: "",
        emergencyContactLastName: "",
        emergencyContactPhone: "",
        emergencyContactRelation: "",
        permissionToLeave: false,
        allergies: "",
        additionalInfo: "",
        termsAccepted: false,
        archived: false,
      },
    }
  );

  const studentYear = watch("studentYear");

  const onSubmit = async (data: EnrolmentFormData) => {
    setIsSubmitting(true);
    // const details = [
    //   `Student: ${data.studentFirstName} ${data.studentLastName} (Year ${data.studentYear})`,
    //   `Date of Birth: ${data.studentDOB}`,
    //   `Subjects: ${data.studentSubjects.join(", ")}`,
    //   `Classes: ${data.classes.length} selected ${
    //     data.classes.length > 0
    //       ? data.classes
    //           .map(
    //             (c) =>
    //               `${c.id} (${c.type}) - ${c.day} ${c.startTime}- ${c.endTime}`
    //           )
    //           .join(", ")
    //       : ""
    //   }`,
    //   `Carer: ${data.carerFirstName} ${data.carerLastName}`,
    //   `Carer Contact: ${data.carerEmail} ${data.carerPhone}`,
    //   `Emergency Contact: ${data.emergencyContactFirstName} ${data.emergencyContactLastName} (${data.emergencyContactRelation})`,
    //   `Emergency Phone: ${data.emergencyContactPhone}`,
    //   `Permission to Leave: ${data.permissionToLeave}`,
    //   `Allergies: ${data.allergies}`,
    //   `Additional Info: ${data.additionalInfo}`,
    // ];
    try {
      // use firebase to add the data to the database
      await addDoc(collection(db, "enrolments"), {
        ...data,
        archived: false,
      });
      // await sendNotification(details);
      setIsSubmitting(false);

      router.push("/thank-you");
    } catch (error) {
      console.error("Error submitting enrolment:", error);
      setIsSubmitting(false);
      alert("Failed to submit enrolment.");
    }
  };

  const handlePrevStep = () => {
    setStep((prev) => prev - 1);
  };

  useEffect(() => {
    //scroll to top on step change
    window.scrollTo(0, 0);
  }, [step]);

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div key="step1">
            <Step1Year
              onYearSelect={(year) => {
                setValue("studentYear", year);
                setValue("studentSubjects", []); // Reset subjects on year change
                setValue("classes", []); // Reset class on year change
                setStep(2);
              }}
            />
          </div>
        );
      case 2:
        return (
          <div key="step2">
            <Step2Subject
              onSubjectSelect={(subject) => {
                const currentSubjects = watch("studentSubjects");
                if (
                  canSelectMultipleSubjects(studentYear as StudentYearsEnum)
                ) {
                  if (currentSubjects.includes(subject)) {
                    setValue(
                      "studentSubjects",
                      currentSubjects.filter((s) => s !== subject)
                    );
                  } else {
                    setValue("studentSubjects", [...currentSubjects, subject]);
                  }
                } else {
                  setValue("studentSubjects", [subject]);
                  setStep(3);
                }

                setValue("classes", []); // Reset class on year change
              }}
              year={studentYear as StudentYearsEnum}
              selectedSubjects={watch("studentSubjects") as Subject[]}
              handleNextClick={
                canSelectMultipleSubjects(studentYear as StudentYearsEnum)
                  ? () => setStep(3)
                  : undefined
              }
            />
          </div>
        );
      case 3:
        return (
          <div key="step3">
            <Step3ClassSlots
              onClassSlotChoice={(classSlot) => {
                const currentClasses = watch("classes");

                if (watch("studentSubjects")?.length > 1) {
                  let newClasses = [];
                  if (currentClasses.map((c) => c.id).includes(classSlot.id)) {
                    newClasses = currentClasses.filter(
                      (c) => c.id !== classSlot.id
                    );
                  } else {
                    if (
                      currentClasses.length === watch("studentSubjects")?.length
                    ) {
                      return;
                    }
                    newClasses = [...currentClasses, classSlot];
                  }
                  setValue("classes", newClasses);
                  if (newClasses.length === watch("studentSubjects")?.length) {
                    setStep(4);
                  }
                } else {
                  setValue("classes", [classSlot]);
                  setStep(4);
                }
              }}
              year={watch("studentYear") as StudentYearsEnum}
              subjects={watch("studentSubjects") as Subject[]}
              classes={classes}
              selectedClasses={watch("classes") as Class[]}
              handleNext={() => setStep(4)}
            />
          </div>
        );
      case 4:
        return (
          <div key="step4">
            <Step4Student
              control={control}
              watch={watch}
              handleNext={() => setStep(5)}
            />
          </div>
        );
      case 5:
        return (
          <div key="step5">
            <Step5Carer
              control={control}
              watch={watch}
              handleNext={() => setStep(6)}
            />
          </div>
        );
      case 6:
        return (
          <div key="step6">
            <Step6AdditionalInfo
              control={control}
              watch={watch}
              handleNext={handleSubmit(onSubmit)}
              isSubmitting={isSubmitting}
            />
          </div>
        );

      default:
        return null;
    }
  };

  const renderStepAnimation = () => {
    switch (step) {
      case 1:
        return Step1;
      case 2:
        return Step2;
      case 3:
        return Step3;
      case 4:
        return Step4;
      case 5:
        return Step5;
      case 6:
        return Step6;
      default:
        return null;
    }
  };

  return (
    <div className="w-full flex flex-col md:flex-row md:h-[100vh]">
      <div className="bg-primary-light min-w-[50%] flex text-center justify-center items-center p-16 md:p-0 h-[30vh] md:h-screen">
        {renderStepAnimation() && (
          <LottiePlayer
            animationData={renderStepAnimation()}
            loop={true}
            autoplay
            className="w-40 md:w-72"
          />
        )}
      </div>
      <div className="min-w-[50%] max-w-[100%] mx-auto p-6  rounded py-8 md:pb-16 md:pt-24 md:h-screen relative">
        {isSubmitting && (
          <div className="absolute inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center flex-col">
            <CircularProgress />
            <p className="mt-4 text-white font-semibold">
              Submitting your enrolment...
            </p>
          </div>
        )}{" "}
        <div className="mb-16 flex justify-between items-center gap-4">
          <button
            id="prevButton"
            type="button"
            onClick={handlePrevStep}
            disabled={step === 1}
            className={`px-2 py-2 text-primary rounded hover:bg-primary-lighter transition-all duration-300 ${
              step === 1 ? "opacity-0" : ""
            }`}
          >
            <ArrowRight className="rotate-180" />
          </button>
          <div className="flex justify-between items-center w-full overflow-x-clip bg-gray-300 rounded-full">
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <div
                key={s}
                className={`h-2 flex-1  ${
                  step >= s ? "bg-primary animate-slideInRight" : "bg-gray-300"
                }
              ${step === s || s === 6 ? "rounded-r-full" : "w-4"}
               ${s === 1 ? "rounded-l-full" : "w-4"}  `}
              />
            ))}
          </div>
          {
            <Link
              href="/"
              passHref
              id="close"
              onClick={handlePrevStep}
              className="px-2 py-2 text-primary rounded hover:bg-primary-lighter transition-all duration-300"
            >
              <X />
            </Link>
          }
        </div>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="md:h-[75vh] overflow-y-auto"
        >
          {renderStep()}
        </form>
      </div>
    </div>
  );
};

export default EnrolmentForm;
