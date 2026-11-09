import React from "react";

// RES-78. Which reading texts and images came from the English bank, and why
// any others didn't.
const FALLBACK_REASONS = {
  named_text: "the request named a specific text",
  no_candidates: "nothing in the bank matched",
  none_suitable: "nothing in the bank suited this student and task",
  search_failed: "the bank search could not finish",
  pick_failed: "the bank step could not finish",
  bank_unavailable: "the bank was unavailable",
};

function place(entry) {
  return `${entry.kind === "image" ? "Image" : "Text"} ${entry.slot}`;
}

export function fallbackReason(reason) {
  return FALLBACK_REASONS[reason] || "the bank step could not finish";
}

export default function StimulusBankSection({ job }) {
  const used = job?.stimulusBankUsage?.used || [];
  const fallbacks = job?.stimulusBankUsage?.fallbacks || [];
  if (!used.length && !fallbacks.length) return null;
  return (
    <div className="rg-bank">
      {used.length ? (
        <ul className="text-sm">
          {used.map((entry) => (
            <li key={`${entry.kind}-${entry.slot}`}>
              <span className="weight-600">{place(entry)}:</span> {entry.title}
              {entry.author ? ` by ${entry.author}` : ""} ({entry.source})
            </li>
          ))}
        </ul>
      ) : null}
      {fallbacks.length ? (
        <div className="mt-2">
          <div className="text-sm muted">Not from the bank because:</div>
          <ul className="text-sm">
            {fallbacks.map((entry) => (
              <li key={`${entry.kind}-${entry.slot}`}>{place(entry)}: {fallbackReason(entry.reason)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
