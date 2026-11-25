"use strict";

// RES-74. The summary behind the admin "Gaps" tab.

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  bankTypeOfDrawn,
  buildBankGaps,
  buildSummary,
  demandEntries,
  loadBankGaps,
  needFromResource,
  reasonGroup,
  summariseSupply,
  supplyFor,
  typeSupplyFor,
  writeBankGaps,
} = require("../../src/questionBank/gaps");
const { manageQuestionBankImpl } = require("../../src/questionBank/review");
const { parseArgs, report } = require("../../scripts/questionBankGaps");

const question = (extra = {}) => ({ status: "live", diagramType: "right_triangle", skill: "find_hypotenuse", years: [9], ...extra });

describe("bank supply (RES-74)", () => {
  it("counts live questions by diagram type, skill and year", () => {
    const supply = summariseSupply([
      question(), question({ years: [9, 10] }), question({ skill: "trig_find_angle", years: [10] }),
      question({ status: "hidden" }), question({ status: "duplicate" }),
      question({ diagramType: "made_up", skill: "" }),
    ]);
    assert.equal(supply.total, 4);
    assert.deepEqual(supply.byType.right_triangle.byYear, { 9: 2, 10: 2 });
    assert.deepEqual(supply.byType.right_triangle.skills.find_hypotenuse, { total: 2, byYear: { 9: 2, 10: 1 } });
    assert.equal(supply.byType.other.skills.other.total, 1);
  });

  it("counts what a search for one year can reach: that year and the ones either side", () => {
    const supply = summariseSupply([question({ years: [7] }), question({ years: [8] }), question({ years: [9] }), question({ years: [11] })]);
    assert.equal(supplyFor(supply, "right_triangle", "find_hypotenuse", 8), 3);
    assert.equal(supplyFor(supply, "right_triangle", "find_hypotenuse", 12), 1);
    assert.equal(supplyFor(supply, "right_triangle", "missing_skill", 8), 0);
    assert.equal(typeSupplyFor(supply, "right_triangle", 10), 2);
    assert.equal(typeSupplyFor(supply, "parabola", 10), 0);
  });
});

describe("demand from resources (RES-74)", () => {
  it("groups the reasons a diagram was drawn", () => {
    assert.equal(reasonGroup("no_candidates"), "no_candidates");
    assert.equal(reasonGroup("check_disagreed"), "answer_check");
    assert.equal(reasonGroup("answer_unconfirmed"), "answer_check");
    assert.equal(reasonGroup("search_failed: deadline exceeded"), "failed");
    assert.equal(reasonGroup("failed: RESOURCE_STAGE_TIMEOUT"), "failed");
    assert.equal(reasonGroup("answer_row_unclear"), "not_swappable");
    assert.equal(reasonGroup(undefined), "failed");
  });

  it("maps a drawn diagram to the bank category it belongs to", () => {
    assert.equal(bankTypeOfDrawn("right-triangle", ""), "right_triangle");
    assert.equal(bankTypeOfDrawn("cylinder", ""), "solid_3d");
    assert.equal(bankTypeOfDrawn("venn-diagram", ""), "probability_diagram");
    assert.equal(bankTypeOfDrawn("function-plot", "sketching parabolas"), "parabola");
    assert.equal(bankTypeOfDrawn("function-plot", "gradient and y-intercept"), "straight_line");
    assert.equal(bankTypeOfDrawn("number-line", "fractions on a number line"), "");
    assert.equal(bankTypeOfDrawn("unheard-of", ""), "");
  });

  it("takes what a slot needed from the entry, and from the saved resource for older jobs", () => {
    const resource = {
      title: "Paper",
      sections: [
        { title: "Section A", questions: [{ number: 1, skill: "angles in circles", diagram: { type: "circle" } }] },
        { title: "Section B", questions: [{ number: 1, skill: "volume of cylinders", diagramType: "cylinder", parts: [{ label: "(b)", skill: "", diagram: { type: "source-image" } }] }] },
      ],
    };
    assert.deepEqual(needFromResource(resource, { questionNumber: 1, section: "Section A" }), { skill: "angles in circles", diagramType: "circle" });
    // A part takes its question's skill; a bank crop is not a drawn diagram type.
    assert.deepEqual(needFromResource(resource, { questionNumber: 1, partLabel: "b", section: "Section B" }), { skill: "volume of cylinders", diagramType: "" });
    assert.deepEqual(needFromResource(resource, { questionNumber: 9 }), { skill: "", diagramType: "" });

    const jobs = [
      { subject: "maths", year: 9, generatedJson: JSON.stringify(resource), questionBankUsage: {
        used: [{ questionNumber: 1, section: "Section B", questionId: "bank1" }],
        skipped: [{ questionNumber: 1, section: "Section A", reason: "none_suitable" }],
      } },
      { subject: "maths", year: 10, questionBankUsage: {
        used: [{ questionNumber: 2, skill: "finding the hypotenuse", diagramType: "right-triangle", bankDiagramType: "right_triangle", bankSkill: "find_hypotenuse", questionId: "bank2" }],
        skipped: [{ questionNumber: 3, skill: "bearings", diagramType: "elevation", bankDiagramType: "elevation_bearings", bankSkill: "bearing_travel_problem", reason: "check_disagreed" }],
      } },
      { subject: "english", year: 9, questionBankUsage: { used: [{ questionNumber: 1 }], skipped: [] } },
      { subject: "maths", year: 9 },
    ];
    const entries = demandEntries(jobs, new Map([["bank1", { diagramType: "solid_3d", skill: "volume_prism_cylinder" }]]));
    assert.deepEqual(entries, [
      { year: 9, skill: "volume of cylinders", diagramType: "cylinder", outcome: "used", bankDiagramType: "solid_3d", bankSkill: "volume_prism_cylinder" },
      { year: 9, skill: "angles in circles", diagramType: "circle", outcome: "drawn", reason: "none_suitable", bankDiagramType: "", bankSkill: "" },
      { year: 10, skill: "finding the hypotenuse", diagramType: "right-triangle", outcome: "used", bankDiagramType: "right_triangle", bankSkill: "find_hypotenuse" },
      { year: 10, skill: "bearings", diagramType: "elevation", outcome: "drawn", reason: "answer_check", bankDiagramType: "elevation_bearings", bankSkill: "bearing_travel_problem" },
    ]);
  });
});

