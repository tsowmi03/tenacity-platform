import Head from "@modules/common/components/head";
import DemoForm from "@modules/home/contact-form";
import React from "react";
import animation from "../../../public/animation/contact.json";
import dynamic from "next/dynamic";
const LottiePlayer = dynamic(() => import("lottie-react"), { ssr: false });

function Index() {
  return (
    <div className="">
      <div className="flex text-center flex-col justify-center items-center align-middle bg-primary-light pt-16">
        <h1 className="text-4xl font-bold text-white uppercase">CONTACT US</h1>
        <LottiePlayer
          animationData={animation}
          loop={5}
          autoplay
          className="w-48 md:w-72"
        />
      </div>{" "}
      <Head />
      <div className="content-container flex flex-col items-center my-16 text-center">
        <p className="max-w-2xl mb-4 text-navy-dark text-2xl mx-4">
          Have a question? Want to know more about our programs? Just want to
          say hi? Fill out the form below and we&apos;ll get back to you as soon
          as possible!
        </p>
      </div>
      <DemoForm />
    </div>
  );
}

export default Index;
