import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ backfillXeroInvoices: vi.fn() }));

vi.mock("../backend/invoicesApi", () => api);

import { ToastProvider } from "../components/ToastProvider";
import XeroBackfillPage from "./XeroBackfillPage";

function summary(overrides = {}) {
  return {
    dryRun: true,
    sendEmail: false,
    matching: 2,
    processed: 2,
    remaining: 0,
    created: 0,
    emailRetried: 0,
    linkedExisting: 0,
    skipped: 0,
    failed: 0,
    emailed: 0,
    results: [
      { invoiceId: "a", xeroInvoiceNumber: "INV-1", amountDue: 560, outcome: "would-create" },
      { invoiceId: "b", xeroInvoiceNumber: "INV-2", amountDue: 480, outcome: "would-create" },
    ],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <XeroBackfillPage />
    </ToastProvider>
  );
}

describe("XeroBackfillPage", () => {
  beforeEach(() => {
    api.backfillXeroInvoices.mockReset();
  });

  it("cannot send anything until the check has been run", async () => {
    renderPage();

    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled();
    expect(api.backfillXeroInvoices).not.toHaveBeenCalled();
  });

  it("checks without writing, then lists what is left", async () => {
    api.backfillXeroInvoices.mockResolvedValue(summary());
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Check what is left" }));

    expect(await screen.findByText("2 left to send")).toBeInTheDocument();
    expect(screen.getByText("INV-1")).toBeInTheDocument();
    expect(api.backfillXeroInvoices).toHaveBeenCalledWith({
      dryRun: true,
      sendEmail: false,
      limit: 30,
    });
  });

  it("sends a confirmed batch of the chosen size, without email by default", async () => {
    api.backfillXeroInvoices
      .mockResolvedValueOnce(summary())
      .mockResolvedValueOnce(
        summary({
          dryRun: false,
          created: 1,
          results: [
            { invoiceId: "a", xeroInvoiceNumber: "INV-1", amountDue: 560, outcome: "created" },
          ],
        })
      )
      .mockResolvedValueOnce(
        summary({
          matching: 1,
          results: [
            { invoiceId: "b", xeroInvoiceNumber: "INV-2", amountDue: 480, outcome: "would-create" },
          ],
        })
      );
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Check what is left" }));
    await screen.findByText("2 left to send");
    await user.click(screen.getByRole("button", { name: "Send 1 to Xero" }));
    expect(screen.getByText(/Xero will not email them/)).toBeInTheDocument();
    expect(api.backfillXeroInvoices).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Send 1" }));

    await waitFor(() => expect(api.backfillXeroInvoices).toHaveBeenCalledTimes(3));
    expect(api.backfillXeroInvoices).toHaveBeenNthCalledWith(2, {
      dryRun: false,
      sendEmail: false,
      limit: 1,
      invoiceIds: ["a"],
    });
    expect(await screen.findByText("1 left to send")).toBeInTheDocument();
    expect(screen.getByText("Created in Xero")).toBeInTheDocument();
  });

  it("asks for a fresh check and warns about emailing when email is switched on", async () => {
    api.backfillXeroInvoices.mockResolvedValue(summary());
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Check what is left" }));
    await screen.findByText("2 left to send");
    await user.click(screen.getByLabelText(/Xero emails each invoice/));

    expect(screen.queryByText("2 left to send")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send/ })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Check what is left" }));
    await screen.findByText("2 left to send");
    await user.click(screen.getByRole("button", { name: "Send 1 to Xero" }));

    expect(screen.getByText(/Xero emails each one to the parent/)).toBeInTheDocument();
  });

  it("only sends the invoices that were previewed, even if the batch size is larger", async () => {
    api.backfillXeroInvoices
      .mockResolvedValueOnce(summary())
      .mockResolvedValueOnce(summary({ dryRun: false, results: [] }))
      .mockResolvedValueOnce(summary({ matching: 0, results: [] }));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Check what is left" }));
    await screen.findByText("2 left to send");
    await user.selectOptions(screen.getByLabelText("Batch size"), "20");
    await user.click(screen.getByRole("button", { name: "Send 2 to Xero" }));
    await user.click(screen.getByRole("button", { name: "Send 2" }));

    await waitFor(() => expect(api.backfillXeroInvoices).toHaveBeenCalledTimes(3));
    expect(api.backfillXeroInvoices).toHaveBeenNthCalledWith(2, {
      dryRun: false,
      sendEmail: false,
      limit: 2,
      invoiceIds: ["a", "b"],
    });
  });

  it("does not report success when an invoice was created but its email failed", async () => {
    api.backfillXeroInvoices
      .mockResolvedValueOnce(summary())
      .mockResolvedValueOnce(
        summary({
          dryRun: false,
          created: 1,
          emailed: 0,
          results: [
            {
              invoiceId: "a",
              xeroInvoiceNumber: "INV-1",
              amountDue: 560,
              outcome: "created",
              emailed: false,
              emailError: "mail down",
            },
          ],
        })
      )
      .mockResolvedValueOnce(summary({ matching: 1 }));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Check what is left" }));
    await screen.findByText("2 left to send");
    await user.click(screen.getByRole("button", { name: "Send 1 to Xero" }));
    await user.click(screen.getByRole("button", { name: "Send 1" }));

    expect(await screen.findByText(/1 email\(s\) did not send/)).toBeInTheDocument();
    expect(screen.queryByText("Batch finished.")).not.toBeInTheDocument();
  });

  it("counts a retried email once", async () => {
    api.backfillXeroInvoices
      .mockResolvedValueOnce(summary())
      .mockResolvedValueOnce(
        summary({
          dryRun: false,
          emailed: 1,
          emailRetried: 1,
          results: [
            {
              invoiceId: "a",
              xeroInvoiceNumber: "INV-1",
              amountDue: 560,
              outcome: "emailed",
              emailed: true,
            },
          ],
        })
      )
      .mockResolvedValueOnce(summary({ matching: 1 }));
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Check what is left" }));
    await screen.findByText("2 left to send");
    await user.click(screen.getByRole("button", { name: "Send 1 to Xero" }));
    await user.click(screen.getByRole("button", { name: "Send 1" }));

    expect(await screen.findByText(/1 emailed,/)).toBeInTheDocument();
  });
});
