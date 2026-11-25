"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { planSources, SKIP_REASONS } = require("../../src/questionBank/sourceRules");
const { createDriveClient, listTree } = require("../../src/questionBank/driveSource");
const { planSourceWrites, versionOf } = require("../../src/questionBank/sourceStore");

let nextId = 0;
function file(path, extra = {}) {
  return { id: `f${++nextId}`, name: path.split("/").pop(), path, mimeType: "application/pdf", md5: `md5-${nextId}`, ...extra };
}

function planFor(files) {
  return new Map(planSources(files).map((plan) => [plan.path, plan]));
}

describe("planSources", () => {
  it("keeps ordinary Maths documents", () => {
    const plans = planFor([file("Maths/MathsTEXTBOOKS/Year 9 Cambridge.pdf"), file("Maths/HSC/Trial 2021.docx")]);
    assert.equal(plans.get("Maths/MathsTEXTBOOKS/Year 9 Cambridge.pdf").status, "pending");
    assert.equal(plans.get("Maths/HSC/Trial 2021.docx").status, "pending");
  });

  it("skips files that are not documents", () => {
    const plans = planFor([file("Maths/MathsTEXTBOOKS/Maths Quest/setup.exe"), file("Maths/MathsTEXTBOOKS/cover.jpg")]);
    for (const plan of plans.values()) assert.equal(plan.skipReason, SKIP_REASONS.notDocument);
  });

  it("treats Google Docs and Slides as documents", () => {
    const plans = planFor([file("Maths/Worksheet", { mimeType: "application/vnd.google-apps.document", md5: null })]);
    assert.equal(plans.get("Maths/Worksheet").status, "pending");
  });

  it("skips Mathletics below Year 5 but keeps Year 5 up", () => {
    const plans = planFor([
      file("Maths/Mathletics/K/counting.pdf"),
      file("Maths/Mathletics/04/position_student.pdf"),
      file("Maths/Mathletics/05/position_student.pdf"),
      file("Maths/Mathletics/10/surds_student.pdf"),
    ]);
    assert.equal(plans.get("Maths/Mathletics/K/counting.pdf").skipReason, SKIP_REASONS.belowYear5);
    assert.equal(plans.get("Maths/Mathletics/04/position_student.pdf").skipReason, SKIP_REASONS.belowYear5);
    assert.equal(plans.get("Maths/Mathletics/05/position_student.pdf").status, "pending");
    assert.equal(plans.get("Maths/Mathletics/10/surds_student.pdf").status, "pending");
  });

  it("skips answer and solution files", () => {
    const plans = planFor([
      file("Maths/Problem Solving/Problem solving 1 answers.pdf"),
      file("Maths/Mathletics/10/58934841.AUS_L_Limits_Solutions_AUS.pdf"),
      file("Maths/HSC/WME Year 11 Advanced Solutions.docx"),
    ]);
    for (const plan of plans.values()) assert.equal(plan.skipReason, SKIP_REASONS.answerFile);
  });

  it("skips a teacher edition only when its student edition exists", () => {
    const student = file("Maths/Mathletics/06/93322369.G_geometry_student.pdf");
    const plans = planFor([
      student,
      file("Maths/Mathletics/06/93322369.G_geometry_teacher.pdf"),
      file("Maths/Mathletics/07/Data Representation teacher.pdf"),
    ]);
    const teacher = plans.get("Maths/Mathletics/06/93322369.G_geometry_teacher.pdf");
    assert.equal(teacher.skipReason, SKIP_REASONS.teacherEdition);
    assert.equal(teacher.duplicateOf, student.id);
    assert.equal(plans.get("Maths/Mathletics/07/Data Representation teacher.pdf").status, "pending");
  });

  it("keeps the PDF when the same worksheet is also saved as Word", () => {
    const pdf = file("Maths/Upper Primary/PDF version/Fractions 1.pdf");
    const plans = planFor([pdf, file("Maths/Upper Primary/Word version/Fractions 1.docx")]);
    assert.equal(plans.get("Maths/Upper Primary/PDF version/Fractions 1.pdf").status, "pending");
    const word = plans.get("Maths/Upper Primary/Word version/Fractions 1.docx");
    assert.equal(word.skipReason, SKIP_REASONS.formatPair);
    assert.equal(word.duplicateOf, pdf.id);
  });

  it("keeps one of several identical files, preferring the one not named as a copy", () => {
    const original = file("Maths/Revision Workbooks/Year 9 Mathematics.pdf", { md5: "same" });
    const plans = planFor([
      file("Maths/Revision Workbooks/Year 9 Mathematics a.pdf", { md5: "same" }),
      original,
      file("Maths/Revision Workbooks/Year 9 Mathematics (1).pdf", { md5: "same" }),
    ]);
    assert.equal(plans.get("Maths/Revision Workbooks/Year 9 Mathematics.pdf").status, "pending");
    for (const name of ["Year 9 Mathematics a.pdf", "Year 9 Mathematics (1).pdf"]) {
      const copy = plans.get(`Maths/Revision Workbooks/${name}`);
      assert.equal(copy.skipReason, SKIP_REASONS.duplicate);
      assert.equal(copy.duplicateOf, original.id);
    }
  });

  it("does not match Google-native files, which have no checksum, as duplicates", () => {
    const plans = planSources([
      file("Maths/A", { mimeType: "application/vnd.google-apps.document", md5: null }),
      file("Maths/B", { mimeType: "application/vnd.google-apps.document", md5: null }),
    ]);
    assert.deepEqual(plans.map((plan) => plan.status), ["pending", "pending"]);
  });
});

