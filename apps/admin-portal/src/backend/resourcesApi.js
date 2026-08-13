import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  getBytes,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { db, firebaseConfig, storage } from "../firebaseConfig";
import { callFunction, BackendError } from "./callable";
import { assertFirestoreConfigured, listDocuments, timestampToIso } from "./firestoreReads";

export function normalizeResourceJob(id, data = {}) {
  const warnings = Array.isArray(data.warnings)
    ? data.warnings.filter((warning) => warning && typeof warning === "object")
    : [];
  return {
    id,
    jobId: data.jobId || id,
    ...data,
    warnings,
    createdAtIso: timestampToIso(data.createdAt),
    startedAtIso: timestampToIso(data.startedAt),
    completedAtIso: timestampToIso(data.completedAt),
  };
}

export function subscribeResourceJobs({ user }, onNext, onError) {
  assertFirestoreConfigured();
  if (!user?.uid) {
    onNext([]);
    return () => {};
  }

  const constraints = [orderBy("createdAt", "desc"), limit(50)];

  return onSnapshot(
    query(collection(db, "resourceJobs"), ...constraints),
    (snap) => onNext(snap.docs.map((docSnap) => normalizeResourceJob(docSnap.id, docSnap.data() || {}))),
    onError
  );
}

export function subscribeResourceJobHistory({ user, studentId }, onNext, onError) {
  assertFirestoreConfigured();
  if (!user?.uid) {
    onNext([]);
    return () => {};
  }

  const trimmedStudentId = String(studentId || "").trim();
  const constraints = [];

  if (trimmedStudentId) {
    constraints.push(where("studentId", "==", trimmedStudentId));
  }
  constraints.push(orderBy("createdAt", "desc"), limit(50));

  return onSnapshot(
    query(collection(db, "resourceJobs"), ...constraints),
    (snap) => onNext(snap.docs.map((docSnap) => normalizeResourceJob(docSnap.id, docSnap.data() || {}))),
    onError
  );
}

export function listStudentResourceJobs(studentId) {
  return listDocuments("resourceJobs", {
    constraints: [
      where("studentId", "==", studentId),
      orderBy("createdAt", "desc"),
      limit(30),
    ],
    normalize: normalizeResourceJob,
  });
}

/**
 * Find previously-generated, completed resources on the same subject that share
 * a topic with the resource a tutor is about to create, so they can reuse one
 * instead of regenerating. Matches on subject + status + any overlapping topic
 * (Firestore array-contains-any, capped at 10 terms), then splits client-side:
 *  - `sameType`: same resourceType — a direct drop-in replacement.
 *  - `otherType`: the same topic in a different format (essay scaffold vs
 *    annotation task, etc.) — useful to know about, not a straight swap.
 * Both buckets are ranked by topic overlap, then year proximity, then recency.
 */
export async function findSimilarResources({
  subject,
  resourceType,
  topics,
  year,
  max = 3,
  maxOther = 6,
} = {}) {
  assertFirestoreConfigured();
  const terms = Array.isArray(topics)
    ? [...new Set(topics.filter(Boolean))].slice(0, 10)
    : [];
  if (!subject || !resourceType || !terms.length) {
    return { sameType: [], otherType: [] };
  }

  const snap = await getDocs(
    query(
      collection(db, "resourceJobs"),
      where("subject", "==", subject),
      where("status", "==", "complete"),
      where("extractedTopics", "array-contains-any", terms),
      orderBy("createdAt", "desc"),
      limit(40)
    )
  );

  const wanted = new Set(terms);
  const targetYear = Number(year) || null;
  const rows = snap.docs
    .map((docSnap) => normalizeResourceJob(docSnap.id, docSnap.data() || {}))
    .filter((job) => job.outputPath)
    .map((job) => {
      const jobTopics = Array.isArray(job.extractedTopics) ? job.extractedTopics : [];
      const overlap = jobTopics.reduce((n, t) => (wanted.has(t) ? n + 1 : n), 0);
      const yearGap = targetYear && job.year ? Math.abs(job.year - targetYear) : 0;
      return { job, overlap, yearGap };
    })
    .filter((row) => row.yearGap <= 2)
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      if (a.yearGap !== b.yearGap) return a.yearGap - b.yearGap;
      return String(b.job.createdAtIso || "").localeCompare(String(a.job.createdAtIso || ""));
    });

  const sameType = [];
  const otherType = [];
  for (const { job } of rows) {
    if (job.resourceType === resourceType) sameType.push(job);
    else otherType.push(job);
  }

  return {
    sameType: sameType.slice(0, max),
    otherType: otherType.slice(0, maxOther),
  };
}

