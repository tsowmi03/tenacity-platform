"use strict";

// RES-73. What the portal shows while a resource generates: a bar, five plain
// steps and an ETA.
//
// The ETA comes from two things:
//  1. History. Every completed resource adds its active time and question count
//     to a running linear fit (time = a + b × questions) for its kind, plus how
//     that time split across the five steps. That gives an expected total
//     before the first stage has run.
//  2. This run's pace. As steps finish, the time actually taken is compared
//     with what history expected for the same share of the work, and the
//     remainder is stretched or shrunk by that ratio. The pace counts more the
//     further through the run it is.
// Times are "active" time: the worker's own running time, not time spent
// waiting in the tutor's queue. Wall-clock pace (which includes the short gaps
// between worker invocations, and any interleaving with the tutor's other
// jobs) is what the pace ratio measures, so those gaps still show in the ETA.

const PHASES = [
  { key: "plan", label: "Planning the paper" },
  { key: "write", label: "Writing questions" },
  { key: "diagrams", label: "Drawing diagrams" },
  { key: "check", label: "Checking quality" },
  { key: "finish", label: "Building the PDF" },
];
const PHASE_KEYS = PHASES.map((p) => p.key);
const STATS_COLLECTION = "resourceTimingStats";
const MIN_SAMPLES = 3;
const SHARE_ALPHA = 0.2;
// Used only until history exists (the RES-73 backfill seeds it from past runs).
const DEFAULT_FIT = { a: 60, b: 22 }; // seconds, seconds per question (Nov 2026 runs)
const DEFAULT_SHARES = { plan: 0.08, write: 0.55, diagrams: 0.15, check: 0.14, finish: 0.08 };
const DEFAULT_LOG_ERROR = 0.4;
const DEFAULT_QUESTIONS = 20;

function phaseIndex(key) {
  const i = PHASE_KEYS.indexOf(key);
  return i < 0 ? 1 : i;
}

// Explicit hints win; otherwise the stage id or label says which step it is.
function phaseForStage({ progressPhase, stageId = "", stageLabel = "" } = {}) {
  if (PHASE_KEYS.includes(progressPhase)) return progressPhase;
  if (/^plan\./.test(stageId)) return "plan";
  if (/^(questions|solutions)\./.test(stageId)) return "write";
  if (/^diagrams\./.test(stageId)) return "diagrams";
  if (/^(answers|content|math)\./.test(stageId)) return "check";
  if (/^(document|preview)/.test(stageId)) return "finish";
  if (/^Writing/i.test(stageLabel)) return "write";
  if (/^(Checking|Fixing)/i.test(stageLabel)) return "check";
  return null;
}

function kindKey(job = {}) {
  const answers = job.answerMode === "worked" ? "worked" : job.answerMode === "none" ? "none" : "answers";
  return [job.resourceType || "resource", job.subject || "any", answers].join(".").replace(/[^\w.-]/g, "_");
}

function emptyStats() {
  return { n: 0, sq: 0, st: 0, sqq: 0, sqt: 0, shares: null, logErrSq: 0, logErrN: 0 };
}

// Least squares on (questions, seconds). Falls back to a pure rate when every
// sample had the same question count, and to defaults with too little history.
function fitFromStats(stats) {
  if (!stats || stats.n < MIN_SAMPLES) return null;
  const { n, sq, st, sqq, sqt } = stats;
  const denom = n * sqq - sq * sq;
  if (denom > 1e-6) {
    const b = (n * sqt - sq * st) / denom;
    const a = (st - b * sq) / n;
    if (b >= 0 && a >= 0) return { a, b };
  }
  return sq > 0 ? { a: 0, b: st / sq } : { a: st / n, b: 0 };
}

function chooseStats(statsByKey = {}, job = {}) {
  const own = statsByKey[kindKey(job)];
  if (own?.n >= MIN_SAMPLES) return own;
  const all = statsByKey.all;
  return all?.n >= MIN_SAMPLES ? all : null;
}

function normalisedShares(stats) {
  const raw = { ...DEFAULT_SHARES, ...(stats?.shares || {}) };
  const total = PHASE_KEYS.reduce((sum, k) => sum + Math.max(0, raw[k] || 0), 0) || 1;
  return Object.fromEntries(PHASE_KEYS.map((k) => [k, Math.max(0, raw[k] || 0) / total]));
}

function expectedQuestions({ tracker = {}, stats, requested }) {
  if (tracker.questionCount > 0) return tracker.questionCount;
  if (requested > 0) return requested;
  if (stats?.n && stats.sq > 0) return stats.sq / stats.n;
  return DEFAULT_QUESTIONS;
}

/**
 * Pure. Returns what the portal draws:
 * { phase, fraction, remainingMs, lowMs, highMs, questionsDone, questionCount }
 *
 * activeMs  worker time spent on this run so far
 * wallMs    wall time since the run's first stage started
 * phaseStarts  { phase: activeMs at which that step began }
 */
