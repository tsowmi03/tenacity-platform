"use strict";

/**
 * Bounded, per-diagram repair before omission or hard failure (RES-34).
 *
 * Before this pass existed, a diagram that failed validation, layout, or
 * rendering got one of two outcomes and neither involved trying again: an
 * optional diagram was dropped the moment the document build tripped over it,
 * and a required one took the whole resource down, with only a whole-document
 * "repair" call — which rewrites every question — standing behind it.
 *
 * So this runs between generation and the document build. Each diagram is
 * validated and rendered on its own; a failure buys up to three attempts at a
 * replacement for THAT diagram, and the final fallbacks are unchanged. The
 * repair call is handed the question as fixed context and returns a diagram
 * object — the question, answer, marks, skill, and difficulty are not in the
 * request and not in the response, so "only the diagram may change" is a
 * property of the call's shape rather than a promise in a prompt.
 *
 * A replacement is accepted only when it revalidates, re-renders, AND passes a
 * faithfulness check against the unchanged question. That last gate is the
 * point of the whole exercise: retrying until something renders is easy, and a
 * confidently-drawn diagram that disagrees with its question is worse for a
 * student than a missing one, because it looks authoritative.
 */

const logger = require("firebase-functions/logger");

const { DIAGRAM_REGISTRY } = require("./diagramRegistry");
const {
  buildDiagramJudgeSchema,
  buildDiagramRepairSchema,
} = require("./diagramSchema");
const {
  buildDiagramJudgePrompt,
  buildDiagramRepairPrompt,
} = require("./promptBuilder");
const {
  attachDiagramContext,
  optionalDiagramOmittedWarning,
  renderDiagramBlock,
} = require("./builder/diagrams");
const {
  ResourceValidationError,
  validateDiagram,
} = require("./builder/validation");
const { isCancellationError, throwIfCancelled } = require("./cancellation");
const { classifyResourceFailure } = require("./failure");

/** Repair attempts allowed for any one diagram before its fallback applies. */
const MAX_DIAGRAM_REPAIR_ATTEMPTS = 3;

/**
 * Repair calls allowed across one resource, whatever the per-diagram budget
 * would otherwise permit. A paper can carry a dozen diagrams, and a generation
 * that went wrong tends to go wrong everywhere at once: without a ceiling, one
 * bad response would spend three calls per diagram and eat the job's fixed
 * 540-second budget before the document was ever built. Diagrams past the
 * ceiling are not repaired — they take the same fallback as a diagram that
 * exhausted its attempts.
 */
const MAX_RESOURCE_REPAIR_CALLS = 12;

/** Attempt records kept on the job document; the logs keep every one. */
const MAX_RECORDED_ATTEMPTS = 20;

/** Repairing one diagram is a narrow job; it runs at the verification tier. */
const DIAGRAM_REPAIR_MAX_TOKENS = 8000;
const DIAGRAM_REPAIR_EFFORT = "medium";

const OUTCOME = Object.freeze({
  REPAIRED: "repaired",
  OMITTED: "omitted",
  FAILED: "failed",
});

function errorMessage(err) {
  return String(err?.message || err || "Unknown error");
}

function reasonCodeFor(err) {
  try {
    return classifyResourceFailure(err).reasonCode;
  } catch {
    return "unknown";
  }
}

/**
 * Every question or part carrying a diagram, with the text that diagram has to
 * agree with.
 *
 * Walks for the `diagram` field rather than knowing each resource type's
 * layout, for the same reason collectDiagramTargets does: questions live under
 * `questions`, `sections[].questions`, `subTopics[].practiceQuestions`,
 * `endQuiz.sections[].questions` and inside `custom` blocks, and a hand-written
 * traversal falls out of step with that the first time a type is added.
 */
function collectDiagramOwners(parsed) {
  const owners = [];

  const walk = (node, context) => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child, context);
      return;
    }
    if (!node || typeof node !== "object") return;

    // A question number seen on the way down names the parts below it, so a
    // part's label reads as "Question 3 part (a)" rather than a bare "(a)",
    // and its stem is carried too — a part frequently reads only "Find x",
    // with the object and its measurements given once by the parent question,
    // so a part's diagram cannot be repaired or judged from its own text alone.
    const nested = Number.isFinite(node.number)
      ? { questionNumber: node.number, questionStem: questionTextFor(node) }
      : context;

    if (node.diagram && typeof node.diagram === "object" && !Array.isArray(node.diagram)) {
      owners.push({
        owner: node,
        label: diagramOwnerLabel(node, nested),
        question: questionTextFor(node, nested),
        marks: Number.isFinite(node.marks) ? node.marks : null,
        required: node.diagramRequired !== false,
      });
    }

    for (const value of Object.values(node)) walk(value, nested);
  };

  walk(parsed, {});
  return owners;
}

