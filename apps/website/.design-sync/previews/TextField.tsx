import React from "react";
import TextField from "@modules/common/components/text-field/index";

export function Default() {
  return (
    <TextField
      title="Why families choose us"
      paragraph="Small-group Maths and English tutoring in Narwee for Years 5-10, with personal classes, clear feedback and confident learning."
    />
  );
}

export function ShortCopy() {
  return <TextField title="Our approach" paragraph="Determination meets success." />;
}
