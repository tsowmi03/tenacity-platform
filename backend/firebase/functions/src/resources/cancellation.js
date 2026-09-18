"use strict";

/**
 * Cancellation for resource generation.
 *
 * A tutor can stop a job mid-flight, and every long-running step — the AI calls,
 * the diagram fill pass, the diagram repair pass — has to notice promptly and
 * abort rather than finish work nobody is waiting for. These helpers are their
 * shared vocabulary, kept in their own module so a step can check for
 * cancellation without requiring the queue (which requires the step).
 */

const RESOURCE_CANCELLED_CODE = "RESOURCE_CANCELLED";

class ResourceCancelledError extends Error {
  constructor(message = "Resource generation was cancelled") {
    super(message);
    this.name = "ResourceCancelledError";
    this.code = RESOURCE_CANCELLED_CODE;
    this.cancelled = true;
  }
}

/**
 * True for our own cancellation and for the abort errors the provider SDKs
 * raise when the request's AbortSignal fires mid-call.
 */
function isCancellationError(err) {
  return Boolean(
    err &&
      (err.cancelled === true ||
        err.code === RESOURCE_CANCELLED_CODE ||
        err.name === "APIUserAbortError" ||
        err.name === "AbortError")
  );
}

function throwIfCancelled(deps) {
  if (deps?.isCancelled?.() || deps?.signal?.aborted) {
    throw new ResourceCancelledError();
  }
}

module.exports = {
  RESOURCE_CANCELLED_CODE,
  ResourceCancelledError,
  isCancellationError,
  throwIfCancelled,
};
