"use strict";

const { isDiagramRenderError } = require("./builder/diagrams");

const MAX_DETAIL_LENGTH = 600;

function rawMessage(err) {
  if (!err) return "";
  if (typeof err === "string") return err;
  return err.message || String(err);
}

function clampDetail(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_DETAIL_LENGTH
    ? `${trimmed.slice(0, MAX_DETAIL_LENGTH).trim()}…`
    : trimmed;
}

function statusOf(err) {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  return Number.isFinite(Number(status)) ? Number(status) : null;
}

/**
 * Turn a raw generation/repair error into a clear, actionable failure the tutor
 * can act on, plus the original technical message kept separately for a
 * "show details" affordance and for the auto-repair prompt.
 *
 * Returns { message, detail } where:
 *  - message: friendly, safe to show, tells the tutor what to do next.
 *  - detail:  the raw technical message (clamped), or null when it adds nothing.
 */
function describeResourceFailure(err) {
  const raw = rawMessage(err);
  const lower = raw.toLowerCase();
  const status = statusOf(err);
  const name = String(err?.name || "");
  const detail = clampDetail(raw);

  // A diagram the question depends on could not be rendered.
  if (isDiagramRenderError(err) && err?.diagramRequired !== false) {
    const label = err?.diagramLabel ? `the diagram for ${err.diagramLabel}` : "a required diagram";
    return {
      message:
        `${capitaliseFirst(label)} couldn't be generated, and the question needs it. ` +
        "Reword your prompt to simplify or avoid that diagram, then press Retry.",
      detail,
    };
  }

  // The AI's safety classifiers declined the request. Vanishingly rare for
  // teaching material, so treat it as a prompt-wording problem the tutor can act
  // on rather than a transient fault worth retrying unchanged.
  if (err?.refusal === true || err?.stopReason === "refusal") {
    return {
      message:
        "The AI declined to generate this resource. This is usually caused by wording in a " +
        "custom prompt or reference file that reads as unsafe out of context. Reword it and " +
        "press Retry — if the topic is legitimate and it keeps failing, contact an administrator.",
      detail,
    };
  }

  // AI output ran past the token limit and was cut off mid-resource.
  if (err?.stopReason === "max_tokens" || lower.includes("truncated") || lower.includes("max_tokens")) {
    return {
      message:
        "The resource was too large and the AI response was cut off before it finished. " +
        "Generate fewer questions, choose a shorter length, or split the topic into separate resources, then press Retry.",
      detail,
    };
  }

  // The AI service was busy / rate-limited / overloaded.
  if (
    status === 429 ||
    status === 529 ||
    name === "RateLimitError" ||
    name === "OverloadedError" ||
    lower.includes("overloaded") ||
    lower.includes("rate limit")
  ) {
    return {
      message: "The AI service is busy right now. Wait a minute, then press Retry.",
      detail,
    };
  }

  // Credentials / configuration problem talking to the AI service (admin-facing).
  if (status === 401 || status === 403 || name === "AuthenticationError" || name === "PermissionDeniedError") {
    return {
      message:
        "The AI service rejected our request — this is a configuration issue, not something you can fix here. " +
        "Contact an administrator.",
      detail,
    };
  }

  // Network dropped / timed out reaching the AI service.
  if (
    name === "APIConnectionError" ||
    name === "APIConnectionTimeoutError" ||
    lower.includes("timeout") ||
    lower.includes("etimedout") ||
    lower.includes("econnreset") ||
    lower.includes("socket hang up") ||
    lower.includes("network")
  ) {
    return {
      message: "The connection to the AI service dropped before generation finished. Press Retry.",
      detail,
    };
  }

  // We couldn't read one of the uploaded reference files.
  if (
    lower.includes("requires a buffer") ||
    lower.includes("no such object") ||
    lower.includes("could not load") ||
    lower.includes("does not exist") ||
    statusOf(err) === 404 ||
    err?.code === 404 ||
    isFileExtractionContext(lower)
  ) {
    return {
      message:
        "We couldn't read one of your reference files. Re-upload it as a clean, text-based PDF or DOCX " +
        "(scanned images and password-protected files can't be read), then press Retry.",
      detail,
    };
  }

  // AI returned text that wasn't valid JSON (and auto-repair couldn't fix it).
  if (lower.includes("not valid json") || lower.includes("did not include a text content block")) {
    return {
      message:
        "The AI returned a response we couldn't read. This is usually temporary — press Retry. " +
        "If it keeps failing, simplify your custom prompt.",
      detail,
    };
  }

  // Generated content didn't match the required document structure.
  if (name === "ResourceValidationError" || lower.includes("invalid resource json")) {
    return {
      message:
        "The generated resource didn't match the required format. Press Retry — if it keeps failing, " +
        "simplify your prompt or reduce the number of questions.",
      detail,
    };
  }

  // Anything else: a clear generic message with the technical detail kept.
  return {
    message:
      "Generation failed unexpectedly. Press Retry — if it keeps failing, contact an administrator " +
      "with the details below.",
    detail,
  };
}

