import React from "react";
import { useState } from "react";
import ComboboxComponent from "@modules/common/components/ComboBox/index";

const YEAR_OPTIONS = [
  { id: 5, name: "Year 5" },
  { id: 6, name: "Year 6" },
  { id: 7, name: "Year 7" },
  { id: 8, name: "Year 8" },
  { id: 9, name: "Year 9" },
  { id: 10, name: "Year 10" },
  { id: 11, name: "Year 11" },
  { id: 12, name: "Year 12" },
];

export function YearSearch() {
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(
    null
  );
  return (
    <div className="max-w-md p-3 bg-navy-dark rounded-full">
      <ComboboxComponent
        label="School year"
        options={YEAR_OPTIONS}
        selected={selected?.name || ""}
        onChange={(value) => setSelected(value)}
        placeHolder="Search a Year"
      />
    </div>
  );
}

export function PreSelected() {
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(
    YEAR_OPTIONS.find((o) => o.name === "Year 8") ?? null
  );
  return (
    <div className="max-w-md p-3 bg-navy-dark rounded-full">
      <ComboboxComponent
        label="School year"
        options={YEAR_OPTIONS}
        selected={selected?.name || ""}
        onChange={(value) => setSelected(value)}
        placeHolder="Search a Year"
      />
    </div>
  );
}
