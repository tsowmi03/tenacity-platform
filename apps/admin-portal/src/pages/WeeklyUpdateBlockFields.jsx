import React from "react";
import {
  ALIGNMENTS,
  RICH_TEXT_HINT,
  SPACER_SIZES,
  TEXT_STYLES,
  DEFAULT_NOTE_EYEBROW,
  safeUrl,
  textStyle,
} from "../backend/weeklyUpdateBlocks";
import Button from "../components/Button";
import { DIGEST_WINDOWS } from "./weeklyUpdateDigest";

/**
 * The fields for one content block.
 *
 * Split out of the composer because the switch is long and says nothing about
 * how a draft is loaded, saved or sent. Every block edits through `onChange`
 * with a patch, so this component holds no state of its own.
 *
 * Choices that are purely visual — a text block's style, a button's alignment,
 * a gap's height — are pickers of drawn swatches rather than dropdowns of
 * adjectives. "Highlighted note" and "Card" are not words anyone can rank
 * without seeing them, and making someone send a test to find out is the
 * slowest possible way to answer it.
 */

function Field({ label, hint, error, children }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      {children}
      {error ? (
        <span className="error">{error}</span>
      ) : hint ? (
        <span className="hint">{hint}</span>
      ) : null}
    </div>
  );
}

function RichTextField({ label, value, disabled, onChange, rows = 4 }) {
  return (
    <Field label={label} hint={RICH_TEXT_HINT}>
      <textarea
        className="textarea"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        value={value ?? ""}
      />
    </Field>
  );
}

/**
 * A row of swatches, one per option, drawn as the thing it produces.
 *
 * A radiogroup rather than buttons: this is one choice out of a set, and arrow
 * keys should move through it the way they do in any other radio group.
 */
