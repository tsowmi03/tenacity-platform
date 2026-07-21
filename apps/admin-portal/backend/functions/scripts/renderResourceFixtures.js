"use strict";

// Renders one DOCX per resource type from realistic fixture content — maths
// fixtures exercise the OMML equation pipeline (fractions, surds, powers, the
// quadratic formula), English fixtures exercise prose rendering with the math
// pipeline off. No AI or Firebase involved: this drives buildResourceDocx the
// same way the generation pipeline does, so formatting regressions can be
// eyeballed without spending tokens.
//
// Usage:
//   node scripts/renderResourceFixtures.js [outputDir] [--pdf]
//
// --pdf additionally converts each DOCX to PDF via LibreOffice when a
// `soffice` binary can be found, which is the quickest way to visually review
// equation typesetting page by page.

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { buildResourceDocx } = require("../src/resources/builder");

const DEFAULT_OUTPUT_DIR = path.join("/tmp", "tenacity-resource-fixtures");

const SOFFICE_CANDIDATES = [
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "/usr/bin/soffice",
  "soffice",
];

const quadQuestion = {
  number: 1,
  stem: "Solve x^2 - 5x + 6 = 0 by factorising.",
  marks: 3,
  workingLines: 4,
  parts: null,
};

const multiPart = {
  number: 2,
  stem: "A rectangle has length (2x + 3) cm and width (x - 1) cm.",
  marks: 5,
  parts: [
    { label: "a", stem: "Write an expression for the area in expanded form.", marks: 2, workingLines: 3 },
    { label: "b", stem: "Given the area is 20 cm^2, show this leads to 2x^2 + x - 23 = 0.", marks: 2, workingLines: 3 },
    { label: "c", stem: "Solve using x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}, to 2 d.p.", marks: 1, workingLines: 3 },
  ],
};

const fractionQuestion = {
  number: 3,
  stem: "Simplify \\frac{3}{4} + \\frac{2}{5} and express \\sqrt{50} in simplest surd form.",
  marks: 2,
  workingLines: 3,
  parts: null,
};

const annotationPassage = [
  "The old lighthouse had not shown its light for thirty years, but the town still",
  "set its clocks by it. Every evening at dusk, Mrs Hollis would walk to the point",
  "and stand where the beam once swept the water. She said she was watching for",
  "ships; everyone knew she was watching for her son.",
  "",
  "He had left on a fishing boat the spring the light went dark, and the sea had",
  "kept him. And/or so the story went, nobody in the town was quite sure, and",
  "nobody asked. The lighthouse and the woman kept their vigil together, two",
  "landmarks the tide could not move.",
].join("\n");

