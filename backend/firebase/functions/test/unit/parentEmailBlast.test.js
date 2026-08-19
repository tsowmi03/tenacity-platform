"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

require("firebase-admin");

const {
  mapWithConcurrency,
  resolveParentRecipients,
  sendParentEmailBlastImpl,
  validateSendPayload,
} = require("../../src/email/parentEmailBlast");
const {
  announcementIsParentVisible,
  buildBlastContent,
} = require("../../src/email/blastContent");
const { blocksFromLegacy } = require("../../src/email/weeklyUpdateBlocks");
const {
  CONTACT_EMAIL,
  logoUrlFor,
  preheaderText,
  renderWeeklyUpdateEmail,
} = require("../../src/email/weeklyUpdateEmail");
const {
  previewParentEmailBlastImpl,
  validatePreviewPayload,
} = require("../../src/email/previewParentEmailBlast");
const {
  unsubscribeTokenFor,
  unsubscribeOneClickUrlFor,
  unsubscribePageUrlFor,
  uidFromUnsubscribeToken,
} = require("../../src/email/unsubscribeToken");

const SECRET = "test-unsubscribe-secret";
const clock = () => new Date("2026-08-06T00:00:00Z");

/**
 * Minimal in-memory Firestore covering the reads and writes this module makes:
 * doc get/update, a single equality query, and transactions.
 */
function makeDb(seed = {}) {
  const store = new Map(Object.entries(seed).map(([key, value]) => [key, { ...value }]));
  const added = [];

  const snapshotFor = (path) => {
    const [, id] = path.split("/");
    const data = store.get(path);
    return {
      id,
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : { ...data }),
    };
  };

  const docRef = (collection, id) => ({
    id,
    path: `${collection}/${id}`,
    async get() {
      return snapshotFor(`${collection}/${id}`);
    },
    async update(patch) {
      const path = `${collection}/${id}`;
      if (!store.has(path)) throw new Error(`missing doc ${path}`);
      store.set(path, { ...store.get(path), ...patch });
    },
  });

  return {
    store,
    added,
    collection(name) {
      return {
        doc: (id) => docRef(name, id),
        async add(data) {
          added.push({ collection: name, data });
          return { id: `auto-${added.length}` };
        },
        where(field, op, value) {
          assert.equal(op, "==");
          return {
            async get() {
              const docs = [];
              for (const [path, data] of store.entries()) {
                const [collectionName, id] = path.split("/");
                if (collectionName === name && data[field] === value) {
                  docs.push({ id, data: () => ({ ...data }) });
                }
              }
              return { docs, empty: docs.length === 0 };
            },
          };
        },
      };
    },
    async runTransaction(fn) {
      return fn({
        get: (ref) => Promise.resolve(snapshotFor(ref.path)),
        update: (ref, patch) => {
          store.set(ref.path, { ...store.get(ref.path), ...patch });
        },
      });
    },
  };
}

function seedForSend(overrides = {}) {
  return {
    "parentEmailBlasts/blast-1": {
      subject: "Week of 4 August",
      intro: "Hi parents",
      announcementIds: ["ann-live", "ann-archived", "ann-tutor"],
      sections: [{ title: "Fee reminder", body: "Invoices due Friday" }],
      status: "draft",
      ...overrides,
    },
    "announcements/ann-live": {
      title: "Timetable change",
      body: "Tuesday moves to 5pm",
      audience: "parent",
      archived: false,
    },
    "announcements/ann-archived": {
      title: "Withdrawn notice",
      body: "Ignore me",
      audience: "all",
      archived: true,
    },
    "announcements/ann-tutor": {
      title: "Tutor PD",
      body: "Staff only",
      audience: "tutor",
      archived: false,
    },
    "users/parent-1": { role: "parent", email: "a@example.com", firstName: "Ann" },
    "users/parent-2": { role: "parent", email: "b@example.com", firstName: "Ben" },
    "users/parent-3": { role: "parent", email: "c@example.com", emailBlastOptOut: true },
    "users/parent-4": { role: "parent", email: "" },
    "users/tutor-1": { role: "tutor", email: "t@example.com" },
  };
}

function recordingSender() {
  const sent = [];
  return {
    sent,
    send: async (message) => {
      sent.push(message);
    },
  };
}

