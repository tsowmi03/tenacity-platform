import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  getBytes,
  ref,
  uploadBytes,
} from "firebase/storage";

const projectId = "tenacity-storage-rules-test";
let testEnv;

function authedStorage(uid, role) {
  return testEnv.authenticatedContext(uid, {
    email: `${uid}@example.com`,
    role,
  }).storage();
}

function anonStorage() {
  return testEnv.unauthenticatedContext().storage();
}

async function seedOutput() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const storage = context.storage();
    await uploadBytes(
      ref(storage, "resources/output/job-1/attempt-1_worksheet.docx"),
      new Uint8Array([80, 75, 3, 4])
    );
  });
}

describe("storage rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      storage: {
        host: "127.0.0.1",
        port: 9199,
        rules: readFileSync("storage.rules", "utf8"),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearStorage();
    await seedOutput();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows admins and tutors to read generated resource output", async () => {
    const admin = authedStorage("admin-1", "admin");
    const tutor = authedStorage("tutor-1", "tutor");
    const path = "resources/output/job-1/attempt-1_worksheet.docx";

    await assertSucceeds(getBytes(ref(admin, path)));
    await assertSucceeds(getBytes(ref(tutor, path)));
  });

  it("blocks parents and anonymous users from generated resource output", async () => {
    const parent = authedStorage("parent-1", "parent");
    const anonymous = anonStorage();
    const path = "resources/output/job-1/attempt-1_worksheet.docx";

    await assertFails(getBytes(ref(parent, path)));
    await assertFails(getBytes(ref(anonymous, path)));
  });

  it("allows staff to manage only their own upload area", async () => {
    const tutor = authedStorage("tutor-1", "tutor");
    const otherTutor = authedStorage("tutor-2", "tutor");
    const parent = authedStorage("parent-1", "parent");
    const ownPath = "resources/uploads/tutor-1/reference.pdf";

    await assertSucceeds(uploadBytes(ref(tutor, ownPath), new Uint8Array([1, 2, 3])));
    await assertSucceeds(getBytes(ref(tutor, ownPath)));
    await assertFails(getBytes(ref(otherTutor, ownPath)));
    await assertFails(
      uploadBytes(ref(parent, "resources/uploads/parent-1/reference.pdf"), new Uint8Array([1]))
    );
  });

  it("blocks all client writes to generated resource output", async () => {
    const admin = authedStorage("admin-1", "admin");

    await assertFails(
      uploadBytes(
        ref(admin, "resources/output/job-2/attempt-2_worksheet.docx"),
        new Uint8Array([1, 2, 3])
      )
    );
  });
});
