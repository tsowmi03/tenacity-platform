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
import { doc, setDoc } from "firebase/firestore";

const projectId = "demo-tenacity-rules-test";
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
    // An invoice PDF and the invoice that decides who may read it. The storage
    // rule reads the document across services, so the document has to be there.
    await uploadBytes(
      ref(storage, "invoices-pdfs/invoice-1.pdf"),
      new Uint8Array([37, 80, 68, 70])
    );
    await setDoc(doc(context.firestore(), "invoices/invoice-1"), {
      parentId: "parent-1",
      status: "unpaid",
    });
  });
}

describe("storage rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      storage: {
        host: "127.0.0.1",
        port: 9199,
        rules: readFileSync(
          new URL(
            "../../../backend/firebase/rules/storage.rules",
            import.meta.url
          ),
          "utf8"
        ),
      },
      // The invoice PDF rule reads the invoice document to decide who owns it,
      // so this suite needs Firestore running as well as Storage.
      firestore: {
        host: "127.0.0.1",
        port: 8080,
        rules: readFileSync(
          new URL(
            "../../../backend/firebase/rules/firestore.rules",
            import.meta.url
          ),
          "utf8"
        ),
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

  // Chat attachments (TP-21). These paths had no rule at all, so every photo
  // and file send fell through to the closing deny — which is what the uid
  // prefix exists to make checkable.
  it("lets a parent upload a chat image and file under their own uid", async () => {
    const parent = authedStorage("parent-1", "parent");

    await assertSucceeds(
      uploadBytes(
        ref(parent, "chatImages/parent-1/message-1.jpg"),
        new Uint8Array([1, 2, 3])
      )
    );
    await assertSucceeds(
      uploadBytes(
        ref(parent, "chatImages/parent-1/thumb_message-1.jpg"),
        new Uint8Array([1, 2, 3])
      )
    );
    await assertSucceeds(
      uploadBytes(
        ref(parent, "chatFiles/parent-1/message-2_notes.pdf"),
        new Uint8Array([1, 2, 3])
      )
    );
  });

  it("blocks a chat attachment written under somebody else's uid", async () => {
    const parent = authedStorage("parent-1", "parent");
    const tutor = authedStorage("tutor-1", "tutor");

    await assertFails(
      uploadBytes(
        ref(parent, "chatImages/tutor-1/message-3.jpg"),
        new Uint8Array([1, 2, 3])
      )
    );
    // Staff are not exempt: the rule is about who is writing, not their role.
    await assertFails(
      uploadBytes(
        ref(tutor, "chatFiles/parent-1/message-4_notes.pdf"),
        new Uint8Array([1, 2, 3])
      )
    );
  });

  it("blocks anonymous chat attachment reads and writes", async () => {
    const anonymous = anonStorage();

    await assertFails(
      uploadBytes(
        ref(anonymous, "chatImages/parent-1/message-5.jpg"),
        new Uint8Array([1, 2, 3])
      )
    );
    await assertFails(
      getBytes(ref(anonymous, "chatImages/parent-1/message-1.jpg"))
    );
  });

  it("lets a signed-in recipient read an attachment somebody else sent", async () => {
    const parent = authedStorage("parent-1", "parent");
    const tutor = authedStorage("tutor-1", "tutor");
    const path = "chatImages/parent-1/message-6.jpg";

    await assertSucceeds(uploadBytes(ref(parent, path), new Uint8Array([1])));
    await assertSucceeds(getBytes(ref(tutor, path)));
  });

  // Invoice PDFs (TP-21). These had no rule either, so every attempt to open
  // one — app or admin portal, both of which go through getDownloadURL() — was
  // denied from the moment the catch-all landed.
  it("lets the invoice's own parent read its PDF", async () => {
    const parent = authedStorage("parent-1", "parent");

    await assertSucceeds(getBytes(ref(parent, "invoices-pdfs/invoice-1.pdf")));
  });

  it("blocks a different parent from reading somebody's invoice PDF", async () => {
    const other = authedStorage("parent-2", "parent");
    const anonymous = anonStorage();

    await assertFails(getBytes(ref(other, "invoices-pdfs/invoice-1.pdf")));
    await assertFails(getBytes(ref(anonymous, "invoices-pdfs/invoice-1.pdf")));
  });

  it("lets staff read any invoice PDF", async () => {
    const admin = authedStorage("admin-1", "admin");
    const tutor = authedStorage("tutor-1", "tutor");

    await assertSucceeds(getBytes(ref(admin, "invoices-pdfs/invoice-1.pdf")));
    await assertSucceeds(getBytes(ref(tutor, "invoices-pdfs/invoice-1.pdf")));
  });

  it("blocks every client write to invoice PDFs", async () => {
    const admin = authedStorage("admin-1", "admin");
    const parent = authedStorage("parent-1", "parent");

    // Only the Functions put these here, through the Admin SDK, which does not
    // consult these rules — including the cleanup when an invoice is deleted.
    await assertFails(
      uploadBytes(ref(admin, "invoices-pdfs/invoice-2.pdf"), new Uint8Array([1]))
    );
    await assertFails(
      uploadBytes(ref(parent, "invoices-pdfs/invoice-1.pdf"), new Uint8Array([1]))
    );
  });

  // The released build writes these, and has to keep working until it is
  // retired. Delete this test with the legacy blocks in storage.rules.
  it("still accepts the released build's un-prefixed attachment paths", async () => {
    const parent = authedStorage("parent-1", "parent");
    const anonymous = anonStorage();

    await assertSucceeds(
      uploadBytes(ref(parent, "chatImages/1756700000000.jpg"), new Uint8Array([1]))
    );
    await assertSucceeds(
      uploadBytes(
        ref(parent, "chatFiles/1756700000000_notes.pdf"),
        new Uint8Array([1])
      )
    );
    await assertFails(
      uploadBytes(ref(anonymous, "chatImages/1756700000001.jpg"), new Uint8Array([1]))
    );
  });
});
