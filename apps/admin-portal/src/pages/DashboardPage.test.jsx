import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  incomeReport: vi.fn(),
  listEnrolments: vi.fn(),
  listInvoices: vi.fn(),
  listInvoiceDrafts: vi.fn(),
  listClasses: vi.fn(),
  listTerms: vi.fn(),
  listRecentAuditLogs: vi.fn(),
}));

vi.mock("../backend/classesApi", () => ({
  listClasses: api.listClasses,
}));

vi.mock("../backend/enrolmentsApi", () => ({
  listEnrolments: api.listEnrolments,
}));

vi.mock("../backend/invoicesApi", () => ({
  listInvoices: api.listInvoices,
  listInvoiceDrafts: api.listInvoiceDrafts,
}));

vi.mock("../backend/reportsApi", () => ({
  incomeReport: api.incomeReport,
}));

vi.mock("../backend/settingsApi", () => ({
  listRecentAuditLogs: api.listRecentAuditLogs,
  listTerms: api.listTerms,
}));

import DashboardPage from "./DashboardPage";

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

describe("DashboardPage", () => {
  it("renders live dashboard summaries from backend data sources", async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowName = tomorrow.toLocaleDateString("en-US", { weekday: "long" });

    api.incomeReport.mockResolvedValue({
      summary: { totalPaid: 2450 },
      rows: [
        { key: "2026-05-01", totalPaid: 1200 },
        { key: "2026-05-02", totalPaid: 1250 },
      ],
    });
    api.listEnrolments.mockResolvedValue([
      { id: "e1", status: "pending", archived: false },
      { id: "e2", status: "accepted", archived: false },
    ]);
    api.listInvoices.mockResolvedValue([
      { id: "i1", status: "unpaid", amountDue: 100 },
      { id: "i2", status: "overdue", amountDue: 200 },
    ]);
    api.listInvoiceDrafts.mockResolvedValue([{ id: "d1" }]);
    api.listClasses.mockResolvedValue([
      { id: "c1", type: "Maths 5-6", day: tomorrowName, startTime: "16:00", endTime: "17:00", enrolledCount: 8 },
    ]);
    api.listTerms.mockResolvedValue([{ id: "t1", year: 2026, termNum: 2, status: "active" }]);
    api.listRecentAuditLogs.mockResolvedValue([
      { id: "a1", action: "adminUpdateClass", actorEmail: "admin@example.com", createdAtIso: "2026-05-16T00:00:00.000Z" },
    ]);

    renderDashboard();

    expect(await screen.findByText("$2,450")).toBeInTheDocument();
    expect(screen.getByText("$200")).toBeInTheDocument();
    expect(screen.getByText("$100")).toBeInTheDocument();
    expect(screen.getByText("1 pending enrolments")).toBeInTheDocument();
    expect(screen.getByText("Maths 5-6")).toBeInTheDocument();
    expect(screen.getByText("2026 Term 2")).toBeInTheDocument();
    expect(screen.getByText("adminUpdateClass")).toBeInTheDocument();
  });
});
