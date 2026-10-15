"use strict";

const { defineString } = require("firebase-functions/params");
const { lazyRequire } = require("./lazyRequire");

const loadPostHogNode = lazyRequire(() => require("posthog-node"));

// The Functions' PostHog client, shared by resource generation's LLM analytics
// (RES-42: prompts and outputs are sent in full, privacyMode off, approved
// 2026-10-14) and the business events in src/analytics (TP-35).
//
// The project token is a non-secret param, set per project in
// .env.<projectId>. Staging shares the production project (TP-36) and tags its
// events environment=staging. An empty token turns analytics off rather than
// failing the caller.
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
 * Which environment events come from. Staging and production share one
 * PostHog project (the free plan allows one, TP-36), so every event carries
 * `environment` and dashboards filter out `staging`.
 */
function analyticsEnvironment(projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "") {
  return /staging/i.test(projectId) ? "staging" : "production";
}

/**
 * A PostHog client for one AI call, or null when this project has no token.
 * Never throws: analytics must not fail a generation.
 */
function createPostHogClient({
  projectToken = readParam(posthogProjectToken),
  host = readParam(posthogHost),
  PostHogClass,
} = {}) {
  if (!projectToken) return null;
  try {
    const Client = PostHogClass || loadPostHogNode().PostHog;
    return new Client(projectToken, {
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
  analyticsEnvironment,
  createPostHogClient,
  posthogRequestFields,
  shutdownPostHogClient,
};
