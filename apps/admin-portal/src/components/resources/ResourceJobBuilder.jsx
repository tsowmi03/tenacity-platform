import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../AuthProvider";
import {
  downloadResourceJob,
  findSimilarResources,
  uploadResourceReference,
} from "../../backend/resourcesApi";
import { extractQueryTopics } from "../../backend/topicTaxonomy";
import Button from "../Button";
import Icon from "../Icon";
import { useToast } from "../ToastProvider";
import ResourcePreviewModal from "./ResourcePreviewModal";
import { exemplarForType } from "./exemplars";
import {
  ANSWER_MODES,
  PROMPT_PLACEHOLDERS,
  RESOURCE_BY_KEY,
  RESOURCE_TYPES,
  answerModeLabel,
  resourceLabel,
} from "./resourceTypes";

const YEARS = [5, 6, 7, 8, 9, 10];
const MAX_REFERENCE_FILES = 5;

function initialDraft(subject = "maths") {
  return {
    draftId: Math.random().toString(36).slice(2, 10),
    studentId: "",
    studentName: "",
    year: "",
    subject,
    resourceType: "",
    answerMode: "none",
    customPrompt: "",
    uploadedFiles: [],
    uploadProgress: null,
    uploadError: "",
  };
}

function studentName(student) {
  return student?.displayName || `${student?.firstName || ""} ${student?.lastName || ""}`.trim() || student?.id || "Unknown student";
}

function parseYear(student) {
  const value = student?.grade ?? student?.studentYear ?? student?.year;
  if (typeof value === "number") return value;
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : "";
}