export function submitResourceJob(payload) {
  return callFunction("submitResourceJob", payload);
}

// Rebuild a fresh submission payload from an existing job document, replaying
// the exact inputs a resource was generated from — student, subject/year/type,
// answer mode, custom prompt, and the same attached reference files (which
// still live in Storage). The backend re-derives everything else (studentName,
// createdBy, model, etc.), so a resubmit registers as a brand-new generation
// rather than mutating the original job.
export function buildResubmitPayload(job = {}) {
  const uploadedFiles = Array.isArray(job.uploadedFiles) && job.uploadedFiles.length
    ? job.uploadedFiles
        .filter((file) => file && file.path)
        .map((file) => ({ path: file.path, name: file.name || "reference-file" }))
    : job.uploadedFilePath
      ? [{ path: job.uploadedFilePath, name: job.uploadedFileName || "reference-file" }]
      : [];

  const payload = {
    studentId: job.studentId,
    subject: job.subject,
    year: job.year,
    resourceType: job.resourceType,
    customPrompt: job.customPrompt || "",
  };
  if (job.answerMode) payload.answerMode = job.answerMode;
  if (typeof job.showMarks === "boolean") payload.showMarks = job.showMarks;
  if (uploadedFiles.length) payload.uploadedFiles = uploadedFiles;
  return payload;
}

// Submit a completed (or any historical) job again as a new generation, reusing
// its original inputs verbatim.
export function resubmitResourceJob(job) {
  return submitResourceJob(buildResubmitPayload(job));
}

export function retryResourceJob(jobId) {
  return callFunction("retryResourceJob", { jobId });
}

export function cancelResourceJob(jobId) {
  return callFunction("cancelResourceJob", { jobId });
}

export function deleteResourceJob(jobId) {
  return callFunction("deleteResourceJob", { jobId });
}

export function assertResourceStorageConfigured() {
  if (!firebaseConfig?.projectId) {
    throw new BackendError({
      code: "failed-precondition",
      message: "Firebase is not configured. Check your VITE_FIREBASE_* env vars.",
    });
  }
  if (!storage) {
    throw new BackendError({
      code: "failed-precondition",
      message: "Firebase Storage is not configured.",
    });
  }
}

export function uploadResourceReference({ file, uid, onProgress }) {
  assertResourceStorageConfigured();
  if (!file) {
    throw new BackendError({ code: "invalid-argument", message: "File is required." });
  }
  if (!uid) {
    throw new BackendError({ code: "unauthenticated", message: "Sign in before uploading a file." });
  }

  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
  const path = `resources/uploads/${uid}/${Date.now()}_${safeName}`;
  const task = uploadBytesResumable(ref(storage, path), file, {
    contentType: file.type || undefined,
    customMetadata: { originalName: file.name },
  });

  const promise = new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        const total = snapshot.totalBytes || file.size || 1;
        onProgress?.(snapshot.bytesTransferred / total);
      },
      reject,
      () => resolve({ uploadedFilePath: path, uploadedFileName: file.name })
    );
  });

  return { task, promise };
}

export async function downloadResourceJob(job) {
  if (!job?.outputPath) {
    throw new BackendError({ code: "failed-precondition", message: "This job does not have an output file yet." });
  }

  assertResourceStorageConfigured();
  const data = await getBytes(ref(storage, job.outputPath), 25 * 1024 * 1024);
  const blob = new Blob([data], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  triggerBrowserDownload(blob, job.outputFileName || "tenacity-resource.docx");
}

// Fetch the PDF preview stored alongside a generated resource, as a Blob the
// caller can show inline (via URL.createObjectURL) before deciding to
// download the DOCX. Only jobs generated with the PDF converter enabled have
// a previewPath.
export async function fetchResourceJobPreview(job) {
  if (!job?.previewPath) {
    throw new BackendError({ code: "failed-precondition", message: "This job does not have a preview." });
  }

  assertResourceStorageConfigured();
  const data = await getBytes(ref(storage, job.previewPath), 25 * 1024 * 1024);
  return new Blob([data], { type: "application/pdf" });
}

// Download an uploaded reference file (the source material a generation was
// built from) by its storage path. Used by the job details view.
export async function downloadResourceUpload(file) {
  if (!file?.path) {
    throw new BackendError({ code: "failed-precondition", message: "This reference file is no longer available." });
  }

  assertResourceStorageConfigured();
  const data = await getBytes(ref(storage, file.path), 25 * 1024 * 1024);
  triggerBrowserDownload(new Blob([data]), file.name || "reference-file");
}

function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
