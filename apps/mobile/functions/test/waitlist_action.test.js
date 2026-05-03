const assert = require("node:assert/strict");
const test = require("node:test");

const {
  canPerformWaitlistStatusUpdate,
  countsTowardOpenOffers,
  countsTowardWaitlist,
  normalizeWaitlistReason,
  normalizeWaitlistStatus,
  shouldNotifyWaitlistReactivated,
  waitlistDisplayDay,
  waitlistEntryId,
  waitlistStatusCounterDeltas,
} = require("../lib/notifications/waitlist_action");
const {
  canPromoteWaitlistStatus,
  waitlistPromotionCounterDeltas,
} = require("../lib/notifications/waitlist_promotion_action");

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

test("waitlist status normalizes known statuses only", () => {
  assert.equal(normalizeWaitlistStatus("active"), "active");
  assert.equal(normalizeWaitlistStatus("offered"), "offered");
  assert.equal(normalizeWaitlistStatus("cancelled"), "cancelled");
  assert.throws(() => normalizeWaitlistStatus("other"), /Invalid waitlist status/);
});

test("waitlist status counter deltas preserve waitlist and offer counts", () => {
  assert.deepEqual(waitlistStatusCounterDeltas("active", "cancelled"), {
    waitlistCount: -1,
    openOfferCount: 0,
  });
  assert.deepEqual(waitlistStatusCounterDeltas("offered", "accepted"), {
    waitlistCount: 0,
    openOfferCount: 0,
  });
  assert.deepEqual(waitlistStatusCounterDeltas("accepted", "declined"), {
    waitlistCount: -1,
    openOfferCount: -1,
  });
  assert.deepEqual(waitlistStatusCounterDeltas("cancelled", "active"), {
    waitlistCount: 1,
    openOfferCount: 0,
  });
});

test("waitlist reactivation notification only fires when becoming active", () => {
  assert.equal(shouldNotifyWaitlistReactivated("cancelled", "active"), true);
  assert.equal(shouldNotifyWaitlistReactivated("active", "active"), false);
  assert.equal(shouldNotifyWaitlistReactivated("cancelled", "offered"), false);
});

test("waitlist status updates are scoped by actor role", () => {
  assert.equal(canPerformWaitlistStatusUpdate({
    actorId: "adminA",
    actorRole: "admin",
    entryParentId: "parentA",
    nextStatus: "active",
  }), true);
  assert.equal(canPerformWaitlistStatusUpdate({
    actorId: "parentA",
    actorRole: "parent",
    entryParentId: "parentA",
    nextStatus: "cancelled",
  }), true);
  assert.equal(canPerformWaitlistStatusUpdate({
    actorId: "parentA",
    actorRole: "parent",
    entryParentId: "parentA",
    nextStatus: "active",
  }), false);
  assert.equal(canPerformWaitlistStatusUpdate({
    actorId: "parentB",
    actorRole: "parent",
    entryParentId: "parentA",
    nextStatus: "cancelled",
  }), false);
});

test("waitlist promotion status rules match queue statuses", () => {
  assert.equal(canPromoteWaitlistStatus("active"), true);
  assert.equal(canPromoteWaitlistStatus("offered"), true);
  assert.equal(canPromoteWaitlistStatus("accepted"), true);
  assert.equal(canPromoteWaitlistStatus("declined"), false);
  assert.equal(canPromoteWaitlistStatus(undefined), false);
});

test("waitlist promotion counter deltas preserve waitlist and offer counts", () => {
  assert.deepEqual(waitlistPromotionCounterDeltas("active"), {
    waitlistCount: -1,
    openOfferCount: 0,
  });
  assert.deepEqual(waitlistPromotionCounterDeltas("offered"), {
    waitlistCount: -1,
    openOfferCount: -1,
  });
  assert.deepEqual(waitlistPromotionCounterDeltas("cancelled"), {
    waitlistCount: 0,
    openOfferCount: 0,
  });
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
