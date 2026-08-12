"use strict";

/*
 * Firestore writes for the seed scenario.
 *
 * Ordering matters: identities must be provisioned first, because Firebase
 * Auth assigns uids server-side and every cross-reference in the scenario
 * (students.parents, classes.tutors, attendance.attendance, chats.participants,
 * invoices.parentId, feedback.parentIds) is a symbolic "@parent-1" until
 * resolveIds swaps it. Writing Firestore before resolving is the most likely
 * way to get this wrong, so writeScenario asserts that no symbolic reference
 * survives.
 *
 * The Admin SDK converts native Date objects to Timestamps on write, so the
 * scenario keeps plain Dates and nothing needs explicit conversion here.
 */

const { buildUserDoc } = require("../../src/users/userFactory");
const {
  buildAttendanceDoc,
  makeAttendanceDocId,
} = require("../../src/classes/attendanceFactory");
const { isRef, symbolOf } = require("./scenario");

const MAX_BATCH_OPS = 450;

/** Recursively replace every "@symbolic" string with its real uid. */
function resolveIds(value, uidBySymbolicId) {
  if (typeof value === "string") {
    if (!isRef(value)) return value;
    const symbol = symbolOf(value);
    const uid = uidBySymbolicId.get(symbol);
    if (!uid) throw new Error(`Unresolved symbolic reference "${value}"`);
    return uid;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveIds(item, uidBySymbolicId));
  }
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveIds(item, uidBySymbolicId),
      ])
    );
  }
  return value;
}

