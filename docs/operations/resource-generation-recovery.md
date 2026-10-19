# Resource generation recovery

Resource workers save completed AI responses in private Storage objects under
`resources/checkpoints/<jobId>/`. The response key includes the model, schema,
and full prompt. Replay reads the saved response and never resubmits that call.
Only one new AI call runs in an invocation; the next uncached call yields to
`pending`, which the existing update worker resumes. Output finalization remains
fenced by the active attempt ID.

Maths worksheets with an explicit numeric question count above 15 are generated
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
counter. Deleting a resource also deletes its private journal.

Regression coverage includes a slow 180-question worksheet, hung providers,
late/superseded responses, invalid batches, queue fairness, and concurrent
recovery transactions in the Firestore emulator.
