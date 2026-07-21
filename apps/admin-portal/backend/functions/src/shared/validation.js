"use strict";

/**
 * Minimal validation primitives. Each `assertX(value, field)` throws a
 * `ValidationError` with a stable shape so callers can map it onto an
 * HttpsError("invalid-argument", ...) at the function boundary.
 *
 * `validateShape(input, validators)` runs many `assertX` calls and aggregates
 * the failures so the caller sees every problem at once instead of fixing them
 * one at a time. The returned `value` is the normalised input (trimmed strings,
 * lowercased emails, deduped arrays).
 */

class ValidationError extends Error {
  constructor(message, { field, code = "invalid-argument", issues } = {}) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
    this.field = field;
    this.issues = issues;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertString(value, field, { min = 1, max = 1000, trim = true } = {}) {
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`, { field });
  }
  const normalised = trim ? value.trim() : value;
  if (normalised.length < min) {
    throw new ValidationError(`${field} must be at least ${min} characters`, {
      field,
    });
  }
  if (normalised.length > max) {
    throw new ValidationError(`${field} must be at most ${max} characters`, {
      field,
    });
  }
  return normalised;
}

function assertOptionalString(value, field, opts = {}) {
  if (value === undefined || value === null || value === "") return undefined;
  return assertString(value, field, opts);
}

function assertEmail(value, field = "email") {
  const trimmed = assertString(value, field, { min: 3, max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(trimmed)) {
    throw new ValidationError(`${field} must be a valid email address`, {
      field,
    });
  }
  return trimmed;
}

function assertEnum(value, field, allowed) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new ValidationError(
      `${field} must be one of: ${allowed.join(", ")}`,
      { field }
    );
  }
  return value;
}

function assertNumber(value, field, { min, max, integer = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a finite number`, { field });
  }
  if (integer && !Number.isInteger(value)) {
    throw new ValidationError(`${field} must be an integer`, { field });
  }
  if (min !== undefined && value < min) {
    throw new ValidationError(`${field} must be >= ${min}`, { field });
  }
  if (max !== undefined && value > max) {
    throw new ValidationError(`${field} must be <= ${max}`, { field });
  }
  return value;
}

function assertBoolean(value, field) {
  if (typeof value !== "boolean") {
    throw new ValidationError(`${field} must be a boolean`, { field });
  }
  return value;
}

function assertArray(value, field, { itemAssert, unique = false, min = 0, max } = {}) {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${field} must be an array`, { field });
  }
  if (value.length < min) {
    throw new ValidationError(`${field} must have at least ${min} items`, {
      field,
    });
  }
  if (max !== undefined && value.length > max) {
    throw new ValidationError(`${field} must have at most ${max} items`, {
      field,
    });
  }

  const out = itemAssert
    ? value.map((item, i) => itemAssert(item, `${field}[${i}]`))
    : value.slice();

  if (unique) {
    const seen = new Set();
    for (const item of out) {
      const key = typeof item === "string" ? item : JSON.stringify(item);
      if (seen.has(key)) {
        throw new ValidationError(`${field} must not contain duplicates`, {
          field,
        });
      }
      seen.add(key);
    }
  }
  return out;
}

// HH:mm 24h, e.g., "09:30" or "17:00".
function assertHHmm(value, field) {
  const s = assertString(value, field, { min: 4, max: 5 });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) {
    throw new ValidationError(`${field} must be HH:mm (24h)`, { field });
  }
  return s;
}

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function assertDayOfWeek(value, field = "day") {
  return assertEnum(value, field, DAYS_OF_WEEK);
}

/**
 * Run several assertions and collect every failure before throwing.
 *
 * Example:
 *   validateShape(input, {
 *     firstName: (v) => assertString(v, "firstName", { max: 80 }),
 *     email:     (v) => assertEmail(v),
 *   });
 *
 * The validator function receives the value at `input[field]`. It should
 * return the normalised value, which is written back into the result.
 */
function validateShape(input, validators) {
  if (!isPlainObject(input)) {
    throw new ValidationError("input must be an object", { field: "<root>" });
  }
  const out = {};
  const issues = [];
  for (const [field, fn] of Object.entries(validators)) {
    try {
      const result = fn(input[field]);
      if (result !== undefined) out[field] = result;
    } catch (err) {
      if (err instanceof ValidationError) {
        issues.push({ field: err.field || field, message: err.message });
      } else {
        throw err;
      }
    }
  }
  if (issues.length) {
    throw new ValidationError(
      `validation failed: ${issues.map((i) => i.message).join("; ")}`,
      { field: "<root>", issues }
    );
  }
  return out;
}

module.exports = {
  ValidationError,
  isPlainObject,
  assertString,
  assertOptionalString,
  assertEmail,
  assertEnum,
  assertNumber,
  assertBoolean,
  assertArray,
  assertHHmm,
  assertDayOfWeek,
  validateShape,
  DAYS_OF_WEEK,
};
