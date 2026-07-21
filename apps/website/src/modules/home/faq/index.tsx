import React, { useState } from "react";

const FAQ = () => {
  const faqs = [
    {
      question: "What is the tuition fee?",
      answer:
        "The tuition fee for Primary School students is $60/hr. For high school students, the fee is $70/hr. Note also that we offer a sibling and second-hour discount of $10/hr.",
    },
    {
      question: "How long is each session?",
      answer:
        "For students in Years 5-10, the sessions run for one hour. Our HSC classes run for 90 minutes to accomodate the more difficult content.",
    },
    {
      question: "What if my child misses a lesson?",
      answer:
        "We endeavour to ensure that students who miss lessons are caught up on any work missed, however we cannot guarantee that we will be able to provide a make-up lesson due to our packed timetable.",
    },
    {
      question: "What should each student bring?",
      answer:
        "Our English students are encouraged to bring their laptops. Other than that, just the completed homework from the previous week!",
    },
    {
      question: "Why four students in a class?",
      answer:
        "A maximum of four children in our Year 5-10 classes is encouraged so as to promote interaction, sharing, peer teaching, team building, cooperative learning and friendly competition, while the 2:1 student to tutor ratio allows us to maintain a closely personal teaching style.",
    },
    {
      question: "How important is homework?",
      answer:
        "Homework is essential for students to consolidate their learning at home. It is an expectation that all homework given is completed to maximise the student's learning capacity.",
    },
    {
      question: "How can I get started?",
      answer:
        "Complete the Registration Form on this website and one of our tutors will contact you!",
    },
    {
      question: "How do you select your tutors?",
      answer:
        "We carefully select our tutors based on their academic capability, as well as their teaching ability. We thoroughly examine them both in academics and their ability to connect with the kids!",
    },
    {
      question: "What subjects do you offer?",
      answer:
        "We offer Maths and English from Years 5-10, as well as Standard and Advanced Maths at the Year 11 and 12 levels.",
    },
    {
      question: "Where does tutoring take place?",
      answer:
        "Tutoring currently takes places at our residential address in Narwee/Beverly Hills. A section of the residence has been carefully renovated and furnished to suit our students' tutoring needs.",
    },
    {
      question: "Is there a satisfaction guarantee?",
      answer:
        "Yes! We're committed to your child's success. If you aren't satisfied with a session, we'll work with you to address your concerns.",
    },
  ];

  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number | null) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <div className="text-center my-8 px-6 md:px-16" id="faq">
      <div className="text-center text-2xl lg:text-4xl font-bold text-navy mb-16">
        Frequently Asked Questions{" "}
      </div>
      <div className="w-full mx-auto bg-primary-lighter bg-opacity-60 shadow-lg rounded-3xl p-2 px-6">
        <div>
          {faqs.map((faq, index) => (
            <div
              key={index}
              className={`py-4 ${
                index !== faqs.length - 1
                  ? "border-b-[1px] border-gray-300 border-opacity-70 "
                  : ""
              }`}
            >
              <button
                className="w-full text-left  px-3 font-semibold text-lg flex items-center gap-3 "
                onClick={() => toggleAccordion(index)}
              >
                <svg
                  className={`w-5 h-5 transition-transform text-gray-400 ${
                    activeIndex === index ? "rotate-45" : "rotate-0"
                  }`}
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span>{faq.question}</span>
              </button>
              <div
                className={`px-5 pl-[2.8rem] text-start text-gray-500 overflow-hidden transition-all ease-in-out duration-500 font-semibold  ${
                  activeIndex === index ? "max-h-screen" : "max-h-0 "
                }`}
              >
                <span className="block h-3 "></span>
                {faq.answer}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FAQ;
