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
 * Find previously-generated, completed resources that match the resource a tutor
 * is about to create, so they can reuse one instead of regenerating. Matches on
 * subject + resourceType + status, and any overlapping topic (Firestore
 * array-contains-any, capped at 10 terms). Results are ranked client-side by
 * topic overlap, then year proximity, then recency. Returns at most `max` jobs.
 */
export async function findSimilarResources({
  subject,
  resourceType,
  topics,
  year,
  max = 3,
} = {}) {
  assertFirestoreConfigured();
  const terms = Array.isArray(topics)
    ? [...new Set(topics.filter(Boolean))].slice(0, 10)
    : [];
  if (!subject || !resourceType || !terms.length) return [];

  const snap = await getDocs(
    query(
      collection(db, "resourceJobs"),
      where("subject", "==", subject),
      where("resourceType", "==", resourceType),
      where("status", "==", "complete"),
      where("extractedTopics", "array-contains-any", terms),
      orderBy("createdAt", "desc"),
      limit(25)
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

  return rows.slice(0, max).map((row) => row.job);
}

export function submitResourceJob(payload) {
  return callFunction("submitResourceJob", payload);
}

export function retryResourceJob(jobId) {
  return callFunction("retryResourceJob", { jobId });
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
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = job.outputFileName || "tenacity-resource.docx";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
