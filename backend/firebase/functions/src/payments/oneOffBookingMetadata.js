"use strict";

/**
 * The booking a one-off payment is for, carried on the PaymentIntent.
 *
 * Before this existed, a one-off PaymentIntent recorded only the parent and the
 * amount. When the app failed between charging the card and writing the
 * enrolment — which is exactly what happened on 2026-08-06 — nothing anywhere
 * knew which class or which child the money had been for, so the booking could
 * not be completed by hand, let alone automatically.
 *
 * Stripe metadata is a flat string map: at most 50 keys, keys up to 40
 * characters, values up to 500. Student ids are comma-joined in the same style
 * `appInvoiceIds` already reads, rather than JSON, because the values are read
 * by humans in the Stripe dashboard and JSON wastes the budget.
 *
 * Pure, so the encoding and its limits can be tested without Stripe.
 */

/** The only version understood today. Absent means a pre-Phase-2 app build. */
const BOOKING_METADATA_VERSION = "1";

/**
 * Leaves room under Stripe's 500-character limit rather than filling it. A
 * booking that would overflow must be rejected before the card is charged, not
 * silently truncated into an unfulfillable payment.
 */
const MAX_STUDENT_IDS_LENGTH = 450;

class BookingMetadataError extends Error {
  constructor(message, { field } = {}) {
    super(message);
    this.name = "BookingMetadataError";
    this.field = field || null;
  }
}

function trimmedString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Encode a booking into Stripe metadata fields.
 *
 * Throws rather than returning a partial encoding: every caller is about to
 * take money, and a payment that cannot be traced back to a booking is the
 * failure this module exists to prevent.
 */
function encodeBookingMetadata({
  classId,
  attendanceDocId,
  studentIds,
  unitPriceCents,
}) {
  const classIdValue = trimmedString(classId);
  if (!classIdValue) {
    throw new BookingMetadataError("classId is required", { field: "classId" });
  }

  const attendanceValue = trimmedString(attendanceDocId);
  if (!attendanceValue) {
    throw new BookingMetadataError("attendanceDocId is required", {
      field: "attendanceDocId",
    });
  }

  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    throw new BookingMetadataError("at least one studentId is required", {
      field: "studentIds",
    });
  }

  const ids = studentIds.map(trimmedString);
  if (ids.some((id) => id === null)) {
    throw new BookingMetadataError("studentIds must all be non-empty", {
      field: "studentIds",
    });
  }
  if (new Set(ids).size !== ids.length) {
    throw new BookingMetadataError("studentIds must be unique", {
      field: "studentIds",
    });
  }

  const joined = ids.join(",");
  if (joined.length > MAX_STUDENT_IDS_LENGTH) {
    throw new BookingMetadataError(
      `too many students for one payment (${ids.length}); book them in smaller groups`,
      { field: "studentIds" }
    );
  }

  if (
    !Number.isFinite(unitPriceCents) ||
    !Number.isInteger(unitPriceCents) ||
    unitPriceCents <= 0
  ) {
    throw new BookingMetadataError("unitPriceCents must be a positive integer", {
      field: "unitPriceCents",
    });
  }

  return {
    bookingVersion: BOOKING_METADATA_VERSION,
    bookingClassId: classIdValue,
    bookingAttendanceId: attendanceValue,
    bookingStudentIds: joined,
    bookingUnitPriceCents: String(unitPriceCents),
  };
}

/**
 * Read a booking back out of PaymentIntent metadata.
 *
 * Returns null for anything this version cannot act on — a payment from an app
 * build that predates the booking context, or metadata that has been damaged.
 * Null means "leave it to the old client-driven path", never "throw it away".
 */
function decodeBookingMetadata(metadata) {
  const meta = metadata || {};
  if (trimmedString(meta.bookingVersion) !== BOOKING_METADATA_VERSION) {
    return null;
  }

  const classId = trimmedString(meta.bookingClassId);
  const attendanceDocId = trimmedString(meta.bookingAttendanceId);
  const rawStudentIds = trimmedString(meta.bookingStudentIds);
  const unitPriceCents = Number.parseInt(meta.bookingUnitPriceCents, 10);

  if (!classId || !attendanceDocId || !rawStudentIds) return null;
  if (!Number.isFinite(unitPriceCents) || unitPriceCents <= 0) return null;

  const studentIds = rawStudentIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (studentIds.length === 0) return null;

  return { classId, attendanceDocId, studentIds, unitPriceCents };
}

/**
 * What a booking should cost, computed rather than taken from the client.
 *
 * `createPaymentIntent` previously accepted whatever `amount` the app sent on
 * the one-off path, checking only that it was a positive number — so a modified
 * client could book a $70 class for 50c. The server owns this now.
 */
function bookingAmountCents({ unitPriceCents, studentCount }) {
  if (
    !Number.isInteger(unitPriceCents) ||
    unitPriceCents <= 0 ||
    !Number.isInteger(studentCount) ||
    studentCount <= 0
  ) {
    throw new BookingMetadataError(
      "cannot price a booking without a positive unit price and student count"
    );
  }
  return unitPriceCents * studentCount;
}

module.exports = {
  BOOKING_METADATA_VERSION,
  BookingMetadataError,
  MAX_STUDENT_IDS_LENGTH,
  bookingAmountCents,
  decodeBookingMetadata,
  encodeBookingMetadata,
};
