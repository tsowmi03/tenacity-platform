import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { assertStagingServesLocalRules } from "../../firebase/require-staging-rules.mjs";

const stagingTarget = {
  projectId: "tenacity-tutoring-staging",
  storageBucket: "tenacity-tutoring-staging.firebasestorage.app",
  databaseId: "(default)",
};
const configuration = {
  localSources: {
    firestore: { name: "firestore.rules", content: "firestore source" },
    storage: { name: "storage.rules", content: "storage source" },
  },
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function report({ surfaces = {}, ...overrides } = {}) {
  const entry = (content) => ({
    state: "in-sync",
    liveContentSha256: sha256(content),
    localContentSha256: sha256(content),
  });
  return {
    kind: "tenacity.firebase-rules-drift-report",
    schemaVersion: 1,
    target: "staging",
    projectId: stagingTarget.projectId,
    storageBucket: stagingTarget.storageBucket,
    checkedAt: "2026-09-24T00:00:00.000Z",
    inSync: true,
    driftedSurfaces: [],
    surfaces: {
      firestore: entry("firestore source"),
      storage: entry("storage source"),
      ...surfaces,
    },
    ...overrides,
  };
}

const check = (value) => assertStagingServesLocalRules(value, { configuration, stagingTarget });

describe("requiring staging to serve the rules being deployed", () => {
  it("passes when staging serves exactly the local rules", () => {
    assert.deepEqual(check(report()).surfaces, {
      firestore: sha256("firestore source"),
      storage: sha256("storage source"),
    });
  });

  // The case that let staging fall behind: staging in sync with an older
  // commit, and production about to get something newer.
  it("names each surface staging is not serving yet", () => {
    assert.throws(
      () =>
        check(
          report({
            surfaces: {
              storage: {
                state: "in-sync",
                liveContentSha256: sha256("older storage source"),
                localContentSha256: sha256("older storage source"),
              },
            },
          })
        ),
      (error) =>
        /Staging is not serving the rules being deployed: storage \(/.test(error.message) &&
        !/firestore \(/.test(error.message) &&
        /Run "Sync Firebase rules to staging" on main/.test(error.message)
    );
  });

  it("rejects a surface staging reported as drifted or never released", () => {
    for (const state of ["content-drift", "source-name-drift", "never-released"]) {
      assert.throws(
        () =>
          check(
            report({
              surfaces: {
                firestore: { state, liveContentSha256: sha256("firestore source") },
              },
            })
          ),
        /firestore \(/
      );
    }
  });

  it("rejects evidence from anywhere but the reviewed staging project", () => {
    assert.throws(
      () => check(report({ target: "production" })),
      /not captured from the reviewed staging project/
    );
    assert.throws(
      () => check(report({ projectId: "tenacity-tutoring-b8eb2" })),
      /not captured from the reviewed staging project/
    );
    assert.throws(
      () => check(report({ storageBucket: "other.firebasestorage.app" })),
      /not captured from the reviewed staging project/
    );
  });

  it("rejects something that is not a drift report", () => {
    assert.throws(() => check({}), /not a rules drift report/);
    assert.throws(() => check(report({ schemaVersion: 2 })), /not a rules drift report/);
  });

  it("checks against the real repository rules and staging target by default", () => {
    // Exercises the defaults: a report claiming other content must fail on
    // both surfaces against the files firebase.json actually points at.
    assert.throws(
      () =>
        assertStagingServesLocalRules(
          report({
            surfaces: {
              firestore: { state: "in-sync", liveContentSha256: sha256("x") },
              storage: { state: "in-sync", liveContentSha256: sha256("y") },
            },
          })
        ),
      /firestore \(.*storage \(/
    );
  });
});
