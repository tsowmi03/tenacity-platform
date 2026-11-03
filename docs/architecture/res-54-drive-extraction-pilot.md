# RES-54 phase 0 — Drive extraction pilot

Can questions and their original diagrams be lifted out of the Drive teaching
resources (Resources → Maths and English, Student Docs excluded) well enough
to build a question bank and a search index for the resource generator?

**Answer: yes.** On 20 pilot pages every diagram was found and cropped whole.
The scanned workbook needed an automatic clean-up step for stray marks at the
edges. Measured cost was about $0.11 a page.

## What was run

[`backend/firebase/functions/scripts/driveExtractionPilot.js`](../../backend/firebase/functions/scripts/driveExtractionPilot.js)
with [`driveExtractionPilot.manifest.json`](../../backend/firebase/functions/scripts/driveExtractionPilot.manifest.json).
The script reads the PDFs from the locally synced shared drive. It has no
production access apart from the Anthropic key in Secret Manager.

For each page it:

1. renders the page twice: at 1568 px on the long edge for the model (the
   size Claude sees without rescaling, so the returned coordinates line up)
   and at 2400 px wide for the crops (about 290 dpi on an A4 page);
2. sends the image to `claude-opus-5-5` (adaptive thinking, effort high)
   with structured output. When the PDF has a real text layer, that text is
   sent too. Claude returns every question part with its stem, its text (maths
   in LaTeX), its topic, a box around the whole unit and a box for each
   figure;
3. draws the figure boxes on the page and asks Claude to accept each one or
   correct it, and to list any figures it missed;
4. crops each figure from the high-resolution render, then removes ink that
   touches the crop's edge and lies outside the figure (neighbouring question
   numbers, answer lines, half-captions), then trims the crop.

## Pilot pages

| Book | Kind | Pages | Units | Figures |
|---|---|---|---|---|
| CambridgeMATHS NSW Year 9 Core and Advanced | Textbook, text layer | 8 | 123 | 91 |
| Excel Year 9 Mathematics Revision and Exam Workbook | Scanned, no text | 7 | 97 | 66 |
| Cambridge Mathematics Advanced Year 11, chapters 1–5 topic tests | Exam-style review pages | 5 | 120 | 22 |
| **Total** | | **20** | **340** | **179** |

## Results

- **Finding diagrams:** all 179 diagrams on the pilot pages were boxed. Every
  page's overlay was reviewed by eye and no diagram was missed. The check pass
  agreed.
- **Crop quality (reviewed by eye, crop by crop):**
  - Textbook and HSC (113 crops): every crop has the whole figure and nothing
    else.
  - Scanned workbook (66 crops): every figure is complete. Before the clean-up
    step about a third of the crops picked up fragments of the neighbouring
    question. Afterwards four still have a small leftover mark: a question
    number or a dot that doesn't touch the edge of the crop.
- **Transcription:** question wording, numbering and maths come through
  correctly, including from the scans, and multiple-choice options are kept
  with their question. A caption printed under a diagram (such as "ΔADC")
  goes into the question text.
- **Check pass:** it corrected 3 of 179 boxes, and it didn't catch the stray
  fragments that the deterministic clean-up removes. It costs about 30% of the
  total.
- **Cost and time:** $2.28 for 20 pages ($0.114 a page: $0.08 to extract, $0.03
  to check), about 37 s a page, with 4 pages processed at a time.

## What this means for the full build

- **Cost:** about $80 per 1,000 pages to extract without the check pass. The
  Message Batches API halves that. Total page count isn't known yet. The first
  step of indexing is to count pages and remove duplicate files: the Revision
  Workbooks folder alone has several byte-identical copies ("… a.pdf").
- **Check pass:** drop it, or keep it only for scanned books. The edge
  clean-up does more for crop quality.
- **Answers:** the pilot didn't link questions to their answers (teacher
  books, answer pages). That's phase 2 work.
- **Worked examples:** these were sometimes tagged as questions. The prompt
  needs a firmer definition before the bank is built.
- **Review:** a tutor-facing review view is still worth building, for the
  occasional leftover mark and for tagging.
