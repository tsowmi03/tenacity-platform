import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  compareIndexManifests,
  validateDeploymentManifests,
  validateDeploymentTargets,
  validateFirebaseConfiguration,
  validateIndexManifest,
  validateSourceBaseline,
} from "../validate-firebase-config.mjs";

describe("Firebase configuration validation", () => {
  it("accepts the reviewed Firebase source and target policy", () => {
    const report = validateFirebaseConfiguration();
    assert.equal(report.projectId, "tenacity-tutoring-b8eb2");
    assert.equal(
      report.productionStorageBucket,
      "tenacity-tutoring-b8eb2.firebasestorage.app"
    );
    assert.equal(report.productionDatabaseId, "(default)");
    assert.equal(report.stagingProjectId, "tenacity-tutoring-staging");
    assert.equal(
      report.stagingStorageBucket,
      "tenacity-tutoring-staging.firebasestorage.app"
    );
    assert.equal(report.stagingDatabaseId, "(default)");
    assert.equal(report.hostingTarget, "admin-portal");
    assert.equal(report.storageTarget, "primary");
    assert.equal(report.compositeCount, 27);
    assert.equal(report.fieldOverrideCount, 1);
  });

  it("rejects duplicate composite indexes", () => {
    const index = {
      collectionGroup: "classes",
      queryScope: "COLLECTION",
      fields: [{ fieldPath: "day", order: "ASCENDING" }],
    };
    assert.throws(
      () => validateIndexManifest({ indexes: [index, index], fieldOverrides: [] }),
      /duplicate definitions/
    );
  });

  it("rejects fields with ambiguous index modes", () => {
    assert.throws(
      () =>
        validateIndexManifest({
          indexes: [
            {
              collectionGroup: "classes",
              queryScope: "COLLECTION",
              fields: [
                { fieldPath: "day", order: "ASCENDING", arrayConfig: "CONTAINS" },
              ],
            },
          ],
          fieldOverrides: [],
        }),
      /unsupported keys|exactly one index mode/
    );
  });

  it("rejects duplicate field overrides", () => {
    const override = {
      collectionGroup: "attendance",
      fieldPath: "date",
      indexes: [{ order: "ASCENDING", queryScope: "COLLECTION" }],
    };
    assert.throws(
      () => validateIndexManifest({ indexes: [], fieldOverrides: [override, override] }),
      /duplicate field overrides/
    );
  });

  it("accepts an explicit empty field override that disables indexing", () => {
    assert.deepEqual(
      validateIndexManifest({
        indexes: [],
        fieldOverrides: [
          {
            collectionGroup: "resourceJobs",
            fieldPath: "largePayload",
            indexes: [],
          },
        ],
      }),
      { compositeCount: 0, fieldOverrideCount: 1 }
    );
  });

  it("reports a same-count index replacement as an addition and removal", () => {
    const base = {
      indexes: [
        {
          collectionGroup: "classes",
          queryScope: "COLLECTION",
          fields: [{ fieldPath: "day", order: "ASCENDING" }],
        },
      ],
      fieldOverrides: [],
    };
    const current = structuredClone(base);
    current.indexes[0].fields[0].order = "DESCENDING";
    const diff = compareIndexManifests(base, current);
    assert.equal(diff.addedIndexes.length, 1);
    assert.equal(diff.removedIndexes.length, 1);
  });

  it("rejects unsupported index values", () => {
    assert.throws(
      () =>
        validateIndexManifest({
          indexes: [
            {
              collectionGroup: "classes",
              queryScope: "EVERYWHERE",
              fields: [{ fieldPath: "day", order: "SIDEWAYS" }],
            },
          ],
          fieldOverrides: [],
        }),
      /unsupported queryScope/
    );
  });

  it("rejects a partial source-hash baseline", () => {
    assert.throws(
      () =>
        validateSourceBaseline({
          schemaVersion: 1,
          sha256: {},
          firestoreIndexes: { compositeCount: 27, fieldOverrideCount: 1 },
        }),
      /exactly the four reviewed source paths/
    );
  });

  it("rejects deployment-affecting root manifest drift", () => {
    const firebase = JSON.parse(readFileSync("firebase.json", "utf8"));
    const aliases = JSON.parse(readFileSync(".firebaserc", "utf8"));
    const mobile = JSON.parse(readFileSync("apps/mobile/firebase.json", "utf8"));
    const changed = structuredClone(firebase);
    changed.functions[0].runtime = "nodejs18";
    changed.functions[0].ignore.push("lib/**");
    changed.firestore.database = "other";
    assert.throws(
      () => validateDeploymentManifests(changed, aliases, mobile),
      /reviewed deployment manifest/
    );
  });

  it("rejects a production Storage deploy target that points at another bucket", () => {
    const firebase = JSON.parse(readFileSync("firebase.json", "utf8"));
    const aliases = JSON.parse(readFileSync(".firebaserc", "utf8"));
    const mobile = JSON.parse(readFileSync("apps/mobile/firebase.json", "utf8"));
    const changed = structuredClone(aliases);
    changed.targets["tenacity-tutoring-b8eb2"].storage.primary = [
      "wrong.firebasestorage.app",
    ];
    assert.throws(
      () => validateDeploymentManifests(firebase, changed, mobile),
      /reviewed project and target mapping/
    );
  });

  it("rejects a staging Storage deploy target that points at another bucket", () => {
    const firebase = JSON.parse(readFileSync("firebase.json", "utf8"));
    const aliases = JSON.parse(readFileSync(".firebaserc", "utf8"));
    const mobile = JSON.parse(readFileSync("apps/mobile/firebase.json", "utf8"));
    const changed = structuredClone(aliases);
    changed.targets["tenacity-tutoring-staging"].storage.primary = [
      "wrong.firebasestorage.app",
    ];
    assert.throws(
      () => validateDeploymentManifests(firebase, changed, mobile),
      /reviewed project and target mapping/
    );
  });

  it("rejects staging alias drift and an unintended staging Hosting target", () => {
    const firebase = JSON.parse(readFileSync("firebase.json", "utf8"));
    const aliases = JSON.parse(readFileSync(".firebaserc", "utf8"));
    const mobile = JSON.parse(readFileSync("apps/mobile/firebase.json", "utf8"));
    const missingAlias = structuredClone(aliases);
    delete missingAlias.projects.staging;
    assert.throws(
      () => validateDeploymentManifests(firebase, missingAlias, mobile),
      /reviewed project and target mapping/
    );

    const wrongAlias = structuredClone(aliases);
    wrongAlias.projects.staging = "another-staging-project";
    assert.throws(
      () => validateDeploymentManifests(firebase, wrongAlias, mobile),
      /reviewed project and target mapping/
    );

    const addedHosting = structuredClone(aliases);
    addedHosting.targets["tenacity-tutoring-staging"].hosting = {
      "admin-portal": ["tenacity-tutoring-staging"],
    };
    assert.throws(
      () => validateDeploymentManifests(firebase, addedHosting, mobile),
      /reviewed project and target mapping/
    );
  });

  it("requires the exact production and staging deployment target policy", () => {
    const production = {
      projectId: "tenacity-tutoring-b8eb2",
      storageBucket: "tenacity-tutoring-b8eb2.firebasestorage.app",
      databaseId: "(default)",
    };
    const staging = {
      projectId: "tenacity-tutoring-staging",
      storageBucket: "tenacity-tutoring-staging.firebasestorage.app",
      databaseId: "(default)",
    };
    assert.deepEqual(validateDeploymentTargets({ production, staging }), {
      production,
      staging,
    });
    assert.throws(
      () =>
        validateDeploymentTargets({
          production: { ...production, storageBucket: "wrong.firebasestorage.app" },
          staging,
        }),
      /reviewed Firebase deployment policy/
    );
    assert.throws(
      () => validateDeploymentTargets({ production }),
      /reviewed Firebase deployment policy/
    );
    for (const changedStaging of [
      { ...staging, projectId: "another-staging-project" },
      { ...staging, storageBucket: "another-staging-project.firebasestorage.app" },
      { ...staging, databaseId: "other" },
    ]) {
      assert.throws(
        () => validateDeploymentTargets({ production, staging: changedStaging }),
        /reviewed Firebase deployment policy/
      );
    }
  });

  it("rejects production identity reuse by staging", () => {
    const production = {
      projectId: "tenacity-tutoring-b8eb2",
      storageBucket: "tenacity-tutoring-b8eb2.firebasestorage.app",
      databaseId: "(default)",
    };
    const staging = {
      projectId: "tenacity-tutoring-staging",
      storageBucket: "tenacity-tutoring-staging.firebasestorage.app",
      databaseId: "(default)",
    };
    assert.throws(
      () =>
        validateDeploymentTargets({
          production,
          staging: { ...staging, projectId: production.projectId },
        }),
      /different project and Storage bucket/
    );
    assert.throws(
      () =>
        validateDeploymentTargets({
          production,
          staging: { ...staging, storageBucket: production.storageBucket },
        }),
      /different project and Storage bucket/
    );
  });

  it("rejects duplicate fields and unknown index keys", () => {
    const index = {
      collectionGroup: "classes",
      queryScope: "COLLECTION",
      fields: [
        { fieldPath: "day", order: "ASCENDING" },
        { fieldPath: "day", order: "DESCENDING" },
      ],
    };
    assert.throws(
      () => validateIndexManifest({ indexes: [index], fieldOverrides: [] }),
      /duplicate field paths/
    );
    index.unexpected = true;
    assert.throws(
      () => validateIndexManifest({ indexes: [index], fieldOverrides: [] }),
      /unsupported keys/
    );
  });

  it("canonicalizes object keys and field-override index order", () => {
    const base = {
      indexes: [
        {
          collectionGroup: "classes",
          queryScope: "COLLECTION",
          fields: [
            { fieldPath: "day", order: "ASCENDING" },
            { fieldPath: "time", order: "DESCENDING" },
          ],
        },
      ],
      fieldOverrides: [
        {
          collectionGroup: "attendance",
          fieldPath: "date",
          indexes: [
            { order: "ASCENDING", queryScope: "COLLECTION" },
            { order: "DESCENDING", queryScope: "COLLECTION_GROUP" },
          ],
        },
      ],
    };
    const reordered = {
      fieldOverrides: [
        {
          indexes: [...base.fieldOverrides[0].indexes].reverse().map((index) => ({
            queryScope: index.queryScope,
            order: index.order,
          })),
          fieldPath: "date",
          collectionGroup: "attendance",
        },
      ],
      indexes: [
        {
          fields: base.indexes[0].fields.map((field) => ({
            order: field.order,
            fieldPath: field.fieldPath,
          })),
          queryScope: "COLLECTION",
          collectionGroup: "classes",
        },
      ],
    };
    const diff = compareIndexManifests(base, reordered);
    assert.deepEqual(diff, {
      addedIndexes: [],
      removedIndexes: [],
      addedFieldOverrides: [],
      removedFieldOverrides: [],
    });
    assert.throws(
      () =>
        validateIndexManifest({
          indexes: [base.indexes[0], reordered.indexes[0]],
          fieldOverrides: [],
        }),
      /duplicate definitions/
    );
  });
});
