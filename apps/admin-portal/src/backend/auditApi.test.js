import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  limitQuery: vi.fn((count) => ({ type: "limit", count })),
  listDocumentPage: vi.fn(),
  orderBy: vi.fn((field, direction) => ({ type: "orderBy", field, direction })),
  startAfter: vi.fn((cursor) => ({ type: "startAfter", cursor })),
  timestampToIso: vi.fn((value) => value || null),
  where: vi.fn((field, op, value) => ({ type: "where", field, op, value })),
}));

vi.mock("./firestoreReads", () => firestore);

import { buildAuditConstraints, listAuditLogs, listRecentAuditLogs } from "./auditApi";

beforeEach(() => {
  Object.values(firestore).forEach((fn) => fn.mockClear?.());
});

describe("auditApi", () => {
  it("builds paged Firestore constraints for filtered audit queries", () => {
    const cursor = { id: "cursor-doc" };
    const { constraints, pageSize } = buildAuditConstraints({
      limit: 500,
      cursor,
      filters: {
        fromDate: "2026-05-01",
        toDate: "2026-05-20",
        action: "adminCreateInvoice",
        actor: "admin@example.com",
        actorRole: "admin",
        targetType: "invoice",
        targetId: "invoice-1",
      },
    });

    expect(pageSize).toBe(200);
    expect(constraints).toContainEqual({ type: "where", field: "action", op: "==", value: "adminCreateInvoice" });
    expect(constraints).toContainEqual({ type: "where", field: "actorEmail", op: "==", value: "admin@example.com" });
    expect(constraints).toContainEqual({ type: "where", field: "actorRole", op: "==", value: "admin" });
    expect(constraints).toContainEqual({ type: "where", field: "targetType", op: "==", value: "invoice" });
    expect(constraints).toContainEqual({ type: "where", field: "targetId", op: "==", value: "invoice-1" });
    expect(constraints).toContainEqual({ type: "orderBy", field: "createdAt", direction: "desc" });
    expect(constraints).toContainEqual({ type: "startAfter", cursor });
    expect(constraints).toContainEqual({ type: "limit", count: 201 });
  });

  it("returns rows with a next cursor when another page is available", async () => {
    firestore.listDocumentPage.mockResolvedValue({
      rows: [
        { id: "audit-1", action: "one" },
        { id: "audit-2", action: "two" },
        { id: "audit-3", action: "three" },
      ],
      docs: ["doc-1", "doc-2", "doc-3"],
      lastDoc: "doc-3",
    });

    const result = await listAuditLogs({ limit: 2 });

    expect(result.rows.map((row) => row.id)).toEqual(["audit-1", "audit-2"]);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("doc-2");
  });

  it("keeps the dashboard wrapper limited to rows only", async () => {
    firestore.listDocumentPage.mockResolvedValue({
      rows: [{ id: "audit-1" }],
      docs: ["doc-1"],
      lastDoc: "doc-1",
    });

    await expect(listRecentAuditLogs(5)).resolves.toEqual([{ id: "audit-1" }]);
  });
});