describe("the Subject → Year → Topic layout (RES-121, TP-47)", () => {
  const shortcutTo = (path, target, extra = {}) => file(path, {
    mimeType: "application/vnd.google-apps.shortcut", md5: null, shortcutTargetId: target.id, shortcutTargetMimeType: target.mimeType, ...extra,
  });

  it("skips everything under Primary (K–4), and still skips Mathletics K to 04", () => {
    const plans = planFor([
      file("Maths/Primary (K–4)/Number/counting.pdf"),
      file("Maths/Primary (K-4)/Textbooks/Year 3 book.pdf"),
      file("Maths/Mathletics/02/addition_student.pdf"),
      file("Maths/Year 5/Fractions Decimals & Percentages/fractions.pdf"),
      file("Maths/Year 10/Past Papers/Primary (K–4) review.pdf"),
      file("Maths/Mathletics/05/position_student.pdf"),
    ]);
    assert.equal(plans.get("Maths/Primary (K–4)/Number/counting.pdf").skipReason, SKIP_REASONS.belowYear5);
    assert.equal(plans.get("Maths/Primary (K-4)/Textbooks/Year 3 book.pdf").skipReason, SKIP_REASONS.belowYear5);
    assert.equal(plans.get("Maths/Mathletics/02/addition_student.pdf").skipReason, SKIP_REASONS.belowYear5);
    assert.equal(plans.get("Maths/Year 5/Fractions Decimals & Percentages/fractions.pdf").status, "pending");
    // A folder, not a file that happens to carry the words.
    assert.equal(plans.get("Maths/Year 10/Past Papers/Primary (K–4) review.pdf").status, "pending");
    assert.equal(plans.get("Maths/Mathletics/05/position_student.pdf").status, "pending");
  });

  it("extracts a multi-year book once, however many years have a shortcut to it", () => {
    const book = file("Maths/Year 7/Textbooks/Cambridge 7-8.pdf");
    const plans = planFor([
      book,
      shortcutTo("Maths/Year 8/Textbooks/Cambridge 7-8.pdf", book),
      // A renamed shortcut has no extension; it is still the PDF it points to.
      shortcutTo("Maths/Year 9/Textbooks/Cambridge (revision)", book),
    ]);
    assert.equal(plans.get(book.path).status, "pending");
    for (const path of ["Maths/Year 8/Textbooks/Cambridge 7-8.pdf", "Maths/Year 9/Textbooks/Cambridge (revision)"]) {
      assert.equal(plans.get(path).skipReason, SKIP_REASONS.shortcut, path);
      assert.equal(plans.get(path).duplicateOf, book.id);
    }
  });

  it("extracts a book kept under Primary through one of its shortcuts", () => {
    // A Year 4–6 book sits in the earliest year's folder, which the bank skips.
    const book = file("Maths/Primary (K–4)/Textbooks/Maths Plus 4-6.pdf");
    const year5 = shortcutTo("Maths/Year 5/Textbooks/Maths Plus 4-6.pdf", book);
    const year6 = shortcutTo("Maths/Year 6/Textbooks/Maths Plus 4-6.pdf", book);
    const plans = planFor([book, year6, year5]);
    assert.equal(plans.get(book.path).skipReason, SKIP_REASONS.belowYear5);
    assert.equal(plans.get(year5.path).status, "pending");
    assert.equal(plans.get(year6.path).skipReason, SKIP_REASONS.shortcut);
    assert.equal(plans.get(year6.path).duplicateOf, year5.id);
  });

  it("keeps one shortcut to a file outside Maths, and none to a file skipped for what it is", () => {
    const outside = { id: "elsewhere", mimeType: "application/pdf" };
    const answers = file("Maths/Year 9/Past Papers/Trial 2021 - Answers.pdf");
    const first = shortcutTo("Maths/Year 9/Past Papers/Selective paper.pdf", outside);
    const second = shortcutTo("Maths/Year 10/Past Papers/Selective paper.pdf", outside);
    const plans = planFor([answers, first, second, shortcutTo("Maths/Year 10/Past Papers/Trial 2021 paper.pdf", answers),
      shortcutTo("Maths/Year 10/Algebra/setup", { id: "exe", mimeType: "application/x-msdownload" })]);
    assert.equal(plans.get(first.path).status, "pending", "the shorter path is kept");
    assert.equal(plans.get(second.path).skipReason, SKIP_REASONS.shortcut);
    assert.equal(plans.get(second.path).duplicateOf, first.id);
    assert.equal(plans.get("Maths/Year 10/Past Papers/Trial 2021 paper.pdf").skipReason, SKIP_REASONS.shortcut);
    assert.equal(plans.get("Maths/Year 10/Algebra/setup").skipReason, SKIP_REASONS.notDocument);
  });
});

