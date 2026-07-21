interface TextFieldProps {
  title: string;
  paragraph: string;
}

const TextField: React.FC<TextFieldProps> = ({ title, paragraph }) => {
  return (
    <div className="my-12 content-container">
      <div className="flex flex-col items-center mb-8 text-center">
        <span className="mb-6 text-gray-600 text-base-regular">{title}</span>
        <p className="max-w-xl mb-4 text-gray-900 text-xl-regular">
          {paragraph}
        </p>
        <hr className="mx-[15%] w-[70%] " />
      </div>
    </div>
  );
};

export default TextField;
