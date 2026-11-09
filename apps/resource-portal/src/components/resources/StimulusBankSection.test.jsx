import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StimulusBankSection, { fallbackReason } from "./StimulusBankSection";

describe("English bank stimuli in job details (RES-78)", () => {
  it("shows nothing when the job did not try the bank", () => {
    const { container } = render(<StimulusBankSection job={{ jobId: "j" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each stimulus used and why any slot fell back", () => {
    render(<StimulusBankSection job={{
      stimulusBankUsage: {
        used: [
          { kind: "text", slot: 1, stimulusId: "a", title: "The River", author: "A. Writer", source: "James Ruse 2023 P2" },
          { kind: "image", slot: 1, stimulusId: "b", title: "Harbour at dusk", author: "", source: "Book of photos" },
        ],
        fallbacks: [{ kind: "text", slot: 2, reason: "named_text" }],
      },
    }} />);
    expect(screen.getByText(/The River by A\. Writer \(James Ruse 2023 P2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Harbour at dusk \(Book of photos\)/)).toBeInTheDocument();
    expect(screen.getByText("Text 2: the request named a specific text")).toBeInTheDocument();
  });

  it("has a plain reason for a code it doesn't know", () => {
    expect(fallbackReason("something_new")).toBe("the bank step could not finish");
  });
});
