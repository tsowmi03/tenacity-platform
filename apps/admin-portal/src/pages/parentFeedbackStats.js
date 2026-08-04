/**
 * Aggregations behind the parent feedback page.
 *
 * Kept separate from the page so the arithmetic - which is what anyone will
 * question when a number looks wrong - can be read and tested on its own.
 */

import {
  ALL_STATEMENTS,
  APP_BARRIER_OPTIONS,
  APP_USAGE_OPTIONS,
  RATING_OPTIONS,
  SATISFACTION_OPTIONS,
} from "../backend/parentSurvey";

/** Mean of the finite numbers in a list, or null when there are none. */
export function average(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

/**
 * Net Promoter Score: promoters (9-10) minus detractors (0-6), as a percentage
 * of everyone who answered. Passives (7-8) count towards the denominator only.
 */
export function netPromoterScore(responses) {
  const scores = responses
    .map((response) => response.recommendation)
    .filter((score) => Number.isFinite(score));

  if (!scores.length) {
    return { score: null, promoters: 0, passives: 0, detractors: 0, answered: 0 };
  }

  const promoters = scores.filter((score) => score >= 9).length;
  const passives = scores.filter((score) => score >= 7 && score <= 8).length;
  const detractors = scores.filter((score) => score <= 6).length;

  return {
    score: Math.round(((promoters - detractors) / scores.length) * 100),
    promoters,
    passives,
    detractors,
    answered: scores.length,
  };
}

/**
 * Counts per option, in the order the options are declared, so a value nobody
 * picked still shows as a zero row rather than disappearing from the chart.
 */
export function distribution(responses, options, getValue) {
  const counts = new Map(options.map((option) => [String(option.code), 0]));
  let answered = 0;

  responses.forEach((response) => {
    const value = String(getValue(response) ?? "");
    if (!counts.has(value)) return;
    counts.set(value, counts.get(value) + 1);
    answered += 1;
  });

  return options.map((option) => {
    const count = counts.get(String(option.code)) || 0;
    return {
      code: option.code,
      label: option.label,
      count,
      share: answered ? count / answered : 0,
    };
  });
}

export function satisfactionDistribution(responses) {
  return distribution(
    responses,
    SATISFACTION_OPTIONS,
    (response) => response.overallSatisfaction
  );
}

export function appUsageDistribution(responses) {
  return distribution(responses, APP_USAGE_OPTIONS, (response) => response.app?.usage);
}

/** Barriers, over the parents who said they have never used the app. */
export function appBarrierDistribution(responses) {
  const nonUsers = responses.filter((response) => response.app?.usage === "never");
  return distribution(nonUsers, APP_BARRIER_OPTIONS, (response) => response.app?.barrier);
}

/**
 * Per-statement scores across the lesson and communication sections.
 *
 * "Not sure" is excluded from the average rather than scored as a middle value:
 * a parent who has not seen something is not neutral about it. It is reported
 * separately so a statement most parents could not judge is visible as such.
 */
export function statementScores(responses) {
  return ALL_STATEMENTS.map((statement) => {
    const section = statement.section === "Lessons" ? "lessons" : "communication";
    const values = responses
      .map((response) => response[section]?.[statement.id])
      .filter((value) => value !== undefined && value !== null);

    const numeric = values.filter((value) => Number.isFinite(value));
    const notSure = values.filter((value) => value === "not_sure").length;

    return {
      id: statement.id,
      text: statement.text,
      section: statement.section,
      average: average(numeric),
      answered: numeric.length,
      notSure,
      // Anything below "Agree" is a parent we have not convinced.
      belowAgree: numeric.filter((value) => value <= 3).length,
    };
  });
}

/** Counts of each rating value for one statement, for a stacked breakdown. */
export function statementBreakdown(responses, statementId) {
  const statement = ALL_STATEMENTS.find((entry) => entry.id === statementId);
  if (!statement) return [];
  const section = statement.section === "Lessons" ? "lessons" : "communication";
  return distribution(
    responses,
    RATING_OPTIONS,
    (response) => response[section]?.[statementId]
  );
}

/**
 * Every free-text answer as its own card-sized entry.
 *
 * Both written questions are flattened into one list so the page can show what
 * parents actually wrote in one place, tagged by which question it answered.
 */
export function writtenAnswers(responses) {
  const entries = [];

  responses.forEach((response) => {
    const shared = {
      responseId: response.id,
      createdAtIso: response.createdAtIso,
      studentYear: response.context?.studentYear || "",
      recommendation: response.recommendation,
      followUpRequested: response.followUp?.requested === true,
    };

    if (response.comments?.strengths?.trim()) {
      entries.push({
        ...shared,
        key: `${response.id}-strengths`,
        kind: "strengths",
        question: "Doing well",
        text: response.comments.strengths.trim(),
      });
    }
    if (response.comments?.change?.trim()) {
      entries.push({
        ...shared,
        key: `${response.id}-change`,
        kind: "change",
        question: "One change",
        text: response.comments.change.trim(),
      });
    }
    if (response.app?.improvement?.trim()) {
      entries.push({
        ...shared,
        key: `${response.id}-app`,
        kind: "app",
        question: "App idea",
        text: response.app.improvement.trim(),
      });
    }
    if (response.app?.otherBarrier?.trim()) {
      entries.push({
        ...shared,
        key: `${response.id}-barrier`,
        kind: "app",
        question: "App barrier",
        text: response.app.otherBarrier.trim(),
      });
    }
  });

  return entries;
}

/** Headline figures for the stat row. */
export function headlineStats(responses) {
  const nps = netPromoterScore(responses);
  const appUsers = responses.filter(
    (response) => response.app?.usage && response.app.usage !== "never"
  );

  return {
    total: responses.length,
    satisfaction: average(responses.map((response) => response.overallSatisfaction)),
    nps,
    appUsefulness: average(appUsers.map((response) => response.app?.usefulness)),
    appUserCount: appUsers.length,
    followUps: responses.filter((response) => response.followUp?.requested === true)
      .length,
  };
}