function diagramOwnerLabel(node, context) {
  if (Number.isFinite(node.number)) return `Question ${node.number}`;
  if (node.label && context.questionNumber) {
    return `Question ${context.questionNumber} part ${node.label}`;
  }
  if (node.label) return `Part ${node.label}`;
  if (context.questionNumber) return `Question ${context.questionNumber}`;
  return "a question";
}

function questionTextFor(node, context = {}) {
  const text = node.stem || node.instruction || node.text || "";
  const own = String(text).replace(/\s+/g, " ").trim();
  // A part with its own question number is not nested under anything — it IS
  // the question — so only a bare part (has a label, no number) inherits its
  // parent's stem, and only when that stem is not simply repeated verbatim.
  const isPart = !Number.isFinite(node.number) && typeof node.label === "string";
  if (isPart && context.questionStem && context.questionStem !== own) {
    return own ? `${context.questionStem} ${own}` : context.questionStem;
  }
  return own;
}

/**
 * Validate and render one diagram exactly as the document build would.
 *
 * Reuses renderDiagramBlock rather than reaching for the renderer directly, so
 * a diagram that passes here is a diagram the build has already drawn — the
 * two-way table's native-docx path, the layout guards, and the error tagging
 * are all the production ones. Throws the same tagged error the build throws.
 */
async function verifyDiagram(spec, { label, required }) {
  try {
    validateDiagram(spec, "diagram");
  } catch (err) {
    if (err instanceof ResourceValidationError && spec && typeof spec === "object") {
      throw attachDiagramContext(err, spec, { label, required });
    }
    throw err;
  }
  await renderDiagramBlock(spec, { label, required });
}

/** A shared allowance of repair calls for one resource. */
function createCallBudget(limit) {
  let spent = 0;
  return {
    get spent() {
      return spent;
    },
    take() {
      if (spent >= limit) return false;
      spent += 1;
      return true;
    },
  };
}

async function requestRepairedDiagram({
  job,
  type,
  definition,
  failedSpec,
  question,
  marks,
  failureReason,
  callAi,
  model,
  signal,
}) {
  const schema = buildDiagramRepairSchema(type);
  const { parsed } = await callAi({
    model,
    maxTokens: DIAGRAM_REPAIR_MAX_TOKENS,
    effort: DIAGRAM_REPAIR_EFFORT,
    systemPrompt: buildDiagramRepairPrompt({
      job,
      type,
      definition,
      constrained: Boolean(schema),
    }),
    userMessage: [
      `Question${marks ? ` (${marks} marks)` : ""}:\n${question || "(no question text)"}`,
      `The specification that failed:\n${JSON.stringify(failedSpec, null, 2)}`,
      `Why it failed:\n${failureReason}`,
      `Return a corrected "${type}" diagram for this question.`,
    ].join("\n\n---\n\n"),
    signal,
    responseSchema: schema,
    mathBearing: true,
  });

  const diagram = parsed?.diagram;
  if (!diagram || typeof diagram !== "object") return null;
  // Enforced here as well as by the prompt: the unconstrained fallback types
  // (tree-diagram, angles, function-plot) have no schema to pin `type`, so
  // nothing stops the model substituting a different diagram kind that also
  // happens to render — which is a visual the question never asked for, not a
  // repair of the one that failed.
  if (diagram.type !== type) {
    const err = new Error(
      `The repair returned a "${diagram.type}" diagram, not the requested "${type}"`
    );
    err.code = "DIAGRAM_RENDER_ERROR";
    throw err;
  }
  return diagram;
}

async function judgeDiagram({ job, type, spec, question, marks, callAi, model, signal }) {
  const { parsed } = await callAi({
    model,
    maxTokens: DIAGRAM_REPAIR_MAX_TOKENS,
    effort: DIAGRAM_REPAIR_EFFORT,
    systemPrompt: buildDiagramJudgePrompt({ job, type }),
    userMessage: [
      `Question${marks ? ` (${marks} marks)` : ""}:\n${question || "(no question text)"}`,
      `The diagram about to be printed beside it:\n${JSON.stringify(spec, null, 2)}`,
    ].join("\n\n---\n\n"),
    signal,
    responseSchema: buildDiagramJudgeSchema(),
    mathBearing: true,
  });

  if (typeof parsed?.faithful !== "boolean") {
    const err = new Error("The diagram faithfulness check returned an invalid response shape");
    err.modelFailure = true;
    throw err;
  }
  return {
    faithful: parsed.faithful,
    reason: String(parsed.reason || "").slice(0, 500),
  };
}

/**
 * Up to `maxAttempts` replacements for one failing diagram.
 *
 * Returns the accepted spec, or null when the attempts (or the resource's call
 * budget) ran out. Cancellation propagates: a tutor who stopped the job is not
 * waiting for a better triangle.
 */
