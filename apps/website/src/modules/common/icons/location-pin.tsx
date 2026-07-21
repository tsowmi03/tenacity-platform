import React from "react";
import { IconProps } from "types/icon";

const LocationPin: React.FC<IconProps> = ({
  size = "16",
  color = "currentColor",
  ...attributes
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      color={color}
      {...attributes}
    >
      <path
        d="M12.0931 16.1383C14.3989 16.1383 16.2682 14.2691 16.2682 11.9632C16.2682 9.65735 14.3989 7.78809 12.0931 7.78809C9.78723 7.78809 7.91797 9.65735 7.91797 11.9632C7.91797 14.2691 9.78723 16.1383 12.0931 16.1383Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22.5299 11.9632C22.5299 21.3572 12.0921 28.6637 12.0921 28.6637C12.0921 28.6637 1.6543 21.3572 1.6543 11.9632C1.6543 9.19492 2.75399 6.54002 4.71146 4.58255C6.66893 2.62508 9.32382 1.52539 12.0921 1.52539C14.8604 1.52539 17.5153 2.62508 19.4727 4.58255C21.4302 6.54002 22.5299 9.19492 22.5299 11.9632Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default LocationPin;
