"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canAcceptParentPermanentEnrollment = exports.classEnrollmentState = exports.permanentSpotsRemaining = exports.canPerformPermanentEnrollmentAction = void 0;
const defaultMinimumStudentsToOpen = 2;
function canPerformPermanentEnrollmentAction(actorId, actorData, studentData) {
    if (actorData.role === "admin")
        return true;
    const parentIds = Array.isArray(studentData.parents)
        ? studentData.parents
        : [];
    const primaryParentId = studentData.primaryParentId;
    return parentIds.includes(actorId) || primaryParentId === actorId;
}
exports.canPerformPermanentEnrollmentAction = canPerformPermanentEnrollmentAction;
function permanentSpotsRemaining(classData) {
    const capacity = typeof classData.capacity === "number" ? classData.capacity : 0;
    const enrolledStudents = Array.isArray(classData.enrolledStudents)
        ? classData.enrolledStudents
        : [];
    return Math.max(capacity - enrolledStudents.length, 0);
}
exports.permanentSpotsRemaining = permanentSpotsRemaining;
function classEnrollmentState(classData) {
    const minimumStudentsToOpen = typeof classData.minStudentsToOpen === "number"
        ? classData.minStudentsToOpen
        : defaultMinimumStudentsToOpen;
    const enrolledStudents = Array.isArray(classData.enrolledStudents)
        ? classData.enrolledStudents
        : [];
    const spotsRemaining = permanentSpotsRemaining(classData);
    if (spotsRemaining <= 0)
        return "full";
    if (enrolledStudents.length < minimumStudentsToOpen)
        return "pending";
    return "open";
}
exports.classEnrollmentState = classEnrollmentState;
function canAcceptParentPermanentEnrollment(classData) {
    return classEnrollmentState(classData) === "open";
}
exports.canAcceptParentPermanentEnrollment = canAcceptParentPermanentEnrollment;