function estimateProgress({ job = {}, statsByKey = {}, tracker = {}, activeMs = 0, wallMs = activeMs, phaseStarts = {}, requestedQuestions = null }) {
  const stats = chooseStats(statsByKey, job);
  const fit = fitFromStats(stats) || DEFAULT_FIT;
  const questions = expectedQuestions({ tracker, stats, requested: requestedQuestions });
  const expectedTotalMs = Math.max(30_000, (fit.a + fit.b * questions) * 1000);
  const shares = normalisedShares(stats);
  const phase = PHASE_KEYS.includes(tracker.phase) ? tracker.phase : "plan";
  const current = phaseIndex(phase);

  // Steps before the current one are done (a step this resource skipped, such
  // as diagrams on an English paper, counts as done once it is passed).
  let fraction = PHASE_KEYS.slice(0, current).reduce((sum, k) => sum + shares[k], 0);
  let within;
  if (phase === "write" && tracker.questionCount > 0) {
    within = Math.min(0.97, (tracker.questionsDone || 0) / tracker.questionCount);
  } else {
    const startedAt = phaseStarts[phase] ?? activeMs;
    const expectedPhaseMs = Math.max(1000, expectedTotalMs * shares[phase]);
    within = Math.min(0.9, Math.max(0, activeMs - startedAt) / expectedPhaseMs);
  }
  fraction = Math.min(0.99, fraction + shares[phase] * within);

  // Pace: how long this run has really taken for the share it has done.
  const expectedSoFar = fraction * expectedTotalMs;
  const rawPace = expectedSoFar > 5000 ? wallMs / expectedSoFar : 1;
  const weight = Math.min(1, fraction / 0.4);
  const pace = Math.min(3, Math.max(0.5, 1 + weight * (rawPace - 1)));
  const remainingMs = Math.max(0, Math.round((1 - fraction) * expectedTotalMs * pace));

  // The range narrows as history grows and as the run nears its end.
  const logError = stats?.logErrN >= MIN_SAMPLES ? Math.sqrt(stats.logErrSq / stats.logErrN) : DEFAULT_LOG_ERROR;
  const spread = Math.min(1, logError) * (1 - fraction);
  return {
    phase,
    fraction: Math.round(fraction * 1000) / 1000,
    remainingMs,
    lowMs: Math.round(remainingMs * Math.exp(-spread)),
    highMs: Math.round(remainingMs * Math.exp(spread)),
    expectedTotalMs: Math.round(expectedTotalMs),
    questionsDone: tracker.questionsDone || 0,
    questionCount: tracker.questionCount || 0,
  };
}

// Durations of each step from the active-time offsets at which each began.
function phaseDurations(phaseStarts = {}, totalMs) {
  const seen = PHASE_KEYS.filter((k) => Number.isFinite(phaseStarts[k])).sort((x, y) => phaseStarts[x] - phaseStarts[y]);
  const out = Object.fromEntries(PHASE_KEYS.map((k) => [k, 0]));
  seen.forEach((k, i) => {
    const end = i + 1 < seen.length ? phaseStarts[seen[i + 1]] : totalMs;
    out[k] = Math.max(0, end - phaseStarts[k]);
  });
  return out;
}

/**
 * Folds one completed run into a stats document. Pure, so the Firestore
 * transaction and the backfill share it.
 * sample: { questions, activeMs, phaseMs?: {phase: ms}, predictedMs? }
 */
function addSample(stats, sample) {
  const s = { ...emptyStats(), ...(stats || {}) };
  const q = Math.max(1, Number(sample.questions) || DEFAULT_QUESTIONS);
  const t = Math.max(1, sample.activeMs / 1000);
  s.n += 1; s.sq += q; s.st += t; s.sqq += q * q; s.sqt += q * t;
  const total = PHASE_KEYS.reduce((sum, k) => sum + (sample.phaseMs?.[k] || 0), 0);
  if (total > 0) {
    const prior = s.shares || DEFAULT_SHARES;
    s.shares = Object.fromEntries(PHASE_KEYS.map((k) => [k,
      s.shares ? prior[k] * (1 - SHARE_ALPHA) + SHARE_ALPHA * ((sample.phaseMs[k] || 0) / total) : (sample.phaseMs[k] || 0) / total]));
  }
  if (sample.predictedMs > 0) {
    s.logErrSq += Math.log(sample.activeMs / sample.predictedMs) ** 2;
    s.logErrN += 1;
  }
  return s;
}

// Pipeline code reports what only it knows: how many questions the resource
// has and how many are written. A no-op outside durable generation.
function noteProgress(job, { questionCount, questionsWritten } = {}) {
  const tracker = job?.progressTracker;
  if (!tracker) return;
  if (questionCount > 0) tracker.questionCount = questionCount;
  if (questionsWritten > 0) tracker.questionsDone = (tracker.questionsDone || 0) + questionsWritten;
}

async function loadTimingStats(db, job) {
  try {
    if (!db?.collection) return {};
    const col = db.collection(STATS_COLLECTION);
    const [own, all] = await Promise.all([col.doc(kindKey(job)).get(), col.doc("all").get()]);
    return { [kindKey(job)]: own.exists ? own.data() : null, all: all.exists ? all.data() : null };
  } catch {
    return {};
  }
}

async function recordTimingSample(db, job, sample) {
  if (!db?.collection || !(sample.activeMs > 0)) return;
  const col = db.collection(STATS_COLLECTION);
  await db.runTransaction(async (tx) => {
    const refs = [col.doc(kindKey(job)), col.doc("all")];
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    refs.forEach((ref, i) => tx.set(ref, { ...addSample(snaps[i].exists ? snaps[i].data() : null, sample), updatedAt: new Date() }));
  });
}

module.exports = {
  PHASES, PHASE_KEYS, STATS_COLLECTION, DEFAULT_FIT,
  phaseForStage, phaseIndex, kindKey, fitFromStats, estimateProgress,
  phaseDurations, addSample, noteProgress, loadTimingStats, recordTimingSample,
};
