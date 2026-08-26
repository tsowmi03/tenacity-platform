# Production deployment

How code in this repository reaches production, and what stops it going wrong.

The five production surfaces — Firestore rules, Firestore indexes, Cloud
Functions, admin portal Hosting, resource portal Hosting, and the public
website — all deploy from
`tsowmi03/tenacity-platform`. Mobile is not one of them: it ships from
`tsowmi03/Tenacity` to the app stores and nothing here touches it.

This is a solo-operated project. Controls that only work by involving a second
person are not used, because they would be theatre: `main` requires a pull
request but zero approvals, for the reason set out in
[branch protection](github-branch-protection.md), and deployment follows the
same principle. What remains is machine-checkable.

## What deploys by itself

**The website and the admin portal deploy on merge to `main`.** When
`Validate platform` succeeds on a commit, each frontend workflow picks up that
exact commit and deploys it. Nothing to dispatch.

Two conditions, both decided by `scripts/ci/resolve-deploy-context.mjs`:

- the surface's own source changed (documentation under it does not count), and
- the same commit did **not** change the backend.

The second is an interlock, not a nicety: a portal build must not go live
against rules or Functions that have not deployed yet. When it trips, the run
says so and stops.

The trigger is `workflow_run` on `Validate platform` rather than `push`, so
production never receives a commit that has not passed the full required gate
on its exact merged SHA. The resolver additionally requires the validation run
to have succeeded, on `main`, from this repository — a fork's pull request can
make validation succeed, and without that check its code would deploy.

## What needs a dispatch

**Everything backend, through one workflow.** `production-deploy.yml` takes the
`main` SHA and the confirmation `DEPLOY PRODUCTION tenacity-tutoring-b8eb2`,
works out which surfaces the commit changed, and runs them in order:

**indexes → rules → functions → portal → website**

The order is load-bearing. Composite index builds are slow and additive and the
pipeline refuses removals, so applying them early is the safe direction, and a
query against a not-yet-`READY` index fails at runtime. Rules follow because
they must already permit both the old and the new client. Functions next. The
frontends last, because they are what exercises everything above.

`surfaces: all` redeploys every surface regardless of what changed, which is
how to recover from a partial failure.

Individual surface workflows remain dispatchable on their own for reruns.

Two things are derived rather than asked for: `expected_content_change` on the
rules deploy (true exactly when the commit changed rules), and which surfaces
run at all.

## The deploy record

Each deploy opens a GitHub issue titled `Production deploy <sha12>` before the
privileged job runs, and closes it with the outcome afterwards. One record per
commit, so a multi-surface release appends to a single issue. It is generated
by `deploy-record.yml`, which runs without an environment and therefore never
holds production credentials.

It is a record, not an authorization. For a solo operator "the operator
authorized themselves" was never an independent control; what the record
provides is the audit trail, and that is preserved.

## What actually gates a deploy

- Manual dispatch, or a successful `Validate platform` run on `main`.
- The typed confirmation string, per surface.
- `main` only, with the SHA rechecked after the environment gate on a dispatch.
  Not on an auto-deploy, where `main` advancing mid-run is normal — the next
  merge deploys the newer commit and the concurrency group keeps them ordered.
- The protected `tenacity-production` environment, which is the credential
  boundary and the only principal the federated identities will impersonate.
- `Validate platform / Required validation gate`, strict and required on `main`.
- Per-surface checks below.

Concurrency is per surface: `production-website`,
`production-hosting-<surface>` (one group per portal, so the two portals never
queue behind each other), `tenacity-production` for the backend surfaces, and
`production-orchestrator`
for the orchestrator itself. The orchestrator's group must differ from every
workflow it calls — a called reusable workflow's own `concurrency` block still
applies, so sharing one would make the run queue behind itself and deadlock. A
test asserts this.

## Per-surface controls

### Functions

The policy in `backend/firebase/inventory/production-functions.json` is the
authority for what may exist: 91 managed endpoints, three non-deployable
helpers, plus four external Functions this repository does not own (two legacy
Xero, two extension-managed) for 95 live resources. These counts are prose and
drift — they had read 87 and 91 for three Functions before this one. The
manifest is the authority; count it rather than trusting this sentence.

