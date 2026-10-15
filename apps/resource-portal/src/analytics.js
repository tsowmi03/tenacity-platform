import { firebaseConfig } from "./firebaseConfig";

/**
 * Resource portal analytics through PostHog US Cloud (RES-43).
 *
 * Tutors are identified by Firebase UID, the same ID their resource
 * generation AI calls (RES-42) and their app usage carry, so usage and cost
 * join up. Their name comes from the server's person sync (TP-35).
 *
 * Staging and production share one PostHog project (the free plan allows
 * one): every event carries `environment`, and dashboards filter out
 * `staging` (TP-36). Local dev and tests send nothing unless
 * `VITE_POSTHOG_DRY_RUN=1`, which logs instead.
 *
 * Session replay is on and unmasked (approved by Tom, 2026-10-15). PostHog
 * still never records password fields.
 */

// Public by design: PostHog project tokens only allow sending events.
const POSTHOG_KEY = "phc_veJUQQxnqJBE9B4umMUfLqLfB36CfJDUCnncMDGnxLwY";
const POSTHOG_HOST = "https://us.i.posthog.com";

/** Every event this portal sends. Anything else throws in development. */
export const EVENTS = Object.freeze({
  GENERATION_SUBMITTED: "resource_generation_submitted",
  GENERATION_FINISHED: "resource_generation_finished",
  REVISION_SUBMITTED: "resource_revision_submitted",
  CHAT_TURN: "resource_chat_turn",
  RESOURCE_DOWNLOADED: "resource_downloaded",
  PREVIEW_OPENED: "resource_preview_opened",
  RESOURCE_RETRIED: "resource_retried",
  RESOURCE_CANCELLED: "resource_cancelled",
  RESOURCE_DELETED: "resource_deleted",
});

const KNOWN_EVENTS = new Set(Object.values(EVENTS));

export function analyticsEnvironment(projectId = firebaseConfig?.projectId || "") {
  return /staging/i.test(projectId) ? "staging" : "production";
}

const DRY_RUN = import.meta.env.VITE_POSTHOG_DRY_RUN === "1";

// Tags every event as it is sent, including the first page view, which
// posthog.init() can capture before a register() call would run.
const TAGS = Object.freeze({ app: "resource_portal" });

export function tagEvent(event) {
  if (!event) return event;
  event.properties = { ...event.properties, ...TAGS, environment: analyticsEnvironment() };
  return event;
}

function logAndDrop(event) {
  console.info("[analytics]", event?.event, event?.properties);
  return null;
}
const ENABLED = DRY_RUN || (import.meta.env.PROD && import.meta.env.MODE !== "test");

let client = null;
let starting = null;
const pending = [];

function withClient(run) {
  if (!ENABLED) return;
  if (client) run(client);
  else pending.push(run);
}

/** Loads posthog-js after the page, so it stays out of the first bundle. */
export function initAnalytics() {
  if (!ENABLED || starting || typeof window === "undefined") return starting;
  starting = import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        defaults: "2026-08-30",
        person_profiles: "identified_only",
        autocapture: true,
        capture_pageview: "history_change",
        capture_pageleave: true,
        capture_exceptions: true,
        disable_session_recording: false,
        session_recording: {
          maskAllInputs: false,
          maskTextSelector: null,
        },
        disable_surveys: true,
        // Replay only starts once PostHog has loaded the project's settings
        // (which say recording is on), so flags stay enabled. Anything else a
        // project toggle could switch on is pinned off here instead.
        capture_heatmaps: false,
        capture_dead_clicks: false,
        before_send: DRY_RUN ? [tagEvent, logAndDrop] : tagEvent,
      });
      client = posthog;
      pending.splice(0).forEach((run) => run(posthog));
    })
    .catch((error) => {
      // Blocked or failed to load: analytics is off for this visit.
      pending.length = 0;
      console.warn("Analytics failed to load:", error);
    });
  return starting;
}

let identifiedUid = null;

/** Keeps PostHog's identity in step with who is signed in. */
export function syncAnalyticsUser(user, role) {
  withClient((posthog) => {
    if (!user) {
      if (identifiedUid) posthog.reset();
      identifiedUid = null;
      return;
    }
    if (identifiedUid === user.uid) return;
    identifiedUid = user.uid;
    posthog.identify(user.uid, {
      ...(user.email ? { email: user.email } : {}),
      ...(role ? { role } : {}),
    });
  });
}

/** One declared event. Never pass a prompt, chat text or a student's name. */
export function track(event, properties = {}) {
  if (!KNOWN_EVENTS.has(event)) {
    if (import.meta.env.DEV) throw new Error(`Unknown analytics event: ${event}`);
    return;
  }
  withClient((posthog) => posthog.capture(event, properties));
}

/**
 * Reports a job reaching a final status, once, and only for transitions this
 * tab saw happen (not jobs that were already finished when the list loaded).
 * Only the signed-in tutor's own jobs count: the queue is shared, and every
 * open tab would otherwise report everyone's jobs as its viewer's.
 */
export function createJobOutcomeTracker(uid) {
  const lastStatus = new Map();
  const FINAL = new Set(["complete", "failed", "cancelled"]);
  return (jobs = []) => {
    for (const job of jobs) {
      if (!uid || job.createdBy !== uid) continue;
      const id = job.jobId || job.id;
      const previous = lastStatus.get(id);
      lastStatus.set(id, job.status);
      if (previous && !FINAL.has(previous) && FINAL.has(job.status)) {
        // This attempt's start: a retry keeps the job's createdAt.
        const started = Date.parse(job.startedAtIso || job.createdAtIso || "");
        const finished = Date.parse(job.completedAtIso || "") || Date.now();
        track(EVENTS.GENERATION_FINISHED, {
          job_id: id,
          status: job.status,
          resource_type: job.resourceType || null,
          subject: job.subject || null,
          year: job.year ?? null,
          duration_s: Number.isFinite(started) ? Math.round((finished - started) / 1000) : null,
        });
      }
    }
  };
}
