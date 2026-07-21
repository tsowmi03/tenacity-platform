import React from "react";
import CurvyButton from "@modules/common/components/curvy-button/index";

export function Default() {
  return (
    <div className="p-8">
      <CurvyButton onClick={() => {}}>Book a free trial</CurvyButton>
    </div>
  );
}

export function Loading() {
  return (
    <div className="p-8">
      <CurvyButton isLoading onClick={() => {}}>
        Book a free trial
      </CurvyButton>
    </div>
  );
}
