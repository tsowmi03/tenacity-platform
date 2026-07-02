# Tenacity Web Portal — Change Log

A curated, task-level history of this codebase: what changed, why, and what's
left. This is deliberately different from `git log` — commits are grouped into
the actual piece of work they belong to, trivial/mechanical commits are
omitted, and open follow-ups are tracked alongside the change that created
them.

**Source material:** full git history (161 commits at time of writing, back to
2026-01-21) plus the standing planning docs — `RESOURCE_GENERATOR_ROADMAP.md`,
`RESOURCE_DIAGRAM_OVERHAUL_ROADMAP.md`, `frontend/V2_ROADMAP.md`,
`frontend/CLAUDE_MOCKUP_ROADMAP.md`, and `backend/PLAN.md`.

## How to use / update this log

- **Newest entries go at the top**, directly under this section.
- One entry per *task or piece of work*, not per commit or per file. If a
  branch/PR touched many files for one goal, that's one entry.
- Each entry: **date**, what changed (a few bullets, plain language), status,
  and **Next steps** only when there's a real, specific follow-up (not a
  generic "could be improved").
- Pull recurring open items into **Open items / backlog** below rather than
  repeating them in every entry.
- When a roadmap doc gets a section completed or closed, note it here and
  update the doc's own status marker too — this log and the roadmap docs
  should agree.

---

## Index

