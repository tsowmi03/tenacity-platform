"use strict";

// RES-74. Where the maths bank has no diagram to offer.
//
// Since RES-71 a maths diagram is drawn only when the bank can't supply it.
// This module turns the bank and recent resources into one summary document
// the admin "Gaps" tab reads, so the page never scans the bank itself:
//
//   supply  live bank questions by diagram type, skill and school year
//   demand  from each resource's questionBankUsage: how often a skill and year
//           was needed, filled from the bank, or drawn, and why
//   gaps    skills and years ranked by drawn diagrams, each with a likely fix
//
// The daily job (scripts/questionBankGaps.js, run by GitHub Actions) writes
// the summary; an admin can also rebuild it from the page.

const { DIAGRAM_TYPES } = require("./taxonomy");

const SUMMARY_COLLECTION = "resourceCapabilities";
const SUMMARY_DOC_ID = "bankGaps";
const QUESTIONS_COLLECTION = "questionBank";
const JOBS_COLLECTION = "resourceJobs";
const WINDOW_DAYS = 90;
const YEARS = [5, 6, 7, 8, 9, 10, 11, 12];
// Fewer live questions than this for a skill and year, and the bank rarely
// has one that suits: tutors' requests differ too much for a handful to cover.
const THIN_SUPPLY = 10;
const MAX_GAPS = 60;
const MAX_DEMAND_ROWS = 250;
const MAX_EXAMPLE_SKILLS = 4;
const GET_ALL_CHUNK = 300;

// Why a diagram was drawn, grouped for the page. Keys are the reasons
// questionBankFill records (a few carry detail after a colon).
const REASON_GROUPS = Object.freeze({
  no_candidates: "no_candidates",
  none_suitable: "none_suitable",
  check_disagreed: "answer_check",
  answer_unconfirmed: "answer_check",
  crop_unfit: "crop_unfit",
  ambiguous_number: "not_swappable",
  answer_row_unclear: "not_swappable",
  failed: "failed",
  search_failed: "failed",
  out_of_time: "failed",
  bank_unavailable: "failed",
});

function reasonGroup(reason) {
  const key = String(reason || "failed").split(":")[0].trim();
  return REASON_GROUPS[key] || "failed";
}

