import React from "react";
import Button from "./Button";
import Icon from "./Icon";

export function emptyLineItem() {
  return {
    description: "",
    quantity: 1,
    unitAmount: 0,
    lineTotal: 0,
    studentName: "",
    isAdminAdjustment: false,
  };
}

export function computeLineTotal(item) {
  const q = Number(item?.quantity || 0);
  const u = Number(item?.unitAmount || 0);
  if (!Number.isFinite(q) || !Number.isFinite(u)) return 0;
  return Math.round(q * u * 100) / 100;
}

export function lineItemsSum(items) {
  if (!Array.isArray(items)) return 0;
  return Math.round(items.reduce((sum, it) => sum + Number(it?.lineTotal || 0), 0) * 100) / 100;
}

export function normalizeLineItemsForSubmit(items) {
  return items.map((it) => {
    const out = {
      description: String(it.description || "").trim(),
      quantity:    Number(it.quantity || 0),
      unitAmount:  Number(it.unitAmount || 0),
      lineTotal:   Number(it.lineTotal || 0),
    };
    if (it.studentName && String(it.studentName).trim()) out.studentName = String(it.studentName).trim();
    if (it.isAdminAdjustment) out.isAdminAdjustment = true;
    return out;
  });
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(value || 0));
}

export default function LineItemsEditor({ items, onChange, disabled }) {
  function update(index, field, value) {
    const next = items.map((it, i) => {
      if (i !== index) return it;
      const updated = { ...it, [field]: value };
      if (!updated.isAdminAdjustment && (field === "quantity" || field === "unitAmount")) {
        updated.lineTotal = computeLineTotal(updated);
      }
      if (field === "isAdminAdjustment" && !value) {
        updated.lineTotal = computeLineTotal(updated);
      }
      return updated;
    });
    onChange(next);
  }

  function remove(index) {
    onChange(items.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...items, emptyLineItem()]);
  }

  const total = lineItemsSum(items);

  return (
    <div className="line-items-editor">
      <div className="line-items-head">
        <div className="li-col li-col-desc">Description</div>
        <div className="li-col li-col-num">Qty</div>
        <div className="li-col li-col-num">Unit ($)</div>
        <div className="li-col li-col-num">Total ($)</div>
        <div className="li-col li-col-actions"></div>
      </div>
      {items.length === 0 ? (
        <div className="line-items-empty muted text-sm">No line items. Add at least one to create an invoice.</div>
      ) : null}
      {items.map((item, index) => (
        <div className="line-items-row" key={index}>
          <div className="li-col li-col-desc">
            <input
              className="input"
              disabled={disabled}
              placeholder="Line description"
              value={item.description || ""}
              onChange={(e) => update(index, "description", e.target.value)}
            />
            <div className="row gap-2 mt-2">
              <input
                className="input input-sm"
                disabled={disabled}
                placeholder="Student name (optional)"
                value={item.studentName || ""}
                onChange={(e) => update(index, "studentName", e.target.value)}
                style={{ flex: 1 }}
              />
              <label className="radio-label" style={{ whiteSpace: "nowrap" }}>
                <input
                  checked={Boolean(item.isAdminAdjustment)}
                  disabled={disabled}
                  type="checkbox"
                  onChange={(e) => update(index, "isAdminAdjustment", e.target.checked)}
                />
                Admin adjustment
              </label>
            </div>
          </div>
          <div className="li-col li-col-num">
            <input
              className="input text-right"
              disabled={disabled}
              min={0}
              step="any"
              type="number"
              value={item.quantity ?? 0}
              onChange={(e) => update(index, "quantity", e.target.value === "" ? 0 : Number(e.target.value))}
            />
          </div>
          <div className="li-col li-col-num">
            <input
              className="input text-right"
              disabled={disabled}
              step="any"
              type="number"
              value={item.unitAmount ?? 0}
              onChange={(e) => update(index, "unitAmount", e.target.value === "" ? 0 : Number(e.target.value))}
            />
          </div>
          <div className="li-col li-col-num">
            <input
              className="input text-right"
              disabled={disabled || !item.isAdminAdjustment}
              step="any"
              title={item.isAdminAdjustment ? "Admin adjustment — set total directly" : "Computed as Qty × Unit"}
              type="number"
              value={item.lineTotal ?? 0}
              onChange={(e) => update(index, "lineTotal", e.target.value === "" ? 0 : Number(e.target.value))}
            />
          </div>
          <div className="li-col li-col-actions">
            <button
              aria-label="Remove line"
              className="icon-btn"
              disabled={disabled}
              type="button"
              onClick={() => remove(index)}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>
      ))}
      <div className="line-items-foot">
        <Button disabled={disabled} onClick={add} size="sm" type="button" variant="secondary">
          + Add line item
        </Button>
        <div className="li-total">
          <span className="muted text-sm">Line total</span>
          <span className="text-mono" style={{ fontWeight: 700 }}>{formatMoney(total)}</span>
        </div>
      </div>
    </div>
  );
}
