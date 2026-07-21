export enum StudentYearsEnum {
  Year5 = "Year 5",
  Year6 = "Year 6",
  Year7 = "Year 7",
  Year8 = "Year 8",
  Year9 = "Year 9",
  Year10 = "Year 10",
  Year11 = "Year 11",
  Year12 = "Year 12",
}

export enum Subject {
  Math11Standard = "Math 11 Standard",
  Math11Advanced = "Math 11 Advanced",
  Math11Extension1 = "Math 11 Extension 1",
  Math12Standard = "Math 12 Standard",
  Math12Advanced = "Math 12 Advanced",
  Math12Extension1 = "Math 12 Extension 1",
  Math12Extension2 = "Math 12 Extension 2",
  Maths = "Maths",
  English = "English",
  // New English Subjects for Year 11 and Year 12
  // English11Standard = "English 11 Standard",
  // English11Advanced = "English 11 Advanced",
  // English11Extension1 = "English 11 Extension 1",
  // English12Standard = "English 12 Standard",
  // English12Advanced = "English 12 Advanced",
  // English12Extension1 = "English 12 Extension 1",
  // English12Extension2 = "English 12 Extension 2",
}

export enum DaysOfWeekEnum {
  Monday = "Monday",
  Tuesday = "Tuesday",
  Wednesday = "Wednesday",
  Thursday = "Thursday",
  Friday = "Friday",
}

// export type Class
export type Class = {
  id: string;
  type: string;
  enrolledStudents: string[];
  startTime: string;
  endTime: string;
  capacity: number;
  day: DaysOfWeekEnum;
};
