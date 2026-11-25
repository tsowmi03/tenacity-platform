import React, { useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { subscribeResourceJobHistory, subscribeResourceJobs, submitResourceJob } from "../backend/resourcesApi";
import { normalizeBackendError } from "../backend/callable";
import { listStudents } from "../backend/studentsApi";
import PageHeader from "../components/PageHeader";
import ResourceJobBuilder from "../components/resources/ResourceJobBuilder";
import ResourceQueuePanel from "../components/resources/ResourceQueuePanel";
import { useToast } from "../components/ToastProvider";

function jobPayload(row) {
  const uploadedFiles = Array.isArray(row.uploadedFiles) ? row.uploadedFiles : [];
  const firstUploadedFile = uploadedFiles[0] || null;
  return {
    studentId: row.studentId,
    subject: row.subject,
    year: Number(row.year),
    resourceType: row.resourceType,
    modelChoice: row.modelChoice,
    answerMode: row.answerMode || "none",
    showMarks: row.showMarks === true,
    customPrompt: row.customPrompt || "",
    uploadedFiles,
    uploadedFilePath: firstUploadedFile?.path || null,
    uploadedFileName: firstUploadedFile?.name || null,
    sourceJobId: row.sourceJobId || null,
  };
}

export default function ResourcesPage() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [students, setStudents] = useState([]);
  // RES-102. The builder renders the resource assistant into this element.
  const [assistantHost, setAssistantHost] = useState(null);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState("");
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState("");
  const [historyJobs, setHistoryJobs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  // A past job the tutor asked to edit, handed to the builder once and then
  // cleared so re-picking the same job loads it again.
  const [editSource, setEditSource] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStudents() {
      setStudentsLoading(true);
      setStudentsError("");
      try {
        const rows = await listStudents();
        if (!cancelled) setStudents(rows);
      } catch (error) {
        if (!cancelled) setStudentsError(normalizeBackendError(error, "Failed to load students.").message);
      } finally {
        if (!cancelled) setStudentsLoading(false);
      }
    }

    loadStudents();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setJobsLoading(true);
    setJobsError("");
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeResourceJobs(
        { user, isAdmin },
        (rows) => {
          setJobs(rows);
          setJobsLoading(false);
        },
        (error) => {
          setJobsError(normalizeBackendError(error, "Failed to load resource jobs.").message);
          setJobsLoading(false);
        }
      );
    } catch (error) {
      setJobsError(normalizeBackendError(error, "Failed to load resource jobs.").message);
      setJobsLoading(false);
    }
    return unsubscribe;
  }, [user, isAdmin]);

  useEffect(() => {
    setHistoryLoading(true);
    setHistoryError("");
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeResourceJobHistory(
        { user, isAdmin, studentId: selectedStudent?.id || "" },
        (rows) => {
          setHistoryJobs(rows);
          setHistoryLoading(false);
        },
        (error) => {
          setHistoryError(normalizeBackendError(error, "Failed to load resource history.").message);
          setHistoryLoading(false);
        }
      );
    } catch (error) {
      setHistoryError(normalizeBackendError(error, "Failed to load resource history.").message);
      setHistoryLoading(false);
    }
    return unsubscribe;
  }, [user, isAdmin, selectedStudent?.id]);

  async function handleSubmitJobs(rows) {
    const errors = {};
    let submitted = 0;

    for (const row of rows) {
      try {
        await submitResourceJob(jobPayload(row));
        submitted += 1;
      } catch (error) {
        errors[row.draftId] = error?.userMessage || error?.message || "Could not submit this job.";
      }
    }

    if (submitted) {
      toast.success(
        submitted === 1 ? "1 resource queued" : `${submitted} resources queued`,
        "It will appear under In progress in a moment."
      );
    }

    if (Object.keys(errors).length) {
      toast.error("Some resources were not submitted", "Check the ones marked below and try again.");
      return { ok: false, errors };
    }

    return { ok: true, errors: {} };
  }

  return (
    <>
      <PageHeader
        crumbs={[]}
        title="Teaching resources"
        subtitle="Make a worksheet, paper or booklet for a student, ready to print."
      />

      {studentsError ? (
        <div className="banner banner-danger mb-5">
          <div>
            <div className="banner-title">Could not load students</div>
            <div>{studentsError}</div>
          </div>
        </div>
      ) : null}

      <div className="rg-layout">
        <ResourceJobBuilder
          assistantHost={assistantHost}
          onPrefillApplied={() => setEditSource(null)}
          onSubmitJobs={handleSubmitJobs}
          onSelectedStudentChange={setSelectedStudent}
          prefill={editSource}
          students={students}
          studentsLoading={studentsLoading}
        />
        {/* RES-85: what is being made comes first, then the assistant (RES-102), then history. The order is set in CSS. */}
        <div className="rg-side">
          <div className="rg-assistant-host" ref={setAssistantHost} />
          <ResourceQueuePanel
            error={jobsError}
            historyError={historyError}
            historyJobs={historyJobs}
            historyLoading={historyLoading}
            jobs={jobs}
            loading={jobsLoading}
            onEditJob={setEditSource}
            selectedStudentName={selectedStudent?.name || ""}
          />
        </div>
      </div>
    </>
  );
}
