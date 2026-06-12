# Resource Generator Roadmap

## Current state

The resource generator is end-to-end functional. The full backend pipeline (all five Cloud Functions), all nine DOCX builders, 40+ diagram validators, a repair pipeline, maths answer verification, prompt caching, and a polished frontend UI are all implemented. The feature can be deployed today.

This document tracks the gaps identified before routine real-world use and planned enhancements.

---

## High priority — address before wide rollout

### 1. Email notification when a resource is ready or fails

**Problem:** Generation takes 30–90 seconds. Tutors must keep the Resources page open and watch the queue update. There is no notification when a resource is ready to download, or when a job fails.

**What exists:** SendGrid is already wired into the backend (`src/email/sendgridSecret.js`, `src/email/welcomeEmail.js`). A `sendResourceReadyEmail` function needs to be added and called at the end of the success and failure paths in `runQueueForTutor` (`backend/functions/src/resources/index.js`).

**Scope:** Backend only. ~1 day.

---

### 2. Orphaned uploaded reference files

**Problem:** When a tutor uploads a reference PDF/DOCX, it lands in `resources/uploads/{uid}/{filename}`. It is only deleted when the user manually deletes the job from history. If the submission fails after upload (student not found, network error, validation failure), the file is orphaned permanently — no cleanup ever runs.

**Fix options:**
- Clean up the uploaded file in `submitResourceJob` if job creation fails.
- Add a scheduled Cloud Function that deletes upload files with no associated job document older than 24 hours.

**Scope:** Backend. ~1–2 days.

---

### 3. Pending jobs stuck if Firestore trigger fails

**Problem:** `processResourceJob` is triggered by `onDocumentCreated`. If the Cloud Functions invocation silently fails before the job is claimed, the job stays in `pending` state forever. `recoverStuckResourceJobs` only queries for `status == "processing"` jobs (expired leases) — it does not recover orphaned pending jobs.

**Fix:** Add a secondary query in `recoverStuckResourceJobsImpl` for pending jobs whose `createdAt` is older than a threshold (e.g. 15 minutes) and call `runQueueForTutor` for their creators. This closes the silent failure mode without touching the primary trigger path.

**Scope:** Backend. ~half a day.

---

### 4. Year 11–12 support

**Problem:** `validateSubmitResourceJobPayload` hard-rejects `year > 10`. Many tutoring centres serve HSC students, and resources for Year 11–12 subjects (Advanced Maths, Extension English, etc.) would be among the most valuable outputs.

**What is needed:** Extend the year range to 12, add Year 11 and 12 to the frontend `YEARS` array, review the system prompts to ensure they reference HSC curriculum context rather than junior secondary.

**Scope:** Frontend + backend. ~1–2 days.

---

## Medium priority

### 5. Resource preview before download

**Problem:** Tutors receive only a DOCX download with no way to see what was generated before opening it. If the output is poor quality or off-topic, the only path is to retry with a revised prompt.

**Options:**
- Show the AI-generated title and section headings (already available in `outputFileName` and the `generatedJson` stored on the job document) as a summary card.
- Render a basic HTML preview from the stored JSON before the DOCX is downloaded.

**Scope:** Frontend (summary card is a half-day; full HTML preview is 2–3 days).

---

### 6. Cost and usage monitoring

**Problem:** Each generation calls Claude Sonnet 4.6 with up to 24,000 output tokens (plus a verification pass for maths working-out jobs). With multiple tutors submitting jobs, API costs can grow quickly. There is no per-tutor usage tracking, monthly aggregate, or admin dashboard for monitoring spend.

