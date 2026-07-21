import React from "react";
import { IconProps } from "types/icon";

const Profitable: React.FC<IconProps> = ({
  size = "20",
  color = "currentColor",
  ...attributes
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 34 34"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...attributes}
    >
      <path
        d="M2 32H32M6 26.7853V22M14.5 26.7853V16"
        stroke={color}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 27L24 3"
        stroke={color}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17 8.49988L24.0002 1.49963L31.0005 8.49988"
        stroke={color}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default Profitable;
