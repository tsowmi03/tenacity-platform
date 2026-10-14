# Website analytics (PostHog)

The website reports how families move through it to PostHog **US Cloud**
(WEB-8): where they come from, what they look at, and where they drop out of
enquiry and registration. The mobile app and admin portal are not covered.

## How it is wired

| Piece | Where |
| --- | --- |
| Event catalogue, typed | `AnalyticsEvents` in [`src/lib/analytics.ts`](../src/lib/analytics.ts). **This type is the source of truth.** An event or property that isn't declared there won't compile. |
| Browser client | `initAnalytics()` in the same file, called from `_app.tsx` when the module loads. posthog-js is loaded with a dynamic import, so it stays out of the first-load bundle; calls made before it arrives are queued with their original timestamps. |
| Link clicks (every page) | One capture-phase click listener in `analytics.ts` classifies every `<a>` as `cta_clicked`, `contact_clicked`, `outbound_link_clicked`, `terms_opened` or `privacy_opened`, with a `location` (nav, hero, footer, mobile_menu, or the section id). |
| Marketing pages and registration | [`DesignRuntime.tsx`](../src/modules/design/DesignRuntime.tsx). The static design HTML has no tracking attributes. |
| React pages | `year-11-interest`, `parent-feedback`, `unsubscribe` and `privacy` call `track()` directly. |
| Server events | [`src/lib/analyticsServer.ts`](../src/lib/analyticsServer.ts) (posthog-node). `registration_completed` from `/api/register` is the conversion of record, since ad blockers and closed tabs can't lose it. `referral_link_opened` comes from the `/r/<code>` redirect. |
| Proxy | `/ingest/*` rewrites in `next.config.ts` send browser traffic to PostHog US through our own domain, so ad blockers don't drop it. |

## Privacy rules

- **Never send** names, emails, phone numbers, allergy or medical details, any
  free text a family typed, referral codes or unsubscribe tokens. Choices from
  fixed lists (year, subject, referral source code), counts, durations and
  Firestore document IDs are fine.
- `scrubEvent` runs before every event leaves the browser. It replaces `ref`,
  `token`, `code` and `email` query values and `/r/<code>` paths with
  `redacted` in every string property, including `$current_url`, `$referrer`
  and the `$initial_*` properties.
- Containers that render family details carry `ph-no-capture`, so autocapture
  skips them: the enquiry, Year 11 and feedback forms, and the registration
  child list, child chip, extras, summary and confirmation message. Link
  clicks inside them still report their destination, but not their text.
- Session replay, surveys and feature flags are off in code
  (`advanced_disable_flags: true`), so a toggle in the PostHog project
  settings cannot switch them on.
- Families can opt out on [`/privacy`](../src/pages/privacy/index.tsx). The
  policy there describes what is collected. Update it if a change here
  collects something new.

## Environment

| Name | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_POSTHOG_KEY` | Vercel **Production only** | The PostHog US project API key (`phc_…`). It is public by design. With no key, every analytics call does nothing, so preview and local builds send nothing. |
| `NEXT_PUBLIC_POSTHOG_DRY_RUN` | Local `.env.local` only | `1` logs each event (after scrubbing) to the browser console as `[analytics]`, and server events to the terminal as `[analytics:server]`. Nothing is sent. Use it with any placeholder key. Events also collect in `window.__analyticsEvents`. |

Local testing setup:

```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_local_dry_run
NEXT_PUBLIC_POSTHOG_DRY_RUN=1
```

## PostHog project settings

Set once in the US project:

- **Billing:** a $0 cap on every product. The site is far below the free
  allowance.
- **Data retention:** set it to match the privacy policy.
- **Internal traffic:** opt out on your own browsers from `/privacy`.
  Opted-out browsers send nothing.

## Events

Properties are listed in `AnalyticsEvents`. Grouped by page:

- **Every page:** `$pageview`, `$pageleave` (time on page, scroll depth),
  `$autocapture`, `$exception`, `$web_vitals`, `cta_clicked`,
  `contact_clicked`, `outbound_link_clicked`, `terms_opened`,
  `privacy_opened`, `mobile_menu_opened` / `_closed`, `section_viewed`.
- **Home:** `hero_finder_submitted`, `faq_opened`, `reviews_navigated`.
- **Contact:** `enquiry_form_started` / `_blocked` (missing field ids) /
  `_submitted` / `_succeeded` / `_failed`.
- **Referral links:** `referral_link_opened` (server: whether the code was
  valid), `referral_link_landed`.
- **Registration:** `registration_started` (entry: direct, hero_prefill,
  query_prefill, referral_link), `registration_step_viewed` /
  `_completed` (time on step) / `_blocked` (missing field ids), for steps 1–7
  (`year`, `subject`, `class_time`, `student`, `children`, `carer`, `final`),
  `registration_back_clicked`, `registration_year_selected`,
  `registration_subject_toggled`, `registration_class_slots_loaded` /
  `_failed`, `registration_no_slots_available` (unmet demand),
  `registration_class_slot_toggled`, `registration_child_added` / `_edited` /
  `_removed` / `_limit_reached`, `registration_same_as_parent_toggled`,
  `registration_referral_source_selected`, `registration_turnstile_result`,
  `registration_submitted`, `registration_succeeded` / `_failed`,
  `registration_abandoned` (beacon on leaving mid-way),
  `registration_redirected_to_year11`, `registration_completed` (server).
- **Year 11 interest:** `year11_interest_started` / `_blocked` (validation
  messages) / `_submitted` (course and day codes) / `_succeeded` / `_failed`,
  `year11_student_added` / `_removed`.
- **Parent feedback:** `parent_feedback_step_viewed` / `_completed` /
  `_blocked`, `parent_feedback_submitted` / `_succeeded` / `_failed`. No
  answers or ratings: those are stored with the response.
- **Unsubscribe:** `email_unsubscribe_viewed` (token valid or not),
  `email_unsubscribed`, `email_resubscribed`, `email_unsubscribe_failed`.
- **Privacy:** `analytics_opted_out`.

## Dashboards

Build these in PostHog:

1. **Registration funnel:** `$pageview` on `/register` → `registration_started`
   → `registration_step_completed` for steps 1–7 → `registration_completed`.
   Break it down by `$initial_utm_source`, `referral_source` and
   `$device_type`.
2. **Enquiries:** the enquiry funnel, plus `cta_clicked` by `cta` and
   `location`, plus `faq_opened` and `section_viewed`.
3. **Unmet demand:** `registration_no_slots_available` by year and subjects,
   plus `year11_interest_submitted`.
4. **Referral links:** `referral_link_opened` → `referral_link_landed` →
   `registration_completed` where `referral_code_valid`.
5. **Health:** `*_failed`, `registration_turnstile_result` other than success,
   `registration_class_slots_failed`, and `$exception`.

## Adding an event

1. Declare it in `AnalyticsEvents`, using only non-identifying properties.
2. Call `track()` (or `trackBeacon()` right before a navigation).
3. Check it with dry run, then add it to the list above.