describe("listTree", () => {
  it("walks subfolders, builds paths and skips Student Docs", async () => {
    const folder = "application/vnd.google-apps.folder";
    const children = {
      root: [{ id: "a", name: "HSC", mimeType: folder }, { id: "s", name: "Student Docs", mimeType: folder }, { id: "1", name: "top.pdf", mimeType: "application/pdf", size: "10", md5Checksum: "x", modifiedTime: "t" }],
      a: [{ id: "2", name: "trial.pdf", mimeType: "application/pdf" }],
      s: [{ id: "3", name: "private.pdf", mimeType: "application/pdf" }],
    };
    const files = await listTree({ listChildren: async (id) => children[id] }, "root", "Maths");
    assert.deepEqual(files.map((f) => f.path).sort(), ["Maths/HSC/trial.pdf", "Maths/top.pdf"]);
    assert.deepEqual(files.find((f) => f.id === "1"), {
      id: "1", name: "top.pdf", path: "Maths/top.pdf", mimeType: "application/pdf", bytes: 10, md5: "x", modifiedTime: "t",
      shortcutTargetId: null, shortcutTargetMimeType: null,
    });
  });

  it("records what a shortcut points to (RES-121)", async () => {
    const shortcut = { id: "s1", name: "Cambridge 7-8", mimeType: "application/vnd.google-apps.shortcut", shortcutDetails: { targetId: "book", targetMimeType: "application/pdf" } };
    const [listed] = await listTree({ listChildren: async () => [shortcut] }, "root", "Maths");
    assert.equal(listed.shortcutTargetId, "book");
    assert.equal(listed.shortcutTargetMimeType, "application/pdf");
  });
});

