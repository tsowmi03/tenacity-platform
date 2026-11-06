"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { ANSWER_SCHEMA, assignExercises, dropStaleExercises, keepExercisesInOrder, buildPageIndex, linkAnswers, linkMirrorAnswers, findAnswerSectionByImage, isAnswersHeading, linkPaperAnswers, matchMirrorPages, paperPageSections, paperSolutionPages, parseLabel, parsePaperLabel, sameAnswer } = require("../../src/questionBank/answerKeys");

describe("answer keys: labels", () => {
  it("splits printed labels into exercise, number and part", () => {
    assert.deepEqual(parseLabel("Exercise 7A Q2b"), { exercise: "7A", number: 2, part: "b" });
    assert.deepEqual(parseLabel("Q4a"), { exercise: null, number: 4, part: "a" });
    assert.deepEqual(parseLabel("Question 12(e)(i)"), { exercise: null, number: 12, part: "e.i" });
    assert.deepEqual(parseLabel("Q14b(ii)"), { exercise: null, number: 14, part: "b.ii" });
    assert.deepEqual(parseLabel("Q5a i"), { exercise: null, number: 5, part: "a.i" });
    assert.deepEqual(parseLabel("7A Q3"), { exercise: "7A", number: 3, part: "" });
    assert.equal(parseLabel("Finding an unknown side - example 1").number, null);
  });

  it("does not address an answer from a section that repeats in every chapter", () => {
    assert.equal(parseLabel("Pre-test Q5").number, null);
    assert.equal(parseLabel("Let's start: Rectangular distributions Q1a").number, null);
  });
});

describe("answer keys: page index", () => {
  // Printed page = PDF page - 2, shown at the top of every page.
  const book = [
    "Cover", "Contents",
    "1 Chapter 1 Exercise 1A 1 Find x", "2 more questions",
    "3 Exercise 1B 1 Find y", "4 questions",
    "5 Answers 1A 1 a 12", "6 Answers 1B 1 a 7",
  ];

  it("finds the printed page offset, exercise headings and the answer section", () => {
    const index = buildPageIndex(book);
    assert.equal(index.offset, 2);
    assert.equal(index.pages[2].printedPage, 1);
    assert.deepEqual(index.pages[2].headings, ["1A"]);
    assert.deepEqual(index.pages.filter((p) => p.answerPage).map((p) => p.page), [7, 8]);
  });

  it("reads past copyright lines and takes the whole back section as answers", () => {
    // Cambridge style: ISBN line first, printed page = PDF page + 10, and only
    // the first answer page is headed "Answers".
    const legal = "ISBN 978-1-108-46816-9 2ed © Palmer et al. 2019 Cambridge University Press\nPhotocopying is restricted under law.";
    const texts = Array.from({ length: 12 }, (_, i) => `${legal}\n${i + 11}\tExercise ${i + 1}A\n1 a Find x`);
    texts[8] = `${legal}\n19\nAnswers\nChapter 1\n1 a 17 b 11`;
    texts[9] = `${legal}\n20\n2 a 5 b 6`;
    texts[10] = `${legal}\n21\n3 a 7`;
    texts[11] = `${legal}\n22\nIndex\nangle 4`;
    const index = buildPageIndex(texts);
    assert.equal(index.offset, -10);
    assert.deepEqual(index.pages.filter((p) => p.answerPage).map((p) => p.page), [9, 10, 11]);
  });

  it("starts a new exercise where the numbering resets on the page that opens it", () => {
    const index = { pages: [{ page: 1, headings: ["1A"] }, { page: 2, headings: ["1B"] }] };
    const questions = [
      { id: "a", label: "Q1", pageNumber: 1, box: { y0: 10 } },
      { id: "b", label: "Q6", pageNumber: 2, box: { y0: 10 } },
      { id: "c", label: "Q1", pageNumber: 2, box: { y0: 400 } },
    ];
    const ex = assignExercises(questions, index);
    assert.deepEqual([ex.get("a"), ex.get("b"), ex.get("c")], ["1A", "1A", "1B"]);
  });

  it("leaves the exercise unknown where numbering restarts with no new heading", () => {
    const index = { pages: [{ page: 1, headings: ["3C"] }, { page: 2, headings: [] }] };
    const questions = [
      { id: "a", label: "Q5", pageNumber: 1, box: { y0: 10 } },
      { id: "b", label: "Q6", pageNumber: 1, box: { y0: 400 } },
      { id: "c", label: "Q1", pageNumber: 2, box: { y0: 10 } },
      { id: "d", label: "Q2a", pageNumber: 2, box: { y0: 400 } },
    ];
    const ex = assignExercises(questions, index);
    assert.deepEqual([ex.get("a"), ex.get("b"), ex.get("c"), ex.get("d")], ["3C", "3C", null, null]);
  });

  it("drops a review question that names an exercise out of book order", () => {
    const q = (id, page) => ({ id, pageNumber: page, box: { y0: 0 } });
    const questions = [q("a", 20), q("b", 21), q("c", 40), q("d", 41), q("e", 70), q("f", 144)];
    const ex = new Map([["a", "1.01"], ["b", "1.01"], ["c", "1.05"], ["d", "1.05"], ["e", "1.01"], ["f", "1.04"]]);
    const kept = keepExercisesInOrder(questions, ex);
    assert.deepEqual(["a", "b", "c", "d", "e", "f"].map((id) => kept.get(id)), ["1.01", "1.01", "1.05", "1.05", null, null]);
  });
});

