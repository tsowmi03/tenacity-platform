"use strict";

const {
  ValidationError,
  assertString,
  assertOptionalString,
  assertNumber,
  assertEnum,
  assertArray,
  validateShape,
} = require("../shared/validation");
const { DateTime } = require("luxon");
const { createdMeta, fromDate } = require("../shared/timestamps");

const SYDNEY_TZ = "Australia/Sydney";
const TERM_STATUSES = ["upcoming", "active", "completed"];

/**
 * The portal writes the app-readable shape used by Flutter `Term.fromMap`:
 * `year`, `termNum`, `weeksNum`, `status`, `startDate`, and `endDate`.
 *
 * The normaliser still accepts legacy `termNumber` / `totalWeeks` / `isActive`
 * because older documents may exist in Firestore.
 */
function normaliseTermDoc(raw, id = "<unknown>") {
  if (!raw || typeof raw !== "object") {
    throw new ValidationError("term data must be an object", { field: id });
  }

  const year = assertString(raw.year, `${id}.year`, { max: 10 });

  const termNumRaw = raw.termNum ?? raw.termNumber;
  const termNum = assertNumber(termNumRaw, `${id}.termNum|termNumber`, {
    min: 1,
    max: 4,
    integer: true,
  });

  const weeksNumRaw = raw.weeksNum ?? raw.totalWeeks;
  const weeksNum = assertNumber(weeksNumRaw, `${id}.weeksNum|totalWeeks`, {
    min: 1,
    max: 20,
    integer: true,
  });

  let active;
  if (typeof raw.status === "string") {
    active = raw.status === "active";
  } else if (typeof raw.isActive === "boolean") {
    active = raw.isActive;
  } else if (typeof raw.status === "boolean") {
    active = raw.status;
  } else {
    active = false;
  }

  const startDate = toDate(raw.startDate, `${id}.startDate`);
  const endDate = toDate(raw.endDate, `${id}.endDate`);

  return {
    id,
    year,
    termNum,
    weeksNum,
    active,
    startDate,
    endDate,
  };
}

function assertYear(value, field = "year") {
  const raw =
    typeof value === "number" && Number.isInteger(value) ? String(value) : value;
  const year = assertString(raw, field, { min: 4, max: 4 });
  if (!/^\d{4}$/.test(year)) {
    throw new ValidationError(`${field} must be a 4-digit year`, { field });
  }
  return year;
}

function assertTermStatus(value, field = "status") {
  return assertEnum(value, field, TERM_STATUSES);
}

function parseDateOnly(value, field, { endOfDay = false } = {}) {
  const text = assertString(value, field, { min: 10, max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new ValidationError(`${field} must be YYYY-MM-DD`, { field });
  }
  const dt = DateTime.fromISO(text, { zone: SYDNEY_TZ });
  if (!dt.isValid) {
    throw new ValidationError(`${field} must be a valid calendar date`, {
      field,
    });
  }
  return (endOfDay ? dt.endOf("day") : dt.startOf("day")).toJSDate();
}

function dateOnlyString(date, field) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new ValidationError(`${field} must be a valid Date`, { field });
  }
  return DateTime.fromJSDate(date, { zone: SYDNEY_TZ }).toISODate();
}

function validateCreateTermInput(input, defaultYear) {
  const out = validateShape(input || {}, {
    id: (v) => assertOptionalString(v, "id", { max: 80 }),
    year: (v) => (v === undefined ? defaultYear : assertYear(v, "year")),
    termNum: (v) =>
      assertNumber(v, "termNum", { min: 1, max: 4, integer: true }),
    weeksNum: (v) =>
      assertNumber(v, "weeksNum", { min: 1, max: 20, integer: true }),
    status: (v) => (v === undefined ? "upcoming" : assertTermStatus(v)),
    startDate: (v) => parseDateOnly(v, "startDate"),
    endDate: (v) => parseDateOnly(v, "endDate", { endOfDay: true }),
  });

  if (out.year !== defaultYear) {
    throw new ValidationError("term year must match payload year", {
      field: "terms[].year",
    });
  }
  assertStartBeforeEnd(out.startDate, out.endDate);
  return out;
}