function isFileExtractionContext(lower) {
  return (
    (lower.includes("extract") || lower.includes("download")) &&
    (lower.includes("file") || lower.includes("pdf") || lower.includes("docx"))
  );
}

function capitaliseFirst(value) {
  const text = String(value || "");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function resourceFailureReasonCode(err) {
  const raw = rawMessage(err).toLowerCase();
  const status = statusOf(err);
  const name = String(err?.name || "");
  if (err?.refusal === true || err?.stopReason === "refusal") return "REFUSAL";
  if (err?.stopReason === "max_tokens" || raw.includes("truncated")) return "TOKEN_TRUNCATION";
  if (isDiagramRenderError(err) && err?.diagramRequired !== false) return "REQUIRED_DIAGRAM";
  if (name === "ResourceValidationError" || raw.includes("invalid resource json")) return "SCHEMA_INVALID";
  if (raw.includes("not valid json") || raw.includes("output text block")) return "MALFORMED_OUTPUT";
  if (status === 429 || status === 529 || name === "RateLimitError" || raw.includes("rate limit")) {
    return "PROVIDER_BUSY";
  }
  if ([401, 402, 403, 404].includes(status) || ["AuthenticationError", "PermissionDeniedError", "NotFoundError"].includes(name)) {
    return "PROVIDER_ACCESS";
  }
  if (status && status >= 500) return "PROVIDER_SERVER";
  if (
    ["APIConnectionError", "APIConnectionTimeoutError"].includes(name) ||
    /timeout|etimedout|econnreset|socket hang up|network/.test(raw)
  ) {
    return "PROVIDER_NETWORK";
  }
  return "MODEL_FAILURE";
}

function classifyResourceFailure(err) {
  const described = describeResourceFailure(err);
  const raw = rawMessage(err).toLowerCase();
  const code = String(err?.code || "").toLowerCase();
  const reasonCode = resourceFailureReasonCode(err);
  const definitelyNotModelFailure =
    err?.name === "AbortError" ||
    Boolean(err?.resourceInfrastructure) ||
    raw.includes("no such object") ||
    isFileExtractionContext(raw) ||
    /firestore|storage|docx|preview|pdf/.test(code);
  const failoverEligible = !definitelyNotModelFailure && Boolean(
    err?.modelFailure === true ||
      err?.refusal === true ||
      err?.rawAiText ||
      err?.stopReason ||
      (isDiagramRenderError(err) && err?.diagramRequired !== false) ||
      err?.name === "ResourceValidationError" ||
      [
        "PROVIDER_BUSY",
        "PROVIDER_ACCESS",
        "PROVIDER_SERVER",
        "PROVIDER_NETWORK",
      ].includes(reasonCode)
  );
  return {
    ...described,
    reasonCode,
    failoverEligible,
  };
}

module.exports = {
  classifyResourceFailure,
  describeResourceFailure,
  resourceFailureReasonCode,
};
