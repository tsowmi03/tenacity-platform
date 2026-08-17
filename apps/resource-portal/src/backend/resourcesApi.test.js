import { beforeEach, describe, expect, it, vi } from "vitest";

const firestore = vi.hoisted(() => ({
  collection: vi.fn((db, path) => ({ db, path })),
  getDocs: vi.fn(),
  limit: vi.fn((count) => ({ type: "limit", count })),
  onSnapshot: vi.fn(() => vi.fn()),
  orderBy: vi.fn((field, direction) => ({ type: "orderBy", field, direction })),
  query: vi.fn((source, ...constraints) => ({ source, constraints })),
  where: vi.fn((field, op, value) => ({ type: "where", field, op, value })),
}));

const callable = vi.hoisted(() => ({
  callFunction: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  collection: firestore.collection,
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: firestore.getDocs,
  limit: firestore.limit,
  onSnapshot: firestore.onSnapshot,
  orderBy: firestore.orderBy,
  query: firestore.query,
  startAfter: vi.fn(),
  where: firestore.where,
}));

vi.mock("firebase/storage", () => ({
  getBytes: vi.fn(),
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
}));

vi.mock("../firebaseConfig", () => ({
  db: { app: "test" },
  firebaseConfig: { projectId: "test-project" },
  storage: {},
}));

vi.mock("./callable", () => ({
  BackendError: class BackendError extends Error {
    constructor({ message }) {
      super(message);
    }
  },
  callFunction: callable.callFunction,
}));

const {
  buildResubmitPayload,
  deleteResourceJob,
  normalizeResourceJob,
  resourceJobUploadedFiles,
  resubmitResourceJob,
  subscribeResourceJobHistory,
  subscribeResourceJobs,
} = await import("./resourcesApi");

describe("resource job actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls the delete resource job callable", async () => {
    callable.callFunction.mockResolvedValue({ deleted: true, jobId: "job-1" });

    await expect(deleteResourceJob("job-1")).resolves.toEqual({ deleted: true, jobId: "job-1" });
    expect(callable.callFunction).toHaveBeenCalledWith("deleteResourceJob", { jobId: "job-1" });
  });

  it("rebuilds a resubmit payload from a job, reusing inputs and dropping derived fields", () => {
    const payload = buildResubmitPayload({
      id: "job-1",
      jobId: "job-1",
      studentId: "student-9",
      studentName: "Emily O'Mara",
      subject: "english",
      year: 10,
      resourceType: "annotation-task",
      answerMode: "answers",
      showMarks: true,
      customPrompt: "Growing up practice exam",
      createdBy: "tutor-1",
      createdByName: "Tom",
      model: "claude-sonnet-4-6",
      status: "complete",
      outputPath: "resources/output/job-1.docx",
      uploadedFiles: [{ path: "resources/uploads/tutor-1/1_brief.docx", name: "brief.docx" }],
    });

    expect(payload).toEqual({
      studentId: "student-9",
      subject: "english",
      year: 10,
      resourceType: "annotation-task",
      answerMode: "answers",
      showMarks: true,
      customPrompt: "Growing up practice exam",
      uploadedFiles: [{ path: "resources/uploads/tutor-1/1_brief.docx", name: "brief.docx" }],
    });
    // Derived/output fields must not be replayed into a fresh submission.
    expect(payload).not.toHaveProperty("createdBy");
    expect(payload).not.toHaveProperty("model");
    expect(payload).not.toHaveProperty("outputPath");
  });

  it("falls back to legacy single-file fields and omits empty optionals in a resubmit payload", () => {
    const payload = buildResubmitPayload({
      studentId: "student-2",
      subject: "maths",
      year: 8,
      resourceType: "worksheet",
      uploadedFilePath: "resources/uploads/tutor-1/2_notes.pdf",
      uploadedFileName: "notes.pdf",
    });

    expect(payload).toEqual({
      studentId: "student-2",
      subject: "maths",
      year: 8,
      resourceType: "worksheet",
      customPrompt: "",
      uploadedFiles: [{ path: "resources/uploads/tutor-1/2_notes.pdf", name: "notes.pdf" }],
    });
    // No answerMode on the source job → omitted so the backend applies its default.
    expect(payload).not.toHaveProperty("answerMode");
    expect(payload).not.toHaveProperty("showMarks");
  });

  it("lists a job's reference files for editing, covering legacy and empty jobs", () => {
    expect(
      resourceJobUploadedFiles({
        uploadedFiles: [
          { path: "resources/uploads/tutor-1/1_brief.docx", name: "brief.docx" },
          { name: "no-path.pdf" },
        ],
      })
    ).toEqual([{ path: "resources/uploads/tutor-1/1_brief.docx", name: "brief.docx" }]);

    expect(
      resourceJobUploadedFiles({ uploadedFilePath: "resources/uploads/tutor-1/2_notes.pdf" })
    ).toEqual([{ path: "resources/uploads/tutor-1/2_notes.pdf", name: "reference-file" }]);

    expect(resourceJobUploadedFiles({})).toEqual([]);
    expect(resourceJobUploadedFiles()).toEqual([]);
  });

  it("submits a new resource job when resubmitting", async () => {
    callable.callFunction.mockResolvedValue({ jobId: "job-new" });

    await expect(
      resubmitResourceJob({
        studentId: "student-2",
        subject: "maths",
        year: 8,
        resourceType: "worksheet",
      })
    ).resolves.toEqual({ jobId: "job-new" });
    expect(callable.callFunction).toHaveBeenCalledWith("submitResourceJob", {
      studentId: "student-2",
      subject: "maths",
      year: 8,
      resourceType: "worksheet",
      customPrompt: "",
    });
  });

  it("normalizes structured warnings and ignores malformed warning entries", () => {
    expect(
      normalizeResourceJob("job-1", {
        warnings: [
          { code: "OPTIONAL_DIAGRAM_OMITTED", message: "Diagram omitted" },
          null,
          "invalid",
        ],
      }).warnings
    ).toEqual([
      { code: "OPTIONAL_DIAGRAM_OMITTED", message: "Diagram omitted" },
    ]);
  });
});

describe("resource history subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries selected-student history by student for admins", () => {
    subscribeResourceJobHistory(
      { user: { uid: "admin-1" }, isAdmin: true, studentId: "student-1" },
      vi.fn(),
      vi.fn()
    );

    expect(firestore.where).toHaveBeenCalledTimes(1);
    expect(firestore.where).toHaveBeenCalledWith("studentId", "==", "student-1");
    expect(firestore.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(firestore.limit).toHaveBeenCalledWith(50);
  });

  it("queries selected-student history across staff resource jobs", () => {
    subscribeResourceJobHistory(
      { user: { uid: "tutor-1" }, isAdmin: false, studentId: "student-1" },
      vi.fn(),
      vi.fn()
    );

    expect(firestore.where).toHaveBeenCalledWith("studentId", "==", "student-1");
    expect(firestore.where).toHaveBeenCalledTimes(1);
    expect(firestore.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(firestore.limit).toHaveBeenCalledWith(50);
  });

  it("queries the shared live queue for tutors", () => {
    subscribeResourceJobs(
      { user: { uid: "tutor-1" }, isAdmin: false },
      vi.fn(),
      vi.fn()
    );

    expect(firestore.where).not.toHaveBeenCalled();
    expect(firestore.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(firestore.limit).toHaveBeenCalledWith(50);
  });
});