/** Throw if any "@symbolic" reference survived resolution. */
function assertFullyResolved(value, path = "$") {
  if (typeof value === "string") {
    if (isRef(value)) {
      throw new Error(`Symbolic reference "${value}" survived resolution at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertFullyResolved(item, `${path}[${i}]`));
    return;
  }
  if (value instanceof Date) return;
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      assertFullyResolved(item, `${path}.${key}`);
    }
  }
}

/**
 * Allocate a contiguous block of invoice numbers from the shared allocator at
 * counters/invoices, the same counter src/invoices/createInvoice.js uses.
 *
 * Seeding invoices without advancing the counter would make the first invoice
 * an admin creates in staging collide with a seeded number.
 */
async function reserveInvoiceNumbers({ db, count, commit }) {
  const ref = db.collection("counters").doc("invoices");

  if (!commit) {
    const snap = await ref.get();
    const current =
      snap.exists && typeof snap.data()?.current === "number"
        ? snap.data().current
        : 0;
    return { first: current + 1, last: current + count, current };
  }

  return db.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    const current =
      snap.exists && typeof snap.data()?.current === "number"
        ? snap.data().current
        : 0;
    const last = current + count;
    txn.set(ref, { current: last }, { merge: true });
    return { first: current + 1, last, current };
  });
}

/** Collects writes and flushes them in batches under the Firestore limit. */
function createBatchWriter(db, { commit }) {
  const counts = {};
  let batch = commit ? db.batch() : null;
  let pending = 0;
  let total = 0;

  async function flush() {
    if (commit && pending > 0) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  return {
    counts,
    get total() {
      return total;
    },
    async set(ref, data, collectionLabel) {
      counts[collectionLabel] = (counts[collectionLabel] || 0) + 1;
      total += 1;
      if (!commit) return;
      batch.set(ref, data);
      pending += 1;
      if (pending >= MAX_BATCH_OPS) await flush();
    },
    flush,
  };
}

/**
 * Write the whole scenario.
 *
 * @returns {Promise<{writesByCollection: Record<string,number>, total: number,
 *                    invoiceNumbers: object}>}
 */
async function writeScenario({
  db,
  scenario,
  uidBySymbolicId,
  seedTag,
  commit,
  logger,
}) {
  const resolved = resolveIds(scenario, uidBySymbolicId);
  assertFullyResolved({
    students: resolved.students,
    classes: resolved.classes,
    attendance: resolved.attendance,
    invoices: resolved.invoices,
    feedback: resolved.feedback,
    waitlistEntries: resolved.waitlistEntries,
  });

  const stamp = { tag: seedTag, createdAt: new Date() };
  const writer = createBatchWriter(db, { commit });
  const seedMeta = () => ({ seed: { ...stamp } });

  const actorUid = uidBySymbolicId.get("admin-1");
  if (!actorUid) throw new Error("Scenario is missing the admin-1 identity");

  // Chat membership has to be known BEFORE the users are written. The app
  // reads its chat list from users/{uid}.activeChats, so a chat that exists
  // but is missing from that array simply will not appear — and writing it in
  // a second pass would need a merge, which the batch writer deliberately does
  // not do (a non-merge set would replace the whole user document).
  const chatLinksByUid = new Map();
  for (const chat of resolved.chats) {
    const unreadUid = chat.unreadFor ? uidBySymbolicId.get(chat.unreadFor) : null;
    for (const symbolicId of chat.participants) {
      const uid = uidBySymbolicId.get(symbolicId);
      if (!uid) throw new Error(`Unknown chat participant "${symbolicId}"`);
      const links = chatLinksByUid.get(uid) || { activeChats: [], unreadChats: {} };
      links.activeChats.push(chat.id);
      links.unreadChats[chat.id] = uid === unreadUid ? 1 : 0;
      chatLinksByUid.set(uid, links);
    }
  }

  // ---------------------------------------------------------------- terms
  for (const term of resolved.terms) {
    await writer.set(
      db.collection("terms").doc(term.id),
      { ...term.data, ...seedMeta() },
      "terms"
    );
  }

  // ---------------------------------------------------------------- users
  for (const user of resolved.users) {
    const uid = uidBySymbolicId.get(user.symbolicId);
    const base = buildUserDoc(
      {
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        email: user.email,
        phone: user.phone,
        lessonTokens: user.lessonTokens,
      },
      { actorUid }
    );

    // buildUserDoc always writes termsAccepted: false; the scenario needs a
    // mix so the T&C gate can be exercised both ways.
    const links = chatLinksByUid.get(uid) || { activeChats: [], unreadChats: {} };
    const doc = {
      ...base,
      termsAccepted: Boolean(user.termsAccepted),
      acceptedTermsVersion: user.termsAccepted ? "1.0.0-staging" : null,
      acceptedTermsAt: user.termsAccepted ? new Date() : null,
      activeChats: links.activeChats,
      unreadChats: links.unreadChats,
      ...seedMeta(),
    };

    if (user.role === "parent") {
      doc.students = resolved.students
        .filter((student) => student.data.parents.includes(uid))
        .map((student) => student.id);
    }

    await writer.set(db.collection("users").doc(uid), doc, "users");
    await writer.set(
      db.collection("userSettings").doc(uid),
      {
        notificationsEnabled: true,
        emailNotifications: true,
        pushNotifications: true,
        ...seedMeta(),
      },
      "userSettings"
    );
  }

  // ------------------------------------------------------------- students
  for (const student of resolved.students) {
    await writer.set(
      db.collection("students").doc(student.id),
      { ...student.data, ...seedMeta() },
      "students"
    );
  }

  // -------------------------------------------------------------- classes
  for (const klass of resolved.classes) {
    await writer.set(
      db.collection("classes").doc(klass.id),
      { ...klass.data, ...seedMeta() },
      "classes"
    );
  }

  // ----------------------------------------------------------- attendance
  for (const session of resolved.attendance) {
    // Reuse the production factory so the deterministic id and the field
    // names (weekNum, not weekNumber) can never drift from what the app reads.
    const docId = makeAttendanceDocId(session.data.termId, session.weekNum);
    const base = buildAttendanceDoc(
      {
        date: session.data.date,
        termId: session.data.termId,
        weekNum: session.weekNum,
        enrolledStudents: session.data.attendance,
        tutors: session.data.tutors,
      },
      { actorUid }
    );

    const doc = {
      ...base,
      cancelled: session.data.cancelled,
      marks: session.data.marks,
      ...seedMeta(),
    };
    if (session.data.rollCompletedBy) {
      doc.rollCompletedBy = session.data.rollCompletedBy;
      doc.rollCompletedAt = session.data.rollCompletedAt;
    }

    await writer.set(
      db
        .collection("classes")
        .doc(session.classId)
        .collection("attendance")
        .doc(docId),
      doc,
      "classes/*/attendance"
    );
  }

  // ------------------------------------------------------------- invoices
  const invoiceNumbers = await reserveInvoiceNumbers({
    db,
    count: resolved.invoices.length,
    commit,
  });

  for (const [index, invoice] of resolved.invoices.entries()) {
    const parent = resolved.users.find(
      (user) => user.symbolicId === invoice.parentSymbolicId
    );
    const doc = {
      ...invoice.data,
      parentName: parent.displayName,
      parentEmail: parent.email,
      invoiceNumber: String(invoiceNumbers.first + index),
      createdAt: new Date(),
      ...seedMeta(),
    };

    await writer.set(
      db.collection("invoices").doc(invoice.id),
      doc,
      "invoices"
    );

    for (const payment of invoice.payments) {
      await writer.set(
        db
          .collection("invoices")
          .doc(invoice.id)
          .collection("payments")
          .doc(payment.id),
        { ...payment.data, ...seedMeta() },
        "invoices/*/payments"
      );
    }
  }

  // ---------------------------------------------------------------- chats
  for (const chat of resolved.chats) {
    const participantUids = chat.participants.map((symbolicId) => {
      const uid = uidBySymbolicId.get(symbolicId);
      if (!uid) throw new Error(`Unknown chat participant "${symbolicId}"`);
      return uid;
    });

    const messages = chat.messages.map((message, index) => ({
      id: `seed-message-${index + 1}`,
      senderId: uidBySymbolicId.get(message.from),
      text: message.text,
      type: "text",
      timestamp: new Date(Date.now() - message.minutesAgo * 60_000),
      readBy: Object.fromEntries(
        participantUids.map((uid) => [
          uid,
          uid === uidBySymbolicId.get(message.from),
        ])
      ),
    }));

    const last = messages[messages.length - 1];
    const unreadUid = chat.unreadFor
      ? uidBySymbolicId.get(chat.unreadFor)
      : null;

    await writer.set(
      db.collection("chats").doc(chat.id),
      {
        participants: participantUids,
        lastMessage: last.text,
        updatedAt: last.timestamp,
        unreadCounts: Object.fromEntries(
          participantUids.map((uid) => [uid, uid === unreadUid ? 1 : 0])
        ),
        deletedFor: {},
        typingStatus: {},
        ...seedMeta(),
      },
      "chats"
    );

    for (const message of messages) {
      await writer.set(
        db
          .collection("chats")
          .doc(chat.id)
          .collection("messages")
          .doc(message.id),
        {
          senderId: message.senderId,
          text: message.text,
          type: message.type,
          timestamp: message.timestamp,
          readBy: message.readBy,
          ...seedMeta(),
        },
        "chats/*/messages"
      );
    }

    // users/{uid}.activeChats and .unreadChats were written in the users loop
    // above, from chatLinksByUid.
  }

  // -------------------------------------------------------- announcements
  for (const announcement of resolved.announcements) {
    await writer.set(
      db.collection("announcements").doc(announcement.id),
      { ...announcement.data, ...seedMeta() },
      "announcements"
    );
  }

  // ------------------------------------------------------------- feedback
  for (const item of resolved.feedback) {
    await writer.set(
      db.collection("feedback").doc(item.id),
      { ...item.data, ...seedMeta() },
      "feedback"
    );
  }

  // ------------------------------------------------------------- waitlist
  for (const entry of resolved.waitlistEntries) {
    await writer.set(
      db.collection("waitlistEntries").doc(entry.id),
      { ...entry.data, ...seedMeta() },
      "waitlistEntries"
    );
  }

  // ----------------------------------------------------------- enrolments
  for (const enrolment of resolved.enrolments) {
    await writer.set(
      db.collection("enrolments").doc(enrolment.id),
      { ...enrolment.data, ...seedMeta() },
      "enrolments"
    );
  }

  await writer.flush();
  logger?.(`  wrote ${writer.total} document(s)`);

  return {
    writesByCollection: writer.counts,
    total: writer.total,
    invoiceNumbers,
  };
}

module.exports = {
  assertFullyResolved,
  createBatchWriter,
  reserveInvoiceNumbers,
  resolveIds,
  writeScenario,
};
