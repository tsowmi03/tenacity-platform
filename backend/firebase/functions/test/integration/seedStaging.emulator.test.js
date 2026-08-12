"use strict";

const assert = require("node:assert/strict");
const { after, before, describe, it } = require("node:test");

const { getAdmin } = require("../helpers/emulator");
const {
  assertResetTarget,
  assertSeedTarget,
} = require("../../scripts/seed/guard");
const { buildScenario } = require("../../scripts/seed/scenario");
const { provisionIdentities } = require("../../scripts/seed/identities");
const { resolveIds, writeScenario } = require("../../scripts/seed/writers");
const { resetSeededData } = require("../../scripts/seed/reset");

const SEED_TAG = "seed-test";
const PASSWORD = "SeedTestPass123!";
const EMAIL_TEMPLATE = "{key}@staging.tenacity.invalid";
const EMAIL_PATTERN = /^[a-z0-9-]+@staging\.tenacity\.invalid$/i;

async function seedOnce({ db, auth }) {
  const scenario = buildScenario({
    now: new Date("2026-08-12T09:00:00Z"),
    seedTag: SEED_TAG,
    weeks: 10,
    emailTemplate: EMAIL_TEMPLATE,
  });

  const identities = await provisionIdentities({
    auth,
    users: scenario.users,
    password: PASSWORD,
    commit: true,
  });

  const written = await writeScenario({
    db,
    scenario,
    uidBySymbolicId: identities.uidBySymbolicId,
    seedTag: SEED_TAG,
    commit: true,
  });

  return { scenario, identities, written };
}

describe("seed guard", () => {
  it("refuses the production project outright", () => {
    assert.throws(
      () => assertSeedTarget("tenacity-tutoring-b8eb2", {}),
      /production project/
    );
  });

  it("refuses production even when the emulator is running", () => {
    assert.throws(
      () =>
        assertSeedTarget("tenacity-tutoring-b8eb2", {
          FIRESTORE_EMULATOR_HOST: "localhost:8080",
        }),
      /production project/
    );
  });

  it("accepts the staging project", () => {
    assert.equal(
      assertSeedTarget("tenacity-tutoring-staging", {}),
      "tenacity-tutoring-staging"
    );
  });

  it("refuses an unknown project", () => {
    assert.throws(() => assertSeedTarget("some-other-project", {}), /allow list/);
  });

  it("refuses a demo- project unless the emulator is running", () => {
    assert.throws(() => assertSeedTarget("demo-x", {}), /FIRESTORE_EMULATOR_HOST/);
    assert.equal(
      assertSeedTarget("demo-x", { FIRESTORE_EMULATOR_HOST: "localhost:8080" }),
      "demo-x"
    );
  });

  it("requires an explicit projectId rather than inheriting .firebaserc", () => {
    assert.throws(() => assertSeedTarget("", {}), /--projectId is required/);
  });

  it("restricts reset to staging and emulator projects", () => {
    assert.throws(() => assertResetTarget("tenacity-tutoring-b8eb2", {}), /production/);
    assert.equal(
      assertResetTarget("tenacity-tutoring-staging", {}),
      "tenacity-tutoring-staging"
    );
  });
});

describe("scenario builder", () => {
  const scenario = buildScenario({
    now: new Date("2026-08-12T09:00:00Z"),
    seedTag: SEED_TAG,
  });

  it("is deterministic for a fixed clock", () => {
    const again = buildScenario({
      now: new Date("2026-08-12T09:00:00Z"),
      seedTag: SEED_TAG,
    });
    assert.deepEqual(scenario.classes, again.classes);
    assert.deepEqual(scenario.terms, again.terms);
  });

  it("puts exactly one term in the active state", () => {
    const active = scenario.terms.filter((t) => t.data.status === "active");
    assert.equal(active.length, 1);
    assert.equal(active[0].id, scenario.activeTermId);
  });

  it("covers every class enrolment state", () => {
    const states = scenario.classes.map((klass) => {
      const { enrolledStudents, capacity, minStudentsToOpen } = klass.data;
      if (enrolledStudents.length >= capacity) return "full";
      if (enrolledStudents.length < minStudentsToOpen) return "pending";
      return "open";
    });
    assert.ok(states.includes("full"), "expected a full class");
    assert.ok(states.includes("pending"), "expected a pending class");
    assert.ok(states.includes("open"), "expected an open class");
  });

  it("marks past weeks and leaves the current and future weeks unmarked", () => {
    for (const session of scenario.attendance) {
      if (session.weekNum > scenario.currentWeek) {
        assert.deepEqual(
          session.data.marks,
          {},
          `week ${session.weekNum} should have no marks`
        );
      }
    }
    const marked = scenario.attendance.filter(
      (s) => Object.keys(s.data.marks).length > 0
    );
    assert.ok(marked.length > 0, "expected some marked past sessions");
  });

  it("stamps the configured terms version on accepted users only", () => {
    const custom = buildScenario({
      now: new Date("2026-08-12T09:00:00Z"),
      seedTag: SEED_TAG,
      termsVersion: "9.9.9-test",
    });

    for (const user of custom.users) {
      assert.equal(
        user.acceptedTermsVersion,
        user.termsAccepted ? "9.9.9-test" : null,
        `wrong acceptedTermsVersion for ${user.symbolicId}`
      );
    }

    // Both states must exist or the T&C gate cannot be exercised both ways.
    assert.ok(custom.users.some((user) => user.termsAccepted));
    assert.ok(custom.users.some((user) => !user.termsAccepted));
  });

  it("rejects an empty terms version", () => {
    assert.throws(
      () =>
        buildScenario({
          now: new Date("2026-08-12T09:00:00Z"),
          seedTag: SEED_TAG,
          termsVersion: "",
        }),
      /termsVersion/
    );
  });

  it("rejects an email template without a {key} placeholder", () => {
    assert.throws(
      () =>
        buildScenario({
          now: new Date(),
          seedTag: SEED_TAG,
          emailTemplate: "fixed@example.com",
        }),
      /\{key\}/
    );
  });
});