describe("validateSendPayload", () => {
  it("requires a blastId", () => {
    assert.throws(() => validateSendPayload({}), /blastId/);
  });

  it("accepts a bare blastId", () => {
    assert.deepEqual(validateSendPayload({ blastId: "abc" }), {
      blastId: "abc",
      testEmails: null,
    });
  });

  it("normalises test recipients and rejects invalid ones", () => {
    assert.deepEqual(
      validateSendPayload({ blastId: "abc", testEmails: ["Admin@Example.com"] }),
      { blastId: "abc", testEmails: ["admin@example.com"] }
    );
    assert.throws(
      () => validateSendPayload({ blastId: "abc", testEmails: ["nope"] }),
      /valid email/
    );
  });

  it("caps the number of test recipients", () => {
    const many = ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com", "f@x.com"];
    assert.throws(
      () => validateSendPayload({ blastId: "abc", testEmails: many }),
      /at most 5/
    );
  });

  it("rejects an empty test-recipient list rather than reading it as a real send", () => {
    assert.throws(
      () => validateSendPayload({ blastId: "abc", testEmails: [] }),
      /at least 1/
    );
  });
});

describe("resolveParentRecipients", () => {
  it("drops opt-outs and unusable addresses, and dedupes shared inboxes", () => {
    const { recipients, optedOut, unusable } = resolveParentRecipients([
      { id: "p1", data: { email: "Shared@Example.com", firstName: "Ann" } },
      { id: "p2", data: { email: "shared@example.com", firstName: "Ben" } },
      { id: "p3", data: { email: "opted@example.com", emailBlastOptOut: true } },
      { id: "p4", data: { email: "not-an-email" } },
      { id: "p5", data: {} },
    ]);

    assert.deepEqual(
      recipients.map((r) => r.email),
      ["shared@example.com"]
    );
    assert.equal(recipients[0].uid, "p1");
    assert.equal(optedOut, 1);
    assert.equal(unusable, 2);
  });

  it("suppresses a shared inbox when either account has opted out", () => {
    // The unsubscribe token names one uid, but the inbox is shared. Honouring
    // the flag per-record would let the other account keep mailing it.
    const { recipients, optedOut } = resolveParentRecipients([
      { id: "p1", data: { email: "shared@example.com", firstName: "Ann" } },
      {
        id: "p2",
        data: { email: "Shared@Example.com", emailBlastOptOut: true },
      },
    ]);

    assert.deepEqual(recipients, []);
    assert.equal(optedOut, 2);
  });

  it("suppresses the address whichever record is seen first", () => {
    // Firestore query order is arbitrary, so the opt-out must not depend on
    // the opted-out record being processed before the other one.
    const optedOutFirst = resolveParentRecipients([
      { id: "p2", data: { email: "shared@example.com", emailBlastOptOut: true } },
      { id: "p1", data: { email: "shared@example.com" } },
    ]);
    assert.deepEqual(optedOutFirst.recipients, []);
  });
});

describe("announcementIsParentVisible", () => {
  it("accepts parent and all, rejects archived and staff audiences", () => {
    assert.equal(announcementIsParentVisible({ audience: "parent" }), true);
    assert.equal(announcementIsParentVisible({ audience: "all" }), true);
    assert.equal(announcementIsParentVisible({ audience: "tutor" }), false);
    assert.equal(announcementIsParentVisible({ audience: "admin" }), false);
    assert.equal(
      announcementIsParentVisible({ audience: "all", archived: true }),
      false
    );
  });
});

describe("mapWithConcurrency", () => {
  it("preserves order and respects the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return value * 2;
    });
    assert.deepEqual(results, [2, 4, 6, 8, 10]);
    assert.ok(peak <= 2, `expected at most 2 in flight, saw ${peak}`);
  });
});

