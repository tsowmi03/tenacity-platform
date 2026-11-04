import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getResourceBankQuestions: vi.fn(),
  flagBankQuestion: vi.fn(),
  listBankFlags: vi.fn(),
  resolveBankFlag: vi.fn(),
}));
vi.mock("../../backend/resourcesApi", () => api);

import BankQuestionsSection from "./BankQuestionsSection";
import BankFlagsModal from "./BankFlagsModal";

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

    await waitFor(() => expect(api.flagBankQuestion).toHaveBeenCalledWith({ jobId: "j1", questionId: "q1", reason: "answer", note: "should be 13" }));
    expect(await screen.findByText("Flagged. An admin will review it.")).toBeInTheDocument();
  });

  it("lets an admin hide a flagged question", async () => {
    api.listBankFlags
      .mockResolvedValueOnce({ flags: [{ id: "f1", questionId: "q1", reason: "crop", note: "cut off", createdByName: "Sam" }], questions: { q1: question }, skills: {} })
      .mockResolvedValueOnce({ flags: [], questions: {}, skills: {} });
    api.resolveBankFlag.mockResolvedValue({});
    render(<BankFlagsModal onClose={() => {}} open />);

    expect(await screen.findByText("Diagram is cut off or includes something else")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide question" }));
    await waitFor(() => expect(api.resolveBankFlag).toHaveBeenCalledWith({ flagId: "f1", resolution: "hide", updates: undefined }));
    expect(await screen.findByText("No open flags.")).toBeInTheDocument();
  });

  it("lets an admin correct the skill from the type's own list", async () => {
    api.listBankFlags.mockResolvedValue({
      flags: [{ id: "f1", questionId: "q1", reason: "tags", note: "" }],
      questions: { q1: question },
      skills: { right_triangle: ["find_hypotenuse", "find_shorter_side", "other"] },
    });
    api.resolveBankFlag.mockResolvedValue({});
    render(<BankFlagsModal onClose={() => {}} open />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Skill"), { target: { value: "find_shorter_side" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.resolveBankFlag).toHaveBeenCalledWith({
      flagId: "f1",
      resolution: "update",
      updates: { skill: "find_shorter_side", difficulty: "easy", yearLevel: "Year 9", text: "" },
    }));
  });
});
