"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import { StepButton } from "@mui/material";
import { steps } from ".";

// create an array of steps

export default function VerticalLinearStepper(props: {
  step: number;
  setStep: (step: number) => void;
}) {
  const { step, setStep } = props;
  // Prevent SSR mismatch
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true); // Indicate that the component is now mounted
  }, []);

  const handleStep = (step: number) => () => {
    setStep(step);
  };

  if (!mounted) {
    return null; // Avoid rendering until after hydration
  }

  return (
    <Box
      //  width: "20vw", height: "100%" but in mobile width: 40vw
      sx={{
        width: { xs: "40vw", sm: "15vw" },
        height: "100%",
      }}
    >
      <Stepper
        activeStep={step}
        orientation="vertical"
        sx={{ height: "100%", ".MuiStepConnector-line": { height: "100%" } }}
      >
        {steps.map((label, index) => (
          <Step key={label}>
            <StepButton
              color="inherit"
              onClick={handleStep(index)}
              disabled={false}
              className="text-primary-light"
              sx={{
                ".MuiStepIcon-root": {
                  color: "inherit",
                  transition: "all 0.3s",
                  cursor: "pointer",
                }, // Default icon color
                ".MuiStepIcon-root.Mui-completed": {
                  color: "#163738",
                  transition: "all 0.3s",
                  scale: 1,
                  // paddingRight: "0.5rem",
                }, // Completed step icon color
                ".MuiStepIcon-root.Mui-active": {
                  color: "#14B2B6",
                  scale: 1.3,
                }, // Active step icon color (optional)
                ".MuiStepLabel-label.Mui-active": {
                  color: "#14B2B6",
                  fontSize: "0.8rem",
                  fontWeight: "bold",
                  //make scale with respect to left
                },
                ".MuiStepLabel-label": {
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  //make scale with respect to left
                },
              }}
            >
              {label}
            </StepButton>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
}
