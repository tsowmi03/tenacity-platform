# RES-54 phase 1 — Corpus size and a random-sample extraction

How big is the Drive teaching corpus (Resources → Maths and English, Student
Docs excluded), and does the phase 0 extraction hold up on pages nobody picked?
Phase 0 is in [`res-54-drive-extraction-pilot.md`](res-54-drive-extraction-pilot.md).

**Answer:** about 65,000 unique pages, of which roughly 46,000 are Maths
pages worth a question pass. Extracting everything with Opus would cost about
$1,450, which is too much. Narrowing the run to the Maths diagram types the
question bank needs, and running it on Haiku 5.5, brings that to about $35
(about $17 with the Batch API), with box quality close to Opus.

## What was run

- [`driveCorpusInventory.js`](../../backend/firebase/functions/scripts/driveCorpusInventory.js)
  reads every file once: type, SHA-256, page count, and whether the pages
  have a text layer. With `--sample` it draws random pages (weighted by page
  count, 30% English) into a manifest.
- [`driveExtractionPilot.js`](../../backend/firebase/functions/scripts/driveExtractionPilot.js)
  ran on that manifest. The check pass is now off by default (`--verify`
  turns it on). Word and PowerPoint files are converted with LibreOffice.

## The corpus

| | Files | Pages |
|---|---|---|
| All files | 11,650 | |
| Documents (PDF, Word, PowerPoint) | 5,024 | |
| Unique documents (exact copies removed) | 4,828 | 64,907 |
| Scanned (no text layer) | | 10,285 (16%) |

- **Not documents:** 3,013 images, 1,535 CD-ROM software files and 2,078
  others. They are mostly from textbook CD-ROMs and weren't reviewed.
- **Exact copies:** 196, totalling 1.7 GB, mainly in Revision Workbooks and
  Grammar Spelling.
- **Unreadable:** 2 files are password-protected and 2 are damaged. 190 old
  `.doc`/`.ppt` files weren't counted, because they need converting first.

Where the pages are:

| Folder | Unique pages |
|---|---|
| Maths/MathsTEXTBOOKS | 23,238 |
| Maths/Mathletics | 12,250 |
| Maths/HSC | 10,558 |
| English/LitCharts | 5,606 |
| Everything else | 13,255 |

Pages a question pass can skip:

| Kind | Pages | Why |
|---|---|---|
| Answer and solution files | 5,233 | Phase 2 links them to their questions |
| Teacher editions with a student edition alongside | 3,394 | Their diagrams have the answers drawn in (see below) |
| LitCharts PDF/Word pairs | 761 | Same organiser in two formats |
| Blank pages | about 5% | Can be detected locally before any API call |

That leaves about 55,000 pages, which is an upper bound. Further overlap
between editions remains (three Cambridge Year 9 textbooks from different
years), so it has to be removed per question when indexing.

## Random sample

40 pages were drawn with seed 54: 28 Maths and 12 English. One Word file
couldn't be converted by LibreOffice, so 39 pages were extracted.

- **Cost and time:** $0.053 a page (lower than the pilot's dense pages) and
  17 s a page, with 4 pages processed at a time.
- **Units:** 380 in total: 266 questions, 42 answers, 36 explanations, 27
  other, 5 worked examples and 4 passages. Spot-checked transcriptions were
  accurate, including LaTeX and scanned English workbooks.
- **Maths diagrams:** 70 found, and every one was complete. Three of them
  were decoration: two cartoon mascots and a photo.
- **English diagrams:** 17 of the 19 boxes were decoration: LitCharts theme
  icons, theme keys and blank organiser grids.
- **Fix 1, decoration:** the prompt now leaves out mascots, icons, keys and
  blank answer frames. On the 11 affected pages the boxes dropped from 39 to
  17, all of them real. The diagrams that should stay did.
- **Fix 2, teacher editions:** a Mathletics teacher edition has the answers
  filled in, so its "shade 8 of 18 squares" grid comes out already shaded.
  Question crops have to come from the student edition.
- **Blank pages:** 2 of the 39 pages are blank in the source PDF.
- **Context across pages:** a worked example that runs on from the previous
  page has no context on its own. The build should pass each page the end of
  the page before it.

## Narrowed to the diagram types that matter (Haiku 5.5)

The question bank only needs these Maths diagrams. English diagrams are left
out; English stays searchable through its text.

| Type | Covers |
|---|---|
| `shape_2d` | 2D and composite shapes (area, perimeter) |
| `solid_3d` | 3D solids and nets (surface area, volume) |
| `triangle` | Triangles for Pythagoras and trigonometry, elevation, bearings |
| `graph_line` | Straight-line graphs |
| `graph_curve` | Parabolas, polynomials, circles, hyperbolas, exponential, log and trig graphs |
| `number_plane` | Points, segments or shapes plotted on the number plane |

`driveExtractionPilot.js --diagram-types --model claude-haiku-5-5` runs in
two steps:

1. **Sorting:** a cheap call (low effort) lists which of these types the page
   has.
2. **Extraction:** only pages with a match are extracted, and only the units
   that use one of these diagrams are kept, each figure tagged with its type.

On the 27 Maths pages of the random sample:

- **Sorting:** it picked the same 7 pages identified by eye, with no false
  positives and no misses, for $0.0003 a page.
- **Crops:** 31 diagrams, 30 of them complete. One label was clipped
  ("quadrant"), and one row of example polygons was missed. Opus did no
  better on the same pages.
- **Transcription:** as accurate as Opus on these pages.
- **Cost:** $0.02 for all 27 pages, or $0.002 for each extracted page
  including the sorting call.

Estimate for the whole corpus: about 46,000 Maths pages × $0.0003 to sort,
plus about 26% of them × $0.0017 to extract. That comes to **about $35, or
about $17 with the Batch API**.

## What this means for the build

- **Cost:** with the diagram-type narrowing on Haiku 5.5, about $35 (about $17
  with the Message Batches API). Extracting every unit on every page with Opus
  would have been about $2,900, or $1,450 with the Batch API. The answer pass
  in phase 2 adds about 5,000–8,000 pages.
- **Sample size:** the narrowed run was checked on 27 pages, 7 of them with
  target diagrams. A larger check (around 200 pages) should run before the
  full extraction; at these prices it costs well under $1.
- **Source:** reading 10.5 GB through Drive for desktop took about an hour.
  The build should read through the Drive API with a service account that has
  Viewer access to the shared drive.
- **Order:** skip blank pages, answer files, teacher editions that have a
  student twin, and PDF/Word pairs; extract with the Batch API; store and
  embed each question; remove near-duplicate questions across editions; then
  link answers.