The workflow validates the manifest, package, emulator suite, export set and
render fixtures before credentials exist; captures the live inventory;
materialises deterministic batches of at most ten explicit
`functions:default:<id>` selectors; dry-runs each batch; applies without
`--force` and without automatic retry; captures live state after every attempt
including a failed one; and finally requires the exact 91-resource inventory,
rejects metadata drift, and compares the complete raw records of all four
external Functions against their pre-deploy state.

**Introducing a new Function needs no special handling.** It cannot be live
before its first deployment, so the pre-deploy comparison reports it and
continues; the strict post-batch check still requires it to be live when the
run finishes. An unexpected live Function, or metadata drift on one that
exists, is still a hard failure before the dry run.

Firebase recommends deploying ten or fewer Functions at a time. A timeout or
failed batch can still leave a partial deployment; the status artifact is the
resume record. Stop, inspect the live inventory, and never retry or broaden
selectors automatically.

### Rules

The workflow runs the source validator and both rules emulator suites, then
dry-runs and deploys `firestore:rules,storage` after the environment gate.

The Rules API helper captures both release pointers and follows them to the
full immutable ruleset sources, binds every byte into a canonical SHA-256
snapshot, verifies content before the dry run, requires exact content on
read-back after deployment, and performs a read-only rollback preflight.

`expected_content_change` exists because the pre-deploy equality check was
written for the no-op cutover, where live and deployed content were identical
by construction. It cannot pass for a deploy that changes rules. The
orchestrator derives it. The post-deploy check never accepts drift regardless
of how it was set.

The Rules Releases PATCH endpoint has no atomic conditional-update
precondition, and Firestore and Storage are updated serially, so a failure can
leave a partial rollback. Inspect both live releases after any error.

### Indexes

Pull-request CI reports index additions and removals against the base commit
and fails any removal, including same-count replacements. The workflow requires
exact source equality and every managed index `READY` before the dry run, and
compares resource names, states and external TTL policies afterwards.

Unlike Functions, exact source equality has no built-in first-deploy
exception: a genuinely new index cannot exist live before its first deploy,
so the pre-deploy check would otherwise reject the deploy that is supposed to
create it. `backend/firebase/inventory/pending-index-deployment-exceptions.json`
is the equivalent of `allowedMissingBeforeDeploy` for indexes, with two
categories of different lifetime:

