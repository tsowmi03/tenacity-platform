import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./firestoreReads", () => ({
  listDocuments: vi.fn(async () => []),
  orderBy: vi.fn((field, direction) => ({ field, direction })),
}));

vi.mock("./firestoreWrites", () => ({
  updateDocument: vi.fn(async () => ({})),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
}));

import { listDocuments } from "./firestoreReads";
import { updateDocument } from "./firestoreWrites";
import {
  listYear11Interest,
  setYear11InterestArchived,
  setYear11InterestStatus,
} from "./year11InterestApi";

beforeEach(() => {
  listDocuments.mockClear();
  updateDocument.mockClear();
});

describe("year11InterestApi.listYear11Interest", () => {
  it("reads the year11Interest collection newest first", async () => {
    await listYear11Interest();
    expect(listDocuments).toHaveBeenCalledTimes(1);
    expect(listDocuments.mock.calls[0][0]).toBe("year11Interest");
  });

  it("sorts newest first and keeps siblings in submission order", async () => {
    listDocuments.mockResolvedValueOnce([
      { id: "b", createdAtIso: "2026-07-01T00:00:00.000Z", registrationGroupIndex: 1 },
      { id: "c", createdAtIso: "2026-07-05T00:00:00.000Z" },
      { id: "a", createdAtIso: "2026-07-01T00:00:00.000Z", registrationGroupIndex: 0 },
    ]);

    const rows = await listYear11Interest();
    expect(rows.map((row) => row.id)).toEqual(["c", "a", "b"]);
  });
});

describe("year11InterestApi status writes", () => {
  it("writes only status and statusUpdatedAt when marking contacted", async () => {
    await setYear11InterestStatus("interest-1", "contacted");
    expect(updateDocument).toHaveBeenCalledWith("year11Interest", "interest-1", {
      status: "contacted",
      statusUpdatedAt: "SERVER_TIMESTAMP",
    });
  });

  it("writes only archived and statusUpdatedAt when archiving", async () => {
    await setYear11InterestArchived("interest-1", true);
    expect(updateDocument).toHaveBeenCalledWith("year11Interest", "interest-1", {
      archived: true,
      statusUpdatedAt: "SERVER_TIMESTAMP",
    });
  });

  it("coerces archived to a boolean so rules never see a stray value", async () => {
    await setYear11InterestArchived("interest-1", "yes");
    expect(updateDocument.mock.calls[0][2].archived).toBe(false);
  });
});