describe("renderWeeklyUpdateEmail", () => {
  it("escapes author content and includes the unsubscribe link", () => {
    const { html, text } = renderWeeklyUpdateEmail({
      subject: "Week of 4 August",
      intro: "Hi <parents> & friends",
      announcements: [{ title: "Timetable", body: "Line one\nLine two" }],
      sections: [{ title: "Fees", body: "Due Friday" }],
      unsubscribeUrl: "https://example.com/unsubscribe?token=abc",
    });

    assert.ok(html.includes("Hi &lt;parents&gt; &amp; friends"));
    assert.ok(!html.includes("<parents>"));
    assert.ok(html.includes("Line one<br />Line two"));
    assert.ok(html.includes("https://example.com/unsubscribe?token=abc"));
    assert.ok(text.includes("Unsubscribe from weekly updates:"));
  });

  it("omits the announcements heading when none are selected", () => {
    const { html } = renderWeeklyUpdateEmail({
      subject: "Note",
      intro: "Just a note",
      unsubscribeUrl: "https://example.com/u",
    });
    assert.ok(!html.includes("This week's announcements"));
  });

  it("emits a full document laid out on tables, not divs", () => {
    const { html } = renderWeeklyUpdateEmail({
      subject: "Week of 4 August",
      intro: "Hello",
      unsubscribeUrl: "https://example.com/u",
    });

    assert.ok(html.startsWith("<!DOCTYPE html>"));
    assert.ok(html.includes('<meta name="color-scheme" content="light dark" />'));
    assert.ok(!html.includes('<div style="font-family:Arial'));
    assert.ok(!html.includes("<style"));
    assert.ok(!html.includes("@font-face"));
  });

  it("renders the Tenacity editorial hierarchy and branded content panels", () => {
    const { html } = renderWeeklyUpdateEmail({
      subject: "Week of 4 August",
      intro: "A quick note for families.",
      announcements: [{ title: "Timetable change", body: "Tuesday moves." }],
      sections: [{ title: "Learning focus", body: "Revision this week." }],
      unsubscribeUrl: "https://example.com/u",
    });

    assert.ok(html.includes("Weekly family update"));
    assert.ok(html.includes("A note from Tenacity"));
    assert.ok(html.includes("Important information"));
    assert.ok(html.includes("At a glance"));
    assert.ok(html.includes("Everything else, all in one place"));
    assert.ok(html.includes("background-color:#FBF8F3"));
    assert.ok(html.includes("border-top:4px solid #5AA5E3"));
    assert.ok(html.includes("background-color:#112D4F"));
  });

  it("does not render empty optional content panels", () => {
    const { html } = renderWeeklyUpdateEmail({
      subject: "Note",
      unsubscribeUrl: "https://example.com/u",
    });

    assert.ok(!html.includes("A note from Tenacity"));
    assert.ok(!html.includes("Important information"));
    assert.ok(!html.includes("At a glance"));
  });

  it("stays fluid on narrow screens while pinning Outlook to 600px", () => {
    // A `width="600"` table stretches its own containing block, so
    // `max-width:100%` cannot rescue it and the content runs off the right of
    // a phone. Everyone gets a fluid table capped at 600px; Outlook, which
    // ignores max-width, gets the fixed width from the ghost table instead.
    const { html } = renderWeeklyUpdateEmail({
      subject: "Week of 4 August",
      intro: "Hello",
      unsubscribeUrl: "https://example.com/u",
    });

    assert.ok(html.includes('style="width:100%;max-width:600px;'));
    assert.ok(!html.includes('style="width:600px'));
    assert.match(html, /<!--\[if mso\]><table[^>]*width="600"/);
    assert.ok(html.includes("<!--[if mso]></td></tr></table><![endif]-->"));
  });

  it("renders the logo against the supplied origin", () => {
    const { html } = renderWeeklyUpdateEmail({
      subject: "Note",
      intro: "Hello",
      unsubscribeUrl: "https://example.com/u",
      logoUrl: logoUrlFor("https://site.test"),
    });

    assert.ok(html.includes('src="https://site.test/email/logo-horizontal-white.png"'));
    // Images are blocked by default in many clients; the alt text and the band
    // colour are what carry the brand when the logo does not load.
    assert.ok(html.includes('alt="Tenacity Tutoring"'));
    assert.ok(html.includes("background-color:#1B3F71"));
  });

  it("carries contact details in both parts", () => {
    const { html, text } = renderWeeklyUpdateEmail({
      subject: "Note",
      intro: "Hello",
      unsubscribeUrl: "https://example.com/u",
    });

    assert.ok(html.includes(CONTACT_EMAIL));
    assert.ok(text.includes(CONTACT_EMAIL));
  });

  it("escapes the preheader, which is author-supplied like everything else", () => {
    const { html } = renderWeeklyUpdateEmail({
      subject: "Note",
      intro: "Hi <parents> & friends",
      unsubscribeUrl: "https://example.com/u",
    });

    assert.ok(html.includes("max-height:0"));
    assert.ok(!html.includes("<parents>"));
  });

  it("keeps a representative long digest below Gmail's clipping threshold", () => {
    const announcements = Array.from({ length: 6 }, (_, index) => ({
      title: `Announcement ${index + 1}`,
      body: "A useful update for parents. ".repeat(20),
    }));
    const sections = Array.from({ length: 12 }, (_, index) => ({
      title: `Section ${index + 1}`,
      body: "This week's learning and administration details. ".repeat(30),
    }));

    const { html } = renderWeeklyUpdateEmail({
      subject: "A detailed weekly update",
      intro: "Welcome to this week's family update.",
      announcements,
      sections,
      unsubscribeUrl: "https://example.com/unsubscribe?token=representative",
    });

    assert.ok(
      Buffer.byteLength(html, "utf8") < 100 * 1024,
      "representative email should stay below 100 KB"
    );
  });
});

