"use strict";

const { HttpsError } = require("firebase-functions/v2/https");

async function loadInvoiceParties(db, { parentId, studentIds }) {
  const parentRef = db.collection("users").doc(parentId);
  const parentSnap = await parentRef.get();
  if (!parentSnap.exists) {
    throw new HttpsError("failed-precondition", `Parent not found: ${parentId}`);
  }
  const parent = parentSnap.data() || {};
  if (parent.role && parent.role !== "parent") {
    throw new HttpsError("failed-precondition", `${parentId} is not a parent user`);
  }

  const studentRefs = studentIds.map((id) => db.collection("students").doc(id));
  const studentSnaps = await Promise.all(studentRefs.map((ref) => ref.get()));
  const missing = studentSnaps
    .map((snap, i) => (snap.exists ? null : studentIds[i]))
    .filter(Boolean);
  if (missing.length) {
    throw new HttpsError(
      "failed-precondition",
      `Student not found: ${missing.join(", ")}`
    );
  }

  const parentStudents = Array.isArray(parent.students) ? parent.students : [];
  studentSnaps.forEach((snap, i) => {
    const studentId = studentIds[i];
    const student = snap.data() || {};
    const studentParents = Array.isArray(student.parents) ? student.parents : [];
    const linked =
      parentStudents.includes(studentId) ||
      studentParents.includes(parentId) ||
      student.primaryParentId === parentId;
    if (!linked) {
      throw new HttpsError(
        "failed-precondition",
        `Student ${studentId} is not linked to parent ${parentId}`
      );
    }
  });

  return {
    parent: { id: parentId, data: parent, ref: parentRef },
    students: studentSnaps.map((snap, i) => ({
      id: studentIds[i],
      data: snap.data() || {},
      ref: studentRefs[i],
    })),
  };
}

module.exports = { loadInvoiceParties };
