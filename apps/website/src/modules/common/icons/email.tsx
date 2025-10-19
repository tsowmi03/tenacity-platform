import React from "react"
import { IconProps } from "types/icon"

const Email: React.FC<IconProps> = ({
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
      <path d="M2 4H22V20H2V4ZM12 13L20 8V6L12 11L4 6V8L12 13Z" fill={color} />
    </svg>
  )
}

export default Email
