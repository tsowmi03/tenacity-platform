"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  shouldSendParentWelcomeEmail,
} = require("../../lib/portal/enrolmentNotifications");

describe("shouldSendParentWelcomeEmail", () => {
  it("sends one welcome email for the first child in a grouped submission", () => {
    assert.equal(
      shouldSendParentWelcomeEmail({
        registrationGroupId: "family-1",
        registrationGroupIndex: 0,
        registrationGroupSize: 3,
      }),
      true
    );
  });

  it("suppresses welcome emails for later children in a grouped submission", () => {
    assert.equal(
      shouldSendParentWelcomeEmail({
        registrationGroupId: "family-1",
        registrationGroupIndex: 1,
        registrationGroupSize: 3,
      }),
      false
    );
    assert.equal(
      shouldSendParentWelcomeEmail({
        registrationGroupId: "family-1",
        registrationGroupIndex: 2,
        registrationGroupSize: 3,
      }),
      false
    );
  });

  it("preserves legacy welcome emails when group fields are absent", () => {
    assert.equal(
      shouldSendParentWelcomeEmail({
        carerEmail: "parent@example.com",
      }),
      true
    );
  });
});