function SwatchPicker({ label, name, options, value, disabled, onChange, render }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="swatch-row" role="radiogroup" aria-label={label}>
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <label
              className={`swatch${selected ? " is-selected" : ""}`}
              key={option.id}
              title={option.description || undefined}
            >
              <input
                checked={selected}
                className="swatch-input"
                disabled={disabled}
                name={name}
                onChange={() => onChange(option.id)}
                type="radio"
                value={option.id}
              />
              <span aria-hidden="true" className="swatch-art">
                {render(option)}
              </span>
              <span className="swatch-label">{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** A miniature of the panel a text style renders, in the email's own colours. */
function textStyleArt(option) {
  return (
    <span className="swatch-panel" data-style={option.id}>
      {option.eyebrow ? <span className="swatch-eyebrow" /> : null}
      <span className="swatch-line swatch-line-title" />
      <span className="swatch-line" />
      <span className="swatch-line swatch-line-short" />
    </span>
  );
}

function alignmentArt(option) {
  return (
    <span className="swatch-panel" data-align={option.id}>
      <span className="swatch-button" />
    </span>
  );
}

function spacerArt(option) {
  return (
    <span className="swatch-panel" data-gap={option.id}>
      <span className="swatch-line" />
      <span className="swatch-gap" />
      <span className="swatch-line" />
    </span>
  );
}

/**
 * A URL field that says so as soon as the value cannot be linked, rather than
 * waiting for the send to be blocked.
 */
function UrlField({ label, value, disabled, onChange, error }) {
  const entered = String(value ?? "").trim();
  const invalid = Boolean(entered) && !safeUrl(entered);
  const message = invalid
    ? "Links must start with https://, http:// or mailto:."
    : error;
  return (
    <div className="field">
      <span className="label">{label}</span>
      <input
        className={`input${invalid || error ? " error-state" : ""}`}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://tenacitytutoring.com/..."
        value={value ?? ""}
      />
      <span className={message ? "error" : "hint"}>
        {message || "Where this should take a parent."}
      </span>
    </div>
  );
}

export default function WeeklyUpdateBlockFields({
  block,
  announcementOptions,
  disabled,
  onChange,
  problems = [],
  windowId,
  onWindowChange,
}) {
  const patch = (fields) => onChange(fields);
  const errorFor = (field) => problems.find((problem) => problem.field === field)?.message;

  switch (block.type) {
    case "text": {
      const style = textStyle(block.tone);
      return (
        <>
          <SwatchPicker
            label="Style"
            name={`style-${block.id}`}
            options={TEXT_STYLES}
            render={textStyleArt}
            value={style.id}
            disabled={disabled}
            onChange={(tone) => patch({ tone })}
          />
          <p className="swatch-description">{style.description}</p>
          {style.eyebrow ? (
            <Field label="Small label above" hint="Shown in capitals above the text.">
              <input
                className="input"
                disabled={disabled}
                onChange={(event) => patch({ eyebrow: event.target.value })}
                placeholder={DEFAULT_NOTE_EYEBROW}
                value={block.eyebrow ?? ""}
              />
            </Field>
          ) : null}
          <Field label="Heading" hint="Optional.">
            <input
              className="input"
              disabled={disabled}
              onChange={(event) => patch({ title: event.target.value })}
              value={block.title ?? ""}
            />
          </Field>
          <RichTextField
            label="Text"
            value={block.body}
            disabled={disabled}
            onChange={(body) => patch({ body })}
          />
        </>
      );
    }

    case "announcement": {
      const missing =
        Boolean(block.announcementId) &&
        !announcementOptions.some((option) => option.id === block.announcementId);
      const error = missing
        ? "This announcement has been archived or is no longer for parents, so the email will leave it out."
        : errorFor("announcementId");
      return (
        <>
          <div className="field">
            <span className="label">Which announcement</span>
            <div className="field-with-filter">
              <select
                className={`select${error ? " error-state" : ""}`}
                disabled={disabled}
                onChange={(event) => patch({ announcementId: event.target.value })}
                value={block.announcementId ?? ""}
              >
                <option value="">Choose an announcement...</option>
                {announcementOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
                {missing ? (
                  <option value={block.announcementId}>
                    No longer available to parents
                  </option>
                ) : null}
              </select>
              {/*
                This filter used to sit in the header of the whole block list,
                unlabelled, where it read as though it filtered the blocks. It
                only ever narrowed this dropdown, so it belongs beside it.
              */}
              <select
                aria-label="How far back to look for announcements"
                className="select select-inline"
                disabled={disabled}
                onChange={(event) => onWindowChange?.(event.target.value)}
                value={windowId}
              >
                {DIGEST_WINDOWS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {error ? (
              <span className="error">{error}</span>
            ) : (
              <span className="hint">
                The wording comes from the announcement itself, so an edit there reaches
                parents until this update is sent.
              </span>
            )}
          </div>
          <Field label="Small label above" hint="Shown in capitals above the announcement.">
            <input
              className="input"
              disabled={disabled}
              onChange={(event) => patch({ eyebrow: event.target.value })}
              placeholder="Announcement"
              value={block.eyebrow ?? ""}
            />
          </Field>
        </>
      );
    }

    case "heading":
      return (
        <>
          <Field label="Small label above" hint="Optional line in capitals above the heading.">
            <input
              className="input"
              disabled={disabled}
              onChange={(event) => patch({ eyebrow: event.target.value })}
              placeholder="At a glance"
              value={block.eyebrow ?? ""}
            />
          </Field>
          <Field label="Heading">
            <input
              className="input"
              disabled={disabled}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="In this week's update"
              value={block.title ?? ""}
            />
          </Field>
        </>
      );

    case "button":
      return (
        <>
          <Field label="Button text" error={errorFor("label")}>
            <input
              className={`input${errorFor("label") ? " error-state" : ""}`}
              disabled={disabled}
              maxLength={40}
              onChange={(event) => patch({ label: event.target.value })}
              placeholder="Book a catch-up"
              value={block.label ?? ""}
            />
          </Field>
          <UrlField
            label="Where it goes"
            value={block.url}
            disabled={disabled}
            error={errorFor("url")}
            onChange={(url) => patch({ url })}
          />
          <SwatchPicker
            label="Alignment"
            name={`align-${block.id}`}
            options={ALIGNMENTS}
            render={alignmentArt}
            value={block.align ?? "left"}
            disabled={disabled}
            onChange={(align) => patch({ align })}
          />
        </>
      );

    case "linkList": {
      const links = block.links ?? [];
      const updateLink = (index, fields) =>
        patch({
          links: links.map((link, linkIndex) =>
            linkIndex === index ? { ...link, ...fields } : link
          ),
        });
      return (
        <>
          <Field label="Heading" hint="Optional.">
            <input
              className="input"
              disabled={disabled}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="Handy links"
              value={block.title ?? ""}
            />
          </Field>
          {links.map((link, index) => (
            <div className="block-link-row" key={`link-${index}`}>
              <Field
                label={`Link ${index + 1} text`}
                error={errorFor(`links.${index}.label`)}
              >
                <input
                  className={`input${
                    errorFor(`links.${index}.label`) ? " error-state" : ""
                  }`}
                  disabled={disabled}
                  onChange={(event) => updateLink(index, { label: event.target.value })}
                  value={link.label ?? ""}
                />
              </Field>
              <UrlField
                label={`Link ${index + 1} address`}
                value={link.url}
                disabled={disabled}
                error={errorFor(`links.${index}.url`)}
                onChange={(url) => updateLink(index, { url })}
              />
              {disabled ? null : (
                <Button
                  size="sm"
                  icon="trash"
                  aria-label={`Remove link ${index + 1}`}
                  onClick={() =>
                    patch({ links: links.filter((_, i) => i !== index) })
                  }
                />
              )}
            </div>
          ))}
          {disabled ? null : (
            <Button
              size="sm"
              icon="plus"
              onClick={() => patch({ links: [...links, { label: "", url: "" }] })}
            >
              Add link
            </Button>
          )}
        </>
      );
    }

    case "signature":
      return (
        <>
          <RichTextField
            label="Closing words"
            value={block.body}
            disabled={disabled}
            onChange={(body) => patch({ body })}
            rows={3}
          />
          <Field label="Name">
            <input
              className="input"
              disabled={disabled}
              onChange={(event) => patch({ name: event.target.value })}
              placeholder="Jess Nguyen"
              value={block.name ?? ""}
            />
          </Field>
          <Field label="Role" hint="Optional.">
            <input
              className="input"
              disabled={disabled}
              onChange={(event) => patch({ role: event.target.value })}
              placeholder="Head of Tutoring"
              value={block.role ?? ""}
            />
          </Field>
        </>
      );

    case "spacer":
      return (
        <SwatchPicker
          label="Gap size"
          name={`gap-${block.id}`}
          options={SPACER_SIZES}
          render={spacerArt}
          value={block.size ?? "md"}
          disabled={disabled}
          onChange={(size) => patch({ size })}
        />
      );

    case "divider":
      return <span className="hint">A horizontal rule. Nothing to set.</span>;

    default:
      return (
        <span className="hint">
          This block was added by a newer version of the portal and cannot be
          edited here. It will be left out of the email.
        </span>
      );
  }
}
