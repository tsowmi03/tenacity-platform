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

const ENGLISH_GUIDANCE = `HOW TENACITY TEACHES ENGLISH. Everything English in this resource (explanations, model analysis, exemplar paragraphs, scaffolds, questions, marks, marking criteria and model answers) must teach and assess this approach. Use its terms (thesis, ETA, TETAL) wherever the resource teaches structure.

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

SHORT-ANSWER QUESTIONS (6 marks or fewer)
Set each question's marks, its marking criteria and its model answer from this table:
- 1 to 2 marks: technique and analysis only, with no thesis. Go straight into the technique and its effect.
- 3 marks: a thesis plus one strong ETA, or two brief ETAs.
- 4 marks: a thesis plus two ETAs.
- 5 marks: a thesis plus two strong ETAs, or three brief ETAs.
- 6 marks: a thesis plus three ETAs.
The thesis is worth about 1 mark and must answer the question in the question's own words. Each ETA is worth 1 to 2 marks, depending on how developed it is.

EXTENDED RESPONSES (more than 6 marks)
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

DISCURSIVE WRITING
1. Explores one idea from several angles. It does not need a firm conclusion.
2. A personal, reflective voice, with anecdotes as evidence.
3. Each section shifts perspective deliberately. Logical flow still applies.

REFLECTION STATEMENTS
- The thesis states the purpose of the student's own text and its audience.
- Then paired ETAs: an ETA on a technique in the prescribed text and what it achieves, followed by an ETA on how the student used the same technique in their own text, with evidence from it.

YEAR LEVELS
Every year level learns the same structure (thesis, TETAL, ETAs). For younger students, phrase questions more simply and ask for less depth. Never drop the structure.

Persuasive writing (speeches, opinion pieces) is not part of what students write. Do not set it unless the tutor asks for it.`;

// Marking criteria are written from the same tables the questions' marks come
// from. Shared by "Marking guide" and "Model answers" so the two modes cannot
// mark the same question differently.
const ENGLISH_CRITERIA_RULE = `Write each question's marking criteria from HOW TENACITY TEACHES ENGLISH. A short-answer question gets one criterion for the thesis (when its marks call for one) and one per ETA, each starting with its marks (for example "1 mark: a thesis that answers the question in its own words"). An extended response gets Tenacity's extended-response criteria, scaled to its marks in whole marks. Never award half or fractional marks. The criteria for a question must add up to its marks.`;

module.exports = {
  ENGLISH_CRITERIA_RULE,
  ENGLISH_GUIDANCE,
};
