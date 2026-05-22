import React, { useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { subscribeResourceJobs, submitResourceJob } from "../backend/resourcesApi";
import { listStudents } from "../backend/studentsApi";
import PageHeader from "../components/PageHeader";
import ResourceJobBuilder from "../components/resources/ResourceJobBuilder";
import ResourceQueuePanel from "../components/resources/ResourceQueuePanel";
import { useToast } from "../components/ToastProvider";

function jobPayload(row) {
  return {
    studentId: row.studentId,
    subject: row.subject,
    year: Number(row.year),
    resourceType: row.resourceType,
    customPrompt: row.customPrompt || "",
    uploadedFilePath: row.uploadedFilePath || null,
    uploadedFileName: row.uploadedFileName || null,
  };
}

export default function ResourcesPage() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState("");
  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadStudents() {
      setStudentsLoading(true);
      setStudentsError("");
      try {
        const rows = await listStudents();
        if (!cancelled) setStudents(rows);
      } catch (error) {
        if (!cancelled) setStudentsError(error?.message || "Failed to load students.");
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
          setJobsError(error?.message || "Failed to load resource jobs.");
          setJobsLoading(false);
        }
      );
    } catch (error) {
      setJobsError(error?.message || "Failed to load resource jobs.");
      setJobsLoading(false);
    }
    return unsubscribe;
  }, [user, isAdmin]);

  async function handleSubmitJobs(rows) {
    const errors = {};
    let submitted = 0;

    for (const row of rows) {
      try {
        await submitResourceJob(jobPayload(row));
        submitted += 1;
      } catch (error) {
        errors[row.draftId] = error?.message || "Could not submit this job.";
      }
    }

    if (submitted) {
      toast.success(
        submitted === 1 ? "1 job queued" : `${submitted} jobs queued`,
        "The queue will update when Firestore receives the new job."
      );
    }

    if (Object.keys(errors).length) {
      toast.error("Some jobs were not submitted", "Review the staged job errors and retry.");
      return { ok: false, errors };
    }

    return { ok: true, errors: {} };
  }

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Overview", href: "/" }, { label: "Resources" }]}
        title="Resources"
        subtitle="Generate branded teaching resources as ready-to-print DOCX files."
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
          onSubmitJobs={handleSubmitJobs}
          students={students}
          studentsLoading={studentsLoading}
        />
        <ResourceQueuePanel
          error={jobsError}
          jobs={jobs}
          loading={jobsLoading}
        />
      </div>
    </>
  );
}
