import type { CaptureResult } from "posthog-js";

// posthog-js is ~100 kB gzipped, so it loads after the page rather than in
// every page's first-load bundle. Calls made before it arrives are queued
// with their original timestamps.
type PostHogClient = (typeof import("posthog-js"))["default"];

/**
 * Website analytics (PostHog US Cloud), WEB-8.
 *
 * Every event and its properties are declared in `AnalyticsEvents`, so a call
 * site cannot invent an event name or attach a property nobody reviewed. The
 * rule for properties: no names, emails, phone numbers, medical details, free
 * text a family typed, referral codes or tokens. Choices from fixed lists
 * (year, subject, referral source code) and counts are fine.
 *
 * Capture only runs where `NEXT_PUBLIC_POSTHOG_KEY` is set, which is Vercel
 * Production. Everywhere else every call here is a no-op. See
 * `docs/analytics.md` for the event catalogue and dashboards.
 */

type Page =
  | "home"
  | "programs"
  | "about"
  | "contact"
  | "register"
  | "year11_interest"
  | "parent_feedback"
  | "unsubscribe"
  | "privacy"
  | "thank_you"
  | "other";

type RegistrationStepName =
  | "year"
  | "subject"
  | "class_time"
  | "student"
  | "children"
  | "carer"
  | "final";

type RegistrationStepProps = {
  step: number;
  step_name: RegistrationStepName;
  child_index: number;
  child_count: number;
  is_editing: boolean;
};

export type AnalyticsEvents = {
  // Global
  cta_clicked: { cta: string; location: string; page: Page; text: string };
  contact_clicked: {
    method: "phone" | "email" | "whatsapp";
    location: string;
    page: Page;
  };
  outbound_link_clicked: {
    destination: string;
    location: string;
    page: Page;
    placeholder: boolean;
  };
  mobile_menu_opened: { page: Page };
  mobile_menu_closed: { page: Page; method: "close_button" | "link" };
  section_viewed: { section: string; page: Page };
  terms_opened: { location: string; page: Page };
  privacy_opened: { location: string; page: Page };
  analytics_opted_out: { page: Page };

  // Home
  hero_finder_submitted: {
    year: string | null;
    subject: string | null;
    destination: "register" | "year11";
  };
  faq_opened: { question: string; position: number; page: Page };
  reviews_navigated: {
    method: "arrow" | "dot" | "swipe";
    direction: "next" | "previous" | "jump";
    index: number;
  };

  // Contact / enquiry form
  enquiry_form_started: { page: Page };
  enquiry_form_blocked: { missing_fields: string[] };
  enquiry_form_submitted: {
    year: string | null;
    subject: string | null;
    has_message: boolean;
  };
  enquiry_form_succeeded: Record<string, never>;
  enquiry_form_failed: { error: string };

  // Referral links
  referral_link_opened: { code_valid: boolean; lookup_failed: boolean };
  referral_link_landed: { prefilled_source: string };

  // Registration
  registration_started: {
    entry: "direct" | "hero_prefill" | "query_prefill" | "referral_link";
    prefilled_year: string | null;
    prefilled_subjects: string[];
  };
  registration_step_viewed: RegistrationStepProps;
  registration_step_completed: RegistrationStepProps & {
    time_on_step_ms: number;
  };
  registration_step_blocked: RegistrationStepProps & {
    missing_fields: string[];
  };
  registration_back_clicked: { from_step: number; from_step_name: RegistrationStepName };
  registration_year_selected: { year: string; stage: "Primary" | "High School" };
  registration_subject_toggled: {
    subject: string;
    selected: boolean;
    subject_count: number;
  };
  registration_class_slots_loaded: {
    total: number;
    with_spots: number;
    load_ms: number;
  };
  registration_class_slots_failed: { error: string };
  registration_no_slots_available: { year: string; subjects: string[] };
  registration_class_slot_toggled: {
    day: string | null;
    start_time: string | null;
    selected: boolean;
    spots_remaining: number | null;
    availability: "available" | "limited" | "critical" | "unknown";
    required_count: number;
  };
  registration_child_added: { child_count: number };
  registration_child_edited: { child_count: number };
  registration_child_removed: { child_count: number };
  registration_child_limit_reached: { child_count: number };
  registration_same_as_parent_toggled: { on: boolean };
  registration_referral_source_selected: {
    source: string;
    has_detail_field: boolean;
    from_referral_link: boolean;
  };
  registration_turnstile_result: {
    outcome: "success" | "expired" | "error" | "not_configured";
  };
  registration_submitted: {
    child_count: number;
    years: string[];
    subjects: string[];
    class_count: number;
    referral_source: string | null;
    has_referral_code: boolean;
    total_time_ms: number;
  };
  registration_succeeded: {
    enrolment_ids: string[];
    registration_group_id: string | null;
  };
  registration_failed: { status_code: number | null; error: string };
  registration_abandoned: {
    last_step: number;
    last_step_name: RegistrationStepName;
    child_count: number;
    time_on_page_ms: number;
  };
  registration_redirected_to_year11: {
    source: "hero" | "hero_prefill" | "query_prefill";
  };
  registration_completed: {
    enrolment_ids: string[];
    registration_group_id: string | null;
    child_count: number;
    years: string[];
    subjects: string[];
    referral_source: string | null;
    referral_code_valid: boolean;
  };

  // Year 11 interest
  year11_interest_started: Record<string, never>;
  year11_student_added: { student_count: number };
  year11_student_removed: { student_count: number };
  year11_interest_blocked: { errors: string[] };
  year11_interest_submitted: {
    student_count: number;
    current_years: string[];
    student_statuses: string[];
    maths_courses: string[];
    english_courses: string[];
    preferred_days: string[];
  };
  year11_interest_succeeded: { student_count: number };
  year11_interest_failed: { error: string };

  // Parent feedback
  parent_feedback_step_viewed: { step: number; step_name: string };
  parent_feedback_step_completed: {
    step: number;
    step_name: string;
    time_on_step_ms: number;
  };
  parent_feedback_step_blocked: {
    step: number;
    step_name: string;
    errors: string[];
  };
  parent_feedback_submitted: Record<string, never>;
  parent_feedback_succeeded: Record<string, never>;
  parent_feedback_failed: { error: string };

  // Unsubscribe
  email_unsubscribe_viewed: { token_valid: boolean };
  email_unsubscribed: Record<string, never>;
  email_resubscribed: Record<string, never>;
  email_unsubscribe_failed: { action: "unsubscribe" | "resubscribe" };
};

