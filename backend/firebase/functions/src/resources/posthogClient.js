"use strict";

const { defineString } = require("firebase-functions/params");
const { PostHog } = require("posthog-node");

// PostHog LLM analytics for resource generation (RES-42). Prompts and outputs
// are sent in full (privacyMode off, approved 2026-10-14).
//
// The project token is a non-secret param, set per project in
// .env.<projectId>: production carries it, staging leaves it empty. An empty
// token turns analytics off rather than failing a generation.
const posthogProjectToken = defineString("POSTHOG_PROJECT_TOKEN", {
  default: "",
});
const posthogHost = defineString("POSTHOG_HOST", {
  default: "https://us.i.posthog.com",
});

// Params can only be read inside a function invocation. Unit tests and
// scripts call this outside one, where analytics is simply off.
function readParam(param) {
  try {
    return String(param.value() || "").trim();
  } catch {
    return "";
  }
}

/**
 * A PostHog client for one AI call, or null when this project has no token.
 * Never throws: analytics must not fail a generation.
 */
function createPostHogClient({
  projectToken = readParam(posthogProjectToken),
  host = readParam(posthogHost),
  PostHogClass = PostHog,
} = {}) {
  if (!projectToken) return null;
  try {
    return new PostHogClass(projectToken, {
      host: host || "https://us.i.posthog.com",
      privacyMode: false,
      // Sent when the call's client shuts down, before the invocation ends.
      flushAt: 1,
      flushInterval: 0,
      requestTimeout: 3000,
    });
  } catch (err) {
    console.warn("PostHog client could not be created; analytics off.", err);
    return null;
  }
}

/** Flushes and closes the client. Never throws. */
async function shutdownPostHogClient(client) {
  if (!client) return;
  try {
    await client.shutdown();
  } catch (err) {
    console.warn("PostHog shutdown failed; events from this call may be lost.", err);
  }
}

/**
 * The fields the PostHog AI wrappers read off a request and strip before
 * calling the provider. Only added when the wrapped client is in use: the
 * plain Anthropic and OpenAI clients would send them on, and the APIs reject
 * unknown fields.
 */
function posthogRequestFields(posthog, { posthogProperties, posthogTraceId, posthogDistinctId }) {
  if (!posthog) return {};
  return {
    ...(posthogProperties ? { posthogProperties } : {}),
    ...(posthogTraceId ? { posthogTraceId } : {}),
    ...(posthogDistinctId ? { posthogDistinctId } : {}),
  };
}

module.exports = {
  createPostHogClient,
  posthogRequestFields,
  shutdownPostHogClient,
};
