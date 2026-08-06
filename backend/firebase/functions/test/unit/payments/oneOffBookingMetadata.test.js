"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  BOOKING_METADATA_VERSION,
  BookingMetadataError,
  bookingAmountCents,
  decodeBookingMetadata,
  encodeBookingMetadata,
} = require("../../../src/payments/oneOffBookingMetadata");

const BOOKING = {
  classId: "class-abc",
  attendanceDocId: "2026-08-10",
  studentIds: ["student-1", "student-2"],
  unitPriceCents: 7000,
};

describe("encodeBookingMetadata", () => {
  it("writes flat strings, as Stripe metadata requires", () => {
    const encoded = encodeBookingMetadata(BOOKING);

    assert.deepEqual(encoded, {
      bookingVersion: "1",
      bookingClassId: "class-abc",
      bookingAttendanceId: "2026-08-10",
      bookingStudentIds: "student-1,student-2",
      bookingUnitPriceCents: "7000",
    });
    for (const value of Object.values(encoded)) {
      assert.equal(typeof value, "string");
    }
  });

  it("stays well inside Stripe's per-key limits", () => {
    const encoded = encodeBookingMetadata(BOOKING);
    for (const [key, value] of Object.entries(encoded)) {
      assert.ok(key.length <= 40, `${key} is within the 40-character key limit`);
      assert.ok(value.length <= 500, `${key} is within the 500-character limit`);
    }
  });

  it("refuses a group too large to encode, before any money moves", () => {
    const studentIds = Array.from({ length: 40 }, (_, i) => `student-${i}-aaaaaaaaaaaaaaa`);
    assert.throws(
      () => encodeBookingMetadata({ ...BOOKING, studentIds }),
      (err) => err instanceof BookingMetadataError && err.field === "studentIds"
    );
  });

  it("refuses a booking it could not describe", () => {
    const cases = [
      { ...BOOKING, classId: "" },
      { ...BOOKING, attendanceDocId: "  " },
      { ...BOOKING, studentIds: [] },
      { ...BOOKING, studentIds: ["student-1", ""] },
      { ...BOOKING, studentIds: ["student-1", "student-1"] },
      { ...BOOKING, unitPriceCents: 0 },
      { ...BOOKING, unitPriceCents: -100 },
      { ...BOOKING, unitPriceCents: 70.5 },
    ];
    for (const input of cases) {
      assert.throws(
        () => encodeBookingMetadata(input),
        BookingMetadataError,
        `${JSON.stringify(input)} should not encode`
      );
    }
  });
});

describe("decodeBookingMetadata", () => {
  it("round-trips a booking", () => {
    assert.deepEqual(decodeBookingMetadata(encodeBookingMetadata(BOOKING)), {
      classId: "class-abc",
      attendanceDocId: "2026-08-10",
      studentIds: ["student-1", "student-2"],
      unitPriceCents: 7000,
    });
  });

  it("returns null for a payment from an app build without booking context", () => {
    // The compatibility hinge: old builds keep working, on the old path.
    const legacy = {
      parentId: "parent-1",
      invoiceIds: "",
      paymentType: "one_off_booking",
      source: "tenacity_tutoring",
    };
    assert.equal(decodeBookingMetadata(legacy), null);
  });

  it("returns null rather than guessing at damaged metadata", () => {
    const good = encodeBookingMetadata(BOOKING);
    const cases = [
      { ...good, bookingClassId: "" },
      { ...good, bookingAttendanceId: "" },
      { ...good, bookingStudentIds: "" },
      { ...good, bookingStudentIds: ",,," },
      { ...good, bookingUnitPriceCents: "nonsense" },
      { ...good, bookingUnitPriceCents: "0" },
      { ...good, bookingVersion: "2" },
      {},
      null,
      undefined,
    ];
    for (const metadata of cases) {
      assert.equal(
        decodeBookingMetadata(metadata),
        null,
        `${JSON.stringify(metadata)} should not decode`
      );
    }
  });

  it("only understands the version it was written for", () => {
    assert.equal(BOOKING_METADATA_VERSION, "1");
  });
});

describe("bookingAmountCents", () => {
  it("prices a booking from the server's own numbers", () => {
    assert.equal(bookingAmountCents({ unitPriceCents: 7000, studentCount: 1 }), 7000);
    assert.equal(bookingAmountCents({ unitPriceCents: 7000, studentCount: 3 }), 21000);
  });

  it("refuses to price nonsense rather than charging it", () => {
    const cases = [
      { unitPriceCents: 0, studentCount: 1 },
      { unitPriceCents: 7000, studentCount: 0 },
      { unitPriceCents: -7000, studentCount: 1 },
      { unitPriceCents: 70.5, studentCount: 1 },
    ];
    for (const input of cases) {
      assert.throws(() => bookingAmountCents(input), BookingMetadataError);
    }
  });
});
