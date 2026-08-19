import React from "react";
import {
  ALIGNMENTS,
  CALLOUT_TONES,
  RICH_TEXT_HINT,
  SPACER_SIZES,
  TEXT_TONES,
  safeUrl,
} from "../backend/weeklyUpdateBlocks";
import Button from "../components/Button";

/**
 * The fields for one content block.
 *
 * Split out of the composer because the switch is long and says nothing about
 * how a draft is loaded, saved or sent. Every block edits through `onChange`
 * with a patch, so this component holds no state of its own.
 */

function Field({ label, hint, children }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
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

function ToneSelect({ label, options, value, disabled, onChange }) {
  return (
    <Field label={label}>
      <select
        className="select"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * A URL field that says so as soon as the value cannot be linked, rather than
 * waiting for the send to be blocked.
 */
function UrlField({ label, value, disabled, onChange }) {
  const entered = String(value ?? "").trim();
  const invalid = Boolean(entered) && !safeUrl(entered);
  return (
    <div className="field">
      <span className="label">{label}</span>
      <input
        className={`input${invalid ? " error-state" : ""}`}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://tenacitytutoring.com/..."
        value={value ?? ""}
      />
      <span className={invalid ? "error" : "hint"}>
        {invalid
          ? "Links must start with https://, http:// or mailto:."
          : "Where this should take a parent."}
      </span>
    </div>
  );
}

export default function WeeklyUpdateBlockFields({
  block,
  announcementOptions,
  disabled,
  onChange,
}) {
  const patch = (fields) => onChange(fields);

  switch (block.type) {
    case "text":
      return (
        <>
          <ToneSelect
            label="Style"
            options={TEXT_TONES}
            value={block.tone ?? "plain"}
            disabled={disabled}
            onChange={(tone) => patch({ tone })}
          />
          {block.tone === "note" ? (
            <Field label="Label" hint="Shown in small caps above the text.">
              <input
                className="input"
                disabled={disabled}
                onChange={(event) => patch({ eyebrow: event.target.value })}
                placeholder="A note from Tenacity"
                value={block.eyebrow ?? ""}
              />
            </Field>
          ) : null}
          <Field label="Title" hint="Optional.">
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

    case "announcement": {
      const missing =
        Boolean(block.announcementId) &&
        !announcementOptions.some((option) => option.id === block.announcementId);
      return (
        <>
          <Field
            label="Announcement"
            hint="The wording comes from the announcement itself, so an edit there reaches parents until this update is sent."
          >
            <select
              className={`select${block.announcementId ? "" : " error-state"}`}
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
          </Field>
          {missing ? (
            <span className="error">
              This announcement has been archived or is no longer for parents, so it
              will be left out of the email.
            </span>
          ) : null}
          <Field label="Label" hint="Shown in small caps above the announcement.">
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
          <Field label="Label" hint="Optional small caps line above the heading.">
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

    case "callout":
      return (
        <>
          <ToneSelect
            label="Tone"
            options={CALLOUT_TONES}
            value={block.tone ?? "info"}
            disabled={disabled}
            onChange={(tone) => patch({ tone })}
          />
          <Field label="Title" hint="Optional.">
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
            rows={3}
          />
        </>
      );

    case "button":
      return (
        <>
          <Field label="Label">
            <input
              className="input"
              disabled={disabled}
              maxLength={40}
              onChange={(event) => patch({ label: event.target.value })}
              placeholder="Book a catch-up"
              value={block.label ?? ""}
            />
          </Field>
          <UrlField
            label="Link"
            value={block.url}
            disabled={disabled}
            onChange={(url) => patch({ url })}
          />
          <ToneSelect
            label="Position"
            options={ALIGNMENTS}
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
          <Field label="Title" hint="Optional.">
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
              <Field label={`Link ${index + 1} label`}>
                <input
                  className="input"
                  disabled={disabled}
                  onChange={(event) => updateLink(index, { label: event.target.value })}
                  value={link.label ?? ""}
                />
              </Field>
              <UrlField
                label={`Link ${index + 1} address`}
                value={link.url}
                disabled={disabled}
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
        <ToneSelect
          label="Height"
          options={SPACER_SIZES}
          value={block.size ?? "md"}
          disabled={disabled}
          onChange={(size) => patch({ size })}
        />
      );

    case "divider":
      return <span className="hint">A horizontal rule. Nothing to configure.</span>;

    default:
      return (
        <span className="hint">
          This block was added by a newer version of the portal and cannot be
          edited here. It will be left out of the email.
        </span>
      );
  }
}