- `pendingAdditions` — temporary, mirrors the Functions pattern (#52/#53).
  Names an index or field override that is in source but not live yet.
  Close the entry back to empty once the deploy that adds it has succeeded.
- `knownLiveExtras` — permanent. Names an index or field override that is
  live but deliberately no longer in source, because Firebase's
  additive-only deploy will never remove it (the first one, on
  `attendance.termId`, dates to commit 799bda1). This category is not
  something a follow-up commit closes.

`scripts/ci/validate-firebase-config.mjs` cross-checks the file on every PR:
every `pendingAdditions` entry must exist in source, every `knownLiveExtras`
entry must not, and at most three pending additions may be carried at once.
The pre-deploy check passes `--allow-pending-additions` so both categories are
tolerated; the post-deploy check omits it, so a pending addition must now
actually be live — the run can only succeed once it truly deployed. Known
live extras are tolerated either way, since nothing this workflow runs
touches them.

Do not deploy an index deletion: rebuilding a deleted index is not an immediate
rollback.

### Portal Hosting (admin and resource)

Both portals deploy through one implementation,
`firebase-hosting-production.yml`, selected by its `surface` input. Only the
per-surface constants differ; the SHA authorization, environment gate, and
typed confirmation are the same mechanism for both, and the confirmation names
the exact site being published.

| | `portal` | `resource_portal` |
| --- | --- | --- |
| Application | `apps/admin-portal` | `apps/resource-portal` |
| Hosting target | `admin-portal` | `resource-portal` |
| Site | `tenacity-tutoring-b8eb2` | `tenacity-resources-b8eb2` |
| Custom domain | `admin.tenacitytutoring.com` | `resources.tenacitytutoring.com` |
| Static smoke paths | `/`, `/terms.html`, `/reset_password.html` | `/` |
| Confirmation | `DEPLOY HOSTING tenacity-tutoring-b8eb2` | `DEPLOY HOSTING tenacity-resources-b8eb2` |

Each deploys to a preview channel with `--no-authorized-domains` so preview
creation cannot alter Firebase Auth, runs unauthenticated non-mutating checks,
then clones that exact preview version to live. Because preview channels are
never authorised domains, **sign-in cannot be tested on a preview URL** —
authenticated verification happens on the custom domain after promotion.

The per-release channel is retained 30 days rather than one, because it is the
only thing a CLI rollback can clone from. Each site has its own independent
channel history and therefore its own rollback.

The orchestrator deploys `resource_portal` before `portal`: tutors reach
resource generation only through the resource portal, so it must be live and
verified before an admin-portal deploy lands.

Post-validation auto-deploy for both surfaces is wired in
`firebase-hosting-auto-production.yml`, which calls the same implementation
once per surface. A frontend-only change to one application publishes only that
application; a commit that also touches the backend auto-deploys neither and
must go through the orchestrator.

### Public website

`apps/website/vercel.json` sets `github.autoAlias: false`, which is what stops
the Vercel Git integration aliasing the domain to its own build and racing the
staged promotion. The `validate` job asserts it is still set.

The workflow creates a Production deployment with `--skip-domain`, waits for
`READY`, checks the exact deployment, owner, project, target, commit metadata
and absence of the production alias, smoke-tests `/` and `/register` without
submitting anything, promotes that exact deployment, and verifies the
production domain resolves to its deployment ID. Smoke checks must never
submit the registration form or write production Firebase data.

## Rolling back

Every surface has a rollback path that does not require a person to have been
watching, which matters more now that two of them deploy unattended.

| Surface | How |
| --- | --- |
| Website | `vercel-rollback-production.yml` with the previous deployment URL, recorded as `production-before.json` in each deploy's evidence |
| Admin Hosting | `firebase-hosting-rollback-production.yml`, surface `portal`, with a previous release's channel ID, from `hosting:channel:list` or `channels-before.json`. Beyond 30 days it is a console operation |
| Resource Hosting | `firebase-hosting-rollback-production.yml`, surface `resource_portal`. Independent channel history from the admin portal |
| Rules | `firebase-rules-rollback-production.yml` against the exact completed deployment artifact, digest-bound. Hold the Firebase console still while it runs |
| Functions | Redeploy the affected explicit names from the previous authorized source, then re-run the complete 91-record check |
| Indexes | Avoid deletion; recreation takes time and is not an immediate rollback |

## Abort conditions

Stop immediately if:

- the workflow commit is not the authorized `main` SHA, including the
  post-environment-gate recheck;
- any required validation, dry run, inventory check, or smoke check fails;
- rules source content differs, a release pointer moves after capture, or an
  immutable ruleset cannot be read back;
- any Firestore index is not `READY`, or an index resource or external TTL
  policy changes during the attempt;
- the live Function set, project, runtime, region, generation, state, trigger,
  or deployment-tool label differs from policy;
- any external Function changes;
- a deploy proposes an unreviewed deletion; or
- the Hosting target/site or Vercel project differs from the reviewed constants.

Do not use `firebase deploy --force`. Do not convert the backend workflows to
push triggers.

## Validation

`validate.yml` is the required gate. It classifies changed paths and skips
unaffected jobs, so a `skipped` job passes the gate by design while any
`failure` or `cancelled` fails it. Emulator commands use `demo-*` project IDs,
and validation jobs receive no production credential.

Auto-deploy makes this gate and Stage A branch protection *more* load-bearing
than before, since they are now the last thing between a merge and production.
Do not weaken either.

## Maintaining the checks

Counts and hashes are derived wherever they can be. Two things still need a
deliberate edit:

- adding a Function: add the name to `production-functions.json`; and
- changing rules, indexes or `storage.cors.json`: run
  `node scripts/ci/validate-firebase-config.mjs --write` and commit the
  regenerated baseline alongside the source change.

CI never runs `--write`; a pipeline that can refresh its own baseline detects
nothing.

## Environment configuration

Created by `scripts/ci/provision-production-environment.sh`. Deployments are
restricted to protected `main`, and the nine non-secret variables below are
set. Every workflow compares these against a literal baked into the workflow
itself, so an environment pointed at the wrong project fails the run before
any provider call.

The environment scopes variables and secrets. It is not an independent
reviewer gate: GitHub Pro offers no required reviewers on private-repository
environments, so that gap is structural rather than something a setting here
could close.

Required secrets:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VERCEL_TOKEN`

Intentionally left unset for the no-op cutover (empty in the current production
build, verified from the deployed portal bundle): `VITE_FIREBASE_STORAGE_BUCKET`,
`VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID`. The hosting
template does not require these non-empty. `VITE_FIREBASE_API_KEY` is the
custom browser key the live portal ships (`AIzaSy…s2ic`), which differs from
the Firebase-canonical web app key; the no-op cutover must reproduce the live
key, not the SDK-default one. Populating the three empty values or switching to
the canonical key is a deliberate post-cutover change, not part of the no-op.

Required variables:

- `FIREBASE_DEPLOYMENT_TARGET=production`
- `FIREBASE_PROJECT_ID=tenacity-tutoring-b8eb2`
- `FIREBASE_STORAGE_BUCKET=tenacity-tutoring-b8eb2.firebasestorage.app`
- `FIREBASE_STORAGE_TARGET=primary`
- `FIREBASE_DATABASE_ID=(default)`
- `FIREBASE_HOSTING_SITE=tenacity-tutoring-b8eb2`
- `FIREBASE_HOSTING_TARGET=admin-portal`
- `FIREBASE_RESOURCE_HOSTING_SITE=tenacity-resources-b8eb2`
- `FIREBASE_RESOURCE_HOSTING_TARGET=resource-portal`
- `VERCEL_ORG_ID=team_1di6uZZn3ENj9oo4Porw8yF6`
- `VERCEL_PROJECT_ID=prj_MVZzGI3naoD9yo9IrMbWQeChOWhk`

No Google service-account key exists as a secret. The five Firebase workflows
authenticate with the keyless federated identities below; the only remaining
production secrets are the Vercel platform token and the client build
configuration. Federated credentials are minted only after Stage A and
environment-policy verification, and the short-lived credential file is
removed on completion.

## Federated production identities

The Google Cloud organization enforces
`constraints/iam.disableServiceAccountKeyCreation`, so the production
workflows use the same keyless workload identity federation model that the
staging rehearsal proved, against a separate production-scoped binding. These
resources were created 22 July 2026 by
`scripts/firebase/provision-production-federation.sh`; the provider is ACTIVE
and each identity's impersonation is bound only to the `tenacity-production`
environment. All four identities are proven by the 24 July 2026 cutover. The
Functions role set was completed during that cutover by adding only the
permissions each failed dry run named; the Hosting set needed no additions.
Keep that discipline for any future gap: add only the named permission and
never broaden to a data-read or admin role.

- Pool `github` and provider `tenacity-platform` in production project number
  `398065992407` (`tenacity-tutoring-b8eb2`), issuer
  `https://token.actions.githubusercontent.com`, with the provider condition
  `assertion.repository == 'tsowmi03/tenacity-platform'` and the same
  attribute mapping the staging provider uses, including
  `attribute.environment`. The staging pool in project `354428033510` is not
  reused.
- Four least-privilege production service accounts on
  `tenacity-tutoring-b8eb2`, mirroring the staging role model:
  - `tenacity-production-rules@tenacity-tutoring-b8eb2.iam.gserviceaccount.com`
    for the Rules deployment and Rules rollback workflows:
    `roles/firebaserules.admin`, read-only `roles/firebasestorage.viewer`, a
    custom single-permission project role for `firebase.projects.get`, and
    `roles/serviceusage.serviceUsageConsumer`.
  - `tenacity-production-indexes@tenacity-tutoring-b8eb2.iam.gserviceaccount.com`
    for the index workflow: `roles/datastore.indexAdmin`, the same custom
    project-get role, `roles/serviceusage.serviceUsageConsumer`, and a custom
    single-permission role for `firebaserules.rulesets.test`, which the
    staging rehearsal proved `firebase deploy --only firestore:indexes`
    requires for Rules pre-compilation.
  - `tenacity-production-functions@tenacity-tutoring-b8eb2.iam.gserviceaccount.com`
    for the Functions workflow. Its full proven set is
    `roles/cloudfunctions.developer`, `roles/run.admin`,
    `roles/artifactregistry.writer`, `roles/cloudbuild.builds.editor`,
    `roles/iam.serviceAccountUser`, `roles/serviceusage.serviceUsageConsumer`,
    `roles/secretmanager.viewer`, the custom project-get role, and the custom
    role `tenacityProductionFunctionsDeploy`
    (`datastore.databases.getMetadata`; `eventarc.locations.get`,
    `eventarc.providers.get`, `eventarc.triggers.create/get/list/update/delete`;
    `cloudscheduler.locations.get`,
    `cloudscheduler.jobs.create/get/list/update/delete`). The Eventarc
    permissions serve the 13 gen2 Firestore event triggers and the Cloud
    Scheduler permissions the 4 scheduled functions. Note the deliberate
    exclusions: `roles/secretmanager.viewer` grants secret metadata but not
    `secretmanager.versions.access`, so the deploy identity cannot read secret
    values; no Pub/Sub permission is required; and no `setIamPolicy` is held on
    any resource. Use `datastore.databases.getMetadata`, not
    `datastore.databases.get` — the Firestore Admin database call checks the
    former, and `roles/datastore.viewer` must not be used because it bundles
    document reads.
  - `tenacity-production-hosting@tenacity-tutoring-b8eb2.iam.gserviceaccount.com`
    for the Hosting workflow: `roles/firebasehosting.admin`,
    `roles/serviceusage.serviceUsageConsumer`, and the custom project-get role.
    This set deployed successfully with no additions.
- Each identity grants `roles/iam.workloadIdentityUser` only to the exact
  subject principal
  `.../subject/repo:tsowmi03/tenacity-platform:environment:tenacity-production`
  and the equivalent `.../attribute.environment/tenacity-production`
  principal set, so only a workflow job running in the protected
  `tenacity-production` environment can impersonate it.
- Do not use `roles/firebase.viewer`, editor, or owner for any of these
  identities. If an activated workflow fails with a named missing permission,
  record the run, add only that permission after review, and never broaden to
  a data-read or admin role.

The Rules and index workflows bind production to the static project, Storage
bucket, and database above. The Rules workflow also selects only
`storage:primary`; `firebase.json` and `.firebaserc` bind that deploy target to
the same exact bucket. Their arming step checks the constants against
`backend/firebase/deployment-targets.json` and the protected environment
variables. Rules evidence must never derive the bucket from the
`VITE_FIREBASE_STORAGE_BUCKET` client secret.

`deployment-targets.json` contains separate exact `production` and `staging`
bindings. Staging uses project `tenacity-tutoring-staging`, bucket
`tenacity-tutoring-staging.firebasestorage.app`, and database `(default)`.
`.firebaserc` maps only that project's `storage:primary` target and adds no
staging Hosting target. Validation rejects identifier drift and any project or
bucket reuse between environments. See the
[staging runbook](firebase-staging-rehearsal.md).

## History

The migration that moved these surfaces into this repository, its preparation
gates, staging rehearsals and the 24 July 2026 no-op cutover are recorded in
[`docs/migrations/current-status-and-handoff-2026.md`](../migrations/current-status-and-handoff-2026.md)
and in `log.md`. That material is history and no longer governs a deployment.

`tsowmi03/tenacity-web-portal` and `tsowmi03/tenacity-tutoring` no longer serve
production.
