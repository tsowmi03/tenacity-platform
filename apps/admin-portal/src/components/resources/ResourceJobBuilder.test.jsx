import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../AuthProvider", () => ({
  useAuth: () => ({ user: { uid: "tutor-1" } }),
}));

vi.mock("../../backend/resourcesApi", () => ({
  downloadResourceJob: vi.fn(),
  findSimilarResources: vi.fn(),
  uploadResourceReference: vi.fn(),
}));

import { ToastProvider } from "../ToastProvider";
import ResourceJobBuilder from "./ResourceJobBuilder";

function renderBuilder() {
  return render(
    <ToastProvider>
      <ResourceJobBuilder
        onSubmitJobs={vi.fn()}
        students={[]}
        studentsLoading={false}
      />
    </ToastProvider>
  );
}

describe("resource answer options", () => {
  it("defaults question resources to no answers and offers three modes", () => {
    renderBuilder();

    fireEvent.click(screen.getByRole("button", { name: "Worksheet" }));

    const noAnswers = screen.getByRole("button", { name: "No answers" });
    expect(noAnswers).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Answers only" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Answers with working out" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Answers with working out" }));
    expect(screen.getByRole("button", { name: "Answers with working out" })).toHaveClass("active");
    expect(screen.getByText("Includes final answers with step-by-step working.")).toBeInTheDocument();
  });

  it("uses English-specific labels for answer guidance", () => {
    renderBuilder();

    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "Annotation Task" }));

    expect(screen.getByRole("button", { name: "No answers" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Marking guide" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Model answers" })).toBeInTheDocument();
  });
});
