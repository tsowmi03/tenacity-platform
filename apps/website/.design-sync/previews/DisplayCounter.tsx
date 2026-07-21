import React from "react";
import DisplayCounter from "@modules/common/components/display-counter/index";

// DisplayCounter has no styling of its own (designed to be styled by a
// parent) — wrapping it the way the real site does. It only counts up
// while its ref is scrolled into view, via a real setTimeout loop over
// `speed` seconds — passing a very small speed so the count completes
// before the capture harness screenshots it.

export function Default() {
  return (
    <div className="p-8 text-center">
      <div className="text-5xl font-bold text-primary">
        <DisplayCounter number={250} unit="+" speed={0.1} />
      </div>
      <p className="mt-2 text-gray-600">students tutored since 2015</p>
    </div>
  );
}

export function Percentage() {
  return (
    <div className="p-8 text-center">
      <div className="text-5xl font-bold text-primary">
        <DisplayCounter number={95} unit="%" speed={0.1} />
      </div>
      <p className="mt-2 text-gray-600">of students improve within one term</p>
    </div>
  );
}