export type AnalyticsEvent = keyof AnalyticsEvents;

export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
// US Cloud (decision on WEB-8). The browser goes through the `/ingest`
// rewrite in next.config.ts so ad blockers don't drop events; servers call
// the US host directly.
export const POSTHOG_SERVER_HOST = "https://us.i.posthog.com";
const POSTHOG_UI_HOST = "https://us.posthog.com";

// True once analytics is configured for this browser (a key is set), even
// while posthog-js is still loading; `client` is set when it has loaded.
let started = false;
let client: PostHogClient | null = null;
const pending: Array<(posthog: PostHogClient) => void> = [];

const withClient = (run: (posthog: PostHogClient) => void) => {
  if (!started) return;
  if (client) run(client);
  else pending.push(run);
};

// Query params and paths that identify a family. They reach PostHog inside
// URLs ($current_url, $referrer, $initial_current_url...), so every string on
// every event is scrubbed rather than a known list of URL properties.
const SENSITIVE_PARAM = /([?&](?:ref|token|code|email)=)[^&#\s"]*/gi;
const REFERRAL_PATH = /(\/r\/)[^/?#\s"]+/gi;

const scrubString = (value: string) =>
  value
    .replace(SENSITIVE_PARAM, "$1redacted")
    .replace(REFERRAL_PATH, "$1redacted");

const scrubValue = (value: unknown): unknown => {
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        scrubValue(val),
      ])
    );
  }
  return value;
};

export const scrubEvent = (event: CaptureResult | null) => {
  if (!event) return event;
  event.properties = scrubValue(event.properties) as CaptureResult["properties"];
  if (event.$set) event.$set = scrubValue(event.$set) as CaptureResult["$set"];
  if (event.$set_once) {
    event.$set_once = scrubValue(event.$set_once) as CaptureResult["$set_once"];
  }
  return event;
};

// Only an explicit preview or development build counts as staging, so a build
// without Vercel's system variables can't hide production from dashboards.
const ANALYTICS_ENVIRONMENT = ["preview", "development"].includes(
  process.env.NEXT_PUBLIC_VERCEL_ENV ?? ""
)
  ? "staging"
  : "production";

// Local development: `NEXT_PUBLIC_POSTHOG_DRY_RUN=1` with any placeholder key
// logs each event (after scrubbing) to the console and sends nothing.
const DRY_RUN = process.env.NEXT_PUBLIC_POSTHOG_DRY_RUN === "1";

// Staging and production share one PostHog project (TP-36): Vercel previews
// are tagged staging so dashboards filter them out. Added as each event is
// sent, so the first page view (captured inside init) is tagged too.
export const tagEnvironment = (event: CaptureResult | null) => {
  if (!event) return event;
  event.properties = { ...event.properties, environment: ANALYTICS_ENVIRONMENT };
  return event;
};

