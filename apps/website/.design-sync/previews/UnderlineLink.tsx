import React from "react";
import UnderlineLink from "@modules/common/components/underline-link/index";

export function Default() {
  return (
    <div className="p-8">
      <UnderlineLink href="/programs" areaLabel="View our programs">
        View our programs
      </UnderlineLink>
    </div>
  );
}

export function OnDark() {
  return (
    <div className="p-8 bg-navy-dark">
      <UnderlineLink
        href="/register"
        areaLabel="Book a free trial"
        className="text-neutral-light"
      >
        Book a free trial
      </UnderlineLink>
    </div>
  );
}