async function repairOneDiagram({
  job,
  entry,
  initialError,
  callAi,
  model,
  signal,
  isCancelled,
  maxAttempts,
  budget,
  verify,
  judge,
  record,
}) {
  const { owner, label, question, marks, required } = entry;
  const failedSpec = owner.diagram;
  const type = String(failedSpec?.type || "unknown");
  const definition = DIAGRAM_REGISTRY[type];

  if (!definition) {
    // Nothing to repair towards: the type is not one this renderer knows, so a
    // corrected spec of the same type cannot exist. Straight to the fallback.
    record({
      attempt: 0,
      outcome: "unsupported_type",
      reason: `Diagram type ${type} is not supported`,
      reasonCode: "diagram_unsupported_type",
    });
    return { spec: null, attempts: 0, reason: `Diagram type ${type} is not supported` };
  }

  let attempts = 0;
  let outages = 0;
  let reason = errorMessage(initialError);

  while (attempts < maxAttempts && outages < maxAttempts) {
    throwIfCancelled({ signal, isCancelled });

    if (!budget.take()) {
      return {
        spec: null,
        attempts,
        reason: `${reason} (the resource's diagram repair budget was already spent)`,
        budgetExhausted: true,
      };
    }

    attempts += 1;
    const attempt = attempts;

    let candidate;
    try {
      candidate = await requestRepairedDiagram({
        job,
        type,
        definition,
        failedSpec,
        question,
        marks,
        failureReason: reason,
        callAi,
        model,
        signal,
      });
    } catch (err) {
      if (isCancellationError(err)) throw err;
      reason = errorMessage(err);
      record({ attempt, outcome: "call_failed", reason, reasonCode: reasonCodeFor(err) });
      continue;
    }

    if (!candidate) {
      reason = "The repair returned no diagram";
      record({ attempt, outcome: "empty", reason, reasonCode: "diagram_repair_empty" });
      continue;
    }

    try {
      await verify(candidate, { label, required });
    } catch (err) {
      if (isCancellationError(err)) throw err;
      reason = errorMessage(err);
      record({ attempt, outcome: "invalid", reason, reasonCode: reasonCodeFor(err) });
      continue;
    }

    // The judge is a second AI call, chargeable the same as the repair call
    // itself — otherwise the advertised ceiling on repair calls silently allows
    // twice as many provider requests, one of the ways this budget exists to
    // guard the job's fixed time limit.
    if (!budget.take()) {
      return {
        spec: null,
        attempts,
        reason: `${reason} (the resource's diagram repair budget was already spent)`,
        budgetExhausted: true,
      };
    }

    let verdict;
    try {
      verdict = await judge({ job, type, spec: candidate, question, marks, callAi, model, signal });
    } catch (err) {
      if (isCancellationError(err)) throw err;
      // The check was unavailable, which says nothing about this candidate. An
      // unverified diagram is not acceptable, so the candidate is dropped — but
      // the attempt is given back, because the model did its part. `outages` is
      // what stops that being an unbounded loop when the checker stays down.
      attempts -= 1;
      outages += 1;
      reason = errorMessage(err);
      record({
        attempt,
        outcome: "check_unavailable",
        reason,
        reasonCode: reasonCodeFor(err),
      });
      continue;
    }

    if (!verdict.faithful) {
      reason = `The diagram did not match the question: ${verdict.reason}`;
      record({ attempt, outcome: "rejected", reason, reasonCode: "diagram_semantic_mismatch" });
      continue;
    }

    record({ attempt, outcome: "accepted", reason: verdict.reason, reasonCode: null });
    return { spec: candidate, attempts: attempt, reason: verdict.reason };
  }

  return { spec: null, attempts, reason };
}

/**
 * Validate, render, and where necessary repair every diagram in a generated
 * resource, before the document is built.
 *
 * Mutates `parsed` in place: a repaired diagram replaces the one that failed,
 * and an optional diagram that could not be repaired is dropped exactly as the
 * document build would drop it. A required diagram that could not be repaired
 * throws — the error carries `diagramRepairExhausted` so the queue does not
 * then hand the same failure to the whole-document repair path, which cannot do
 * better and would rewrite every question trying.
 */
