"use strict";

const fs = require("fs");
const path = require("path");

const BRAND = {
  NAVY: "1B3A6B",
  LIGHT_BLUE: "4A90C4",
  LIGHT_BLUE_BG: "D5E8F4",
  AMBER_BG: "FFF3CD",
  GREEN_BG: "D4EDDA",
  WHITE: "FFFFFF",
  LIGHT_GREY: "F5F5F5",
  FONT: "Calibri",
  FONT_SIZE_BODY: 22,
  FONT_SIZE_SMALL: 20,
  FONT_SIZE_H1: 36,
  FONT_SIZE_H2: 28,
  FONT_SIZE_H3: 24,
};

const PAGE = {
  WIDTH: 11906,
  HEIGHT: 16838,
  MARGIN_TOP: 1440,
  MARGIN_BOTTOM: 1440,
  MARGIN_LEFT: 1440,
  MARGIN_RIGHT: 1440,
  CONTENT_WIDTH: 9026,
};

const LOGO_PATH = path.join(
  __dirname,
  "..",
  "assets",
  "TenacityVerticalLogocropped.jpg"
);

function loadLogoBuffer() {
  try {
    return fs.readFileSync(LOGO_PATH);
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

module.exports = {
  BRAND,
  LOGO_PATH,
  PAGE,
  loadLogoBuffer,
};