// One entry per rendered document. Two practice papers on purpose: the maths
// one exercises equations and a mark scheme, the English one exercises the
// marking-guide path with the math pipeline disabled.
const FIXTURES = [
  ["topic-booklet", {
    title: "Quadratic Equations",
    subject: "maths",
    year: 10,
    topic: "Quadratic equations",
    learningObjectives: [
      "Solve quadratics by factorising.",
      "Apply the quadratic formula x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}.",
    ],
    nesaOutcomes: null,
    subTopics: [
      {
        title: "Solving by factorising",
        explanation: "If a product ab = 0 then a = 0 or b = 0. Rewrite x^2 - 5x + 6 as (x - 2)(x - 3).",
        definitions: [{ term: "Root", definition: "A value of x for which the expression equals 0." }],
        workedExamples: [
          {
            title: "Example 1: x^2 - 5x + 6 = 0",
            steps: [
              { working: "x^2 - 5x + 6 = 0", explanation: "Start with the equation." },
              { working: "(x - 2)(x - 3) = 0", explanation: "Factorise: two numbers multiplying to 6, adding to -5." },
              { working: "x = 2 or x = 3", explanation: "Apply the null factor law." },
            ],
          },
          {
            title: "Example 2: the quadratic formula",
            steps: [
              { working: "2x^2 + x - 23 = 0", explanation: "Here a = 2, b = 1, c = -23." },
              { working: "x = \\frac{-1 \\pm \\sqrt{1^2 - 4(2)(-23)}}{2(2)}", explanation: "Substitute into the formula." },
              { working: "x = \\frac{-1 \\pm \\sqrt{185}}{4}", explanation: "Simplify the discriminant." },
              { working: "x \\approx 2.65 or x \\approx -3.15", explanation: "Evaluate to 2 d.p." },
            ],
          },
        ],
        tip: "Always check both roots by substituting back.",
        commonMistake: "Forgetting the ± gives only one root.",
        practiceQuestions: [quadQuestion, fractionQuestion],
      },
    ],
    endQuiz: {
      sections: [
        {
          title: "Quiz",
          instructions: "Complete without a calculator where possible.",
          questions: [
            { number: 4, stem: "Solve x^2 = 49.", marks: 1, workingLines: 2, parts: null },
            { number: 5, stem: "Simplify \\sqrt{72} - \\sqrt{18}.", marks: 2, workingLines: 2, parts: null },
          ],
        },
      ],
    },
    answers: {
      subTopicAnswers: [
        { subTopicTitle: "Solving by factorising", questionNumber: 1, partLabel: null, answer: "x = 2 or x = 3" },
        { subTopicTitle: "Solving by factorising", questionNumber: 3, partLabel: null, answer: "\\frac{23}{20}; 5\\sqrt{2}" },
      ],
      endQuizAnswers: [
        { section: "Quiz", questionNumber: 4, partLabel: null, answer: "x = \\pm 7" },
        { section: "Quiz", questionNumber: 5, partLabel: null, answer: "3\\sqrt{2}" },
      ],
    },
  }],
  ["practice-paper", {
    title: "Quadratics Practice Paper",
    subject: "maths",
    year: 10,
    focus: "Quadratic equations and surds",
    totalMarks: 10,
    timeAllowed: "30 minutes",
    instructions: ["Answer all questions.", "Show full working.", "Calculators permitted."],
    sections: [
      { title: "Section A - Short answer", instructions: "Show working.", questions: [quadQuestion, fractionQuestion] },
      { title: "Section B - Extended response", instructions: "Show all steps.", questions: [multiPart] },
    ],
    answers: [
      { questionNumber: 1, partLabel: null, answer: "(x - 2)(x - 3) = 0, so x = 2 or x = 3", marks: 3 },
      { questionNumber: 3, partLabel: null, answer: "\\frac{3}{4} + \\frac{2}{5} = \\frac{23}{20}; \\sqrt{50} = 5\\sqrt{2}", marks: 2 },
      { questionNumber: 2, partLabel: "a", answer: "2x^2 + x - 3", marks: 2 },
      { questionNumber: 2, partLabel: "b", answer: "(2x+3)(x-1) = 20 gives 2x^2 + x - 23 = 0", marks: 2 },
      { questionNumber: 2, partLabel: "c", answer: "x = \\frac{-1 \\pm \\sqrt{185}}{4} \\approx 2.65 or -3.15", marks: 1 },
    ],
  }],
  ["worksheet", {
    title: "Surds Worksheet",
    subject: "maths",
    year: 9,
    topic: "Operations with surds",
    totalMarks: 8,
    questions: [
      { number: 1, stem: "Simplify \\sqrt{48}.", marks: 1, workingLines: 2, parts: null, diagramRequired: false },
      { number: 2, stem: "Evaluate \\frac{6}{\\sqrt{2}} with a rational denominator.", marks: 2, workingLines: 3, parts: null, diagramRequired: false },
      { number: 3, stem: "Expand and simplify (\\sqrt{3} + 2)(\\sqrt{3} - 5).", marks: 3, workingLines: 4, parts: null, diagramRequired: false },
      { number: 4, stem: "Given a = 3^2 and b = 2^{-1}, evaluate a \\times b.", marks: 2, workingLines: 3, parts: null, diagramRequired: false },
    ],
    answers: [
      { questionNumber: 1, partLabel: null, answer: "4\\sqrt{3}" },
      { questionNumber: 2, partLabel: null, answer: "3\\sqrt{2}" },
      { questionNumber: 3, partLabel: null, answer: "3 - 3\\sqrt{3} - 10 = -7 - 3\\sqrt{3}" },
      { questionNumber: 4, partLabel: null, answer: "9 \\times \\frac{1}{2} = 4.5" },
    ],
  }],
  ["diagnostic-test", {
    title: "Algebra Diagnostic",
    subject: "maths",
    year: 9,
    topics: ["Indices", "Linear equations", "Surds"],
    totalMarks: 5,
    instructions: "Answer all questions. No calculator.",
    questions: [
      { number: 1, stem: "Simplify x^3 \\times x^4.", marks: 1, workingLines: 1, parts: null, subTopic: "Indices", type: "calculation", options: null },
      { number: 2, stem: "Solve 3x - 7 = 11.", marks: 1, workingLines: 2, parts: null, subTopic: "Linear equations", type: "calculation", options: null },
      { number: 3, stem: "Which is equal to \\sqrt{32}?", marks: 1, workingLines: 0, parts: null, subTopic: "Surds", type: "multiple-choice", options: ["2\\sqrt{8}", "4\\sqrt{2}", "8\\sqrt{2}", "16"] },
    ],
    answers: [
      { questionNumber: 1, subTopic: "Indices", answer: "x^7", note: "Add the indices." },
      { questionNumber: 2, subTopic: "Linear equations", answer: "x = 6", note: "Add 7, divide by 3." },
      { questionNumber: 3, subTopic: "Surds", answer: "4\\sqrt{2}", note: "\\sqrt{32} = \\sqrt{16 \\times 2}." },
    ],
  }],
  ["study-guide", {
    title: "Trigonometry Study Guide",
    subject: "maths",
    year: 10,
    topics: ["Right-angled trigonometry"],
    sections: [
      {
        title: "The trig ratios",
        summary: "In a right-angled triangle the ratios relate an angle to two sides.",
        keyPoints: [
          "sin(θ) = opposite / hypotenuse",
          "cos(θ) = adjacent / hypotenuse",
          "tan(θ) = opposite / adjacent",
        ],
        formulas: [
          { name: "Sine ratio", formula: "\\sin(\\theta) = \\frac{opp}{hyp}", note: "Opposite over hypotenuse." },
          { name: "Pythagoras", formula: "c^2 = a^2 + b^2", note: "Relates the three sides." },
        ],
        definitions: [{ term: "Hypotenuse", definition: "The side opposite the right angle." }],
      },
    ],
    quickReference: [
      { concept: "SOHCAHTOA", summary: "Mnemonic for the three ratios." },
      { concept: "Exact value", summary: "\\tan(45°) = 1, \\sin(30°) = \\frac{1}{2}." },
    ],
  }],
  ["mixed-review", {
    title: "Year 10 Mixed Review",
    subject: "maths",
    year: 10,
    topics: ["Quadratics", "Surds"],
    totalMarks: 4,
    sections: [
      { topic: "Quadratics", questions: [quadQuestion] },
      { topic: "Surds", questions: [fractionQuestion] },
    ],
    answers: [
      { questionNumber: 1, partLabel: null, answer: "x = 2 or x = 3" },
      { questionNumber: 3, partLabel: null, answer: "\\frac{23}{20}; 5\\sqrt{2}" },
    ],
  }],
  ["custom", {
    title: "Exam Revision One-Pager",
    subject: "maths",
    year: 10,
    resourceType: "custom",
    topic: "Quadratics",
    blocks: [
      { type: "heading", text: "Key formula" },
      { type: "paragraph", text: "The quadratic formula solves ax^2 + bx + c = 0." },
      { type: "noteBox", title: "Discriminant", text: "If b^2 - 4ac < 0 there are no real roots." },
      { type: "table", headers: ["Method", "When to use"], rows: [["Factorise", "Nice integer roots"], ["Formula", "Any quadratic"]] },
    ],
  }],
  ["annotation-task", {
    title: "Annotating Imagery and Symbolism",
    subject: "english",
    year: 9,
    passageTitle: "The Keeper of the Point",
    passageAuthor: "Original passage",
    passageSource: null,
    passageText: annotationPassage,
    contextNote: "This is an original prose extract written for annotation practice.",
    tasks: [
      { number: 1, instruction: "Identify one example of symbolism and explain its effect.", type: "analyse", marks: 3, focusQuote: "the town still set its clocks by it", responseLines: 4 },
      { number: 2, instruction: "How does the writer use the lighthouse to reflect the woman's grief?", type: "analyse", marks: 4, focusQuote: null, responseLines: 5 },
      { number: 3, instruction: "Comment on the effect of the phrase 'two landmarks the tide could not move'.", type: "evaluate", marks: 3, focusQuote: "two landmarks the tide could not move", responseLines: 4 },
    ],
    markingGuide: [
      { taskNumber: 1, suggestedResponse: "The lighthouse symbolises constancy and memory; the town setting clocks by it shows how grief becomes routine.", markingCriteria: ["Identifies symbolism", "Explains effect on meaning"] },
      { taskNumber: 2, suggestedResponse: "The dark, unused lighthouse mirrors the mother's suspended life, still standing, still watching, but without its former purpose.", markingCriteria: ["Links image to character", "Uses textual evidence"] },
      { taskNumber: 3, suggestedResponse: "The metaphor equates the woman and the lighthouse, presenting her grief as permanent and immovable.", markingCriteria: ["Analyses metaphor", "Evaluates effect on reader"] },
    ],
  }],
  ["essay-scaffold", {
    title: "Persuasive Essay Scaffold",
    subject: "english",
    year: 9,
    essayType: "Persuasive essay",
    essayQuestion: "Should mobile phones be banned in schools?",
    targetWordCount: 800,
    sections: [
      { name: "Introduction", purpose: "State your contention and preview arguments.", suggestedWordCount: 100, prompts: ["What is your position?", "What three reasons will you give?"], sentenceStarters: ["It is time we acknowledged that...", "This essay contends that..."], planningLines: 3 },
      { name: "Body paragraph 1", purpose: "Strongest argument with evidence.", suggestedWordCount: 180, prompts: ["What is your first reason?", "What evidence supports it?"], sentenceStarters: ["Most importantly,...", "Research consistently shows..."], planningLines: 4 },
      { name: "Conclusion", purpose: "Reinforce contention and end with impact.", suggestedWordCount: 100, prompts: ["How will you restate your view?"], sentenceStarters: ["Ultimately,..."], planningLines: 3 },
    ],
    vocabularyBank: ["furthermore", "consequently", "undeniably", "detrimental", "advocate"],
    generalGuidance: ["Use a consistent, formal tone.", "Address a counter-argument before your conclusion."],
  }],
  ["practice-paper", {
    title: "Persuasive Techniques Practice Paper",
    subject: "english",
    year: 9,
    focus: "Analysing persuasive language",
    totalMarks: 10,
    timeAllowed: "40 minutes",
    instructions: ["Answer in full sentences.", "Refer closely to the text."],
    sections: [
      {
        title: "Section A - Short response",
        instructions: "Answer both questions.",
        questions: [
          { number: 1, stem: "Identify a rhetorical question in a text you have studied and explain its effect.", marks: 4, workingLines: 5, parts: null },
          { number: 2, stem: "How does inclusive language ('we', 'our') position the reader?", marks: 6, workingLines: 6, parts: null },
        ],
      },
    ],
    markingGuide: [
      { questionNumber: 1, partLabel: null, suggestedResponse: "A rhetorical question invites the reader to agree without being told, drawing them into the argument.", markingCriteria: ["Names the technique", "Explains audience effect"], marks: 4 },
      { questionNumber: 2, partLabel: null, suggestedResponse: "Inclusive pronouns build solidarity, making the reader feel part of a shared position and more likely to accept the writer's view.", markingCriteria: ["Identifies effect of inclusive language", "Refers to reader positioning"], marks: 6 },
    ],
  }],
];