function capitalise(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function truncate(value, length = 90) {
  if (!value || value.length <= length) return value;
  return `${value.slice(0, length).trim()}...`;
}

function formatShortDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function ResourceJobBuilder({
  students,
  studentsLoading,
  onSubmitJobs,
  onSelectedStudentChange,
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [draft, setDraft] = useState(() => initialDraft());
  const [staged, setStaged] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [rowErrors, setRowErrors] = useState({});
  const [suggestions, setSuggestions] = useState({ sameType: [], otherType: [] });
  const [suggestStatus, setSuggestStatus] = useState("idle");
  const [showAllOther, setShowAllOther] = useState(false);
  const [previewType, setPreviewType] = useState(null);
  const activeUploadRef = useRef(null);

  useEffect(() => {
    if (draft.subject === "maths" && draft.resourceType && RESOURCE_BY_KEY[draft.resourceType]?.maths === false) {
      setDraft((current) => ({ ...current, resourceType: "" }));
    }
  }, [draft.subject, draft.resourceType]);

  useEffect(() => {
    if (!RESOURCE_BY_KEY[draft.resourceType]?.hasQuestions) {
      setDraft((current) => ({ ...current, answerMode: "none" }));
    }
  }, [draft.resourceType]);

  useEffect(() => {
    return () => activeUploadRef.current?.cancel?.();
  }, []);

  // Suggest previously-generated resources that match the current draft, so the
  // tutor can reuse one instead of regenerating. Debounced; topic terms are
  // derived from the custom prompt.
  useEffect(() => {
    const { subject, resourceType, year, customPrompt } = draft;
    const topics = extractQueryTopics(customPrompt, subject);
    if (!resourceType || !year || !topics.length) {
      setSuggestions({ sameType: [], otherType: [] });
      setSuggestStatus("idle");
      return undefined;
    }

    let cancelled = false;
    setSuggestStatus("searching");
    setShowAllOther(false);
    const handle = setTimeout(async () => {
      try {
        const rows = await findSimilarResources({ subject, resourceType, topics, year });
        if (!cancelled) {
          setSuggestions(rows);
          setSuggestStatus("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setSuggestions({ sameType: [], otherType: [] });
          setSuggestStatus("ready");
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [draft.subject, draft.resourceType, draft.year, draft.customPrompt]);

  async function handleDownloadSuggestion(job) {
    try {
      await downloadResourceJob(job);
    } catch (error) {
      toast.error("Download failed", error?.userMessage || error?.message || "Could not download this resource.");
    }
  }

  // A single suggestion row. `leadWithType` surfaces the resource format as the
  // headline (used for other-format matches, where the format is the point).
  function renderSuggestionRow(job, { leadWithType = false } = {}) {
    const meta = [
      leadWithType ? null : resourceLabel(job.resourceType),
      job.studentName,
      job.year ? `Year ${job.year}` : null,
      Array.isArray(job.extractedTopics) && job.extractedTopics.length
        ? job.extractedTopics.slice(0, 4).join(", ")
        : null,
      formatShortDate(job.createdAtIso),
    ].filter(Boolean).join(" · ");
    return (
      <li className="rg-suggestion" key={job.id}>
        <div className="rg-suggestion-main">
          <div className="weight-600 text-sm">
            {leadWithType ? resourceLabel(job.resourceType) : job.outputFileName || resourceLabel(job.resourceType)}
          </div>
          <div className="text-xs muted">{meta}</div>
        </div>
        <Button icon="download" onClick={() => handleDownloadSuggestion(job)} size="sm" variant="secondary">
          Download
        </Button>
      </li>
    );
  }

  const selectedType = RESOURCE_BY_KEY[draft.resourceType];
  const selectedExemplar = selectedType ? exemplarForType(draft.subject, selectedType.key) : null;
  const previewExemplar = previewType ? exemplarForType(draft.subject, previewType) : null;
  const { sameType: sameTypeSuggestions, otherType: otherTypeSuggestions } = suggestions;
  const visibleOther = showAllOther ? otherTypeSuggestions : otherTypeSuggestions.slice(0, 2);
  const hasAnySuggestion = sameTypeSuggestions.length > 0 || otherTypeSuggestions.length > 0;
  const canStage = Boolean(
    draft.studentId &&
    draft.year &&
    draft.resourceType &&
    draft.uploadProgress == null &&
    !draft.uploadError
  );
  const stagedCountForSubmit = staged.length + (canStage ? 1 : 0);

  function set(patch) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function setSelectedStudent(student) {
    onSelectedStudentChange?.(
      student
        ? {
            id: student.id,
            name: studentName(student),
          }
        : null
    );
  }

  function clearStudent() {
    set({
      studentId: "",
      studentName: "",
    });
    setSelectedStudent(null);
  }

  function addToStaging() {
    if (!canStage) return;
    setStaged((current) => [...current, { ...draft }]);
    setDraft(initialDraft(draft.subject));
    setSelectedStudent(null);
    setRowErrors({});
  }

  function removeStaged(draftId) {
    setStaged((current) => current.filter((row) => row.draftId !== draftId));
    setRowErrors((current) => {
      const next = { ...current };
      delete next[draftId];
      return next;
    });
  }

  async function handleUpload(files) {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;
    if (draft.uploadedFiles.length + selectedFiles.length > MAX_REFERENCE_FILES) {
      set({ uploadError: `Add up to ${MAX_REFERENCE_FILES} reference documents.`, uploadProgress: null });
      return;
    }
    if (selectedFiles.some((file) => !["pdf", "docx"].includes(file.name.split(".").pop()?.toLowerCase()))) {
      set({ uploadError: "Upload PDF or DOCX files only.", uploadProgress: null });
      return;
    }

    activeUploadRef.current?.cancel?.();
    set({ uploadProgress: 0, uploadError: "" });

    try {
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        const upload = uploadResourceReference({
          file,
          uid: user?.uid,
          onProgress: (progress) => setDraft((current) => ({
            ...current,
            uploadProgress: (index + progress) / selectedFiles.length,
          })),
        });
        activeUploadRef.current = upload.task;
        const result = await upload.promise;
        setDraft((current) => ({
          ...current,
          uploadedFiles: [
            ...current.uploadedFiles,
            {
              path: result.uploadedFilePath,
              name: result.uploadedFileName,
            },
          ],
        }));
      }
      activeUploadRef.current = null;
      setDraft((current) => ({
        ...current,
        uploadProgress: null,
        uploadError: "",
      }));
    } catch (error) {
      activeUploadRef.current = null;
      setDraft((current) => ({
        ...current,
        uploadProgress: null,
        uploadError: error?.userMessage || error?.message || "Upload failed. Check your connection and try again.",
      }));
    }
  }

  async function submit() {
    const rows = [...staged, ...(canStage ? [{ ...draft }] : [])];
    if (!rows.length || submitting) return;

    setSubmitting(true);
    setRowErrors({});
    const result = await onSubmitJobs(rows);
    setSubmitting(false);

    if (result?.ok) {
      setStaged([]);
      setDraft(initialDraft());
      setSelectedStudent(null);
      return;
    }

    setRowErrors(result?.errors || {});
  }

  return (
    <section className="rg-builder">
      <div className="card">
        <div className="card-head">
          <div>
            <h3>New resource</h3>
            <div className="card-sub">Build one or more jobs before submitting them to the queue.</div>
          </div>
        </div>

        <div className="card-body col gap-5">
          <div className="grid grid-2 gap-4">
            <div className="field">
              <label className="label">Student <span className="req">*</span></label>
              <StudentPicker
                loading={studentsLoading}
                students={students}
                value={draft.studentId}
                onChange={(student) => {
                  set({
                    studentId: student.id,
                    studentName: studentName(student),
                    year: parseYear(student) || draft.year,
                  });
                  setSelectedStudent(student);
                }}
                onClear={clearStudent}
              />
            </div>

            <div className="field">
              <label className="label">Year <span className="req">*</span></label>
              <select
                className="select"
                value={draft.year}
                onChange={(event) => set({ year: Number(event.target.value) || "" })}
              >
                <option value="">Select year</option>
                {YEARS.map((year) => <option key={year} value={year}>Year {year}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label className="label">Subject <span className="req">*</span></label>
            <div className="rg-segments" role="group" aria-label="Subject">
              <button className={draft.subject === "maths" ? "active" : ""} onClick={() => set({ subject: "maths" })} type="button">
                <Icon name="grid" size={15} /> Maths
              </button>
              <button className={draft.subject === "english" ? "active" : ""} onClick={() => set({ subject: "english" })} type="button">
                <Icon name="book" size={15} /> English
              </button>
            </div>
          </div>

          <div className="field">
            <label className="label">Resource type <span className="req">*</span></label>
            <div className="rg-type-grid">
              {RESOURCE_TYPES
                .filter((type) => (draft.subject === "english" ? type.english : type.maths))
                .map((type) => {
                  const active = draft.resourceType === type.key;
                  return (
                    <button
                      aria-pressed={active}
                      className={`rg-type ${active ? "active" : ""}`}
                      key={type.key}
                      onClick={() => set({ resourceType: type.key })}
                      title={type.blurb}
                      type="button"
                    >
                      <span className="rg-type-icon"><Icon name={type.icon} size={16} /></span>
                      <span>{type.label}</span>
                      {active ? <Icon className="rg-type-check" name="check" size={14} /> : null}
                    </button>
                  );
                })}
            </div>
            {selectedType ? (
              <div className="hint">
                {selectedType.blurb}
                {selectedExemplar ? (
                  <button
                    className="rg-type-preview-link"
                    onClick={() => setPreviewType(selectedType.key)}
                    type="button"
                  >
                    <Icon name="eye" size={13} /> Preview example
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {selectedType?.hasQuestions ? (
            <div className="field">
              <label className="label">Answer section</label>
              <div className="rg-segments rg-segments-3" role="group" aria-label="Answer section">
                {ANSWER_MODES.map((answerMode) => (
                  <button
                    className={draft.answerMode === answerMode ? "active" : ""}
                    key={answerMode}
                    onClick={() => set({ answerMode })}
                    type="button"
                  >
                    {answerModeLabel(answerMode, draft.subject)}
                  </button>
                ))}
              </div>
              <div className="hint">
                {draft.subject === "english"
                  ? {
                      none: "The resource will not include a tutor answer section.",
                      answers: "Includes marking criteria and brief expected-response guidance.",
                      worked: "Includes full model responses and marking criteria.",
                    }[draft.answerMode]
                  : {
                      none: "The resource will contain questions only.",
                      answers: "Includes final answers without working steps.",
                      worked: "Includes final answers with step-by-step working.",
                    }[draft.answerMode]}
              </div>
            </div>
          ) : null}

          <div className="field">
            <label className="label">
              Reference documents <span className="opt">{selectedType?.uploadHint?.toLowerCase() || "optional"}</span>
            </label>
            <UploadField
              error={draft.uploadError}
              files={draft.uploadedFiles}
              maxFiles={MAX_REFERENCE_FILES}
              onClearAll={() => {
                activeUploadRef.current?.cancel?.();
                set({ uploadedFiles: [], uploadProgress: null, uploadError: "" });
              }}
              onFiles={handleUpload}
              onRemove={(index) => setDraft((current) => ({
                ...current,
                uploadedFiles: current.uploadedFiles.filter((_, fileIndex) => fileIndex !== index),
                uploadError: "",
              }))}
              progress={draft.uploadProgress}
            />
          </div>

          <div className="field">
            <label className="label">Custom prompt <span className="opt">optional</span></label>
            <textarea
              className="textarea"
              onChange={(event) => set({ customPrompt: event.target.value })}
              placeholder={PROMPT_PLACEHOLDERS[draft.resourceType] || "Give extra context: topic focus, difficulty, length, format."}
              rows={3}
              value={draft.customPrompt}
            />
          </div>

          {draft.resourceType && draft.year ? (
            <div className="field rg-suggestions">
              <label className="label">
                <Icon name="sparkles" size={14} /> Existing resources
              </label>
              {suggestStatus === "idle" ? (
                <div className="hint">
                  Describe the topic in the prompt above and we&apos;ll check for resources you can reuse.
                </div>
              ) : suggestStatus === "searching" ? (
                <div className="hint rg-suggestion-status">
                  <Icon name="search" size={14} /> Checking for similar resources…
                </div>
              ) : hasAnySuggestion ? (
                <>
                  {sameTypeSuggestions.length ? (
                    <>
                      <div className="hint">Download one of these instead of generating a new resource.</div>
                      <ul className="rg-suggestion-list">
                        {sameTypeSuggestions.map((job) => renderSuggestionRow(job))}
                      </ul>
                    </>
                  ) : (
                    <div className="hint rg-suggestion-status">
                      <Icon name="check-circle" size={14} /> No {resourceLabel(draft.resourceType)} for this topic yet.
                    </div>
                  )}

                  {otherTypeSuggestions.length ? (
                    <div className="rg-suggestion-other">
                      <div className="rg-suggestion-other-head">Same topic, other formats</div>
                      <ul className="rg-suggestion-list">
                        {visibleOther.map((job) => renderSuggestionRow(job, { leadWithType: true }))}
                      </ul>
                      {otherTypeSuggestions.length > 2 ? (
                        <button
                          className="rg-suggestion-toggle"
                          onClick={() => setShowAllOther((prev) => !prev)}
                          type="button"
                        >
                          {showAllOther
                            ? "Show fewer"
                            : `View all ${otherTypeSuggestions.length}`}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="hint rg-suggestion-status">
                  <Icon name="check-circle" size={14} /> No similar resources found — generate a new one below.
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="rg-builder-foot">
          <div className="row gap-2 wrap">
            <Button disabled={!canStage || submitting} icon="plus" onClick={addToStaging} variant="secondary">
              Add another
            </Button>
            {staged.length ? <span className="text-sm muted">{staged.length} staged</span> : null}
          </div>
          <Button disabled={!stagedCountForSubmit || submitting} icon="send" loading={submitting} onClick={submit} variant="primary">
            {stagedCountForSubmit > 1 ? `Submit all (${stagedCountForSubmit})` : "Submit"}
          </Button>
        </div>
      </div>

      {staged.length ? (
        <div className="card mt-4">
          <div className="card-head">
            <div>
              <h3>Staged jobs</h3>
              <div className="card-sub">Jobs submit sequentially and process one at a time per tutor.</div>
            </div>
          </div>
          <div className="card-body flush">
            <ul className="rg-staged-list">
              {staged.map((row, index) => (
                <li className="rg-staged" key={row.draftId}>
                  <div className="rg-staged-num">{index + 1}</div>
                  <div className="rg-staged-main">
                    <div className="weight-600">{resourceLabel(row.resourceType)} for {row.studentName}</div>
                    <div className="text-sm muted">
                      Year {row.year} {capitalise(row.subject)}
                      {RESOURCE_BY_KEY[row.resourceType]?.hasQuestions
                        ? ` · ${answerModeLabel(row.answerMode, row.subject).toLowerCase()}`
                        : null}
                      {row.uploadedFiles.length
                        ? ` - ${row.uploadedFiles.map((file) => file.name).join(", ")}`
                        : ""}
                      {row.customPrompt ? ` - "${truncate(row.customPrompt)}"` : ""}
                    </div>
                    {rowErrors[row.draftId] ? <div className="error mt-2">{rowErrors[row.draftId]}</div> : null}
                  </div>
                  <button aria-label="Remove staged job" className="icon-btn" onClick={() => removeStaged(row.draftId)} type="button">
                    <Icon name="x" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <ResourcePreviewModal
        open={Boolean(previewType)}
        onClose={() => setPreviewType(null)}
        title={`${resourceLabel(previewType)} — example`}
        subtitle={
          previewExemplar
            ? previewExemplar.exactSubject
              ? "A sample generation showing the format and layout."
              : `Format shown from a ${previewExemplar.subject} sample — ${capitalise(draft.subject)} generations follow the same layout.`
            : ""
        }
        src={previewExemplar?.url}
      />
    </section>
  );
}

function StudentPicker({ loading, onChange, onClear, students, value }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function onPointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const selected = students.find((student) => student.id === value);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = needle
      ? students.filter((student) => {
          const haystack = `${studentName(student)} ${student.grade || ""} ${student.studentYear || ""} ${student.year || ""}`.toLowerCase();
          return haystack.includes(needle);
        })
      : students;
    return rows.slice(0, 12);
  }, [query, students]);

  return (
    <div className="rg-combo" ref={ref}>
      <div className="rg-combo-control">
        <button
          className={`rg-combo-trigger ${selected ? "filled" : ""}`}
          disabled={loading}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {loading ? (
            <span className="row gap-2"><span className="spinner" /> Loading students...</span>
          ) : selected ? (
            <span className="rg-combo-selected">
              <span className="avatar sm">{studentName(selected).slice(0, 2).toUpperCase()}</span>
              <span className="col">
                <span className="weight-600">{studentName(selected)}</span>
                <span className="text-xs muted">Year {parseYear(selected) || "-"}</span>
              </span>
            </span>
          ) : (
            <span className="muted">Search by name or year...</span>
          )}
          <Icon name="chevron-down" size={14} />
        </button>
        {selected ? (
          <button
            aria-label="Clear selected student"
            className="rg-combo-clear"
            onClick={() => {
              onClear?.();
              setOpen(false);
              setQuery("");
            }}
            type="button"
          >
            <Icon name="x" size={14} />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="rg-combo-menu">
          <div className="rg-combo-search">
            <Icon name="search" size={14} />
            <input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Search students..." type="text" value={query} />
          </div>
          <div className="rg-combo-list">
            {filtered.length ? filtered.map((student) => (
              <button
                className={`rg-combo-item ${student.id === value ? "active" : ""}`}
                key={student.id}
                onClick={() => {
                  onChange(student);
                  setOpen(false);
                  setQuery("");
                }}
                type="button"
              >
                <span className="avatar sm">{studentName(student).slice(0, 2).toUpperCase()}</span>
                <span className="col">
                  <span className="weight-600">{studentName(student)}</span>
                  <span className="text-xs muted">Year {parseYear(student) || "-"}</span>
                </span>
                {student.id === value ? <Icon name="check" size={14} /> : null}
              </button>
            )) : (
              <div className="rg-combo-empty">No students match "{query}".</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UploadField({
  error,
  files,
  maxFiles,
  onClearAll,
  onFiles,
  onRemove,
  progress,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const uploading = progress != null;
  const hasFiles = files.length > 0;
  const canAddFiles = files.length < maxFiles && !uploading;

  return (
    <div
      className={`rg-upload ${hasFiles ? "filled" : "empty"} ${dragging ? "dragging" : ""}`}
      onClick={() => {
        if (!hasFiles && canAddFiles) inputRef.current?.click();
      }}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (canAddFiles) onFiles(event.dataTransfer.files);
      }}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          canAddFiles &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      role={hasFiles ? undefined : "button"}
      tabIndex={hasFiles ? undefined : 0}
    >
      <input
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
        ref={inputRef}
        style={{ display: "none" }}
        type="file"
      />

      <div className="rg-upload-icon">
        <Icon name={hasFiles ? "file-text" : "upload"} size={18} />
      </div>
      <div className="rg-upload-main">
        <div className="weight-600 text-sm">
          {hasFiles
            ? `${files.length} reference document${files.length === 1 ? "" : "s"}`
            : "Drop past papers or assessment notifications"}
        </div>
        {uploading ? (
          <div className="rg-progress"><div style={{ width: `${Math.round((progress || 0) * 100)}%` }} /></div>
        ) : (
          <div className={`text-xs ${error ? "error" : "muted"}`}>
            {error || `PDF or DOCX · up to ${maxFiles} files`}
          </div>
        )}
        {hasFiles ? (
          <ul className="rg-upload-files">
            {files.map((file, index) => (
              <li key={file.path}>
                <span title={file.name}>{file.name}</span>
                {!uploading ? (
                  <button
                    aria-label={`Remove ${file.name}`}
                    className="icon-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(index);
                    }}
                    type="button"
                  >
                    <Icon name="x" size={14} />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="rg-upload-actions">
        {hasFiles && !uploading ? (
          <button
            className="rg-upload-clear"
            onClick={(event) => {
              event.stopPropagation();
              onClearAll();
            }}
            type="button"
          >
            Clear all
          </button>
        ) : null}
        <Button
          disabled={!canAddFiles}
          onClick={(event) => {
            event.stopPropagation();
            inputRef.current?.click();
          }}
          size="sm"
          variant="secondary"
        >
          {hasFiles ? "Add files" : "Browse"}
        </Button>
      </div>
    </div>
  );
}
