import React from "react"
import { IconProps } from "types/icon"

const Phone: React.FC<IconProps> = ({
  size = "16",
  color = "currentColor",
  ...attributes
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...attributes}
    >
      <path
        d="M20.9992 15.4608L15.7292 14.8508L13.2092 17.3708C10.3792 15.9308 8.05923 13.6208 6.61923 10.7808L9.14923 8.25078L8.53923 3.00078H3.02923C2.44923 13.1808 10.8192 21.5508 20.9992 20.9708V15.4608Z"
        fill={color}
      />
    </svg>
  )
}

export default Phone