describe("answer keys: linking", () => {
  it("links by exercise or by printed page, and never on an ambiguous key", () => {
    const index = { pages: [{ page: 1, headings: ["1A"], printedPage: 7 }, { page: 2, headings: [], printedPage: 8 }] };
    const questions = [
      { id: "a", label: "Q1a", pageNumber: 1 },
      { id: "b", label: "Q2", pageNumber: 2 },
      { id: "c", label: "Q3", pageNumber: 2 },
      { id: "d", label: "Q4", pageNumber: 2 },
    ];
    const entries = [
      { exercise: "1A", page: null, question: 1, part: "a", answer: "12 cm" },
      { exercise: null, page: 8, question: 2, part: "", answer: "7" },
      { exercise: "1A", page: null, question: 3, part: "", answer: "[diagram]" },
      { exercise: "1A", page: null, question: 4, part: "", answer: "5" },
      { exercise: "1A", page: null, question: 4, part: "", answer: "6" },
    ];
    const result = linkAnswers({ questions, index, entries });
    assert.deepEqual(result.links.map((l) => [l.questionId, l.answer, l.via]), [["a", "12 cm", "exercise"], ["b", "7", "page"]]);
    assert.equal(result.numbered, 4);
    assert.equal(result.conflicted, 1);
  });

  it("stops filing answers under an exercise once its numbering restarts", () => {
    const entries = [
      { exercise: "4G", question: 26, part: "", answer: "x" },
      { exercise: "4G", question: 27, part: "", answer: "y" },
      { exercise: "4G", question: 1, part: "b", answer: "Pay = $13.50" },
      { exercise: "4H", question: 1, part: "", answer: "z" },
    ];
    assert.deepEqual(dropStaleExercises(entries).map((e) => e.exercise), ["4G", "4G", null, "4H"]);
  });

  it("asks for a strict-mode schema", () => {
    const missing = Object.keys(ANSWER_SCHEMA.properties.entries.items.properties).filter((k) => !ANSWER_SCHEMA.properties.entries.items.required.includes(k));
    assert.deepEqual(missing, []);
  });
});

describe("answer keys: teacher editions that mirror the student book", () => {
  const page = (topic) => `Copyright © 3P Learning\nGeometry ${topic}\nFold the circle in half and measure how many degrees are in each quarter section of ${topic} carefully`;

  it("matches each student page to the teacher page with the same words, allowing extra pages", () => {
    const student = [page("angles"), page("triangles"), "Notes"];
    const teacher = ["Teacher notes about marking", page("angles"), page("triangles")];
    assert.deepEqual([...matchMirrorPages(student, teacher)], [[1, 2], [2, 3]]);
  });

  it("links answers by label and never on a label the page repeats", () => {
    const questions = [{ id: "a", label: "Q3a", pageNumber: 6 }, { id: "b", label: "Q3b", pageNumber: 6 }, { id: "c", label: "Q3b", pageNumber: 6 }, { id: "d", label: "Q4", pageNumber: 6 }];
    const links = linkMirrorAnswers(questions, [{ label: "Q3a", answer: "180°" }, { label: "Q3b", answer: "90°" }, { label: "Q4", answer: "[diagram]" }, { label: "Q9", answer: "1" }]);
    assert.deepEqual(links.map((l) => [l.questionId, l.answer]), [["a", "180°"]]);
  });
});

