"use strict";

// RES-73. What the portal shows while a resource generates: a bar, five plain
// steps and an ETA.
//
// The ETA comes from two things:
//  1. History. Every completed resource adds its active time and question count
//     to a running linear fit (time = a + b × questions) for its kind, plus how
//     that time split across the five steps. That gives an expected total
//     before the first stage has run.
//  2. This run's pace. As steps finish, the worker time actually taken is
//     compared with what history expected for the same share of the work, and
//     the remaining work is stretched or shrunk by that ratio. The pace counts
//     more the further through the run it is.
// RES-84. Waiting is a separate factor. A tutor's resources take turns, and a
// run hands off between workers, so real time runs ahead of worker time. The
// ETA is real time until the resource is ready: remaining worker time times
// the recent ratio of real to worker time (last few minutes, so a second
// resource joining the tutor's turns shows up quickly). Mixing the two into
// one pace made a long wait look like slow work and sent the ETA up and down.
// Steps that count their work (questions written, diagram questions settled)
// move with it and project their own remaining time from their own rate.
// Each report is blended with the last one (good news quickly, rises slowly),
// the bar never drops within a run, and a step with nothing to count
// approaches its end without stopping.

const PHASES = [
  { key: "plan", label: "Planning the paper" },
  { key: "write", label: "Writing questions" },
  { key: "diagrams", label: "Drawing diagrams" },
  { key: "check", label: "Checking quality" },
  { key: "finish", label: "Building the PDF" },
];
const PHASE_KEYS = PHASES.map((p) => p.key);
// RES-93. V2 started clean: the first collection's English history included a
// 4-second "run" (a re-render, all of it counted as Building the PDF), which
// taught the model that 16% of an English paper happens after it is finished.
const STATS_COLLECTION = "resourceTimingStatsV2";
// A run shorter than this did not generate anything worth learning from.
const MIN_SAMPLE_ACTIVE_MS = 30_000;
const MIN_SAMPLES = 3;
const SHARE_ALPHA = 0.2;
// Used only until history exists (the RES-73 backfill seeds it from past runs).
const DEFAULT_FIT = { a: 60, b: 22 }; // seconds, seconds per question (Nov 2026 runs)
const DEFAULT_SHARES = { plan: 0.08, write: 0.66, diagrams: 0.22, check: 0.02, finish: 0.02 };
// RES-93. English measured separately (9 paper runs, Nov 2026): finding the
// texts and planning takes 40% of the run, and once the review is done there
// is almost nothing left. Maths-shaped defaults kept the ETA at a minute or
// more after an English paper had finished writing.
const SUBJECT_DEFAULTS = {
  english: { questions: 10, fit: { a: 150, b: 20 }, shares: { plan: 0.4, write: 0.58, diagrams: 0, check: 0, finish: 0.02 } },
};
const MAX_FINISH_SHARE = 0.05;
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
  // content.review.v1 runs inside planned writing, before the bank and diagram
  // stages, so it belongs to writing; the checks after diagrams are "check".
  if (/^content\./.test(stageId)) return "write";
  if (/^(answers|math)\./.test(stageId)) return "check";
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
  // A subject with its own measured defaults uses those over a mixed history.
  if (SUBJECT_DEFAULTS[job.subject]) return null;
  const all = statsByKey.all;
  return all?.n >= MIN_SAMPLES ? all : null;
}

// RES-84. English has no diagram step: borrowed all-resource shares (14% for
// diagrams) left minutes on the clock after an English paper was written.
function normalisedShares(stats, job = {}) {
  const raw = { ...(SUBJECT_DEFAULTS[job.subject]?.shares || DEFAULT_SHARES), ...(stats?.shares || {}) };
  // Only maths draws diagrams or has its answers and notation checked.
  if (job.subject && job.subject !== "maths") { raw.diagrams = 0; raw.check = 0; }
  const total = PHASE_KEYS.reduce((sum, k) => sum + Math.max(0, raw[k] || 0), 0) || 1;
  // Building the document takes seconds, whatever a stray sample suggests.
  const finish = Math.min(Math.max(0, raw.finish || 0) / total, MAX_FINISH_SHARE);
  const rest = (total - Math.max(0, raw.finish || 0)) || 1;
  return Object.fromEntries(PHASE_KEYS.map((k) => [k, k === "finish" ? finish : (Math.max(0, raw[k] || 0) / rest) * (1 - finish)]));
}

