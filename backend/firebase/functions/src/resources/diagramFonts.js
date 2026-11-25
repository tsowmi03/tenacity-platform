"use strict";

// RES-40. Fonts for diagram labels.
//
// Labels are drawn by sharp (librsvg) with whatever fonts the machine has. The
// Cloud Functions image has Liberation Sans, which stands in for Arial, but no
// font that places a combining mark over the letter before it: the bar in x̄
// printed beside the x, and a recurring decimal's dot beside its digit. DejaVu
// Sans does, so it ships with the functions (assets/fonts) and fontconfig is
// pointed at it as well as the system's own fonts.
//
// Ordinary labels keep Arial / Liberation Sans, the font every diagram's
// spacing was tuned with (DejaVu is about 9% wider). Only a label that carries
// a combining mark is drawn in DejaVu Sans.
//
// macOS draws text with Core Text and ignores fontconfig, so local renders are
// unchanged; the same code path is checked on the Functions image.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const FONT_DIR = path.join(__dirname, "assets", "fonts");
const LABEL_FONT = "Arial, Liberation Sans, DejaVu Sans, sans-serif";
const ACCENT_FONT = "DejaVu Sans, Arial, Liberation Sans, sans-serif";
// Combining diacritical marks, and those for symbols (a vector arrow).
const COMBINING_MARK = /[̀-ͯ⃐-⃿]/;

/** The font-family for one label. */
function labelFontFor(text) {
  return COMBINING_MARK.test(String(text ?? "")) ? ACCENT_FONT : LABEL_FONT;
}

function fontConfigXml(fontDir, cacheDir) {
  const escape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return [
    '<?xml version="1.0"?>',
    '<!DOCTYPE fontconfig SYSTEM "fonts.dtd">',
    "<fontconfig>",
    // The machine's own fonts and aliases (Arial -> Liberation Sans) still apply.
    '  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>',
    `  <dir>${escape(fontDir)}</dir>`,
    `  <cachedir>${escape(cacheDir)}</cachedir>`,
    "</fontconfig>",
    "",
  ].join("\n");
}

let configured = false;

/**
 * Points fontconfig at the bundled fonts. It reads FONTCONFIG_FILE the first
 * time text is drawn, so this runs when the diagram generator loads. A value
 * already set (by an operator or a test) is left alone, and a failure only
 * means labels are drawn with the system's fonts, as before.
 */
function useBundledFonts({ env = process.env, tmpDir = os.tmpdir() } = {}) {
  if (configured || env.FONTCONFIG_FILE) return env.FONTCONFIG_FILE || null;
  try {
    const file = path.join(tmpDir, "tenacity-diagram-fonts.conf");
    fs.writeFileSync(file, fontConfigXml(FONT_DIR, path.join(tmpDir, "tenacity-fontconfig-cache")));
    env.FONTCONFIG_FILE = file;
    configured = true;
    return file;
  } catch {
    return null;
  }
}

module.exports = { ACCENT_FONT, FONT_DIR, LABEL_FONT, fontConfigXml, labelFontFor, useBundledFonts };
