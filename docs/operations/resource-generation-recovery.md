# Resource generation recovery

Resource workers save completed AI responses in private Storage objects under
`resources/checkpoints/<jobId>/`. The response key includes the model, schema,
and full prompt. Replay reads the saved response and never resubmits that call.
Only one new AI call runs in an invocation; the next uncached call yields to
`pending`, which the existing update worker resumes. The exception is the question bank
step (RES-71): its best-effort calls (`bestEffort` and `concurrent`) run four
at a time, each saved as it finishes, while the invocation budget allows. Its
waves of four (RES-80) are worked out from the saved searches and saved
responses alone, so a worker that carries the step on replays the same calls. Concurrent stages (diagram
fills) take that slot before any await, and the others wait for the started
call to be saved before yielding. Output finalization remains
fenced by the active attempt ID.

Maths worksheets with an explicit numeric question count ("180 worked
questions", "250 algebra questions") above 15 are generated
in batches of 15, with global numbering and earlier question stems supplied to
avoid duplicates. Worked answers are checked in batches of 15 for every resource
type. Explicit requests above 200 questions are rejected at submission. Requests
whose size is only described in prose or reference files still have the bounded
stage timeout and actionable failure; the numeric limit parser is not a semantic
interpreter of arbitrary instructions.

Each AI stage has a six-minute deadline and an AbortSignal. The remaining
invocation budget can shorten that deadline. A timed-out stage fails visibly
without automatic whole-resource regeneration; Retry reuses completed stages.
Successful batches are validated before they enter the journal. A stage
continuation moves to the back of that tutor's pending queue.

The minute scheduler only requeues expired leases and wakes pending jobs. It
never generates resources. Transactional attempt and lease checks prevent
concurrent recovery runs from replacing a live worker. Three automatic recovery
attempts are allowed before an actionable failure. Manual Retry resets that
counter. Retry resumes saved stages after a stage timeout or limit, a busy or
unreachable provider, or a cancellation. After a content failure (invalid JSON,
a missing required diagram, a model error) a saved response may be the cause, so
Retry deletes the journal and starts fresh. Deleting a resource also deletes its private journal.

Regression coverage includes a slow 180-question worksheet, hung providers,
late/superseded responses, invalid batches, queue fairness, and concurrent
recovery transactions in the Firestore emulator.

## Maths formatting repair (RES-45)

A maths resource is never marked Ready while the renderer falls back to plain
text for any expression. After the build reports fallbacks, only the fields
holding the broken notation are sent back to the model for a notation-only
rewrite (`src/resources/mathRepair.js`); a rewrite that changes the wording or
length substantially is ignored. The DOCX is then rebuilt from the same
content. Two repair rounds are allowed. If fallbacks remain, the job fails with
`RESOURCE_MATH_UNRESOLVED`, naming the expressions, and no DOCX is uploaded.
Retry keeps saved stages and asks for a fresh repair, because the attempt
number is part of the repair prompt.

`generatedJson` is the exact JSON the DOCX was built from: after answer
verification, omitted optional diagrams and maths repairs.

## RES-51: planned generation and lifecycle logs

`RESOURCE_PLANNED_GENERATION_ENABLED` is a Firebase boolean parameter (default
`false`). The production dotenv explicitly enables it for the RES-51 release.
Resource functions are excluded from the staging inventory, so local real-provider
replay, emulator tests and exact-commit CI are the available pre-release checks.
Submission stamps `generationVersion: 1`
onto new jobs; switching it off stops opting new jobs in without changing jobs
already running. Existing jobs retain their legacy checkpoint hashes and path.
No existing failed jobs are retried automatically.

For version 1 worksheets with an implicit, per-topic or large count, and all
practice papers, the first saved AI response is a validated plan: reference-backed
topics, exclusions, global question numbers, marks, difficulty and sections.
A textbook name alone is not enough to establish chapter contents. Unresolved
scope stops with `RESOURCE_SCOPE_CLARIFICATION`; attach relevant contents pages
or specify the eligible topics before resubmitting. Numeric "7 per topic"
requests must resolve to seven questions for each planned topic. Resolved totals
above 200 are rejected before question generation.

Question batches contain at most five questions for worked/model-answer jobs,
ten otherwise. Solutions/marking guides are separate calls against immutable
saved questions. Every batch is validated before checkpointing; assembly checks
numbering, question/answer links, marks and exact duplicate stems before the
existing diagram, answer-verification and DOCX validation pipeline. Semantic
coverage and time suitability depend on the planner; source evidence checks are
exact quote checks, not proof of a model's interpretation of exclusions.

A timeout splits a multi-question stage into two children on its next worker.
At minimum size (or for an indivisible stage), one transient retry is allowed,
then one backup-provider attempt if configured. Retry counters and subdivision
choices are persisted transactionally under the attempt fence. Recovery stops
on the thirteenth recovery decision for the whole job, or when a stage exhausts
its provider attempts. Normal continuations do not consume this recovery budget.
Version 1 has a 600-stage ceiling to allow subdivisions and solution stages;
the legacy ceiling remains 80. The six-minute call deadline and 450-second
invocation budget remain; a fresh call is deferred if less than 30 seconds
remain. A shortened deadline is reported as a time limit, never as a claim that
six minutes elapsed.

Version 1 checkpoint identity includes the logical stage and request inputs,
excluding the provider model, so valid completed artifacts survive a provider
change. The original provider/model and usage remain in each saved response.
Manual Retry starts a new `runId` and resets failure counters while preserving
subdivision decisions and valid checkpoints for resumable failures. Content
failures that previously required discarding the journal still do so.

### Finding a job's history

Cloud Logging filter (replace the job ID):

```text
resource.type="cloud_run_revision"
jsonPayload.jobId="JOB_ID"
jsonPayload.schemaVersion=1
```

Sort oldest first, or use:

```sh
gcloud logging read 'jsonPayload.jobId="JOB_ID" AND jsonPayload.schemaVersion=1' \
  --project=tenacity-tutoring-b8eb2 --order=asc --limit=1000 --format=json
```

All new events use `message: resource_lifecycle`, `schemaVersion: 1` and a stable
`event`. Correlate `jobId` across the resource's lifetime; `runId` across manual
retries; `attemptId` with ownership; `invocationId` with worker execution; and
`stageExecutionId` with each paired start/end. `stageId` identifies the logical
stage across continuations. Question/solution stages include the batch index.

Expected sequence:

- `job.queued`, `worker.claimed` (queue wait, model and recovery counters).
- `stage.started` / `stage.completed`, or `stage.skipped`, for references,
  sourcing, generation, validation/repair, document build and upload.
- `provider.started` / `provider.completed` for real calls, with timeout budget,
  provider response ID and token usage when available.
- `checkpoint.saved` for a newly durable response; `checkpoint.reused` for
  replay, which is **not** a new provider request or billable token event.
- `recovery.decided` (split/retry/fallback/exhausted), `worker.continued`,
  `worker.lease_recovered`, `provider.fallback_queued`, or cancellation events.
- `job.completed`, `job.failed` or `job.cancelled`. Application failures emit
  ERROR events even if the Cloud Run request returns HTTP 200.
- Preview events follow document completion independently. A preview failure
  does not invalidate the ready DOCX; its surrounding stage completion means
  the preview operation returned, not that a PDF was produced.

A hard process termination may leave an unmatched `stage.started` or
`provider.started`. Use the attempt ID, Cloud Run request logs and subsequent
lease-recovery event to distinguish it from a handled timeout. There can be no
guaranteed final event from a killed process, and no visibility into the model's
internal reasoning. Older ad-hoc logs remain alongside the new event stream.

The lifecycle schema allows only metadata/counts. It excludes prompts,
reference text, generated content, student details and raw exception messages.
Terminal summaries include available elapsed-time, stage and recovery counters;
provider events give exact per-call details. Operational queries and totals must
not count repeated checkpoint usage as fresh provider work.

### Validation and rollout

Run the backend unit and Auth/Firestore emulator suites before committing.
Regression fixtures cover the per-topic request shape, timed papers, separate
solution stages, real DOCX construction, replay, invalid batches, timeout splits,
provider exhaustion and redaction. Emulator coverage verifies committed recovery
and rejection of superseded workers, alongside existing lease/cancellation and
queue-concurrency tests.

Before enabling production: run the local real-provider replay, verify the
DOCX output and correlated job timeline, and pass exact-commit CI. Resource
Functions are not present in the staging inventory; verify deployed revisions
and the resource portal after release. Enable new production submissions with
the explicit project dotenv parameter; disable the parameter if completion rates or recovery
costs regress. Local deterministic tests do not establish real provider latency
or content quality.

### Complete summaries and content checks

Terminal `job.completed`, `job.failed` and `job.cancelled` events read the latest
committed job state, including the final invocation. Each includes
`totalElapsedMs`, `activeElapsedMs`, `queueElapsedMs`, `completedStages`,
`stageCount`, `providerCallCount`, `retryCount`, `fallbackCount`, `recoveryCount`
and `leaseRecoveryCount`. Actual provider retry/fallback starts are counted
separately from decisions to retry, split or switch providers. Queue time and
completed invocation time accumulate across worker handoffs; total elapsed time
starts again on a manual Retry. A killed worker's precise active duration cannot
be recovered, so active time covers completed handoffs, not an invented death
time. Lease exhaustion and recovered cancellations also emit terminal summaries.

Optional reference extraction, sourcing, planning, content review, diagram fills,
diagram validation, answer checking, maths repair and preview record explicit
skip reasons. Cancellation/supersession is a stopped stage with the matching
outcome. Optional preview stages can finish with `outcome: unavailable`; inspect
`preview.failed`, `preview.discarded` or the skip event to see why.

For exhaustive requests backed by coded contents pages (for example `1A`, `1B`,
`10H`), the scope resolver extracts a section inventory from the reference text.
It supports chapter exclusions and an inclusive “everything after section X”
boundary. The plan aims to respect exclusions, balance chapter marks and preserve the
requested sitting duration. Coverage/timing concerns are advisory warnings. Multipart
questions may cover several section IDs. Planned answering estimates target
75–100% of the sitting duration; a mismatch is a review note, not a fatal error. Per-topic worksheets resolve their true total
before generation; totals above the configured limit are rejected, not silently
reduced. Uncoded or more complex source layouts still require model review and
may require clarification; this is not a general textbook parser.

A separate, checkpointed `content.review.v1` call reads the original request,
reference scope and actual assembled questions/solutions. It independently
reports actual covered IDs and answering-time estimates, and checks exclusions,
mathematical validity, chapter balance and difficulty progression. Passing plan
labels alone are insufficient. Missing/extra coverage, review issues or a
reviewed timing mismatch produce a downloadable document with review notes.
A whole-document rewrite is not used to chase a speculative quality score.
This model review is an additional quality gate, not a guarantee of educational
or mathematical correctness.

Plan validation failures include a safe finite `reason` code in lifecycle logs.
The following attempt receives that reason as correction guidance without
changing the stable checkpoint identity. Provider response bodies never enter
lifecycle logs.

### Local replay with real providers

To reproduce a failed resource without writing to Firebase, first obtain its
prompt/settings and reference file locally. Then run:

```sh
node backend/firebase/functions/scripts/replayResourceLocally.js \
  --input /private/tmp/original-input.json \
  --reference /private/tmp/original-reference.pdf \
  --output /private/tmp/resource-replay \
  --firebase-secrets --max-calls 60
```

The input manifest contains the original `resourceType`, `subject`, `year`,
`customPrompt`, `answerMode`, `modelChoice`, marks setting and upload metadata.
This runner supports one original reference file. Without `--firebase-secrets`,
keys must already be available locally. Production access from the runner is
limited to optional read-only Secret Manager access. The queue and all writes
are local, with synthetic student/tutor identity; PostHog is disabled.

Real-provider replay sends the original prompt/reference-derived text to those
providers and incurs their API usage. Obtain the user's authorization for that
transfer. Do not silently substitute mock responses and describe them as a real
replay.

The output contains `events.jsonl`, `job.json`, `summary.json`, private local
checkpoint objects and, on success, `resource.docx`. `provider-responses/` keeps
response bodies for local diagnosis only; it excludes API keys and must not be
committed or published. Choose a fresh output directory per replay. The runner
has a bounded call budget and stops starting calls after 45 minutes.


## Advisory review and downloadable drafts (current completion policy)

Coverage, sitting-time estimates and difficulty are review findings. They never
invalidate otherwise usable generated questions/solutions. Jobs finish with
`status: complete` so downloads and previews remain available, plus:

- `reviewStatus: warnings`: a completed review raised concerns. The app shows
  **Review recommended**, the details show every warning, and the DOCX includes
  a tutor-review notice.
- `reviewStatus: draft`: an optional content, answer, diagram or notation review
  could not finish. The app shows **Draft available**, and the file is labelled
  **DRAFT - tutor review required**. Valid original content is retained.

Timed papers use representative chapter coverage by default. Explicit requests
to test every subsection/subtopic, and per-topic worksheets, still track detailed
section coverage. Exclusions are checked in both modes. Timing estimates and
coverage counts remain visible; an estimated overrun is not a reason to throw
away the paper. The requested sitting time remains on the cover even when the
review estimates a different workload.

Optional provider review calls have at most a two-minute deadline. An unavailable
review is persisted under the job's attempt fence and skipped on subsequent
continuations, preventing an endless cycle of redoing a failed review. Manual
Retry clears that marker. Older `RESOURCE_CONTENT_INVALID` failures retain their
saved journal on Retry instead of deliberately deleting valid content. Ordinary generation and targeted repair budgets remain
bounded; warnings do not trigger whole-resource regeneration.

Cancellation, superseded workers and normal continuation are never swallowed as
warnings. Broken question/answer links, invalid document structure, required
unrenderable figures, and failed file writes still stop completion. A readable
notation fallback after exhausted maths review can be retained in an explicitly
labelled draft. The draft builder still runs normal document validation.

A previous local replay was rejected by the former strict content gate. Its
saved real-provider responses can now be recovered offline into a labelled DOCX
with warnings, without repeating the expensive generation. Such an offline
recovery must disclose any optional diagrams/reviews for which no saved response
exists; it is a draft, not a newly verified paper.

## RES-70: optional stages, strict schemas and planning reasons

Diagram schemas (`diagramSchema.js`) list every property in `required`.
OpenAI strict mode rejects any other shape with `invalid_json_schema` before
generation. Optional fields are nullable instead, and `stripDiagramNulls`
removes the nulls from a filled or repaired diagram before validation.
`test/unit/resourceOpenAiStrictSchemas.test.js` checks every diagram and
resource schema against the strict-mode rules. After a schema change, sweep
both providers live:

```sh
ANTHROPIC_API_KEY=... node scripts/sweepDiagramSchemas.js
OPENAI_API_KEY=... RESOURCE_LLM_MODEL=gpt-6.1-sol node scripts/sweepDiagramSchemas.js
```

A diagram fill whose diagrams are all optional is a best-effort stage. When it
fails, the job records `optionalStageFailures[<checkpoint key>]` with the
error code and count. Later workers skip it (`stage.skipped`,
`reason: best_effort_failed_before`) instead of sending it again. A 429 or
5xx is given up after two attempts. Anything else is given up after one,
including the two-minute optional-stage timeout (`OPTIONAL_STAGE_TIMEOUT_MS`,
shared with optional reviews). A response cut off at its token limit is
retried once. A fill's output ceiling is `2000 + 300 × diagrams` tokens (at
most 16,000). When a question describes something its diagram type cannot
draw, GPT can stall and pad the JSON with whitespace until the ceiling. Each
omitted diagram becomes an `OPTIONAL_DIAGRAM_OMITTED` warning. Manual Retry
clears the record. Shape `unit` is an enum (`mm`, `cm`, `m`, `km`, `units`).

Plan validation reasons are specific: `plan_topics_empty`,
`questions_not_numbered_1_to_n`, `question_topic_not_in_topics`,
`question_section_missing`, `question_marks_outside_1_to_30`,
`question_count_not_requested_total`, `section_questions_not_consecutive`,
`time_allowed_missing` and `source_evidence_not_found`. A practice paper with
no requested sitting time takes one from the sum of the questions'
`estimatedMinutes`, rounded up to five minutes. When planning exhausts its
retries, the tutor is told to add topics, a question count or a sitting time.

Manual Retry of a `generationVersion` 0 job that failed with
`RESOURCE_STAGE_TIMEOUT` or `RESOURCE_STAGE_LIMIT` sets `generationVersion: 1`
(when `RESOURCE_PLANNED_GENERATION_ENABLED` is on). It also discards the
legacy checkpoints, which planned generation cannot reuse.

When Claude rejects a schema at compile time (`compiled grammar is too large`,
`schema is too complex`, compile timeout), `callAnthropicForResource` sends the
same request once without `output_config.format`.
