import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  RulesRollbackError,
  captureRulesSnapshot,
  createAtomicStatusRecorder,
  expectedReleaseName,
  expectedRulesRollbackConfirmation,
  loadRulesConfiguration,
  resolveRulesTargetInputs,
  rollbackRulesReleases,
  validateRulesSnapshot,
  verifyRulesSnapshotAgainstLocal,
} from "../../firebase/firebase-rules-state.mjs";

const projectId = "tenacity-tutoring-b8eb2";
const storageBucket = "tenacity-tutoring-b8eb2.firebasestorage.app";
const firestoreContent = readFileSync("backend/firebase/rules/firestore.rules", "utf8");
const storageContent = readFileSync("backend/firebase/rules/storage.rules", "utf8");
const configuredNames = {
  firestore: "backend/firebase/rules/firestore.rules",
  storage: "backend/firebase/rules/storage.rules",
};
const legacyNames = {
  firestore: "firestore.rules",
  storage: "storage.rules",
};

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (payload === null ? "" : JSON.stringify(payload)),
  };
}

function resourceNameFromUrl(url) {
  const pathname = new URL(url).pathname;
  assert(pathname.startsWith("/v1/"));
  return pathname
    .slice("/v1/".length)
    .split("/")
    .map(decodeURIComponent)
    .join("/");
}

function fixtureState({
  suffix,
  names = configuredNames,
  contents = { firestore: firestoreContent, storage: storageContent },
  fixtureProjectId = projectId,
  fixtureStorageBucket = storageBucket,
} = {}) {
  const releases = {};
  const rulesets = {};
  for (const [index, surface] of ["firestore", "storage"].entries()) {
    const service = surface === "firestore" ? "cloud.firestore" : "firebase.storage";
    const releaseName = expectedReleaseName(fixtureProjectId, surface, fixtureStorageBucket);
    const rulesetName = `projects/${fixtureProjectId}/rulesets/${suffix}-${surface}`;
    releases[releaseName] = {
      name: releaseName,
      rulesetName,
      createTime: "2026-07-20T00:00:00Z",
      updateTime: `2026-07-21T0${index}:00:0${suffix === "prior" ? 1 : 2}Z`,
    };
    rulesets[rulesetName] = {
      name: rulesetName,
      createTime: `2026-07-21T0${index}:00:00Z`,
      metadata: { services: [service] },
      source: {
        files: [
          {
            name: names[surface],
            content: contents[surface],
            fingerprint: Buffer.from(`${suffix}-${surface}`).toString("base64"),
          },
        ],
      },
    };
  }
  return { releases, rulesets };
}

function staticFetch(state, calls = []) {
  return async (url, init) => {
    const name = resourceNameFromUrl(url);
    calls.push({ name, init });
    assert.equal(init.method, "GET");
    if (state.releases[name]) return jsonResponse(state.releases[name]);
    if (state.rulesets[name]) return jsonResponse(state.rulesets[name]);
    return jsonResponse({ error: { message: `missing fixture ${name}` } }, 404);
  };
}

async function fixtureSnapshot(options) {
  const state = fixtureState(options);
  return captureRulesSnapshot({
    projectId: options.fixtureProjectId ?? projectId,
    storageBucket: options.fixtureStorageBucket ?? storageBucket,
    accessToken: "test-token",
    fetchImpl: staticFetch(state),
    now: () => Date.parse(options.suffix === "prior" ? "2026-07-21T02:00:00Z" : "2026-07-21T03:00:00Z"),
  });
}

function apiRuleset(ruleset) {
  return {
    name: ruleset.name,
    createTime: ruleset.createTime,
    metadata: structuredClone(ruleset.metadata),
    ...(ruleset.attachmentPoint === null ? {} : { attachmentPoint: ruleset.attachmentPoint }),
    source: {
      files: ruleset.source.files.map((file) => ({
        name: file.name,
        content: file.content,
        ...(file.fingerprint === null ? {} : { fingerprint: file.fingerprint }),
      })),
    },
  };
}

