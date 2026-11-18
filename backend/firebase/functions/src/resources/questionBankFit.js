"use strict";

// RES-115. Before a textbook crop is printed beside its (often rewritten)
// question, one cheap look at the crop and the final question text checks
// that they belong together. The RES-113 baseline printed:
//   - a question asking for "b" beside a triangle labelled "y" with only one
//     side given (unsolvable),
//   - a T-shape with a length missing, so the answer assumed symmetry,
//   - a different triangle from the one the question described,
//   - "sketch the graph" beside the finished graph,
//   - a stray textbook fragment ("C y = −2x − 1") in place of a diagram.
// A crop that fails is not used: the slot tries another, then keeps the
// generated question and its drawn diagram.

const FIT_EFFORT = "low";

const FIT_PROBLEMS = Object.freeze([
  "labels_differ",      // the question names a point, side or angle the crop labels differently or not at all
  "value_missing",      // a length, angle or value needed to answer isn't on the crop or in the question
  "different_figure",   // the crop shows a different shape, scenario or numbers from the question
  "answer_shown",       // the crop gives away the answer (a finished graph for a sketch, the value asked for)
  "extra_labels",       // labels, values or symbols the question never uses (an angle θ on a Pythagoras question)
  "other_content",      // other questions, answer options or text from the page are in the crop
  "no_diagram",         // the crop is a text fragment or blank, not a diagram
]);

const FIT_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["fits", "problems", "note"],
  properties: {
    fits: { type: "boolean" },
    problems: { type: "array", items: { type: "string", enum: [...FIT_PROBLEMS] } },
    note: { type: "string" },
  },
});

function fitPrompt({ stem, options }) {
  return `This diagram will be printed beside the question below in a student's worksheet. Check whether they belong together. Don't solve the question.

Question: ${stem}${options?.length ? `\nOptions: ${options.join(" | ")}` : ""}

It fits only if all of these hold:
- Every point, side, angle or variable the question names appears on the diagram with the same letter or label.
- Every length, angle or value a student needs is on the diagram or in the question.
- The diagram shows the same figure, scenario and numbers as the question.
- The diagram doesn't give away the answer. If the question asks the student to sketch, draw or plot something, the diagram must not already show it.
- The diagram has no labels, values or symbols the question doesn't use (for example an angle θ or a 38° on a question that only uses side lengths, or a letter for a side the question never mentions).
- The diagram has nothing else from the page: no other questions, answer options or stray text.
- It is a diagram, not a fragment of text.

List each problem found (none if it fits) and give a one-sentence note.`;
}

/**
 * The verdict from a fit check's parsed output. Anything malformed counts as
 * a fit, so a flaky check never costs a good crop; a missing check is not a
 * reason to drop one.
 */
function readFit(out) {
  if (!out || typeof out.fits !== "boolean") return { fits: true, problems: [], note: "fit check unavailable" };
  const problems = Array.isArray(out.problems) ? out.problems.filter((p) => FIT_PROBLEMS.includes(p)) : [];
  // A "fits" with problems listed is treated as not fitting: the problems are
  // the specific claim, "fits" the summary.
  return { fits: out.fits && problems.length === 0, problems, note: String(out.note || "").slice(0, 200) };
}

module.exports = { FIT_EFFORT, FIT_PROBLEMS, FIT_SCHEMA, fitPrompt, readFit };
