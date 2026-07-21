"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  ValidationError,
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
} = require("../../src/shared/validation");

describe("assertString", () => {
  it("trims by default and returns the normalised value", () => {
    assert.equal(assertString("  hello  ", "x"), "hello");
  });
  it("rejects non-strings", () => {
    assert.throws(() => assertString(42, "x"), ValidationError);
  });
  it("respects min/max", () => {
    assert.throws(() => assertString("a", "x", { min: 2 }), /at least 2/);
    assert.throws(() => assertString("abc", "x", { max: 2 }), /at most 2/);
  });
  it("rejects whitespace-only when trim+min>=1", () => {
    assert.throws(() => assertString("   ", "x"), /at least 1/);
  });
});

describe("assertOptionalString", () => {
  it("returns undefined for empty/null/undefined", () => {
    assert.equal(assertOptionalString(undefined, "x"), undefined);
    assert.equal(assertOptionalString(null, "x"), undefined);
    assert.equal(assertOptionalString("", "x"), undefined);
  });
  it("validates when present", () => {
    assert.equal(assertOptionalString("  hi ", "x"), "hi");
  });
});

describe("assertEmail", () => {
  it("lowercases and trims valid emails", () => {
    assert.equal(assertEmail(" Foo@Example.COM "), "foo@example.com");
  });
  it("rejects malformed emails", () => {
    assert.throws(() => assertEmail("not-an-email"), ValidationError);
    assert.throws(() => assertEmail("a@b"), ValidationError);
  });
});

describe("assertEnum", () => {
  it("accepts allowed values", () => {
    assert.equal(assertEnum("admin", "role", ["admin", "parent"]), "admin");
  });
  it("rejects others", () => {
    assert.throws(
      () => assertEnum("hacker", "role", ["admin", "parent"]),
      /must be one of/
    );
  });
});

describe("assertNumber", () => {
  it("accepts finite numbers", () => {
    assert.equal(assertNumber(5, "x"), 5);
  });
  it("rejects NaN and Infinity", () => {
    assert.throws(() => assertNumber(NaN, "x"), ValidationError);
    assert.throws(() => assertNumber(Infinity, "x"), ValidationError);
  });
  it("respects integer/min/max", () => {
    assert.throws(() => assertNumber(1.5, "x", { integer: true }), /integer/);
    assert.throws(() => assertNumber(-1, "x", { min: 0 }), />= 0/);
    assert.throws(() => assertNumber(11, "x", { max: 10 }), /<= 10/);
  });
});

describe("assertBoolean", () => {
  it("accepts booleans only", () => {
    assert.equal(assertBoolean(true, "x"), true);
    assert.throws(() => assertBoolean("true", "x"), ValidationError);
  });
});

describe("assertArray", () => {
  it("returns a copy", () => {
    const input = [1, 2, 3];
    const out = assertArray(input, "x");
    assert.deepEqual(out, input);
    assert.notEqual(out, input);
  });
  it("applies itemAssert", () => {
    const out = assertArray([" a ", " b "], "x", {
      itemAssert: (v, f) => assertString(v, f),
    });
    assert.deepEqual(out, ["a", "b"]);
  });
  it("enforces uniqueness", () => {
    assert.throws(
      () => assertArray(["a", "a"], "x", { unique: true }),
      /duplicates/
    );
  });
  it("enforces min/max length", () => {
    assert.throws(() => assertArray([], "x", { min: 1 }), /at least 1/);
    assert.throws(() => assertArray([1, 2, 3], "x", { max: 2 }), /at most 2/);
  });
});

describe("assertHHmm", () => {
  it("accepts valid times", () => {
    assert.equal(assertHHmm("09:30", "t"), "09:30");
    assert.equal(assertHHmm("00:00", "t"), "00:00");
    assert.equal(assertHHmm("23:59", "t"), "23:59");
  });
  it("rejects invalid times", () => {
    assert.throws(() => assertHHmm("24:00", "t"), ValidationError);
    assert.throws(() => assertHHmm("9:30", "t"), ValidationError);
    assert.throws(() => assertHHmm("9:3", "t"), ValidationError);
  });
});

describe("assertDayOfWeek", () => {
  it("accepts standard day names", () => {
    assert.equal(assertDayOfWeek("Monday"), "Monday");
  });
  it("rejects lowercase or shorthand", () => {
    assert.throws(() => assertDayOfWeek("monday"), ValidationError);
    assert.throws(() => assertDayOfWeek("Mon"), ValidationError);
  });
});

describe("validateShape", () => {
  it("returns normalised values", () => {
    const out = validateShape(
      { name: "  Tom  ", email: "T@Example.com" },
      {
        name: (v) => assertString(v, "name"),
        email: (v) => assertEmail(v),
      }
    );
    assert.deepEqual(out, { name: "Tom", email: "t@example.com" });
  });
  it("aggregates issues across all fields", () => {
    try {
      validateShape(
        { name: 42, email: "bad" },
        {
          name: (v) => assertString(v, "name"),
          email: (v) => assertEmail(v),
        }
      );
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(err instanceof ValidationError);
      assert.equal(err.issues.length, 2);
      assert.deepEqual(
        err.issues.map((i) => i.field).sort(),
        ["email", "name"]
      );
    }
  });
  it("rejects non-object input", () => {
    assert.throws(() => validateShape(null, {}), ValidationError);
    assert.throws(() => validateShape([], {}), ValidationError);
  });
});