const logAndDrop = (event: CaptureResult | null) => {
  if (!event) return null;
  console.info("[analytics]", event.event, event.properties);
  const log = ((window as unknown as { __analyticsEvents?: unknown[] })
    .__analyticsEvents ??= []);
  log.push({ event: event.event, properties: event.properties });
  return null;
};

export const pageFromPath = (pathname: string): Page => {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "home";
  if (path === "/programs") return "programs";
  if (path === "/about") return "about";
  if (path === "/contact") return "contact";
  if (path === "/register") return "register";
  if (path === "/year-11-interest") return "year11_interest";
  if (path === "/parent-feedback") return "parent_feedback";
  if (path === "/unsubscribe") return "unsubscribe";
  if (path === "/privacy") return "privacy";
  if (path === "/thank-you") return "thank_you";
  return "other";
};

export const currentPage = (): Page =>
  typeof window === "undefined" ? "other" : pageFromPath(window.location.pathname);

export const analyticsEnabled = () => started;

/** Runs once posthog-js has loaded (immediately if it already has). */
export const whenAnalyticsReady = (run: () => void) => withClient(() => run());

export const initAnalytics = () => {
  if (started || typeof window === "undefined" || !POSTHOG_KEY) return;
  started = true;
  installLinkTracking();

  void import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_KEY, {
        api_host: "/ingest",
        ui_host: POSTHOG_UI_HOST,
        defaults: "2026-08-30",
        // Nobody is ever identified on the website, so no person profiles.
        person_profiles: "identified_only",
        autocapture: true,
        capture_pageview: "history_change",
        capture_pageleave: true,
        capture_exceptions: true,
        capture_performance: { web_vitals: true },
        // Session replay records only the enrolment form, and unmasked
        // (approved by Tom, 2026-10-15): it starts when registration does
        // (`startRegistrationRecording`), never on other pages. `ph-no-capture`
        // still keeps family details out of click events, but doesn't blank
        // them in recordings, so replay uses its own block class.
        disable_session_recording: true,
        session_recording: {
          maskAllInputs: false,
          maskTextSelector: null,
          blockClass: "ph-no-replay",
        },
        disable_surveys: true,
        // Project settings must load for replay to start (they say recording
        // is enabled), so flags stay on. Everything a project toggle could
        // otherwise switch on is pinned here instead: surveys and replay above,
        // heatmaps and dead clicks below.
        capture_heatmaps: false,
        capture_dead_clicks: false,
        before_send: DRY_RUN
          ? [scrubEvent, tagEnvironment, logAndDrop]
          : [scrubEvent, tagEnvironment],
      });
      client = posthog;
      syncRegistrationRecording(window.location.pathname);
      if (DRY_RUN) {
        (window as unknown as { posthog?: PostHogClient }).posthog = posthog;
      }
      pending.splice(0).forEach((run) => run(posthog));
    })
    .catch((error) => {
      // Blocked or failed to load: analytics is off for this page view.
      started = false;
      pending.length = 0;
      console.warn("Analytics failed to load:", error);
    });
};

export const track = <E extends AnalyticsEvent>(
  event: E,
  properties: AnalyticsEvents[E]
) => {
  const timestamp = new Date();
  withClient((posthog) => {
    posthog.capture(event, properties, { timestamp });
    // Registration is reached by client-side navigation, so the recording
    // starts with it rather than only on a fresh load of /register.
    if (event === "registration_started") syncRegistrationRecording("/register");
  });
};

/**
 * Records only while the visitor is on /register (WEB-10). Called on load, on
 * every client-side route change (`_app.tsx`), and when registration starts,
 * so leaving registration for another page stops the recording.
 */
export const syncRegistrationRecording = (pathname: string) => {
  withClient((posthog) => {
    const onRegister = pageFromPath(pathname) === "register";
    if (onRegister && !posthog.sessionRecordingStarted()) {
      posthog.startSessionRecording(true);
    } else if (!onRegister && posthog.sessionRecordingStarted()) {
      posthog.stopSessionRecording();
    }
  });
};

/** For the last event before a page unloads. */
export const trackBeacon = <E extends AnalyticsEvent>(
  event: E,
  properties: AnalyticsEvents[E]
) => {
  const timestamp = new Date();
  withClient((posthog) =>
    posthog.capture(event, properties, { timestamp, transport: "sendBeacon" })
  );
};

/** Sent to API routes so a server-side event joins the visitor's journey. */
export const analyticsDistinctId = () => client?.get_distinct_id();

export const hasOptedOut = () => client?.has_opted_out_capturing() ?? false;

