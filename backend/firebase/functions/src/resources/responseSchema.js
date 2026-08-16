"use strict";

/**
 * JSON Schemas for structured resource generation (AWP-15).
 *
 * These mirror, one factory at a time, the pseudo-schemas that promptBuilder.js
 * writes into the system prompt. The prompt still carries the pedagogy, the
 * maths formatting rules, and the scope discipline; this module carries only
 * shape, handed to the API as `output_config.format` so the response is valid
 * JSON by construction. Keep the two in step — a field added to
 * SYSTEM_PROMPT_BUILDERS without a matching field here is a field the model is
 * asked for and then forbidden from emitting.
 *
 * What the schema deliberately does NOT express: structured outputs rejects
 * `minimum`/`maximum`/`minLength`/`multipleOf` and recursive schemas, and
 * requires `additionalProperties: false` on every object. So every semantic rule
 * in builder/validation.js — Pythagoras on triangle dimensions, angles summing
 * to 180, marks being positive, arrays being non-empty — still lives there and
 * still runs. This layer stops the model inventing fields; validation.js stops
 * it inventing nonsense.
 *
 * Optionality is expressed as an explicit null branch rather than by omitting
 * the key from `required`, matching how the prompt already writes it
 * ("null | string") and what validation.js's optional* helpers already accept.
 */

const { isEnglishSubject } = require("./builder/validation");
const { DIAGRAM_REGISTRY } = require("./diagramRegistry");

// --- schema primitives -----------------------------------------------------

const str = Object.freeze({ type: "string" });
const num = Object.freeze({ type: "number" });
const int = Object.freeze({ type: "integer" });
const bool = Object.freeze({ type: "boolean" });

/**
 * An optional field, expressed as a type union rather than an `anyOf` fork.
 *
 * This matters more than it looks. Every `anyOf` multiplies branches in the
 * grammar the API compiles from the schema, and the topic booklet — which nests
 * questions under both subTopics and endQuiz, each with their own optional
 * parts — was rejected outright with "the compiled grammar is too large" when
 * every nullable field forked. A type union collapses that to one branch.
 *
 * An enum keeps the anyOf form: widening `type` without adding null to `enum`
 * would forbid the null it just allowed.
 */
const nullable = (schema) =>
  typeof schema.type === "string" && !schema.enum && !schema.anyOf
    ? { ...schema, type: [schema.type, "null"] }
    : { anyOf: [schema, { type: "null" }] };

const arrayOf = (items) => ({ type: "array", items });
const enumOf = (values) => ({ type: "string", enum: [...values] });
const strArray = arrayOf(str);

/**
 * Every property is listed in `required`; fields the prompt marks as optional
 * use nullable() instead of being dropped from the list. Structured outputs is
 * happiest with a fully-specified object, and an explicit null is easier for
 * the builders to reason about than an absent key.
 */
function obj(properties) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

// --- shared fragments ------------------------------------------------------

// The diagram object is never written during resource generation — see
// diagramSchema.js for the measurements that forced that.
const NO_DIAGRAM = Object.freeze({ type: "null" });

// Every diagram type the registry knows, plus the opt-out. Maths questions pick
// one; the object itself is filled in by a later call (see diagramSchema.js).
const DIAGRAM_TYPE_FIELD = enumOf([...Object.keys(DIAGRAM_REGISTRY), "none"]);

// Mirrors questionSchemaText() in promptBuilder.js. `diagram` is pinned to null
// in both subjects: English questions never have one, and maths fills it in
// after generation rather than during it.
function diagramProperties(subject) {
  return subject === "maths"
    ? { diagram: NO_DIAGRAM, diagramType: DIAGRAM_TYPE_FIELD, diagramRequired: bool }
    : { diagram: NO_DIAGRAM, diagramRequired: bool };
}

function questionPartSchemaFor(subject) {
  return obj({ label: str, stem: str, marks: int, ...diagramProperties(subject) });
}

