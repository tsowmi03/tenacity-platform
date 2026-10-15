"use strict";

const {
  analyticsEnvironment,
  createPostHogClient,
  shutdownPostHogClient,
} = require("../shared/posthogClient");

/**
 * Sending TP-35 business events and person properties to PostHog.
 *
 * Never throws: an analytics failure must not fail the trigger that called
 * it, or Firestore would retry the trigger and the business write it follows
 * has already happened.
 */

/** The parent a student's events belong to: the primary one, else the first. */
async function parentForStudent(db, studentId) {
  if (!studentId) return null;
  const snap = await db.collection("students").doc(studentId).get();
  if (!snap.exists) return null;
  const student = snap.data() || {};
  if (typeof student.primaryParentId === "string" && student.primaryParentId) {
    return student.primaryParentId;
  }
  const parents = Array.isArray(student.parents) ? student.parents : [];
  return parents.find((id) => typeof id === "string" && id) || null;
}

/** Whether a student is still permanently in any class. */
async function studentStillEnrolled(db, studentId) {
  if (!studentId) return null;
  const snap = await db
    .collection("classes")
    .where("enrolledStudents", "array-contains", studentId)
    .limit(1)
    .get();
  return !snap.empty;
}

function captureMessage(evt, environment = analyticsEnvironment()) {
  // `source: "server"` matches the website's server events, so event
  // properties must not use `source` for anything else.
  const properties = { ...evt.properties, source: "server", environment };
  if (evt.setOnce) properties.$set_once = evt.setOnce;
  if (evt.set) properties.$set = evt.set;
  return {
    distinctId: evt.distinctId,
    event: evt.event,
    properties,
    timestamp: evt.timestamp,
    uuid: evt.uuid,
  };
}

/**
 * Send events and person updates through one client.
 *
 * `people` is `[{ distinctId, properties }]`, applied with `$set`.
 * Returns how many of each went out; 0 when this project has no token.
 */
async function sendToPostHog(
  { events = [], people = [] },
  { logger = console, createClient = createPostHogClient } = {}
) {
  const client = createClient();
  if (!client) return { events: 0, people: 0, disabled: true };
  try {
    for (const person of people) {
      client.identify({ distinctId: person.distinctId, properties: person.properties });
    }
    for (const evt of events) {
      client.capture(captureMessage(evt));
    }
    return { events: events.length, people: people.length };
  } catch (err) {
    logger.warn?.("[analytics] PostHog send failed", { errorMessage: err?.message });
    return { events: 0, people: 0, error: err };
  } finally {
    await shutdownPostHogClient(client);
  }
}

module.exports = {
  captureMessage,
  parentForStudent,
  sendToPostHog,
  studentStillEnrolled,
};
