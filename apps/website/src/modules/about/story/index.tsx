import Image from "next/image";
import React from "react";

function Index() {
  return (
    <section className="py-12 bg-gray-50 px-8">
      <div className="text-center mb-10 flex flex-col items-center">
        <p className="text-primary font-semibold text-sm">Our Story</p>
        <h2 className="text-3xl font-bold text-navy-dark mt-2">
          How Tenacity Tutoring Started
        </h2>

        <Image
          src="/image/14 of 15.jpg"
          width={600}
          height={500}
          alt=""
          className="rounded-lg overflow-hidden my-4"
        />
      </div>

      <div className="max-w-4xl mx-auto text-gray-600 text-lg leading-relaxed px-4 mt-6 text-justify lg:text-start">
        <p className="mb-6">
          Welcome to Tenacity Tutoring, accompanying your child on their path to
          academic success! We are a Sydney based tutoring centre specialising
          in Maths and English for students between Years 5-10. We firmly
          believe in the power of tenacity – that determination and hard work
          are at the heart of every successful learning journey.
        </p>

        <p className="mb-6 text-justify lg:text-start">
          Our mantra,{" "}
          <span className="font-semibold italic">
            &apos;determination meets success&apos;
          </span>
          , embodies our commitment to fostering a learning environment that
          encourages students to strive for excellence. We understand that every
          student is unique, with individual strengths and areas for
          improvement. As such, we tailor our approach to each student’s
          specific needs, helping them not only overcome challenges, but
          discover the excitement of learning.
        </p>
      </div>
    </section>
  );
}

export default Index;
