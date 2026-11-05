"use strict";

// RES-64. What the English bank tags stimuli and questions with. The page
// schema (schema.js) is built from these lists, so the model can only return
// values that exist here. Each list has an "other" so a text that fits none
// isn't forced into the wrong one.

const STIMULUS_TYPES = Object.freeze({
  // Written
  prose_fiction: { medium: "written", covers: "an extract from a novel, short story or other narrative fiction" },
  nonfiction: { medium: "written", covers: "an article, feature, essay, memoir, review, report or other non-fiction prose" },
  poem: { medium: "written", covers: "a poem or song lyric" },
  speech: { medium: "written", covers: "a speech, address or transcript of spoken text" },
  letter: { medium: "written", covers: "a letter, diary entry, blog post or other personal writing" },
  drama: { medium: "written", covers: "an extract from a play or film script" },
  other_written: { medium: "written", covers: "any other written text" },
  // Visual
  poster: { medium: "visual", covers: "a poster, flyer or campaign image" },
  advertisement: { medium: "visual", covers: "a print or online advertisement" },
  cartoon: { medium: "visual", covers: "a cartoon, comic strip or graphic novel panel" },
  photograph: { medium: "visual", covers: "a photograph or film still" },
  infographic: { medium: "visual", covers: "an infographic, chart or diagram with text" },
  cover: { medium: "visual", covers: "a book, magazine, album or film cover" },
  artwork: { medium: "visual", covers: "a painting, illustration or other artwork" },
  other_visual: { medium: "visual", covers: "any other visual text" },
});

const TECHNIQUES = Object.freeze({
  written: [
    "metaphor", "simile", "personification", "imagery", "symbolism", "motif", "allusion", "hyperbole", "irony",
    "juxtaposition", "contrast", "alliteration", "assonance", "onomatopoeia", "rhyme_rhythm", "enjambment", "caesura",
    "repetition", "anaphora", "listing", "rhetorical_question", "direct_address", "inclusive_language", "emotive_language",
    "high_modality", "imperative", "first_person_narration", "third_person_narration", "dialogue", "characterisation",
    "setting", "foreshadowing", "flashback", "tone", "sentence_structure", "structure", "word_choice", "other",
  ],
  visual: [
    "salience", "vectors", "gaze", "framing", "colour", "lighting", "layout_reading_path", "camera_angle", "shot_size",
    "typography", "text_image_relationship", "body_language", "symbolism", "juxtaposition", "other",
  ],
});

const QUESTION_TYPES = Object.freeze([
  "multiple_choice", "short_answer", "extended_response", "essay", "imaginative_response", "persuasive_or_discursive",
  "reflection", "other",
]);

// What a question asks the student to do.
const SKILLS = Object.freeze([
  "identify_technique", "explain_technique_effect", "meaning_and_inference", "purpose_and_audience",
  "perspective_and_context", "structure_and_form", "vocabulary_in_context", "compare_texts", "evaluate",
  "compose", "other",
]);

const DIFFICULTIES = Object.freeze(["easy", "medium", "hard"]);

const STIMULUS_TYPE_IDS = Object.freeze(Object.keys(STIMULUS_TYPES));
const ALL_TECHNIQUES = Object.freeze([...new Set([...TECHNIQUES.written, ...TECHNIQUES.visual])]);

function mediumOf(stimulusType) {
  return STIMULUS_TYPES[stimulusType]?.medium ?? null;
}

// A technique outside the stimulus's own medium (salience in a poem) is kept
// only if the other list also has it (symbolism, juxtaposition).
function isTechniqueFor(stimulusType, technique) {
  const medium = mediumOf(stimulusType);
  return Boolean(medium) && TECHNIQUES[medium].includes(technique);
}

module.exports = {
  ALL_TECHNIQUES,
  DIFFICULTIES,
  QUESTION_TYPES,
  SKILLS,
  STIMULUS_TYPES,
  STIMULUS_TYPE_IDS,
  TECHNIQUES,
  isTechniqueFor,
  mediumOf,
};