function validateCreateTermsForYearPayload(input) {
  const base = validateShape(input || {}, {
    year: (v) => assertYear(v),
    terms: (v) =>
      assertArray(v, "terms", {
        min: 1,
        max: 4,
        itemAssert: (item) => item,
      }),
  });
  const terms = base.terms.map((term) => validateCreateTermInput(term, base.year));
  validateTermSet(terms);
  return { year: base.year, terms };
}

function validateUpdateTermPayload(input) {
  const { termId } = validateShape(input || {}, {
    termId: (v) => assertString(v, "termId", { max: 80 }),
  });
  const updates = validateShape((input || {}).updates || {}, {
    startDate: (v) =>
      v === undefined ? undefined : parseDateOnly(v, "updates.startDate"),
    endDate: (v) =>
      v === undefined
        ? undefined
        : parseDateOnly(v, "updates.endDate", { endOfDay: true }),
    weeksNum: (v) =>
      v === undefined
        ? undefined
        : assertNumber(v, "updates.weeksNum", {
            min: 1,
            max: 20,
            integer: true,
          }),
    status: (v) =>
      v === undefined ? undefined : assertTermStatus(v, "updates.status"),
  });
  if (Object.keys(updates).length === 0) {
    throw new ValidationError("At least one term update field is required", {
      field: "updates",
    });
  }
  if (updates.startDate && updates.endDate) {
    assertStartBeforeEnd(updates.startDate, updates.endDate);
  }
  return { termId, updates };
}

function validateTermSet(terms) {
  const seenNumbers = new Set();
  const seenIds = new Set();
  let activeCount = 0;
  const sorted = [...terms].sort((a, b) => a.startDate - b.startDate);

  terms.forEach((term) => {
    if (seenNumbers.has(term.termNum)) {
      throw new ValidationError("terms must not repeat termNum", {
        field: "terms",
      });
    }
    seenNumbers.add(term.termNum);

    const id = term.id || termIdFor(term.year, term.termNum);
    if (seenIds.has(id)) {
      throw new ValidationError("terms must not repeat id", { field: "terms" });
    }
    seenIds.add(id);

    if (term.status === "active") activeCount += 1;
  });

  if (activeCount > 1) {
    throw new ValidationError("only one created term can be active", {
      field: "terms",
    });
  }

  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].startDate <= sorted[i - 1].endDate) {
      throw new ValidationError("term date ranges must not overlap", {
        field: "terms",
      });
    }
  }
}

function assertStartBeforeEnd(startDate, endDate) {
  if (startDate >= endDate) {
    throw new ValidationError("endDate must be after startDate", {
      field: "endDate",
    });
  }
}

function termIdFor(year, termNum) {
  return `${year}_T${termNum}`;
}

function buildTermDoc(term, { actorUid, clock }) {
  if (!actorUid) throw new TypeError("buildTermDoc requires actorUid");
  return {
    year: term.year,
    termNum: term.termNum,
    weeksNum: term.weeksNum,
    status: term.status,
    startDate: fromDate(term.startDate),
    endDate: fromDate(term.endDate),
    ...createdMeta(actorUid, clock),
  };
}

function termSummaryFromDoc(id, data) {
  const normalised = normaliseTermDoc(data, id);
  return {
    id,
    year: normalised.year,
    termNum: normalised.termNum,
    weeksNum: normalised.weeksNum,
    status: data.status || (normalised.active ? "active" : "upcoming"),
    startDate: dateOnlyString(normalised.startDate, `${id}.startDate`),
    endDate: dateOnlyString(normalised.endDate, `${id}.endDate`),
  };
}

function toDate(v, field) {
  if (v && typeof v.toDate === "function") return v.toDate();
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  throw new ValidationError(`${field} must be a Timestamp or Date`, { field });
}

module.exports = {
  SYDNEY_TZ,
  TERM_STATUSES,
  normaliseTermDoc,
  validateCreateTermsForYearPayload,
  validateUpdateTermPayload,
  termIdFor,
  buildTermDoc,
  termSummaryFromDoc,
};
