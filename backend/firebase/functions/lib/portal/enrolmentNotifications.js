"use strict";

function shouldSendParentWelcomeEmail(enrolmentData = {}) {
  const registrationGroupId = String(
    enrolmentData.registrationGroupId || ""
  ).trim();

  return !registrationGroupId || enrolmentData.registrationGroupIndex === 0;
}

module.exports = {
  shouldSendParentWelcomeEmail,
};
