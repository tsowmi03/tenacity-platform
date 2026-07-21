# Registration and homepage improvements roadmap

> Path note, 21 July 2026: canonical shared Functions source is
> `backend/firebase/functions` in the platform monorepo. Historical portal
> paths below predate the structural extraction.

## Purpose

Implement the five requested website improvements in order of ease, while
preserving the existing per-student enrolment workflow used by the admin portal
and Firebase Functions.

This roadmap is ordered from easiest to hardest. Each item should be reviewed
and verified before moving to the next.

## Ranked implementation order

| Rank | Change | Effort | Risk | Repositories |
| --- | --- | --- | --- | --- |
| 1 | Hyperlink the registration terms and conditions | Very small | Low | Website |
| 2 | Remove the redundant "Still have questions?" card | Small | Low | Website |
| 3 | Apply exact class spot colours | Small | Low-medium | Website |
| 4 | Add "How did you hear about us?" and expose it to admins | Medium | Medium | Website and admin portal |
| 5 | Allow one registration to include multiple children | Large | High | Website, admin portal, and Functions |

## 1. Hyperlink the registration terms and conditions - complete

### Scope

Turn the terms text beside the required checkbox into a real link to the
existing `/T&Cs.pdf` document.

### Implementation

- Update `src/modules/design/static/register.html`.
- Link only the words "terms & conditions".
- Open the PDF in a new tab using `target="_blank"` and
  `rel="noopener noreferrer"`.
- Add an accessible underline and focus state in
  `src/styles/claude-design.css`.
- Ensure clicking the link opens the PDF without changing the checkbox state.
- Keep the checkbox itself required.

### Acceptance criteria

- The terms PDF opens from the final registration step.
- The link works with mouse, keyboard, and mobile touch.
- Clicking the link does not submit the form or toggle the checkbox.
- Registration cannot be submitted until the checkbox is selected.

## 2. Remove the redundant "Still have questions?" card - complete

### Scope

Remove the dark card beside the homepage FAQ accordion. Retain the enquiry CTA
at the bottom of the page.

### Implementation

- Remove `.faq-aside` from `src/modules/design/static/home.html`.
- Change the FAQ layout in `src/styles/claude-design.css` to a centred,
  single-column accordion.
- Remove FAQ-aside-specific CSS if it is no longer used on another page.
- Keep the FAQ heading and all accordion questions.

### Acceptance criteria

- The "Still have questions?" card no longer appears.
- The FAQ accordion uses the available width without becoming excessively wide.
- Desktop and mobile spacing remains balanced.
- The bottom enquiry CTA remains unchanged and functional.

## 3. Apply exact class spot colours - complete

### Scope

Show the exact number of available spots and use:

- Red for 1 spot.
- Orange for 2 spots.
- Green for 3 or 4 spots.

### Implementation

- Add a helper in `src/modules/design/DesignRuntime.tsx` that calculates:
  `remaining = capacity - enrolledStudents.length`.
- Render exact labels: `1 spot`, `2 spots`, `3 spots`, or `4 spots`.
- Assign semantic classes such as `critical`, `limited`, and `available`.
- Add the three colour states in `src/styles/claude-design.css`.
- Clamp negative values to zero and continue excluding full classes.
- Do not assume three spots when `capacity` is absent. Show a neutral
  availability label such as "Contact us".

### Acceptance criteria

- One remaining spot is red.
- Two remaining spots are orange.
- Three or four remaining spots are green.
- Full classes cannot be selected.
- Missing or invalid capacity data does not display false availability.
- Text remains readable without relying on colour alone.

## 4. Add referral-source capture and admin display - website complete, admin portal pending

### Scope

Add a required "How did you hear about us?" field near the end of registration
and make the answer useful to administrators.

### Data contract

The website writes these two fields to each new `enrolments` document:

```text
referralSource: normalized source code
referralSourceDetail: optional trimmed free text
```

| Code | Website label | Detail field |
| --- | --- | --- |
| `friend_family` | Friend or family | Who referred you? |
| `existing_family` | Existing Tenacity family | Family name |
| `google` | Google Search or Maps | None |
| `social_media` | Facebook or Instagram | None |
| `community` | School, church, or community | Which organisation? |
| `tutoring_provider` | MarksPlus or another tutoring provider | Which provider? |
| `flyer_signage` | Flyer or signage | None |
| `other` | Other | Free-text explanation |
| `prefer_not_to_say` | Prefer not to say | None |

### Completed website implementation

- `src/lib/referralSources.ts`
  - Owns the normalized codes, customer-facing labels, detail prompts, and
    code validation.
