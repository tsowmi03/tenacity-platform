/*
 * One-off backfill: sends what Firestore already knows to PostHog (TP-35).
 *
 *   1. Person properties (name, email, role, student count) for every parent,
 *      tutor and admin, so dashboards show names rather than UIDs. Sent first,
 *      so the events below are stored with them.
 *   2. enrolment_created for every accepted intake (all time).
 *   3. enrolment_created, enrolment_cancelled and swap_processed from
 *      `adminAuditLogs` (kept for six months, so that is how far back they go).
 *   4. payment_received for every paid invoice (all time), and one-off
 *      bookings and failed payments from `paymentLogs`.
 *
 * Events are built by the same functions as the live triggers and carry the
 * same UUIDs, so PostHog keeps one copy if both send an event or the script is
 * rerun. Backfilled events also carry `backfilled: true`.
 *
 * Usage (Application Default Credentials; dry run unless --send):
 *   node scripts/backfillPostHog.js --project=staging
 *   node scripts/backfillPostHog.js --project=prod
 *   node scripts/backfillPostHog.js --project=prod --send
 *   node scripts/backfillPostHog.js --project=prod --no-people --events=enrolment_created --send
 *
 * The PostHog token comes from `.env.<projectId>` (staging has none, so a
 * staging run can only be a dry run unless --token=phc_... is given).
 */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");
const { PostHog } = require("posthog-node");

const {
  enrolmentCreatedFromIntake,
  eventFromAuditEntry,
  paymentFromInvoice,
  paymentFromPaymentLog,
  personPropertiesForUser,
} = require("../src/analytics/businessEvents");
const { captureMessage } = require("../src/analytics/serverAnalytics");

const PROJECTS = {
  staging: "tenacity-tutoring-staging",
  prod: "tenacity-tutoring-b8eb2",
};
const AUDIT_ACTIONS = [
  "class.enrol_permanent",
  "class.unenrol_permanent",
  "student.unenrol",
  "class.reschedule",
];

function parseArgs(argv) {
  const args = { project: "staging", send: false, token: null, events: null, people: true };
  for (const raw of argv) {
    if (raw === "--send") args.send = true;
    else if (raw === "--no-people") args.people = false;
    else if (raw.startsWith("--events=")) args.events = new Set(raw.split("=")[1].split(","));
    else if (raw.startsWith("--project=")) args.project = raw.split("=")[1];
    else if (raw.startsWith("--token=")) args.token = raw.split("=")[1];
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!PROJECTS[args.project]) throw new Error(`--project must be staging or prod`);
  return args;
}

function envToken(projectId) {
  const file = path.join(__dirname, "..", `.env.${projectId}`);
  if (!fs.existsSync(file)) return "";
  const line = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith("POSTHOG_PROJECT_TOKEN="));
  return line ? line.split("=")[1].trim() : "";
}

function parentFromStudent(student) {
  if (!student) return null;
  if (student.primaryParentId) return student.primaryParentId;
  return (student.parents || []).find(Boolean) || null;
}

function tally(counts, key) {
  counts[key] = (counts[key] || 0) + 1;
}