describe("answer keys: past papers", () => {
  it("reads paper labels, keeping only a lettered section", () => {
    assert.deepEqual(parsePaperLabel("Section B Q2"), { section: "B", number: 2, part: "" });
    assert.deepEqual(parsePaperLabel("Question 11(a)(i)"), { section: null, number: 11, part: "a.i" });
    assert.deepEqual(parsePaperLabel("2004 Year 9 Yearly Q3"), { section: null, number: 3, part: "" });
    assert.deepEqual(parsePaperLabel("Section II Question 14(b)"), { section: null, number: 14, part: "b" });
  });

  it("finds typed solutions from their heading, but not from an answer column", () => {
    const typed = ["Year 10 Yearly", "Question One (20 marks) Answers Marks", "Question 2", "Question 3", "Marking guidelines\nQuestion 1", "Question 2 sample solution"];
    assert.deepEqual(paperSolutionPages(typed, [2, 3]), { mode: "pages", pages: [5, 6] });
  });

  it("takes scanned pages after the last question as the solutions", () => {
    assert.deepEqual(paperSolutionPages(["", "", "", "", ""], [1, 3]), { mode: "pages", pages: [4, 5] });
    const typedThenScanned = ["Question One (20 marks) Answers Marks", "Question Two (20 marks) Answers Marks", "", "", ""];
    assert.deepEqual(paperSolutionPages(typedThenScanned, [1, 2]), { mode: "pages", pages: [3, 4, 5] });
  });

  it("finds an answered second copy of the paper", () => {
    const page = (n) => `Year 9 Mathematics Assessment Task question ${n} solve the quadratic equation and sketch parabola showing intercepts turning point ${"abcdefghij".slice(n)}`;
    const found = paperSolutionPages([page(1), page(2), page(1), page(2)], [1, 2]);
    assert.equal(found.mode, "mirror");
    assert.deepEqual([...found.mirror], [[1, 3], [2, 4]]);
  });

  it("knows each page's lettered section", () => {
    const sections = paperPageSections(["Section A: Quadratics\nQuestion 1", "Question 3", "Q5\nmore\nmore\nmore\nSection B: Trigonometry\nQuestion 1", "Question 4"]);
    assert.deepEqual([...sections.values()], ["A", "A", "A", "B"]);
  });

  it("links by section, number and part", () => {
    const questions = [{ id: "a", label: "Section A Q1" }, { id: "b", label: "Section B Q1a" }, { id: "c", label: "Q12(b)(ii)" }];
    const entries = [
      { exercise: "A", question: 1, part: "", answer: "3" },
      { exercise: "B", question: 1, part: "a", answer: "x = 2" },
      { exercise: "Section II", question: 12, part: "b.ii", answer: "45°" },
    ];
    assert.deepEqual(linkPaperAnswers({ questions, entries }).links.map((l) => [l.questionId, l.answer]), [["a", "3"], ["b", "x = 2"], ["c", "45°"]]);
  });

  it("uses the page's section when the label has none, and drops a number two sections share", () => {
    const questions = [{ id: "a", label: "Question 1", pageNumber: 2 }, { id: "b", label: "Question 1", pageNumber: 5 }, { id: "c", label: "Question 9", pageNumber: 5 }];
    const entries = [
      { exercise: "A", question: 1, part: "", answer: "3" },
      { exercise: "B", question: 1, part: "", answer: "7" },
      { exercise: null, question: 9, part: "", answer: "12" },
    ];
    const pageSections = new Map([[2, "A"], [5, "B"]]);
    assert.deepEqual(linkPaperAnswers({ questions, entries, pageSections }).links.map((l) => [l.questionId, l.answer]), [["a", "3"], ["b", "7"], ["c", "12"]]);
    assert.deepEqual(linkPaperAnswers({ questions: questions.slice(0, 2), entries }).links, [], "without sections, Question 1 is ambiguous");
  });

  it("never gives a sectioned question another section's answer", () => {
    const questions = [{ id: "c", label: "Section C Q1c" }];
    const entries = [{ exercise: "A", question: 1, part: "c", answer: "$2m^2-9m$" }];
    assert.deepEqual(linkPaperAnswers({ questions, entries }).links, []);
  });
});

describe("answer keys: finding the answer section", () => {
  it("knows an answers heading from a step that says answer", () => {
    for (const line of ["Answers", "Answers 7A ➜ 7E", "799\tAnswers \t799\tAnswers", "Chapter 1 answers"]) assert.equal(isAnswersHeading(line), true, line);
    for (const line of ["4 \tAnswer the question in a sentence.", "Answers will vary", "Question One (20 marks) Answers Marks"]) assert.equal(isAnswersHeading(line), false, line);
  });

  it("walks back from the end of a scanned book to the answer section", async () => {
    const kinds = { 10: "other", 9: "answers", 8: "answers", 7: "answers", 6: "questions", 5: "questions", 4: "questions", 3: "questions", 2: "answers" };
    const asked = [];
    const pages = await findAnswerSectionByImage({ pageCount: 10, kindOf: async (p) => { asked.push(p); return kinds[p] || "questions"; } });
    assert.deepEqual(pages, [7, 8, 9]);
    assert.deepEqual(asked, [10, 9, 8, 7, 6, 5, 4, 3], "stops after four question pages");
  });
});

describe("answer keys: comparing answers", () => {
  it("agrees within shown rounding and on equivalent forms, and defers worded answers", () => {
    assert.equal(sameAnswer("12 cm", "12"), true);
    assert.equal(sameAnswer("585.3 cm²", "585.27"), true);
    assert.equal(sameAnswer("$\\frac{3}{4}$", "0.75"), true);
    assert.equal(sameAnswer("6.62", "6.63"), false);
    assert.equal(sameAnswer("2.4", "2.5"), false);
    assert.equal(sameAnswer("Strong", "strong"), true);
    assert.equal(sameAnswer("Strong positive", "Weak"), null);
  });
});
