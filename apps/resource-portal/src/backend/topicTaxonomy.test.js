import { describe, it, expect } from "vitest";
import {
  extractQueryTopics,
  normaliseTopic,
  topicOverlapScore,
} from "./topicTaxonomy";

describe("normaliseTopic", () => {
  it("resolves aliases and lowercases", () => {
    expect(normaliseTopic("Trig")).toBe("trigonometry");
    expect(normaliseTopic("quads")).toBe("quadratic equations");
  });

  it("passes free-text titles through lowercased", () => {
    expect(normaliseTopic("Macbeth")).toBe("macbeth");
  });
});

describe("extractQueryTopics (maths)", () => {
  it("pulls canonical topics from a prompt", () => {
    const terms = extractQueryTopics("A paper covering quadratics and indices", "maths");
    expect(terms).toContain("quadratic equations");
    expect(terms).toContain("indices");
  });

  it("resolves abbreviations via the alias map", () => {
    const terms = extractQueryTopics("focus on trig and logs", "maths");
    expect(terms).toContain("trigonometry");
    expect(terms).toContain("logarithms");
  });

  it("does not pull unrelated topics", () => {
    const terms = extractQueryTopics("a paper on trigonometry only", "maths");
    expect(terms).not.toContain("quadratic equations");
    expect(terms).not.toContain("indices");
  });

  it("returns [] for an empty prompt", () => {
    expect(extractQueryTopics("", "maths")).toEqual([]);
  });

  it("caps the number of query terms at 10", () => {
    const prompt = "fractions decimals percentages integers indices surds area volume time angles triangles probability";
    expect(extractQueryTopics(prompt, "maths").length).toBeLessThanOrEqual(10);
  });
});

describe("extractQueryTopics (english)", () => {
  it("captures the text title and the skill", () => {
    const terms = extractQueryTopics("Macbeth close reading annotation", "english");
    expect(terms).toContain("macbeth");
    expect(terms).toContain("close reading");
    expect(terms).toContain("annotation");
  });

  it("ignores common stopwords as title candidates", () => {
    const terms = extractQueryTopics("Generate a paper about essay writing", "english");
    expect(terms).toContain("essay writing");
    expect(terms).not.toContain("generate");
    expect(terms).not.toContain("paper");
  });
});

describe("topicOverlapScore", () => {
  it("counts normalised overlaps", () => {
    expect(
      topicOverlapScore(["quadratic equations", "indices"], ["quadratic equations"])
    ).toBe(1);
  });

  it("returns 0 with no query terms", () => {
    expect(topicOverlapScore(["indices"], [])).toBe(0);
  });
});
