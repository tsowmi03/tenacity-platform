"use strict";

/**
 * Seats reserved for payments that are still in progress.
 *
 * Between creating a PaymentIntent and the card clearing, a parent spends
 * anywhere from seconds to minutes in the Stripe sheet. Without a hold, another
 * family can take the last seat in that window, and the first parent's payment
 * arrives for a session that is now full — recoverable only by refunding them.
 *
 * A hold makes that rare rather than routine. It is deliberately soft: it
 * expires on its own, so an abandoned payment sheet cannot keep a seat out of
 * circulation, and nothing depends on it being released.
 *
 * Off by default. Holding a seat for a payment that never completes costs
 * another family a booking, which is a worse trade than an occasional refund
 * until there is evidence the collision actually happens.
 */

const HOLD_COLLECTION = "oneOffHolds";

/** How long a hold survives. Longer than any reasonable time at a card sheet. */
const HOLD_TTL_MS = 15 * 60 * 1000;

function holdExpiryMillis(hold) {
  const value = hold?.expiresAt;
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

/**
 * How many seats are spoken for by payments still in flight.
 *
 * `excludePaymentIntentId` is the payment being fulfilled right now — its own
 * hold must not count against it, or a booking would block itself.
 *
 * A hold with no readable expiry is ignored rather than honoured: holding a
 * seat forever because a timestamp could not be parsed is worse than releasing
 * one early.
 */
function activeHoldSeats({ holds, now, excludePaymentIntentId = null }) {
  const currentMillis = now instanceof Date ? now.getTime() : Number(now);
  const list = Array.isArray(holds) ? holds : [];

  return list.reduce((total, hold) => {
    if (!hold) return total;
    if (hold.paymentIntentId && hold.paymentIntentId === excludePaymentIntentId) {
      return total;
    }
    const expiry = holdExpiryMillis(hold);
    if (expiry === null || expiry <= currentMillis) return total;

    const seats = Number.isInteger(hold.studentCount) ? hold.studentCount : 0;
    return total + Math.max(seats, 0);
  }, 0);
}

/**
 * The capacity a booking may actually use, once holds are taken out.
 *
 * Never returns more than the real capacity, and never less than zero.
 */
function capacityAfterHolds({ capacity, holds, now, excludePaymentIntentId = null }) {
  const seats = Number.isFinite(capacity) ? Math.max(capacity, 0) : 0;
  const held = activeHoldSeats({ holds, now, excludePaymentIntentId });
  return Math.max(seats - held, 0);
}

module.exports = {
  HOLD_COLLECTION,
  HOLD_TTL_MS,
  activeHoldSeats,
  capacityAfterHolds,
};
