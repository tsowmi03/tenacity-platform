import React from "react";
import { IconProps } from "types/icon";

const ArrowRightSmall: React.FC<IconProps> = ({
  size = "20",
  color = "currentColor",
  ...attributes
}) => {
  return (
    <svg
      width={size}
      height={size}
      color={color}
      viewBox="0 0 6 9"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...attributes}
    >
      <path
        d="M1.87281 7.69177L4.16493 5.39965C4.55546 5.00912 4.55546 4.37596 4.16493 3.98543L1.87281 1.69331"
        stroke="currentColor"
        strokeWidth="2.06897"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default ArrowRightSmall;
