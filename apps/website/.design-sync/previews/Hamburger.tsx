import React from "react";
import Hamburger from "@modules/common/components/hamburger/index";

export function OnLight() {
  return (
    <div className="flex items-center justify-end w-full h-16 px-6 bg-white text-navy-dark shadow-sm">
      <Hamburger setOpen={() => {}} />
    </div>
  );
}

export function OnDark() {
  return (
    <div className="flex items-center justify-end w-full h-16 px-6 bg-navy-dark text-neutral-light">
      <Hamburger setOpen={() => {}} />
    </div>
  );
}
