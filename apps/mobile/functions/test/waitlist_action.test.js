const assert = require("node:assert/strict");
const test = require("node:test");

const {
  countsTowardOpenOffers,
  countsTowardWaitlist,
  normalizeWaitlistReason,
  waitlistDisplayDay,
  waitlistEntryId,
} = require("../lib/notifications/waitlist_action");

test("waitlist entry id is stable for class and student", () => {
  assert.equal(waitlistEntryId("classA", "studentB"), "classA_studentB");
});

test("waitlist count only includes active queue statuses", () => {
  assert.equal(countsTowardWaitlist("active"), true);
  assert.equal(countsTowardWaitlist("offered"), true);
  assert.equal(countsTowardWaitlist("accepted"), true);
  assert.equal(countsTowardWaitlist("cancelled"), false);
  assert.equal(countsTowardWaitlist("promoted"), false);
  assert.equal(countsTowardWaitlist(undefined), false);
});

test("open offer count only includes active offers", () => {
  assert.equal(countsTowardOpenOffers("active"), false);
  assert.equal(countsTowardOpenOffers("offered"), true);
  assert.equal(countsTowardOpenOffers("accepted"), true);
  assert.equal(countsTowardOpenOffers("declined"), false);
  assert.equal(countsTowardOpenOffers(undefined), false);
});

test("waitlist display day supports current and legacy fields", () => {
  assert.equal(waitlistDisplayDay({ day: "Monday" }), "Monday");
  assert.equal(waitlistDisplayDay({ dayOfWeek: "Tuesday" }), "Tuesday");
  assert.equal(waitlistDisplayDay({ day: "", dayOfWeek: "Wednesday" }), "Wednesday");
  assert.equal(waitlistDisplayDay({}), "Unknown day");
});

test("waitlist reason normalizes client and server spellings", () => {
  assert.equal(normalizeWaitlistReason("classFull"), "class_full");
  assert.equal(normalizeWaitlistReason("class_full"), "class_full");
  assert.equal(normalizeWaitlistReason("classNotOpen"), "class_not_open");
  assert.equal(normalizeWaitlistReason("class_not_open"), "class_not_open");
  assert.throws(() => normalizeWaitlistReason("other"), /Invalid waitlist reason/);
});