function expectedQuestions({ tracker = {}, stats, requested, job = {} }) {
  if (tracker.questionCount > 0) return tracker.questionCount;
  if (requested > 0) return requested;
  if (stats?.n && stats.sq > 0) return stats.sq / stats.n;
  return SUBJECT_DEFAULTS[job.subject]?.questions || DEFAULT_QUESTIONS;
}

const STEP_CEILING = 0.95; // inside a step: how close to its end time alone can take the bar
const WAIT_TRUST_MS = 120_000; // worker time after which this run's wait ratio is fully trusted
const MAX_WAIT_RATIO = 4;
const WAIT_WINDOW_MS = 180_000; // recent waiting counts most: older time fades over ~3 minutes
const WAIT_WINDOW_MIN_ACTIVE_MS = 20_000;

// Decayed sums of real and worker time between reports, so the wait ratio
// follows what is happening now (a second resource joining the tutor's turns
// doubles it within minutes) rather than averaging the whole run.
function trackWait(previous, { nowMs, activeMs }) {
  if (!previous || !Number.isFinite(previous.atMs)) return { atMs: nowMs, activeMs, recentWallMs: 0, recentActiveMs: 0 };
  const dWall = Math.max(0, nowMs - previous.atMs);
  const dActive = Math.min(dWall, Math.max(0, activeMs - (previous.activeMs || 0)));
  const decay = Math.exp(-dWall / WAIT_WINDOW_MS);
  return { atMs: nowMs, activeMs, recentWallMs: (previous.recentWallMs || 0) * decay + dWall,
    recentActiveMs: (previous.recentActiveMs || 0) * decay + dActive };
}
const SMOOTHING_MS = 30_000; // a report this far after the last one moves the ETA ~63% of the way
const MIN_SMOOTHING = 0.2;

/**
 * Pure. Returns what the portal draws:
 * { phase, fraction, remainingMs, lowMs, highMs, questionsDone, questionCount }
 *
 * activeMs  worker time spent on this run so far
 * wallMs    wall time since the run's first stage started
 * phaseStarts  { phase: activeMs at which that step began }
 * previous  { fraction, remainingMs, elapsedMs } from this run's last report,
 *           elapsedMs being the time since it was written
 * recentWait  trackWait() sums for the recent real/worker time ratio
 * countChangedAtMs  activeMs when the current step's count last moved
 */
