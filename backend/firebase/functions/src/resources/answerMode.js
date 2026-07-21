"use strict";

const ANSWER_MODES = ["none", "answers", "worked"];

function isAnswerMode(value) {
  return ANSWER_MODES.includes(value);
}

function normaliseAnswerMode({ answerMode, includeWorking } = {}) {
  if (isAnswerMode(answerMode)) return answerMode;
  return includeWorking ? "worked" : "answers";
}

function answerModeForJob(job = {}) {
  return normaliseAnswerMode(job);
}

function includesAnswers(answerMode) {
  return answerMode !== "none";
}

function includesWorking(answerMode) {
  return answerMode === "worked";
}

function shouldIncludeAnswers(options = {}) {
  return includesAnswers(normaliseAnswerMode(options));
}

module.exports = {
  ANSWER_MODES,
  answerModeForJob,
  includesAnswers,
  includesWorking,
  isAnswerMode,
  normaliseAnswerMode,
  shouldIncludeAnswers,
};
