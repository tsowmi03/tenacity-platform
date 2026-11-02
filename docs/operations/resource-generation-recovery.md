# Resource generation recovery

Resource workers save completed AI responses in private Storage objects under
`resources/checkpoints/<jobId>/`. The response key includes the model, schema,
and full prompt. Replay reads the saved response and never resubmits that call.
Only one new AI call runs in an invocation; the next uncached call yields to
`pending`, which the existing update worker resumes. Concurrent stages (diagram
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
`false`). Enable it in staging first. Submission stamps `generationVersion: 1`
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

Before enabling production: enable the parameter in staging, submit small and
large requests with real references, verify DOCX/PDF output and the correlated
job timeline, and measure real provider latency/usage. Then enable new production
submissions gradually; disable the parameter if completion rates or recovery
costs regress. Local deterministic tests do not establish real provider latency
or content quality.
