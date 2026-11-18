# Resource quality benchmark (RES-113)

A fixed set of 20 maths and English requests, generated with the real
pipeline and scored by a Claude grader against one rubric. Run it before and
after any change meant to improve resource quality, and compare the two
summaries.

## Running it

From `backend/firebase/functions`:

```bash
npm run benchmark:resources -- --dry-run
```

```bash
npm run benchmark:resources -- --firebase-secrets
```

```bash
npm run benchmark:resources -- --firebase-secrets --compare scripts/qualityBenchmark/baselines/2026-11-18.json
```

The current baseline (2026-11-18, rubric v2, 3.74 overall) is kept in
`scripts/qualityBenchmark/baselines/`. Add a new file there when a later run
becomes the reference.

- `--only id,id` or `--subject maths|english` runs part of the set.
- `--grade-only <runDir>` re-grades an existing run without generating again
  (use it after a rubric or grader change).
- `--resume <runDir>` finishes an interrupted run in the same folder: saved
  grades are kept, finished resources without a grade are graded, and
  anything half-generated or failed is generated again. The summary covers
  the whole run. A run folder can only be used by one benchmark process at a
  time.
- `--firebase-secrets` reads both provider keys from Secret Manager
  (read-only), so the run uses the production provider accounts. The run also reads the maths and English banks and
  public-domain text sources, as production does. Nothing is written to
  Firebase.
- Output goes to `backend/firebase/functions/.benchmark-runs/<run>/` (git
  ignored): per request `input.json`, `replay/` (the generated DOCX, events and
  provider responses), the converted PDF and `grade.json`; per run
  `summary.json` and `summary.md`.

Needs LibreOffice (`soffice`) for DOCX to PDF, and the Firebase CLI logged in
for `--firebase-secrets` and the bank reads.

## What is scored

Each resource gets 1–5 on six criteria (0 = not applicable, left out of
averages):

| Criterion | Asks |
|---|---|
| Accuracy | Answers, facts, quotations and attributions are correct. |
| Year and syllabus fit | Difficulty and content suit the year and topic. |
| Diagrams and stimuli | Present where needed, correct, legible, print-ready. |
| Layout | No blank or broken pages, maths typeset, numbering lines up. |
| Answers and marking guide | Complete and matching every question. |
| Request fit | Does what the tutor's instructions asked. |

5 = ready to print; 3 = usable after a fix; 2 = a problem that stops a tutor
using it as is. The grader also lists each issue with its page and whether it
is major. Requests carry extra `checks` (known risk areas, for example the
RES-101 story-in-a-collection case) that the grader looks at under the normal
criteria.

The request set is in `scripts/qualityBenchmark/requests.json` and the rubric
and grader prompt in `scripts/qualityBenchmark/rubric.js`. Keep request ids
stable: runs are compared by id. Changing the rubric or grader prompt means
bumping `RUBRIC_VERSION` and re-grading the baseline with `--grade-only`, so
the comparison stays fair.

## Reading a comparison

Re-grading the same 20 resources moved single requests by up to ±0.5 while
the overall score moved by 0.02. Treat a change of 0.5 or less on one request
as noise; look for a change in the overall, subject or criterion averages, or
in the major issues listed, before calling a fix an improvement.

English answer modes mean different things from maths: "Marking guide" is
written for students and deliberately leaves the answers out, and "Model
answers" gives full responses. The rubric (v2) grades each against its own
purpose.

## Keeping the grader honest

After each full run, read five of the PDFs yourself and compare them with
their `grade.json`. If the grader is consistently too kind or too harsh on
something, fix the rubric text, bump the version and re-grade.

## Cost

The grader is Claude Opus 5.5 at high effort: $0.07 for a 5-page worksheet,
more for long booklets (budget about $0.20 per resource, so about $4 a run).
On top of that, generation costs the same as a tutor's job for each request.
The summary prices Claude calls; OpenAI calls are reported in tokens until a
rate is added to `PRICES_PER_MTOK` in `rubric.js`. A full run takes roughly
1–2 hours.
