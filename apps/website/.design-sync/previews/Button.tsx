import React from "react";
import Button from "@modules/common/components/button/index";

export function Primary() {
  return <Button variant="primary">Book a free trial</Button>;
}

export function Secondary() {
  return <Button variant="secondary">Learn more</Button>;
}

export function Loading() {
  return (
    <Button variant="primary" isLoading>
      Book a free trial
    </Button>
  );
}

export function Disabled() {
  return (
    <Button variant="primary" disabled>
      Book a free trial
    </Button>
  );
}