describe("the gaps summary (RES-74)", () => {
  const usage = (used, skipped) => ({ subject: "maths", year: 9, questionBankUsage: { used, skipped } });
  const drawn = (reason, extra = {}) => ({ questionNumber: 1, skill: "angles in circles", diagramType: "circle", reason, ...extra });

  it("ranks by diagrams drawn and suggests the likely fix", () => {
    const questions = [
      ...Array.from({ length: 12 }, () => question({ diagramType: "circle_geometry", skill: "tangent_properties", years: [9] })),
      question({ diagramType: "shape_2d", skill: "area_composite", years: [9] }),
    ];
    const summary = buildSummary({ questions, bankQuestions: new Map(), jobs: [
      // Plenty in the bank, yet none suited: more variety is needed.
      usage([], [1, 2, 3].map(() => drawn("none_suitable", { bankDiagramType: "circle_geometry", bankSkill: "tangent_properties" }))),
      // The bank has one composite-area question for this year.
      usage([], [drawn("none_suitable", { skill: "area of composite shapes", diagramType: "L-shape", bankDiagramType: "shape_2d", bankSkill: "area_composite" }),
        drawn("no_candidates", { skill: "area of composite shapes", diagramType: "L-shape", bankDiagramType: "shape_2d", bankSkill: "area_composite" })]),
      // Nothing in the bank answers to it at all.
      usage([], [drawn("no_candidates", { skill: "reading a clock", diagramType: "clock" })]),
      usage([{ questionNumber: 4, skill: "tangents", diagramType: "circle", bankDiagramType: "circle_geometry", bankSkill: "tangent_properties", questionId: "x" }],
        [drawn("check_disagreed", { bankDiagramType: "circle_geometry", bankSkill: "angle_centre_circumference" })]),
      usage([], [drawn("failed: RESOURCE_STAGE_TIMEOUT", { bankDiagramType: "circle_geometry", bankSkill: "chord_properties" })]),
      usage([], [drawn("answer_row_unclear", { skill: "volume", diagramType: "cylinder" })]),
    ] });

    assert.equal(summary.jobs, 6);
    assert.deepEqual(summary.demand.totals, { slots: 10, used: 1, drawn: 9, reasons: { none_suitable: 4, no_candidates: 2, answer_check: 1, failed: 1, not_swappable: 1 } });
    const gap = (type, skill) => summary.gaps.find((row) => row.bankDiagramType === type && row.bankSkill === skill);
    assert.equal(summary.gaps[0], gap("circle_geometry", "tangent_properties"), "the most drawn comes first");
    assert.deepEqual({ ...gap("circle_geometry", "tangent_properties"), skills: undefined }, {
      year: 9, bankDiagramType: "circle_geometry", bankSkill: "tangent_properties", needed: 4, used: 1, drawn: 3, reasons: { none_suitable: 3 }, skills: undefined, supply: 12, fix: "extract_more",
    });
    assert.deepEqual(gap("circle_geometry", "tangent_properties").skills, [{ name: "angles in circles", count: 3 }, { name: "tangents", count: 1 }]);
    assert.equal(gap("shape_2d", "area_composite").fix, "add_material");
    assert.equal(gap("shape_2d", "area_composite").supply, 1);
    assert.equal(gap("", "").fix, "add_material");
    assert.equal(gap("", "").supply, null);
    assert.equal(gap("circle_geometry", "angle_centre_circumference").fix, "answer_check");
    assert.equal(gap("circle_geometry", "chord_properties").fix, "bank_step_failed");
    assert.equal(gap("solid_3d", "").fix, "generator");
    // Demand lists every group, the most needed first.
    assert.equal(summary.demand.rows[0].needed, 4);
    assert.ok(summary.demand.rows.every((row) => row.needed === row.used + row.drawn));
  });
});