function questionSchema(subject) {
  return obj({
    number: int,
    stem: str,
    marks: int,
    ...diagramProperties(subject),
    parts: nullable(arrayOf(questionPartSchemaFor(subject))),
  });
}

// Mirrors stimulusSchema() in promptBuilder.js. The `verbatim` flag that
// applySourcedStimulus() sets is added after parsing by the pipeline, never by
// the model, so it is deliberately absent here.
const stimulusField = nullable(
  arrayOf(
    obj({
      label: str,
      textType: enumOf(["poem", "prose"]),
      title: str,
      author: nullable(str),
      source: nullable(str),
      body: str,
    })
  )
);

/**
 * The stimulus property, present only when the pipeline sourced public-domain
 * text(s) for this job. Omitting it is what makes "do not invent reading texts"
 * enforceable rather than merely requested: a field the schema does not declare
 * is a field the model cannot emit. Mirrors stimulusSchemaField() in
 * promptBuilder.js — the two must agree, or the prompt asks for something the
 * schema forbids.
 */
const stimulusProperty = (hasStimulus) =>
  hasStimulus ? { stimulus: stimulusField } : {};

const definitionsField = nullable(arrayOf(obj({ term: str, definition: str })));

const quickReferenceField = nullable(
  arrayOf(obj({ concept: str, summary: str }))
);

// --- English tutor-copy shapes ---------------------------------------------
//
// English resources carry a marking guide rather than an answers table. The
// answer mode ("none" / "answers" / "worked") changes the prose guidance in the
// prompt but not the shape: at "none" the model returns an empty array, which
// this schema already permits, and the builders skip validateTutorCopy
// entirely. That keeps one schema per resource type instead of three.

const practiceMarkingGuideField = arrayOf(
  obj({
    questionNumber: int,
    partLabel: nullable(str),
    suggestedResponse: str,
    markingCriteria: strArray,
    marks: num,
  })
);

const topicMarkingGuideField = arrayOf(
  obj({
    section: str,
    questionNumber: int,
    partLabel: nullable(str),
    suggestedResponse: str,
    markingCriteria: strArray,
  })
);

const diagnosticMarkingGuideField = arrayOf(
  obj({
    questionNumber: int,
    subTopic: str,
    suggestedResponse: str,
    markingCriteria: strArray,
  })
);

const standardMarkingGuideField = arrayOf(
  obj({
    questionNumber: int,
    partLabel: nullable(str),
    topic: nullable(str),
    suggestedResponse: str,
    markingCriteria: strArray,
  })
);

// --- maths tutor-copy shapes -----------------------------------------------
//
// Maths carries an answers table rather than a marking guide. Unlike English,
// the answer mode does change the shape here: at "worked" every entry must carry
// step-by-step working, and at "answers" it must not. Branching the field means
// the schema enforces the mode instead of leaving it to the prompt.

const workingOutField = (answerMode) =>
  answerMode === "worked" ? str : { type: "null" };

const practiceAnswersField = (answerMode) =>
  arrayOf(
    obj({
      questionNumber: int,
      partLabel: nullable(str),
      answer: str,
      marks: num,
      workingOut: workingOutField(answerMode),
    })
  );

const topicAnswersField = (answerMode) =>
  arrayOf(
    obj({
      questionNumber: int,
      partLabel: nullable(str),
      answer: str,
      workingOut: workingOutField(answerMode),
    })
  );

const diagnosticAnswersField = (answerMode) =>
  arrayOf(
    obj({
      questionNumber: int,
      subTopic: str,
      answer: str,
      note: nullable(str),
      workingOut: workingOutField(answerMode),
    })
  );

const standardAnswersField = (answerMode) =>
  arrayOf(
    obj({
      questionNumber: int,
      partLabel: nullable(str),
      answer: str,
      workingOut: workingOutField(answerMode),
    })
  );

/**
 * The tutor-facing half of a resource: a marking guide for English, an answers
 * table for maths. Mirrors the *AnswerSchema() pair in promptBuilder.js.
 */