**Fix:** Write a `tokensUsed` field onto each completed job document (from the API response's `usage` object) and add an admin view that aggregates by tutor and month.

**Scope:** Backend (~half a day to record) + Frontend (~1 day for a simple usage table).

---

### 7. Upload file size enforcement

**Problem:** Storage rules do not restrict file size. A very large uploaded PDF will be extracted into memory by the 1GiB Cloud Function, and large documents also produce very large user messages to the API. The frontend shows a file picker but has no explicit size cap or warning.

**Fix:** Add a `maxSize: 20MB` check in `uploadResourceReference` before the upload begins, and add a corresponding Storage rule condition (`request.resource.size < 20 * 1024 * 1024`).

**Scope:** Frontend + Storage rules. ~half a day.

---

### 8. History pagination

**Problem:** `listStudentResourceJobs` hard-limits to 30 items per student. `subscribeResourceJobs` (live queue) and `subscribeResourceJobHistory` (history panel) cap at 50. A student whose tutor generates weekly resources will overflow the 30-item list within months; older resources become inaccessible.

**Fix:** Add a `startAfter` cursor to `listStudentResourceJobs` and a "Load more" button to `StudentResourceHistory`. Raise or paginate the history panel limit similarly.

**Scope:** Frontend + backend API layer. ~1–2 days.

---

### 9. Storage retention policy

**Problem:** Completed job output files (`resources/output/`) and uploaded reference files (`resources/uploads/`) are kept indefinitely unless manually deleted. Long-term storage costs accumulate.

**Fix:** A scheduled Cloud Function that deletes output files (and optionally the Firestore job document) for jobs older than a configurable threshold (e.g. 90 days). The threshold should be admin-configurable.

**Scope:** Backend. ~1 day.

---

## Planned features

### 10. Resource suggestion system — find existing resources before generating

> **Status: Parts A–C implemented** (2026-06-11). Backend taxonomy, schema/prompt
> changes, topic extraction, Firestore index, and the frontend suggestion UI are
> done and covered by tests. Remaining before it works in production: deploy the
> new Firestore index (`firebase deploy --only firestore:indexes`). Suggestions
> only surface for resources generated *after* this change, since older job
> documents have no `extractedTopics` field. Phase 3 (semantic search) remains
> future scope.

**Problem:** If a tutor requests a resource on Macbeth, or a practice paper covering quadratics and indices, and one was already generated last month, it is wasteful (time and API cost) to regenerate. The system should surface matching previously-generated resources before the tutor submits a new job.

**Why filename matching alone is insufficient:** The AI-generated title for a practice paper is typically generic — `Year 10 Maths Practice Paper`. The topics covered (quadratics, indices, trigonometry) are buried in the question content and invisible at the filename level. A tutor typing "quadratics" would get no match against a paper that covers exactly that. Conversely, a paper on trigonometry must not appear as a suggestion for a quadratics search.

**The solution has three parts:**

#### Part A — Add `topics: string[]` to the three schemas that lack it

Three resource types currently emit no structured topic information:

| Type | Current state | Change |
|---|---|---|
| `practice-paper` | `"focus": null \| string` only | Add `"topics": string[]` |
| `annotation-task` | `passageTitle` / `passageAuthor` only | Add `"topics": string[]` |
| `essay-scaffold` | `essayType` / `essayQuestion` only | Add `"topics": string[]` |

The other six types already have usable topic data produced at generation time and need no schema change:

| Type | Existing field |
|---|---|
| `study-guide` | `"topics": string[]` ✅ |
| `diagnostic-test` | `"topics": string[]` ✅ |
| `mixed-review` | `"topics": string[]` ✅ |
| `worksheet` | `"topic": string` — wrap as `[topic]` at extraction |
| `topic-booklet` | `"topic": string` — wrap as `[topic]` at extraction |
| `custom` | `"topic": null \| string` — wrap as `[topic]` if present |

**A note on matching reliability:** Firestore `array-contains` is an exact string match. Free-text AI tags are inconsistent — the AI might produce `"logarithms"` one run, `"logs"` the next, and `"log functions"` a third time. None of those match each other in a query. A controlled vocabulary is required for the matching to be reliable.

**The vocabulary split:**

- **Maths topics and English skills — controlled list.** The system prompt for each resource type includes a canonical list of allowed topic strings drawn from the NSW curriculum (e.g. `quadratic equations`, `logarithms`, `trigonometry`, `indices` for maths; `annotation`, `close reading`, `essay writing`, `persuasive language` for English). The AI is instructed to use only those exact strings. This prevents the `"logs"` / `"logarithms"` / `"log functions"` divergence entirely.

- **English text titles — normalised free text.** Specific texts (`Macbeth`, `The Crucible`, `The Great Gatsby`) cannot be pre-listed. However, tutors spell text titles correctly and consistently. Storing them in lowercase (`"macbeth"`) and lowercasing the query input is sufficient for reliable matching.

**Query-time alias map.** A small alias dictionary handles common tutor abbreviations that differ from the canonical form: `"logs" → "logarithms"`, `"trig" → "trigonometry"`, `"quads" → "quadratic equations"`. Applied to the tutor's typed input before the Firestore query — not at storage time.

The canonical topic list and alias map live in a shared `topicTaxonomy.js` module used by both the prompt builder and the query normalisation logic. The side benefit is the frontend can offer topic autocomplete in the custom prompt field, nudging tutors toward known terms.

This change requires:
- `topicTaxonomy.js` — canonical topic arrays (maths + English skills) and alias map (~half a day to research NSW Year 5–10 curriculum topics)
- Updates to three schemas in `promptBuilder.js` to include the canonical list instruction
- Validation in the corresponding builders (`practicePaper.js`, `annotationTask.js`, `essayScaffold.js`)

**Scope:** Backend. ~1–2 days.

#### Part B — Record `extractedTopics` on the Firestore job document at completion
Because all nine types now produce topic data at generation time (either as `topics: string[]` or `topic: string`), extraction at completion is a single uniform helper:

```js
function extractJobTopics(parsed) {
  if (Array.isArray(parsed?.topics) && parsed.topics.length)
    return parsed.topics.filter(Boolean).map(t => t.trim().toLowerCase());
  if (typeof parsed?.topic === "string" && parsed.topic)
    return [parsed.topic.trim().toLowerCase()];
  return [];
}
```

Include `extractedTopics` in the completion patch written to Firestore in `runQueueForTutor`. Add a Firestore composite index on `[subject, resourceType, status, extractedTopics]` (array-contains) to enable full-history queries.

**Scope:** Backend. ~half a day (extraction + index).

#### Part C — Frontend suggestion UI
When the tutor has selected subject, year, and resource type and has a non-empty custom prompt, normalise the prompt through the alias map and query Firestore for completed jobs matching:
- Exact: `subject` + `resourceType`
- Near: `year` ± 1
- Topics: `extractedTopics` array-contains any canonical term resolved from the tutor's prompt

Show the top 2–3 matches above the "Add to queue" button as "Similar resources already exist — want to download one instead?" Each suggestion shows the AI-generated title, topics covered, student name, date, and a download button. The custom prompt field can offer topic autocomplete from the canonical list.

**Scope:** Frontend. ~1–2 days.

#### Phase 3 — Semantic embedding search (future scope only)
Generate embeddings for each resource's title and extracted topics at completion time. Find nearest neighbours at query time. Catches semantic matches (e.g. "Shakespeare tragedy" → Macbeth) that keyword overlap misses. Almost certainly overkill for a single tutoring centre's volume — only consider if Parts A–C prove insufficient.

---

## Lower priority / polish

### 11. Per-tutor queue filter for admins

Admins see all staff jobs in the live queue with no way to filter by tutor. With multiple tutors active simultaneously, the queue becomes noisy. A tutor filter dropdown on the queue panel would help.

**Scope:** Frontend only. ~half a day.

---

### 12. Duplicate / re-run from history

Tutors cannot re-generate a resource with the same settings as a previous job. A "Re-run with same settings" button on history rows would pre-populate the builder form.

**Scope:** Frontend only. ~half a day.

---

### 13. Staged job count cap

There is no UI limit on how many jobs can be staged at once. A soft cap (e.g. 10) with a visible counter would prevent accidental bulk submissions.

**Scope:** Frontend only. ~1 hour.

---

### 14. Wider subject coverage

Only Maths and English are supported. Adding a new subject requires: a new system prompt builder, a DOCX builder or re-use of `custom`, subject-specific prompt validation, and frontend additions. Science (junior stage) would be the natural next subject.

---

### 15. Resource sharing with parents

The current storage rules restrict `resources/output/` reads to `isStaff()` only. Parents cannot be given a direct download link. If sharing completed resources with parents is a workflow goal, a Cloud Function that generates signed URLs (with a short TTL) would be needed.

**Scope:** Backend + minimal frontend. ~1 day.
