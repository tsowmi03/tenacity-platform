import React, { useEffect, useState } from "react";
import { updateInvoice } from "../backend/invoicesApi";
import Button from "./Button";
import Icon from "./Icon";
import LineItemsEditor, { lineItemsSum, normalizeLineItemsForSubmit } from "./LineItemsEditor";
import Modal from "./Modal";

const STATUSES = ["unpaid", "paid", "overdue"];

export default function EditInvoiceModal({ open, record, onClose, onSuccess }) {
  const [status,         setStatus]         = useState("unpaid");
  const [dueDate,        setDueDate]        = useState("");
  const [adminNotes,     setAdminNotes]     = useState("");
  const [lineItems,      setLineItems]      = useState([]);
  const [useOverride,    setUseOverride]    = useState(false);
  const [overrideAmount, setOverrideAmount] = useState("");

  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !record) return;
    setStatus(record.status || "unpaid");
    setDueDate(record.dueDateIso ? record.dueDateIso.slice(0, 10) : "");
    setAdminNotes(record.adminNotes || "");
    setLineItems(Array.isArray(record.lineItems) ? record.lineItems.map((it) => ({ ...it })) : []);
    const hasOverride = record.amountDueOverride !== null && record.amountDueOverride !== undefined;
    setUseOverride(hasOverride);
    setOverrideAmount(hasOverride ? String(record.amountDueOverride) : "");
    setError("");
  }, [open, record]);

  const hasXero  = Boolean(record?.xeroInvoiceId);
  const lineTotal     = lineItemsSum(lineItems);
  const overrideNum   = useOverride && overrideAmount !== "" ? Number(overrideAmount) : undefined;
  const dirty         = (() => {
    if (!record) return false;
    if (status !== (record.status || "unpaid")) return true;
    if (adminNotes !== (record.adminNotes || "")) return true;
    const prevDue = record.dueDateIso ? record.dueDateIso.slice(0, 10) : "";
    if (dueDate !== prevDue) return true;
    const prevItems = JSON.stringify(record.lineItems || []);
    const nextItems = JSON.stringify(normalizeLineItemsForSubmit(lineItems));
    if (prevItems !== nextItems) return true;
    const prevOverride = record.amountDueOverride;
    if (useOverride) {
      if (prevOverride === null || prevOverride === undefined) return true;
      if (Number(prevOverride) !== overrideNum) return true;
    } else if (prevOverride !== null && prevOverride !== undefined) {
      return true;
    }
    return false;
  })();

  function handleClose() {
    if (!busy) onClose?.();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!record) return;
    setError("");

    if (useOverride && (!Number.isFinite(overrideNum) || overrideNum < 0)) {
      setError("Override amount must be a non-negative number.");
      return;
    }

    const cleanedItems = normalizeLineItemsForSubmit(lineItems);
    if (cleanedItems.length === 0) { setError("At least one line item is required."); return; }
    if (!cleanedItems.every((it) => it.description && Number.isFinite(it.quantity) && Number.isFinite(it.unitAmount) && Number.isFinite(it.lineTotal))) {
      setError("Each line item needs a description and numeric quantity, unit, and total.");
      return;
    }

    const updates = {};
    if (status !== (record.status || "unpaid"))       updates.status     = status;
    if (adminNotes !== (record.adminNotes || ""))     updates.adminNotes = adminNotes;
    const prevDue = record.dueDateIso ? record.dueDateIso.slice(0, 10) : "";
    if (dueDate && dueDate !== prevDue)               updates.dueDate    = new Date(`${dueDate}T23:59:59`).toISOString();
    const itemsChanged = JSON.stringify(record.lineItems || []) !== JSON.stringify(cleanedItems);
    if (itemsChanged) updates.lineItems = cleanedItems;

    if (useOverride) {
      const prev = record.amountDueOverride;
      if (prev === null || prev === undefined || Number(prev) !== overrideNum) {
        updates.amountDueOverride = overrideNum;
      }
    } else if (record.amountDueOverride !== null && record.amountDueOverride !== undefined) {
      // Clearing an override isn't directly supported by adminUpdateInvoice (omitting = no change).
      // Surface a warning so the admin understands why nothing changes.
      setError("Clearing an override isn't supported by the current backend. Add a $0 Admin adjustment line and keep the override matching the line total, or contact engineering.");
      return;
    }

    if (Object.keys(updates).length === 0) { setError("No changes to save."); return; }

    setBusy(true);
    try {
      const result = await updateInvoice(record.id, updates);
      onSuccess?.(result);
    } catch (err) {
      setError(err?.message || "Failed to update invoice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Edit invoice"
      subtitle="Status, due date, line items, admin override, and admin notes."
      size="lg"
      busy={busy}
      onClose={handleClose}
      footer={
        <>
          <Button disabled={busy} onClick={handleClose} variant="secondary">Cancel</Button>
          <Button form="edit-invoice-form" disabled={busy || !dirty} loading={busy} type="submit" variant="primary">
            Save changes
          </Button>
        </>
      }
    >
      {error ? (
        <div className="banner banner-danger mb-4">
          <div><div className="banner-title">Could not save</div><div>{error}</div></div>
        </div>
      ) : null}

      {hasXero ? (
        <div className="banner banner-warn mb-4">
          <Icon className="banner-icon" name="alert" />
          <div>
            <div className="banner-title">Invoice is synced to Xero</div>
            <div>The portal will not push changes to Xero. Make matching edits in Xero manually if customer-facing fields change. Marking this invoice <span className="text-mono">paid</span> may trigger the existing Xero payment-sync function.</div>
          </div>
        </div>
      ) : null}

      <form className="grid gap-5" id="edit-invoice-form" onSubmit={handleSubmit}>

        <div className="grid grid-2" style={{ gap: "var(--s-3)" }}>
          <div className="field">
            <span className="label">Status <span className="req">*</span></span>
            <select
              className="select"
              disabled={busy}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="label">Due date</span>
            <input
              className="input"
              disabled={busy}
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <h4 className="mb-3">Line items</h4>
          <LineItemsEditor disabled={busy} items={lineItems} onChange={setLineItems} />
        </div>

        <div>
          <h4 className="mb-3">Amount due</h4>
          <label className="checkbox mb-2">
            <input
              checked={useOverride}
              disabled={busy}
              type="checkbox"
              onChange={(e) => {
                setUseOverride(e.target.checked);
                if (!e.target.checked) setOverrideAmount("");
                else if (!overrideAmount) setOverrideAmount(String(lineTotal.toFixed(2)));
              }}
            />
            <span>Use admin override</span>
          </label>
          {useOverride ? (
            <div className="field">
              <span className="label">Override amount ($) <span className="req">*</span></span>
              <input
                className="input input-amount text-mono text-right"
                disabled={busy}
                min={0}
                step="any"
                type="number"
                value={overrideAmount}
                onChange={(e) => setOverrideAmount(e.target.value)}
              />
              <span className="label-hint">
                Must equal the sum of line items. Use an <span className="text-mono">Admin adjustment</span> line to make totals match.
              </span>
            </div>
          ) : null}
          <div className="row gap-4 mt-3" style={{ padding: "10px 14px", background: "var(--ink-50)", borderRadius: "var(--r-md)" }}>
            <div className="grow">
              <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Line total</div>
              <div className="text-mono" style={{ fontWeight: 700, marginTop: 4 }}>{lineTotal.toFixed(2)}</div>
            </div>
            <div className="grow">
              <div className="text-xs muted" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>Final amount</div>
              <div className="text-mono" style={{ fontWeight: 700, marginTop: 4 }}>
                {(useOverride && Number.isFinite(overrideNum) ? overrideNum : lineTotal).toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="mb-3">Admin notes</h4>
          <textarea
            className="textarea"
            disabled={busy}
            placeholder="Internal notes only — not shown to parent."
            rows={3}
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
          />
        </div>

      </form>
    </Modal>
  );
}