function skillKey(skill) {
  return String(skill || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Live bank questions by diagram type, skill and year. */
function summariseSupply(rows) {
  const byType = {};
  let total = 0;
  for (const row of rows) {
    if (row?.status !== "live") continue;
    const type = DIAGRAM_TYPES[row.diagramType] ? row.diagramType : "other";
    const skill = typeof row.skill === "string" && row.skill ? row.skill : "other";
    const entry = byType[type] || (byType[type] = { total: 0, byYear: {}, skills: {} });
    const cell = entry.skills[skill] || (entry.skills[skill] = { total: 0, byYear: {} });
    entry.total += 1;
    cell.total += 1;
    total += 1;
    for (const year of Array.isArray(row.years) ? row.years : []) {
      if (!Number.isInteger(year)) continue;
      entry.byYear[year] = (entry.byYear[year] || 0) + 1;
      cell.byYear[year] = (cell.byYear[year] || 0) + 1;
    }
  }
  return { total, byType };
}

/** Bank questions for a skill within a year either side, the range a search uses (RES-76). */
function supplyFor(supply, diagramType, skill, year) {
  const cell = supply?.byType?.[diagramType]?.skills?.[skill];
  if (!cell || !Number.isInteger(year)) return cell ? cell.total : 0;
  return [year - 1, year, year + 1].reduce((sum, y) => sum + (cell.byYear[y] || 0), 0);
}

/**
 * The question a usage entry points at, in a resource's saved content: its
 * skill and the diagram it asked for. Used for resources made before entries
 * carried these themselves.
 */
function needFromResource(resource, where) {
  const label = (value) => String(value || "").replace(/[()]/g, "");
  let found = null;
  const visit = (node, section) => {
    if (found || !node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((child) => visit(child, section)); return; }
    // A section or sub-topic is the nearest titled block above its questions.
    const title = typeof node.title === "string" ? node.title : section;
    if (Number.isInteger(node.number) && node.number === where.questionNumber && (!where.section || section === where.section)) {
      const part = where.partLabel ? (node.parts || []).find((p) => label(p?.label) === label(where.partLabel)) : null;
      const owner = part || node;
      const drawn = owner.diagram && typeof owner.diagram === "object" ? owner.diagram.type : null;
      found = {
        skill: (typeof owner.skill === "string" && owner.skill.trim()) || (typeof node.skill === "string" && node.skill.trim()) || "",
        diagramType: owner.diagramType && owner.diagramType !== "none" ? owner.diagramType : drawn && drawn !== "source-image" ? drawn : "",
      };
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "answers" || key === "markingGuide" || key === "diagram") continue;
      visit(value, title);
    }
  };
  visit(resource, null);
  return found || { skill: "", diagramType: "" };
}

function parseResource(job) {
  if (typeof job.generatedJson !== "string" || !job.generatedJson) return null;
  try { return JSON.parse(job.generatedJson); } catch { return null; }
}

/**
 * One row per bank slot of every job: what was needed and what happened.
 * `bankQuestions` maps a bank question ID to its { diagramType, skill }.
 */
function demandEntries(jobs, bankQuestions = new Map()) {
  const entries = [];
  for (const job of jobs) {
    const usage = job?.questionBankUsage;
    if (!usage || job.subject !== "maths" || !Number.isInteger(job.year)) continue;
    let resource;
    const needOf = (entry) => {
      if (entry.skill || entry.diagramType) return { skill: entry.skill || "", diagramType: entry.diagramType || "" };
      if (resource === undefined) resource = parseResource(job);
      return resource ? needFromResource(resource, entry) : { skill: "", diagramType: "" };
    };
    for (const used of Array.isArray(usage.used) ? usage.used : []) {
      const bank = bankQuestions.get(used.questionId) || {};
      entries.push({
        year: job.year, ...needOf(used), outcome: "used",
        bankDiagramType: used.bankDiagramType || bank.diagramType || "", bankSkill: used.bankSkill || bank.skill || "",
      });
    }
    for (const skipped of Array.isArray(usage.skipped) ? usage.skipped : []) {
      entries.push({
        year: job.year, ...needOf(skipped), outcome: "drawn", reason: reasonGroup(skipped.reason),
        bankDiagramType: skipped.bankDiagramType || "", bankSkill: skipped.bankSkill || "",
      });
    }
  }
  return entries;
}

// The bank category a drawn diagram belongs to. A drawn slot records the kind
// of diagram the generator asked for (diagramRegistry), not a bank category,
// so supply and demand can only meet through this table.
const BANK_TYPE_OF_DRAWN = Object.freeze({
  rectangle: "shape_2d", parallelogram: "shape_2d", trapezium: "shape_2d", triangle: "shape_2d", circle: "shape_2d",
  "circle-sector": "shape_2d", "L-shape": "shape_2d", "T-shape": "shape_2d", "rect-triangle": "shape_2d", "rect-semicircle": "shape_2d", annulus: "shape_2d",
  "prism-rect": "solid_3d", "prism-tri": "solid_3d", cylinder: "solid_3d", cone: "solid_3d", pyramid: "solid_3d", sphere: "solid_3d", net: "solid_3d",
  "right-triangle": "right_triangle",
  elevation: "elevation_bearings", depression: "elevation_bearings",
  "parallel-lines": "angle_relationships", angles: "angle_relationships",
  "coordinate-plane": "number_plane",
  "bar-graph": "data_display", histogram: "data_display", "dot-plot": "data_display", "scatter-plot": "data_display", "box-plot": "data_display",
  "stem-and-leaf": "data_display", "pie-chart": "data_display", pictograph: "data_display",
  "tree-diagram": "probability_diagram", "venn-diagram": "probability_diagram", spinner: "probability_diagram",
});

function bankTypeOfDrawn(diagramType, skill) {
  if (diagramType === "function-plot") {
    if (/parabola|quadratic/i.test(skill)) return "parabola";
    return /line|linear|gradient|intercept|simultaneous/i.test(skill) ? "straight_line" : "other_curve";
  }
  if (diagramType === "number-line") return /inequalit/i.test(skill) ? "region_inequality" : "";
  return BANK_TYPE_OF_DRAWN[diagramType] || "";
}

function mostCommon(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
}

function topOf(counts, limit) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([name, count]) => ({ name, count }));
}

/** Bank questions of a diagram type within a year either side. */
function typeSupplyFor(supply, diagramType, year) {
  const entry = supply?.byType?.[diagramType];
  if (!entry) return 0;
  return [year - 1, year, year + 1].reduce((sum, y) => sum + (entry.byYear[y] || 0), 0);
}

/** What would most likely stop these diagrams being drawn. */
function likelyFix(row, available) {
  const reason = mostCommon(row.reasons);
  if (reason === "answer_check") return "answer_check";
  if (reason === "failed") return "bank_step_failed";
  if (reason === "not_swappable") return "generator";
  if (reason === "crop_unfit") return "review_crops";
  if (!row.bankDiagramType || available < THIN_SUPPLY) return "add_material";
  return "extract_more";
}

/**
 * Demand grouped by year and bank category, down to the bank skill where one
 * is known, and the ranked gaps. A used slot takes the category of the bank
 * question it used; a drawn slot takes the one recorded with it, or, for
 * older resources, the one its drawn diagram maps to.
 */
