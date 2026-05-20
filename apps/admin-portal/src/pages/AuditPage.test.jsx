import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getDocument: vi.fn(),
  listAuditLogs: vi.fn(),
}));

vi.mock("../backend/auditApi", () => ({
  listAuditLogs: api.listAuditLogs,
}));

vi.mock("../backend/firestoreReads", () => ({
  getDocument: api.getDocument,
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
    api.getDocument.mockReset();
    api.getDocument.mockResolvedValue(null);
    api.listAuditLogs.mockReset();
  });

  it("renders recent audit entries and expands snapshots", async () => {
    const user = userEvent.setup();
    api.listAuditLogs.mockResolvedValue({
      rows: [
        {
          id: "audit-1",
          action: "adminUpdateClass",
          actorEmail: "admin@example.com",
          actorUid: "uid-1",
          actorRole: "admin",
          targetType: "class",
          targetId: "class-1",
          targetName: "Maths · Monday · 16:00",
          createdAtIso: "2026-05-18T08:00:00.000Z",
          before: { capacity: 8 },
          after: { capacity: 10 },
          payloadSummary: { fields: ["capacity"] },
          requestId: "req-1",
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    renderAuditPage();

    expect(await screen.findByRole("button", { name: /adminUpdateClass/i })).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(screen.getByText("Maths · Monday · 16:00 · class")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /adminUpdateClass/i }));

    expect(screen.getByText("Updated capacity on Maths · Monday · 16:00.")).toBeInTheDocument();
    expect(screen.getByText(/"capacity": 8/)).toBeInTheDocument();
    expect(screen.getByText(/"capacity": 10/)).toBeInTheDocument();
    expect(screen.getByText("req-1")).toBeInTheDocument();
    expect(screen.getByText("class-1")).toBeInTheDocument();
  });

  it("enriches legacy user-target audits and renders token changes readably", async () => {
    const user = userEvent.setup();
    api.listAuditLogs.mockResolvedValue({
      rows: [
        {
          id: "audit-1",
          action: "user.adjust_lesson_tokens",
          actorEmail: "admin@example.com",
          actorUid: "admin-uid",
          targetType: "user",
          targetId: "parent-uid",
          createdAtIso: "2026-05-18T08:00:00.000Z",
          before: { lessonTokens: 9 },
          after: { lessonTokens: 1 },
          payloadSummary: { mode: "delta", value: -8, reason: null },
        },
      ],
      nextCursor: null,
      hasMore: false,
    });
    api.getDocument.mockImplementation(async (_collection, id) => {
      if (id === "admin-uid") return { id, role: "admin", email: "admin@example.com" };
      if (id === "parent-uid") return { id, firstName: "Pat", lastName: "Ng", role: "parent" };
      return null;
    });

    renderAuditPage();

    expect(await screen.findByText("Pat Ng · user")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /user.adjust_lesson_tokens/i }));

    expect(screen.getByText("admin@example.com · Admin")).toBeInTheDocument();
    expect(screen.getByText("Adjusted lesson tokens for Pat Ng from 9 to 1 (-8). No reason recorded.")).toBeInTheDocument();
    expect(screen.getByText("Lesson tokens: 9")).toBeInTheDocument();
    expect(screen.getByText("Lesson tokens: 1")).toBeInTheDocument();
  });

  it("applies query filters and still searches loaded rows locally", async () => {
    const user = userEvent.setup();
    api.listAuditLogs
      .mockResolvedValueOnce({
        rows: [
          {
            id: "audit-1",
            action: "adminUpdateClass",
            actorEmail: "admin@example.com",
            actorRole: "admin",
            targetType: "class",
            targetId: "class-1",
            targetName: "Physics · Tuesday · 17:00",
            createdAtIso: "2026-05-18T08:00:00.000Z",
          },
          {
            id: "audit-2",
            action: "adminCreateInvoice",
            actorEmail: "finance@example.com",
            actorRole: "finance",
            targetType: "invoice",
            targetId: "invoice-1",
            targetName: "Invoice 1042",
            createdAtIso: "2026-05-18T09:00:00.000Z",
          },
        ],
        nextCursor: null,
        hasMore: false,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "audit-2",
            action: "adminCreateInvoice",
            actorEmail: "finance@example.com",
            actorRole: "finance",
            targetType: "invoice",
            targetId: "invoice-1",
            targetName: "Invoice 1042",
            createdAtIso: "2026-05-18T09:00:00.000Z",
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

    renderAuditPage();

    expect(await screen.findByRole("button", { name: /adminUpdateClass/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /adminCreateInvoice/i })).toBeInTheDocument();

    await user.click(screen.getByText("Advanced filters"));
    await user.type(screen.getByLabelText("Filter by action"), "adminCreateInvoice");
    await user.selectOptions(screen.getByLabelText("Filter by user role"), "finance");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByRole("button", { name: /adminCreateInvoice/i })).toBeInTheDocument();
    expect(api.listAuditLogs).toHaveBeenLastCalledWith({
      limit: 50,
      filters: {
        fromDate: "",
        toDate: "",
        action: "adminCreateInvoice",
        actor: "",
        actorRole: "finance",
        targetType: "",
        targetId: "",
      },
    });
    expect(screen.queryByRole("button", { name: /adminUpdateClass/i })).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(/Search loaded/i));
    await user.type(screen.getByPlaceholderText(/Search loaded/i), "no-match");

    expect(screen.getByText("No audit entries")).toBeInTheDocument();
  });

  it("loads the next audit page with the returned cursor", async () => {
    const user = userEvent.setup();
    api.listAuditLogs
      .mockResolvedValueOnce({
        rows: [
          {
            id: "audit-1",
            action: "adminUpdateClass",
            actorEmail: "admin@example.com",
            actorRole: "admin",
            targetType: "class",
            targetId: "class-1",
            targetName: "Physics · Tuesday · 17:00",
            createdAtIso: "2026-05-18T08:00:00.000Z",
          },
        ],
        nextCursor: { id: "audit-1", createdAt: "cursor-1" },
        hasMore: true,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "audit-2",
            action: "adminCreateInvoice",
            actorEmail: "finance@example.com",
            actorRole: "finance",
            targetType: "invoice",
            targetId: "invoice-1",
            targetName: "Invoice 1042",
            createdAtIso: "2026-05-18T09:00:00.000Z",
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

    renderAuditPage();

    expect(await screen.findByRole("button", { name: /adminUpdateClass/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("button", { name: /adminCreateInvoice/i })).toBeInTheDocument();
    expect(api.listAuditLogs).toHaveBeenLastCalledWith({
      limit: 50,
      cursor: { id: "audit-1", createdAt: "cursor-1" },
      filters: {
        fromDate: "",
        toDate: "",
        action: "",
        actor: "",
        actorRole: "",
        targetType: "",
        targetId: "",
      },
    });
  });

  it("shows an empty state when no actions have been audited yet", async () => {
    api.listAuditLogs.mockResolvedValue({ rows: [], nextCursor: null, hasMore: false });

    renderAuditPage();

    const emptyState = await screen.findByText("No audit entries");
    expect(emptyState).toBeInTheDocument();
    expect(within(emptyState.closest(".empty")).getByText(/Recorded admin actions/i)).toBeInTheDocument();
  });
});