function estimateProgress({ job = {}, statsByKey = {}, tracker = {}, activeMs = 0, wallMs = activeMs, phaseStarts = {}, requestedQuestions = null, previous = null, recentWait = null, countChangedAtMs = null }) {
  const stats = chooseStats(statsByKey, job);
  const fit = fitFromStats(stats) || SUBJECT_DEFAULTS[job.subject]?.fit || DEFAULT_FIT;
  const questions = expectedQuestions({ tracker, stats, requested: requestedQuestions, job });
  const expectedTotalMs = Math.max(30_000, (fit.a + fit.b * questions) * 1000);
  const shares = normalisedShares(stats, job);
  const phase = PHASE_KEYS.includes(tracker.phase) ? tracker.phase : "plan";
  const current = phaseIndex(phase);

  // Steps before the current one are done (a step this resource skipped, such
  // as diagrams on an English paper, counts as done once it is passed).
  let fraction = PHASE_KEYS.slice(0, current).reduce((sum, k) => sum + shares[k], 0);
  let within;
  // RES-84. Writing counts questions written; diagrams count diagram
  // questions the bank has settled, so that step moves with the work rather
  // than with history's guess at its length (3 runs of history put it at 17%;
  // real runs took 25-40% and the bar sat near the end for minutes).
  const count = phase === "write" ? tracker.questionCount : phase === "diagrams" ? tracker.diagramCount : 0;
  const counted = count > 0;
  if (counted) {
    const done = Math.min(count, (phase === "write" ? tracker.questionsDone : tracker.diagramsDone) || 0);
    // The count moves a batch at a time (5–10 questions with their solutions,
    // four diagram questions). In between, time moves the bar toward the next
    // batch at this step's own rate per item, so it neither stalls nor jumps.
    const startedAt = phaseStarts[phase] ?? activeMs;
    const changedAt = Math.min(activeMs, Math.max(startedAt, countChangedAtMs ?? startedAt));
    const perItemMs = done > 0 ? Math.max(1000, (changedAt - startedAt) / done) : Math.max(1000, expectedTotalMs * shares[phase] / count);
    const batch = Math.min(count - done, phase === "write" ? (job.answerMode === "worked" ? 5 : 10) : 4);
    const partial = batch > 0 ? batch * STEP_CEILING * (1 - Math.exp(-Math.max(0, activeMs - changedAt) / (perItemMs * batch))) : 0;
    within = Math.min(0.97, (done + partial) / count);
  } else {
    // Time alone moves the bar toward the step's end, never onto it: at the
    // expected duration it is 60% through, and an overrunning step keeps
    // creeping instead of freezing at a cap.
    const startedAt = phaseStarts[phase] ?? activeMs;
    const expectedPhaseMs = Math.max(1000, expectedTotalMs * shares[phase]);
    within = STEP_CEILING * (1 - Math.exp(-Math.max(0, activeMs - startedAt) / expectedPhaseMs));
  }
  fraction = Math.min(0.99, fraction + shares[phase] * within);
  // Within a run the bar never goes back, whatever reloaded statistics or a
  // replaying worker would otherwise compute.
  if (Number.isFinite(previous?.fraction)) fraction = Math.min(0.99, Math.max(fraction, previous.fraction));

  // Pace: how much worker time this run has needed for the share it has done,
  // measured after planning. Planning varies on its own (an English paper may
  // spend minutes finding a passage) and says little about how fast the
  // questions will come; counting it made a slow start look like a slow run.
  const afterPlanStart = PHASE_KEYS.slice(1).map((k) => phaseStarts[k]).filter(Number.isFinite).sort((x, y) => x - y)[0];
  const doneAfterPlan = Math.max(0, fraction - shares.plan);
  const expectedSoFar = doneAfterPlan * expectedTotalMs;
  const rawPace = current > 0 && Number.isFinite(afterPlanStart) && expectedSoFar > 5000 ? Math.max(0, activeMs - afterPlanStart) / expectedSoFar : 1;
  const weight = Math.min(1, doneAfterPlan / 0.4);
  const pace = Math.min(3, Math.max(0.5, 1 + weight * (rawPace - 1)));
  // Waiting: real time per unit of worker time so far (turns taken by the
  // tutor's other resources, hand-offs between workers).
  const recent = recentWait?.recentActiveMs >= WAIT_WINDOW_MIN_ACTIVE_MS;
  const rawWait = recent ? recentWait.recentWallMs / recentWait.recentActiveMs : activeMs > 0 ? wallMs / activeMs : 1;
  const waitWeight = recent ? 1 : Math.min(1, activeMs / WAIT_TRUST_MS);
  const wait = Math.min(MAX_WAIT_RATIO, Math.max(1, 1 + waitWeight * (rawWait - 1)));
  // Remaining worker time: the rest of this step, then the steps after it.
  // A step that counts its work (questions written, diagram questions
  // settled) is projected from its own rate once it is under way; history's
  // share for it can be far off (diagrams took 25-40% of real runs, against a
  // learnt 17%), and the run-wide pace lags a slow tail.
  const after = PHASE_KEYS.slice(current + 1).reduce((sum, k) => sum + shares[k], 0);
  let stepRemainingMs = (1 - within) * expectedTotalMs * shares[phase] * pace;
  const inStepMs = activeMs - (phaseStarts[phase] ?? activeMs);
  if (counted && within >= 0.05 && inStepMs >= 20_000) {
    const ownRate = inStepMs * (1 - within) / within;
    const trust = Math.min(1, within / 0.3);
    stepRemainingMs = stepRemainingMs * (1 - trust) + ownRate * trust;
  }
  let remainingMs = Math.max(0, Math.round((stepRemainingMs + after * expectedTotalMs * pace) * wait));
  // Blend with the last report, counted down to now, so a single report can
  // revise the ETA but not swing it.
  if (Number.isFinite(previous?.remainingMs)) {
    const elapsed = Math.max(0, previous.elapsedMs || 0);
    const before = Math.max(0, previous.remainingMs - elapsed);
    // Good news lands quickly; a rise is eased in.
    const alpha = remainingMs < before
      ? Math.min(1, Math.max(0.5, 1 - Math.exp(-elapsed / (SMOOTHING_MS / 3))))
      : Math.min(1, Math.max(MIN_SMOOTHING, 1 - Math.exp(-elapsed / SMOOTHING_MS)));
    remainingMs = Math.round(before + alpha * (remainingMs - before));
  }

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
    diagramsDone: tracker.diagramsDone || 0,
    diagramCount: tracker.diagramCount || 0,
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

// Every resource shape keeps its questions in arrays named `questions`
// (worksheets, paper sections, booklet end quizzes, question sets) or
// `practiceQuestions` (booklet sub-topics). Parts inside a question are not
// counted: they live under `parts`.
function countResourceQuestions(node) {
  if (Array.isArray(node)) return node.reduce((n, item) => n + countResourceQuestions(item), 0);
  if (!node || typeof node !== "object") return 0;
  return Object.entries(node).reduce((n, [key, value]) =>
    n + ((key === "questions" || key === "practiceQuestions") && Array.isArray(value) ? value.length : countResourceQuestions(value)), 0);
}

// Pipeline code reports what only it knows: how many questions the resource
// has and how many are written, and how many diagram questions the bank has
// settled (absolute, so a replaying worker lands on the same figure). A no-op
// outside durable generation.
function noteProgress(job, { questionCount, questionsWritten, diagramCount, diagramsDone } = {}) {
  const tracker = job?.progressTracker;
  if (!tracker) return;
  if (questionCount > 0) tracker.questionCount = questionCount;
  if (questionsWritten > 0) tracker.questionsDone = (tracker.questionsDone || 0) + questionsWritten;
  if (diagramCount > 0) tracker.diagramCount = diagramCount;
  if (Number.isFinite(diagramsDone)) tracker.diagramsDone = Math.max(tracker.diagramsDone || 0, diagramsDone);
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
  if (!db?.collection || !(sample.activeMs >= MIN_SAMPLE_ACTIVE_MS)) return;
  const col = db.collection(STATS_COLLECTION);
  await db.runTransaction(async (tx) => {
    const refs = [col.doc(kindKey(job)), col.doc("all")];
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    refs.forEach((ref, i) => tx.set(ref, { ...addSample(snaps[i].exists ? snaps[i].data() : null, sample), updatedAt: new Date() }));
  });
}

module.exports = {
  PHASES, PHASE_KEYS, STATS_COLLECTION, DEFAULT_FIT, MIN_SAMPLE_ACTIVE_MS, SUBJECT_DEFAULTS,
  phaseForStage, phaseIndex, kindKey, fitFromStats, estimateProgress, trackWait,
  phaseDurations, addSample, noteProgress, countResourceQuestions, loadTimingStats, recordTimingSample,
};
