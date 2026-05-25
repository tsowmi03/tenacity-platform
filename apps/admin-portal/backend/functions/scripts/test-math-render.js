#!/usr/bin/env node
/**
 * Local math rendering test — no API calls, no cost.
 * Runs buildResourceDocx directly with a hard-coded payload and writes
 * a DOCX to /tmp for visual inspection.
 *
 * Usage:  node scripts/test-math-render.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { buildResourceDocx } = require("../src/resources/builder");

const RESOURCE = {
  title: "Math Render Test — Surds, Radicals & Quadratics",
  subject: "maths",
  year: 10,
  topic: "Surds and Quadratics",
  totalMarks: 20,
  questions: [
    // Square roots
    {
      number: 1,
      stem: "Simplify each of the following.",
      marks: 4,
      workingLines: 0,
      parts: [
        { label: "a", stem: "\\sqrt{50}", marks: 1, workingLines: 2 },
        { label: "b", stem: "\\sqrt{200}", marks: 1, workingLines: 2 },
        { label: "c", stem: "3\\sqrt{8} + 5\\sqrt{2}", marks: 1, workingLines: 2 },
        { label: "d", stem: "4\\sqrt{3} - \\sqrt{27} + \\sqrt{75}", marks: 1, workingLines: 2 },
      ],
    },
    // Fraction with sqrt inside (nested radical)
    {
      number: 2,
      stem: "Simplify \\frac{\\sqrt{48}}{\\sqrt{3}}.",
      marks: 2,
      workingLines: 4,
    },
    // Greek letters and operators
    {
      number: 3,
      stem: "Consider x^{2} - 6x + k = 0. Find the discriminant \\Delta in terms of k.",
      marks: 1,
      workingLines: 3,
    },
    // Plus-minus, pi, approx
    {
      number: 4,
      stem: "The solutions are x = 3 \\pm \\sqrt{9 - k}. Given \\pi \\approx 3.14159, find the area of a circle with radius x.",
      marks: 3,
      workingLines: 5,
    },
    // Curly-brace exponent
    {
      number: 5,
      stem: "Simplify \\frac{2^{32} \\times 2^{12}}{2^{2}}.",
      marks: 2,
      workingLines: 3,
    },
    // nth root
    {
      number: 6,
      stem: "Evaluate \\sqrt[3]{125} and \\sqrt[4]{16}.",
      marks: 2,
      workingLines: 3,
    },
    // Rationalise denominator
    {
      number: 7,
      stem: "Rationalise the denominator of \\frac{4}{\\sqrt{5} - 1}.",
      marks: 2,
      workingLines: 5,
    },
    // Quadratic formula with Delta
    {
      number: 8,
      stem: "Using the quadratic formula x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}, solve 3x^{2} - 2x - 4 = 0. Give answers to 2 decimal places.",
      marks: 3,
      workingLines: 6,
    },
    // leq, geq, approx, theta
    {
      number: 9,
      stem: "Given \\theta = 45°, show that sin\\theta \\leq cos\\theta when \\theta \\geq 45°. Use \\approx where needed.",
      marks: 2,
      workingLines: 4,
    },
  ],
  answers: [
    { questionNumber: 1, partLabel: "a", answer: "5\\sqrt{2}", marks: 1 },
    { questionNumber: 1, partLabel: "b", answer: "10\\sqrt{2}", marks: 1 },
    { questionNumber: 1, partLabel: "c", answer: "11\\sqrt{2}", marks: 1 },
    { questionNumber: 1, partLabel: "d", answer: "6\\sqrt{3}", marks: 1 },
    { questionNumber: 2, answer: "4", marks: 2 },
    { questionNumber: 3, answer: "\\Delta = 36 - 4k", marks: 1 },
    { questionNumber: 4, answer: "x = 3 \\pm \\sqrt{9 - k}", marks: 3 },
    { questionNumber: 5, answer: "2^{42}", marks: 2 },
    { questionNumber: 6, answer: "5 and 2", marks: 2 },
    { questionNumber: 7, answer: "\\sqrt{5} + 1", marks: 2 },
    { questionNumber: 8, answer: "x \\approx 1.54 or x \\approx -0.87", marks: 3 },
    { questionNumber: 9, answer: "sin45° = cos45° = \\frac{\\sqrt{2}}{2}", marks: 2 },
  ],
};

async function main() {
  console.log("Building DOCX (no API calls)...");
  const buf = await buildResourceDocx("worksheet", RESOURCE, {
    studentName: "Test Student",
    subject: "maths",
    year: 10,
  });

  const outPath = path.join("/tmp", "math-render-test.docx");
  fs.writeFileSync(outPath, buf);
  console.log(`✓  Written to: ${outPath}`);
  console.log("   Open in Word or LibreOffice to inspect math rendering.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
