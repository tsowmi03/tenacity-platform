import { describe, expect, it } from "vitest";
import { clarifiedResourcePrompt } from "./clarifiedPrompt";

describe("clarifiedResourcePrompt", () => {
  it("adds ticked topics and a note to the request", () => {
    expect(clarifiedResourcePrompt("non linear questions", { topics: ["Parabolas", "Exponentials"], note: "Keep it hard" }))
      .toBe("non linear questions\n\nTopics to cover: Parabolas; Exponentials.\n\nTutor's answer: Keep it hard");
  });

  // RES-101. The server reads the chosen option's label back from the request.
  it("words a missing-text answer as the tutor's choice", () => {
    expect(clarifiedResourcePrompt("A paper on \"The Garden Party\".", { topics: ["Write an original text"], kind: "missing-text" }))
      .toBe("A paper on \"The Garden Party\".\n\nTutor's choice for the missing text: Write an original text.");
  });
});