describe("preheaderText", () => {
  it("prefers the first block's copy, collapsing whitespace", () => {
    assert.equal(
      preheaderText({
        blocks: blocksFromLegacy({ intro: "  Term 3\n\nstarts   Monday " }),
        subject: "Week of 4 August",
      }),
      "Term 3 starts Monday"
    );
  });

  it("skips headings, which say nothing in an inbox list", () => {
    assert.equal(
      preheaderText({
        blocks: blocksFromLegacy({
          announcements: [{ title: "Timetable change", body: "Tuesday moves." }],
        }),
        subject: "Week of 4 August",
      }),
      "Timetable change"
    );
  });

  it("falls back to the subject when no block carries copy", () => {
    assert.equal(
      preheaderText({ blocks: [], subject: "Week of 4 August" }),
      "Week of 4 August"
    );
  });

  it("prefers an explicit preheader over anything derived", () => {
    assert.equal(
      preheaderText({
        preheader: "Exam timetables are out",
        blocks: blocksFromLegacy({ intro: "Term 3 starts Monday" }),
        subject: "Week of 4 August",
      }),
      "Exam timetables are out"
    );
  });

  it("truncates rather than spilling the whole intro into the inbox list", () => {
    const result = preheaderText({
      blocks: blocksFromLegacy({ intro: "word ".repeat(60) }),
      subject: "s",
    });
    assert.ok(result.length <= 90);
    assert.ok(result.endsWith("…"));
  });
});

describe("buildBlastContent", () => {
  it("drops archived and staff-only announcements from a pre-block draft", async () => {
    const db = makeDb(seedForSend());
    const blast = db.store.get("parentEmailBlasts/blast-1");

    const content = await buildBlastContent({ db, blast, blastId: "blast-1" });

    assert.deepEqual(
      content.announcements.map((a) => a.id),
      ["ann-live"]
    );
    assert.equal(content.subject, "Week of 4 August");
    // The fixed slots become blocks in the order the old layout rendered them.
    assert.deepEqual(
      content.blocks.map((block) => block.type),
      ["text", "heading", "announcement", "spacer", "heading", "text"]
    );
  });

  it("resolves announcement blocks against the live announcement", async () => {
    const db = makeDb({
      ...seedForSend(),
      "parentEmailBlasts/blast-2": {
        subject: "Blocks",
        blocks: [
          { id: "b1", type: "announcement", announcementId: "ann-live" },
          { id: "b2", type: "announcement", announcementId: "ann-archived" },
        ],
      },
    });

    const content = await buildBlastContent({
      db,
      blast: db.store.get("parentEmailBlasts/blast-2"),
      blastId: "blast-2",
    });

    assert.deepEqual(
      content.blocks.map((block) => block.title),
      ["Timetable change"]
    );
    assert.deepEqual(
      content.announcements.map((a) => a.id),
      ["ann-live"]
    );
  });

  it("leaves out blocks with nothing in them but keeps structural ones", async () => {
    const db = makeDb({
      "parentEmailBlasts/blast-3": {
        subject: "Blocks",
        blocks: [
          { id: "b1", type: "text", tone: "plain", title: "", body: "   " },
          { id: "b2", type: "divider" },
          { id: "b3", type: "text", tone: "card", title: "Fees", body: "Due Friday" },
        ],
      },
    });

    const content = await buildBlastContent({
      db,
      blast: db.store.get("parentEmailBlasts/blast-3"),
      blastId: "blast-3",
    });

    assert.deepEqual(
      content.blocks.map((block) => block.type),
      ["divider", "text"]
    );
  });

  it("tolerates a draft with nothing in it", async () => {
    // The preview renders an in-progress draft; only the send path treats an
    // empty one as a failed precondition.
    const db = makeDb({ "parentEmailBlasts/blast-1": {} });
    const content = await buildBlastContent({
      db,
      blast: db.store.get("parentEmailBlasts/blast-1"),
      blastId: "blast-1",
    });

    assert.deepEqual(content, {
      subject: "",
      preheader: "",
      masthead: undefined,
      cta: undefined,
      blocks: [],
      announcements: [],
    });
  });
});

