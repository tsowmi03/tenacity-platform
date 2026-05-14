"use strict";

const { onCall } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const { requireAdminCallable } = require("../auth/requireAdmin");
const { toHttpsError } = require("../shared/errors");
const { toDate } = require("./reportUtils");

async function loadStudentEnrolmentData(db) {
  const [studentsSnap, usersSnap, classesSnap, enrolmentsSnap] = await Promise.all([
    db.collection("students").get(),
    db.collection("users").where("role", "==", "parent").get(),
    db.collection("classes").get(),
    db.collection("enrolments").where("status", "==", "accepted").get(),
  ]);
  return {
    students: studentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    parents: usersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    classes: classesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    enrolments: enrolmentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  };
}

function buildStudentEnrolmentReport({ students, parents, classes, enrolments, generatedAt = new Date() }) {
  const parentMap = new Map();
  parents.forEach((p) => parentMap.set(p.id, p));

  // Map: studentId -> Set of classIds they're enrolled in
  const studentClassMap = new Map();
  classes.forEach((cls) => {
    const enrolled = Array.isArray(cls.enrolledStudents) ? cls.enrolledStudents : [];
    enrolled.forEach((studentId) => {
      if (!studentClassMap.has(studentId)) studentClassMap.set(studentId, new Set());
      studentClassMap.get(studentId).add(cls.id);
    });
  });

  const gradeMap = new Map();
  const subjectMap = new Map();
  const noClassStudents = [];
  const linkageIssues = [];

  students.forEach((student) => {
    const grade = student.grade || "unknown";
    gradeMap.set(grade, (gradeMap.get(grade) || 0) + 1);

    const subjects = Array.isArray(student.subjects) ? student.subjects : [];
    subjects.forEach((subject) => {
      subjectMap.set(subject, (subjectMap.get(subject) || 0) + 1);
    });

    const inClass = studentClassMap.has(student.id) && studentClassMap.get(student.id).size > 0;
    if (!inClass) {
      noClassStudents.push({
        studentId: student.id,
        firstName: student.firstName || "",
        lastName: student.lastName || "",
        grade: student.grade || "",
      });
    }

    const studentParents = Array.isArray(student.parents) ? student.parents : [];
    studentParents.forEach((parentId) => {
      if (!parentMap.has(parentId)) {
        linkageIssues.push({
          type: "missingParentUser",
          studentId: student.id,
          parentId,
          details: `Student references parent ${parentId} but no user doc exists`,
        });
      } else {
        const parentStudents = Array.isArray(parentMap.get(parentId).students)
          ? parentMap.get(parentId).students
          : [];
        if (!parentStudents.includes(student.id)) {
          linkageIssues.push({
            type: "studentMissingFromParent",
            studentId: student.id,
            parentId,
            details: `Student has parent ${parentId} but parent's students[] doesn't include this student`,
          });
        }
      }
    });
  });

  // Check parent -> student direction
  parentMap.forEach((parent, parentId) => {
    const parentStudents = Array.isArray(parent.students) ? parent.students : [];
    parentStudents.forEach((studentId) => {
      const student = students.find((s) => s.id === studentId);
      if (!student) {
        linkageIssues.push({
          type: "missingStudentDoc",
          parentId,
          studentId,
          details: `Parent has student ${studentId} in students[] but no student doc exists`,
        });
      } else {
        const studentParents = Array.isArray(student.parents) ? student.parents : [];
        if (!studentParents.includes(parentId)) {
          linkageIssues.push({
            type: "parentMissingFromStudent",
            parentId,
            studentId,
            details: `Parent has student ${studentId} in students[] but student's parents[] doesn't include this parent`,
          });
        }
      }
    });
  });

  const byClass = classes
    .map((cls) => ({
      classId: cls.id,
      classType: cls.type || "",
      day: cls.day || "",
      startTime: cls.startTime || "",
      studentCount: Array.isArray(cls.enrolledStudents) ? cls.enrolledStudents.length : 0,
    }))
    .sort((a, b) => a.classId.localeCompare(b.classId));

  const newFromEnrolments = enrolments
    .filter((e) => e.createdStudentId)
    .map((e) => ({
      enrolmentId: e.id,
      studentId: e.createdStudentId,
      parentId: e.createdParentId || null,
      acceptedAt: e.acceptedAt ? toDate(e.acceptedAt)?.toISOString() || null : null,
    }))
    .sort((a, b) => (a.acceptedAt || "").localeCompare(b.acceptedAt || ""));

  const studentsWithActiveClass = students.filter(
    (s) => studentClassMap.has(s.id) && studentClassMap.get(s.id).size > 0
  ).length;

  return {
    reportType: "studentEnrolment",
    generatedAt: generatedAt.toISOString(),
    summary: {
      totalStudents: students.length,
      studentsWithActiveClass,
      studentsWithNoActiveClass: noClassStudents.length,
      linkageIssueCount: linkageIssues.length,
    },
    byGrade: [...gradeMap.entries()]
      .map(([grade, count]) => ({ grade, count }))
      .sort((a, b) => a.grade.localeCompare(b.grade)),
    bySubject: [...subjectMap.entries()]
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => a.subject.localeCompare(b.subject)),
    byClass,
    newFromEnrolments,
    studentsWithNoClass: noClassStudents.sort((a, b) =>
      a.lastName.localeCompare(b.lastName)
    ),
    linkageIssues,
  };
}

async function studentEnrolmentReportImpl({ actor, deps }) {
  const { db, clock } = deps;
  if (!db) throw new TypeError("studentEnrolmentReportImpl requires db");
  if (!actor?.uid) throw new TypeError("studentEnrolmentReportImpl requires actor.uid");

  const generatedAt = clock ? clock() : new Date();
  const { students, parents, classes, enrolments } = await loadStudentEnrolmentData(db);
  return buildStudentEnrolmentReport({ students, parents, classes, enrolments, generatedAt });
}

const adminStudentEnrolmentReport = onCall(
  { region: "us-central1" },
  async (request) => {
    const actor = requireAdminCallable(request);
    try {
      return await studentEnrolmentReportImpl({
        actor,
        deps: { db: admin.firestore() },
      });
    } catch (err) {
      logger.error("[adminStudentEnrolmentReport] failed", {
        errorMessage: err?.message,
        actorUid: actor.uid,
      });
      throw toHttpsError(err);
    }
  }
);

module.exports = {
  buildStudentEnrolmentReport,
  studentEnrolmentReportImpl,
  adminStudentEnrolmentReport,
};
