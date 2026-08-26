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
  FIRESTORE_READINESS_CREATING_EXIT_CODE,
  canonicalizeLiveIndexState,
  classifyLiveIndexReadiness,
  captureLiveIndexState,
  compareIndexManifestsAllowingPolicy,
  expandSourceIndexManifest,
  probeLiveIndexReadiness,
  readinessProbeExitCode,
  verifyFreshIndexBootstrapBaseline,
  verifyIndexBootstrapResult,
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

function freshLiveState() {
  const live = liveState();
  live.indexes = [];
  live.fields = [live.fields[2]];
  return live;
}

function bootstrappedLiveState() {
  const live = liveState();
  live.fields = [live.fields[0], live.fields[2]];
  return live;
}

function snapshotFromLive(
  live,
  capturedAt = "2026-07-21T10:00:00.000Z"
) {
  return canonicalizeLiveIndexState(live, {
    projectId,
    databaseId,
    capturedAt,
  });
}

function freshSnapshot() {
  return snapshotFromLive(freshLiveState());
}

function bootstrappedSnapshot() {
  return snapshotFromLive(
    bootstrappedLiveState(),
    "2026-07-21T10:05:00.000Z"
  );
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

  // Mirrors the real production case (2026-08-23): a new `notifications`
  // index in source that cannot be live yet (pendingAdditions), and a
  // long-inert `attendance.termId` field override still live from before
  // firebase.json stopped declaring it (knownLiveExtras) — see
  // pending-index-deployment-exceptions.json and commit 799bda1.
  const pendingIndex = {
    collectionGroup: "notifications",
    queryScope: "COLLECTION",
    fields: [{ fieldPath: "recipientId", order: "ASCENDING" }],
  };
  const extraOverride = {
    collectionGroup: "attendance",
    fieldPath: "termId",
    indexes: [{ queryScope: "COLLECTION", order: "ASCENDING" }],
  };
  function policyFixture() {
    return {
      schemaVersion: 1,
      pendingAdditions: { indexes: [pendingIndex], fieldOverrides: [] },
      knownLiveExtras: { indexes: [], fieldOverrides: [extraOverride] },
    };
  }
  function sourceWithPendingIndex() {
    const source = sourceManifest();
    source.indexes.push(pendingIndex);
    return source;
  }
  function liveWithKnownExtraOverride() {
    const live = liveState();
    live.fields.splice(1, 0, {
      name: `${databaseName}/collectionGroups/attendance/fields/termId`,
      indexConfig: {
        usesAncestorConfig: false,
        reverting: false,
        indexes: [
          {
            queryScope: "COLLECTION",
            apiScope: "ANY_API",
            density: "SPARSE_ALL",
            fields: [{ fieldPath: "termId", order: "ASCENDING" }],
            state: "READY",
          },
        ],
      },
    });
    return live;
  }

  it("tolerates only the named pending addition and known extra, pre-deploy style", () => {
    const report = verifyLiveIndexSnapshot(
      snapshotFromLive(liveWithKnownExtraOverride()),
      sourceWithPendingIndex(),
      { policy: policyFixture(), allowPendingAdditions: true }
    );
    assert.equal(report.sourceEqual, true);
  });

  it("still rejects an unrelated diff the policy does not name", () => {
    // The exception is narrow: something else missing or extra must still
    // fail, even with the policy applied.
    const source = sourceWithPendingIndex();
    source.indexes.push({
      collectionGroup: "invoices",
      queryScope: "COLLECTION",
      fields: [{ fieldPath: "status", order: "ASCENDING" }],
    });
    assert.throws(
      () =>
        verifyLiveIndexSnapshot(
          snapshotFromLive(liveWithKnownExtraOverride()),
          source,
          { policy: policyFixture(), allowPendingAdditions: true }
        ),
      /Live Firestore indexes differ/
    );
  });

  it("requires a pending addition to actually be live for a post-deploy-style check", () => {
    // allowPendingAdditions defaults to false: this is the shape the
    // post-deploy verify step uses, so the run can only succeed once the
    // named index is truly live — the known extra is still tolerated either
    // way, since nothing this deploy runs ever removes it.
    assert.throws(
      () =>
        verifyLiveIndexSnapshot(
          snapshotFromLive(liveWithKnownExtraOverride()),
          sourceWithPendingIndex(),
          { policy: policyFixture() }
        ),
      /Live Firestore indexes differ/
    );

    const liveWithBoth = liveWithKnownExtraOverride();
    liveWithBoth.indexes.push({
      name: `${databaseName}/collectionGroups/notifications/indexes/CICAgOjXh4YL`,
      queryScope: "COLLECTION",
      apiScope: "ANY_API",
      density: "SPARSE_ALL",
      multikey: false,
      unique: false,
      fields: [
        { fieldPath: "recipientId", order: "ASCENDING" },
        { fieldPath: "__name__", order: "ASCENDING" },
      ],
      state: "READY",
    });
    const report = verifyLiveIndexSnapshot(
      snapshotFromLive(liveWithBoth),
      sourceWithPendingIndex(),
      { policy: policyFixture() }
    );
    assert.equal(report.sourceEqual, true);
  });

  it("accepts a post-deploy baseline transition explained by the pending addition", () => {
    // This is the actual verify_after_indexes shape: --baseline is the
    // pre-deploy capture (no notifications index yet), --snapshot is the
    // post-deploy capture (index now live). Passing means the ONLY change
    // between them was the reviewed pending addition.
    const beforeLive = liveWithKnownExtraOverride();
    const afterLive = liveWithKnownExtraOverride();
    afterLive.indexes.push({
      name: `${databaseName}/collectionGroups/notifications/indexes/CICAgOjXh4YL`,
      queryScope: "COLLECTION",
      apiScope: "ANY_API",
      density: "SPARSE_ALL",
      multikey: false,
      unique: false,
      fields: [
        { fieldPath: "recipientId", order: "ASCENDING" },
        { fieldPath: "__name__", order: "ASCENDING" },
      ],
      state: "READY",
    });
    const report = verifyLiveIndexSnapshot(
      snapshotFromLive(afterLive, "2026-08-23T06:10:00.000Z"),
      sourceWithPendingIndex(),
      {
        baseline: snapshotFromLive(beforeLive),
        policy: policyFixture(),
      }
    );
    assert.equal(report.baselineEqual, true);
  });

  it("still catches a resource silently replaced alongside a pending addition", () => {
    // The pending addition explains the notifications index appearing. It
    // must not also excuse the unrelated classes index getting a new
    // resource name with the same logical definition — that is exactly the
    // kind of silent replacement compositeResources identity is there to
    // catch, and it must survive the policy tolerance.
    const beforeLive = liveWithKnownExtraOverride();
    const afterLive = liveWithKnownExtraOverride();
    afterLive.indexes[0] = {
      ...afterLive.indexes[0],
      name: `${databaseName}/collectionGroups/classes/indexes/replacedResourceId`,
    };
    afterLive.indexes.push({
      name: `${databaseName}/collectionGroups/notifications/indexes/CICAgOjXh4YL`,
      queryScope: "COLLECTION",
      apiScope: "ANY_API",
      density: "SPARSE_ALL",
      multikey: false,
      unique: false,
      fields: [
        { fieldPath: "recipientId", order: "ASCENDING" },
        { fieldPath: "__name__", order: "ASCENDING" },
      ],
      state: "READY",
    });
    assert.throws(
      () =>
        verifyLiveIndexSnapshot(
          snapshotFromLive(afterLive, "2026-08-23T06:10:00.000Z"),
          sourceWithPendingIndex(),
          {
            baseline: snapshotFromLive(beforeLive),
            policy: policyFixture(),
          }
        ),
      /no-op baseline/
    );
  });

  it("treats a rerun after the addition is already live as a true no-op", () => {
    // A run can deploy the index successfully and then fail at a later step
    // (waiting for READY, uploading evidence). The retry's own
    // capture_before_indexes this time captures a baseline that ALREADY has
    // the addition — it must not be excused from only one side of that
    // comparison, or an unchanged rerun looks like drift and fails forever.
    const liveWithAddition = liveWithKnownExtraOverride();
    liveWithAddition.indexes.push({
      name: `${databaseName}/collectionGroups/notifications/indexes/CICAgOjXh4YL`,
      queryScope: "COLLECTION",
      apiScope: "ANY_API",
      density: "SPARSE_ALL",
      multikey: false,
      unique: false,
      fields: [
        { fieldPath: "recipientId", order: "ASCENDING" },
        { fieldPath: "__name__", order: "ASCENDING" },
      ],
      state: "READY",
    });
    const report = verifyLiveIndexSnapshot(
      snapshotFromLive(liveWithAddition, "2026-08-23T06:10:00.000Z"),
      sourceWithPendingIndex(),
      {
        baseline: snapshotFromLive(liveWithAddition),
        policy: policyFixture(),
        allowPendingAdditions: true,
      }
    );
    assert.equal(report.baselineEqual, true);
  });

  it("compareIndexManifestsAllowingPolicy filters only the policy-named entries", () => {
    const diff = compareIndexManifestsAllowingPolicy(
      expandSourceIndexManifest(sourceWithPendingIndex()),
      snapshotFromLive(liveWithKnownExtraOverride()).manifest,
      policyFixture(),
      { allowPendingAdditions: true }
    );
    assert.deepEqual(diff, {
      addedIndexes: [],
      removedIndexes: [],
      addedFieldOverrides: [],
      removedFieldOverrides: [],
    });
  });

  it("requires a fresh zero-managed and zero-TTL bootstrap baseline", () => {
    const report = verifyFreshIndexBootstrapBaseline(freshSnapshot(), {
      projectId,
      databaseId,
    });
    assert.equal(report.freshBaseline, true);
    assert.equal(report.compositeCount, 0);
    assert.equal(report.fieldOverrideCount, 0);
    assert.equal(report.externalTtlPolicyCount, 0);
    assert.equal(report.defaultFieldResourceCount, 1);

    const invalidBaselines = [
      {
        message: /zero composite indexes/,
        mutate(live) {
          live.indexes = liveState().indexes;
        },
      },
      {
        message: /zero field overrides/,
        mutate(live) {
          live.fields.unshift(liveState().fields[0]);
        },
      },
      {
        message: /zero TTL policies/,
        mutate(live) {
          live.fields.unshift(liveState().fields[1]);
        },
      },
    ];
    for (const { message, mutate } of invalidBaselines) {
      const live = freshLiveState();
      mutate(live);
      assert.throws(
        () =>
          verifyFreshIndexBootstrapBaseline(snapshotFromLive(live), {
            projectId,
            databaseId,
          }),
        message
      );
    }
  });

  it("verifies canonical bootstrap additions while preserving unmanaged state", () => {
    const report = verifyIndexBootstrapResult(
      freshSnapshot(),
      bootstrappedSnapshot(),
      sourceManifest(),
      { projectId, databaseId }
    );
    assert.equal(report.sourceEqual, true);
    assert.equal(report.databaseEqual, true);
    assert.equal(report.defaultFieldResourcesEqual, true);
    assert.equal(report.externalTtlPoliciesEqual, true);
    assert.equal(report.unmanagedStateEqual, true);
    assert.equal(report.compositeCount, 1);
    assert.equal(report.fieldOverrideCount, 1);
  });

  it("rejects database, default-field, or TTL drift during bootstrap", () => {
    const driftCases = [
      {
        message: /database metadata changed/,
        mutate(live) {
          live.database.locationId = "eur3";
        },
      },
      {
        message: /__default__ field resources changed/,
        mutate(live) {
          live.fields[1].indexConfig.indexes.push({
            queryScope: "COLLECTION_GROUP",
            fields: [{ fieldPath: "*", order: "ASCENDING" }],
            state: "READY",
          });
        },
      },
      {
        message: /External TTL policies changed/,
        mutate(live) {
          live.fields.push(liveState().fields[1]);
        },
      },
    ];
    for (const { message, mutate } of driftCases) {
      const live = bootstrappedLiveState();
      mutate(live);
      assert.throws(
        () =>
          verifyIndexBootstrapResult(
            freshSnapshot(),
            snapshotFromLive(live, "2026-07-21T10:05:00.000Z"),
            sourceManifest(),
            { projectId, databaseId }
          ),
        message
      );
    }
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

  it("classifies only exact CREATING index states as retryable", () => {
    const ready = classifyLiveIndexReadiness(liveState(), {
      projectId,
      databaseId,
      checkedAt: "2026-07-21T10:00:00.000Z",
    });
    assert.equal(ready.readiness, "READY");
    assert.equal(ready.retryable, false);
    assert.equal(ready.resourceCount, 4);
    assert.equal(readinessProbeExitCode(ready), 0);

    const creatingComposite = liveState();
    creatingComposite.indexes[0].state = "CREATING";
    const compositeReport = classifyLiveIndexReadiness(creatingComposite, {
      projectId,
      databaseId,
      checkedAt: "2026-07-21T10:01:00.000Z",
    });
    assert.equal(compositeReport.readiness, "CREATING");
    assert.equal(compositeReport.retryable, true);
    assert.equal(compositeReport.creatingCount, 1);
    assert.equal(
      readinessProbeExitCode(compositeReport),
      FIRESTORE_READINESS_CREATING_EXIT_CODE
    );

    const creatingField = liveState();
    creatingField.fields[0].indexConfig.indexes[1].state = "CREATING";
    const fieldReport = classifyLiveIndexReadiness(creatingField, {
      projectId,
      databaseId,
      checkedAt: "2026-07-21T10:02:00.000Z",
    });
    assert.equal(fieldReport.readiness, "CREATING");
    assert.equal(fieldReport.creatingCount, 1);
    assert.equal(readinessProbeExitCode(fieldReport), 10);
    assert.throws(
      () => readinessProbeExitCode({ readiness: "UNKNOWN" }),
      /Unsupported readiness result/
    );
  });

  it("classifies repair, unknown, reverting, and TTL states as terminal", () => {
    const terminalCases = [
      (live) => {
        live.fields[0].indexConfig.indexes[0].state = "NEEDS_REPAIR";
      },
      (live) => {
        live.indexes[0].state = "PAUSED";
      },
      (live) => {
        live.fields[0].indexConfig.reverting = true;
      },
      (live) => {
        live.fields[1].ttlConfig.state = "CREATING";
      },
      (live) => {
        live.indexes[0].state = "CREATING";
        live.fields[0].indexConfig.indexes[0].state = "NEEDS_REPAIR";
      },
    ];
    for (const mutate of terminalCases) {
      const live = liveState();
      mutate(live);
      const report = classifyLiveIndexReadiness(live, {
        projectId,
        databaseId,
        checkedAt: "2026-07-21T10:03:00.000Z",
      });
      assert.equal(report.readiness, "TERMINAL");
      assert.equal(report.retryable, false);
      assert.ok(report.terminalCount >= 1);
      assert.equal(readinessProbeExitCode(report), 1);
    }
  });

  it("returns a canonical snapshot only when a live readiness probe is READY", async () => {
    async function probe(live) {
      return probeLiveIndexReadiness({
        projectId,
        databaseId,
        checkedAt: "2026-07-21T10:04:00.000Z",
        requestJson: async (requestUrl) => {
          const url = new URL(requestUrl);
          if (
            url.pathname.endsWith(
              `/databases/${encodeURIComponent(databaseId)}`
            )
          ) {
            return live.database;
          }
          if (url.pathname.endsWith("/indexes")) {
            return { indexes: live.indexes };
          }
          if (url.pathname.endsWith("/fields")) {
            return { fields: live.fields };
          }
          throw new Error(`Unexpected URL: ${requestUrl}`);
        },
      });
    }

    const ready = await probe(liveState());
    assert.equal(ready.report.readiness, "READY");
    assert.equal(ready.snapshot.manifest.indexes.length, 1);
    assert.equal(ready.snapshot.capturedAt, ready.report.checkedAt);

    const creatingLive = liveState();
    creatingLive.indexes[0].state = "CREATING";
    const creating = await probe(creatingLive);
    assert.equal(creating.report.readiness, "CREATING");
    assert.equal(creating.snapshot, null);
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

  it("tolerates enhancedTextSearchQueryMode but stays closed to other new fields", async () => {
    // TP-15. Google began returning this field on 2026-08-26 and the strict key
    // check failed every index deploy. It is allowed through, deliberately
    // without asserting a value — see the comment on databaseResponseKeys.
    function capture(databasePatch) {
      const live = liveState();
      Object.assign(live.database, databasePatch);
      return captureLiveIndexState({
        projectId,
        databaseId,
        capturedAt: "2026-08-26T10:00:00.000Z",
        requestJson: async (requestUrl) => {
          const url = new URL(requestUrl);
          if (url.pathname.endsWith(`/databases/${encodeURIComponent(databaseId)}`)) {
            return live.database;
          }
          if (url.pathname.endsWith("/indexes")) return { indexes: live.indexes };
          return { fields: live.fields };
        },
      });
    }

    // Any value passes: the enum is undocumented, so none is pinned.
    for (const mode of [
      "ENHANCED_TEXT_SEARCH_QUERY_MODE_UNSPECIFIED",
      "ENHANCED_TEXT_SEARCH_QUERY_MODE_ENABLED",
      "something-google-has-not-published-yet",
    ]) {
      const snapshot = await capture({ enhancedTextSearchQueryMode: mode });
      // Preserved in the raw capture rather than discarded, so what production
      // reports stays on the record and can be pinned later if it matters. The
      // narrowed snapshot.database projection deliberately keeps only four
      // fields, so the value is asserted where it actually survives.
      assert.equal(snapshot.raw.database.enhancedTextSearchQueryMode, mode);
      assert.equal(snapshot.database.enhancedTextSearchQueryMode, undefined);
    }

    // The tripwire itself must still be armed: this is the half that matters.
    await assert.rejects(
      capture({ someFutureFieldGoogleAdds: "value" }),
      /Database response contains unsupported keys: someFutureFieldGoogleAdds/
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
          return url.searchParams.get("pageToken") === "next-field-page"
            ? { fields: live.fields }
            : { fields: [], nextPageToken: "next-field-page" };
        }
        throw new Error(`Unexpected URL: ${requestUrl}`);
      },
    });
    assert.equal(result.manifest.indexes.length, 1);
    assert.equal(calls.filter((url) => url.pathname.endsWith("/indexes")).length, 2);
    const fieldCalls = calls.filter((url) => url.pathname.endsWith("/fields"));
    assert.equal(fieldCalls.length, 2);
    assert.ok(
      fieldCalls.every(
        (url) =>
          url.searchParams.get("filter") ===
          "indexConfig.usesAncestorConfig:false OR ttlConfig:*"
      )
    );
    assert.ok(fieldCalls.every((url) => !url.searchParams.has("pageSize")));
    assert.equal(fieldCalls[1].searchParams.get("pageToken"), "next-field-page");
    assert.ok(
      calls
        .filter((url) => url.pathname.endsWith("/indexes"))
        .every((url) => !url.searchParams.has("pageSize"))
    );
  });

  it("accepts proto-JSON omission of false usesAncestorConfig", () => {
    const live = liveState();
    delete live.fields[0].indexConfig.usesAncestorConfig;
    delete live.fields[2].indexConfig.usesAncestorConfig;
    live.fields[2].indexConfig.indexes = [
      {
        queryScope: "COLLECTION",
        fields: [{ fieldPath: "*", order: "ASCENDING" }],
        state: "READY",
      },
      {
        queryScope: "COLLECTION",
        fields: [{ fieldPath: "*", order: "DESCENDING" }],
        state: "READY",
      },
      {
        queryScope: "COLLECTION",
        fields: [{ fieldPath: "*", arrayConfig: "CONTAINS" }],
        state: "READY",
      },
    ];

    const result = canonicalizeLiveIndexState(live, {
      projectId,
      databaseId,
    });

    assert.equal(result.manifest.fieldOverrides.length, 1);
    assert.equal(result.defaultFieldResources.length, 1);
    assert.equal(result.defaultFieldResources[0].usesAncestorConfig, false);
    assert.equal(result.defaultFieldResources[0].indexes.length, 3);
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

  it("supports bootstrap-before and bootstrap-after verification through the CLI", (context) => {
    const directory = mkdtempSync(join(tmpdir(), "tenacity-index-bootstrap-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const beforePath = join(directory, "before.json");
    const afterPath = join(directory, "after.json");
    const sourcePath = join(directory, "source.json");
    const beforeReportPath = join(directory, "before-report.json");
    const afterReportPath = join(directory, "after-report.json");
    writeFileSync(beforePath, JSON.stringify(freshSnapshot()), "utf8");
    writeFileSync(afterPath, JSON.stringify(bootstrappedSnapshot()), "utf8");
    writeFileSync(sourcePath, JSON.stringify(sourceManifest()), "utf8");

    const beforeResult = runCli([
      "verify-bootstrap-before",
      "--target",
      "production",
      "--project",
      projectId,
      "--database",
      databaseId,
      "--snapshot",
      beforePath,
      "--report",
      beforeReportPath,
    ]);
    assert.equal(beforeResult.status, 0, beforeResult.stderr);
    assert.equal(
      JSON.parse(readFileSync(beforeReportPath, "utf8")).freshBaseline,
      true
    );

    const afterResult = runCli([
      "verify-bootstrap-after",
      "--target",
      "production",
      "--project",
      projectId,
      "--database",
      databaseId,
      "--before",
      beforePath,
      "--snapshot",
      afterPath,
      "--source",
      sourcePath,
      "--report",
      afterReportPath,
    ]);
    assert.equal(afterResult.status, 0, afterResult.stderr);
    const afterReport = JSON.parse(readFileSync(afterReportPath, "utf8"));
    assert.equal(afterReport.sourceEqual, true);
    assert.equal(afterReport.unmanagedStateEqual, true);

    const invalidReportPath = join(directory, "invalid-report.json");
    const invalidResult = runCli([
      "verify-bootstrap-before",
      "--target",
      "production",
      "--project",
      projectId,
      "--database",
      databaseId,
      "--snapshot",
      afterPath,
      "--report",
      invalidReportPath,
    ]);
    assert.equal(invalidResult.status, 1);
    assert.match(invalidResult.stderr, /zero composite indexes/);
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

    const missingReadinessReport = runCli([
      "probe-readiness",
      "--target",
      "production",
      "--project",
      projectId,
      "--database",
      databaseId,
      "--snapshot",
      "/tmp/unused-ready-index-snapshot.json",
    ]);
    assert.equal(missingReadinessReport.status, 1);
    assert.match(missingReadinessReport.stderr, /--report is required/);
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
