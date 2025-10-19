interface ValueProps {
  icon: React.ReactNode; // Icon JSX for flexibility
  title: string; // Title of the value
  description: string; // Description of the value
}

const ValueCard: React.FC<ValueProps> = ({ icon, title, description }) => {
  return (
    <div className="flex flex-col items-center text-center py-1 md:p-4">
      <div className="w-16 h-16 bg-primary text-neutral-light rounded-full flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-navy min-h-16 sm:min-h-0">
        {title}
      </h3>
      <p className="text-sm text-neutral-500 mt-2 text-center md:text-center">
        {description}
      </p>
    </div>
  );
};

const ValuesSection: React.FC = () => {
  const values = [
    {
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={30}
          height={30}
          color={"currentColor"}
          fill={"none"}
        >
          <path
            d="M19 10C16.995 9.36815 14.5882 9 12 9C9.41179 9 7.00499 9.36815 5 10V13.5C7.00499 12.8682 9.41179 12.5 12 12.5C14.5882 12.5 16.995 12.8682 19 13.5V10Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M19 11V14.2611C19.1795 15.4395 19.8462 18.0707 22 20.091C21.2821 21.2694 18.8769 23.1213 15 21.1011"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M5 11V14.2611C4.82051 15.4395 4.15385 18.0707 2 20.091C2.71795 21.2694 5.12308 23.1213 9 21.1011"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M16.5 16V17.3488C16.5 18.7695 15.8365 20.086 14.7522 20.8169L13.8522 21.4236C12.7121 22.1921 11.2879 22.1921 10.1478 21.4236L9.24782 20.8169C8.16348 20.086 7.5 18.7695 7.5 17.3488V16"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M19 10L20.1257 9.4071C21.3888 8.57875 22.0203 8.16457 21.9995 7.57281C21.9787 6.98105 21.32 6.62104 20.0025 5.90101L15.2753 3.31756C13.6681 2.43919 12.8645 2 12 2C11.1355 2 10.3319 2.43919 8.72468 3.31756L3.99753 5.90101C2.68004 6.62104 2.02129 6.98105 2.0005 7.57281C1.9797 8.16457 2.61125 8.57875 3.87434 9.4071L5 10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ),
      title: "Personalized Learning",
      description:
        "Every student is unique. We tailor our teaching approach to meet individual learning styles and needs.",
    },

    {
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={30}
          height={30}
          color={"currentColor"}
          fill={"none"}
        >
          <path
            d="M6.08938 14.9992C5.71097 14.1486 5.5 13.2023 5.5 12.2051C5.5 8.50154 8.41015 5.49921 12 5.49921C15.5899 5.49921 18.5 8.50154 18.5 12.2051C18.5 13.2023 18.289 14.1486 17.9106 14.9992"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M12 1.99921V2.99921"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M22 11.9992H21"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 11.9992H2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M19.0704 4.92792L18.3633 5.63503"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5.6368 5.636L4.92969 4.92889"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14.517 19.3056C15.5274 18.9788 15.9326 18.054 16.0466 17.1238C16.0806 16.8459 15.852 16.6154 15.572 16.6154L8.47685 16.6156C8.18725 16.6156 7.95467 16.8614 7.98925 17.1489C8.1009 18.0773 8.3827 18.7555 9.45345 19.3056M14.517 19.3056C14.517 19.3056 9.62971 19.3056 9.45345 19.3056M14.517 19.3056C14.3955 21.2506 13.8338 22.0209 12.0068 21.9993C10.0526 22.0354 9.60303 21.0833 9.45345 19.3056"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      title: "Innovative Techniques",
      description:
        "We leverage modern teaching methods and technology to make learning engaging and effective.",
    },
    {
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={30}
          height={30}
          color={"currentColor"}
          fill={"none"}
        >
          <path
            d="M17.5 17.5L22 22"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M20 11C20 6.02944 15.9706 2 11 2C6.02944 2 2 6.02944 2 11C2 15.9706 6.02944 20 11 20C15.9706 20 20 15.9706 20 11Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M9.4924 7.5C8.77591 7.54342 8.31993 7.66286 7.99139 7.99139C7.66286 8.31993 7.54342 8.77591 7.5 9.4924M12.5076 7.5C13.2241 7.54342 13.6801 7.66286 14.0086 7.99139C14.3371 8.31993 14.4566 8.77591 14.5 9.4924M14.4923 12.6214C14.4431 13.273 14.3194 13.6978 14.0086 14.0086C13.6801 14.3371 13.2241 14.4566 12.5076 14.5M9.4924 14.5C8.7759 14.4566 8.31993 14.3371 7.99139 14.0086C7.6806 13.6978 7.55693 13.273 7.50772 12.6214"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      title: "Student-Centric Approach",
      description:
        "We focus on building confidence and fostering a positive learning environment for every student.",
    },
    {
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={30}
          height={30}
          color={"currentColor"}
          fill={"none"}
        >
          <path
            d="M11.8013 6.48949L13.2869 5.00392C14.9596 3.3312 17.1495 2.63737 19.4671 2.52399C20.3686 2.47989 20.8193 2.45784 21.1807 2.81928C21.5422 3.18071 21.5201 3.63143 21.476 4.53289C21.3626 6.8505 20.6688 9.04042 18.9961 10.7131L17.5105 12.1987C16.2871 13.4221 15.9393 13.77 16.1961 15.097C16.4496 16.1107 16.6949 17.0923 15.9578 17.8294C15.0637 18.7235 14.2481 18.7235 13.354 17.8294L6.17058 10.646C5.27649 9.75188 5.27646 8.9363 6.17058 8.04219C6.90767 7.30509 7.88929 7.55044 8.90297 7.80389C10.23 8.06073 10.5779 7.71289 11.8013 6.48949Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M16.9959 7H17.0049"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M2.5 21.5L7.5 16.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M8.5 21.5L10.5 19.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M2.5 15.5L4.5 13.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ),
      title: "Achieve Academic Goals",
      description:
        "Our mission is to help students reach their full potential and achieve their academic dreams.",
    },
    {
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={30}
          height={30}
          color={"currentColor"}
          fill={"none"}
        >
          <path
            d="M18 2V5M6 2V5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10.5 3.5H13.5C17.2712 3.5 19.1569 3.5 20.3284 4.67157C21.5 5.84315 21.5 7.72876 21.5 11.5V14C21.5 17.7712 21.5 19.6569 20.3284 20.8284C19.1569 22 17.2712 22 13.5 22H10.5C6.72876 22 4.84315 22 3.67157 20.8284C2.5 19.6569 2.5 17.7712 2.5 14V11.5C2.5 7.72876 2.5 5.84315 3.67157 4.67157C4.84315 3.5 6.72876 3.5 10.5 3.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 8H21"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8.44356 14.5282C10.0526 14.3279 11.3279 13.0526 11.5282 11.4436C11.5585 11.2 11.7545 11 12 11C12.2455 11 12.4415 11.2 12.4718 11.4436C12.6721 13.0526 13.9474 14.3279 15.5564 14.5282C15.8 14.5585 16 14.7545 16 15C16 15.2455 15.8 15.4415 15.5564 15.4718C13.9474 15.6721 12.6721 16.9474 12.4718 18.5564C12.4415 18.8 12.2455 19 12 19C11.7545 19 11.5585 18.8 11.5282 18.5564C11.3279 16.9474 10.0526 15.6721 8.44356 15.4718C8.19998 15.4415 8 15.2455 8 15C8 14.7545 8.19998 14.5585 8.44356 14.5282Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      title: "Flexible Scheduling",
      description:
        "We offer flexible tutoring sessions to fit into students' busy schedules and maximize productivity.",
    },
    {
      icon: (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width={30}
          height={30}
          color={"currentColor"}
          fill={"none"}
        >
          <path
            d="M12 22L10 16H2L4 22H12ZM12 22H16"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12 13V12.5C12 10.6144 12 9.67157 11.4142 9.08579C10.8284 8.5 9.88562 8.5 8 8.5C6.11438 8.5 5.17157 8.5 4.58579 9.08579C4 9.67157 4 10.6144 4 12.5V13"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M19 13C19 14.1046 18.1046 15 17 15C15.8954 15 15 14.1046 15 13C15 11.8954 15.8954 11 17 11C18.1046 11 19 11.8954 19 13Z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M10 4C10 5.10457 9.10457 6 8 6C6.89543 6 6 5.10457 6 4C6 2.89543 6.89543 2 8 2C9.10457 2 10 2.89543 10 4Z"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M14 17.5H20C21.1046 17.5 22 18.3954 22 19.5V20C22 21.1046 21.1046 22 20 22H19"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ),
      title: "Expert Tutors",
      description:
        "Our tutors are highly qualified and passionate about helping students excel in their academic journey.",
    },
  ];

  return (
    <section className="py-12  px-8">
      <div className="text-center mb-10">
        <p className="text-primary font-semibold text-sm">Our Values</p>
        <h2 className="text-3xl font-bold text-navy-dark mt-2">
          How we work at Tenacity Tutoring
        </h2>
        <p className="text-gray-500 mt-4 max-w-2xl mx-auto">
          We are committed to delivering the best tutoring experience to help
          students succeed academically and beyond.
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-8 px-2 max-w-6xl mx-auto">
        {values.map((value, index) => (
          <ValueCard
            key={index}
            icon={value.icon}
            title={value.title}
            description={value.description}
          />
        ))}
      </div>
    </section>
  );
};

export default ValuesSection;
