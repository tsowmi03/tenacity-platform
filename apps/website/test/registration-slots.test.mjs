import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiled = new Map();
const json = (value) => JSON.parse(JSON.stringify(value));

// Run the real TypeScript modules with only their external services replaced.
const loadModule = (relativePath, mocks = {}, globals = {}, extraSource = "") => {
  const filename = path.join(root, relativePath);
  const cacheKey = filename + extraSource;
  if (!compiled.has(cacheKey)) {
    compiled.set(cacheKey, ts.transpileModule(
      fs.readFileSync(filename, "utf8") + extraSource,
      { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }
    ).outputText);
  }
  const module = { exports: {} };
  const require = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith("@lib/")) {
      return loadModule(`src/lib/${id.slice(5)}.ts`, mocks, globals);
    }
    throw new Error(`Unexpected dependency: ${id}`);
  };
  vm.runInNewContext(compiled.get(cacheKey), {
    module, exports: module.exports, require, console, ...globals,
  }, { filename });
  return module.exports;
};

const { hasValidClassSelection } = loadModule("src/lib/registrationSlots.ts");
const slots = Array.from({ length: 3 }, (_, index) => ({
  id: `class-${index + 1}`, day: "Monday", startTime: `${16 + index}:00`,
  endTime: `${17 + index}:00`, capacity: 8, enrolledStudents: [], type: "5-10",
}));

test("only primary Maths and English accepts one or two distinct class times", () => {
  for (let year = 5; year <= 12; year += 1) {
    for (let count = 0; count <= 3; count += 1) {
      assert.equal(
        hasValidClassSelection(`Year ${year}`, ["Maths", "English"], slots.slice(0, count)),
        year < 7 ? count === 1 || count === 2 : count === 2,
        `Year ${year}, ${count} slots`
      );
      for (const subject of ["Maths", "English", "Math 11 Standard"]) {
        assert.equal(
          hasValidClassSelection(`Year ${year}`, [subject], slots.slice(0, count)),
          count === 1
        );
      }
    }
  }
  assert.equal(hasValidClassSelection("Year 6", [], []), false);
  assert.equal(hasValidClassSelection("", ["Maths", "English"], [slots[0]]), false);
  assert.equal(hasValidClassSelection("Year 6", ["Maths", "Maths"], [slots[0]]), false);
  assert.equal(hasValidClassSelection("Year 6", ["Maths", "English"], [slots[0], slots[0]]), false);
});

const setupForm = async (t) => {
  const dom = new JSDOM(fs.readFileSync(path.join(root,
    "src/modules/design/static/register.html"), "utf8"), {
    url: "https://registration.test/register",
  });
  const { window } = dom;
  const { document } = window;
  window.scrollTo = () => {};
  window.HTMLElement.prototype.animate = () => {};
  window.turnstile = {
    render: (_element, options) => { options.callback("test-token"); return "widget"; },
    reset: () => {},
  };
  const submissions = [];
  const { setupRegistrationRuntime } = loadModule(
    "src/modules/design/DesignRuntime.tsx", {
      "react": {},
      "@lib/analytics": { track: () => {}, trackBeacon: () => {}, analyticsDistinctId: () => "test" },
      "@lib/firebaseConfig": { db: {} },
      "@lib/referralCodes": { normaliseReferralCode: () => "" },
      "@lib/utils/apiHelper": {},
      "firebase/firestore": {
        collection: () => ({}),
        getDocs: async () => ({ docs: slots.map((slot) => ({ id: slot.id, data: () => slot })) }),
      },
    }, {
      window, document, URLSearchParams, process: { env: { NEXT_PUBLIC_TURNSTILE_SITE_KEY: "test" } },
      fetch: async (_url, options) => {
        submissions.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ enrolmentIds: ["test"] }) };
      },
    }, "\nexport { setupRegistrationRuntime };"
  );
  const cleanup = setupRegistrationRuntime();
  t.after(() => { cleanup(); window.close(); });
  await new Promise(setImmediate);
  const click = (selector) => {
    const element = document.querySelector(selector);
    assert.ok(element, `Missing element: ${selector}`);
    element.click();
  };
  const input = (id, value) => {
    const element = document.getElementById(id);
    element.value = value;
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  };
  const next = () => click("#regNext");
  const step = () => Number(document.querySelector(".reg-step.active").dataset.step);
  const chooseSubjects = (year, both = true) => {
    click(`#yearGrid [data-val="${year}"]`);
    next();
    click('#subjectGrid [data-val="Mathematics"]');
    if (both) click('#subjectGrid [data-val="English"]');
    next();
  };
  return { document, window, submissions, click, input, next, step, chooseSubjects };
};

