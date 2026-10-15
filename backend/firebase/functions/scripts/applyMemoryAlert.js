"use strict";

/*
 * Creates, or brings up to date, the Cloud Monitoring alert that emails when a
 * Function runs out of memory.
 *
 * A Function over its memory limit fails before it runs any code, so nothing
 * of ours logs it and the caller sees only a 500 or 503. The one-week swap
 * failed this way for every family until a parent reported it, and other
 * Functions had been failing the same way for a week before that (TP-37).
 * `scripts/checkStartupMemory.js` stops the bundle growing past the limit;
 * this catches everything else, such as one request that needs more than its
 * Function has.
 *
 * Idempotent: the channel and the policy are found by display name and
 * updated in place, so running it again after editing this file is how the
 * alert is changed. Uses Application Default Credentials.
 *
 * Usage:
 *   node scripts/applyMemoryAlert.js --projectId=tenacity-tutoring-b8eb2
 *   node scripts/applyMemoryAlert.js --projectId=tenacity-tutoring-b8eb2 --commit --yes
 *
 * Flags:
 *   --projectId=ID    REQUIRED. Never inferred: this script writes.
 *   --email=ADDRESS   Where alerts go. Default admin@tenacitytutoring.com.
 *   --commit          Write. Omit for a dry run (the default).
 *   --yes             Required with --commit.
 */

const { GoogleAuth } = require("google-auth-library");

const CHANNEL_NAME = "Functions alerts (email)";
const POLICY_NAME = "Functions: out of memory";
const DEFAULT_EMAIL = "admin@tenacitytutoring.com";

// Gen 2 Functions run on Cloud Run and log "Memory limit of 256 MiB exceeded
// with 292 MiB used"; the one gen 1 Function logs "memory limit exceeded".
const LOG_FILTER = [
  'resource.type=("cloud_run_revision" OR "cloud_function")',
  "severity>=ERROR",
  '(textPayload:"Memory limit of" OR textPayload:"memory limit exceeded")',
].join(" AND ");

function parseArgs(argv) {
  const args = { projectId: "", email: DEFAULT_EMAIL, commit: false, yes: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--commit") args.commit = true;
    else if (raw === "--yes" || raw === "-y") args.yes = true;
    else if (raw.startsWith("--projectId=")) args.projectId = raw.split("=")[1].trim();
    else if (raw.startsWith("--email=")) args.email = raw.split("=")[1].trim();
    else throw new Error(`Unknown argument: ${raw}`);
  }
  if (!args.projectId) throw new Error("--projectId is required.");
  if (args.commit && !args.yes) throw new Error("--commit needs --yes.");
  return args;
}

function channelBody(email) {
  return {
    type: "email",
    displayName: CHANNEL_NAME,
    labels: { email_address: email },
    enabled: true,
  };
}

function policyBody(channelName) {
  return {
    displayName: POLICY_NAME,
    combiner: "OR",
    enabled: true,
    documentation: {
      mimeType: "text/markdown",
      content: [
        "A Firebase Function ran out of memory. Calls to it fail with a 500 or",
        "503 before any of its code runs.",
        "",
        "Check the log entry for the service and how much memory it used.",
        "A Function at its limit on every start needs `memory:` raised on its",
        "definition. If every Function is near its limit, a heavy library has",
        "probably been required at startup; see TP-37 and",
        "`backend/firebase/functions/scripts/checkStartupMemory.js`.",
      ].join("\n"),
    },
    conditions: [
      {
        displayName: "Function memory limit exceeded",
        conditionMatchedLog: {
          filter: LOG_FILTER,
          labelExtractors: {
            service: "EXTRACT(resource.labels.service_name)",
            function: "EXTRACT(resource.labels.function_name)",
          },
        },
      },
    ],
    alertStrategy: {
      // At most one email per five minutes; a crashing Function restarts
      // and fails again on every request.
      notificationRateLimit: { period: "300s" },
      autoClose: "1800s",
    },
    notificationChannels: [channelName],
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const base = `https://monitoring.googleapis.com/v3/projects/${args.projectId}`;
  const request = async (url, options = {}) => {
    const res = await client.request({
      url,
      headers: { "x-goog-user-project": args.projectId },
      ...options,
    });
    return res.data;
  };

  const channels = (await request(`${base}/notificationChannels`)).notificationChannels || [];
  const channel = channels.find((c) => c.displayName === CHANNEL_NAME);
  const policies = (await request(`${base}/alertPolicies`)).alertPolicies || [];
  const policy = policies.find((p) => p.displayName === POLICY_NAME);

  console.log(`Project:  ${args.projectId}`);
  console.log(`Channel:  ${channel ? `update ${channel.name}` : "create"} -> ${args.email}`);
  console.log(`Policy:   ${policy ? `update ${policy.name}` : "create"}`);
  console.log(`Filter:   ${LOG_FILTER}`);

  if (!args.commit) {
    console.log("\nDry run. Re-run with --commit --yes to apply.");
    return;
  }

  const savedChannel = channel
    ? await request(`https://monitoring.googleapis.com/v3/${channel.name}`, {
        method: "PATCH",
        data: channelBody(args.email),
      })
    : await request(`${base}/notificationChannels`, {
        method: "POST",
        data: channelBody(args.email),
      });

  const savedPolicy = policy
    ? await request(`https://monitoring.googleapis.com/v3/${policy.name}`, {
        method: "PATCH",
        data: policyBody(savedChannel.name),
      })
    : await request(`${base}/alertPolicies`, {
        method: "POST",
        data: policyBody(savedChannel.name),
      });

  console.log(`\nApplied: ${savedChannel.name}`);
  console.log(`Applied: ${savedPolicy.name}`);
}

main().catch((err) => {
  console.error(err?.response?.data || err);
  process.exitCode = 1;
});
