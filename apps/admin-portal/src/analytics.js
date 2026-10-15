import { firebaseConfig } from "./firebaseConfig";

/**
 * Admin portal analytics through PostHog US Cloud (AWP-26).
 *
 * Mainly error tracking: with only a few admins, the value is knowing when a
 * page breaks and seeing what happened. Page views, clicks and unmasked
 * session replay (approved by Tom, 2026-10-15) come with it; PostHog still
 * never records password fields. Admins are identified by Firebase UID and
 * named by the server's person sync (TP-35).
 *
 * Staging and production share one PostHog project (the free plan allows
 * one): every event carries `environment`, and dashboards filter out
 * `staging` (TP-36). Local dev and tests send nothing unless
 * `VITE_POSTHOG_DRY_RUN=1`, which logs instead.
 *
 * A copy of the resource portal's module rather than a shared one: the two
 * portals don't import from each other (portalSeparation.test.js).
 */

// Public by design: PostHog project tokens only allow sending events.
const POSTHOG_KEY = "phc_veJUQQxnqJBE9B4umMUfLqLfB36CfJDUCnncMDGnxLwY";
const POSTHOG_HOST = "https://us.i.posthog.com";

export function analyticsEnvironment(projectId = firebaseConfig?.projectId || "") {
  return /staging/i.test(projectId) ? "staging" : "production";
}

const DRY_RUN = import.meta.env.VITE_POSTHOG_DRY_RUN === "1";

// Tags every event as it is sent, including the first page view, which
// posthog.init() can capture before a register() call would run.
const TAGS = Object.freeze({ app: "admin_portal" });

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
