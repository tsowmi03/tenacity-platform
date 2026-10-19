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
