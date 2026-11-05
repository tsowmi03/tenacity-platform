"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { SET_TEXT_SCHEMA, chooseLitChartFiles, setTextPrompt, slugOf, titleKey, toSetTextDoc } = require("../../src/englishBank/setTexts");

const file = (path, id = path) => ({ id, name: path.split("/").pop(), path });

describe("English set-text reference bank", () => {
  it("takes one main LitChart per text, never the translation", () => {
    const chosen = chooseLitChartFiles([
      file("English/LitCharts/AnimalFarm/Word version/1. Start Here.pdf"),
      file("English/LitCharts/AnimalFarm/Word version/Animal-Farm-LitChart.pdf"),
      file("English/LitCharts/Macbeth LitCharts/macbeth-LitCharts-Shakescleare-Translation.pdf"),
      file("English/LitCharts/Macbeth LitCharts/Macbeth-LitChart.pdf"),
      file("English/LitCharts/Macbeth LitCharts/Macbeth Teacher/Macbeth-LitChart.pdf"),
      file("English/LitCharts/MrPip/Word version/1. Start Here.pdf"),
      file("English/LitCharts/Mr-Pip-LitChart.pdf"),
      file("English/LitCharts/LitCharts-the-road-not-taken.pdf"),
      file("English/LitCharts/OfMiceandMen/Of-Mice-and-Men-LitChart.docx"),
      file("English/Comprehension/Some-LitChart.pdf"),
    ]);
    assert.deepEqual(chosen.map((f) => f.path), [
      "English/LitCharts/AnimalFarm/Word version/Animal-Farm-LitChart.pdf",
      "English/LitCharts/LitCharts-the-road-not-taken.pdf",
      "English/LitCharts/Macbeth LitCharts/Macbeth-LitChart.pdf",
      "English/LitCharts/Mr-Pip-LitChart.pdf",
    ]);
  });

  it("matches the same title however LitCharts named the file", () => {
    assert.equal(titleKey("Mr-Pip-LitChart.pdf"), titleKey("LitCharts-mr-pip.pdf"));
    assert.equal(titleKey("Lamb-to-the-Slaughter-LitChart (2).pdf"), "lamb to the slaughter");
    assert.equal(slugOf("Alice's Adventures in Wonderland"), "alice-s-adventures-in-wonderland");
  });

  it("keeps only quotes that are really in the guide", () => {
    const guideText = "Macbeth says: Is this a dagger which I see before me, The handle toward my hand? Later, ‘Out, damned spot!’";
    const parsed = {
      title: "Macbeth", author: "William Shakespeare", form: "play", summary: "A tragedy.", context: null,
      themes: [{ name: "Ambition", description: "It ruins him." }, { name: "", description: "empty" }],
      characters: [{ name: "Macbeth", description: "A thane." }], symbols: [],
      quotes: [
        { quote: "Is this a dagger which I see before me,\nthe handle toward my hand?", speaker: "Macbeth", location: "Act 2, Scene 1", themes: ["Ambition"], techniques: ["imagery", "imagery"], explanation: "x" },
        { quote: "'Out, damned spot!'", speaker: "Lady Macbeth", location: null, themes: [], techniques: [], explanation: "y" },
        { quote: "Fair is foul and foul is fair", speaker: "Witches", location: null, themes: [], techniques: [], explanation: "not in this guide text" },
      ],
    };
    const doc = toSetTextDoc({ source: { id: "drive7", name: "Macbeth-LitChart.pdf", path: "English/LitCharts/Macbeth-LitChart.pdf", version: "v" }, parsed, guideText });
    assert.equal(doc.id, "macbeth");
    assert.equal(doc.droppedQuotes, 1);
    assert.deepEqual(doc.data.quotes.map((q) => q.speaker), ["Macbeth", "Lady Macbeth"]);
    assert.deepEqual(doc.data.quotes[0].techniques, ["imagery"]);
    assert.deepEqual(doc.data.themeNames, ["ambition"]);
    assert.equal(doc.data.sourceId, "drive7");
  });

  it("is a strict schema, and the prompt carries the guide", () => {
    const check = (schema) => {
      if (schema.type === "object") {
        assert.equal(schema.additionalProperties, false);
        assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort());
        Object.values(schema.properties).forEach(check);
      }
      if (schema.items) check(schema.items);
    };
    check(SET_TEXT_SCHEMA);
    assert.match(setTextPrompt({ path: "English/LitCharts/x.pdf", text: "GUIDE BODY" }), /<guide>\nGUIDE BODY\n<\/guide>/);
  });
});
