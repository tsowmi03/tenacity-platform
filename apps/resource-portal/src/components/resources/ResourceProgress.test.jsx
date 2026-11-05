import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ResourceProgress, { etaLabel, liveProgress } from "./ResourceProgress";

const now = Date.parse("2026-11-05T10:00:00Z");

describe("ResourceProgress", () => {
  it("shows the bar, the steps in plain words and the written-question count", () => {
    render(<ResourceProgress job={{ subject: "maths", progress: {
      phase: "write", fraction: 0.4, remainingMs: 300_000, lowMs: 290_000, highMs: 310_000,
      questionsDone: 42, questionCount: 120, updatedAt: new Date().toISOString(), message: "Saving stage 14",
    } }} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText("About 5 min left")).toBeTruthy();
    expect(screen.getByText("Planning")).toBeTruthy();
    expect(screen.getByText("· 42 of 120")).toBeTruthy();
    expect(screen.getByText("Drawing diagrams")).toBeTruthy();
    // Internal stage messages are not shown once there is an estimate.
    expect(screen.queryByText("Saving stage 14")).toBeNull();
  });

  it("leaves diagrams out for English and says plainly when a step is retried", () => {
    render(<ResourceProgress job={{ subject: "english", progress: {
      phase: "check", fraction: 0.8, remainingMs: 60_000, retrying: true, updatedAt: new Date().toISOString(),
    } }} />);
    expect(screen.queryByText("Drawing diagrams")).toBeNull();
    expect(screen.getByText("Taking a little longer — retrying a step")).toBeTruthy();
  });

  it("falls back to the message for runs without an estimate", () => {
    render(<ResourceProgress job={{ progress: { message: "Generating · 2 steps saved" } }} />);
    expect(screen.getByText("Generating · 2 steps saved")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("ETA wording", () => {
  it("gives a range while the estimate is uncertain and a single figure once it is not", () => {
    expect(etaLabel({ remainingMs: 300_000, lowMs: 200_000, highMs: 420_000 })).toBe("About 3–7 min left");
    expect(etaLabel({ remainingMs: 300_000, lowMs: 290_000, highMs: 310_000 })).toBe("About 5 min left");
    expect(etaLabel({ remainingMs: 30_000 })).toBe("Less than a minute left");
    expect(etaLabel({ remainingMs: 0 })).toBe("Almost done");
  });

  it("counts down between reports without the bar running far ahead", () => {
    const live = liveProgress({ fraction: 0.5, remainingMs: 120_000, updatedAt: new Date(now - 60_000).toISOString() }, now);
    expect(live.remainingMs).toBe(60_000);
    expect(live.fraction).toBeGreaterThan(0.5);
    expect(live.fraction).toBeLessThanOrEqual(0.58);
  });
});
