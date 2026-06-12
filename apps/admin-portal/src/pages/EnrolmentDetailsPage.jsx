import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../AuthProvider";
import {
  acceptEnrolment,
  archiveEnrolment,
  getEnrolment,
  unarchiveEnrolment,
  updateEnrolment,
} from "../backend/enrolmentsApi";
import {
  buildEnrolmentUpdatePayload,
  editFormFromEnrolment,
} from "../backend/enrolmentEditPayload";
import {
  REFERRAL_SOURCE_OPTIONS,
  referralSourceLabel,
  referralSourceOption,
} from "../backend/referralSources";
import Badge from "../components/Badge";
import Button from "../components/Button";
import PageHeader from "../components/PageHeader";

export default function EnrolmentDetailsPage() {
  const navigate = useNavigate();
  const { enrolmentId: rawEnrolmentId } = useParams();
  const enrolmentId = useMemo(() => {
    const raw = String(rawEnrolmentId || "").trim();
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [rawEnrolmentId]);

  const { user, isAdmin } = useAuth();

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const [enrolmentBusy, setEnrolmentBusy] = useState(false);
  const [enrolmentError, setEnrolmentError] = useState("");
  const [enrolmentData, setEnrolmentData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(() => editFormFromEnrolment());

  const loadEnrolment = useCallback(
    async ({ cancelled = () => false } = {}) => {
      setEnrolmentError("");
      setEnrolmentData(null);

      if (!enrolmentId) {
        setEnrolmentError("Missing enrolment id.");
        return;
      }

      if (!user) {
        setEnrolmentError("You must be signed in to view enrolments.");
        return;
      }
      if (!isAdmin) {
        setEnrolmentError('Access denied: requires admin role ("role: admin").');
        return;
      }

      setEnrolmentBusy(true);
      try {
        const data = await getEnrolment(enrolmentId);
        if (!data) {
          if (!cancelled()) setEnrolmentError("Enrolment not found.");
          return;
        }
        if (!cancelled()) {
          setEnrolmentData(data);
          setEditForm(editFormFromEnrolment(data));
        }
      } catch (e) {
        console.error(e);
        if (!cancelled()) setEnrolmentError(e?.message || "Failed to load enrolment details.");
      } finally {
        if (!cancelled()) setEnrolmentBusy(false);
      }
    },
    [enrolmentId, isAdmin, user]
  );

  useEffect(() => {
    let cancelled = false;

    loadEnrolment({ cancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, [loadEnrolment]);

  function formatEnrolmentValue(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);

    if (typeof value?.toDate === "function") {
      try {
        return value.toDate().toISOString();
      } catch {
        return String(value);
      }
    }

    if (Array.isArray(value)) {
      const parts = value.map((v) => formatEnrolmentValue(v)).filter(Boolean);
      return parts.length ? parts.join(", ") : "";
    }

    if (typeof value === "object") {
      try {
        return JSON.stringify(
          value,
          (k, v) => {
            if (v && typeof v?.toDate === "function") {
              try {
                return v.toDate().toISOString();
              } catch {
                return String(v);
              }
            }
            return v;
          },
          2
        );
      } catch {
        return String(value);
      }
    }

    return String(value);
  }

  function formatFullName(firstName, lastName) {
    return `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
  }

  function formatStudentYear(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    if (/^year\s+/i.test(value)) return value;
    if (/^\d+$/.test(value)) return `Year ${value}`;
    return value;
  }

  function formatClasses(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const parts = list
      .map((c) => {
        const day = String(c?.day || "").trim();
        const startTime = String(c?.startTime || "").trim();
        const label = `${day}${day && startTime ? " @ " : ""}${startTime}`.trim();
        return label;
      })
      .filter(Boolean);
    return parts.join(", ");
  }

  function formatSubjects(raw) {
    const list = Array.isArray(raw) ? raw : [];
    const parts = list.map((s) => String(s || "").trim()).filter(Boolean);
    return parts.join(", ");
  }

  function renderField(label, value) {
    const formatted = formatEnrolmentValue(value);
    return (
      <div className="field-readonly">
        <span className="label">{label}</span>
        <div className="readonly-box">{formatted || "(empty)"}</div>
      </div>
    );
  }

  function updateEditField(field, value) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  function updateReferralSource(value) {
    const option = referralSourceOption(value);
    setEditForm((current) => ({
      ...current,
      referralSource: value,
      referralSourceDetail: option?.detailLabel
        ? current.referralSourceDetail
        : "",
    }));
  }

  function updateClassField(index, field, value) {
    setEditForm((current) => {
      const classes = [...(current.classes || [])];
      classes[index] = { ...classes[index], [field]: value };
      return { ...current, classes };
    });
  }

  function addClassRow() {
    setEditForm((current) => ({
      ...current,
      classes: [...(current.classes || []), { id: "", day: "", startTime: "" }],
    }));
  }

  function removeClassRow(index) {
    setEditForm((current) => ({
      ...current,
      classes: (current.classes || []).filter((_, i) => i !== index),
    }));
  }

  function startEditing() {
    setResult("");
    setError("");
    setEditForm(editFormFromEnrolment(enrolmentData));
    setIsEditing(true);
  }

  function cancelEditing() {
    setError("");
    setEditForm(editFormFromEnrolment(enrolmentData));
    setIsEditing(false);
  }

  function renderInput(label, field, options = {}) {
    const Element = options.multiline ? "textarea" : "input";
    return (
      <label className="field">
        <span className="label">{label}</span>
        <Element
          className={options.multiline ? "textarea" : "input"}
          type={options.type || "text"}
          value={editForm[field]}
          onChange={(event) => updateEditField(field, event.target.value)}
        />
      </label>
    );
  }

  function renderEditForm() {
    const selectedReferralSource = referralSourceOption(editForm.referralSource);

    return (
      <div className="field-section">
        <h4>Student details</h4>
        <div className="grid grid-2">
          {renderInput("First name", "studentFirstName")}
          {renderInput("Last name", "studentLastName")}
        </div>
        {renderInput("Year", "studentYear")}
        {renderInput("Subjects", "studentSubjects")}

        <div className="class-edit-list">
          <div className="row between wrap">
            <span className="label">Class references</span>
            <Button size="sm" variant="secondary" onClick={addClassRow}>
              Add class
            </Button>
          </div>
          {(editForm.classes || []).length === 0 ? (
            <p className="hint">No classes selected.</p>
          ) : null}
          {(editForm.classes || []).map((classRef, index) => (
            <div className="class-edit-row" key={index}>
              <label className="field">
                <span className="label">Class reference</span>
                <input
                  className="input"
                  value={classRef.id}
                  onChange={(event) => updateClassField(index, "id", event.target.value)}
                />
              </label>
              <label className="field">
                <span className="label">Day</span>
                <input
                  className="input"
                  value={classRef.day}
                  onChange={(event) => updateClassField(index, "day", event.target.value)}
                />
              </label>
              <label className="field">
                <span className="label">Start time</span>
                <input
                  className="input"
                  value={classRef.startTime}
                  onChange={(event) => updateClassField(index, "startTime", event.target.value)}
                />
              </label>
              <Button variant="ghost" onClick={() => removeClassRow(index)}>
                Remove
              </Button>
            </div>
          ))}
        </div>

        <h4>Parent/carer details</h4>
        <div className="grid grid-2">
          {renderInput("First name", "carerFirstName")}
          {renderInput("Last name", "carerLastName")}
        </div>
        <div className="grid grid-2">
          {renderInput("Email", "carerEmail", { type: "email" })}
          {renderInput("Phone", "carerPhone")}
        </div>

        <h4>Emergency contact details</h4>
        <div className="grid grid-2">
          {renderInput("First name", "emergencyContactFirstName")}
          {renderInput("Last name", "emergencyContactLastName")}
        </div>
        <div className="grid grid-2">
          {renderInput("Phone", "emergencyContactPhone")}
          {renderInput("Relation", "emergencyContactRelation")}
        </div>

        <h4>Additional details</h4>
        {renderInput("Allergies", "allergies", { multiline: true })}
        <label className="checkbox">
          <input
            checked={editForm.permissionToLeave}
            type="checkbox"
            onChange={(event) => updateEditField("permissionToLeave", event.target.checked)}
          />
          Permission to leave
        </label>
        {renderInput("Additional info", "additionalInfo", { multiline: true })}
        <label className="field">
          <span className="label">How they heard about us</span>
          <select
            className="select"
            value={editForm.referralSource}
            onChange={(event) => updateReferralSource(event.target.value)}
          >
            <option value="">Not recorded</option>
            {REFERRAL_SOURCE_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
        </label>
        {selectedReferralSource?.detailLabel
          ? renderInput(
              selectedReferralSource.detailLabel,
              "referralSourceDetail"
            )
          : null}
      </div>
    );
  }

  function enrolmentStatus() {
    const status = String(enrolmentData?.status || "").toLowerCase();
    if (status === "accepted") return "accepted";
    if (status === "deleted") return "archived";
    if (enrolmentData?.archived || status === "archived") return "archived";
    return "pending";
  }

  function statusTone(status) {
    if (status === "accepted") return "success";
    if (status === "archived") return "neutral";
    return "info";
  }

  function statusLabel(status) {
    if (status === "accepted") return "Accepted";
    if (status === "archived") return "Archived";
    return "Pending";
  }

  async function runAction(actionName, task, successMessage) {
    setResult("");
    setError("");

    if (!user) {
      setError("You must be signed in to perform this action.");
      return;
    }

    if (!isAdmin) {
      setError('Access denied: requires admin role ("role: admin").');
      return;
    }

    if (!enrolmentId) {
      setError("Missing enrolmentId in URL.");
      return;
    }

    setBusy(actionName);
    try {
      const data = await task();
      setResult(successMessage(data));
      await loadEnrolment();
      return true;
    } catch (e) {
      console.error(e);
      setError(e?.message || "Action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onAcceptEnrolment() {
    await runAction(
      "accept",
      () => acceptEnrolment(enrolmentId),
      (data) => data?.idempotent
        ? "This enrolment has already been accepted."
        : "Enrolment accepted."
    );
  }

  async function onArchiveEnrolment() {
    await runAction(
      "archive",
      () => archiveEnrolment(enrolmentId),
      () => "Enrolment archived."
    );
  }

  async function onUnarchiveEnrolment() {
    await runAction(
      "unarchive",
      () => unarchiveEnrolment(enrolmentId),
      () => "Enrolment restored to the active queue."
    );
  }

  async function onUpdateEnrolment() {
    let payload;
    try {
      payload = buildEnrolmentUpdatePayload(editForm);
    } catch (e) {
      setResult("");
      setError(e?.message || "Could not prepare enrolment update.");
      return;
    }

    const ok = await runAction(
      "update",
      () => updateEnrolment(enrolmentId, payload),
      (data) => {
        const fields = Array.isArray(data?.updatedFields) ? data.updatedFields.length : 0;
        return fields ? `Enrolment updated (${fields} fields).` : "Enrolment updated.";
      }
    );

    if (ok) setIsEditing(false);
  }

  const status = enrolmentStatus();
  const hasEnrolment = Boolean(enrolmentData);
  const canAccept = hasEnrolment && status === "pending";
  const canArchive = hasEnrolment && status === "pending";
  const canUnarchive = hasEnrolment && status === "archived";
  const canEdit = hasEnrolment && (status === "pending" || status === "archived");
  const actionInFlight = Boolean(busy);
  const studentDisplayName = enrolmentData
    ? formatFullName(enrolmentData.studentFirstName, enrolmentData.studentLastName)
    : "";

  return (
    <>
      <PageHeader
        title="Enrolment details"
        subtitle="Review intake information before accepting the enrolment."
        crumbs={[{ label: "Overview", href: "/" }, { label: "Enrolments", href: "/enrolments" }, { label: studentDisplayName || "Details" }]}
        actions={<Button onClick={() => navigate("/enrolments")} variant="secondary">Back to list</Button>}
      />

      <div className="detail-grid">
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Intake record</h3>
              <div className="card-sub">{studentDisplayName || "Review student and carer details."}</div>
            </div>
            <div className="row wrap">
              <Badge tone={statusTone(status)}>{statusLabel(status)}</Badge>
              {canEdit && !isEditing ? (
                <Button disabled={actionInFlight || enrolmentBusy} onClick={startEditing} size="sm" variant="secondary">
                  Edit intake
                </Button>
              ) : null}
            </div>
          </div>

          <div className="card-body">

          {enrolmentBusy ? <p className="result">Loading enrolment details...</p> : null}
          {enrolmentError ? (
            <div className="banner banner-danger">
              <div>
                <div className="banner-title">Could not load enrolment</div>
                <div>{enrolmentError}</div>
              </div>
            </div>
          ) : null}

          {!enrolmentBusy && !enrolmentError && enrolmentData && isEditing ? (
            renderEditForm()
          ) : null}

          {!enrolmentBusy && !enrolmentError && enrolmentData && !isEditing ? (
            <div className="field-section">
              <h4>Student details</h4>
              {renderField(
                "Name",
                formatFullName(enrolmentData.studentFirstName, enrolmentData.studentLastName)
              )}
              {renderField("Year", formatStudentYear(enrolmentData.studentYear))}
              {renderField("Class(es)", formatClasses(enrolmentData.classes))}
              {renderField("Subjects", formatSubjects(enrolmentData.studentSubjects))}

              <h4>Parent/carer details</h4>
              {renderField(
                "Name",
                formatFullName(enrolmentData.carerFirstName, enrolmentData.carerLastName)
              )}
              {renderField("Phone", enrolmentData.carerPhone)}
              {renderField("Email", enrolmentData.carerEmail)}

              <h4>Emergency contact details</h4>
              {renderField(
                "Name",
                formatFullName(
                  enrolmentData.emergencyContactFirstName,
                  enrolmentData.emergencyContactLastName
                )
              )}
              {renderField("Phone", enrolmentData.emergencyContactPhone)}
              {renderField("Relation", enrolmentData.emergencyContactRelation)}

              <h4>Additional details</h4>
              {renderField("Allergies", enrolmentData.allergies)}
              {renderField("Permission to Leave", enrolmentData.permissionToLeave)}
              {renderField("Additional Info", enrolmentData.additionalInfo)}
              {renderField(
                "How they heard about us",
                referralSourceLabel(enrolmentData.referralSource)
              )}
              {renderField("Referral detail", enrolmentData.referralSourceDetail)}
            </div>
          ) : null}
          </div>
        </div>

        <aside className="card">
          <div className="card-head">
            <div>
              <h3>Actions</h3>
              <div className="card-sub">Accept, archive, or restore this intake record.</div>
            </div>
          </div>
          <div className="card-body">
            <div className="grid gap-3">
              {isEditing ? (
                <>
                  <Button loading={busy === "update"} onClick={onUpdateEnrolment} disabled={!isAdmin || !canEdit || enrolmentBusy || actionInFlight} variant="primary">
                    Save intake changes
                  </Button>
                  <Button onClick={cancelEditing} disabled={actionInFlight} variant="secondary">
                    Cancel editing
                  </Button>
                </>
              ) : null}

              <Button loading={busy === "accept"} onClick={onAcceptEnrolment} disabled={!isAdmin || !canAccept || isEditing || enrolmentBusy || actionInFlight} variant="primary">
                Accept enrolment
              </Button>

              {canArchive ? (
                <Button loading={busy === "archive"} onClick={onArchiveEnrolment} disabled={!isAdmin || isEditing || enrolmentBusy || actionInFlight} variant="secondary">
                  Archive
                </Button>
              ) : null}

              {canUnarchive ? (
                <Button loading={busy === "unarchive"} onClick={onUnarchiveEnrolment} disabled={!isAdmin || isEditing || enrolmentBusy || actionInFlight} variant="secondary">
                  Restore to active queue
                </Button>
              ) : null}

            </div>

            {result ? (
              <div className="banner banner-success mt-5">
                <div>
                  <div className="banner-title">Action complete</div>
                  <div>{result}</div>
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="banner banner-danger mt-5">
                <div>
                  <div className="banner-title">Action failed</div>
                  <div>{error}</div>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
        </div>
    </>
  );
}