describe("createDriveClient", () => {
  it("follows page tokens, searches the shared drive and sends the token", async () => {
    const requests = [];
    const pages = [{ files: [{ id: "1" }], nextPageToken: "next" }, { files: [{ id: "2" }] }];
    const fetchImpl = async (url, init) => {
      requests.push({ url: new URL(url), auth: init.headers.Authorization });
      return { ok: true, json: async () => pages.shift() };
    };
    const drive = createDriveClient({ getAccessToken: async () => "tok", fetchImpl });
    const files = await drive.listChildren("folder1");
    assert.deepEqual(files.map((f) => f.id), ["1", "2"]);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].auth, "Bearer tok");
    assert.equal(requests[0].url.searchParams.get("q"), "'folder1' in parents and trashed = false");
    assert.equal(requests[0].url.searchParams.get("supportsAllDrives"), "true");
    assert.equal(requests[1].url.searchParams.get("pageToken"), "next");
  });

  it("reports a failed request with its status", async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, text: async () => "insufficientFilePermissions" });
    const drive = createDriveClient({ getAccessToken: async () => "tok", fetchImpl });
    await assert.rejects(drive.listChildren("x"), /403 insufficientFilePermissions/);
  });
});

describe("planSourceWrites", () => {
  const plan = { id: "1", name: "a.pdf", path: "Maths/a.pdf", mimeType: "application/pdf", bytes: 5, md5: "m", modifiedTime: "t1", status: "pending", skipReason: null, duplicateOf: null };

  it("writes new files and leaves unchanged ones alone", () => {
    const [write] = planSourceWrites(new Map(), [plan]);
    assert.equal(write.change, "new");
    assert.equal(write.data.version, "m:t1");
    const existing = new Map([["1", write.data]]);
    assert.deepEqual(planSourceWrites(existing, [plan]), []);
  });

  it("marks a file whose content changed, and one whose decision changed", () => {
    const existing = new Map([["1", { ...plan, version: versionOf(plan) }]]);
    assert.equal(planSourceWrites(existing, [{ ...plan, md5: "m2" }])[0].change, "changed");
    assert.equal(planSourceWrites(existing, [{ ...plan, status: "skipped", skipReason: "duplicate" }])[0].change, "updated");
  });

  it("does not treat a renamed or moved file as changed (RES-121)", () => {
    // Drive stamps a new modified time on a rename. The contents, and so the
    // checksum, are the same: nothing to extract again.
    const existing = new Map([["1", { ...plan, version: versionOf(plan) }]]);
    const renamed = { ...plan, name: "Maths - Year 9 - Worksheet - Algebra.pdf", path: "Maths/Year 9/Algebra/Maths - Year 9 - Worksheet - Algebra.pdf", modifiedTime: "t2" };
    const [write] = planSourceWrites(existing, [renamed]);
    assert.equal(write.change, "updated");
    assert.equal(write.data.version, "m:t1", "the version it was extracted at");
    assert.equal(write.data.path, renamed.path);
    assert.equal(write.data.modifiedTime, "t2");
    // Once recorded, the next sync has nothing to write.
    assert.deepEqual(planSourceWrites(new Map([["1", write.data]]), [renamed]), []);
    // New contents are still a new version.
    assert.equal(planSourceWrites(new Map([["1", write.data]]), [{ ...renamed, md5: "m2", modifiedTime: "t3" }])[0].data.version, "m2:t3");
  });

  it("goes by the modified time for a Google-native file, which has no checksum", () => {
    const doc = { ...plan, mimeType: "application/vnd.google-apps.document", md5: null };
    const existing = new Map([["1", { ...doc, version: versionOf(doc) }]]);
    assert.equal(planSourceWrites(existing, [{ ...doc, modifiedTime: "t2" }])[0].change, "changed");
  });

  it("marks files that disappeared from Drive as removed, once", () => {
    const existing = new Map([["1", { ...plan, version: versionOf(plan) }]]);
    const [write] = planSourceWrites(existing, []);
    assert.equal(write.change, "removed");
    assert.deepEqual(planSourceWrites(new Map([["1", { status: "removed" }]]), []), []);
  });
});
