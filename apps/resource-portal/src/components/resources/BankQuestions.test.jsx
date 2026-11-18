import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getResourceBankQuestions: vi.fn(),
  flagBankQuestion: vi.fn(),
}));
vi.mock("../../backend/resourcesApi", () => api);

import BankQuestionsSection from "./BankQuestionsSection";

const question = {
  id: "q1",
  questionNumber: 3,
  use: "original",
  sourcePath: "Maths/Year 9/Book.pdf",
  pageNumber: 4,
  label: "Q2a",
  stem: "Find x.",
  text: "",
  diagramType: "right_triangle",
  skill: "find_hypotenuse",
  difficulty: "easy",
  yearLevel: "Year 9",
  image: "data:image/png;base64,AAAA",
  flaggedByMe: false,
};

describe("textbook questions in a resource (RES-61)", () => {
  beforeEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

  it("shows nothing for a resource without textbook questions", () => {
    const { container } = render(<BankQuestionsSection job={{ jobId: "j" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lets a tutor flag a question with a reason and note", async () => {
    api.getResourceBankQuestions.mockResolvedValue({ questions: [question] });
    api.flagBankQuestion.mockResolvedValue({ flagId: "f1" });
    render(<BankQuestionsSection job={{ jobId: "j1", questionBankUsage: { used: [{ questionNumber: 3, questionId: "q1" }] } }} />);

    fireEvent.click(screen.getByRole("button", { name: "Show textbook questions" }));
    expect(await screen.findByAltText("Diagram for question 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Flag a problem" }));
    fireEvent.change(screen.getByLabelText("What is wrong?"), { target: { value: "answer" } });
    fireEvent.change(screen.getByLabelText("Note for the admin"), { target: { value: "should be 13" } });
    fireEvent.click(screen.getByRole("button", { name: "Send flag" }));

    await waitFor(() => expect(api.flagBankQuestion).toHaveBeenCalledWith({ jobId: "j1", questionId: "q1", reason: "answer", note: "should be 13", stopUsing: false }));
    expect(await screen.findByText("Flagged. An admin will review it.")).toBeInTheDocument();
  });

  // RES-103. Taking the question out of use is the tutor's choice.
  it("can stop the question being used until an admin reviews it", async () => {
    api.getResourceBankQuestions.mockResolvedValue({ questions: [question] });
    api.flagBankQuestion.mockResolvedValue({ flagId: "f1", stoppedUsing: true });
    render(<BankQuestionsSection job={{ jobId: "j1", questionBankUsage: { used: [{ questionNumber: 3, questionId: "q1" }] } }} />);

    fireEvent.click(screen.getByRole("button", { name: "Show textbook questions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Flag a problem" }));
    expect(screen.getByLabelText("Keep using this question")).toBeChecked();
    fireEvent.click(screen.getByLabelText("Stop using this question"));
    fireEvent.click(screen.getByRole("button", { name: "Send flag" }));

    await waitFor(() => expect(api.flagBankQuestion).toHaveBeenCalledWith({ jobId: "j1", questionId: "q1", reason: "crop", note: "", stopUsing: true }));
    expect(await screen.findByText("Flagged. It won't be used in new resources until an admin reviews it.")).toBeInTheDocument();
  });
});

// RES-71: every diagram that was drawn rather than taken from a textbook is
// listed with the reason.
describe("drawn diagrams", () => {
  it("lists each drawn diagram with a plain reason, even when no textbook question was used", () => {
    render(<BankQuestionsSection job={{ jobId: "j2", questionBankUsage: { used: [], skipped: [
      { questionNumber: 2, reason: "none_suitable" },
      { questionNumber: 4, partLabel: "b", reason: "search_failed: timeout" },
      { questionNumber: 1, section: "End quiz", reason: "check_disagreed" },
    ] } }} />);
    expect(screen.getByText("3 diagrams were drawn because:")).toBeInTheDocument();
    expect(screen.getByText("Question 2: no textbook diagram fitted the skill")).toBeInTheDocument();
    expect(screen.getByText("Question 4 part b: the textbook step could not finish")).toBeInTheDocument();
    expect(screen.getByText("End quiz, Question 1: the textbook question's answer could not be confirmed")).toBeInTheDocument();
  });
});