function tutorCopy(family, { subject, answerMode }) {
  const english = {
    practice: () => ({ markingGuide: practiceMarkingGuideField }),
    topic: () => ({ markingGuide: topicMarkingGuideField }),
    diagnostic: () => ({ markingGuide: diagnosticMarkingGuideField }),
    standard: () => ({ markingGuide: standardMarkingGuideField }),
  };
  const mathematics = {
    practice: () => ({ answers: practiceAnswersField(answerMode) }),
    topic: () => ({ answers: topicAnswersField(answerMode) }),
    diagnostic: () => ({ answers: diagnosticAnswersField(answerMode) }),
    standard: () => ({ answers: standardAnswersField(answerMode) }),
  };
  return (isEnglishSubject(subject) ? english : mathematics)[family]();
}

// --- per-resource-type builders --------------------------------------------

function practicePaperSchema({ subject, answerMode, hasStimulus } = {}) {
  return obj({
    title: str,
    subject: str,
    year: int,
    topics: strArray,
    focus: nullable(str),
    totalMarks: num,
    timeAllowed: str,
    ...stimulusProperty(hasStimulus),
    sections: arrayOf(
      obj({ title: str, questions: arrayOf(questionSchema(subject)) })
    ),
    ...tutorCopy("practice", { subject, answerMode }),
  });
}

// The topic booklet is generated in two constrained calls rather than one — see
// SPLIT_SCHEMA_BUILDERS below for why. These two halves compose back into the
// same document shape the single-call schema described.
function topicBookletContentSchema({ subject, answerMode } = {}) {
  return obj({
    title: str,
    subject: str,
    year: int,
    topic: str,
    learningObjectives: strArray,
    nesaOutcomes: nullable(strArray),
    subTopics: arrayOf(
      obj({
        title: str,
        explanation: str,
        definitions: definitionsField,
        ...(isEnglishSubject(subject)
          ? {
              modelAnalysis: nullable(
                arrayOf(obj({ quote: str, technique: str, effect: str }))
              ),
              exemplarParagraph: nullable(str),
            }
          : {
              workedExamples: nullable(
                arrayOf(
                  obj({
                    title: str,
                    steps: arrayOf(obj({ working: str, explanation: str })),
                  })
                )
              ),
            }),
        tip: nullable(str),
        commonMistake: nullable(str),
        practiceQuestions: arrayOf(questionSchema(subject)),
      })
    ),
    quickReference: quickReferenceField,
  });
}

function topicBookletAssessmentSchema({ subject, answerMode } = {}) {
  return obj({
    endQuiz: obj({
      sections: arrayOf(
        obj({ title: str, questions: arrayOf(questionSchema(subject)) })
      ),
    }),
    ...tutorCopy("topic", { subject, answerMode }),
  });
}

function topicBookletSchema(options = {}) {
  const content = topicBookletContentSchema(options);
  const assessment = topicBookletAssessmentSchema(options);
  return obj({ ...content.properties, ...assessment.properties });
}

function studyGuideSchema({ subject, answerMode, hasStimulus } = {}) {
  return obj({
    title: str,
    subject: str,
    year: int,
    topics: strArray,
    ...stimulusProperty(hasStimulus),
    sections: arrayOf(
      obj({
        title: str,
        summary: str,
        keyPoints: strArray,
        definitions: definitionsField,
        ...(isEnglishSubject(subject)
          ? {
              quotations: nullable(
                arrayOf(obj({ quote: str, significance: str }))
              ),
              contextNotes: nullable(strArray),
            }
          : {
              formulas: nullable(
                arrayOf(obj({ name: str, formula: str, note: str }))
              ),
            }),
      })
    ),
    quickReference: quickReferenceField,
  });
}

function worksheetSchema({ subject, answerMode, hasStimulus } = {}) {
  return obj({
    title: str,
    subject: str,
    year: int,
    topic: str,
    ...stimulusProperty(hasStimulus),
    totalMarks: num,
    questions: arrayOf(questionSchema(subject)),
    ...tutorCopy("standard", { subject, answerMode }),
  });
}

