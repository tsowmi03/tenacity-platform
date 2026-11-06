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

describe("diagram step count (RES-84)", () => {
  it("shows diagram questions settled out of the total", () => {
    render(<ResourceProgress job={{ subject: "maths", progress: {
      phase: "diagrams", fraction: 0.8, remainingMs: 120_000, diagramsDone: 5, diagramCount: 12, updatedAt: new Date().toISOString(),
    } }} />);
    expect(screen.getByText("· 5 of 12")).toBeTruthy();
  });
});

describe("ETA wording", () => {
  it("gives one figure, never a range (RES-84)", () => {
    expect(etaLabel({ remainingMs: 300_000, lowMs: 180_000, highMs: 420_000 })).toBe("About 5 min left");
    expect(etaLabel({ remainingMs: 30_000 })).toBe("Less than a minute left");
    expect(etaLabel({ remainingMs: 0 })).toBe("Almost done");
    expect(etaLabel({ remainingMs: 0, overdueMs: 90_000 })).toBe("Taking a little longer than expected");
  });

  it("counts down between reports and creeps only a little", () => {
    const live = liveProgress({ fraction: 0.5, remainingMs: 120_000, updatedAt: new Date(now - 60_000).toISOString() }, now);
    expect(live.remainingMs).toBe(60_000);
    expect(live.fraction).toBeGreaterThan(0.5);
    expect(live.fraction).toBeLessThanOrEqual(0.53);
  });

  it("never shows less than the run has already shown", () => {
    // Crept to 78% during a quiet minute; the next report says 76.5%.
    expect(liveProgress({ fraction: 0.765, remainingMs: 200_000, updatedAt: new Date(now).toISOString() }, now, 0.78).fraction).toBe(0.78);
  });
});

describe("ResourceProgress across reports (RES-84)", () => {
  const report = (fraction, ago) => ({ subject: "maths", jobId: "j", runId: "r1", progress: {
    phase: "diagrams", fraction, remainingMs: 250_000, updatedAt: new Date(Date.now() - ago).toISOString() } });
  const percent = () => Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));

  it("holds the bar when a report lands below what was shown", () => {
    const { rerender } = render(<ResourceProgress job={report(0.765, 120_000)} />);
    const crept = percent();
    expect(crept).toBeGreaterThan(77);
    rerender(<ResourceProgress job={report(0.765, 0)} />);
    expect(percent()).toBe(crept);
  });

  it("ignores the previous run's report after a Retry, then follows the new run from its own start", () => {
    const old = { ...report(0.8, 0), runId: "r2", progress: { ...report(0.8, 0).progress, runId: "r1" } };
    const { rerender } = render(<ResourceProgress job={old} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    rerender(<ResourceProgress job={{ ...report(0.2, 0), runId: "r2", progress: { ...report(0.2, 0).progress, runId: "r2" } }} />);
    expect(percent()).toBe(20);
  });

  it("starts again for a new run", () => {
    const { rerender } = render(<ResourceProgress job={report(0.765, 0)} />);
    rerender(<ResourceProgress job={{ ...report(0.05, 0), runId: "r2" }} />);
    expect(percent()).toBe(5);
  });
});
