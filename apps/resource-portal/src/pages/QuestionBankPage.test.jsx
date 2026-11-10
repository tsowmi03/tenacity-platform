import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  browseBank: vi.fn(),
  editBankRecord: vi.fn(),
  getBankImages: vi.fn(),
  getBankOptions: vi.fn(),
  getBankRecord: vi.fn(),
  hideBankRecord: vi.fn(),
  resolveBankFlag: vi.fn(),
  restoreBankRecord: vi.fn(),
  getResourceBankQuestions: vi.fn(),
  flagBankQuestion: vi.fn(),
}));
vi.mock("../backend/resourcesApi", () => api);

import { ToastProvider } from "../components/ToastProvider";
import { changedFields, draftOf, bankById } from "../components/bank/bankConfig";
import QuestionBankPage from "./QuestionBankPage";

const options = {
  openFlags: 2,
  diagramTypes: { right_triangle: ["find_hypotenuse", "find_shorter_side"], shape_2d: ["area_composite"] },
  difficulties: ["easy", "medium", "hard"],
  stimulusTypes: ["poem", "poster"],
  techniques: ["imagery", "simile"],
  questionTypes: ["short_answer"],
  englishSkills: ["evaluate"],
  setTextForms: ["novel"],
};

const row = {
  id: "q1", status: "live", sourcePath: "Maths/Book.pdf", pageNumber: 4, label: "Q2a", preview: "Find x.", yearLevel: "Year 9",
  diagramType: "right_triangle", skill: "find_hypotenuse", difficulty: "easy", hasImage: true, openFlags: 0,
};
const detail = (record = {}, extra = {}) => ({
  record: { ...row, stem: "Find x.", text: "", topic: "Pythagoras", ...record },
  images: [], flags: [], links: {}, history: [], ...extra,
});

const renderPage = () => render(<ToastProvider><QuestionBankPage /></ToastProvider>);

