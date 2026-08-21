import React from "react";
import { BLOCK_GROUPS, BLOCK_TYPES } from "../backend/weeklyUpdateBlocks";

/**
 * The "add a block" picker.
 *
 * Nine equal buttons in a row asked an admin to choose between "Text",
 * "Callout" and "Heading" from their names alone, with a native `title`
 * tooltip as the only explanation. This draws each option as the thing it
 * produces and groups them by what they are for, so the choice is made by
 * looking rather than by guessing.
 *
 * The four text tiles all create a text block; they differ only in the style
 * it starts on, which the block's own styles row can change afterwards without
 * losing the copy.
 */

/** A miniature of what the option puts in the email. */
function tileArt(option) {
  switch (option.id) {
    case "text":
      return (
        <span className="tile-panel" data-style="plain">
          <span className="tile-line" />
          <span className="tile-line" />
          <span className="tile-line tile-line-short" />
        </span>
      );
    case "text:note":
      return (
        <span className="tile-panel" data-style="note">
          <span className="tile-eyebrow" />
          <span className="tile-line" />
          <span className="tile-line tile-line-short" />
        </span>
      );
    case "text:card":
      return (
        <span className="tile-panel" data-style="card">
          <span className="tile-line tile-line-title" />
          <span className="tile-line" />
          <span className="tile-line tile-line-short" />
        </span>
      );
    case "text:info":
      return (
        <span className="tile-panel" data-style="warn">
          <span className="tile-line tile-line-title" />
          <span className="tile-line" />
          <span className="tile-line tile-line-short" />
        </span>
      );
    case "announcement":
      return (
        <span className="tile-panel" data-style="info">
          <span className="tile-eyebrow" />
          <span className="tile-line tile-line-title" />
          <span className="tile-line tile-line-short" />
        </span>
      );
    case "button":
      return (
        <span className="tile-panel" data-style="plain">
          <span className="tile-button" />
        </span>
      );
    case "linkList":
      return (
        <span className="tile-panel" data-style="card">
          <span className="tile-link" />
          <span className="tile-link" />
          <span className="tile-link tile-line-short" />
        </span>
      );
    case "heading":
      return (
        <span className="tile-panel" data-style="plain">
          <span className="tile-eyebrow" />
          <span className="tile-line tile-line-heading" />
        </span>
      );
    case "signature":
      return (
        <span className="tile-panel" data-style="plain">
          <span className="tile-rule" />
          <span className="tile-line tile-line-short" />
          <span className="tile-line tile-line-tiny" />
        </span>
      );
    case "divider":
      return (
        <span className="tile-panel" data-style="plain">
          <span className="tile-line tile-line-short" />
          <span className="tile-rule" />
          <span className="tile-line tile-line-short" />
        </span>
      );
    case "spacer":
      return (
        <span className="tile-panel" data-style="plain">
          <span className="tile-line tile-line-short" />
          <span className="tile-gap" />
          <span className="tile-line tile-line-short" />
        </span>
      );
    default:
      return <span className="tile-panel" data-style="plain" />;
  }
}

export default function WeeklyUpdateBlockPicker({ onAdd, onClose }) {
  return (
    <div className="block-picker">
      <div className="block-picker-head">
        <span className="label">Add a block</span>
        <button className="block-picker-close" onClick={onClose} type="button">
          Cancel
        </button>
      </div>
      {BLOCK_GROUPS.map((group) => {
        const options = BLOCK_TYPES.filter((option) => option.group === group.id);
        if (!options.length) return null;
        return (
          <div className="block-picker-group" key={group.id}>
            <span className="block-picker-group-label">{group.label}</span>
            <div className="block-picker-grid">
              {options.map((option) => (
                <button
                  className="block-tile"
                  key={option.id}
                  onClick={() => onAdd(option.id)}
                  type="button"
                >
                  <span aria-hidden="true" className="block-tile-art">
                    {tileArt(option)}
                  </span>
                  <span className="block-tile-label">{option.label}</span>
                  <span className="block-tile-hint">{option.hint}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