- `src/modules/design/static/register.html`
  - Adds the required source select at the end of the final registration step.
  - Includes an optional detail input that is hidden until relevant.
- `src/modules/design/DesignRuntime.tsx`
  - Populates the options from the shared definition.
  - Requires a valid source before website submission.
  - Shows and clears the conditional detail input correctly.
  - Includes the selected source and detail in the registration summary.
  - Builds summary rows with DOM text nodes so free text is not interpreted as
    HTML.
- `src/pages/api/register.ts`
  - Whitelists the normalized source codes.
  - Trims the detail to 250 characters.
  - Stores empty strings when an older client omits the new fields.
  - Continues accepting legacy payloads without a referral source during the
    rollout.

### Admin portal handoff

Implement this in `/Users/thomassowmi/Development/tenacity-web-portal`.

#### 1. Add a shared source-label helper

Create a small frontend helper such as `src/backend/referralSources.js` with
the exact code-to-label mapping above. It should expose:

```text
REFERRAL_SOURCE_OPTIONS
referralSourceLabel(code) -> label or "Not recorded"
```

Unknown, empty, or missing values must render as `Not recorded`.

#### 2. Add source display and filtering to the enrolment list

Update `src/pages/EnrolmentPortalPage.jsx`:

- Add `sourceFilter` state with an `all` default.
- Reset batch selection when the source filter changes.
- Add a source select beside the existing year filter.
- Filter `visibleEnrolments` by the normalized `referralSource` code.
- Add `referralSource` and `referralSourceDetail` to the search haystack.
- Add a `Source` table column using `referralSourceLabel`.
- Keep missing legacy values visible as `Not recorded`.

This remains client-side filtering because `listEnrolments()` already loads
the enrolment rows before applying the current status, year, and search
filters. No Firestore index is required.

#### 3. Add source display and editing to enrolment details

Update `src/pages/EnrolmentDetailsPage.jsx`:

- In read-only mode, show `How they heard about us` and `Referral detail`
  under Additional details.
- In edit mode, render a select using the normalized options.
- Show an optional detail input for `friend_family`, `existing_family`,
  `community`, `tutoring_provider`, and `other`.
- Clear stale detail when the source changes to one that does not use detail.
- Show `Not recorded` for older records with no source.

Update `src/backend/enrolmentEditPayload.js`:

- Add `referralSource` and `referralSourceDetail` to edit form state.
- Return both trimmed fields from `buildEnrolmentUpdatePayload`.
- Keep an empty source valid so an admin can leave a legacy record unchanged.

#### 4. Whitelist admin updates in the callable

Update `backend/functions/src/enrolments/updateEnrolment.js`:

- Add the same nine source codes as an enum.
- Add `referralSource` to `UPDATABLE` as an optional enum or empty string.
- Add `referralSourceDetail` as an optional string with a 250-character limit.
- Preserve the existing pending/archived-only edit rule and audit logging.
- Do not copy these fields into parent or student documents during acceptance;
  the enrolment document remains the source for marketing attribution.

No source-controlled enrolment-created admin notification was found in the
current portal backend. The existing acceptance email is parent-facing and
does not need the referral fields.

#### 5. Portal tests and verification

Update:

- `src/pages/EnrolmentPages.test.jsx`
  - Source column and labels render.
  - Source filtering works.
  - Missing values render as `Not recorded`.
  - Detail view shows source and detail.
- `test/enrolmentEditPayload.test.mjs`
  - Source fields map into edit state and are trimmed in the payload.
- `backend/functions/test/unit/enrolmentLifecycle.payload.test.js`
  - Valid source codes are accepted.
  - Unknown source codes are rejected.
  - Detail is limited to 250 characters.

Run:

```text
npm test
npm run build
cd backend/functions && npm test
```

### Acceptance criteria

- A registration stores a normalized source and optional detail.
- Admins can see and filter by source.
- Existing enrolments without these fields display "Not recorded".
- The field does not block legacy single-student API payloads during rollout.
- Future aggregate reporting can group sources consistently.

## 5. Allow one registration to include multiple children - website complete, admin portal and Functions pending

### Recommended design

Keep one `enrolments` Firestore document per child and add a shared registration
group identifier.

This preserves the admin portal's current per-child review, acceptance,
archiving, student creation, class enrolment, and attendance behaviour.

Do not replace the existing document shape with one document containing a
`children` array. That would require a wider migration across enrolment
acceptance and portal screens.

### User flow

1. Complete year, subject, class, and student details for the first child.
2. Choose either:
   - "Add another child"
   - "Continue to parent details"