function diagnosticTestSchema({ subject, answerMode, hasStimulus } = {}) {
  return obj({
    title: str,
    subject: str,
    year: int,
    topics: strArray,
    ...stimulusProperty(hasStimulus),
    totalMarks: num,
    questions: arrayOf(
      obj({
        number: int,
        subTopic: str,
        stem: str,
        // Mirrors diagnosticTypeEnum(): "calculation" is maths-only.
        type: enumOf(
          isEnglishSubject(subject)
            ? ["short-answer", "multiple-choice"]
            : ["short-answer", "multiple-choice", "calculation"]
        ),
        options: nullable(strArray),
        marks: int,
        ...diagramProperties(subject),
      })
    ),
    ...tutorCopy("diagnostic", { subject, answerMode }),
  });
}

function mixedReviewSchema({ subject, answerMode, hasStimulus } = {}) {
  return obj({
    title: str,
    subject: str,
    year: int,
    topics: strArray,
    ...stimulusProperty(hasStimulus),
    totalMarks: num,
    sections: arrayOf(
      obj({ topic: str, questions: arrayOf(questionSchema(subject)) })
    ),
    ...tutorCopy("standard", { subject, answerMode }),
  });
}

function annotationTaskSchema({ subject, answerMode } = {}) {
  return obj({
    title: str,
    subject: enumOf(["english"]),
    year: int,
    topics: strArray,
    passageTitle: str,
    passageAuthor: nullable(str),
    passageSource: nullable(str),
    passageText: str,
    contextNote: nullable(str),
    tasks: arrayOf(
      obj({
        number: int,
        instruction: str,
        type: enumOf(["identify", "explain", "analyse", "compare", "evaluate"]),
        marks: int,
        focusQuote: nullable(str),
      })
    ),
    markingGuide: arrayOf(
      obj({ taskNumber: int, suggestedResponse: str, markingCriteria: strArray })
    ),
  });
}

function essayScaffoldSchema({ subject, answerMode, hasStimulus } = {}) {
  return obj({
    title: str,
    subject: enumOf(["english"]),
    year: int,
    topics: strArray,
    ...stimulusProperty(hasStimulus),
    essayType: str,
    essayQuestion: str,
    targetWordCount: num,
    sections: arrayOf(
      obj({
        name: str,
        purpose: str,
        suggestedWordCount: num,
        prompts: strArray,
        sentenceStarters: strArray,
        planningLines: num,
      })
    ),
    vocabularyBank: nullable(strArray),
    generalGuidance: strArray,
  });
}

function customSchema({ subject, answerMode } = {}) {
  const question = questionSchema(subject);
  return obj({
    title: str,
    subject: str,
    year: int,
    resourceType: enumOf(["custom"]),
    topic: nullable(str),
    blocks: arrayOf({
      anyOf: [
        obj({ type: enumOf(["heading"]), text: str }),
        obj({ type: enumOf(["paragraph"]), text: str }),
        obj({ type: enumOf(["bulletList"]), items: strArray }),
        obj({
          type: enumOf(["table"]),
          headers: strArray,
          rows: arrayOf(strArray),
        }),
        obj({ type: enumOf(["noteBox"]), title: str, text: str }),
        obj({ type: enumOf(["questionSet"]), questions: arrayOf(question) }),
        obj({
          type: enumOf(["answerSection"]),
          title: str,
          answers: arrayOf(
            obj({
              questionNumber: int,
              partLabel: nullable(str),
              answer: str,
            })
          ),
        }),
        obj({
          type: enumOf(["markingGuideSection"]),
          title: str,
          guidance: arrayOf(
            obj({
              questionNumber: int,
              partLabel: nullable(str),
              suggestedResponse: str,
              markingCriteria: strArray,
            })
          ),
        }),
      ],
    }),
  });
}

