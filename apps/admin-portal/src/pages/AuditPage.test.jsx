import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listRecentAuditLogs: vi.fn(),
}));

vi.mock("../backend/auditApi", () => ({
  listRecentAuditLogs: api.listRecentAuditLogs,
}));

import AuditPage from "./AuditPage";

function renderAuditPage() {
  return render(
    <MemoryRouter>
      <AuditPage />
    </MemoryRouter>
  );
}

describe("AuditPage", () => {
  beforeEach(() => {
    api.listRecentAuditLogs.mockReset();
  });

  it("renders recent audit entries and expands snapshots", async () => {
    const user = userEvent.setup();
    api.listRecentAuditLogs.mockResolvedValue([
      {
        id: "audit-1",
        action: "adminUpdateClass",
        actorEmail: "admin@example.com",
        actorUid: "uid-1",
        targetType: "class",
        targetId: "class-1",
        createdAtIso: "2026-05-18T08:00:00.000Z",
        before: { capacity: 8 },
        after: { capacity: 10 },
        payloadSummary: { fields: ["capacity"] },
        requestId: "req-1",
      },
    ]);

    renderAuditPage();

    expect(await screen.findByRole("button", { name: /adminUpdateClass/i })).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("class · class-1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /adminUpdateClass/i }));

    expect(screen.getByText("Fields: capacity")).toBeInTheDocument();
    expect(screen.getByText(/"capacity": 8/)).toBeInTheDocument();
    expect(screen.getByText(/"capacity": 10/)).toBeInTheDocument();
    expect(screen.getByText("req-1")).toBeInTheDocument();
  });

  it("filters by action and search text", async () => {
    const user = userEvent.setup();
    api.listRecentAuditLogs.mockResolvedValue([
      {
        id: "audit-1",
        action: "adminUpdateClass",
        actorEmail: "admin@example.com",
        targetType: "class",
        targetId: "class-1",
        createdAtIso: "2026-05-18T08:00:00.000Z",
      },
      {
        id: "audit-2",
        action: "adminCreateInvoice",
        actorEmail: "finance@example.com",
        targetType: "invoice",
        targetId: "invoice-1",
        createdAtIso: "2026-05-18T09:00:00.000Z",
      },
    ]);

    renderAuditPage();

    expect(await screen.findByRole("button", { name: /adminUpdateClass/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /adminCreateInvoice/i })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Filter by action"), "adminCreateInvoice");

    expect(screen.queryByRole("button", { name: /adminUpdateClass/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /adminCreateInvoice/i })).toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(/Search by action/i));
    await user.type(screen.getByPlaceholderText(/Search by action/i), "no-match");

    expect(screen.getByText("No audit entries")).toBeInTheDocument();
  });

  it("shows an empty state when no actions have been audited yet", async () => {
    api.listRecentAuditLogs.mockResolvedValue([]);

    renderAuditPage();

    const emptyState = await screen.findByText("No audit entries");
    expect(emptyState).toBeInTheDocument();
    expect(within(emptyState.closest(".empty")).getByText(/Recorded admin actions/i)).toBeInTheDocument();
  });
});
