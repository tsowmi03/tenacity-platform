import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./callable", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    callFunction: vi.fn(async () => ({})),
  };
});
vi.mock("./storage", () => ({
  getDownloadUrlForPath: vi.fn(async () => "https://storage.example/test.pdf"),
}));

import { callFunction } from "./callable";
import {
  createInvoice,
  createInvoiceDraft,
  deleteInvoice,
  getInvoicePdf,
  updateInvoice,
} from "./invoicesApi";
import { getDownloadUrlForPath } from "./storage";

beforeEach(() => {
  callFunction.mockClear();
  callFunction.mockResolvedValue({});
  getDownloadUrlForPath.mockClear();
});

describe("invoicesApi.deleteInvoice", () => {
  it("defaults acknowledgeXeroWarning to false", async () => {
    await deleteInvoice("inv_001", "inv_001");
    expect(callFunction).toHaveBeenCalledWith("adminDeleteInvoice", {
      invoiceId: "inv_001",
      confirmInvoiceId: "inv_001",
      acknowledgeXeroWarning: false,
    });
  });

  it("forwards acknowledgeXeroWarning=true when the Xero-acked path is used", async () => {
    await deleteInvoice("inv_001", "inv_001", true);
    expect(callFunction.mock.calls[0][1]).toMatchObject({
      invoiceId: "inv_001",
      confirmInvoiceId: "inv_001",
      acknowledgeXeroWarning: true,
    });
  });
});

describe("invoicesApi.createInvoice / createInvoiceDraft", () => {
  it("forwards the full payload verbatim to adminCreateInvoice", async () => {
    const payload = {
      parentId: "p1",
      parentName: "Pat Parent",
      parentEmail: "pat@example.com",
      studentIds: ["s1"],
      weeks: 4,
      amountDue: 200,
      lineItems: [{ description: "Term tutoring", quantity: 4, unitAmount: 50, lineTotal: 200 }],
      dueDate: "2026-06-30T00:00:00.000Z",
    };
    await createInvoice(payload);
    expect(callFunction).toHaveBeenCalledWith("adminCreateInvoice", payload);
  });

  it("uses adminCreateInvoiceDraft for drafts", async () => {
    await createInvoiceDraft({ parentId: "p1", studentIds: ["s1"] });
    expect(callFunction.mock.calls[0][0]).toBe("adminCreateInvoiceDraft");
  });
});

describe("invoicesApi.updateInvoice", () => {
  it("merges invoiceId with the update fields", async () => {
    await updateInvoice("inv_001", { status: "paid", adminNotes: "Settled by EFT" });
    expect(callFunction).toHaveBeenCalledWith("adminUpdateInvoice", {
      invoiceId: "inv_001",
      status: "paid",
      adminNotes: "Settled by EFT",
    });
  });
});

describe("invoicesApi.getInvoicePdf", () => {
  it("turns a pdfPath into a Storage download URL", async () => {
    callFunction.mockResolvedValue({ pdfPath: "invoices/inv_001.pdf" });
    const result = await getInvoicePdf("inv_001");
    expect(callFunction).toHaveBeenCalledWith("adminGetInvoicePdf", { invoiceId: "inv_001" });
    expect(getDownloadUrlForPath).toHaveBeenCalledWith("invoices/inv_001.pdf");
    expect(result.downloadUrl).toBe("https://storage.example/test.pdf");
  });

  it("prefers a downloadUrl returned directly by the function without hitting Storage", async () => {
    callFunction.mockResolvedValue({ downloadUrl: "https://direct.example/test.pdf", pdfPath: "ignored.pdf" });
    const result = await getInvoicePdf("inv_001");
    expect(getDownloadUrlForPath).not.toHaveBeenCalled();
    expect(result.downloadUrl).toBe("https://direct.example/test.pdf");
  });

  it("throws a not-found BackendError when neither pdfPath nor downloadUrl is returned", async () => {
    callFunction.mockResolvedValue({});
    await expect(getInvoicePdf("inv_001")).rejects.toMatchObject({
      name: "BackendError",
      code: "not-found",
    });
    expect(getDownloadUrlForPath).not.toHaveBeenCalled();
  });
});