| Date | Entry |
|---|---|
| 2026-07-02 | [Stimulus sourcing works with uploaded reference files; excerpting + fetch reliability](#2026-07-02--stimulus-sourcing-works-with-uploaded-reference-files-excerpting--fetch-reliability) |
| 2026-07-02 | [Demand-driven stimulus sourcing (plan what/whether to fetch)](#2026-07-02--demand-driven-stimulus-sourcing-plan-whatwhether-to-fetch) |
| 2026-07-01 | [English stimulus sourcing + rendering extended to all English resource types](#2026-07-01--english-stimulus-sourcing--rendering-extended-to-all-english-resource-types) |
| 2026-07-01 | [English stimulus: block-aware rendering + public-domain sourcing for practice papers](#2026-07-01--english-stimulus-block-aware-rendering--public-domain-sourcing-for-practice-papers) |
| 2026-07-01 | [Regenerate: resubmit a completed resource as a new job](#2026-07-01--regenerate-resubmit-a-completed-resource-as-a-new-job) |
| 2026-07-01 | [CI/CD: auto-deploy hosting on push to main](#2026-07-01--cicd-auto-deploy-hosting-on-push-to-main) |
| 2026-07-01 | [Resource history: details view, downloadable files, pagination & filtering](#2026-07-01--resource-history-details-view-downloadable-files-pagination--filtering) |
| 2026-06-30 | [Verified public-domain text sourcing for English resources](#2026-06-30--verified-public-domain-text-sourcing-for-english-resources) |
| 2026-06-16 – 06-18 | [AI JSON backslash/LaTeX corruption fix](#2026-06-16--06-18--ai-json-backslashlatex-corruption-fix) |
| 2026-06-15 – 06-16 | [English-subject resource support hardening](#2026-06-15--06-16--english-subject-resource-support-hardening) |
| 2026-06-13 | [Multi-child enrolment handoff](#2026-06-13--multi-child-enrolment-handoff) |
| 2026-06-12 | [Enrolment referral source tracking](#2026-06-12--enrolment-referral-source-tracking) |
| 2026-06-11 – 06-12 | [Resource job pipeline hardening + suggestion system](#2026-06-11--06-12--resource-job-pipeline-hardening--suggestion-system) |
| 2026-06-11 | [Infra: syncUserRoleClaim + Node 22 runtime](#2026-06-11--infra-syncuserroleclaim--node-22-runtime) |
| 2026-06-02 – 06-11 | [Diagram rendering overhaul](#2026-06-02--06-11--diagram-rendering-overhaul) |
| 2026-06-04 | [Firestore rules: block public enrolment writes](#2026-06-04--firestore-rules-block-public-enrolment-writes) |
| 2026-05-22 – 2026-06-02 | [Resource generator v1: pipeline, DOCX builders, maths rendering](#2026-05-22--2026-06-02--resource-generator-v1-pipeline-docx-builders-maths-rendering) |
| 2026-05-18 – 05-19 | [Operational UI cleanup: enrolments, people, classes, invoices, audit](#2026-05-18--05-19--operational-ui-cleanup-enrolments-people-classes-invoices-audit) |
| 2026-05-15 – 05-16 | [Portal v2: frontend shell, all core pages, dashboard](#2026-05-15--05-16--portal-v2-frontend-shell-all-core-pages-dashboard) |
| 2026-05-13 – 05-14 | [Backend migration into portal repo (Phases 1–6)](#2026-05-13--05-14--backend-migration-into-portal-repo-phases-16) |
| 2026-01-21 – 02-02 | [Initial project setup](#2026-01-21--02-02--initial-project-setup) |

---

## 2026-07-02 — Stimulus sourcing works with uploaded reference files; excerpting + fetch reliability

**What changed**
- **Fixed the bug where uploading any reference file silently disabled stimulus
  sourcing.** A tutor who attached an assessment notification, a past paper and
  a stimulus booklet (job `Ky8lgQrbsUS3ciNPxxYZ`) got a practice paper whose
  three "texts" were AI-invented ("Tenacity Resources", no sources) — the
  `!hasUploadedContent` gate skipped planning entirely. Uploads no longer
  disable sourcing; instead the planner is shown short excerpts of each
  uploaded document (up to 1,500 characters per file) and decides itself.
- The planner's rules for uploads: they are context, not text to reprint.
  Texts inside a modern booklet are copyrighted, so it plans public-domain
  works mirroring their kinds/themes/difficulty (poem slot → PD poem, memoir
  slot → PD memoir). It stands down only when the tutor clearly wants a
  specific uploaded text itself studied (a set text), in which case the model
  builds on the uploaded material directly.
- **Whole books are now excerpted.** A planner pick like *Great Expectations*
  used to ship `ok:true` with the entire ~184k-word novel as the passage. Long
  bodies are cut to a deterministic opening excerpt (~200–800 words, near the
  planned length): start at the body of the first chapter when one exists
  (skipping other people's prefaces — e.g. Garrison's preface in Douglass's
  *Narrative*), skip front matter (title pages, contents lists, all-caps
  registration notices), keep whole paragraphs, stay a contiguous verbatim
  slice. Excerpted texts are labelled "Extract from …" in the booklet and the
  prompt.
- **Poems now fall back to Gutenberg** when Wikisource can't verify one:
  the named piece is sliced out of its collection, first-line titles match
  ("When I was one-and-twenty" is a first line, not a heading, in *A Shropshire
  Lad*), poem-appropriate length thresholds apply, and verse keeps its line
  breaks (common indent stripped) instead of being unwrapped into prose.
- Fetch-quality fixes found by live testing: collection-hint Gutendex queries
  are scored against the collection title (a correctly-found collection was
  being rejected for not overlapping the poem title); Gutendex calls use the
  canonical `/books/` URL (avoids a 301 per query) and retry once on timeout;
  Wikisource candidate scoring ignores function words ("and", "was") that let
  unrelated pages count as matches.
- Added `.github/workflows/deploy-functions.yml`: deploys Cloud Functions on
  pushes to main touching `backend/functions/**`, using the same
  service-account secret as the hosting workflow (local `firebase login` had
  expired and needs an interactive reauth).

**Why:** English resources are meant to prefer real, verifiable texts with AI
generation as the fallback — but the most common real-world flow (tutor uploads
the school's assessment materials) was exactly the one that turned sourcing
off, and the fetch layer had gaps (whole novels, missed poems) that live
testing surfaced once the gate was fixed.

**Status:** Merged to `main` and live: hosting via its workflow, functions
deployed locally (`firebase deploy --only functions`) after a credential
reauth — the new functions workflow still needs a one-time IAM grant before it
can deploy (see CI/CD backlog). 541/541 backend tests pass. Verified live
end-to-end against the failing job's inputs: the planner produced a poem +
prose + memoir plan mirroring the uploaded booklet and all three texts fetched
and verified (Wikisource poem with lineation, Gutenberg excerpts starting at
real prose).

---

## 2026-07-02 — Demand-driven stimulus sourcing (plan what/whether to fetch)

**What changed**
- Replaced the fixed pre-fetch (which always sourced a text for every eligible
  English generation, on a hard-coded type plan) with a **demand-driven** step.
  A single cheap planning call (`planStimulusSelections`) decides, from the
  resource type + year + tutor instructions:
  1. **whether** the resource needs the student to read provided text(s) at all
     — a grammar/skills resource returns `needed:false` and **fetches nothing**;
  2. **what** it needs — the specific public-domain works, with kind and count
     chosen to fit the request (poems for a poetry paper, a short story for a
     narrative comprehension, non-fiction for an informational-texts unit, or a
     mix), capped at 3.
- Those chosen works are then fetched deterministically (Wikisource for poems,
  Gutenberg for prose/non-fiction). Because the planner returns the actual
  selections, the fetch reuses them directly — so sourcing now costs **one**
  model call (the plan) instead of one selection call per fixed text, and often
  **zero** fetches.
- Added `"nonfiction"` as a stimulus text type (routes to Gutenberg like prose)
  so informational/persuasive-text papers are supported.
- Kept the downstream safeguards: practice papers still always apply the fetched
  booklet; other types apply it only when the model presents a reading text.

**Why:** the previous version pre-fetched on every English generation regardless
of need, adding latency/cost to skills-based resources that don't want a text,
and couldn't adapt to what a given paper actually wanted (poetry vs short story
vs informational). Tom asked for it to fetch only if needed, and fetch what's
needed.

**Status:** Merged to `main`; functions redeployed. 526/526 backend tests pass,
including planner unit tests and pipeline tests proving nothing is fetched when
the planner says no stimulus is needed.

**Next steps**
- The planner is one extra (cheap, 1024-token) call on eligible English jobs —
  the minimum needed to make the decision. If reliability of the `needed`
  decision proves imperfect in practice, tune `STIMULUS_PLAN_SYSTEM_PROMPT`.

---

## 2026-07-01 — English stimulus sourcing + rendering extended to all English resource types

**What changed**
- Rolled the reading-stimulus mechanism (block-aware rendering + verified
  public-domain sourcing) out from `practice-paper`/`annotation-task` to **every
  English resource type**: `worksheet`, `diagnostic-test`, `mixed-review`,
  `topic-booklet`, `study-guide`, and `essay-scaffold`.
- Centralised the plumbing so it is uniform and low-duplication:
  - `builder/common.js` `renderStimulusBooklet(resource, subject)` — one shared
    block-aware "Stimulus booklet" renderer every English builder calls near the
    top (practice-paper refactored onto it too).
  - `builder/validation.js` `optionalStimulus()` — shared stimulus validator.
  - `promptBuilder.js` `stimulusSchemaField()` / `stimulusInstructionFor()` —
    shared schema fragment + instruction, added to each English prompt (English
    only; maths types are unchanged).
- **Model-gated** to avoid derailing skills-based resources: a verified text is
  sourced up front and offered to the model, but only written into the document
  when the model chose to present a reading text. Practice papers are the one
  exception — their stimulus is intrinsic, so the verified booklet is always
  applied. A grammar worksheet or technique study guide therefore never gets an
  irrelevant passage forced onto it.
- Sourcing plan per type: a practice paper gets a poem + prose-extract booklet;
  every other type gets a single text whose kind the model picks to suit the
  brief. `custom` (freeform blocks) is intentionally excluded.

**Why:** Tom wanted verified real texts and correct stimulus formatting
available across all English resources, not just the two types fixed first.

**Status:** Merged to `main`; functions redeployed. 523/523 backend tests pass,
including real-render coverage for every English builder and pipeline tests
proving the model-gating (sourced text applied only when a reading text is
present; always applied for practice papers).

**Next steps**
- Pre-sourcing runs for every eligible English generation (a selection call +
  fetch), so teaching/planning types that often omit a stimulus pay a small
  latency cost for a text they may not use. If that becomes noticeable, gate
  pre-sourcing more tightly (e.g. only when the request reads as comprehension).

---

## 2026-07-01 — English stimulus: block-aware rendering + public-domain sourcing for practice papers

**What changed**
- Extended the 2026-06-30 public-domain text work (previously
  `annotation-task` only) to **English practice papers**, fixing two bugs seen
  on a real generation: the stimulus texts rendered as one run-on block, and
  they were AI-invented ("Tenacity Resources") rather than real texts.
- **Formatting:** practice papers now carry a first-class `stimulus` array
  (poem / prose entries) instead of cramming texts into a question stem. The
  shared block-aware renderer (`builder/passage.js`, extracted from
  `annotationTask.js`) preserves prose paragraph breaks and poem stanza/line
  breaks; each text renders in its own shaded box in a "Stimulus booklet".
- **Sourcing:** for English practice papers the pipeline now sources a *set* of
  verified public-domain texts up front (poem via Wikisource, prose extract via
  Gutenberg) and has the model build the paper's questions around them, then
  overwrites the booklet with the verified bytes so it is provably the source
  text. Best-effort per text — any that cannot be verified falls back to a
  cleanly-formatted, honestly-attributed model text.
- Root cause of the earlier "still broken" reports: the 2026-06-30 fixes were
  wired into `annotation-task` only; a practice paper uses a different builder
  and prompt path and never got them.

**Why:** Tom wanted real, citable stimulus texts and correct formatting across
English resources, starting with the practice paper that surfaced the bug.

**Status:** Merged to `main`; backend redeployed (functions do not auto-deploy).
511/511 backend tests pass, including new stimulus-rendering and multi-text
sourcing coverage.

**Next steps**
- The mechanism is generalised (a resource-type set + prompt hook), so
  extending sourcing to other English passage-based types is now
  incremental — Tom wants it available for **all** English resources; do the
  remaining types as a follow-up.
- Multi-text sourcing leans on poems + prose extracts (reliably verifiable);
  personal essays rarely verify and will fall back to model text.
- Repair pipeline does not re-source, so a practice paper that needs a JSON
  repair after a build failure can fall back to model-written stimulus text
  (same characteristic as `annotation-task`).

---

## 2026-07-01 — Regenerate: resubmit a completed resource as a new job

**What changed**
- Added a **Regenerate** action to completed resource-history rows (and the job
  details modal) that resubmits a past generation as a brand-new job, reusing
  the exact same student, subject/year/type, answer mode, custom prompt, and
  attached reference files. Distinct from **Retry** (which re-runs a
  failed/cancelled job in place); confirmed via a dialog since it incurs a new
  AI cost, and permission-gated like Retry/Delete (admin or the job's creator).

**Why:** tutors had no quick way to re-run a completed generation with the same
inputs (e.g. to pick up a backend fix) without re-entering everything.

**Status:** Live (merged to `main`, hosting deployed). 133/133 frontend tests
pass.

---

## 2026-07-01 — CI/CD: auto-deploy hosting on push to main

**What changed**
- Added a GitHub Actions workflow (`.github/workflows/deploy-hosting.yml`) that
  builds the frontend and deploys to Firebase Hosting on every push to `main`,
  using a `FIREBASE_SERVICE_ACCOUNT` repo secret — no personal
  `firebase login` session required.
- Fixed a real outage this introduced: the CI build ran without the local
  `.env`, so the first auto-deploy shipped a bundle with no Firebase config
  and broke the login page ("Missing required env var: VITE_FIREBASE_PROJECT_ID").
  Fixed by storing `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_AUTH_DOMAIN` /
  `VITE_FIREBASE_PROJECT_ID` as repo secrets and passing them into the build
  step.
- Replaced `FirebaseExtended/action-hosting-deploy` with a direct
  `firebase deploy --only hosting` call — the action reported a false failure
  ("already the active version") on an otherwise-successful deploy, which
  would have hidden real failures later.

**Why:** the previous deploy path depended on Tom being signed into the
Firebase CLI locally; that session expired while working remotely with no way
to `firebase login --reauth` (browser OAuth, can't be scripted). This removes
that single point of failure permanently.

**Status:** Live. Verified end-to-end: pushed a commit, watched the Actions
run go green, and confirmed the live bundle at
`https://tenacity-tutoring-b8eb2.web.app` has the correct config and latest
features.

**Next steps**
- Functions are **not** covered by this workflow (deliberately — functions
  deploys are heavier and this branch was frontend-only). A similar
  `deploy-functions.yml` could be added later if function changes should also
  auto-deploy; worth deciding whether that should be on-push or manual
  (`workflow_dispatch`) given the blast radius of an auto-deployed function
  bug.

---

## 2026-07-01 — Resource history: details view, downloadable files, pagination & filtering

**What changed**
- Added a **Details** action on every resource job row (live queue and
  history) that opens a modal showing exactly what produced the resource:
  type, subject, year, student, answer mode, topics, the full custom prompt,
  attached reference files, who requested it, and timestamps.
- Attached reference files in that modal are now **downloadable links**
  (fetches the original upload from Storage), not just file names.
- History is capped at 10 rows with a **Show more / Show less** control and a
  "Showing X of Y" count, plus a **status filter** (All / Ready / Failed /
  Cancelled) alongside the existing text search.

**Why:** tutors had no way to see or re-check what a past generation was
actually built from, and the history list had no limit or way to narrow it
down as it grew.

**Status:** Live (merged to `main`, deployed). 128/128 frontend tests pass;
verified live in the portal (screenshots taken during the session) including
a real file download and the pagination/filter interactions.

**Next steps**
- History still only fetches the **50 most-recent** jobs from Firestore
  (`subscribeResourceJobHistory`), so "Show more" pages through those 50, not
  the full history. True deep history needs server-side cursor pagination —
  this is tracked as item #8 in `RESOURCE_GENERATOR_ROADMAP.md`.

---

## 2026-06-30 — Verified public-domain text sourcing for English resources

**What changed**
- New architecture for English annotation-task passages: instead of the model
  writing (or claiming to write) a public-domain text from scratch, the model
  now only **curates** (picks a real title/author fitting the brief), and the
  backend **deterministically fetches the verified source text**:
  - Prose → Project Gutenberg (Gutendex API → plain text → boilerplate/
    front-matter strip → hard-wrap unwrap).
  - Poems → Wikisource (search → follow `{{versions}}` landing pages → extract
    the `<poem>` block).
  - The fetched text — not the model's retype — is written into the final
    document, with a citation URL, so the passage is auditable against a
    real source.
- Fixed a related formatting bug (discovered while testing this): the DOCX
  builder was flattening passage line breaks into one run-on block, and
  separately mangled hard-wrapped Gutenberg prose into a ragged column broken
  mid-sentence. Fixed by making the builder block-aware (blank line = new
  paragraph/stanza, single newline = intentional line break) and unwrapping
  Gutenberg's hard wraps before rendering.
- Shipped behind `RESOURCE_PD_TEXT_SOURCING`, later defaulted to **on** in
  code (not via a gitignored `.env`, so it survives every deploy) rather than
  set per-environment.

**Why:** Tom wanted comprehension/analysis passages to be real, citable texts
rather than AI-invented ones, for skills-practice resources where the classic
public-domain canon (poetry, short fiction) is more than sufficient.

**Status:** Live in production. 500/500 backend tests pass. Verified with real
generations (Frost's "The Road Not Taken" via Wikisource, Poe's "The Cask of
Amontillado" via Gutenberg) rendering correctly as DOCX.

**Next steps**
- Wikisource coverage is partial by design: only pages with a clean inline
  `<poem>` tag are accepted as verified; pages that are proofread-scan
  transclusions (no `<poem>` tag) are skipped rather than risk unreliable
  text. Broadening this needs parsing Wikisource's *rendered HTML*, not just
  wikitext — explicitly deferred, not started.
- Only wired into `annotation-task`. Other passage-based English types were
  not in scope for this change.

---

## 2026-06-16 – 06-18 — AI JSON backslash/LaTeX corruption fix

**What changed**
- Fixed corrupt `.docx` output caused by single-backslash LaTeX sequences
  inside AI-generated JSON (e.g. `\frac`) being mis-parsed as JSON escape
  sequences.
- Parameterized the backslash-repair logic by subject: maths content preserves
  LaTeX commands as literal backslashes; English/prose content treats `\n`,
  `\t`, etc. as the real JSON escapes they are, so paragraph breaks survive
  instead of being eaten. (Math-bearing repair stayed the default so every
  existing maths/worksheet path was unaffected; English generation opted into
  the prose-safe vocabulary.)

**Status:** Merged via PR #8, live.

---

## 2026-06-15 – 06-16 — English-subject resource support hardening

**What changed**
- Added optional **answer modes** (none / answers / worked) as an explicit
  choice in the resource builder, instead of one fixed behaviour.
- Support for **multiple reference file uploads** per job (previously single).
- English-specific formatting fixes: disabled math typesetting for English
  resources (it was misfiring on ordinary punctuation), fixed passage
  paragraph breaks and list consistency.
- Added clear, user-facing errors and made in-flight generation cancellable.
- Enforced strict "human writing" rules in prompts to eliminate common
  AI-writing tells (banned stock phrases, self-correction language, etc.).
- Restricted mark allocations to practice papers only (they didn't make sense
  on other resource types).
- Fixed custom resource generation: blocks are now dispatched by type instead
  of being flattened into a generic table, so custom resources actually
  render as intended.
- Forked the content model by subject for topic booklets/study guides —
  maths teaches through worked examples, English through quote → technique →
  effect model analysis — rather than forcing one shape onto both.

**Status:** Live.

---

## 2026-06-13 — Multi-child enrolment handoff

**What changed:** Support for a parent enrolling multiple children in one
handoff flow, rather than one enrolment at a time.

**Status:** Merged via PR #6, live.

---

## 2026-06-12 — Enrolment referral source tracking

**What changed:** Admin-facing support for recording how a family found out
about Tenacity (referral source) on enrolments.

**Status:** Live.

---

## 2026-06-11 – 06-12 — Resource job pipeline hardening + suggestion system

**What changed**
- **P0 job pipeline hardening**: closed reliability gaps in the resource job
  queue/worker (`runQueueForTutor` and related recovery paths).
- Added **diagram failure recovery** so a broken diagram no longer takes down
  an otherwise-valid resource.
- Shipped the **resource suggestion system** (Parts A–C of
  `RESOURCE_GENERATOR_ROADMAP.md` item #10): a canonical topic taxonomy
  (`topicTaxonomy.js`) shared by prompts and queries, `extractedTopics`
  recorded on every completed job, and a frontend UI that surfaces
  previously-generated resources matching subject/year/topic before a tutor
  submits a new (costly) generation — including cross-format matches (e.g. a
  worksheet suggested against a mixed-review request on the same topic).
- Added GCS bucket CORS config so authenticated downloads work correctly.

**Status:** Merged via PR #5, live. Per the roadmap doc's own status note,
Parts A–C are implemented and tested; the Firestore composite index this
needs was deployed.

**Next steps**
- Phase 3 of the suggestion system (semantic/embedding search, catching
  matches like "Shakespeare tragedy" → Macbeth) is explicitly deferred —
  roadmap doc calls it "almost certainly overkill" unless keyword matching
  proves insufficient in practice.
- Suggestions only surface for resources generated **after** this change —
  older job documents have no `extractedTopics` field and won't appear as
  matches.

---

## 2026-06-11 — Infra: syncUserRoleClaim + Node 22 runtime

**What changed:** Deployed the `syncUserRoleClaim` function and upgraded the
Cloud Functions runtime to Node 22.

**Status:** Live.

---

## 2026-06-02 – 06-11 — Diagram rendering overhaul

**What changed:** A ground-up rebuild of maths diagram rendering, moving from
one-off SVG coordinate patches to a deterministic, validated diagram system.
See `RESOURCE_DIAGRAM_OVERHAUL_ROADMAP.md` for the full design (diagram
registry, semantic contract, collision-checked layout primitives). Delivered
incrementally, one diagram family at a time:

- Diagram registry + validation baseline, collision primitives, layout
  assertions (foundation, no prompt-visible behaviour change yet).
- Angle-on-line and parallel-line label placement stabilized.
- Rectangle family, L-shape cutouts, compact dimension labels stabilized.
- Mixed composite, right-triangle, and general-triangle diagrams stabilized.
- Circle/sector, prism/cylinder, advanced solids, parallelogram/trapezium
  diagrams stabilized.
- Annulus and elevation/depression diagrams stabilized.
- Investigated and closed out JSXGraph as a rendering-library option (root
  cause documented in the roadmap doc) — stayed on the custom SVG→PNG
  pipeline.

**Why:** shape/geometry diagrams were previously disabled by policy because
label overlaps and inconsistent layout made them unreliable for real tutor
use. This closed that gap family-by-family with fixtures and layout
assertions rather than more coordinate patching.

**Status:** Completed 2026-06-11 (per the roadmap doc's own status marker).
Merged via PR #4. Required-diagram failures now fail loudly with a repair
attempt; optional-diagram failures are omitted and surfaced as a tutor-facing
warning rather than silently dropped.

**Next steps (from the roadmap's "Open Decisions", all explicitly future/maybe)**
- Whether chart/statistics diagrams should move from custom SVG to a
  library like D3 once label density becomes a real problem.
- Whether JSXGraph is worth revisiting if an adapter can prove reliable text
  export/sizing/cropping in Node (currently: no).
- Whether Asymptote's output quality would justify its non-JS toolchain for
  3D solids/nets (currently: not pursued).

---

## 2026-06-04 — Firestore rules: block public enrolment writes

**What changed:** Closed a Firestore rules gap that allowed unauthenticated
writes to enrolments.

**Status:** Live.

---

## 2026-05-22 – 2026-06-02 — Resource generator v1: pipeline, DOCX builders, maths rendering

**What changed:** The first end-to-end build of the AI resource generator —
from prototype to a working production feature, merged via PR #3.

- Backend job pipeline: submission, worker processing, retry, and recovery
  for resource generation jobs (`resourceJobs` Firestore-triggered Cloud
  Functions).
- DOCX builders for worksheets and then the remaining resource templates
  (practice paper, topic booklet, study guide, diagnostic test, mixed review,
  custom).
- Routed generation to Claude Sonnet; diagram rendering wired into worksheets.
- Extensive maths rendering hardening: LaTeX → OMML conversion covering
  fractions, roots, exponents, Greek letters, and deeply nested expressions;
  stripped stray `$...$` delimiters; fixed six distinct practice-paper DOCX
  rendering bugs.
- AI response robustness: JSON validation, an auto-repair pass for malformed
  AI JSON (both before regenerating and before failing a job outright),
  streaming support for long generations so they don't time out, and a
  verification pass to catch and clean AI "rambling" in maths working-out.
- Added the working-out/sample-answers toggle and resource history deletion.
- Increased worker memory and the output token cap to handle larger
  generations.
- Also in this window: adjusted one-off booking payment handling and allowed
  direct feedback writes (unrelated to resources, same period).

**Status:** Live, and the foundation every later resource-generator entry in
this log builds on.

---

## 2026-05-18 – 05-19 — Operational UI cleanup: enrolments, people, classes, invoices, audit

**What changed:** Portal v2 Phases 3–6 and 8 (see `frontend/V2_ROADMAP.md`) —
turning the initial page shells into usable day-to-day admin tools.

- Enrolments: removed leaked implementation details (Firestore IDs) from the
  UI, fixed accepted enrolments incorrectly showing as archived, added batch
  archive/delete actions.
- People: cleaned up detail UI, fixed admin class assignments, grouped
  classes by day.
- Classes: restructured class detail page around attendance documents,
  waitlist, and roster; normalised `weekNum`/`weekNumber` to one field;
  removed then reinstated inline waitlist management (moved from standalone
  pages into class detail, per the v2 scope decision); moved the permanent
  roster into the sidebar.
- Invoices: cleaned up the UI and repaired PDF download; added sortable
  status/invoice-number columns.
- Replaced the placeholder Settings page with a proper **Audit page** backed
  by `adminAuditLogs`, with filters and expandable before/after detail; added
  a shared app-wide audit-logging function and expanded coverage across admin
  actions.
- Added term management page; enforced strict subject options for students;
  mobile responsiveness pass across the portal; added compatibility-first
  Firestore rules.

**Status:** Merged via PR #2, live. Per `frontend/V2_ROADMAP.md`, Phases 3, 4,
5, 6, and 8 are all marked complete.

---

## 2026-05-15 – 05-16 — Portal v2: frontend shell, all core pages, dashboard

**What changed:** The frontend conversion from the original Flutter-adjacent
prototype to the current Vite + React admin portal — see
`frontend/V2_ROADMAP.md` and `frontend/CLAUDE_MOCKUP_ROADMAP.md` for the
design brief this followed.

- Frontend shell, navigation, and the backend API layer (`src/backend/*Api.js`)
  connecting to the Cloud Functions built the week before.
- Read-only people detail routes, then create-user/create-student forms.
- Phases 4–9 delivered in sequence: mutations, classes/attendance, waitlist
  management, invoices (list/detail/create/edit/delete/PDF), reports
  (income/aging/attendance/enrolment/utilisation), and settings
  (overview/terms/audit/maintenance).
- Added the Vitest + React Testing Library frontend test stack (Phase 10).
- Gated the dashboard behind the admin role; rebuilt the dashboard to surface
  revenue trends, audit activity, and upcoming classes instead of placeholder
  content.

**Status:** Merged via PR #1 ("v1.1"), live. Per the v2 roadmap doc, Phases 1
and 2 (shell, dashboard) are marked complete.

---

## 2026-05-13 – 05-14 — Backend migration into portal repo (Phases 1–6)

**What changed:** Migrated Cloud Functions ownership from the Flutter app's
functions package into this portal repo, then built out the admin backend
surface in phases (see `backend/PLAN.md`):

- Phase 1: backend foundation — auth guard, schemas, factories, shared audit
  log.
- Phase 2: user and student management (create, update, delete).
- Phase 3: enrolment lifecycle (accept, archive, delete, update).
- Class and attendance admin functions.
- Phase 5: invoice backend support.
- Phase 6: report callables — income, aging, attendance, student enrolment,
  class utilisation — plus PDF/XLSX export formats and Firestore index
  additions to support them.
- Fixed the parent-onboarding email flow along the way.

**Why:** the portal needed to operate against the same Firebase project and
Firestore schema as the existing Flutter parent/tutor app, without breaking
that app's assumptions — full compatibility constraints are documented in
`backend/PLAN.md`.

**Status:** Live; this is the backend foundation every later feature in this
log is built on.

---

## 2026-01-21 – 02-02 — Initial project setup

**What changed:** Repository created; enrolment portal prototype rebuilt on
Vite + React; email functions migrated in from the app repo; enrolments
backfilled with an `archived` field and the portal's first list view (sorted
by archive state); added a scheduled function to purge invoices older than 6
months.

**Status:** Superseded by the v2 rebuild (2026-05-15 entry above), kept here
for history.

---

## Open items / backlog

Pulled from the still-open sections of `RESOURCE_GENERATOR_ROADMAP.md` (the
most actively maintained roadmap) plus follow-ups identified during recent
work. Not all of these are prioritised — treat this as a candidate list, not
a commitment.

### Resource generator
1. **Email notification on job ready/failed** — SendGrid is already wired in;
   needs a `sendResourceReadyEmail` call at the end of the success/failure
   paths. (~1 day)
2. **Orphaned uploaded reference files** — files land in
   `resources/uploads/{uid}/...` and are never cleaned up if job creation
   fails after upload. (~1–2 days)
3. **Pending jobs stuck if the Firestore trigger silently fails** —
   `recoverStuckResourceJobs` only recovers `processing` jobs with expired
   leases, not orphaned `pending` ones. (~half a day)
4. **Year 11–12 support** — currently hard-capped at Year 10
   (`validateSubmitResourceJobPayload`); HSC subjects are unsupported.
   (~1–2 days)
5. **Resource preview before download** — tutors only get a DOCX with no
   preview of content/quality before opening it.
6. **Cost/usage monitoring** — no per-tutor token usage tracking or spend
   dashboard.
7. **Upload file size enforcement** — no size cap on reference uploads,
   client or Storage-rules side.
8. **Deeper history pagination** — history queries cap at 50 most-recent
   jobs; the pagination UI shipped 2026-07-01 pages through that 50, not the
   full history. Needs a Firestore cursor (`startAfter`).
9. **Storage retention policy** — completed job outputs and uploads are kept
   indefinitely; no scheduled cleanup.
11. **Per-tutor queue filter for admins** — live queue has no filter when
    multiple tutors are active.
12. **Re-run from history** — no "duplicate with same settings" action on a
    history row.
13. **Staged job count cap** — no soft limit on jobs staged before submit.
14. **Wider subject coverage** — only Maths and English; Science (junior)
    flagged as the natural next subject.
15. **Resource sharing with parents** — `resources/output/` reads are
    staff-only; no signed-URL sharing mechanism.

*(Item #10, the resource suggestion system, is done — see the 2026-06-11
entry above.)*

### Public-domain text sourcing (added 2026-06-30)
- Wikisource poem coverage only accepts pages with a clean inline `<poem>`
  tag; proofread-scan transclusion pages are skipped rather than risk
  unreliable text. Broadening this needs rendered-HTML parsing, not just
  wikitext — not started.
- Only wired into `annotation-task`; not extended to other passage-based
  English resource types.

### CI/CD (added 2026-07-01, updated 2026-07-02)
- A functions deploy workflow now exists (`deploy-functions.yml`, triggered by
  pushes to `main` touching `backend/functions/**`), but it fails until the
  GitHub deploy service account is granted **Service Account User**
  (`iam.serviceAccounts.actAs`) on
  `tenacity-tutoring-b8eb2@appspot.gserviceaccount.com`. Until then, functions
  deploys remain manual/local (`firebase deploy --only functions`). One-line
  grant in Cloud Console → IAM & Admin → Service Accounts. (~5 min)

### Diagram rendering (from `RESOURCE_DIAGRAM_OVERHAUL_ROADMAP.md`)
- Core overhaul is complete (closed 2026-06-11). Remaining items are
  explicitly speculative: moving chart/statistics diagrams to a library like
  D3 if label density becomes a real problem; revisiting JSXGraph or
  Asymptote only if a future need justifies the toolchain cost.

### Portal v2 UI (from `frontend/V2_ROADMAP.md`)
- **Phase 7 (Revenue reports)** is the only phase in that roadmap without a
  "completed" status marker — the doc calls for interactive revenue graphs
  with date-range controls on the Reports page. Verify current
  `ReportsPage.jsx` state against this before assuming it's done or not
  started.

---

## Reference docs

- [`RESOURCE_GENERATOR_ROADMAP.md`](RESOURCE_GENERATOR_ROADMAP.md) — resource
  generator gaps and planned features (most actively maintained roadmap).
- [`RESOURCE_DIAGRAM_OVERHAUL_ROADMAP.md`](RESOURCE_DIAGRAM_OVERHAUL_ROADMAP.md) —
  diagram system design; core work closed 2026-06-11.
- [`frontend/V2_ROADMAP.md`](frontend/V2_ROADMAP.md) — portal v2 UI release
  plan, phase-by-phase status.
- [`frontend/CLAUDE_MOCKUP_ROADMAP.md`](frontend/CLAUDE_MOCKUP_ROADMAP.md) —
  original mockup-to-production conversion plan (largely superseded by
  `V2_ROADMAP.md`; some phase statuses in this doc are stale).
- [`backend/PLAN.md`](backend/PLAN.md) — backend build plan and Flutter-app
  compatibility constraints.
- [`BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md) — backend architecture
  reference.

---

## Operational notes

- **2026-06-30 / 2026-07-01:** an Anthropic API key and the
  `admin@tenacitytutoring.com` password were both pasted into a chat session
  for verification purposes. Rotate both if that hasn't already happened —
  they should be treated as compromised once shared in a chat transcript.