function findSoffice() {
  for (const candidate of SOFFICE_CANDIDATES) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      // Not present under this name — try the next candidate.
    }
  }
  return null;
}

async function renderFixtures(outputDir, { pdf = false } = {}) {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const rendered = [];
  for (const [resourceType, resource] of FIXTURES) {
    const buffer = await buildResourceDocx(resourceType, resource, {
      studentName: "Sample Student",
      subject: resource.subject,
      year: resource.year,
      answerMode: "included",
    });
    const filePath = path.join(outputDir, `${resource.subject}-${resourceType}.docx`);
    fs.writeFileSync(filePath, buffer);
    rendered.push({ resourceType, filePath, bytes: buffer.length });
  }

  if (pdf) {
    const soffice = findSoffice();
    if (!soffice) {
      console.warn("LibreOffice (soffice) not found — skipping PDF conversion.");
    } else {
      execFileSync(
        soffice,
        ["--headless", "--convert-to", "pdf", "--outdir", outputDir,
          ...rendered.map((item) => item.filePath)],
        { stdio: "ignore" }
      );
    }
  }

  return rendered;
}

async function main() {
  const args = process.argv.slice(2);
  const pdf = args.includes("--pdf");
  const outputDir = args.find((arg) => !arg.startsWith("--")) || DEFAULT_OUTPUT_DIR;

  const rendered = await renderFixtures(outputDir, { pdf });
  for (const item of rendered) {
    console.log(`${path.basename(item.filePath)} (${item.bytes} bytes)`);
  }
  console.log(`Rendered ${rendered.length} resource fixture DOCX files to ${outputDir}${pdf ? " (+ PDFs)" : ""}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err?.stack || err);
    process.exit(1);
  });
}

module.exports = { FIXTURES, renderFixtures };
