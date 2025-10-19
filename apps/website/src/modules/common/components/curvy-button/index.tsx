import Spinner from "@modules/common/icons/spinner";

type ButtonProps = {
  isLoading?: boolean;
  variant?: "primary" | "secondary";
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const CurvyButton = ({
  children,
  isLoading = false,
  className,
  ...props
}: ButtonProps) => {
  return (
    <button
      className={`bg-primary rounded-2xl px-4 py-1 cursor-pointer text-secondary hover:animate-scale flex items-center gap-4 h-fit ${className}`}
      {...props}
    >
      {isLoading ? <Spinner /> : ""}{" "}
      <span className="flex items-center gap-2">{children}</span>
    </button>
  );
};

export default CurvyButton;
