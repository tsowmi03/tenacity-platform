import Spinner from "@modules/common/icons/spinner";
import clsx from "clsx";
import React from "react";

type ButtonProps = {
  isLoading?: boolean;
  variant?: "primary" | "secondary";
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const Button = ({
  children,
  className,
  isLoading = false,
  variant = "primary",
  ...props
}: ButtonProps) => {
  return (
    <button
      {...props}
      className={clsx(
        className,
        "flex items-center justify-center min-h-[2.5rem] min-w-[10rem] px-5 py-3 text-medium-regular border transition-colors duration-200 disabled:opacity-50 rounded-[1.25rem]",
        {
          "text-neutral-light bg-primary border-primary disabled:bg-primary disabled:text-neutral-light":
            variant === "primary",
          "text-gray-900 bg-transparent border-gray-920":
            variant === "secondary",
        }
      )}
    >
      {isLoading ? <Spinner /> : children}
    </button>
  );
};

export default Button;
