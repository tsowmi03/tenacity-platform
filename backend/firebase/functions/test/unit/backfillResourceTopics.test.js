"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { planJobTopicsBackfill } = require("../../scripts/backfillResourceTopics");

function completedJob(extra = {}) {
  return {
    status: "complete",
    generatedJson: JSON.stringify({
      title: "Year 10 Practice Paper",
      subject: "maths",
      year: 10,
      topics: ["Quadratics", "Indices"],
    }),
    ...extra,
  };
}

describe("planJobTopicsBackfill", () => {
  it("derives normalised topics from generatedJson", () => {
    const plan = planJobTopicsBackfill(completedJob());
    assert.equal(plan.eligible, true);
    assert.equal(plan.reason, "derived");
    assert.deepEqual(plan.extractedTopics, ["quadratic equations", "indices"]);
  });

  it("skips jobs that are not complete", () => {
    assert.equal(planJobTopicsBackfill({ status: "pending" }).eligible, false);
    assert.equal(planJobTopicsBackfill({ status: "failed" }).reason, "not-complete");
  });

  it("skips jobs that already have extractedTopics unless forced", () => {
    const job = completedJob({ extractedTopics: ["surds"] });
    assert.equal(planJobTopicsBackfill(job).eligible, false);
    assert.equal(planJobTopicsBackfill(job).reason, "already-set");

    const forced = planJobTopicsBackfill(job, { force: true });
    assert.equal(forced.eligible, true);
    assert.deepEqual(forced.extractedTopics, ["quadratic equations", "indices"]);
  });

  it("reprocesses an empty extractedTopics array (field present but blank)", () => {
    // An empty array still counts as 'already-set' — a prior backfill ran.
    const job = completedJob({ extractedTopics: [] });
    assert.equal(planJobTopicsBackfill(job).eligible, false);
    assert.equal(planJobTopicsBackfill(job, { force: true }).reason, "derived");
  });

  it("handles a single topic string schema (worksheet/topic-booklet/custom)", () => {
    const job = {
      status: "complete",
      generatedJson: JSON.stringify({ title: "Trig worksheet", topic: "Trigonometry" }),
    };
    assert.deepEqual(planJobTopicsBackfill(job).extractedTopics, ["trigonometry"]);
  });

  it("falls back to [] when generatedJson is missing", () => {
    const plan = planJobTopicsBackfill({ status: "complete", generatedJson: null });
    assert.equal(plan.eligible, true);
    assert.equal(plan.reason, "no-source");
    assert.deepEqual(plan.extractedTopics, []);
  });

  it("falls back to [] when generatedJson is not parseable JSON", () => {
    const plan = planJobTopicsBackfill({
      status: "complete",
      generatedJson: "Sorry, here is your paper: (not json)",
    });
    assert.equal(plan.eligible, true);
    assert.equal(plan.reason, "parse-failed");
    assert.deepEqual(plan.extractedTopics, []);
  });

  it("tolerates code-fenced generatedJson", () => {
    const plan = planJobTopicsBackfill({
      status: "complete",
      generatedJson: '```json\n{ "title": "x", "topics": ["Logs"] }\n```',
    });
    assert.deepEqual(plan.extractedTopics, ["logarithms"]);
  });
});
