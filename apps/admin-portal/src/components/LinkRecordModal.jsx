import React, { useMemo, useRef, useState } from "react";
import { linkStudentToParent } from "../backend/studentsApi";
import Badge from "./Badge";
import Button from "./Button";
import Icon from "./Icon";
import Modal from "./Modal";

function fullName(firstName, lastName) {
  return `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim();
}

function displayName(rec) {
  return rec?.displayName || fullName(rec?.firstName, rec?.lastName) || rec?.email || rec?.uid || rec?.id || "";
}

export default function LinkRecordModal({ open, record, isStudent, users, students, onClose, onSuccess }) {
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");

  const prevOpen = useRef(open);
  if (open !== prevOpen.current) {
    prevOpen.current = open;
    if (open) {
      setSearch("");
      setSelected(null);
      setError("");
    }
  }

  const { candidates, alreadyLinked, title, subtitle, searchPlaceholder } = useMemo(() => {
    if (!record) {
      return { candidates: [], alreadyLinked: new Set(), title: "Link record", subtitle: "", searchPlaceholder: "Search" };
    }

    const uid = record.uid || record.id;

    if (isStudent) {
      const parentArrOnRecord = record.parents || record.parentIds || [];
      const linkedFromRecord  = new Set(Array.isArray(parentArrOnRecord) ? parentArrOnRecord.filter(Boolean) : []);
      const parents = users.filter((u) => u.role === "parent");
      // also check reverse: parent.students includes this student
      const linked = new Set(linkedFromRecord);
      parents.forEach((p) => {
        const pStudents = p.students || p.studentIds || [];
        if (Array.isArray(pStudents) && pStudents.includes(record.id)) linked.add(p.uid || p.id);
      });
      return {
        candidates: parents,
        alreadyLinked: linked,
        title: "Link parent",
        subtitle: "Choose a parent account to link to this student.",
        searchPlaceholder: "Search parents",
      };
    } else {
      // parent page — link students
      const studentArrOnRecord = record.students || record.studentIds || [];
      const linkedFromRecord   = new Set(Array.isArray(studentArrOnRecord) ? studentArrOnRecord.filter(Boolean) : []);
      const linked = new Set(linkedFromRecord);
      students.forEach((s) => {
        const sParents = s.parents || s.parentIds || [];
        if (Array.isArray(sParents) && sParents.includes(uid)) linked.add(s.id);
      });
      return {
        candidates: students,
        alreadyLinked: linked,
        title: "Link student",
        subtitle: "Choose a student record to link to this parent.",
        searchPlaceholder: "Search students",
      };
    }
  }, [isStudent, record, students, users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const name  = displayName(c);
      const email = c.email || "";
      const id    = c.uid || c.id || "";
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || id.toLowerCase().includes(q);
    });
  }, [candidates, search]);

  function handleClose() {
    if (!busy) onClose?.();
  }

  async function handleLink() {
    if (!selected) return;
    setError("");
    setBusy(true);
    try {
      const parentId  = isStudent ? (selected.uid || selected.id) : (record.uid || record.id);
      const studentId = isStudent ? record.id : selected.id;
      await linkStudentToParent(parentId, studentId);
      onSuccess?.();
    } catch (err) {
      setError(err?.message || "Failed to link record.");
      setBusy(false);
    }
  }

  const selectedName = selected ? displayName(selected) : null;

  return (
    <Modal
      open={open}
      title={title}
      subtitle={subtitle}
      busy={busy}
      onClose={handleClose}
      footer={
        <>
          <Button disabled={busy} onClick={handleClose} variant="secondary">Cancel</Button>
          <Button disabled={busy || !selected} loading={busy} onClick={handleLink} variant="primary">
            {selected ? `Link "${selectedName}"` : "Select a record"}
          </Button>
        </>
      }
    >
      {error ? (
        <div className="banner banner-danger mb-4">
          <div><div className="banner-title">Could not link</div><div>{error}</div></div>
        </div>
      ) : null}

      <div className="field-search mb-3">
        <Icon className="search-icon" name="search" size={16} />
        <input
          autoFocus
          className="input"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="link-list">
        {filtered.length === 0 ? (
          <div className="muted text-sm p-3">No records found.</div>
        ) : (
          filtered.map((c) => {
            const cId    = c.uid || c.id;
            const linked = alreadyLinked.has(cId);
            const isSel  = selected && (selected.uid || selected.id) === cId;
            const name   = displayName(c);
            const sub    = isStudent ? (c.email || "") : (c.grade || c.studentYear || c.year || "");
            return (
              <div
                className={`link-row${isSel ? " selected" : ""}${linked ? " linked" : ""}`}
                key={cId}
                onClick={() => { if (!linked && !busy) setSelected(isSel ? null : c); }}
                role="option"
                aria-selected={isSel}
              >
                <div className="row-meta grow">
                  <span className="primary">{name}</span>
                  {sub ? <span className="secondary">{sub}</span> : null}
                </div>
                {linked
                  ? <Badge tone="brand">Already linked</Badge>
                  : isSel
                    ? <Badge tone="neutral">Selected</Badge>
                    : null}
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
