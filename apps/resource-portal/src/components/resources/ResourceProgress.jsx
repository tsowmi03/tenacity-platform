import React, { useEffect, useRef, useState } from "react";
import Icon from "../Icon";

// RES-73. A generating resource shows a bar, its steps in plain words and an
// ETA. The backend writes the estimate with each stage; between stages the
// countdown and bar move on locally so the panel never looks frozen.

const STEPS = [
  { key: "plan", label: "Planning" },
  { key: "write", label: "Writing questions" },
  { key: "diagrams", label: "Drawing diagrams", mathsOnly: true },
  { key: "check", label: "Checking quality" },
  { key: "finish", label: "Building the PDF" },
];
const ORDER = STEPS.map((s) => s.key);

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function minutes(ms) {
  return Math.max(1, Math.round(ms / 60_000));
}

// RES-84. One figure, never a range. Past the estimate it says so instead of
// sitting on "Almost done".
export function etaLabel({ remainingMs, overdueMs = 0 }) {
  if (overdueMs > 60_000) return "Taking a little longer than expected";
  if (remainingMs <= 0) return "Almost done";
  if (remainingMs < 60_000) return "Less than a minute left";
  return `About ${minutes(remainingMs)} min left`;
}

const CREEP_MAX = 0.03;
const CREEP_MS = 60_000;

// What the panel shows at `now`, given the last estimate the worker wrote.
// `floor` is the highest value this run has already shown: the bar never goes
// below it. Between reports it creeps a little (at most three points, slowing
// as it goes) so it never looks frozen, and a report that lands below the
// creep holds the bar still rather than pulling it back.
export function liveProgress(progress, now, floor = 0) {
  const updatedAt = toMillis(progress.updatedAt) ?? now;
  const since = Math.max(0, now - updatedAt);
  const remaining = Math.max(0, progress.remainingMs - since);
  const creep = Math.min(CREEP_MAX, (1 - progress.fraction) / 2) * (1 - Math.exp(-since / CREEP_MS));
  const fraction = Math.min(0.99, Math.max(floor, progress.fraction + creep));
  return {
    fraction,
    remainingMs: remaining,
    overdueMs: Math.max(0, since - progress.remainingMs),
  };
}

function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export default function ResourceProgress({ job }) {
  // A resumable Retry starts a new run but keeps the last run's progress until
  // the worker's first report; that old report is neither shown nor allowed to
  // set this run's floor. (Reports from before RES-84 carry no runId.)
  const stale = Boolean(job.progress?.runId && job.runId && job.progress.runId !== job.runId);
  const progress = stale ? {} : job.progress || {};
  const hasEstimate = typeof progress.fraction === "number" && typeof progress.remainingMs === "number";
  const now = useNow(hasEstimate);
  // Highest value shown for this run; a new run (manual Retry) starts again.
  const shown = useRef({ key: null, fraction: 0 });
  const runKey = `${job.jobId || job.id || ""}:${job.runId || ""}`;
  if (shown.current.key !== runKey) shown.current = { key: runKey, fraction: 0 };

  // Older workers (and the moments before the first stage) only have a message.
  if (!hasEstimate) {
    return progress.message ? <p className="muted" role="status">{progress.message}</p> : null;
  }

  const live = liveProgress(progress, now, shown.current.fraction);
  shown.current.fraction = live.fraction;
  const steps = STEPS.filter((s) => !s.mathsOnly || job.subject !== "english");
  const current = ORDER.indexOf(progress.phase);
  const percent = Math.round(live.fraction * 100);
  const status = progress.retrying
    ? "Taking a little longer — retrying a step"
    : etaLabel(live);

  return (
    <div className="rg-gen-progress" aria-label="Generation progress">
      <div className="rg-gen-progress-head">
        <span className="weight-600" role="status">{status}</span>
        <span className="muted">{percent}%</span>
      </div>
      <div
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="rg-progress"
        role="progressbar"
      >
        <div style={{ width: `${percent}%` }} />
      </div>
      <ol className="rg-gen-steps">
        {steps.map((step) => {
          const index = ORDER.indexOf(step.key);
          const state = index < current ? "done" : index === current ? "active" : "todo";
          const detail = state !== "active" ? null
            : step.key === "write" && progress.questionCount > 0
            ? `${Math.min(progress.questionsDone || 0, progress.questionCount)} of ${progress.questionCount}`
            : step.key === "diagrams" && progress.diagramCount > 0
            ? `${Math.min(progress.diagramsDone || 0, progress.diagramCount)} of ${progress.diagramCount}`
            : null;
          return (
            <li className={`rg-gen-step rg-gen-step-${state}`} key={step.key}>
              <span aria-hidden="true" className="rg-gen-step-mark">
                {state === "done" ? <Icon name="check" size={12} /> : null}
              </span>
              <span>{step.label}</span>
              {detail ? <span className="muted">· {detail}</span> : null}
              <span className="sr-only">{state === "done" ? " (done)" : state === "active" ? " (in progress)" : ""}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
