"use strict";

const { BookingMetadataError } = require("./oneOffBookingMetadata");

/**
 * What a one-off class costs, according to the server.
 *
 * Kept in Firestore rather than Remote Config so it can be read inside a
 * transaction and exercised against the emulator. The app still reads the
 * Remote Config value to show a price before the parent commits, but that copy
 * is advisory: the amount actually charged is computed here.
 */
const PRICING_DOC_PATH = ["config", "pricing"];
const ONE_OFF_PRICE_FIELD = "oneOffClassCents";

/** Read the price, in cents. Throws rather than guessing at a default. */
async function readOneOffPriceCents(db) {
  if (!db) throw new TypeError("readOneOffPriceCents requires db");

  const snapshot = await db
    .collection(PRICING_DOC_PATH[0])
    .doc(PRICING_DOC_PATH[1])
    .get();

  const value = snapshot.exists ? snapshot.data()?.[ONE_OFF_PRICE_FIELD] : undefined;

  if (!Number.isInteger(value) || value <= 0) {
    // Falling back to a hardcoded price would mean charging a number nobody
    // configured. Better to fail before the card is charged.
    throw new BookingMetadataError(
      `config/pricing.${ONE_OFF_PRICE_FIELD} is missing or not a positive integer number of cents`,
      { field: ONE_OFF_PRICE_FIELD }
    );
  }

  return value;
}

/**
 * Whether to reserve seats while a parent is at the card sheet.
 *
 * Defaults to off, and stays off until someone sets it — a hold that outlives
 * an abandoned payment costs another family a booking, so it is a deliberate
 * trade, not a default.
 */
async function readSeatHoldsEnabled(db) {
  try {
    const snapshot = await db
      .collection(PRICING_DOC_PATH[0])
      .doc(PRICING_DOC_PATH[1])
      .get();
    return snapshot.exists && snapshot.data()?.holdSeatsDuringPayment === true;
  } catch {
    return false;
  }
}

module.exports = {
  ONE_OFF_PRICE_FIELD,
  PRICING_DOC_PATH,
  readOneOffPriceCents,
  readSeatHoldsEnabled,
};
