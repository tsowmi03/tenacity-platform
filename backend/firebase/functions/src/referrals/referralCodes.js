"use strict";

const crypto = require("node:crypto");

/**
 * Referral codes: the `<code>` in `tenacitytutoring.com/r/<code>`.
 *
 * Parents read these aloud and type them from screenshots, so the alphabet
 * leaves out the characters people confuse — 0/O and 1/I. Six characters from
 * 32 gives about a billion codes; collisions are handled by the caller retrying
 * against `referralCodes/{code}`, not by making codes longer.
 */

const REFERRAL_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const REFERRAL_CODE_LENGTH = 6;
const REFERRAL_LINK_BASE = "https://tenacitytutoring.com/r/";

const CODE_PATTERN = new RegExp(
  `^[${REFERRAL_CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`
);

/**
 * A fresh random code. `randomInt` is injectable so tests can force a
 * collision; production uses the CSPRNG, since a guessable sequence would let
 * anyone enumerate parents' codes.
 */
function generateReferralCode(randomInt = crypto.randomInt) {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    code += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * The canonical form of a code typed or pasted by a person, or null when it
 * cannot be one of ours. Case and surrounding whitespace are forgiven; a
 * confusable character is not silently "corrected", because guessing could
 * attribute a family to the wrong referrer.
 */
function normaliseReferralCode(input) {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

function referralLink(code) {
  return `${REFERRAL_LINK_BASE}${code}`;
}

module.exports = {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  REFERRAL_LINK_BASE,
  generateReferralCode,
  normaliseReferralCode,
  referralLink,
};
