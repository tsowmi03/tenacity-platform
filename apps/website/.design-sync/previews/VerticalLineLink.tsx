import React from "react";
import VerticalLineLink from "@modules/common/components/verticalline-link/index";

export function Default() {
  return (
    <div className="p-8">
      <VerticalLineLink text="Small-group classes, max 6 students" />
    </div>
  );
}

export function LongText() {
  return (
    <div className="p-8">
      <VerticalLineLink text="NESA-registered tutors with real classroom experience" />
    </div>
  );
}
