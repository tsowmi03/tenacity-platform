import React, { useState } from "react";
import { backfillXeroInvoices } from "../backend/invoicesApi";
import Badge from "../components/Badge";
import Button from "../components/Button";
import ConfirmDialog from "../components/ConfirmDialog";
import PageHeader from "../components/PageHeader";
import Table from "../components/Table";
import { useToast } from "../components/ToastProvider";

const BATCH_SIZES = [1, 5, 10, 20];

const OUTCOME_LABELS = {
  "would-create": { label: "Would create", tone: "neutral" },
  "would-email": { label: "Would email", tone: "neutral" },
  created: { label: "Created in Xero", tone: "success" },
  "linked-existing": { label: "Already in Xero", tone: "success" },
  emailed: { label: "Email sent", tone: "success" },
  skipped: { label: "Skipped", tone: "warn" },
  failed: { label: "Failed", tone: "danger" },
};

function money(amount) {
  return typeof amount === "number"
    ? amount.toLocaleString("en-AU", { style: "currency", currency: "AUD" })
    : "-";
}

function detail(row) {
  if (row.error) return row.error;
  if (row.emailError) return `Email failed: ${row.emailError}`;
  if (row.reason) return row.reason;
  if (row.emailed) return "Emailed by Xero";
  if (row.wouldEmail) return "Would be emailed by Xero";
  return "";
}

const columns = [
  { key: "xeroInvoiceNumber", header: "Xero number", mobile: "title" },
  { key: "invoiceId", header: "Invoice", mobile: "hide" },
  { key: "amountDue", header: "Amount", render: (row) => money(row.amountDue) },
  {
    key: "outcome",
    header: "Result",
    render: (row) => {
      const outcome = OUTCOME_LABELS[row.outcome] || { label: row.outcome, tone: "neutral" };
      return <Badge tone={outcome.tone}>{outcome.label}</Badge>;
    },
  },
  { key: "detail", header: "Detail", render: (row) => detail(row) || "-" },
];

/**
 * Sends the unpaid invoices that never reached Xero (TP-39) there, in batches.
 * Nothing is written until a dry run has been seen on this page and the batch
 * is confirmed.
 */
export default function XeroBackfillPage() {
  const toast = useToast();
  const [sendEmail, setSendEmail] = useState(false);
  const [batchSize, setBatchSize] = useState(1);
  const [preview, setPreview] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [busy, setBusy] = useState(null);
  const [confirming, setConfirming] = useState(false);

  async function runDry(nextSendEmail = sendEmail) {
    setBusy("dry");
    try {
      setPreview(await backfillXeroInvoices({ dryRun: true, sendEmail: nextSendEmail, limit: 30 }));
    } catch (error) {
      toast.error(error?.userMessage || error?.message || "Could not run the dry run.");
    } finally {
      setBusy(null);
    }
  }

  async function runBatch() {
    setConfirming(false);
    setBusy("apply");
    try {
      const result = await backfillXeroInvoices({
        dryRun: false,
        sendEmail,
        limit: batchSize,
      });
      setLastRun(result);
      if (result.failed) toast.error(`${result.failed} invoice(s) failed. See the results below.`);
      else toast.success("Batch finished.");
    } catch (error) {
      toast.error(error?.userMessage || error?.message || "The batch did not finish.");
    } finally {
      setBusy(null);
    }
    // Always refresh what is left, including after an error that may have done part of the work.
    await runDry();
  }

  const remaining = preview?.matching ?? null;
  const batchCount = remaining === null ? 0 : Math.min(batchSize, remaining);

  return (
    <>
      <PageHeader
        title="Send invoices to Xero"
        subtitle="Unpaid invoices that never reached Xero, sent in batches. Run the check first; nothing changes until you confirm a batch."
      />

      <div className="card">
        <div className="card-body">
          <div className="row gap-3" style={{ flexWrap: "wrap", alignItems: "center" }}>
            <label className="row gap-2">
              <input
                checked={sendEmail}
                disabled={Boolean(busy)}
                onChange={(event) => {
                  setSendEmail(event.target.checked);
                  setPreview(null);
                }}
                type="checkbox"
              />
              Xero emails each invoice to the parent
            </label>
            <label className="row gap-2">
              Batch size
              <select
                aria-label="Batch size"
                disabled={Boolean(busy)}
                onChange={(event) => setBatchSize(Number(event.target.value))}
                value={batchSize}
              >
                {BATCH_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <Button loading={busy === "dry"} disabled={Boolean(busy)} onClick={() => runDry()}>
              Check what is left
            </Button>
            <Button
              disabled={Boolean(busy) || !remaining}
              loading={busy === "apply"}
              onClick={() => setConfirming(true)}
              variant="primary"
            >
              Send {batchCount || ""} to Xero
            </Button>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            Start with a batch of 1 to confirm the Xero connection works. Each invoice takes
            about 7 seconds; a batch of 20 takes a couple of minutes, so keep this page open.
          </p>
        </div>
      </div>

      {preview ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-body">
            <h2>{preview.matching === 0 ? "Nothing left to send" : `${preview.matching} left to send`}</h2>
            {preview.results.length ? (
              <Table columns={columns} getRowKey={(row) => row.invoiceId} rows={preview.results} />
            ) : null}
          </div>
        </div>
      ) : null}

      {lastRun ? (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-body">
            <h2>Last batch</h2>
            <p>
              {lastRun.created} created, {lastRun.linkedExisting} already in Xero,{" "}
              {lastRun.emailed + lastRun.emailRetried} emailed, {lastRun.skipped} skipped,{" "}
              {lastRun.failed} failed.
            </p>
            <Table columns={columns} getRowKey={(row) => row.invoiceId} rows={lastRun.results} />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        confirmLabel={`Send ${batchCount}`}
        message={
          sendEmail
            ? `This creates ${batchCount} invoice(s) in Xero and Xero emails each one to the parent.`
            : `This creates ${batchCount} invoice(s) in Xero. Xero will not email them.`
        }
        onCancel={() => setConfirming(false)}
        onConfirm={runBatch}
        open={confirming}
        title="Send to Xero"
        tone={sendEmail ? "danger" : "primary"}
      />
    </>
  );
}