describe("previewParentEmailBlastImpl", () => {
  it("renders the draft without touching it or sending anything", async () => {
    const db = makeDb(seedForSend());
    const before = { ...db.store.get("parentEmailBlasts/blast-1") };

    const result = await previewParentEmailBlastImpl({
      payload: { blastId: "blast-1" },
      deps: { db, siteOrigin: "https://site.test" },
    });

    assert.equal(result.subject, "Week of 4 August");
    assert.ok(result.html.startsWith("<!DOCTYPE html>"));
    assert.equal(result.announcementCount, 1);
    assert.equal(result.blockCount, 6);

    // The draft is untouched: no status change, no deliveryStartedAt, and
    // nothing appended to the audit log.
    assert.deepEqual(db.store.get("parentEmailBlasts/blast-1"), before);
    assert.deepEqual(db.added, []);
  });

  it("applies the same announcement filtering as the send", async () => {
    const db = makeDb(seedForSend());
    const result = await previewParentEmailBlastImpl({
      payload: { blastId: "blast-1" },
      deps: { db, siteOrigin: "https://site.test" },
    });

    assert.ok(result.html.includes("Timetable change"));
    assert.ok(!result.html.includes("Withdrawn notice"));
    assert.ok(!result.html.includes("Tutor PD"));
  });

  it("uses a dead unsubscribe token so previewing cannot opt the admin out", async () => {
    const db = makeDb(seedForSend());
    const result = await previewParentEmailBlastImpl({
      payload: { blastId: "blast-1" },
      deps: { db, siteOrigin: "https://site.test" },
    });

    assert.ok(result.html.includes("https://site.test/unsubscribe?token=preview"));
    assert.equal(uidFromUnsubscribeToken("preview", SECRET), null);
  });

  it("rejects a missing draft", async () => {
    const db = makeDb({});
    await assert.rejects(
      previewParentEmailBlastImpl({
        payload: { blastId: "nope" },
        deps: { db },
      }),
      /no longer exists/
    );
  });

  it("requires a blastId", () => {
    assert.throws(() => validatePreviewPayload({}), /blastId/);
    assert.deepEqual(validatePreviewPayload({ blastId: "abc" }), {
      blastId: "abc",
    });
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips a uid", () => {
    const token = unsubscribeTokenFor("user-1", SECRET);
    assert.equal(uidFromUnsubscribeToken(token, SECRET), "user-1");
  });

  it("rejects tampering, wrong secrets and junk", () => {
    const token = unsubscribeTokenFor("user-1", SECRET);
    assert.equal(uidFromUnsubscribeToken(`user-2.${token.split(".")[1]}`, SECRET), null);
    assert.equal(uidFromUnsubscribeToken(token, "other-secret"), null);
    assert.equal(uidFromUnsubscribeToken("garbage", SECRET), null);
    assert.equal(uidFromUnsubscribeToken("", SECRET), null);
    assert.equal(uidFromUnsubscribeToken(token, ""), null);
  });

  it("builds page and one-click urls against the given origin", () => {
    assert.ok(
      unsubscribePageUrlFor("user-1", SECRET, "https://site.test/").startsWith(
        "https://site.test/unsubscribe?token=user-1."
      )
    );
    // RFC 8058 one-click POSTs, so the header must point at the API route.
    assert.ok(
      unsubscribeOneClickUrlFor("user-1", SECRET, "https://site.test").startsWith(
        "https://site.test/api/unsubscribe?token=user-1."
      )
    );
  });
});

