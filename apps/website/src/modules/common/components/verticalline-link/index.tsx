import React from "react";

type VerticalLineLinkProps = {
  text: string;
  className?: string;
};

const VerticalLineLink: React.FC<VerticalLineLinkProps> = ({
  text,
  className,
}: VerticalLineLinkProps) => {
  return (
    <div className={`flex items-start ${className}`}>
      <div className="flex items-center text-primary">
        <div className="h-4 w-0.5 bg-primary mr-2"></div>
        <span>{text}</span>
      </div>
    </div>
  );
};

export default VerticalLineLink;