async function collect(db) {
  const people = [];
  const events = [];
  const skipped = {};

  const parentByEmail = new Map();
  const users = await db.collection("users").get();
  for (const doc of users.docs) {
    const properties = personPropertiesForUser(doc.data());
    if (properties) people.push({ distinctId: doc.id, properties });
    if (properties?.role === "parent" && properties.email) {
      parentByEmail.set(properties.email.toLowerCase(), doc.id);
    }
  }

  const enrolments = await db.collection("enrolments").get();
  for (const doc of enrolments.docs) {
    const enrolment = doc.data();
    if (enrolment.status !== "accepted") continue;
    // The original accept endpoint recorded neither the parent nor when, so
    // those fall back to the carer's account and the last update.
    const carerEmail = (enrolment.carerEmail || "").trim().toLowerCase();
    const evt = enrolmentCreatedFromIntake({
      enrolmentId: doc.id,
      enrolment,
      parentId: enrolment.createdParentId || parentByEmail.get(carerEmail),
      acceptedAt: enrolment.acceptedAt || enrolment.updatedAt || enrolment.createdAt,
    });
    if (evt) events.push(evt);
    else tally(skipped, "enrolment_created:intake (no parent account found)");
  }

  const students = new Map(
    (await db.collection("students").get()).docs.map((d) => [d.id, d.data()])
  );
  const enrolledNow = new Set();
  (await db.collection("classes").select("enrolledStudents").get()).docs.forEach((d) => {
    (d.get("enrolledStudents") || []).forEach((id) => enrolledNow.add(id));
  });
  const audit = await db
    .collection("adminAuditLogs")
    .where("action", "in", AUDIT_ACTIONS)
    .get();
  for (const doc of audit.docs) {
    const draft = eventFromAuditEntry(doc.data(), doc.id);
    if (!draft) continue;
    const distinctId = draft.parentId || parentFromStudent(students.get(draft.studentId));
    if (!distinctId) {
      tally(skipped, `${draft.event} (no parent: student deleted)`);
      continue;
    }
    const properties = { ...draft.properties };
    if (properties.reason === "class_removed") {
      // Whether they were still in another class at the time isn't recorded,
      // so this is whether they are in any class now.
      properties.student_still_enrolled = enrolledNow.has(draft.studentId);
      properties.still_enrolled_as_of_backfill = true;
    }
    events.push({ ...draft, distinctId, properties });
  }

  const invoices = await db.collection("invoices").where("status", "==", "paid").get();
  for (const doc of invoices.docs) {
    const invoice = doc.data();
    // Older invoices have no paidAt or updatedAt; the due date is the best
    // guess at when they were paid (flagged paid_at_estimated).
    const evt = paymentFromInvoice({
      invoiceId: doc.id,
      before: null,
      after: invoice,
      fallbackTime: invoice.dueDate || invoice.createdAt,
    });
    if (evt) events.push(evt);
    else tally(skipped, "payment_received:invoice (no parent or paidAt)");
  }

  const paymentLogs = await db.collection("paymentLogs").get();
  for (const doc of paymentLogs.docs) {
    const evt = paymentFromPaymentLog({ paymentIntentId: doc.id, before: null, after: doc.data() });
    if (evt) events.push(evt);
  }

  for (const evt of events) evt.properties = { ...evt.properties, backfilled: true };
  return { people, events, skipped };
}

function summarise({ people, events, skipped }) {
  const byEvent = {};
  let earliest = null;
  for (const evt of events) {
    const key = evt.properties.kind || evt.properties.enrolment_type || evt.properties.payment_source || evt.properties.reason || evt.properties.mode;
    tally(byEvent, key ? `${evt.event} (${key})` : evt.event);
    if (!earliest || evt.timestamp < earliest) earliest = evt.timestamp;
  }
  const roles = {};
  people.forEach((p) => tally(roles, p.properties.role));
  return {
    people: roles,
    events: byEvent,
    total_events: events.length,
    earliest_event: earliest ? earliest.toISOString() : null,
    skipped,
  };
}

async function send({ people, events }, token) {
  const client = new PostHog(token, {
    host: "https://us.i.posthog.com",
    // Routes old timestamps through PostHog's historical import path.
    historicalMigration: true,
    flushAt: 100,
    flushInterval: 0,
  });
  for (const person of people) {
    client.identify({ distinctId: person.distinctId, properties: person.properties });
  }
  // People first, so events are stored with the names already on the person.
  if (people.length) await client.flush();
  for (const evt of events) client.capture(captureMessage(evt));
  await client.shutdown();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = PROJECTS[args.project];
  admin.initializeApp({ projectId });
  const db = admin.firestore();

  const collected = await collect(db);
  // Narrow a resend, e.g. after fixing one event's properties. Same UUIDs, so
  // PostHog replaces the earlier copies.
  if (args.events) collected.events = collected.events.filter((e) => args.events.has(e.event));
  if (!args.people) collected.people = [];
  console.log(JSON.stringify({ projectId, send: args.send, ...summarise(collected) }, null, 2));

  if (!args.send) {
    console.log("Dry run: nothing sent. Add --send to send.");
    return;
  }
  const token = args.token || envToken(projectId);
  if (!token) throw new Error(`No PostHog token for ${projectId}; pass --token=phc_...`);
  await send(collected, token);
  console.log(`Sent ${collected.people.length} people and ${collected.events.length} events.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { collect, summarise, parseArgs };
