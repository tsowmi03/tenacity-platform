import React, { useEffect } from "react";
import { StudentYearsEnum } from "../constants";
import { useRouter } from "next/navigation";

interface Props {
  onYearSelect: (year: StudentYearsEnum) => void;
}

function Index(props: Props) {
  const { onYearSelect } = props;
  const router = useRouter();
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const year = urlParams.get("year");
    if (year) {
      onYearSelect(("Year " + year) as StudentYearsEnum);
    }
    //remove the year query param from the url
    urlParams.delete("year");

    router.push(window.location.pathname);
  }, []);

  return (
    <div>
      <div className="text-primary text-3xl font-bold text-center">
        Which level are you looking for?
      </div>
      {/* <div className="text-base text-gray-500 text-center font-semibold mt-2">
        We&apos;ll find you an expert tutor from our network – which covers over
        30+ subjects.
      </div> */}
      <div className="grid grid-cols-2 gap-4 mt-8 text-center md:mx-16">
        {Object.values(StudentYearsEnum).map((year, index) => (
          <button
            type="button"
            key={year + index}
            className="text-navy border-2 cursor-pointer rounded-md border-white py-4 px-2 bg-white md:hover:border-primary transition-all duration-300"
            onClick={() => onYearSelect(year)}
          >
            {year}
          </button>
        ))}
      </div>
    </div>
  );
}

export default Index;
