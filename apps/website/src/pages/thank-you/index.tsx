import dynamic from "next/dynamic";
import React from "react";
import success from "../../../public/animation/Success.json";
import CurvyButton from "@modules/common/components/curvy-button";
import Link from "next/link";

const LottiePlayer = dynamic(() => import("lottie-react"), { ssr: false });

function Index() {
  return (
    <>
      <div className="h-16 bg-primary-dark"></div>
      <div className="w-full flex flex-col justify-center items-center my-16 px-8 text-center">
        <LottiePlayer
          animationData={success}
          loop={true}
          autoplay
          className=" w-72"
        />
        <span className="text-4xl text-navy font-bold">
          Thanks for submitting!
          <br />
        </span>
        <br />
        <span className="text-lg text-primary">
          A member of our team will contact you shortly.
        </span>{" "}
        <br /> <br />
        <CurvyButton className="text-white bg-navy py-2 px-10">
          <Link href="/">Go back home</Link>
        </CurvyButton>
      </div>
    </>
  );
}

export default Index;