function rollbackFetch(
  priorSnapshot,
  currentSnapshot,
  {
    failPatchSurface = null,
    failFinalReadbackSurface = null,
    driftFinalReadbackSurface = null,
    mutate,
  } = {}
) {
  const calls = [];
  const patchedSurfaces = new Set();
  const liveReleases = new Map(
    ["firestore", "storage"].map((surface) => [
      currentSnapshot.releases[surface].release.name,
      structuredClone(currentSnapshot.releases[surface].release),
    ])
  );
  const rulesets = new Map();
  for (const snapshot of [priorSnapshot, currentSnapshot]) {
    for (const surface of ["firestore", "storage"]) {
      const ruleset = snapshot.releases[surface].ruleset;
      rulesets.set(ruleset.name, apiRuleset(ruleset));
    }
  }
  if (mutate) mutate({ liveReleases, rulesets });

  const fetchImpl = async (url, init) => {
    const name = resourceNameFromUrl(url);
    calls.push({ name, init, body: init.body ? JSON.parse(init.body) : null });
    if (init.method === "GET") {
      if (liveReleases.has(name)) {
        const surface = name.includes("firebase.storage/") ? "storage" : "firestore";
        const isFinalReadback = patchedSurfaces.size === 2;
        if (isFinalReadback && surface === failFinalReadbackSurface) {
          return jsonResponse({ error: { message: `${surface} readback failed` } }, 500);
        }
        const release = structuredClone(liveReleases.get(name));
        if (isFinalReadback && surface === driftFinalReadbackSurface) {
          release.rulesetName = currentSnapshot.releases[surface].release.rulesetName;
          release.updateTime = "2026-07-21T04:59:59Z";
        }
        return jsonResponse(release);
      }
      if (rulesets.has(name)) return jsonResponse(structuredClone(rulesets.get(name)));
      return jsonResponse({ error: { message: `missing ${name}` } }, 404);
    }
    assert.equal(init.method, "PATCH");
    assert.equal(init.body.includes("private_key"), false);
    const surface = name.includes("firebase.storage/") ? "storage" : "firestore";
    if (surface === failPatchSurface) {
      return jsonResponse({ error: { message: `${surface} patch failed` } }, 500);
    }
    const body = JSON.parse(init.body);
    assert.deepEqual(body, {
      release: {
        name,
        rulesetName: priorSnapshot.releases[surface].release.rulesetName,
      },
      updateMask: "rulesetName",
    });
    const updated = {
      ...liveReleases.get(name),
      rulesetName: body.release.rulesetName,
      updateTime: surface === "firestore" ? "2026-07-21T04:00:00Z" : "2026-07-21T04:01:00Z",
    };
    liveReleases.set(name, updated);
    patchedSurfaces.add(surface);
    return jsonResponse(structuredClone(updated));
  };
  return { fetchImpl, calls, liveReleases, rulesets };
}

