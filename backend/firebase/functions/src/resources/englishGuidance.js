"use strict";

// How Tenacity teaches English (RES-37).
//
// This is the one place the English house approach lives. Every English system
// prompt carries ENGLISH_GUIDANCE (see buildSystemPrompt), and the marking rules
// in promptBuilder.js point back to its sections instead of restating them, so
// a question's marks, its marking criteria and its model answer are all set
// from the same expectations and cannot drift apart.
//
// The content was agreed with Tenacity on 2026-10-07 and is recorded on RES-37.
// Change the agreed version first, then this file.

const ENGLISH_GUIDANCE = `HOW TENACITY TEACHES ENGLISH. Everything English in this resource (explanations, model analysis, exemplar paragraphs, scaffolds, marks, marking criteria and model answers) must teach and assess this approach. Use its terms (thesis, ETA, TETAL) wherever the resource teaches analysis. Thesis, ETAs and TETAL belong to analytical tasks only (essays, comprehension, analysis of a text or image). A student's own narrative, creative or discursive writing is never planned or marked with them.

QUESTIONS STATE THE TASK ONLY
- A question, short-answer or extended, gives only the task: what the student must do, and the audience or form when the task needs one.
- Never tell the student how to structure the answer. No "Begin with a thesis", no number of ETAs, no "Evidence, Technique, Analysis" reminder, no TETAL or paragraph plan, and no remarks on what the question is not asking.
- Students learn the structure in class. It is assessed in the marking criteria and shown in the model answers, where the tutor sees it, and the marks tell the student how much to write.
- This is about the questions. An essay scaffold, or a booklet's teaching sections, still walk through the structure.

ANALYSIS: THE ETA
- An ETA is one piece of analysis: Evidence (a quotation or close reference), Technique (the device used in that evidence), and Analysis (what that technique does).
- Evidence and technique may come in either order. The analysis always comes last.
- The analysis must come directly from the technique: say what this technique does with this evidence, not what the quotation means in general. Naming any technique in sight and then explaining the quotation is the most common student error. Never model it.
- Write analysis that is direct and analytical. Make one clear claim about the effect and stop. No vague or inflated closing lines.
- Every ETA must prove the argument of its paragraph. An ETA included for the sake of it is a fault, so the analysis shows how it advances the argument.

The standard, by example (an illustration only; do not reuse this text unless the resource is about it):
Weak: Owen uses a simile, "Bent double, like old beggars under sacks", which shows the soldiers are tired and that war is bad.
Strong: In the opening line the soldiers are "Bent double, like old beggars under sacks". The simile compares young men to old beggars, so Owen shows war has bent their bodies into those of old men, ageing them before their time.

ANALYTICAL ESSAYS: TETAL
- Each body paragraph follows TETAL: Thesis (the paragraph's own thesis), then its ETAs (Evidence, Technique, Analysis), then a Link back to the paragraph's thesis.
- Introduction: the first sentence is the thesis. It answers the question directly, in the question's own words, and narrows the scope to what the question asks. Mention context only if the argument depends on it, and then briefly, within a sentence. Then state each body paragraph's thesis in order.
- Each paragraph thesis narrows the main thesis in one way.
- The logic must be watertight: the thesis is a logical answer to the question, each paragraph thesis is a logical extension of the thesis, and each ETA proves its paragraph thesis.
- Conclusion: a slightly condensed version of the introduction.
- Default shape: 3 body paragraphs with 3 ETAs each. Use another shape (such as 2 paragraphs of 4 ETAs, or 4 of 2) only when the tutor asks for it.
- Comparative essays: a paragraph may pair ETAs from both texts, or be built around one point of comparison. Either is acceptable.

SHORT-ANSWER QUESTIONS (6 marks or fewer, analytical tasks only)
Set each question's marks, its marking criteria and its model answer from this table:
- 1 to 2 marks: technique and analysis only, with no thesis. Go straight into the technique and its effect.
- 3 marks: a thesis plus one strong ETA, or two brief ETAs.
- 4 marks: a thesis plus two ETAs.
- 5 marks: a thesis plus two strong ETAs, or three brief ETAs.
- 6 marks: a thesis plus three ETAs.
The thesis is worth about 1 mark and must answer the question in the question's own words. Each ETA is worth 1 to 2 marks, depending on how developed it is.

EXTENDED RESPONSES (more than 6 marks, analytical tasks only)
Mark against Tenacity's criteria, shown out of 20. For any other total, scale them in proportion and round to whole marks that still add up to the total (out of 15: 3, 3, 7 and 2).
- Thesis answers the question in its words, with a narrowed scope: 4 marks.
- Paragraph theses each narrow the main thesis, with clear logical flow: 4 marks.
- ETAs: the analysis comes from the technique, and each ETA clearly supports its paragraph's argument: 9 marks.
- Introduction, conclusion and expression: 3 marks.

CREATIVE WRITING
Students usually write a short story in about 40 minutes. Teach and reward:
1. Narrow the scope: one character, one moment, one setting (one soldier crossing one bridge, not the whole war).
2. Link to the stimulus when one is given: use it directly (a quotation in the story, or the image as the setting) or build the story around its main idea.
3. Show, don't tell.
4. One clear idea: the story is about something, and every scene serves it.
5. Start late: open in the middle of the action, with no long backstory.
6. Few characters. All dialogue and information must earn its place.
7. A purposeful ending: no "it was all a dream".
8. Specific sensory detail rather than general description.
Mark creative writing on these points alone: its criteria and model answer use no thesis, paragraph theses, ETAs, TETAL or links. Share the question's marks across the points that matter for the task, in whole marks that add up to its total.

DISCURSIVE WRITING
1. Explores one idea from several angles. It does not need a firm conclusion.
2. A personal, reflective voice, with anecdotes as evidence.
3. Each section shifts perspective deliberately. Logical flow still applies.
Mark discursive writing on these points alone, as for creative writing: no thesis, paragraph theses, ETAs, TETAL or links.

REFLECTION STATEMENTS
- The thesis states the purpose of the student's own text and its audience.
- Then paired ETAs: an ETA on a technique in the prescribed text and what it achieves, followed by an ETA on how the student used the same technique in their own text, with evidence from it.

YEAR LEVELS
Every year level learns the same analytical structure (thesis, TETAL, ETAs). For younger students, phrase questions more simply and ask for less depth. Never drop the structure from the marking criteria and model answers of an analytical task.

Persuasive writing (speeches, opinion pieces) is not part of what students write. Do not set it unless the tutor asks for it.`;

