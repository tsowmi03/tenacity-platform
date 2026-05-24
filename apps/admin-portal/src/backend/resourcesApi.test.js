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
  getDownloadURL: vi.fn(),
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
  callFunction: vi.fn(),
}));

const { subscribeResourceJobHistory } = await import("./resourcesApi");

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

  it("queries selected-student history by tutor and student for tutors", () => {
    subscribeResourceJobHistory(
      { user: { uid: "tutor-1" }, isAdmin: false, studentId: "student-1" },
      vi.fn(),
      vi.fn()
    );

    expect(firestore.where).toHaveBeenCalledWith("createdBy", "==", "tutor-1");
    expect(firestore.where).toHaveBeenCalledWith("studentId", "==", "student-1");
    expect(firestore.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(firestore.limit).toHaveBeenCalledWith(50);
  });
});