3. Display completed child summary cards with edit and remove controls.
4. Repeat the child-specific flow when another child is added.
5. Collect parent/carer details once.
6. Collect emergency contact and referral source once.
7. Collect child-specific allergies, additional information, and permission to
   leave for each child.
8. Accept terms and complete Turnstile once.
9. Submit all children together.

### State model

Refactor registration state into:

```text
family:
  carer details
  emergency contact details
  referral source
  terms acceptance

students[]:
  name
  year
  subjects
  classes
  allergies
  additional information
  permission to leave
```

### Firestore document fields

Continue storing the current enrolment fields on every child document, plus:

```text
registrationGroupId: string
registrationGroupIndex: number
registrationGroupSize: number
referralSource: string
referralSourceDetail: string
status: "pending"
createdAt: Timestamp
```

Family-level fields should be copied onto each child document so existing
portal and Functions code can continue reading a complete enrolment record.

### API implementation

- Update `src/pages/api/register.ts` to accept:

```text
family
students[]
turnstileToken
```

- Retain temporary support for the current `{ enrolment, turnstileToken }`
  payload.
- Validate every student independently.
- Limit the number of children per submission to a reasonable maximum, such as
  five.
- Generate one server-side `registrationGroupId`.
- Create all enrolment documents in one Firestore batch.
- Return:

```text
enrolmentIds: string[]
enrolmentId: first enrolment ID for compatibility
registrationGroupId: string
```

### Functions and email implementation

The current enrolment-created trigger sends an admin notification and parent
welcome email for every new enrolment document.

- Update
  `backend/functions/lib/portal/overrides.js` in the admin portal repository.
- Keep one admin notification per child so each intake record has a direct
  review link.
- Send the parent welcome email only when:
  - The enrolment has no group fields, preserving legacy behaviour; or
  - `registrationGroupIndex === 0`.
- Add focused unit coverage for grouped and legacy notification behaviour.

### Admin portal implementation

- Continue listing each child as a separate enrolment.
- Show a "Family submission" indicator when `registrationGroupId` exists.
- On the details page, show sibling records from the same group with links.
- Keep accepting each child independently.
- When calculating referral-source totals, count each
  `registrationGroupId` once so siblings do not inflate marketing results.

### Acceptance criteria

- A parent can register at least two children without repeating parent,
  emergency contact, terms, or verification steps.
- Each child can have different years, subjects, classes, medical details, and
  permission settings.
- Submission is atomic: either every child record is created or none are.
- Each child appears as a normal pending enrolment in the admin portal.
- Admin acceptance still creates one student and links the existing parent.
- The parent receives one welcome email for the grouped submission.
- Existing single-child submissions continue working.

## Testing and review gates

### Website

- Add a test framework if the registration runtime is retained as imperative
  DOM code; Vitest with jsdom is the preferred fit.
- Unit test availability calculation and colour classification.
- Test referral validation and conditional detail behaviour.
- Test adding, editing, and removing children.
- Test single-child and multi-child API payload validation.
- Test atomic batch creation failure.
- Run:
  - `yarn lint`
  - `yarn build`

### Admin portal

- Extend `src/pages/EnrolmentPages.test.jsx`.
- Add tests for source display/filtering and grouped-sibling navigation.
- Add Functions tests for grouped welcome-email suppression.
- Run:
  - `npm test`
  - `npm run build`
  - `npm --prefix backend/functions test`
  - Relevant emulator tests for enrolment acceptance and triggers.

### Manual verification

- Test desktop and mobile layouts.
- Test keyboard navigation and visible focus states.
- Submit one-child and multi-child test registrations.
- Verify Firestore document fields.
- Verify admin portal visibility.
- Verify one parent welcome email and one admin notification per child.
- Accept each sibling enrolment and confirm the shared parent is reused.

## Deployment order

1. Complete and verify website-only items 1-3.
2. Implement referral fields in the website and admin portal.
3. Deploy the portal UI and any narrowly scoped Functions changes.
4. Deploy the website referral change.
5. Implement multi-child support behind backward-compatible API handling.
6. Deploy the grouped-email Functions change before enabling multi-child
   submission in production.
7. Deploy the website multi-child flow.
8. Perform a live test registration and verify Firestore, email, and portal
   behaviour.

## Repository boundaries

- Website changes belong in:
  `/Users/thomassowmi/Development/tenacity-tutoring`
- Admin portal and production Firebase Functions changes belong in:
  `/Users/thomassowmi/Development/tenacity-web-portal`
- Broad Firebase Functions deployments must be run from the admin portal
  repository.
- The admin portal currently has unrelated resource-generator changes. Use a
  separate clean worktree or branch for the portal portion of this roadmap.
