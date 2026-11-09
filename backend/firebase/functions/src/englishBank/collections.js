"use strict";

// In a file of their own so the generator can search the bank without loading
// the extraction code (records.js pulls in the PDF and image libraries).
module.exports = Object.freeze({
  STIMULI_COLLECTION: "englishStimuli",
  QUESTIONS_COLLECTION: "englishQuestions",
  GUIDES_COLLECTION: "englishGuides",
});