describe("Firebase Rules release snapshots", () => {
  it("captures both release pointers and full immutable ruleset sources", async () => {
    const calls = [];
    const snapshot = await captureRulesSnapshot({
      projectId,
      storageBucket,
      accessToken: "test-token",
      fetchImpl: staticFetch(fixtureState({ suffix: "current" }), calls),
      now: () => Date.parse("2026-07-21T03:00:00Z"),
    });

    validateRulesSnapshot(snapshot, { projectId, storageBucket });
    assert.equal(snapshot.capturedAt, "2026-07-21T03:00:00.000Z");
    assert.match(snapshot.snapshotDigestSha256, /^[a-f0-9]{64}$/);
    assert.equal(
      snapshot.releases.storage.release.name,
      `projects/${projectId}/releases/firebase.storage/${storageBucket}`
    );
    assert.equal(snapshot.releases.firestore.ruleset.source.files[0].content, firestoreContent);
    assert.deepEqual(
      calls.map((call) => call.name),
      [
        `projects/${projectId}/releases/cloud.firestore`,
        `projects/${projectId}/rulesets/current-firestore`,
        `projects/${projectId}/releases/firebase.storage/${storageBucket}`,
        `projects/${projectId}/rulesets/current-storage`,
      ]
    );
    assert(calls.every((call) => call.init.headers.authorization === "Bearer test-token"));
  });

  it("canonicalizes an omitted provider fingerprint to null", async () => {
    const state = fixtureState({ suffix: "current" });
    delete state.rulesets[`projects/${projectId}/rulesets/current-storage`]
      .source.files[0].fingerprint;

    const snapshot = await captureRulesSnapshot({
      projectId,
      storageBucket,
      accessToken: "test-token",
      fetchImpl: staticFetch(state),
      now: () => Date.parse("2026-07-21T03:00:00Z"),
    });

    assert.equal(
      snapshot.releases.storage.ruleset.source.files[0].fingerprint,
      null
    );
    validateRulesSnapshot(snapshot, { projectId, storageBucket });
  });

  it("detects any snapshot mutation through the canonical digest", async () => {
    const snapshot = await fixtureSnapshot({ suffix: "current" });
    const tampered = structuredClone(snapshot);
    tampered.releases.firestore.ruleset.source.files[0].content += "\n// changed";
    assert.throws(() => validateRulesSnapshot(tampered), /snapshot digest mismatch/i);
  });

  it("verifies exact post-deploy names and content while allowing explicit pre-cutover name drift", async () => {
    const current = await fixtureSnapshot({ suffix: "current" });
    const exact = verifyRulesSnapshotAgainstLocal(current, { projectId, storageBucket });
    assert.equal(exact.surfaces.firestore.nameMatches, true);
    assert.equal(exact.surfaces.storage.nameMatches, true);

    const prior = await fixtureSnapshot({ suffix: "prior", names: legacyNames });
    assert.throws(
      () => verifyRulesSnapshotAgainstLocal(prior, { projectId, storageBucket }),
      /source name mismatch/
    );
    const compatible = verifyRulesSnapshotAgainstLocal(prior, {
      projectId,
      storageBucket,
      requireConfiguredSourceNames: false,
    });
    assert.equal(compatible.surfaces.firestore.capturedName, "firestore.rules");
    assert.equal(compatible.surfaces.firestore.nameMatches, false);
    assert.equal(compatible.surfaces.storage.capturedName, "storage.rules");
  });

  it("rejects byte-level source drift even when source-name drift is allowed", async () => {
    const snapshot = await fixtureSnapshot({
      suffix: "prior",
      names: legacyNames,
      contents: { firestore: `${firestoreContent}\n`, storage: storageContent },
    });
    assert.throws(
      () =>
        verifyRulesSnapshotAgainstLocal(snapshot, {
          projectId,
          storageBucket,
          requireConfiguredSourceNames: false,
        }),
      /source content differs/
    );
  });

  it("rejects project and Storage release mismatches", async () => {
    const snapshot = await fixtureSnapshot({ suffix: "current" });
    assert.throws(
      () => validateRulesSnapshot(snapshot, { projectId: "another-project", storageBucket }),
      /different Firebase project/
    );
    assert.throws(
      () => validateRulesSnapshot(snapshot, { projectId, storageBucket: "another.firebasestorage.app" }),
      /different Storage bucket/
    );
  });

  it("validates local rules sources for a staging snapshot without consulting .firebaserc", async () => {
    const stagingProjectId = "tenacity-tutoring-staging";
    const stagingStorageBucket = "tenacity-tutoring-staging.firebasestorage.app";
    const snapshot = await fixtureSnapshot({
      suffix: "current",
      fixtureProjectId: stagingProjectId,
      fixtureStorageBucket: stagingStorageBucket,
    });

    const result = verifyRulesSnapshotAgainstLocal(snapshot, {
      projectId: stagingProjectId,
      storageBucket: stagingStorageBucket,
    });

    assert.equal(result.projectId, stagingProjectId);
    assert.equal(result.storageBucket, stagingStorageBucket);
    assert.equal(result.surfaces.firestore.nameMatches, true);
  });

  it("does not expose invalid JSON content in local configuration errors", (context) => {
    const directory = mkdtempSync(join(tmpdir(), "tenacity-rules-config-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const secretMarker = "do-not-expose-this-value";
    writeFileSync(join(directory, "firebase.json"), `{"secret":"${secretMarker}"`, "utf8");

    assert.throws(
      () => loadRulesConfiguration(directory),
      (error) => {
        assert.match(error.message, /Could not read Firebase manifest/);
        assert.equal(error.message.includes(secretMarker), false);
        assert.equal(error.message.includes("JSON"), false);
        return true;
      }
    );
  });

  it("requires the local Storage rules source to use the primary deploy target", (context) => {
    const directory = mkdtempSync(join(tmpdir(), "tenacity-rules-storage-target-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    writeFileSync(join(directory, "firestore.rules"), firestoreContent);
    writeFileSync(join(directory, "storage.rules"), storageContent);
    writeFileSync(
      join(directory, "firebase.json"),
      JSON.stringify({
        firestore: { rules: "firestore.rules" },
        storage: [{ target: "wrong", rules: "storage.rules" }],
      })
    );

    assert.throws(
      () => loadRulesConfiguration(directory),
      /primary deploy target/
    );

    writeFileSync(
      join(directory, "firebase.json"),
      JSON.stringify({
        firestore: { rules: "firestore.rules" },
        storage: [{ target: "primary", rules: "storage.rules" }],
      })
    );
    assert.equal(
      loadRulesConfiguration(directory).localSources.storage.content,
      storageContent
    );
  });
});

describe("Firebase Rules reviewed targets", () => {
  it("requires a named target and exact reviewed project and bucket", (context) => {
    assert.deepEqual(
      resolveRulesTargetInputs([
        "--target",
        "production",
        "--project",
        projectId,
        "--storage-bucket",
        storageBucket,
      ]),
      { targetName: "production", projectId, storageBucket }
    );

    const directory = mkdtempSync(join(tmpdir(), "tenacity-rules-targets-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const targetsPath = join(directory, "deployment-targets.json");
    const stagingProjectId = "tenacity-tutoring-staging";
    const stagingStorageBucket = "tenacity-tutoring-staging.firebasestorage.app";
    writeFileSync(
      targetsPath,
      `${JSON.stringify(
        {
          production: { projectId, storageBucket, databaseId: "(default)" },
          staging: {
            projectId: stagingProjectId,
            storageBucket: stagingStorageBucket,
            databaseId: "(default)",
          },
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    assert.deepEqual(
      resolveRulesTargetInputs(
        [
          "--target",
          "staging",
          "--project",
          stagingProjectId,
          "--storage-bucket",
          stagingStorageBucket,
        ],
        { targetsPath }
      ),
      {
        targetName: "staging",
        projectId: stagingProjectId,
        storageBucket: stagingStorageBucket,
      }
    );
    assert.throws(
      () =>
        resolveRulesTargetInputs(
          ["--project", projectId, "--storage-bucket", storageBucket],
          { targetsPath }
        ),
      /Provide --target/
    );
    assert.throws(
      () =>
        resolveRulesTargetInputs(
          [
            "--target",
            "production",
            "--project",
            stagingProjectId,
            "--storage-bucket",
            stagingStorageBucket,
          ],
          { targetsPath }
        ),
      /do not match the reviewed deployment policy/
    );
  });
});

describe("Firebase Rules rollback", () => {
  it("performs a read-only preflight and binds confirmation to both snapshots", async () => {
    const prior = await fixtureSnapshot({ suffix: "prior", names: legacyNames });
    const current = await fixtureSnapshot({ suffix: "current" });
    const api = rollbackFetch(prior, current);
    const result = await rollbackRulesReleases({
      priorSnapshot: prior,
      currentSnapshot: current,
      projectId,
      storageBucket,
      accessToken: "test-token",
      fetchImpl: api.fetchImpl,
    });

    assert.equal(result.applied, false);
    assert.equal(result.rollbackRequired, true);
    assert.equal(result.status.state, "preflight-complete");
    assert.equal(result.expectedConfirmation, expectedRulesRollbackConfirmation(prior, current));
    assert.match(result.expectedConfirmation, new RegExp(prior.snapshotDigestSha256));
    assert.match(result.expectedConfirmation, new RegExp(current.snapshotDigestSha256));
    assert.equal(api.calls.some((call) => call.init.method === "PATCH"), false);
    assert.equal(api.calls.some((call) => call.init.method === "POST"), false);
  });

  it("rejects apply without the exact confirmation before any API request", async () => {
    const prior = await fixtureSnapshot({ suffix: "prior", names: legacyNames });
    const current = await fixtureSnapshot({ suffix: "current" });
    let fetchCalls = 0;
    await assert.rejects(
      rollbackRulesReleases({
        priorSnapshot: prior,
        currentSnapshot: current,
        projectId,
        storageBucket,
        accessToken: "test-token",
        fetchImpl: async () => {
          fetchCalls += 1;
        },
        apply: true,
        confirmation: "ROLLBACK",
        recordStatus: async () => {},
      }),
      /confirmation must exactly equal/
    );
    assert.equal(fetchCalls, 0);
  });

  it("rejects apply without an exclusive deployment lock assertion", async () => {
    const prior = await fixtureSnapshot({ suffix: "prior", names: legacyNames });
    const current = await fixtureSnapshot({ suffix: "current" });
    let fetchCalls = 0;
    await assert.rejects(
      rollbackRulesReleases({
        priorSnapshot: prior,
        currentSnapshot: current,
        projectId,
        storageBucket,
        accessToken: "test-token",
        fetchImpl: async () => {
          fetchCalls += 1;
        },
        apply: true,
        confirmation: expectedRulesRollbackConfirmation(prior, current),
        recordStatus: async () => {},
      }),
      /exclusive deployment lock assertion/
    );
    assert.equal(fetchCalls, 0);
  });

  it("repoints only existing releases after binding preflight and verifies both pointers", async () => {
    const prior = await fixtureSnapshot({ suffix: "prior", names: legacyNames });
    const current = await fixtureSnapshot({ suffix: "current" });
    const api = rollbackFetch(prior, current);
    const statuses = [];
    const result = await rollbackRulesReleases({
      priorSnapshot: prior,
      currentSnapshot: current,
      projectId,
      storageBucket,
      accessToken: "test-token",
      fetchImpl: api.fetchImpl,
      apply: true,
      confirmation: expectedRulesRollbackConfirmation(prior, current),
      exclusiveDeploymentLock: true,
      recordStatus: async (status) => statuses.push(status),
      now: () => Date.parse("2026-07-21T05:00:00Z"),
    });

    assert.equal(result.applied, true);
    assert.equal(result.status.state, "complete");
    assert.equal(result.status.surfaces.firestore.state, "applied");
    assert.equal(result.status.surfaces.storage.state, "applied");
    assert.equal(statuses.at(-1).state, "complete");
    assert.equal(api.calls.filter((call) => call.init.method === "PATCH").length, 2);
    assert.equal(api.calls.some((call) => call.init.method === "POST"), false);
    for (const surface of ["firestore", "storage"]) {
      const name = prior.releases[surface].release.name;
      assert.equal(api.liveReleases.get(name).rulesetName, prior.releases[surface].release.rulesetName);
    }
  });

  it("blocks rollback if a live current binding changed after capture", async () => {
    const prior = await fixtureSnapshot({ suffix: "prior", names: legacyNames });
    const current = await fixtureSnapshot({ suffix: "current" });
    const api = rollbackFetch(prior, current, {
      mutate: ({ liveReleases }) => {
        const name = current.releases.firestore.release.name;
        liveReleases.get(name).updateTime = "2026-07-21T03:59:59Z";
      },
    });
    await assert.rejects(
      rollbackRulesReleases({
        priorSnapshot: prior,
        currentSnapshot: current,
        projectId,
        storageBucket,
        accessToken: "test-token",
        fetchImpl: api.fetchImpl,
      }),
      /live release binding no longer matches/
    );
    assert.equal(api.calls.some((call) => call.init.method === "PATCH"), false);
  });

  it("blocks rollback if a captured prior immutable ruleset no longer matches", async () => {
    const prior = await fixtureSnapshot({ suffix: "prior", names: legacyNames });
    const current = await fixtureSnapshot({ suffix: "current" });
    const api = rollbackFetch(prior, current, {
      mutate: ({ rulesets }) => {
        const name = prior.releases.firestore.ruleset.name;
        rulesets.get(name).source.files[0].content += "\n// drift";
      },
    });
    await assert.rejects(
      rollbackRulesReleases({
        priorSnapshot: prior,
        currentSnapshot: current,
        projectId,
        storageBucket,
        accessToken: "test-token",
        fetchImpl: api.fetchImpl,
      }),
      /immutable ruleset no longer matches/
    );
    assert.equal(api.calls.some((call) => call.init.method === "PATCH"), false);
  });

  it("treats optional file fingerprints as evidence rather than source identity", async () => {
    const prior = await fixtureSnapshot({ suffix: "prior", names: legacyNames });
    const current = await fixtureSnapshot({ suffix: "current" });
    const api = rollbackFetch(prior, current, {
      mutate: ({ rulesets }) => {
        const name = prior.releases.firestore.ruleset.name;
        rulesets.get(name).source.files[0].fingerprint = "different-optional-fingerprint";
      },
    });
    const result = await rollbackRulesReleases({
      priorSnapshot: prior,
      currentSnapshot: current,
      projectId,
      storageBucket,
      accessToken: "test-token",
      fetchImpl: api.fetchImpl,
    });
    assert.equal(result.rollbackRequired, true);
    assert.equal(api.calls.some((call) => call.init.method === "PATCH"), false);
  });

  it("records a partial restore and stops when the second service fails", async () => {
    const prior = await fixtureSnapshot({ suffix: "prior", names: legacyNames });
    const current = await fixtureSnapshot({ suffix: "current" });
    const api = rollbackFetch(prior, current, { failPatchSurface: "storage" });
    const statuses = [];
    await assert.rejects(
      rollbackRulesReleases({
        priorSnapshot: prior,
        currentSnapshot: current,
        projectId,
        storageBucket,
        accessToken: "test-token",
        fetchImpl: api.fetchImpl,
        apply: true,
        confirmation: expectedRulesRollbackConfirmation(prior, current),
        exclusiveDeploymentLock: true,
        recordStatus: async (status) => statuses.push(status),
      }),
      (error) => {
        assert(error instanceof RulesRollbackError);
        assert.equal(error.status.state, "partial");
        assert.equal(error.status.surfaces.firestore.state, "applied");
        assert.equal(error.status.surfaces.storage.state, "unknown-after-apply");
        assert.match(error.status.surfaces.storage.error, /HTTP 500/);
        return true;
      }
    );
    assert.equal(statuses.at(-1).state, "partial");
    assert.equal(api.calls.filter((call) => call.init.method === "PATCH").length, 2);
    assert.equal(api.calls.some((call) => call.init.method === "POST"), false);
  });

  it("stops with structured status if journaling fails after the first mutation", async () => {
    const prior = await fixtureSnapshot({ suffix: "prior", names: legacyNames });
    const current = await fixtureSnapshot({ suffix: "current" });
    const api = rollbackFetch(prior, current);
    let recorderCalls = 0;

    await assert.rejects(
      rollbackRulesReleases({
        priorSnapshot: prior,
        currentSnapshot: current,
        projectId,
        storageBucket,
        accessToken: "test-token",
        fetchImpl: api.fetchImpl,
        apply: true,
        confirmation: expectedRulesRollbackConfirmation(prior, current),
        exclusiveDeploymentLock: true,
        recordStatus: async () => {
          recorderCalls += 1;
          if (recorderCalls === 3) throw new Error("journal unavailable");
        },
      }),
      (error) => {
        assert(error instanceof RulesRollbackError);
        assert.equal(error.status.state, "journal-failed");
        assert.equal(error.status.surfaces.firestore.state, "applied");
        assert.equal(error.status.surfaces.storage.state, "pending");
        assert.match(error.status.error, /journal unavailable/);
        return true;
      }
    );
    assert.equal(api.calls.filter((call) => call.init.method === "PATCH").length, 1);
  });

  it("reports final readback drift as a structured rollback failure", async () => {
    const prior = await fixtureSnapshot({ suffix: "prior", names: legacyNames });
    const current = await fixtureSnapshot({ suffix: "current" });
    const api = rollbackFetch(prior, current, { driftFinalReadbackSurface: "firestore" });
    const statuses = [];

    await assert.rejects(
      rollbackRulesReleases({
        priorSnapshot: prior,
        currentSnapshot: current,
        projectId,
        storageBucket,
        accessToken: "test-token",
        fetchImpl: api.fetchImpl,
        apply: true,
        confirmation: expectedRulesRollbackConfirmation(prior, current),
        exclusiveDeploymentLock: true,
        recordStatus: async (status) => statuses.push(status),
      }),
      (error) => {
        assert(error instanceof RulesRollbackError);
        assert.equal(error.status.state, "verification-failed");
        assert.equal(error.status.surfaces.firestore.state, "applied");
        assert.equal(error.status.surfaces.storage.state, "applied");
        assert.match(error.status.error, /does not point to the prior ruleset/);
        return true;
      }
    );
    assert.equal(statuses.at(-1).state, "verification-failed");
    assert.equal(api.calls.filter((call) => call.init.method === "PATCH").length, 2);
  });

  it("preserves structured readback status when failure journaling also fails", async () => {
    const prior = await fixtureSnapshot({ suffix: "prior", names: legacyNames });
    const current = await fixtureSnapshot({ suffix: "current" });
    const api = rollbackFetch(prior, current, { failFinalReadbackSurface: "firestore" });

    await assert.rejects(
      rollbackRulesReleases({
        priorSnapshot: prior,
        currentSnapshot: current,
        projectId,
        storageBucket,
        accessToken: "test-token",
        fetchImpl: api.fetchImpl,
        apply: true,
        confirmation: expectedRulesRollbackConfirmation(prior, current),
        exclusiveDeploymentLock: true,
        recordStatus: async (status) => {
          if (status.state === "verification-failed") throw new Error("failure journal unavailable");
        },
      }),
      (error) => {
        assert(error instanceof RulesRollbackError);
        assert(error.cause instanceof AggregateError);
        assert.equal(error.status.state, "verification-failed");
        assert.match(error.status.error, /HTTP 500/);
        assert.match(error.status.error, /failure journal unavailable/);
        return true;
      }
    );
    assert.equal(api.calls.filter((call) => call.init.method === "PATCH").length, 2);
  });

  it("throws structured status when the final journal update fails", async () => {
    const prior = await fixtureSnapshot({ suffix: "prior", names: legacyNames });
    const current = await fixtureSnapshot({ suffix: "current" });
    const api = rollbackFetch(prior, current);

    await assert.rejects(
      rollbackRulesReleases({
        priorSnapshot: prior,
        currentSnapshot: current,
        projectId,
        storageBucket,
        accessToken: "test-token",
        fetchImpl: api.fetchImpl,
        apply: true,
        confirmation: expectedRulesRollbackConfirmation(prior, current),
        exclusiveDeploymentLock: true,
        recordStatus: async (status) => {
          if (status.state === "complete") throw new Error("final journal unavailable");
        },
      }),
      (error) => {
        assert(error instanceof RulesRollbackError);
        assert.equal(error.status.state, "journal-failed");
        assert.equal(error.status.surfaces.firestore.state, "applied");
        assert.equal(error.status.surfaces.storage.state, "applied");
        assert.match(error.status.error, /final journal unavailable/);
        return true;
      }
    );
    assert.equal(api.calls.filter((call) => call.init.method === "PATCH").length, 2);
  });

  it("reports that an unchanged read-only preflight needs no rollback", async () => {
    const current = await fixtureSnapshot({ suffix: "current" });
    const state = fixtureState({ suffix: "current" });
    const distinct = await captureRulesSnapshot({
      projectId,
      storageBucket,
      accessToken: "test-token",
      fetchImpl: staticFetch(state),
      now: () => Date.parse("2026-07-21T03:00:01Z"),
    });
    assert.notEqual(current.snapshotDigestSha256, distinct.snapshotDigestSha256);
    const api = rollbackFetch(current, distinct);
    const result = await rollbackRulesReleases({
      priorSnapshot: current,
      currentSnapshot: distinct,
      projectId,
      storageBucket,
      accessToken: "test-token",
      fetchImpl: api.fetchImpl,
    });
    assert.equal(result.applied, false);
    assert.equal(result.rollbackRequired, false);
    assert.equal(api.calls.some((call) => call.init.method === "PATCH"), false);

    await assert.rejects(
      rollbackRulesReleases({
        priorSnapshot: current,
        currentSnapshot: distinct,
        projectId,
        storageBucket,
        accessToken: "test-token",
        fetchImpl: async () => assert.fail("no API request expected"),
        apply: true,
        confirmation: expectedRulesRollbackConfirmation(current, distinct),
        recordStatus: async () => {},
      }),
      /release bindings are unchanged/
    );
  });

  it("atomically replaces a private rollback status record", async (context) => {
    const directory = mkdtempSync(join(tmpdir(), "tenacity-rules-status-"));
    context.after(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, "status.json");
    const record = createAtomicStatusRecorder(path);
    await record({ state: "ready" });
    await record({ state: "complete" });
    assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), { state: "complete" });
    assert.equal(statSync(path).mode & 0o077, 0);
    assert.throws(() => createAtomicStatusRecorder(path), /already exists/);
  });
});