for (const year of ["Year 5", "Year 6"]) {
  for (const count of [1, 2]) {
    test(`${year} completes registration with both subjects and ${count} slot(s)`, async (t) => {
      const form = await setupForm(t);
      const { document, window, click, input, next, step, chooseSubjects, submissions } = form;
      chooseSubjects(year);
      assert.equal(document.getElementById("regNext").disabled, true);
      assert.match(document.getElementById("slotHint").textContent, /together in one hour/);
      click('[data-id="class-1"]');
      assert.equal(document.getElementById("regNext").disabled, false);
      assert.equal(step(), 3); // Keep the optional second slot available.
      if (count === 2) click('[data-id="class-2"]');
      next();
      assert.equal(step(), 4);
      input("studentFirstName", "Test");
      input("studentLastName", "Student");
      next();
      assert.equal(step(), 5);
      next();
      input("carerFirstName", "Test");
      input("carerLastName", "Parent");
      input("carerEmail", "parent@example.test");
      input("carerPhone", "0400000000");
      next();
      assert.equal(step(), 7);
      assert.match(document.getElementById("summaryList").textContent, /Mathematics & English/);
      input("emName", "Test Contact");
      input("emPhone", "0400000001");
      input("emRelation", "Parent");
      const referral = document.getElementById("referralSource");
      referral.value = "google";
      referral.dispatchEvent(new window.Event("change"));
      click("#termsAccepted");
      next();
      await new Promise(setImmediate);
      assert.equal(submissions.length, 1);
      assert.deepEqual(submissions[0].students[0].studentSubjects, ["Maths", "English"]);
      assert.equal(submissions[0].students[0].classes.length, count);
    });
  }
}

test("Year 7 explains the two-slot rule and stays blocked with only one selected", async (t) => {
  const { document, click, next, step, chooseSubjects } = await setupForm(t);
  chooseSubjects("Year 7");
  assert.match(document.getElementById("slotRequirementTitle").textContent, /Choose 2 class times/);
  assert.match(document.getElementById("slotHint").textContent, /separate one-hour sessions/);
  click('[data-id="class-1"]');
  next();
  assert.equal(step(), 3);
  assert.equal(document.getElementById("regNext").disabled, true);
  assert.equal(document.getElementById("regNext").getAttribute("aria-describedby"), "slotSelectionStatus");
  assert.match(document.getElementById("slotSelectionStatus").textContent, /1 of 2.*Select 1 more class time/);
  click('[data-id="class-2"]');
  assert.equal(document.getElementById("regNext").disabled, false);
  assert.equal(document.querySelector('[data-id="class-3"]').disabled, true);
  click('[data-id="class-2"]');
  assert.equal(document.getElementById("regNext").disabled, true);
  click('[data-id="class-2"]');
  next();
  assert.equal(step(), 4);
  assert.equal(document.getElementById("regNext").hasAttribute("aria-describedby"), false);
});