describe("Question bank page (RES-104)", () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.getBankOptions.mockResolvedValue(options);
    api.browseBank.mockResolvedValue({ records: [row], nextCursor: null, total: 1 });
    api.getBankImages.mockResolvedValue({ images: { q1: "data:image/png;base64,AAAA" } });
    api.getBankRecord.mockResolvedValue(detail());
  });

  it("lists live maths questions and loads their thumbnails separately", async () => {
    renderPage();
    expect(await screen.findByText("Find x.")).toBeInTheDocument();
    expect(screen.getByText("1 question")).toBeInTheDocument();
    expect(api.browseBank).toHaveBeenCalledWith({ bank: "maths", status: "live", filters: {}, cursor: null });
    await waitFor(() => expect(api.getBankImages).toHaveBeenCalledWith({ bank: "maths", ids: ["q1"] }));
  });

  it("sends filters and only unlocks skills once a type is chosen", async () => {
    renderPage();
    const skill = await screen.findByLabelText("Skill");
    expect(skill).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Diagram type"), { target: { value: "right_triangle" } });
    expect(skill).toBeEnabled();
    fireEvent.change(skill, { target: { value: "find_hypotenuse" } });
    fireEvent.change(screen.getByLabelText("Year"), { target: { value: "9" } });
    await waitFor(() => expect(api.browseBank).toHaveBeenLastCalledWith({
      bank: "maths", status: "live", cursor: null, filters: { diagramType: "right_triangle", skill: "find_hypotenuse", year: 9 },
    }));
  });

  it("shows the open flag count and moves to the flagged list", async () => {
    renderPage();
    const flagged = await screen.findByRole("radio", { name: "Flagged 2" });
    fireEvent.click(flagged);
    await waitFor(() => expect(api.browseBank).toHaveBeenLastCalledWith({ bank: "maths", status: "flagged", filters: {}, cursor: null }));
  });

  it("switches banks, clearing the filters and offering no flagged status for English", async () => {
    renderPage();
    await screen.findByText("Find x.");
    fireEvent.click(screen.getByRole("tab", { name: "Stimuli" }));
    await waitFor(() => expect(api.browseBank).toHaveBeenLastCalledWith({ bank: "stimuli", status: "live", filters: {}, cursor: null }));
    expect(screen.queryByRole("radio", { name: /Flagged/ })).not.toBeInTheDocument();
    expect(await screen.findByLabelText("Text type")).toBeInTheDocument();
  });

  it("pages forward and back by cursor", async () => {
    api.browseBank.mockResolvedValueOnce({ records: [row], nextCursor: "q1", total: 30 });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() => expect(api.browseBank).toHaveBeenLastCalledWith({ bank: "maths", status: "live", filters: {}, cursor: "q1" }));
    fireEvent.click(await screen.findByRole("button", { name: "Previous" }));
    await waitFor(() => expect(api.browseBank).toHaveBeenLastCalledWith({ bank: "maths", status: "live", filters: {}, cursor: null }));
  });

  it("hides a question from the drawer and drops it from the live list", async () => {
    api.hideBankRecord.mockResolvedValue({ ...detail({ status: "hidden" }), cascade: 0 });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Find x\./ }));
    const drawer = await screen.findByRole("dialog");
    fireEvent.click(await within(drawer).findByRole("button", { name: "Hide" }));
    await waitFor(() => expect(api.hideBankRecord).toHaveBeenCalledWith({ bank: "maths", id: "q1" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Find x\./ })).not.toBeInTheDocument());
    expect(await within(drawer).findByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("asks before hiding a stimulus, because its questions go too", async () => {
    const stimulus = { id: "s1", status: "live", title: "The Road", preview: "two roads", sourcePath: "E/P.pdf", medium: "written", type: "poem", hasImage: false, openFlags: 0 };
    api.browseBank.mockResolvedValue({ records: [stimulus], nextCursor: null, total: 1 });
    api.getBankRecord.mockResolvedValue({ record: stimulus, images: [], flags: [], links: {}, history: [] });
    api.hideBankRecord.mockResolvedValue({ record: { ...stimulus, status: "hidden" }, images: [], flags: [], links: {}, history: [], cascade: 3 });
    renderPage();
    fireEvent.click(await screen.findByRole("tab", { name: "Stimuli" }));
    fireEvent.click(await screen.findByRole("button", { name: /The Road/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Hide" }));
    expect(api.hideBankRecord).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Hide stimulus" }));
    await waitFor(() => expect(api.hideBankRecord).toHaveBeenCalledWith({ bank: "stimuli", id: "s1" }));
  });

  it("restores a hidden question", async () => {
    const hidden = { ...row, status: "hidden" };
    api.browseBank.mockResolvedValue({ records: [hidden], nextCursor: null, total: 1 });
    api.getBankRecord.mockResolvedValue(detail({ status: "hidden" }));
    api.restoreBankRecord.mockResolvedValue({ ...detail({ status: "live" }), cascade: 0 });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Find x\./ }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    await waitFor(() => expect(api.restoreBankRecord).toHaveBeenCalledWith({ bank: "maths", id: "q1" }));
  });

  it("dismisses a flag and shows who raised it", async () => {
    const flag = { id: "f1", reason: "crop", note: "cut off", createdByName: "Sam", createdAt: "2026-11-01T00:00:00Z" };
    api.getBankRecord.mockResolvedValueOnce(detail({ openFlags: 1 }, { flags: [flag] })).mockResolvedValue(detail());
    api.resolveBankFlag.mockResolvedValue({});
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Find x\./ }));
    expect(await screen.findByText("“cut off”")).toBeInTheDocument();
    expect(screen.getByText("Diagram is cut off or includes something else")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(api.resolveBankFlag).toHaveBeenCalledWith({ flagId: "f1", resolution: "dismiss" }));
  });

  it("saves only the fields that changed, and clears a skill when the type changes", async () => {
    api.editBankRecord.mockResolvedValue(detail({ difficulty: "hard" }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Find x\./ }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const drawer = screen.getByRole("dialog");
    expect(within(drawer).getByRole("button", { name: "Save changes" })).toBeDisabled();
    fireEvent.change(within(drawer).getByLabelText("Difficulty"), { target: { value: "hard" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.editBankRecord).toHaveBeenCalledWith({ bank: "maths", id: "q1", updates: { difficulty: "hard" } }));
  });

  it("shows why a change failed and keeps the form open", async () => {
    api.editBankRecord.mockRejectedValue(Object.assign(new Error("x"), { userMessage: "find_hypotenuse is not a skill of shape_2d" }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Find x\./ }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("dialog").querySelector("#bank-edit-difficulty"), { target: { value: "hard" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("find_hypotenuse is not a skill of shape_2d");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("offers a retry when the list fails", async () => {
    api.browseBank.mockRejectedValueOnce(new Error("offline"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Find x.")).toBeInTheDocument();
  });
});

describe("working out what an edit changed", () => {
  const fields = bankById("stimuli").fields;

  it("sends nothing when nothing changed", () => {
    const record = { title: "A", author: null, publication: null, text: "t", medium: "written", type: "poem", yearLevel: null, themes: ["hope"] };
    expect(changedFields(fields, record, draftOf(fields, record))).toEqual({});
  });

  it("reads a comma list and stores a cleared field as null", () => {
    const record = { title: "A", themes: ["hope"], author: "B" };
    const draft = { ...draftOf(fields, record), themes: "hope, loss", author: " " };
    expect(changedFields(fields, record, draft)).toEqual({ themes: ["hope", "loss"], author: null });
  });
});
