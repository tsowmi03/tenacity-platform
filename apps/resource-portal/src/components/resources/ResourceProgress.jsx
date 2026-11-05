import React, { useEffect, useState } from "react";
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

export function etaLabel({ remainingMs, lowMs, highMs }) {
  if (remainingMs <= 0) return "Almost done";
  if (remainingMs < 60_000) return "Less than a minute left";
  const low = minutes(lowMs ?? remainingMs);
  const high = minutes(highMs ?? remainingMs);
  if (high - low >= 2) return `About ${low}–${high} min left`;
  const mid = minutes(remainingMs);
  return `About ${mid} min left`;
}

// What the panel shows at `now`, given the last estimate the worker wrote.
export function liveProgress(progress, now) {
  const updatedAt = toMillis(progress.updatedAt) ?? now;
  const since = Math.max(0, now - updatedAt);
  const remaining = Math.max(0, progress.remainingMs - since);
  // The bar creeps toward where the countdown says it should be, but never
  // more than a little past the last real report.
  const total = since + progress.remainingMs;
  const creep = total > 0 ? (1 - progress.fraction) * Math.min(1, since / total) : 0;
  const fraction = Math.min(0.99, progress.fraction + Math.min(creep, 0.08));
  const scale = progress.remainingMs > 0 ? remaining / progress.remainingMs : 0;
  return {
    fraction,
    remainingMs: remaining,
    lowMs: Math.round((progress.lowMs ?? progress.remainingMs) * scale),
    highMs: Math.round((progress.highMs ?? progress.remainingMs) * scale),
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
  const progress = job.progress || {};
  const hasEstimate = typeof progress.fraction === "number" && typeof progress.remainingMs === "number";
  const now = useNow(hasEstimate);

  // Older workers (and the moments before the first stage) only have a message.
  if (!hasEstimate) {
    return progress.message ? <p className="muted" role="status">{progress.message}</p> : null;
  }

  const live = liveProgress(progress, now);
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
          const detail = state === "active" && step.key === "write" && progress.questionCount > 0
            ? `${Math.min(progress.questionsDone || 0, progress.questionCount)} of ${progress.questionCount}`
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