test("changing Year 6 to Year 7 resets slots and applies the high-school rule", async (t) => {
  const { document, click, next, step, chooseSubjects } = await setupForm(t);
  chooseSubjects("Year 6");
  click('[data-id="class-1"]');
  click("#regBack");
  click("#regBack");
  click('#yearGrid [data-val="Year 7"]');
  next();
  next();
  assert.equal(step(), 3);
  assert.equal(document.querySelectorAll(".slot.selected").length, 0);
  assert.match(document.getElementById("slotSelectionStatus").textContent, /0 of 2/);
  click('[data-id="class-1"]');
  assert.equal(document.getElementById("regNext").disabled, true);
});

test("a single-subject high-school enrolment still needs exactly one slot", async (t) => {
  const { document, click, next, step, chooseSubjects } = await setupForm(t);
  chooseSubjects("Year 7", false);
  assert.equal(document.getElementById("regNext").disabled, true);
  click('[data-id="class-1"]');
  assert.equal(document.getElementById("regNext").disabled, false);
  assert.equal(document.querySelector('[data-id="class-2"]').disabled, true);
  next();
  assert.equal(step(), 4);
});

const family = {
  carerFirstName: "Test", carerLastName: "Parent", carerEmail: "parent@example.test",
  carerPhone: "0400000000", emergencyContactFirstName: "Test", emergencyContactPhone: "0400000001",
  emergencyContactRelation: "Parent", termsAccepted: true,
};
const student = (year, count) => ({
  studentFirstName: "Test", studentLastName: "Student", studentYear: year,
  studentSubjects: ["Maths", "English"], classes: slots.slice(0, count),
});

const submitApi = async (body) => {
  const writes = [];
  const handler = loadModule("src/pages/api/register.ts", {
    "firebase-admin/firestore": { FieldValue: { serverTimestamp: () => "test-timestamp" } },
    "@lib/analyticsServer": { captureServerEvent: async () => {} },
    "@lib/firebaseAdmin": { getAdminDb: () => ({
      collection: () => ({ doc: () => ({ id: `enrolment-${writes.length}` }) }),
      batch: () => ({ set: (_ref, data) => writes.push(json(data)), commit: async () => {} }),
    }) },
    "@lib/referralCodes": { normaliseReferralCode: () => "" },
    "@lib/turnstile": { requestIp: () => "127.0.0.1", verifyTurnstile: async () => true },
  }).default;
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } };
  await handler({ method: "POST", body: { turnstileToken: "test-token", ...body }, cookies: {} }, response);
  return { response, writes };
};

test("API accepts primary one/two slots in grouped and legacy payloads and preserves both subjects", async () => {
  for (const year of ["Year 5", "Year 6"]) {
    for (const count of [1, 2]) {
      for (const body of [
        { family, students: [student(year, count)] },
        { enrolment: { ...family, ...student(year, count) } },
      ]) {
        const { response, writes } = await submitApi(body);
        assert.equal(response.statusCode, 200);
        assert.equal(writes.length, 1);
        assert.deepEqual(writes[0].studentSubjects, ["Maths", "English"]);
        assert.deepEqual(writes[0].classes.map((slot) => slot.id), slots.slice(0, count).map((slot) => slot.id));
      }
    }
  }
});

test("API keeps slot validation per child in mixed primary/high-school families", async () => {
  const { response, writes } = await submitApi({ family, students: [student("Year 6", 1), student("Year 7", 2)] });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(writes.map((entry) => entry.classes.length), [1, 2]);
  assert.equal(writes[0].registrationGroupId, writes[1].registrationGroupId);
});

test("API rejects zero/excess/duplicate slots and high-school one-slot payloads without saving", async () => {
  for (const invalid of [
    student("Year 6", 0), student("Year 6", 3), student("Year 7", 1),
    { ...student("Year 7", 2), classes: [slots[0], slots[0]] },
    { ...student("Year 6", 2), studentSubjects: ["Maths"] },
  ]) {
    const { response, writes } = await submitApi({ family, students: [student("Year 6", 1), invalid] });
    assert.equal(response.statusCode, 400);
    assert.equal(writes.length, 0);
  }
});