function summariseDemand(entries, supply) {
  const groups = new Map();
  const totals = { slots: 0, used: 0, drawn: 0, reasons: {} };
  for (const entry of entries) {
    const bankDiagramType = entry.bankDiagramType || bankTypeOfDrawn(entry.diagramType, entry.skill);
    const bankSkill = entry.bankDiagramType ? entry.bankSkill || "" : "";
    const key = `${entry.year}|${bankDiagramType}|${bankSkill}`;
    let row = groups.get(key);
    if (!row) {
      row = { year: entry.year, bankDiagramType, bankSkill, needed: 0, used: 0, drawn: 0, reasons: {}, skills: {} };
      groups.set(key, row);
    }
    row.needed += 1;
    totals.slots += 1;
    const skill = skillKey(entry.skill);
    if (skill) row.skills[skill] = (row.skills[skill] || 0) + 1;
    if (entry.outcome === "used") {
      row.used += 1;
      totals.used += 1;
    } else {
      row.drawn += 1;
      totals.drawn += 1;
      row.reasons[entry.reason] = (row.reasons[entry.reason] || 0) + 1;
      totals.reasons[entry.reason] = (totals.reasons[entry.reason] || 0) + 1;
    }
  }
  const rows = [...groups.values()].map((row) => {
    const available = row.bankSkill
      ? supplyFor(supply, row.bankDiagramType, row.bankSkill, row.year)
      : row.bankDiagramType ? typeSupplyFor(supply, row.bankDiagramType, row.year) : null;
    const summary = { ...row, skills: topOf(row.skills, MAX_EXAMPLE_SKILLS), supply: available };
    return row.drawn ? { ...summary, fix: likelyFix(row, available ?? 0) } : summary;
  });
  const order = (a, b) => a.year - b.year || a.bankDiagramType.localeCompare(b.bankDiagramType) || a.bankSkill.localeCompare(b.bankSkill);
  const byNeed = (a, b) => b.needed - a.needed || b.drawn - a.drawn || order(a, b);
  const byDrawn = (a, b) => b.drawn - a.drawn || b.needed - a.needed || order(a, b);
  return {
    totals,
    rows: [...rows].sort(byNeed).slice(0, MAX_DEMAND_ROWS),
    gaps: rows.filter((row) => row.drawn > 0).sort(byDrawn).slice(0, MAX_GAPS),
  };
}

/** The whole summary from bank rows and job rows. Pure: tested without Firestore. */
function buildSummary({ questions, jobs, bankQuestions, windowDays = WINDOW_DAYS }) {
  const supply = summariseSupply(questions);
  const { totals, rows, gaps } = summariseDemand(demandEntries(jobs, bankQuestions), supply);
  return { windowDays, years: YEARS, thinSupply: THIN_SUPPLY, jobs: jobs.filter((job) => job?.questionBankUsage && job.subject === "maths").length, supply, demand: { totals, rows }, gaps };
}

async function loadBankQuestions(db, ids) {
  const found = new Map();
  for (let start = 0; start < ids.length; start += GET_ALL_CHUNK) {
    const docs = await db.getAll(...ids.slice(start, start + GET_ALL_CHUNK).map((id) => db.collection(QUESTIONS_COLLECTION).doc(id)), { fieldMask: ["diagramType", "skill"] });
    for (const doc of docs) if (doc.exists) found.set(doc.id, { diagramType: doc.get("diagramType") || "", skill: doc.get("skill") || "" });
  }
  return found;
}

/** Reads the bank and the last `windowDays` of resources, and builds the summary. */
async function buildBankGaps(db, { now = new Date(), windowDays = WINDOW_DAYS } = {}) {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const [questions, jobsSnapshot] = await Promise.all([
    db.collection(QUESTIONS_COLLECTION).select("status", "diagramType", "skill", "years").get(),
    db.collection(JOBS_COLLECTION).where("createdAt", ">=", since).select("subject", "year", "questionBankUsage", "generatedJson").get(),
  ]);
  const jobs = jobsSnapshot.docs.map((doc) => doc.data());
  const usedIds = [...new Set(jobs.flatMap((job) => (job.questionBankUsage?.used || []).filter((used) => used.questionId && !used.bankSkill).map((used) => used.questionId)))];
  const bankQuestions = usedIds.length ? await loadBankQuestions(db, usedIds) : new Map();
  return buildSummary({ questions: questions.docs.map((doc) => doc.data()), jobs, bankQuestions, windowDays });
}

async function writeBankGaps(db, summary, { serverTimestamp }) {
  await db.collection(SUMMARY_COLLECTION).doc(SUMMARY_DOC_ID).set({ ...summary, updatedAt: serverTimestamp() });
}

async function loadBankGaps(db) {
  const snap = await db.collection(SUMMARY_COLLECTION).doc(SUMMARY_DOC_ID).get();
  if (!snap.exists) return null;
  const data = snap.data();
  const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || null;
  return { ...data, updatedAt };
}

module.exports = {
  REASON_GROUPS,
  SUMMARY_COLLECTION,
  SUMMARY_DOC_ID,
  THIN_SUPPLY,
  WINDOW_DAYS,
  YEARS,
  bankTypeOfDrawn,
  buildBankGaps,
  buildSummary,
  demandEntries,
  likelyFix,
  loadBankGaps,
  needFromResource,
  reasonGroup,
  skillKey,
  summariseDemand,
  summariseSupply,
  supplyFor,
  typeSupplyFor,
  writeBankGaps,
};
