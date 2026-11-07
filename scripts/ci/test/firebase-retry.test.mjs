import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";

const helper = resolve("scripts/ci/firebase-retry.sh");
const listError = "Error: Failed to list functions for tenacity-tutoring-b8eb2";

// A fake `firebase` that plays back one scripted outcome per call:
// "ok", "listerror" (exit 1 with Google's transient message) or "fail".
function harness(outcomes) {
  const dir = mkdtempSync(join(tmpdir(), "firebase-retry-"));
  writeFileSync(join(dir, "outcomes"), outcomes.join("\n") + "\n");
  writeFileSync(join(dir, "calls"), "");
  const fake = join(dir, "firebase");
  writeFileSync(
    fake,
    `#!/bin/bash
echo "$*" >> "${dir}/calls"
n=$(wc -l < "${dir}/calls")
outcome=$(sed -n "\${n}p" "${dir}/outcomes")
case "$outcome" in
  ok) [[ "$1" == "functions:list" ]] && echo '{"status":"success","result":[]}' || echo "Deploy complete!"; exit 0 ;;
  listerror)
    if [[ "$1" == "functions:list" ]]; then echo '{"status":"error","error":"Failed to list functions for tenacity-tutoring-b8eb2"}'; else echo "${listError}" >&2; fi
    exit 1 ;;
  *) echo "Error: HTTP Error: 400, Build failed" >&2; exit 2 ;;
esac
`
  );
  chmodSync(fake, 0o755);
  const run = (script) => {
    const result = spawnSync("bash", ["-eo", "pipefail", "-c", `source "${helper}"; ${script}`], {
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        FIREBASE_PROJECT_ID: "tenacity-tutoring-b8eb2",
        FIREBASE_RETRY_DELAYS: "0 0",
      },
      encoding: "utf8",
    });
    const calls = readFileSync(join(dir, "calls"), "utf8").trim().split("\n").filter(Boolean);
    return { ...result, calls, dir };
  };
  return run;
}

const deploy = 'set +e; firebase_deploy "$(mktemp)" --only functions:default:a --non-interactive; echo "exit=$?"';
const withLog = (run) => run(deploy);

describe("firebase_deploy", () => {
  it("passes through on success with one call", () => {
    const r = withLog(harness(["ok"]));
    assert.match(r.stdout, /exit=0/);
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0], "deploy --only functions:default:a --non-interactive");
  });

  it("retries the transient list error and succeeds", () => {
    const r = withLog(harness(["listerror", "listerror", "ok"]));
    assert.match(r.stdout, /exit=0/);
    assert.equal(r.calls.length, 3);
    assert.match(r.stderr, /::warning::firebase deploy hit "Failed to list functions for tenacity-tutoring-b8eb2" \(attempt 1\)/);
  });

  it("gives up after three attempts of the list error", () => {
    const r = withLog(harness(["listerror", "listerror", "listerror", "ok"]));
    assert.match(r.stdout, /exit=1/);
    assert.equal(r.calls.length, 3);
    assert.match(r.stderr, /::error::firebase deploy hit .* on all 3 attempts/);
  });

  it("never retries a real deploy failure", () => {
    const r = withLog(harness(["fail", "ok"]));
    assert.match(r.stdout, /exit=2/);
    assert.equal(r.calls.length, 1);
  });

  it("does not exit the caller's errexit shell before returning status", () => {
    const r = harness(["fail"])('firebase_deploy "$(mktemp)" --only x || echo "caught=$?"');
    assert.match(r.stdout, /caught=2/);
  });

  it("leaves the last attempt's output in the log for callers to inspect", () => {
    const r = harness(["listerror", "fail"])(
      'log="$(mktemp)"; set +e; firebase_deploy "$log" --only x; echo "exit=$?"; grep -c "Build failed" "$log"; grep -c "Failed to list" "$log" || true'
    );
    assert.match(r.stdout, /exit=2\n1\n0/);
  });

  it("passes every argument through unchanged, including --force", () => {
    const r = harness(["ok"])('args=(--force); firebase_deploy "$(mktemp)" --only "a,b" --dry-run "${args[@]}"');
    assert.equal(r.status, 0);
    assert.equal(r.calls[0], "deploy --only a,b --dry-run --force");
  });
});

describe("firebase_functions_list", () => {
  it("retries any failure and writes the inventory", () => {
    const r = harness(["listerror", "fail", "ok"])('out="$(mktemp)"; firebase_functions_list "$out"; cat "$out"');
    assert.equal(r.status, 0);
    assert.equal(r.calls.length, 3);
    assert.ok(r.calls.every((c) => c === "functions:list --project tenacity-tutoring-b8eb2 --json"));
    assert.match(r.stdout, /"status":"success"/);
  });

  it("returns the failure after three attempts", () => {
    const r = harness(["fail", "fail", "fail"])('set +e; firebase_functions_list "$(mktemp)"; echo "exit=$?"');
    assert.match(r.stdout, /exit=2/);
    assert.equal(r.calls.length, 3);
    assert.match(r.stderr, /::error::firebase functions:list failed on all 3 attempts/);
  });
});