export const optOut = () => {
  track("analytics_opted_out", { page: currentPage() });
  withClient((posthog) => posthog.opt_out_capturing());
};

export const optIn = () => {
  withClient((posthog) => posthog.opt_in_capturing());
};

// ----- Link clicks (every page) -------------------------------------------

const locationOf = (element: Element) => {
  if (element.closest("#mobileMenu, .mobile-menu")) return "mobile_menu";
  if (element.closest("footer")) return "footer";
  if (element.closest("header, #nav, .nav")) return "nav";
  if (element.closest(".hero, .page-hero")) return "hero";
  const section = element.closest("section");
  if (section) return sectionName(section);
  return "body";
};

export const sectionName = (section: Element) => {
  if (section.id) return section.id;
  const named = Array.from(section.classList).find(
    (name) => name !== "section" && name !== "reveal" && name !== "in"
  );
  if (named) return named.replace(/-/g, "_");
  // Otherwise its heading, e.g. "Ready to get started?" -> ready_to_get_started.
  const heading = section.querySelector("h1, h2")?.textContent ?? "";
  const slug = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || "section";
};

const SOCIAL_HOSTS: Array<[RegExp, string]> = [
  [/instagram\.com$/, "instagram"],
  [/facebook\.com$/, "facebook"],
  [/linkedin\.com$/, "linkedin"],
  [/(wa\.me|whatsapp\.com)$/, "whatsapp"],
];

// Internal destinations worth naming; anything else falls back to its path.
const ctaFor = (url: URL) => {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const hash = url.hash.replace("#", "");
  if (path === "/register") return "register";
  if (path === "/year-11-interest") return "year11";
  if (path === "/Year-11-Information-Sheet.pdf") return "year11_info_sheet";
  if (path === "/contact") return hash === "enquire" ? "enquire" : "contact";
  if (path === "/programs") {
    if (hash === "pricing") return "pricing";
    if (hash === "how") return "how_it_works";
    if (hash === "year-11") return "year11_info";
    return "programs";
  }
  if (path === "/about") return hash ? `about_${hash}` : "about";
  if (path === "/") {
    if (hash === "reviews") return "reviews";
    if (hash === "faq") return "faq";
    return hash ? `home_${hash.replace(/-/g, "_")}` : "home";
  }
  return path.slice(1).replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "home";
};

const linkText = (link: HTMLAnchorElement) =>
  (link.textContent ?? link.getAttribute("aria-label") ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

const onLinkClick = (event: MouseEvent) => {
  const target = event.target as Element | null;
  const link = target?.closest?.("a");
  if (!link) return;
  // Containers holding family details still report where a link went, but
  // never its text.
  const isPrivate = Boolean(link.closest(".ph-no-capture"));

  const href = link.getAttribute("href") ?? "";
  const page = currentPage();
  const location = locationOf(link);

  if (href.startsWith("tel:")) {
    trackBeacon("contact_clicked", { method: "phone", location, page });
    return;
  }
  if (href.startsWith("mailto:")) {
    trackBeacon("contact_clicked", { method: "email", location, page });
    return;
  }

  // Social icons that don't have a real URL yet still show interest.
  const label = (link.getAttribute("aria-label") ?? "").toLowerCase();
  if (href === "#" && /facebook|instagram|linkedin/.test(label)) {
    track("outbound_link_clicked", {
      destination: label.split(" ")[0],
      location,
      page,
      placeholder: true,
    });
    return;
  }

  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return;
  }

  if (url.origin !== window.location.origin) {
    const social = SOCIAL_HOSTS.find(([pattern]) =>
      pattern.test(url.hostname.replace(/^www\./, ""))
    );
    if (social?.[1] === "whatsapp") {
      trackBeacon("contact_clicked", { method: "whatsapp", location, page });
      return;
    }
    trackBeacon("outbound_link_clicked", {
      destination: social?.[1] ?? url.hostname,
      location,
      page,
      placeholder: false,
    });
    return;
  }

  const path = decodeURIComponent(url.pathname);
  if (path === "/terms" || path === "/T&Cs.pdf") {
    trackBeacon("terms_opened", { location, page });
    return;
  }
  if (path === "/privacy") {
    trackBeacon("privacy_opened", { location, page });
    return;
  }

  trackBeacon("cta_clicked", {
    cta: ctaFor(url),
    location,
    page,
    text: isPrivate ? "" : linkText(link),
  });
};

let linkTrackingInstalled = false;

const installLinkTracking = () => {
  if (linkTrackingInstalled) return;
  linkTrackingInstalled = true;
  // Capture phase, so it runs before handlers that navigate away.
  document.addEventListener("click", onLinkClick, true);
};
