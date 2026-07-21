import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createTermsForYear: vi.fn(),
  listTerms: vi.fn(),
  updateTerm: vi.fn(),
}));

vi.mock("../backend/termsApi", () => ({
  createTermsForYear: api.createTermsForYear,
  listTerms: api.listTerms,
  updateTerm: api.updateTerm,
}));

import { ToastProvider } from "../components/ToastProvider";
import TermsPage from "./TermsPage";

function renderTermsPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <TermsPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

const existingTerms = [
  {
    id: "2027_T1",
    year: "2027",
    termNum: 1,
    weeksNum: 10,
    status: "upcoming",
    startDateIso: "2027-01-31T13:00:00.000Z",
    endDateIso: "2027-04-09T13:59:59.999Z",
  },
  {
    id: "2026_T4",
    year: "2026",
    termNum: 4,
    weeksNum: 9,
    status: "active",
    startDateIso: "2026-10-05T00:00:00.000Z",
    endDateIso: "2026-12-11T00:00:00.000Z",
  },
];

describe("TermsPage", () => {
  beforeEach(() => {
    api.createTermsForYear.mockReset();
    api.listTerms.mockReset();
    api.updateTerm.mockReset();
  });

  it("renders terms grouped by year without exposing backend ids", async () => {
    api.listTerms.mockResolvedValue(existingTerms);

    renderTermsPage();

    expect(await screen.findByText("2027 Term 1")).toBeInTheDocument();
    expect(screen.getByText("2026 Term 4")).toBeInTheDocument();
    expect(screen.getByText("2027")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getByText("upcoming")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.queryByText("2027_T1")).not.toBeInTheDocument();
  });

  it("creates the next year terms from the modal", async () => {
    const user = userEvent.setup();
    api.listTerms.mockResolvedValue(existingTerms);
    api.createTermsForYear.mockResolvedValue({ terms: [{ id: "2027_T1" }, { id: "2027_T2" }, { id: "2027_T3" }, { id: "2027_T4" }] });

    renderTermsPage();

    await screen.findByText("2027 Term 1");
    await user.click(screen.getByRole("button", { name: "Add terms for year" }));

    const dialog = screen.getByRole("dialog");
    const yearInput = within(dialog).getByLabelText("Year");
    await user.clear(yearInput);
    await user.type(yearInput, "2028");

    const dates = [
      ["Term 1 start date", "2028-02-01"],
      ["Term 1 end date", "2028-04-07"],
      ["Term 2 start date", "2028-04-24"],
      ["Term 2 end date", "2028-06-30"],
      ["Term 3 start date", "2028-07-17"],
      ["Term 3 end date", "2028-09-22"],
      ["Term 4 start date", "2028-10-09"],
      ["Term 4 end date", "2028-12-15"],
    ];
    for (const [label, value] of dates) {
      await user.type(within(dialog).getByLabelText(label), value);
    }

    await user.click(within(dialog).getByRole("button", { name: "Create terms" }));

    expect(api.createTermsForYear).toHaveBeenCalledWith("2028", [
      { termNum: 1, weeksNum: 10, startDate: "2028-02-01", endDate: "2028-04-07", status: "upcoming" },
      { termNum: 2, weeksNum: 10, startDate: "2028-04-24", endDate: "2028-06-30", status: "upcoming" },
      { termNum: 3, weeksNum: 10, startDate: "2028-07-17", endDate: "2028-09-22", status: "upcoming" },
      { termNum: 4, weeksNum: 10, startDate: "2028-10-09", endDate: "2028-12-15", status: "upcoming" },
    ]);
  });

  it("updates an existing term from the edit modal", async () => {
    const user = userEvent.setup();
    api.listTerms.mockResolvedValue(existingTerms);
    api.updateTerm.mockResolvedValue({ termId: "2027_T1" });

    renderTermsPage();

    await user.click(await screen.findByText("2027 Term 1"));

    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Status"), "active");
    await user.clear(within(dialog).getByLabelText("Weeks"));
    await user.type(within(dialog).getByLabelText("Weeks"), "11");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(api.updateTerm).toHaveBeenCalledWith("2027_T1", {
      startDate: "2027-02-01",
      endDate: "2027-04-09",
      weeksNum: 11,
      status: "active",
    });
  });
});