describe("resolveIds", () => {
  it("replaces symbolic references and throws on unknown ones", () => {
    const map = new Map([["parent-1", "uid-1"]]);
    assert.deepEqual(
      resolveIds({ parents: ["@parent-1"], name: "Sam" }, map),
      { parents: ["uid-1"], name: "Sam" }
    );
    assert.throws(() => resolveIds("@nobody", map), /Unresolved symbolic reference/);
  });

  it("leaves Dates intact", () => {
    const date = new Date("2026-01-01T00:00:00Z");
    assert.equal(resolveIds({ at: date }, new Map()).at, date);
  });
});

describe("seedStaging against the emulator", () => {
  let db;
  let auth;
  let seeded;

  before(async () => {
    ({ db, auth } = getAdmin());
    seeded = await seedOnce({ db, auth });
  });

  after(async () => {
    await resetSeededData({
      db,
      auth,
      seedTag: SEED_TAG,
      emailPattern: EMAIL_PATTERN,
      commit: true,
    });
  });

  it("writes attendance docs at the deterministic id with a matching weekNum", async () => {
    const snap = await db
      .collectionGroup("attendance")
      .where("seed.tag", "==", SEED_TAG)
      .get();

    assert.ok(snap.size > 0, "expected attendance docs");
    for (const doc of snap.docs) {
      assert.match(doc.id, /^\d{4}_T\d_W\d+$/, `bad attendance id ${doc.id}`);
      const suffix = Number(doc.id.split("_W")[1]);
      assert.equal(
        doc.data().weekNum,
        suffix,
        `weekNum disagrees with the doc id for ${doc.id}`
      );
    }
  });

  it("advances counters/invoices past every seeded invoice number", async () => {
    const counter = await db.collection("counters").doc("invoices").get();
    const invoices = await db
      .collection("invoices")
      .where("seed.tag", "==", SEED_TAG)
      .get();

    const highest = Math.max(
      ...invoices.docs.map((doc) => Number(doc.data().invoiceNumber))
    );
    assert.ok(
      counter.data().current >= highest,
      `counter ${counter.data().current} is behind invoice ${highest}`
    );
  });

  it("sets a role custom claim on every seeded account", async () => {
    for (const [, uid] of seeded.identities.uidBySymbolicId) {
      const user = await auth.getUser(uid);
      assert.ok(
        user.customClaims && user.customClaims.role,
        `missing role claim for ${uid}`
      );
    }
  });

  it("keeps the users/{uid}.role doc in step with the claim", async () => {
    for (const [symbolicId, uid] of seeded.identities.uidBySymbolicId) {
      const [user, doc] = await Promise.all([
        auth.getUser(uid),
        db.collection("users").doc(uid).get(),
      ]);
      assert.ok(doc.exists, `missing user doc for ${symbolicId}`);
      assert.equal(
        doc.data().role,
        user.customClaims.role,
        `claim/doc role drift for ${symbolicId}`
      );
    }
  });

  it("links every chat into both participants' activeChats", async () => {
    const chats = await db
      .collection("chats")
      .where("seed.tag", "==", SEED_TAG)
      .get();

    for (const chat of chats.docs) {
      for (const uid of chat.data().participants) {
        const user = await db.collection("users").doc(uid).get();
        assert.ok(
          (user.data().activeChats || []).includes(chat.id),
          `chat ${chat.id} missing from activeChats of ${uid}`
        );
      }
    }
  });

  it("does not leave the user document truncated by the chat links", async () => {
    const chats = await db
      .collection("chats")
      .where("seed.tag", "==", SEED_TAG)
      .get();
    const participant = chats.docs[0].data().participants[0];
    const user = await db.collection("users").doc(participant).get();

    // Regression guard: an earlier version wrote chat links with a non-merge
    // batch set, which replaced the whole user document.
    for (const field of ["role", "email", "firstName", "lastName"]) {
      assert.ok(user.data()[field], `user doc lost "${field}"`);
    }
  });

  it("is idempotent across reset and reseed", async () => {
    const countAll = async () => {
      const [users, classes, attendance] = await Promise.all([
        db.collection("users").where("seed.tag", "==", SEED_TAG).get(),
        db.collection("classes").where("seed.tag", "==", SEED_TAG).get(),
        db.collectionGroup("attendance").where("seed.tag", "==", SEED_TAG).get(),
      ]);
      return { users: users.size, classes: classes.size, attendance: attendance.size };
    };

    const before = await countAll();

    const reset = await resetSeededData({
      db,
      auth,
      seedTag: SEED_TAG,
      emailPattern: EMAIL_PATTERN,
      commit: true,
    });
    assert.ok(reset.total > 0, "reset deleted nothing");

    const afterReset = await countAll();
    assert.deepEqual(afterReset, { users: 0, classes: 0, attendance: 0 });

    seeded = await seedOnce({ db, auth });
    assert.deepEqual(await countAll(), before);
  });
});