// Marking criteria are written from the same tables the questions' marks come
// from, and describe how marks are earned rather than restating the answer
// (RES-48): the answer itself belongs in the model answer, when one is asked for. Shared by "Marking guide" and "Model answers" so the two modes cannot
// mark the same question differently.
const ENGLISH_CRITERIA_RULE = `Write each question's marking criteria from HOW TENACITY TEACHES ENGLISH. A short-answer question gets one criterion for the thesis (when its marks call for one) and one per ETA, each starting with its marks (for example "1 mark: a thesis that answers the question in its own words"). An analytical extended response gets Tenacity's extended-response criteria, scaled to its marks in whole marks. A creative or discursive writing task gets criteria written from those sections instead, with no criterion for a thesis, paragraph theses, ETAs, TETAL or links. Never award half or fractional marks. The criteria for a question must add up to its marks.

Criteria say what earns each mark, never what the answer is. Do not name the correct option, quote the text, name the technique, or state the point a response should make. A multiple-choice question gets exactly one criterion: "1 mark: selects the correct answer" (with its marks if it is worth more). A short answer is "1 mark: identifies a relevant technique", not "1 mark: identifies the metaphor in line 4".`;

// RES-98. A backstop for the rule above: sentences in a question that coach
// the answer's structure are removed after generation. Only sentences that are
// unmistakably coaching match ("Begin with a thesis…", "Support it with two
// ETAs…", "Use TETAL…"); a question that asks the student to WRITE a thesis
// or a paragraph is the task itself and is left alone, and a tutor who asks to
// practise the structure gets the questions as written.
const COACHING_SENTENCES = [
  /^(?:begin|start|open)\s+(?:your\s+\w+\s+)?(?:with|by\s+writing)\s+a\s+(?:clear\s+)?thesis\b/i,
  /\bsupport\s+(?:it|this|them|your\s+\w+)\s+with\s+(?:one|two|three|four|five|\d+)\s+(?:strong\s+|brief\s+|developed\s+)?ETAs?\b/i,
  /^(?:develop|write|use|include|give|provide)\s+(?:one|two|three|four|five|\d+)\s+(?:strong\s+|brief\s+|developed\s+)?(?:ETAs?|body\s+paragraphs?)\b/i,
  /\bETAs?:?\s*\(?Evidence,\s*Technique,\s*(?:and\s+)?Analysis\b/i,
  /^(?:in|for)\s+each\s+(?:ETA|body\s+paragraph)\b/i,
  /\bTETAL\b/,
  /^you\s+are\s+not\s+being\s+asked\s+to\b/i,
  /^(?:end|finish|conclude)\s+(?:each\s+paragraph\s+)?with\s+a\s+link\b/i,
  /^plan\s+(?:your\s+|each\s+|the\s+)?(?:ETAs?|paragraphs?|body\s+paragraphs?)\b/i,
  /^each\s+(?:body\s+)?paragraph\s+should\b/i,
  /\bplanning\s+labels\b/i,
];
const COACHED_TYPES = new Set(["practice-paper", "worksheet", "diagnostic-test", "mixed-review"]);
const ASKS_FOR_STRUCTURE = /\b(?:thesis|ETAs?|TETAL|topic\s+sentences?|paragraph\s+structure)\b/i;

function stripCoaching(stem) {
  let removed = 0;
  const paragraphs = String(stem).split(/\n\s*\n/).map((paragraph) => {
    const sentences = paragraph.match(/[^.!?]+(?:[.!?]+["'”’)]*|$)\s*/g) || [paragraph];
    const kept = sentences.filter((sentence) => {
      const text = sentence.trim();
      if (!text || /\?["'”’)]*$/.test(text)) return true;
      if (COACHING_SENTENCES.some((re) => re.test(text))) { removed += 1; return false; }
      return true;
    });
    return kept.join("").trim();
  }).filter(Boolean);
  const out = paragraphs.join("\n\n");
  // Never leave a question empty: if everything matched, it was not coaching.
  return removed && out ? { stem: out, removed } : { stem, removed: 0 };
}

function stripStructureGuidance(parsed, job = {}) {
  const result = { removed: 0, questions: 0 };
  if (!COACHED_TYPES.has(job.resourceType) || ASKS_FOR_STRUCTURE.test(job.customPrompt || "")) return result;
  const visit = (node) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== "object" || Buffer.isBuffer(node)) return;
    if (typeof node.stem === "string") {
      const { stem, removed } = stripCoaching(node.stem);
      if (removed) { node.stem = stem; result.removed += removed; result.questions += 1; }
    }
    for (const [key, child] of Object.entries(node)) {
      if (["stimulus", "markingGuide", "answers", "image"].includes(key)) continue;
      if (child && typeof child === "object") visit(child);
    }
  };
  visit(parsed);
  return result;
}

module.exports = {
  ENGLISH_CRITERIA_RULE,
  ENGLISH_GUIDANCE,
  stripStructureGuidance,
};