async function repairDiagrams({
  job,
  parsed,
  callAi,
  model,
  signal,
  isCancelled,
  maxAttempts = MAX_DIAGRAM_REPAIR_ATTEMPTS,
  maxRepairCalls = MAX_RESOURCE_REPAIR_CALLS,
  provider = null,
  // Injectable for tests; production always uses the real render and check.
  verify = verifyDiagram,
  judge = judgeDiagram,
} = {}) {
  const owners = collectDiagramOwners(parsed);
  const summary = {
    checked: owners.length,
    attempted: 0,
    repaired: 0,
    omitted: 0,
    failed: 0,
    calls: 0,
    model: model || null,
    provider,
    attempts: [],
  };
  const warnings = [];
  let changed = false;

  if (!owners.length) return { changed, warnings, summary };

  const budget = createCallBudget(maxRepairCalls);

  for (const entry of owners) {
    throwIfCancelled({ signal, isCancelled });

    const spec = entry.owner.diagram;
    const diagramType = String(spec?.type || "unknown");

    try {
      await verify(spec, { label: entry.label, required: entry.required });
      continue;
    } catch (err) {
      if (isCancellationError(err)) throw err;
      summary.attempted += 1;

      const attemptLog = [];
      const record = (row) => {
        attemptLog.push(row);
        logger.info("[resource] diagram repair attempt", {
          jobId: job?.jobId,
          diagramLabel: entry.label,
          diagramType,
          diagramRequired: entry.required,
          model: model || null,
          provider,
          ...row,
        });
      };
      record({
        attempt: 0,
        outcome: "detected",
        reason: errorMessage(err),
        reasonCode: reasonCodeFor(err),
      });

      const result = await repairOneDiagram({
        job,
        entry,
        initialError: err,
        callAi,
        model,
        signal,
        isCancelled,
        maxAttempts,
        budget,
        verify,
        judge,
        record,
      });

      const describe = (outcome) => ({
        diagramLabel: entry.label,
        diagramType,
        diagramRequired: entry.required,
        attempts: result.attempts,
        outcome,
        reason: String(result.reason || "").slice(0, 500),
        model: model || null,
        provider,
        ...(result.budgetExhausted ? { budgetExhausted: true } : {}),
        // The logs carry every attempt; the job document carries the trail,
        // because it is read by a tutor asking why one diagram is missing.
        trail: attemptLog.slice(-maxAttempts - 1).map((row) => ({
          attempt: row.attempt,
          outcome: row.outcome,
          reasonCode: row.reasonCode || null,
        })),
      });

      let outcome;
      try {
        outcome = applyRepairOutcome({ entry, diagramType, result, warnings, summary });
      } catch (fatal) {
        // A required diagram is about to take the resource down. Carry the
        // record out on the error so the failed job can still say how many
        // attempts it took and what each one hit.
        summary.calls = budget.spent;
        summary.attempts.push(describe(OUTCOME.FAILED));
        fatal.diagramRepairs = summary;
        throw fatal;
      }

      changed = changed || outcome.changed;
      summary.attempts.push(describe(outcome.outcome));
    }
  }

  summary.calls = budget.spent;
  if (summary.attempts.length > MAX_RECORDED_ATTEMPTS) {
    summary.attempts = summary.attempts.slice(0, MAX_RECORDED_ATTEMPTS);
    summary.attemptsTruncated = true;
  }

  if (summary.attempted) {
    logger.info("[resource] diagram repair pass", {
      jobId: job?.jobId,
      checked: summary.checked,
      attempted: summary.attempted,
      repaired: summary.repaired,
      omitted: summary.omitted,
      calls: summary.calls,
      model: model || null,
      provider,
    });
  }

  return { changed, warnings, summary };
}

/**
 * Final fallback handling for one diagram, unchanged in substance from what the
 * document build has always done — an optional diagram is omitted with a
 * warning, a required one takes the resource down — and reached only once the
 * repair attempts are spent.
 */
function applyRepairOutcome({ entry, diagramType, result, warnings, summary }) {
  const { owner, label, required } = entry;

  if (result.spec) {
    owner.diagram = result.spec;
    summary.repaired += 1;
    return { outcome: OUTCOME.REPAIRED, changed: true };
  }

  if (!required) {
    owner.diagram = null;
    owner.diagramRequired = false;
    warnings.push(
      optionalDiagramOmittedWarning({ label, diagramType, detail: result.reason })
    );
    summary.omitted += 1;
    return { outcome: OUTCOME.OMITTED, changed: true };
  }

  summary.failed += 1;
  const err = new Error(
    `Required diagram for ${label} could not be produced after ${result.attempts} repair ` +
      `attempt${result.attempts === 1 ? "" : "s"}: ${result.reason}`
  );
  err.code = "DIAGRAM_RENDER_ERROR";
  err.diagramSpec = owner.diagram;
  err.diagramRequired = true;
  err.diagramLabel = label;
  err.diagramType = diagramType;
  err.diagramRepairExhausted = true;
  err.diagramRepairAttempts = result.attempts;
  throw err;
}

module.exports = {
  DIAGRAM_REPAIR_EFFORT,
  DIAGRAM_REPAIR_MAX_TOKENS,
  MAX_DIAGRAM_REPAIR_ATTEMPTS,
  MAX_RECORDED_ATTEMPTS,
  MAX_RESOURCE_REPAIR_CALLS,
  OUTCOME,
  collectDiagramOwners,
  judgeDiagram,
  repairDiagrams,
  verifyDiagram,
};
