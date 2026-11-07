"use strict";

const { isEnglishSubject } = require("./common");

// Shape slips the model makes that would otherwise fail an otherwise complete
// resource at the final build, after every question has been written.
// Production job HdbMuhmzBzaPcygOZYRO hit both.
//
// 1. A grouped question ("Question 1, parts (a)–(d)") typed multiple-choice
//    with one placeholder option ("Answer each part by choosing one option")
//    while the real choices sit on the parts. One option is never a usable
//    multiple-choice question and the parts already carry the choices, so the
//    parent's options are dropped. A lone one-option question (no parts) is
//    still a real error and is left for validation.
// 2. An English question marked diagramRequired: true. English questions
//    never carry a diagram (the schema pins it to null), so the flag can never
//    be satisfied; the model sets it when a task uses a stimulus image, which
//    is printed in the stimulus booklet instead. Maths is untouched: there a
//    required diagram that is missing is a real failure.
function hasUsableOptions(options) {
  return Array.isArray(options) &&
    options.filter((o) => typeof o === "string" && o.trim()).length >= 2;
}

function normaliseQuestionShape(resource, { subject } = {}) {
  const english = isEnglishSubject(resource?.subject || subject);
  const counts = { placeholderOptions: 0, englishDiagramFlags: 0 };
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (Array.isArray(node.parts) && node.parts.length &&
        Array.isArray(node.options) && !hasUsableOptions(node.options)) {
      node.options = null;
      if (node.type === "multiple-choice") node.type = "short-answer";
      counts.placeholderOptions += 1;
    }
    if (english && node.diagramRequired === true && !node.diagram) {
      node.diagramRequired = false;
      counts.englishDiagramFlags += 1;
    }
    Object.values(node).forEach(visit);
  };
  visit(resource);
  return counts;
}

module.exports = { normaliseQuestionShape };
