import { describe, expect, it } from "vitest";
import {
  appBarrierDistribution,
  average,
  headlineStats,
  netPromoterScore,
  satisfactionDistribution,
  statementScores,
  writtenAnswers,
} from "./parentFeedbackStats";

function response(overrides = {}) {
  return {
    id: "r1",
    createdAtIso: "2026-08-01T00:00:00.000Z",
    context: { studentYear: "years_9_10", subjects: ["maths"] },
    overallSatisfaction: 4,
    lessons: {
      comfortable_asking: 4,
      clear_explanations: 4,
      school_relevance: 4,
      individual_attention: 4,
    },
    communication: {
      progress_feedback: 4,
      easy_contact: 4,
      admin_clarity: 4,
    },
    app: {
      usage: "regularly",
      usefulness: 4,
      barrier: "",
      otherBarrier: "",
      improvement: "",
    },
    recommendation: 9,
    comments: { strengths: "", change: "" },
    followUp: { requested: false, name: "", email: "" },
    ...overrides,
  };
}

describe("average", () => {
  it("ignores values that are not finite numbers", () => {
    expect(average([4, null, 2, undefined, "not_sure"])).toBe(3);
  });

  it("returns null when nothing was answered", () => {
    expect(average([null, undefined])).toBeNull();
  });
});

describe("netPromoterScore", () => {
  it("scores promoters minus detractors over everyone who answered", () => {
    const rows = [
      response({ id: "a", recommendation: 10 }),
      response({ id: "b", recommendation: 9 }),
      response({ id: "c", recommendation: 8 }),
      response({ id: "d", recommendation: 3 }),
    ];

    // 2 promoters, 1 passive, 1 detractor over 4 answers => (2-1)/4 = 25.
    expect(netPromoterScore(rows)).toEqual({
      score: 25,
      promoters: 2,
      passives: 1,
      detractors: 1,
      answered: 4,
    });
  });

  it("counts a 7 or 8 towards the denominator but neither side", () => {
    const rows = [
      response({ id: "a", recommendation: 7 }),
      response({ id: "b", recommendation: 8 }),
    ];
    expect(netPromoterScore(rows).score).toBe(0);
  });

  it("returns a null score rather than zero when nobody answered", () => {
    expect(netPromoterScore([response({ recommendation: null })]).score).toBeNull();
  });
});

describe("satisfactionDistribution", () => {
  it("keeps unpicked options as zero rows so the scale stays complete", () => {
    const rows = [
      response({ id: "a", overallSatisfaction: 5 }),
      response({ id: "b", overallSatisfaction: 5 }),
      response({ id: "c", overallSatisfaction: 2 }),
    ];

    const result = satisfactionDistribution(rows);
    expect(result).toHaveLength(5);
    expect(result.map((entry) => entry.count)).toEqual([0, 1, 0, 0, 2]);
    expect(result[4].share).toBeCloseTo(2 / 3);
  });
});

describe("statementScores", () => {
  it("excludes 'not sure' from the average and reports it separately", () => {
    const rows = [
      response({ id: "a", lessons: { comfortable_asking: 2 } }),
      response({ id: "b", lessons: { comfortable_asking: 4 } }),
      response({ id: "c", lessons: { comfortable_asking: "not_sure" } }),
    ];

    const entry = statementScores(rows).find((s) => s.id === "comfortable_asking");
    expect(entry.average).toBe(3);
    expect(entry.answered).toBe(2);
    expect(entry.notSure).toBe(1);
  });

  it("counts anything below 'agree' as a parent we have not convinced", () => {
    const rows = [
      response({ id: "a", lessons: { clear_explanations: 3 } }),
      response({ id: "b", lessons: { clear_explanations: 1 } }),
      response({ id: "c", lessons: { clear_explanations: 5 } }),
    ];

    const entry = statementScores(rows).find((s) => s.id === "clear_explanations");
    expect(entry.belowAgree).toBe(2);
  });

  it("returns a null average for a statement nobody could judge", () => {
    const rows = [response({ id: "a", lessons: { school_relevance: "not_sure" } })];
    const entry = statementScores(rows).find((s) => s.id === "school_relevance");
    expect(entry.average).toBeNull();
    expect(entry.notSure).toBe(1);
  });
});

describe("appBarrierDistribution", () => {
  it("only counts parents who said they have never used the app", () => {
    const rows = [
      response({ id: "a", app: { usage: "never", barrier: "unaware" } }),
      response({ id: "b", app: { usage: "never", barrier: "unaware" } }),
      response({ id: "c", app: { usage: "regularly", barrier: "sign_in" } }),
    ];

    const result = appBarrierDistribution(rows);
    expect(result.find((entry) => entry.code === "unaware").count).toBe(2);
    expect(result.find((entry) => entry.code === "sign_in").count).toBe(0);
  });
});

describe("writtenAnswers", () => {
  it("flattens every free-text field into its own tagged entry", () => {
    const rows = [
      response({
        id: "a",
        comments: { strengths: " Great tutors ", change: "More feedback" },
        app: { usage: "regularly", usefulness: 4, improvement: "Faster login" },
      }),
      response({ id: "b", comments: { strengths: "", change: "" } }),
    ];

    const entries = writtenAnswers(rows);
    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.kind)).toEqual(["strengths", "change", "app"]);
    // Whitespace-only answers are dropped, and the rest are trimmed.
    expect(entries[0].text).toBe("Great tutors");
  });
});

describe("headlineStats", () => {
  it("averages app usefulness over app users only", () => {
    const rows = [
      response({ id: "a", app: { usage: "regularly", usefulness: 5 } }),
      response({ id: "b", app: { usage: "never", usefulness: null, barrier: "no_need" } }),
    ];

    const stats = headlineStats(rows);
    expect(stats.total).toBe(2);
    expect(stats.appUserCount).toBe(1);
    expect(stats.appUsefulness).toBe(5);
  });

  it("counts follow-up requests", () => {
    const rows = [
      response({ id: "a", followUp: { requested: true, name: "Pat", email: "p@x.com" } }),
      response({ id: "b" }),
    ];
    expect(headlineStats(rows).followUps).toBe(1);
  });
});
