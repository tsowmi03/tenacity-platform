import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

import {
  canonicalizeLiveIndexState,
  captureLiveIndexState,
  expandSourceIndexManifest,
  verifyLiveIndexSnapshot,
  writeNewJsonExclusive,
} from "../../firebase/firestore-index-state.mjs";

const projectId = "tenacity-tutoring-b8eb2";
const databaseId = "(default)";
const databaseName = `projects/${projectId}/databases/${databaseId}`;
const repositoryRoot = resolve(".");
const scriptPath = resolve("scripts/firebase/firestore-index-state.mjs");

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function sourceManifest() {
  return {
    indexes: [
      {
        collectionGroup: "classes",
        queryScope: "COLLECTION",
        fields: [
          { fieldPath: "day", order: "ASCENDING" },
          { fieldPath: "startTime", order: "DESCENDING" },
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
}

function liveState() {
  return {
    database: {
      name: databaseName,
      type: "FIRESTORE_NATIVE",
      databaseEdition: "STANDARD",
      locationId: "nam5",
    },
    indexes: [
      {
        name: `${databaseName}/collectionGroups/classes/indexes/CICAgOjXh4YK`,
        queryScope: "COLLECTION",
        apiScope: "ANY_API",
        density: "SPARSE_ALL",
        multikey: false,
        unique: false,
        fields: [
          { fieldPath: "day", order: "ASCENDING" },
          { fieldPath: "startTime", order: "DESCENDING" },
          { fieldPath: "__name__", order: "DESCENDING" },
        ],
        state: "READY",
      },
    ],
    fields: [
      {
        name: `${databaseName}/collectionGroups/attendance/fields/date`,
        indexConfig: {
          usesAncestorConfig: false,
          reverting: false,
          indexes: [
            {
              queryScope: "COLLECTION",
              apiScope: "ANY_API",
              density: "SPARSE_ALL",
              fields: [{ fieldPath: "date", order: "ASCENDING" }],
              state: "READY",
            },
            {
              queryScope: "COLLECTION_GROUP",
              apiScope: "ANY_API",
              density: "SPARSE_ALL",
              fields: [{ fieldPath: "date", order: "DESCENDING" }],
              state: "READY",
            },
          ],
        },
      },
      {
        name: `${databaseName}/collectionGroups/sessions/fields/expiresAt`,
        indexConfig: {
          usesAncestorConfig: true,
          reverting: false,
          indexes: [],
        },
        ttlConfig: { state: "ACTIVE" },
      },
      {
        name: `${databaseName}/collectionGroups/__default__/fields/%2A`,
        indexConfig: {
          usesAncestorConfig: false,
          reverting: false,
          indexes: [],
        },
      },
    ],
  };
}

function snapshot() {
  return canonicalizeLiveIndexState(liveState(), {
    projectId,
    databaseId,
    capturedAt: "2026-07-21T10:00:00.000Z",
  });
}

describe("Firestore live index controls", () => {
  it("expands the source with Firestore's implicit __name__ suffix", () => {
    const expanded = expandSourceIndexManifest(sourceManifest());
    assert.deepEqual(expanded.indexes[0].fields.at(-1), {
      fieldPath: "__name__",
      order: "DESCENDING",
    });
  });

  it("preserves an explicit non-default __name__ direction", () => {
    const source = sourceManifest();
    source.indexes[0].fields.push({
      fieldPath: "__name__",
      order: "ASCENDING",
    });
    const expanded = expandSourceIndexManifest(source);
    assert.deepEqual(expanded.indexes[0].fields.at(-1), {
      fieldPath: "__name__",
      order: "ASCENDING",
    });
    assert.equal(expanded.indexes[0].fields.length, 3);
  });

  it("normalizes Standard defaults and separates TTL-only fields", () => {
    const result = snapshot();
    assert.equal(result.manifest.indexes.length, 1);
    assert.equal(result.manifest.fieldOverrides.length, 1);
    assert.equal(result.externalTtlPolicies.length, 1);
    assert.equal(result.defaultFieldResources.length, 1);
    assert.equal(
      result.defaultFieldResources[0].name,
      `${databaseName}/collectionGroups/__default__/fields/%2A`
    );
    assert.deepEqual(result.manifest.indexes[0].fields.at(-1), {
      fieldPath: "__name__",
      order: "DESCENDING",
    });
    assert.equal(result.compositeResources[0].state, "READY");
  });

  it("accepts an exact source-to-live match", () => {
    const report = verifyLiveIndexSnapshot(snapshot(), sourceManifest());
    assert.equal(report.sourceEqual, true);
    assert.equal(report.baselineEqual, null);
    assert.equal(report.compositeCount, 1);
    assert.equal(report.fieldOverrideCount, 1);
    assert.equal(report.defaultFieldResourceCount, 1);
    assert.equal(report.externalTtlPolicyCount, 1);
  });

  it("rejects a same-count source replacement", () => {
    const source = sourceManifest();
    source.indexes[0].fields[0].order = "DESCENDING";
    assert.throws(
      () => verifyLiveIndexSnapshot(snapshot(), source),
      /differ from the reviewed source/
    );
  });

  it("rejects removal of one field-override mode", () => {
    const source = sourceManifest();
    source.fieldOverrides[0].indexes.pop();
    assert.throws(
      () => verifyLiveIndexSnapshot(snapshot(), source),
      /differ from the reviewed source/
    );
  });

  it("rejects a resource replacement even when definitions are unchanged", () => {
    const before = snapshot();
    const replaced = liveState();
    replaced.indexes[0].name =
      `${databaseName}/collectionGroups/classes/indexes/replacement`;
    const after = canonicalizeLiveIndexState(replaced, {
      projectId,
      databaseId,
      capturedAt: "2026-07-21T10:05:00.000Z",
    });
    assert.throws(
      () =>
        verifyLiveIndexSnapshot(after, sourceManifest(), { baseline: before }),
      /resources changed from the captured no-op baseline/
    );
  });

  it("ignores capture time when comparing a no-op baseline", () => {
    const before = snapshot();
    const after = structuredClone(before);
    after.capturedAt = "2026-07-21T10:05:00.000Z";
    const report = verifyLiveIndexSnapshot(after, sourceManifest(), {
      baseline: before,
    });
    assert.equal(report.baselineEqual, true);
  });

  it("rejects indexes and field modes that are not READY", () => {
    const creatingIndex = liveState();
    creatingIndex.indexes[0].state = "CREATING";
    assert.throws(
      () =>
        canonicalizeLiveIndexState(creatingIndex, {
          projectId,
          databaseId,
        }),
      /not READY/
    );

    const repairingField = liveState();
    repairingField.fields[0].indexConfig.indexes[0].state = "NEEDS_REPAIR";
    assert.throws(
      () =>
        canonicalizeLiveIndexState(repairingField, {
          projectId,
          databaseId,
        }),
      /not READY/
    );
  });

  it("rejects resources from another project", () => {
    const live = liveState();
    live.indexes[0].name = live.indexes[0].name.replace(
      projectId,
      "other-project"
    );
    assert.throws(
      () => canonicalizeLiveIndexState(live, { projectId, databaseId }),
      /outside projects\/tenacity-tutoring-b8eb2/
    );
  });

  it("pages raw Admin API responses before canonicalization", async () => {
    const live = liveState();
    const calls = [];
    const result = await captureLiveIndexState({
      projectId,
      databaseId,
      capturedAt: "2026-07-21T10:00:00.000Z",
      requestJson: async (requestUrl) => {
        const url = new URL(requestUrl);
        calls.push(url);
        if (url.pathname.endsWith(`/databases/${encodeURIComponent(databaseId)}`)) {
          return live.database;
        }
        if (url.pathname.endsWith("/indexes")) {
          return url.searchParams.get("pageToken") === "next-index-page"
            ? { indexes: live.indexes }
            : { indexes: [], nextPageToken: "next-index-page" };
        }
        if (url.pathname.endsWith("/fields")) {
          return { fields: live.fields };
        }
        throw new Error(`Unexpected URL: ${requestUrl}`);
      },
    });
    assert.equal(result.manifest.indexes.length, 1);
    assert.equal(calls.filter((url) => url.pathname.endsWith("/indexes")).length, 2);
    assert.equal(
      calls.find((url) => url.pathname.endsWith("/fields")).searchParams.get(
        "filter"
      ),
      "indexConfig.usesAncestorConfig:false OR ttlConfig:*"
    );
  });

  it("rejects repeated pagination tokens and unreviewed list response keys", async () => {
    const live = liveState();
    await assert.rejects(
      captureLiveIndexState({
        projectId,
        databaseId,
        requestJson: async (requestUrl) => {
          const url = new URL(requestUrl);
          if (url.pathname.endsWith(`/databases/${encodeURIComponent(databaseId)}`)) {
            return live.database;
          }
          if (url.pathname.endsWith("/indexes")) {
            return { indexes: [], nextPageToken: "repeated" };
          }
          return { fields: live.fields };
        },
      }),
      /repeated a pagination token/
    );

    await assert.rejects(
      captureLiveIndexState({
        projectId,
        databaseId,
        requestJson: async (requestUrl) => {
          const url = new URL(requestUrl);
          if (url.pathname.endsWith(`/databases/${encodeURIComponent(databaseId)}`)) {
            return live.database;
          }
          if (url.pathname.endsWith("/indexes")) {
            return { indexes: live.indexes, unreviewed: true };
          }
          return { fields: live.fields };
        },
      }),
      /indexes response contains unsupported keys: unreviewed/
    );
  });

  it("enforces reviewed response keys and exact Standard index types", () => {
    const mutations = [
      (live) => {
        live.database.unreviewed = true;
      },
      (live) => {
        live.indexes[0].unreviewed = true;
      },
      (live) => {
        live.indexes[0].fields[0].unreviewed = true;
      },
      (live) => {
        live.fields[0].unreviewed = true;
      },
      (live) => {
        live.fields[0].indexConfig.unreviewed = true;
      },
      (live) => {
        live.fields[1].ttlConfig.unreviewed = true;
      },
    ];
    for (const mutate of mutations) {
      const live = liveState();
      mutate(live);
      assert.throws(
        () => canonicalizeLiveIndexState(live, { projectId, databaseId }),
        /contains unsupported keys: unreviewed/
      );
    }

    const stringShardCount = liveState();
    stringShardCount.indexes[0].shardCount = "0";
    assert.throws(
      () =>
        canonicalizeLiveIndexState(stringShardCount, {
          projectId,
          databaseId,
        }),
      /unexpectedly configures shardCount/
    );

    const searchIndex = liveState();
    searchIndex.indexes[0].fields[0].searchConfig = {};
    assert.throws(
      () => canonicalizeLiveIndexState(searchIndex, { projectId, databaseId }),
      /uses searchConfig/
    );
  });

  it("retains inherited __default__ configuration in no-op baselines", () => {
    const before = snapshot();
    const changed = liveState();
    changed.fields[2].indexConfig.indexes.push({
      queryScope: "COLLECTION_GROUP",
      apiScope: "ANY_API",
      density: "SPARSE_ALL",
      fields: [{ fieldPath: "*", order: "ASCENDING" }],
      state: "READY",
    });
    const after = canonicalizeLiveIndexState(changed, {
      projectId,
      databaseId,
      capturedAt: "2026-07-21T10:05:00.000Z",
    });
    assert.equal(after.defaultFieldResources[0].indexes.length, 1);
    assert.throws(
      () =>
        verifyLiveIndexSnapshot(after, sourceManifest(), {
          baseline: before,
          projectId,
          databaseId,
        }),
      /resources changed from the captured no-op baseline/
    );
  });

  it("rejects a self-consistent snapshot for a different project", () => {
    const otherProjectId = "other-project";
    const otherLive = JSON.parse(
      JSON.stringify(liveState()).replaceAll(projectId, otherProjectId)
    );
    const otherSnapshot = canonicalizeLiveIndexState(otherLive, {
      projectId: otherProjectId,
      databaseId,
      capturedAt: "2026-07-21T10:00:00.000Z",
    });
    assert.throws(
      () =>
        verifyLiveIndexSnapshot(otherSnapshot, sourceManifest(), {
          projectId,
          databaseId,
        }),
      /belongs to a different Firebase project/
    );
  });

  it("creates private JSON outputs atomically and never overwrites them", (context) => {
    const directory = mkdtempSync(join(tmpdir(), "tenacity-index-output-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const output = join(directory, "snapshot.json");
    assert.equal(writeNewJsonExclusive(output, { state: "before" }), output);
    assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), {
      state: "before",
    });
    assert.equal(statSync(output).mode & 0o077, 0);
    assert.throws(
      () => writeNewJsonExclusive(output, { state: "after" }),
      /Output already exists/
    );
    assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), {
      state: "before",
    });
  });

  it("rejects duplicate, unknown, and missing CLI flags before provider access", () => {
    const base = [
      "capture",
      "--target",
      "production",
      "--project",
      projectId,
      "--database",
      databaseId,
      "--output",
      "/tmp/unused-index-snapshot.json",
    ];
    const duplicate = runCli([
      ...base.slice(0, 3),
      "--target",
      "production",
      ...base.slice(3),
    ]);
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /--target may be provided only once/);

    const unknown = runCli([...base, "--unknown", "value"]);
    assert.notEqual(unknown.status, 0);
    assert.match(unknown.stderr, /Unknown argument: --unknown/);

    const missing = runCli([
      "capture",
      "--target",
      "production",
      "--project",
      projectId,
      "--output",
      "/tmp/unused-index-snapshot.json",
    ]);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /--database is required/);
    assert.doesNotMatch(
      `${duplicate.stderr}${unknown.stderr}${missing.stderr}`,
      /GOOGLE_APPLICATION_CREDENTIALS/
    );
  });

  it("binds CLI project and database flags to the reviewed target policy", () => {
    const wrongProject = runCli([
      "capture",
      "--target",
      "production",
      "--project",
      "different-project",
      "--database",
      databaseId,
      "--output",
      "/tmp/unused-index-snapshot.json",
    ]);
    assert.notEqual(wrongProject.status, 0);
    assert.match(
      wrongProject.stderr,
      /does not match the reviewed deployment policy/
    );

    const wrongDatabase = runCli([
      "verify",
      "--target",
      "production",
      "--project",
      projectId,
      "--database",
      "different-database",
      "--snapshot",
      "/tmp/unused-index-snapshot.json",
      "--source",
      "backend/firebase/firestore.indexes.json",
    ]);
    assert.notEqual(wrongDatabase.status, 0);
    assert.match(
      wrongDatabase.stderr,
      /does not match the reviewed deployment policy/
    );
  });

  it("rejects CLI path collisions and sanitizes JSON parse failures", (context) => {
    const collision = runCli([
      "verify",
      "--target",
      "production",
      "--project",
      projectId,
      "--database",
      databaseId,
      "--snapshot",
      "/tmp/same-index-path.json",
      "--source",
      "/tmp/same-index-path.json",
    ]);
    assert.notEqual(collision.status, 0);
    assert.match(collision.stderr, /Source manifest collides with Snapshot/);

    const directory = mkdtempSync(join(tmpdir(), "tenacity-index-json-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const snapshotPath = join(directory, "snapshot.json");
    const sourcePath = join(directory, "source.json");
    const secret = "TOP-SECRET-JSON-CONTENT";
    writeFileSync(snapshotPath, `{"private_key":"${secret}"`, "utf8");
    writeFileSync(sourcePath, JSON.stringify(sourceManifest()), "utf8");
    const malformed = runCli([
      "verify",
      "--target",
      "production",
      "--project",
      projectId,
      "--database",
      databaseId,
      "--snapshot",
      snapshotPath,
      "--source",
      sourcePath,
    ]);
    assert.notEqual(malformed.status, 0);
    assert.match(malformed.stderr, /Could not read index snapshot/);
    assert.equal(malformed.stderr.includes(secret), false);
  });
});