describe("sendParentEmailBlastImpl", () => {
  const actor = { uid: "admin-1", email: "admin@example.com" };

  it("mails eligible parents, records stats and writes an audit log", async () => {
    const db = makeDb(seedForSend());
    const sender = recordingSender();

    const result = await sendParentEmailBlastImpl({
      payload: { blastId: "blast-1", testEmails: null },
      actor,
      deps: { db, sendEmail: sender.send, secret: SECRET, clock },
    });

    assert.equal(result.recipientCount, 2);
    assert.equal(result.successCount, 2);
    assert.equal(result.failureCount, 0);
    assert.equal(result.optedOutCount, 1);
    assert.equal(result.announcementCount, 1);

    assert.deepEqual(
      sender.sent.map((message) => message.to).sort(),
      ["a@example.com", "b@example.com"]
    );
    const [first] = sender.sent;
    assert.equal(first.from, "no-reply@tenacitytutoring.com");
    assert.ok(first.headers["List-Unsubscribe"].includes("/api/unsubscribe?token="));
    assert.equal(first.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.ok(first.html.includes("/unsubscribe?token="));
    assert.ok(first.html.includes("Timetable change"));
    assert.ok(first.html.includes("Fee reminder"));
    // Archived and tutor-only announcements never reach a parent.
    assert.ok(!first.html.includes("Withdrawn notice"));
    assert.ok(!first.html.includes("Tutor PD"));

    const blast = db.store.get("parentEmailBlasts/blast-1");
    assert.equal(blast.status, "sent");
    assert.equal(blast.successCount, 2);
    assert.equal(blast.sentBy, "admin-1");
    assert.deepEqual(
      blast.announcementSnapshots.map((item) => item.id),
      ["ann-live"]
    );

    assert.equal(db.added.length, 1);
    assert.equal(db.added[0].collection, "adminAuditLogs");
    assert.equal(db.added[0].data.action, "parentEmailBlast.send");
    assert.equal(db.added[0].data.payloadSummary.recipientCount, 2);
  });

  it("gives each recipient their own unsubscribe link", async () => {
    const db = makeDb(seedForSend());
    const sender = recordingSender();

    await sendParentEmailBlastImpl({
      payload: { blastId: "blast-1", testEmails: null },
      actor,
      deps: { db, sendEmail: sender.send, secret: SECRET, clock },
    });

    const links = sender.sent.map((message) => message.headers["List-Unsubscribe"]);
    assert.equal(new Set(links).size, 2);
  });

  it("counts per-recipient failures without failing the whole send", async () => {
    const db = makeDb(seedForSend());
    const sendEmail = async (message) => {
      if (message.to === "b@example.com") throw new Error("bounced");
    };

    const result = await sendParentEmailBlastImpl({
      payload: { blastId: "blast-1", testEmails: null },
      actor,
      deps: { db, sendEmail, secret: SECRET, clock },
    });

    assert.equal(result.successCount, 1);
    assert.equal(result.failureCount, 1);
    assert.equal(db.store.get("parentEmailBlasts/blast-1").status, "sent");
  });

  it("marks the blast failed when every recipient fails", async () => {
    const db = makeDb(seedForSend());
    const sendEmail = async () => {
      throw new Error("sendgrid down");
    };

    const result = await sendParentEmailBlastImpl({
      payload: { blastId: "blast-1", testEmails: null },
      actor,
      deps: { db, sendEmail, secret: SECRET, clock },
    });

    assert.equal(result.successCount, 0);
    assert.equal(db.store.get("parentEmailBlasts/blast-1").status, "failed");
  });

  it("refuses to send a blast that already went out", async () => {
    const db = makeDb(seedForSend({ status: "sent" }));
    const sender = recordingSender();

    await assert.rejects(
      sendParentEmailBlastImpl({
        payload: { blastId: "blast-1", testEmails: null },
        actor,
        deps: { db, sendEmail: sender.send, secret: SECRET, clock },
      }),
      /already been sent/
    );
    assert.equal(sender.sent.length, 0);
  });

  it("refuses to send a blast that is mid-send", async () => {
    const db = makeDb(seedForSend({ status: "sending" }));
    await assert.rejects(
      sendParentEmailBlastImpl({
        payload: { blastId: "blast-1", testEmails: null },
        actor,
        deps: { db, sendEmail: async () => {}, secret: SECRET, clock },
      }),
      /already being sent/
    );
  });

  it("refuses to re-send a blast that already delivered but failed to finalise", async () => {
    // The finalising write failing after every parent was mailed leaves the
    // blast in `failed`; retrying it would mail all of them twice.
    const db = makeDb(
      seedForSend({ status: "failed", deliveryStartedAt: clock() })
    );
    const sender = recordingSender();

    await assert.rejects(
      sendParentEmailBlastImpl({
        payload: { blastId: "blast-1", testEmails: null },
        actor,
        deps: { db, sendEmail: sender.send, secret: SECRET, clock },
      }),
      /already begun sending/
    );
    assert.equal(sender.sent.length, 0);
  });

  it("marks delivery as started before the first message leaves", async () => {
    const db = makeDb(seedForSend());
    let markedWhenFirstSent;

    await sendParentEmailBlastImpl({
      payload: { blastId: "blast-1", testEmails: null },
      actor,
      deps: {
        db,
        sendEmail: async () => {
          if (markedWhenFirstSent === undefined) {
            markedWhenFirstSent = Boolean(
              db.store.get("parentEmailBlasts/blast-1").deliveryStartedAt
            );
          }
        },
        secret: SECRET,
        clock,
      },
    });

    assert.equal(markedWhenFirstSent, true);
  });

  it("leaves no delivery marker on a test send", async () => {
    const db = makeDb(seedForSend());

    await sendParentEmailBlastImpl({
      payload: { blastId: "blast-1", testEmails: ["me@example.com"] },
      actor,
      deps: { db, sendEmail: async () => {}, secret: SECRET, clock },
    });

    assert.equal(
      db.store.get("parentEmailBlasts/blast-1").deliveryStartedAt,
      undefined
    );
  });

  it("keeps a test send out of the parent list and leaves the draft alone", async () => {
    const db = makeDb(seedForSend());
    const sender = recordingSender();

    const result = await sendParentEmailBlastImpl({
      payload: { blastId: "blast-1", testEmails: ["qa@example.com"] },
      actor,
      deps: { db, sendEmail: sender.send, secret: SECRET, clock },
    });

    assert.equal(result.test, true);
    assert.deepEqual(
      sender.sent.map((message) => message.to),
      ["qa@example.com"]
    );
    const blast = db.store.get("parentEmailBlasts/blast-1");
    assert.equal(blast.status, "draft");
    assert.equal(blast.lastTestRecipientCount, 1);
    assert.equal(db.added.length, 0);
  });

  it("rejects an empty blast and releases the draft", async () => {
    const db = makeDb(
      seedForSend({ intro: "  ", announcementIds: [], sections: [] })
    );
    await assert.rejects(
      sendParentEmailBlastImpl({
        payload: { blastId: "blast-1", testEmails: null },
        actor,
        deps: { db, sendEmail: async () => {}, secret: SECRET, clock },
      }),
      /Add some content/
    );
    assert.equal(db.store.get("parentEmailBlasts/blast-1").status, "failed");
  });

  it("treats a draft of nothing but spacers as empty", async () => {
    // Blocks alone are not content: an update made of whitespace would go out as
    // a branded email saying nothing.
    const db = makeDb(
      seedForSend({
        intro: "",
        announcementIds: [],
        sections: [],
        blocks: [
          { id: "b1", type: "spacer", size: "lg" },
          { id: "b2", type: "divider" },
        ],
      })
    );

    await assert.rejects(
      sendParentEmailBlastImpl({
        payload: { blastId: "blast-1", testEmails: null },
        actor,
        deps: { db, sendEmail: async () => {}, secret: SECRET, clock },
      }),
      /Add some content/
    );
  });

  it("requires the unsubscribe secret", async () => {
    const db = makeDb(seedForSend());
    await assert.rejects(
      sendParentEmailBlastImpl({
        payload: { blastId: "blast-1", testEmails: null },
        actor,
        deps: { db, sendEmail: async () => {}, secret: "", clock },
      }),
      /EMAIL_BLAST_UNSUBSCRIBE_SECRET/
    );
  });

  it("fails clearly when the draft is gone", async () => {
    const db = makeDb({});
    await assert.rejects(
      sendParentEmailBlastImpl({
        payload: { blastId: "missing", testEmails: null },
        actor,
        deps: { db, sendEmail: async () => {}, secret: SECRET, clock },
      }),
      /no longer exists/
    );
  });
});
