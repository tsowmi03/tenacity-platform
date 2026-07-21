import TeamCard from "@modules/common/components/team-card";
import Email from "@modules/common/icons/email";
import Linkedin from "@modules/common/icons/linkedin";
import React from "react";

const thomas_contacts = [
  { url: "mailto:tom@tenacitytutoring.com", icon: <Email /> },
  {
    url: "https://www.linkedin.com/in/thomas-sowmi-4881b934a/",
    icon: <Linkedin />,
  },
];

const josh_contacts = [
  { url: "mailto: josh@tenacitytutoring.com", icon: <Email /> },
  {
    url: "https://www.linkedin.com/in/joshua-sowmi-386110354/",
    icon: <Linkedin />,
  },
];

const TomDescription = (
  <div>
    Tom is in the final stage of his double degree in Law and Computer Science
    at UNSW. Excelling in HSC Extension 2 English and Extension 1 Maths, he
    continues to hone his communication and problem solving skills at
    university. Since 2020, Tom has been a dedicated tutor, known for his
    ability to simplify complex concepts and tailor his teaching to each
    student’s unique learning style.
    <br /> <br /> His approach goes beyond improving grades – he strives to
    build confidence and foster genuine understanding. A recent mission trip to
    Fiji deepened Tom’s passion for mentorship as he worked closely with the
    local youth, reinforcing his commitment to helping students reach their full
    potential. With a proven track record and an engaging, adaptable teaching
    style, Tom ensures every tutoring session is productive, personalised, and
    fun.
  </div>
);

const JoshDescription = (
  <div>
    Josh is a passionate educator and co-owner of Tenacity tutoring, dedicated
    to helping students reach their full potential. With five years of tutoring
    experience and a strong background in advanced mathematics as an actuarial
    student, Josh brings both expertise and enthusiasm to the classroom. <br />{" "}
    <br /> Beyond academics, Josh has a heart for mentoring young minds, having
    volunteered as a kids’ soccer coach and participated in service trips to
    Peru and Kenya. These experiences have reinforced a deep commitment to
    education, leadership, and personal growth. At Tenacity Tutoring, Josh
    strives to create a supportive and engaging learning environment where
    students can build confidence and excel in their studies.
  </div>
);

function Index() {
  return (
    <div className="bg-gray-50 py-12" id="team">
      <div className="md:w-3/5 mx-auto  px-8">
        <div className="text-center mb-10">
          <p className="text-primary font-semibold text-sm">Our Team</p>
          <h2 className="text-3xl font-bold text-navy mt-2">
            Who we are at Tenacity Tutoring
          </h2>
          <p className="text-gray-500 mt-4 max-w-2xl mx-auto ">
            Our tutors, Josh and Tom, bring their exceptional academic
            backgrounds, compassionate teaching styles, and personal experiences
            to our school. They both exemplify the values of tenacity and
            dedication in their respective fields, inspiring students to reach
            their potential – while cracking a few jokes along the way!
          </p>
        </div>

        <div className="flex-col justify-center mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 mb-4">
            <TeamCard
              name="Thomas Sowmi"
              jobTitle="Head Tutor"
              imageSrc="/Tom Headshot-1.png"
              socialLinks={thomas_contacts}
            />
            <div className="pt-8  md:pt-0 md:pl-8 text-navy-dark">
              <div className="mb-4 font-bold">Thomas Sowmi</div>
              {TomDescription}
            </div>
          </div>
          <hr className="mx-[5%] w-[90%] my-8"></hr>

          <div className="grid grid-cols-1 md:grid-cols-2 mb-8  text-navy-dark">
            <div className="pr-8 hidden md:block">
              <div className="mb-4 font-bold">Josh Sowmi</div>
              {JoshDescription}
            </div>
            <TeamCard
              name="Josh Sowmi"
              jobTitle="Head Tutor"
              imageSrc="/Josh Headshot-6_CLOSE.png"
              socialLinks={josh_contacts}
            />
            <div className="pt-8  md:pt-0 md:pl-8 md:hidden">
              <div className="mb-4 font-bold">Josh Sowmi</div>
              {JoshDescription}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Index;
