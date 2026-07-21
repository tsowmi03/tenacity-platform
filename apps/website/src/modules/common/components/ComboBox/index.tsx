import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import ChevronDown from "@modules/common/icons/chevron-down";
import { useState } from "react";

function ComboboxComponent({
  options,
  selected,
  onChange,
  placeHolder,
}: {
  label: string;
  options: { id: number; name: string }[];
  selected: string;
  onChange: (value: { id: number; name: string } | null) => void;
  placeHolder: string;
}) {
  const [selectedPerson, setSelectedPerson] = useState<{
    id: number;
    name: string;
  } | null>(
    selected ? options.find((option) => option.name === selected) ?? null : null
  );
  const [query, setQuery] = useState("");

  const filteredOptions =
    query === ""
      ? options
      : options.filter((option) => {
          return option.name.toLowerCase().includes(query.toLowerCase());
        });

  return (
    <div className="relative">
      <Combobox
        value={selectedPerson}
        onChange={(value: { id: number; name: string } | null) => {
          onChange(value);
          setSelectedPerson(value);
        }}
        immediate={true}
        onClose={() => setQuery("")}
      >
        <ComboboxInput
          placeholder={placeHolder}
          aria-label={placeHolder}
          displayValue={(person: { id: number; name: string }) => person?.name}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full bg-white pl-11 rounded-full text-primary font-semibold py-3 px-4 cursor-pointer text-secondary hover:shadow-lg focus:outline-none"
        />
        <ComboboxButton
          as="button"
          className="absolute left-0 top-0 h-full bg-none  border-primary rounded-r-lg text-primary font-semibold py-3 px-3 cursor-pointer text-secondary "
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            color="currentColor"
            fill="none"
          >
            <path
              d="M17.5 17.5L22 22"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M20 11C20 6.02944 15.9706 2 11 2C6.02944 2 2 6.02944 2 11C2 15.9706 6.02944 20 11 20C15.9706 20 20 15.9706 20 11Z"
              stroke="currentColor"
              stroke-width="3"
              stroke-linejoin="round"
            />
          </svg>
        </ComboboxButton>
        <ComboboxButton
          as="button"
          className="absolute right-0 top-0 h-full bg-none  border-primary rounded-r-lg text-primary font-semibold py-3 px-3 cursor-pointer text-secondary"
        >
          <ChevronDown className="w-6 h-6 bg-none" />
        </ComboboxButton>
        <ComboboxOptions
          data-open="true"
          anchor="bottom start"
          className="mx-5 left-0 min-w-44 z-10 w-fit bg-primary-light border border-primary-light rounded-md mb-1 shadow-lg text-white overflow-clip max-h-[30vh] overflow-y-scroll"
        >
          {filteredOptions.map((option) => (
            <ComboboxOption
              key={option.id}
              value={option}
              className={({ active }) =>
                `p-2 cursor-pointer ${active ? "bg-white text-primary" : ""}`
              }
            >
              {option.name}
            </ComboboxOption>
          ))}
        </ComboboxOptions>
      </Combobox>
    </div>
  );
}

export default ComboboxComponent;