// Mirrors SYSTEM_PROMPT_BUILDERS in promptBuilder.js, key for key.
const SCHEMA_BUILDERS = Object.freeze({
  "practice-paper": practicePaperSchema,
  "topic-booklet": topicBookletSchema,
  "study-guide": studyGuideSchema,
  worksheet: worksheetSchema,
  "diagnostic-test": diagnosticTestSchema,
  "mixed-review": mixedReviewSchema,
  "annotation-task": annotationTaskSchema,
  "essay-scaffold": essayScaffoldSchema,
  custom: customSchema,
});

/**
 * Resource types too large to constrain in a single call, in either subject: the
 * API answers a request carrying the whole schema with 400 "The compiled grammar is too large,
 * which would cause performance issues."
 *
 * The topic booklet is the only one. It carries the question shape twice — once
 * for each sub-topic's practice questions, once for the end-of-topic quiz — and
 * each question nests its own sub-parts. Measured against the types that do
 * compile, the ceiling sits between `custom` (44 properties / ~3.0KB of schema,
 * accepted) and the booklet (62 / ~3.8KB, rejected), and it is tight: a booklet
 * stripped of its stimulus and every quiz sub-part still measured 3097 bytes and
 * was still refused. Hoisting the duplicated question shape into `$defs` does
 * not help either — the grammar is inlined regardless.
 *
 * So the booklet is generated in two constrained calls instead (teaching content,
 * then quiz and marking guide), each comfortably inside the budget at ~2.1KB and
 * ~1.4KB. See SPLIT_SCHEMA_BUILDERS.
 */
const SINGLE_CALL_TOO_LARGE = Object.freeze(new Set(["topic-booklet"]));

/**
 * Resource types generated in two constrained calls. The pipeline runs `content`
 * first, then passes that result to the `assessment` call as context so the quiz
 * covers what the booklet actually taught, and merges the two objects.
 */
const SPLIT_SCHEMA_BUILDERS = Object.freeze({
  "topic-booklet": {
    content: topicBookletContentSchema,
    assessment: topicBookletAssessmentSchema,
  },
});

/**
 * The schema to constrain a resource generation with, or null to leave the call
 * unconstrained.
 *
 * Maths returns null for now: its questions carry a "diagram" object spanning 41
 * types, and structured outputs cannot express an open object, so maths has to
 * wait for the full diagram union (AWP-15 PR2). Until then maths generation
 * behaves exactly as it does today.
 */
function buildResponseSchema(
  resourceType,
  { subject, answerMode = "answers", hasStimulus = false } = {}
) {
  // Split types have no single-call schema. This is also what the repair
  // pipeline asks for, so a booklet repair stays unconstrained — repair rewrites
  // a whole document in one pass, which is exactly the shape that does not fit.
  if (SINGLE_CALL_TOO_LARGE.has(resourceType)) return null;
  const builder = SCHEMA_BUILDERS[resourceType];
  return builder ? builder({ subject, answerMode, hasStimulus }) : null;
}

/**
 * The two half-schemas for a resource type generated in two calls, or null when
 * the type is generated in one.
 */
function buildSplitResponseSchemas(
  resourceType,
  { subject, answerMode = "answers", hasStimulus = false } = {}
) {
  const builders = SPLIT_SCHEMA_BUILDERS[resourceType];
  if (!builders) return null;
  const options = { subject, answerMode, hasStimulus };
  return { content: builders.content(options), assessment: builders.assessment(options) };
}

/**
 * verifyMathsAnswers asks for a bare answers array. Structured outputs wants an
 * object at the root, so wrap it — the caller already accepts either a bare
 * array or an { answers } object.
 */
function buildVerifiedAnswersSchema({ subject, answerMode } = {}) {
  return obj({
    answers: arrayOf(
      obj({
        questionNumber: int,
        partLabel: nullable(str),
        answer: str,
        marks: num,
        workingOut: str,
      })
    ),
  });
}

module.exports = {
  SCHEMA_BUILDERS,
  SINGLE_CALL_TOO_LARGE,
  SPLIT_SCHEMA_BUILDERS,
  arrayOf,
  buildResponseSchema,
  buildSplitResponseSchemas,
  buildVerifiedAnswersSchema,
  enumOf,
  nullable,
  obj,
  questionSchema,
  str,
};