describe("reading and writing the summary (RES-74)", () => {
  function fakeDb({ questions = [], jobs = [], docs = {} }) {
    const written = {};
    const snapshot = (rows) => ({ docs: rows.map((data, index) => ({ id: data.id || `d${index}`, exists: true, data: () => data, get: (field) => data[field] })) });
    return {
      written,
      getAll: async (...args) => args.filter((arg) => arg.path).map((ref) => {
        const data = questions.find((row) => row.id === ref.path.split("/")[1]);
        return { id: ref.path.split("/")[1], exists: Boolean(data), get: (field) => data?.[field] };
      }),
      collection: (name) => {
        const query = {
          select: () => query,
          where: (field, op, value) => { query.since = value; return query; },
          get: async () => snapshot(name === "questionBank" ? questions : jobs.filter((job) => !query.since || job.createdAt >= query.since)),
          doc: (id) => ({
            path: `${name}/${id}`,
            set: async (data) => { written[`${name}/${id}`] = data; },
            get: async () => ({ exists: `${name}/${id}` in docs, data: () => docs[`${name}/${id}`] }),
          }),
        };
        return query;
      },
    };
  }

  it("reads the bank and the window's resources, and looks up the bank questions used", async () => {
    const now = new Date("2026-11-26T00:00:00Z");
    const db = fakeDb({
      questions: [question({ id: "bank1", diagramType: "solid_3d", skill: "volume_prism_cylinder" })],
      jobs: [
        { subject: "maths", year: 9, createdAt: new Date("2026-11-20T00:00:00Z"), questionBankUsage: { used: [{ questionNumber: 1, questionId: "bank1" }], skipped: [] } },
        { subject: "maths", year: 9, createdAt: new Date("2026-05-01T00:00:00Z"), questionBankUsage: { used: [], skipped: [{ questionNumber: 1, reason: "no_candidates" }] } },
      ],
    });
    const summary = await buildBankGaps(db, { now, windowDays: 90 });
    assert.equal(summary.jobs, 1, "the May resource is outside the window");
    assert.deepEqual(summary.demand.rows.map((row) => [row.bankDiagramType, row.bankSkill, row.used]), [["solid_3d", "volume_prism_cylinder", 1]]);

    await writeBankGaps(db, summary, { serverTimestamp: () => "NOW" });
    assert.equal(db.written["resourceCapabilities/bankGaps"].updatedAt, "NOW");
    assert.equal(db.written["resourceCapabilities/bankGaps"].supply.total, 1);
  });

  it("serves the summary to admins only, and says when there is none yet", async () => {
    const updatedAt = { toDate: () => new Date("2026-11-26T03:30:00Z") };
    const db = fakeDb({ docs: { "resourceCapabilities/bankGaps": { supply: { total: 3 }, gaps: [], updatedAt } } });
    const call = (role, database = db) => manageQuestionBankImpl({ request: { auth: { uid: "u", token: { role } }, data: { action: "bankGaps" } }, deps: { db: database } });
    const { summary } = await call("admin");
    assert.equal(summary.supply.total, 3);
    assert.equal(summary.updatedAt, "2026-11-26T03:30:00.000Z");
    await assert.rejects(call("tutor"), { code: "permission-denied" });
    assert.deepEqual(await call("admin", fakeDb({})), { summary: null });
    assert.equal(await loadBankGaps(fakeDb({})), null);
  });

  it("the daily script needs a project and reports in plain numbers", () => {
    assert.throws(() => parseArgs([]), /--projectId is required/);
    assert.throws(() => parseArgs(["--projectId=p", "--days=0"]), /--days/);
    assert.deepEqual(parseArgs(["--projectId=p", "--commit", "--yes", "--days=30"]), { projectId: "p", commit: true, yes: true, days: 30 });
    const lines = report({ windowDays: 90, jobs: 2, supply: { total: 10, byType: { a: {}, b: {} } }, gaps: [{}], demand: { totals: { slots: 4, used: 3, drawn: 1, reasons: { none_suitable: 1 } } } });
    assert.deepEqual(lines, [
      "Bank: 10 live questions in 2 diagram types",
      "Last 90 days: 2 maths resources, 4 diagram questions, 3 from the bank (75%), 1 drawn",
      "Drawn because: none_suitable 1",
      "Gaps listed: 1",
    ]);
  });
});
