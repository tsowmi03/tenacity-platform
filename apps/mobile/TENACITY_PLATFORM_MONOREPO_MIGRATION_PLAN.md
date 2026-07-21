# Tenacity platform monorepo migration plan

- Last updated: 21 July 2026
- Plan status: Approved for Phase 0
- Migration status: Phase 0 in progress
- Current planning branch: `redesign-v3` in the Flutter repository
- Production Firebase project: `tenacity-tutoring-b8eb2`
- Private destination: `https://github.com/tsowmi03/tenacity-platform`

## 1. Decision

Move the three Tenacity application repositories and the shared Firebase backend
into one history-preserving monorepo. Firebase becomes a platform-level system,
instead of living under the admin portal that happens to consume it.

The monorepo will contain:

- the Flutter mobile app;
- the React/Vite admin portal;
- the Next.js public website;
- Cloud Functions, Firestore rules and indexes, Storage rules, and Firebase
  deployment configuration;
- shared, versioned data and callable contracts;
- cross-client integration tests and deployment workflows.

This is a repository and ownership migration first. It will not combine the move
with broad model rewrites, package-manager changes, UI redesign work, or
production schema removal. Those changes become safer after the repository and
deployment boundary is stable.

## 2. Outcomes

The migration is complete when:

1. One repository is the source of truth for all three clients and the shared
   Firebase platform.
2. Existing Git history, authors, branches, and tags remain accessible.
3. The production Function set is unchanged by the structural cutover.
4. Firestore and Storage permissions do not change during the structural
   cutover.
5. The portal remains on Firebase Hosting and the public website remains on
   Vercel, with explicit project roots and deployment ownership.
6. Flutter, portal, website, backend, rules, and contract checks run from the
   monorepo.
7. Firebase deploys can only originate from the monorepo after cutover.
8. New cross-client backend work starts from a versioned contract and is tested
   against each affected client.
9. The original repositories remain available as read-only rollback and history
   references.

## 3. Scope

### Included

- Preserve and combine the committed history from:
  - `https://github.com/tsowmi03/Tenacity.git`
  - `https://github.com/tsowmi03/tenacity-web-portal.git`
  - `https://github.com/tsowmi03/tenacity-tutoring.git`
- Move Firebase ownership out of the portal directory.
- Replace ambiguous default Hosting deployment with explicit targets.
- Recreate CI and deployment workflows at the monorepo root.
- Rebind Firebase Hosting and Vercel deployments to the new repository paths.
- Establish a cross-language contract system.
- Use the tutor roll and session-feedback flow as the first new shared contract.
- Archive the old repositories after stable production deployments from the
  monorepo.

### Excluded from the structural migration

- Rooms. Tenacity operates one room and room modelling is not required.
- A rewrite of working Firebase Functions.
- Conversion of every direct Firestore read to a callable.
- Conversion to one JavaScript package manager.
- Conversion of the portal from JavaScript to TypeScript.
- Completion of the Flutter V3 UI redesign.
- Removal or recreation of the legacy Xero endpoints.
- Historical feedback backfills unless a separate product decision requires one.
- Import of `/Users/thomassowmi/Development/tenacity_website_claude_design`.
  It is a non-Git design artifact, not a deployable application repository.

## 4. Verified current state

This inventory reflects the local checkouts inspected on 20 and 21 July 2026. Live
Firebase resources must be captured again immediately before cutover.

| System | Current repository | Branch/state at review | Technology | Deployment and backend role |
| --- | --- | --- | --- | --- |
| Mobile app | `/Users/thomassowmi/Development/Tenacity` | `redesign-v3`; checkpoint committed and pushed | Flutter/Dart | Firebase client; also contains legacy default Hosting configuration and `public/` assets |
| Admin portal | `/Users/thomassowmi/Development/tenacity-web-portal` | `migration/phase-0-source-sync`; clean and pushed | React 18/Vite | Owns active Cloud Functions, Firestore rules/indexes, Storage rules, emulators, and Firebase Hosting |
| Public website | `/Users/thomassowmi/Development/tenacity-tutoring` | `migration/phase-0-website-baseline`; design-sync checkpoint committed and pushed | Next.js 15/TypeScript | Vercel; reads public classes and writes enrolments through a server API using Firebase Admin |

The website GitHub repository and local `origin` now use the canonical
`tsowmi03/tenacity-tutoring` URL.

### Current deployment boundaries

- All three applications use Firebase project `tenacity-tutoring-b8eb2`.
- The portal repository is currently authoritative for active Cloud Functions.
- The portal has GitHub Actions workflows for Functions and Firebase Hosting.
- The portal deploys Functions from `backend/functions`, using Node.js 22.
- The portal owns `firestore.rules`, `storage.rules`, and
  `backend/firestore.indexes.json`.
- The website repository is connected to two Vercel projects. The canonical
  production project is `tenacity-tutoring-tqi9`; it owns the custom domains
  and environment variables. The duplicate `tenacity-tutoring` project serves
  Vercel aliases only.
- The mobile and website repositories have no root GitHub Actions workflows in
  the inspected checkouts.
- The mobile and portal Firebase configurations can both address default
  Hosting. This must be resolved before the monorepo can safely deploy Hosting.
- The only live Firebase Hosting site currently serves the admin portal and
  `admin.tenacitytutoring.com`. The portal already serves
  `/reset_password.html`; the mobile `public` directory is not the active
  release. Google Play uses the public website for support and the Firebase
  Hosting terms page for its legal link. App Store Connect still needs provider
  verification before deciding whether any `mobile-support` target is required.
- Two old Xero Functions, `generateXeroAuthUrl` and `xeroOAuthCallback`, have
  historically appeared as Node.js 18 `UNKNOWN` resources. They are outside the
  active Function ownership set and must not be deleted by this migration.
- The 21 July production inventory contains 87 Functions: 83 portal-managed
  deployable endpoints, two Algolia extension Functions, and the two excluded
  legacy Xero resources. The portal source also discovers exactly 83 deployable
  endpoints.
- Production contains 27 composite Firestore indexes while the portal source
  declares 24. The live-only indexes cover `adminAuditLogs`, `terms`, and one
  five-field `resourceJobs` query. Source must be made additive before cutover.
- The deployed Firestore and Storage rulesets differ from the portal source.
  Firestore differs in tutor visibility across `resourceJobs`; Storage differs
  in staff-only access to resource uploads and outputs. Resolve and release this
  policy change separately before the structural freeze, then recapture both
  ruleset identifiers.

### Existing technical debt to preserve and isolate

The Function package is a hybrid migration. Its deployment entry point is
`backend/functions/lib/index.js`; newer portal-owned modules have source under
`backend/functions/src`, while some legacy production logic exists only in the
compiled or migrated `lib` tree. Moving folders does not solve this source gap.
Source recovery will be a separate, function-by-function project after the
structural cutover.

### Working-tree safety

- Complete and commit the active Flutter V3 work before the history import.
- Do not copy any current working tree into the monorepo.
- Build each import from a fresh mirror clone of the remote repository.
- A mirror import will exclude the website's uncommitted `.gitignore` and
  `.design-sync/` changes. Their owner must decide whether they belong in the
  website before or after cutover.
- No source repository is deleted, reset, or force-pushed during this process.

## 5. Target repository

```text
tenacity-platform/
├── .github/
│   ├── CODEOWNERS
│   └── workflows/
├── apps/
│   ├── mobile/
│   ├── admin-portal/
│   └── website/
├── backend/
│   └── firebase/
│       ├── functions/
│       ├── rules/
│       │   ├── firestore.rules
│       │   └── storage.rules
│       └── indexes/
│           └── firestore.indexes.json
├── contracts/
│   ├── schemas/
│   │   ├── callables/
│   │   └── firestore/
│   ├── generated/
│   │   ├── dart/
│   │   └── typescript/
│   ├── fixtures/
│   └── README.md
├── docs/
│   ├── architecture/
│   ├── operations/
│   └── migrations/
├── tests/
│   └── integration/
├── tooling/
├── .firebaserc
├── firebase.json
├── package.json
└── README.md
```

### Why Firebase configuration stays at the root

`firebase.json` and `.firebaserc` remain at the monorepo root so that every
Firebase deployment starts from one reviewed manifest. The manifest will point
to:

- `backend/firebase/functions` for Functions;
- `backend/firebase/rules/firestore.rules` for Firestore rules;
- `backend/firebase/indexes/firestore.indexes.json` for indexes;
- `backend/firebase/rules/storage.rules` for Storage rules;
- `apps/admin-portal/dist` for the admin Hosting target.

The canonical backend code and policy still live under `backend/firebase`.

`apps/mobile/firebase.json` may retain only the `flutter` platform metadata used
by FlutterFire tooling. Its current Hosting block must be removed or migrated to
an explicit root target. Application directories must not contain deployable
Functions, rules, indexes, or default Hosting configuration. The root
`.firebaserc` is the only Firebase project-alias file after cutover.

### Application boundaries

Each application keeps its current runtime and package-management system during
the move:

- Flutter continues to use `pubspec.yaml` and `pubspec.lock`.
- The portal and Functions continue to use their existing npm lockfiles.
- The public website continues to use Yarn 1 and `yarn.lock`.

The root package contains orchestration scripts only. Package-manager
normalisation can be considered after the migration has had stable releases.

### Firebase Hosting targets

The root Firebase manifest must use named Hosting targets. It must not rely on a
default target shared by unrelated content.

- `admin-portal`: existing Vite portal build.
- `mobile-support`: temporary target for any live mobile reset-password, terms,
  or support pages that still depend on `apps/mobile/public`.

Before creating `mobile-support`, inspect the live Hosting site and custom-domain
routes. If those pages can move to the public website without changing links,
move them in a separate tested release and retire the temporary target.

The Next.js public website remains on Vercel and is not added to Firebase
Hosting.

## 6. Ownership model

| Area | Source of truth after cutover | Required reviewer |
| --- | --- | --- |
| Flutter UI and client code | `apps/mobile` | Mobile owner |
| Portal UI | `apps/admin-portal` | Portal owner |
| Public website | `apps/website` | Website owner |
| Functions and triggers | `backend/firebase/functions` | Backend owner |
| Firestore and Storage rules | `backend/firebase/rules` | Backend owner plus affected client owner |
| Firestore indexes | `backend/firebase/indexes` | Backend owner |
| Shared schemas | `contracts/schemas` | Backend owner plus every affected client owner |
| Generated contract code | `contracts/generated` | Generated and checked by CI |
| Firebase deploy manifest | root `firebase.json` | Backend/deployment owner |
| Production deploy workflows | root `.github/workflows` | Deployment owner |

Direct Firestore reads remain acceptable for stable, permission-safe query
models. Sensitive mutations and operations spanning multiple documents move
behind callable or HTTP backend contracts. This keeps Firebase's real-time read
benefits without making clients responsible for business transactions.

Application-specific server routes, including the website enrolment API, can
remain inside their application. A route that changes shared business state must
use a reviewed contract and platform-owned authorization rules. Shared
transactions can then move into `backend/firebase/functions` when more than one
client needs them.

## 7. Migration principles

1. Preserve history. Do not squash the source repositories into one commit.
2. Import committed refs from fresh mirrors. Never import dirty local trees.
3. Separate structural changes from behavior changes.
4. Capture the live Firebase state before and after the first monorepo deploy.
5. Use additive data changes until all released clients have adopted a contract.
6. Keep old clients functional through at least one full mobile release cycle.
7. Do not use `firebase deploy --force` during migration.
8. Do not broadly delete Functions to make an export list match.
9. Protect the two unowned Xero Functions from deployment cleanup.
10. Make each phase independently testable and reversible.

## 8. History-preserving import method

Use `git filter-repo` against temporary mirror clones. The examples below are a
runbook outline. They must be tested against disposable local repositories before
the final GitHub push.

### 8.1 Prepare source repositories

1. Finish, review, test, and commit current work on each source branch that must
   survive the move.
2. Fetch and verify each remote.
3. Record each imported commit SHA in the migration log.
4. Create and push `pre-monorepo-20260720` in each source repository. The
   filter step turns these into `mobile-pre-monorepo-20260720`,
   `portal-pre-monorepo-20260720`, and
   `website-pre-monorepo-20260720` in the monorepo.
5. Record active branches that must remain open after cutover. At minimum this
   includes mobile `redesign-v3` unless it has already merged.

The final tag date must be changed to the actual cutover date.

### 8.2 Rewrite paths in temporary mirrors

```bash
migration_root="$(mktemp -d)"

git clone --mirror https://github.com/tsowmi03/Tenacity.git "$migration_root/mobile.git"
git -C "$migration_root/mobile.git" filter-repo \
  --to-subdirectory-filter apps/mobile \
  --tag-rename '':'mobile-' \
  --force

git clone --mirror https://github.com/tsowmi03/tenacity-web-portal.git "$migration_root/portal.git"
git -C "$migration_root/portal.git" filter-repo \
  --to-subdirectory-filter apps/admin-portal \
  --tag-rename '':'portal-' \
  --force

git clone --mirror https://github.com/tsowmi03/tenacity-tutoring.git "$migration_root/website.git"
git -C "$migration_root/website.git" filter-repo \
  --to-subdirectory-filter apps/website \
  --tag-rename '':'website-' \
  --force
```

Prefixing tags prevents identically named source tags from colliding.

### 8.3 Combine rewritten histories

1. Create an empty private `tenacity-platform` repository with no generated
   README, licence, or `.gitignore` commit.
2. Clone it into a new working directory.
3. Fetch the rewritten `main` ref from each temporary mirror.
4. Make the mobile rewritten `main` the initial monorepo `main`.
5. Merge portal and website rewritten `main` refs with
   `--allow-unrelated-histories`.
6. Fetch all prefixed tags.
7. Create the root structure, then move Firebase files from
   `apps/admin-portal` into their target paths with `git mv`.
8. Add root documentation and disabled/manual-only workflows.
9. Import active source branches after the combined baseline exists.

An example combination in the empty destination clone is:

```bash
git remote add mobile-import "$migration_root/mobile.git"
git remote add portal-import "$migration_root/portal.git"
git remote add website-import "$migration_root/website.git"

git fetch mobile-import \
  '+refs/heads/*:refs/remotes/mobile-import/*' \
  '+refs/tags/*:refs/tags/*'
git fetch portal-import \
  '+refs/heads/*:refs/remotes/portal-import/*' \
  '+refs/tags/*:refs/tags/*'
git fetch website-import \
  '+refs/heads/*:refs/remotes/website-import/*' \
  '+refs/tags/*:refs/tags/*'

git switch -c main mobile-import/main
git merge --no-ff --allow-unrelated-histories portal-import/main \
  -m "Import admin portal history"
git merge --no-ff --allow-unrelated-histories website-import/main \
  -m "Import public website history"
```

Replace the tag date and repository paths with the final reviewed values. Run
this only in the new destination clone.

For the active mobile redesign branch, the preferred end state is
`feature/mobile/redesign-v3`. Because its rewritten history shares commits with
the imported mobile history, it can be brought forward without squashing once
all uncommitted work has been committed in the source repository.

```bash
git switch -c feature/mobile/redesign-v3 main
git merge --no-ff mobile-import/redesign-v3 \
  -m "Import mobile redesign-v3 branch"
```

### 8.4 History verification gate

Before pushing the new repository:

- compare the source and rewritten branch tips;
- confirm representative old commits with `git log --follow` for each app;
- confirm author names, dates, messages, and file contents;
- confirm all expected source tags exist with prefixes;
- compare tracked-file counts, excluding intentional root migrations;
- run `git fsck --full` in the new repository;
- verify no secret, local environment file, or untracked design-sync content was
  added during import;
- ask each application owner to inspect one historical file and one active
  branch.

## 9. Phased execution plan

Every phase has an entry gate, work checklist, exit gate, and rollback point.
Do not begin production cutover work while an earlier exit gate is open.

### Phase 0: Decisions, baselines, and freeze

Estimated effort: 1 to 2 working days.

Entry gate:

- This plan is reviewed.
- A migration owner and production deploy approver are named.

Work:

- [x] Create the empty private destination as
  `tsowmi03/tenacity-platform`; transfer it later if a shared Tenacity
  organisation is created.
- [ ] Confirm that all current maintainers can access the new repository.
- [x] Record source branches, tags, remotes, HEAD SHAs, commit counts, and dirty
  files.
- [x] Finish, verify, commit, and push the coherent mobile `redesign-v3`
  checkpoint that must be imported.
- [x] Review, build, commit, and push the website `.gitignore` and authored
  `.design-sync/` sources while keeping cache and generated output ignored.
- [ ] Create the three pre-monorepo tags.
- [x] Capture current test and build results for all repositories.
- [x] Capture the live Firebase Function inventory, including name, generation,
  region, runtime, trigger type, and deployment state.
- [x] Capture the two legacy Xero resources separately and record that they are
  excluded from managed exports.
- [x] Export the current Firestore indexes, add the three live-only definitions
  to portal source, deploy the synchronized manifest, and verify that all 27
  composite indexes match exactly.
- [x] Record the deployed Firestore and Storage rules releases, validate the
  intended local rules with the emulator suite, deploy them as a separate
  pre-migration release, and verify both released rulesets match source.
- [-] Record Firebase Hosting sites, targets, custom domains, active versions,
  rewrites, and relevant support URLs.
- [x] Record Firebase project aliases, extensions, secrets, environment
  parameters, scheduled jobs, service accounts, and required IAM roles without
  copying secret values into Git.
- [x] Record both Vercel projects, Git connections, custom domains, environment
  variable names, build and install settings, and current production
  deployments without retrieving environment values.
- [x] Create `docs/architecture/ADR-001-monorepo-and-backend-ownership.md`.
- [ ] Announce a short backend and deploy freeze for the history import and
  no-op cutover window.

Exit gate:

- All committed source state is tagged and reproducible.
- Live Firebase and Vercel baselines are stored in the private migration record.
- No required work exists only in an uncommitted working tree.
- Access to the new GitHub repository and deployment providers is confirmed.

Rollback point:

- Continue using the three source repositories. The pre-migration rules release
  can be rolled back through Firebase ruleset history independently of the
  structural migration.

### Phase 1: Create and verify the monorepo history

Estimated effort: 1 working day.

Entry gate:

- Phase 0 complete.
- New empty GitHub repository created.

Work:

- [ ] Run the import process in a disposable local directory.
- [ ] Verify history and active branches.
- [ ] Repeat the verified process for the final repository.
- [ ] Push the combined baseline and prefixed tags.
- [ ] Add branch protection without enabling production deploys.
- [ ] Add a root README explaining the application and backend boundaries.
- [ ] Add root CODEOWNERS and pull-request ownership rules.
- [ ] Record source and imported SHAs in
  `docs/migrations/monorepo-import-2026.md`.

Exit gate:

- Each application builds from its imported subdirectory without source edits.
- History verification passes.
- No production workflow can deploy from the new repository yet.
- Required active branches exist in the new repository.

Rollback point:

- Delete or archive the unpublished new repository and repeat the import. Source
  repositories remain untouched.

### Phase 2: Extract Firebase from the portal without behavior changes

Estimated effort: 2 to 4 working days.

Entry gate:

- Phase 1 complete.
- Application builds pass from imported locations.

Work:

- [ ] Move `apps/admin-portal/backend/functions` to
  `backend/firebase/functions` with `git mv`.
- [ ] Move Firestore rules, Storage rules, and indexes into
  `backend/firebase/rules` and `backend/firebase/indexes`.
- [ ] Create the root Firebase manifest with explicit paths.
- [ ] Reduce `apps/mobile/firebase.json` to FlutterFire platform metadata and
  remove its deployable default Hosting block.
- [ ] Remove application-local `.firebaserc` files after the root alias file is
  established.
- [ ] Update Function scripts, test paths, imports, and emulator commands.
- [ ] Update portal scripts to reference its new root.
- [ ] Resolve the portal Functions README/runtime mismatch and document Node.js
  22 as the current managed runtime.
- [ ] Document the compiled-only `lib` source gap; do not rewrite those Functions
  during this phase.
- [ ] Create explicit Hosting target configuration for the admin portal.
- [ ] Audit mobile legacy Hosting content and choose an explicit temporary target
  or website migration.
- [ ] Run backend unit, emulator, rules, export-smoke, and portal build checks.
- [ ] Generate a local Function export manifest and compare it to the Phase 0
  managed production inventory.
- [ ] Confirm the two unowned Xero Functions are absent from deployment deletion
  plans.

Exit gate:

- All tests pass from the new paths.
- The local managed Function export list matches the captured managed live set.
- Rules and indexes are semantically unchanged.
- Hosting targets are explicit and do not overlap.
- No production deployment has occurred.

Rollback point:

- Revert the structural extraction commit in the monorepo. Production remains on
  the old repositories.

### Phase 3: CI, environments, and deployment controls

Estimated effort: 2 to 3 working days.

Entry gate:

- Phase 2 complete.

Work:

- [ ] Add path-filtered validation workflows listed in section 10.
- [ ] Add manual-only Firebase and Vercel cutover workflows.
- [ ] Recreate required GitHub secrets and environment protections in the new
  repository.
- [ ] Use GitHub environments for production approval and audit history.
- [ ] Add concurrency controls so two production deploys cannot overlap.
- [ ] Add a pre-deploy Function inventory diff that fails on unexpected deletion.
- [ ] Make legacy Xero exclusions visible in the deploy report.
- [ ] Add rules and index deployment as an explicit workflow with emulator tests
  and manual production approval.
- [ ] Add preview deployments for portal and website pull requests where provider
  support allows them.
- [ ] Create a staging Firebase project, or record a signed decision to use
  emulators plus production feature flags until staging exists.
- [ ] Rebind the Vercel project to the new repository with Root Directory set to
  `apps/website`; do not promote the new integration yet.
- [ ] Configure the admin portal build and Hosting deploy from
  `apps/admin-portal`.

Exit gate:

- Every required check runs from the monorepo.
- Production workflows require approval.
- Deployment credentials are present and scoped to required resources.
- A dry run proves paths, builds, artifact locations, and inventory checks.
- Vercel preview and Firebase emulator validation pass.

Rollback point:

- Keep new workflows manual/disabled and continue deploying from old
  repositories.

### Phase 4: No-op production cutover

Estimated effort: 1 working day plus monitoring.

Entry gate:

- Phases 0 to 3 complete.
- Deploy freeze active.
- Named approver available for the entire window.
- Current backup and baseline captures completed immediately before deployment.

Work:

- [ ] Re-run every validation workflow on the exact cutover commit.
- [ ] Capture the live Function inventory again.
- [ ] Deploy the same managed Function exports from the monorepo using
  non-interactive mode and without `--force`.
- [ ] Stop if Firebase proposes deleting an unexpected Function.
- [ ] Compare the post-deploy Function inventory with the pre-deploy capture.
- [ ] Confirm the two unowned Xero Functions remain unchanged.
- [ ] Deploy rules/indexes only if their reviewed source is semantically
  equivalent to the current production release.
- [ ] Deploy the portal to its explicit Hosting target.
- [ ] Promote the Vercel project from `apps/website` after its preview passes.
- [ ] Run the smoke matrix in section 11.
- [ ] Monitor Function errors, Hosting behavior, website errors, Auth, Firestore
  denials, and enrolment submissions.
- [ ] Disable deploy triggers in the old portal and website repositories only
  after the new deployments pass.
- [ ] End the deploy freeze after the agreed monitoring window.

Exit gate:

- Function set, runtime, regions, and triggers match the approved baseline.
- Firestore and Storage behavior is unchanged.
- Portal, website, and mobile smoke checks pass.
- The next deploy can occur only from the monorepo.
- No rollback threshold has been reached during monitoring.

Rollback point:

- Use the procedures in section 12. Keep old workflows available but disabled
  until the monorepo has produced at least two stable production deployments.

### Phase 5: Shared contract foundation

Estimated effort: 2 to 4 working days.

Entry gate:

- Phase 4 stable.

Work:

- [ ] Adopt JSON Schema as the language-neutral contract source.
- [ ] Separate callable request/response schemas from Firestore document schemas.
- [ ] Add schema IDs and explicit contract versions.
- [ ] Validate Function inputs and outputs at runtime with AJV.
- [ ] Generate TypeScript types and Dart models for selected new contracts.
- [ ] Commit generated artifacts or use deterministic generation in CI; in either
  case, fail CI when generated output is stale.
- [ ] Add valid, invalid, legacy, and forward-compatible fixtures.
- [ ] Add an emulator test that exercises one contract through the backend and
  reads the result as each affected client would.
- [ ] Document compatibility rules and the contract change process.

Exit gate:

- One small, low-risk contract proves schema validation, generation, fixtures,
  and cross-client testing.
- No existing client contract has changed incompatibly.

Rollback point:

- New validation remains unused by legacy endpoints. Remove the proof contract
  without changing production documents.

### Phase 6: Tutor roll and session-feedback contract

Estimated effort: 3 to 5 working days plus mobile release adoption.

Entry gate:

- Phase 5 complete.
- Tutor roll product rules in section 13 approved.
- Required Firestore index design tested in emulators.

Work:

- [ ] Add the versioned callable and schemas.
- [ ] Add only optional server-owned fields to existing attendance and feedback
  documents.
- [ ] Deploy backend support before client use.
- [ ] Add a Remote Config or equivalent feature flag for Flutter adoption.
- [ ] Update the V3 tutor roll and feedback UI to use the callable.
- [ ] Update Tutor Dashboard `Needs attention` derivation to use explicit server
  state.
- [ ] Test old and new mobile behavior against the expanded schema.
- [ ] Release the mobile client gradually.
- [ ] Monitor callable errors, duplicate prevention, rule denials, incomplete
  feedback counts, and dashboard queries.
- [ ] Tighten legacy direct-write rules only after supported released clients
  have adopted the callable.

Exit gate:

- Roll completion is authoritative.
- Feedback is linked to its class session.
- Present students generate required feedback state; absent students do not.
- Tutor Dashboard attention cards are based on explicit roll/feedback state.
- Retried requests do not duplicate feedback.
- Old clients remain functional during the supported transition window.

Rollback point:

- Disable the Flutter feature flag and return clients to the existing direct
  flow. Additive fields remain harmless. The callable can stay deployed while
  disabled for diagnosis.

### Phase 7: Migrate other critical mutations incrementally

Estimated effort: ongoing, planned per domain.

Candidate order:

1. Tutor session submission and feedback.
2. Enrolment, waitlist, and booking mutations.
3. Invoice and payment state changes.
4. Feedback, announcements, and messaging mutations.
5. User, student, and class administration.

For every domain:

- [ ] Inventory current readers, writers, triggers, and rules.
- [ ] Define schema and endpoint compatibility.
- [ ] Deploy additive backend support.
- [ ] Migrate one client at a time behind a flag where practical.
- [ ] Monitor adoption and failures.
- [ ] Tighten permissions only when legacy support has ended.
- [ ] Record the decision and rollout in `docs/migrations`.

### Phase 8: Archive source repositories

Entry gate:

- At least two stable production deployments have run from the monorepo.
- Every active branch has moved or closed.
- Rollback procedures have been exercised or reviewed against current provider
  controls.

Work:

- [ ] Add a read-only banner and monorepo link to each source README.
- [ ] Disable all deploy credentials and workflow triggers in old repositories.
- [ ] Archive the old repositories on GitHub.
- [ ] Keep pre-monorepo tags and original remotes available.
- [ ] Update local onboarding, operations, and deployment documentation.
- [ ] Update external provider repository links.

Exit gate:

- Contributors and providers use `tenacity-platform` exclusively.
- Old repositories cannot deploy production.
- Historical links and tags remain accessible.

## 10. Continuous integration and deployment matrix

| Change area | Required validation | Deployment behavior |
| --- | --- | --- |
| `apps/mobile/**` | Flutter dependency resolution, format check, `flutter analyze`, full `flutter test` | No automatic store release |
| `apps/admin-portal/**` | `npm ci`, unit tests, production build | Preview; production Hosting requires protected main workflow |
| `apps/website/**` | Frozen Yarn install, lint, tests where present, production build | Vercel preview; production promotion from protected main |
| `backend/firebase/functions/**` | `npm ci`, unit tests, emulator tests, export smoke, inventory diff | Production Functions deploy requires approval |
| `backend/firebase/rules/**` | Rules tests in emulator and affected-client integration fixtures | Production rules deploy requires approval |
| `backend/firebase/indexes/**` | JSON validation, emulator/query fixtures, reviewed index diff | Production index deploy requires approval |
| `contracts/**` | Schema validation, code generation, stale-output check, Dart/TypeScript fixture compilation | No deploy until affected clients and backend pass |
| `firebase.json` or `.firebaserc` | Full backend, rules, portal build, target validation, deploy-plan review | Manual approval only |
| Shared tooling/root scripts | Every affected job | No direct production deploy |

Additional controls:

- Cancel superseded validation runs on the same branch.
- Allow only one production Firebase deployment at a time.
- Pin action versions and runtime versions.
- Keep production secret values in provider secret stores.
- Print resource names and intended changes, never secret values.
- Block Functions deploy when an unexpected deletion appears.
- Store test results and deployment manifests as workflow artifacts.

## 11. Cutover smoke matrix

### Mobile

- Sign in as tutor, parent, and admin test accounts.
- Load each role dashboard and navigation shell.
- Load timetable/classes and attendance data.
- Open announcements and messages.
- Load invoices and begin a payment flow without completing a real charge unless
  the approved test method allows it.
- Confirm Auth, App Check, Functions region, Storage, and Remote Config calls.

### Admin portal

- Sign in and load dashboard data.
- Open users, classes, attendance, enrolments, invoices, and resources.
- Exercise one read-only report and one approved non-destructive callable.
- Confirm Hosting rewrites and direct-route refreshes.
- Confirm no unexpected Firestore permission errors.

### Public website

- Load public pages and current class availability.
- Submit an approved test enrolment through the server API and remove the test
  record through the normal administrative path.
- Verify Turnstile behavior, Firebase Admin credentials, emails in the approved
  test mode, custom domains, redirects, and analytics.

### Backend and platform

- Compare Function inventories before and after deployment.
- Check Function error logs and scheduler/trigger executions.
- Confirm Firestore and Storage rule denials have not increased unexpectedly.
- Confirm Hosting site and Vercel deployment versions.
- Confirm the legacy Xero Functions were not modified.

## 12. Rollback plan

### Functions

- Stop the workflow if the deploy plan contains an unexpected deletion.
- Redeploy the previous known-good monorepo tag or captured source artifact.
- Do not use a broad forced deploy to repair inventory drift.
- Compare the live list again after rollback.

### Firestore and Storage rules

- Keep the exact previous known-good rule sources and release identifiers.
- Redeploy the previous rules from the protected rollback workflow.
- Re-run client smoke tests after rollback.

### Firestore indexes

- Add indexes before dependent code.
- Avoid index removal during migration.
- If a new query fails, disable its feature flag and keep the additive index while
  diagnosis continues.

### Admin portal Hosting

- Roll back to the previous Firebase Hosting release for the named site.
- Confirm custom domain and direct-route behavior after rollback.

### Public website

- Promote the previous Vercel production deployment.
- Restore the prior repository integration if the new root cannot build.

### Mobile contract rollout

- Disable new client behavior through Remote Config.
- Keep additive document fields and new callable exports in place unless they are
  the cause of the incident.
- Maintain old direct behavior until the supported adoption window closes.

### Repository migration

- Re-enable the old deployment workflow only under an incident change record and
  named approval.
- Original repositories and pre-monorepo tags remain the source rollback points
  until archival criteria pass.

## 13. First shared contract: tutor roll and feedback

This contract removes the dashboard's dependence on `updatedBy == system` as a
proxy for an unmarked roll. That field is also changed by attendance generation,
propagation, and cancellation, so it cannot be the authoritative completion
signal.

### Product rules

- A tutor or admin explicitly marks the roll for a class session.
- Every student marked present requires session feedback.
- A student marked absent does not require feedback.
- Required feedback becomes due when the class session ends.
- Feedback belongs to the attendance session and class that produced it.
- Roll completion and feedback completion are separate explicit states.
- Repeating the same request must not create duplicate feedback.
- Historic sessions are not automatically made overdue by the new schema.

### Proposed callable

`submitTutorSession`

Request envelope:

```json
{
  "contractVersion": 1,
  "requestId": "client-generated-uuid",
  "payload": {
    "classId": "class-id",
    "attendanceId": "attendance-id",
    "students": [
      {
        "studentId": "student-id",
        "attendanceStatus": "present",
        "progressStatus": "onTrack",
        "feedbackText": "Session feedback"
      }
    ]
  }
}
```

Accepted `attendanceStatus` values are `present` and `absent`. Accepted
`progressStatus` values are `ahead`, `onTrack`, and `needsSupport` when feedback
is supplied. The final names must be recorded in JSON Schema and generated
client models before implementation.

### Server responsibilities

- Authenticate the caller.
- Authorise the assigned tutor or an admin.
- Verify the attendance belongs to the supplied class.
- Verify every submitted student belongs to the session roster.
- Reject duplicate student entries and unknown enum values.
- Use `requestId` for idempotency.
- Update the existing attendance map and explicit roll state in one transaction.
- Derive required feedback IDs from students marked present.
- Compute `feedbackDueAt` from server-authoritative session timing in the
  `Australia/Sydney` timezone, without trusting the client clock.
- Create or update feedback with a deterministic session/student identity.
- Maintain feedback completion state from actual feedback writes.
- Return the authoritative roll and feedback state.
- Write an audit event without including feedback text in routine logs.

### Additive attendance fields

```text
rollStatus: "marked"
rollMarkedAt: Timestamp
rollMarkedBy: uid
feedbackRequiredStudentIds: [studentId]
feedbackCompletedStudentIds: [studentId]
feedbackStatus: "notRequired" | "pending" | "complete"
feedbackDueAt: Timestamp | null
feedbackOutstandingCount: number
```

Existing attendance fields remain readable and writable under the agreed legacy
transition. New generated attendance documents need no roll state until a
session is marked; dashboard logic treats pre-contract sessions according to a
documented cutover date so history does not suddenly appear overdue.

### Additive feedback fields

```text
classId: classId
attendanceId: attendanceId
progressStatus: "ahead" | "onTrack" | "needsSupport"
requestId: idempotency key
```

Existing fields such as student, tutor, parent audience, text, creation time,
and unread state remain unchanged for compatibility.

### Dashboard derivation

Tutor Dashboard `Needs attention` includes:

- a non-cancelled assigned session whose end time has passed and whose explicit
  roll is not marked, subject to the contract cutover date;
- an assigned session with `feedbackStatus == pending` and
  `feedbackDueAt <= now`.

The query and index design must be proven with emulator fixtures before client
implementation. If the optimal query needs a denormalised tutor-specific task
collection, add it behind the same contract instead of making the Flutter client
scan unbounded attendance history.

### Compatibility sequence

1. Deploy schemas, indexes, rules, and callable support.
2. Leave existing fields and direct client paths functional.
3. Enable new behavior for internal/test tutors.
4. Release Flutter with the feature disabled by default.
5. Expand the flag while monitoring errors and document state.
6. Make the new contract the default after stable adoption.
7. Remove legacy write permission only after the minimum supported app version
   has passed its migration window.

## 14. Data-contract strategy

### Contract source

JSON Schema is the canonical format because the backend and web clients can
validate it directly and Dart models can be generated from it. Schemas should
use stable identifiers such as:

```text
https://contracts.tenacitytutoring.com/callables/submit-tutor-session/v1/request
https://contracts.tenacitytutoring.com/firestore/attendance/v1
```

The identifiers do not require a public schema server at the start; they provide
stable names and can be published later.

### Change rules

- Adding an optional field with a safe default is backward-compatible.
- Adding an enum value requires reader review because exhaustive clients can
  fail on unknown values.
- Renaming, removing, or changing a field type is breaking.
- A breaking callable request or response gets a new version and, when needed,
  a new Function name.
- Firestore readers must tolerate absent optional fields during rollout.
- Server-owned derived fields cannot be written directly by ordinary clients.
- A contract pull request includes fixtures for old and new shapes.

### First migration boundaries

Do not attempt to model every existing Firestore collection immediately. Add
contracts when a domain is changed or when drift has already caused defects.
Priority domains are attendance, feedback, enrolments, invoices, users, and
classes.

## 15. Key risks and controls

| Risk | Control |
| --- | --- |
| Uncommitted V3 work is omitted | Finish, test, and commit it before mirror import; verify `redesign-v3` in the new repository |
| Website user changes are lost | Leave the dirty source tree untouched; explicitly decide how `.gitignore` and `.design-sync/` move |
| Git history becomes hard to trace | Use filter-repo path rewrites, prefixed tags, imported SHA log, and `git log --follow` checks |
| A Functions deploy deletes a live resource | Capture live inventory, fail on unexpected deletion, avoid `--force`, protect legacy Xero Functions |
| Portal-owned backend assumptions remain | Move Firebase files to platform paths, add CODEOWNERS, and change all deployment docs |
| Compiled-only Function logic is rewritten accidentally | Preserve `lib` during structural cutover and schedule source recovery separately |
| Default Firebase Hosting is overwritten | Use explicit named targets and audit live domains/routes before first deploy |
| Vercel loses repository access | Confirm ownership of the current website repository and new monorepo before rebinding |
| Rules are deployed without tests | Require emulator rule tests and protected production approval |
| Mobile release lag creates schema incompatibility | Use additive fields, tolerant readers, feature flags, and a supported transition window |
| Duplicate session feedback is created | Use request idempotency plus deterministic attendance/student identity |
| A generated contract drifts | Run deterministic generation and stale-output checks in CI |
| Migration and product changes become inseparable | Finish no-op cutover before the tutor-session product contract |
| One production Firebase project limits validation | Create staging or record and control the temporary emulator-plus-feature-flag exception |

## 16. Decisions required before execution

| ID | Decision | Recommendation | Status |
| --- | --- | --- | --- |
| D01 | GitHub owner for `tenacity-platform` | Use private `tsowmi03/tenacity-platform` now; transfer later if a shared organisation is created | Resolved |
| D02 | Timing of mobile `redesign-v3` import | Import the reviewed checkpoint from pushed branch `redesign-v3` | Resolved |
| D03 | Website `.design-sync/` ownership | Commit authored configuration, previews, shims, and override; ignore dependencies, caches, and generated output | Resolved |
| D04 | Legacy mobile Hosting pages | Restore the store-linked `/terms.html` route from committed mobile source before the portal baseline merge; decide its final named target during Hosting extraction | In progress |
| D05 | Staging Firebase project | Create staging before the first new shared product contract | Open |
| D06 | Production deploy approver | Name one primary and one backup approver | Open |
| D07 | Source repository archive timing | After two stable production deploys from the monorepo | Proposed |
| D08 | Rules source differs from production | Intended local rules passed all 16 emulator tests, were deployed separately, and now match production | Resolved |
| D09 | Three live Firestore indexes are absent from source | Added all three without removing existing indexes; source and production now match 27 of 27 | Resolved |
| D10 | Website canonical GitHub URL changed | Local `origin` and the future mirror import use `tsowmi03/tenacity-tutoring` | Resolved |
| D11 | Duplicate Vercel project linked to the website repository | Rebind only `tenacity-tutoring-tqi9`; consider retiring `tenacity-tutoring` after stable cutover | Open |

## 17. Active progress tracker

### Status key

- `[x]` Complete.
- `[-]` In progress.
- `[ ]` Not started.
- `[!]` Blocked by a decision or external access.

### Migration snapshot

| Workstream | Status | Evidence / next action |
| --- | --- | --- |
| Architecture direction | `[x]` | Platform-level Firebase ownership and monorepo target documented |
| Current repository inventory | `[x]` | Three Git repositories, runtimes, dirty state, canonical remotes, and Firebase boundaries reviewed through 21 July 2026 |
| Target repository structure | `[x]` | Structure and ownership matrix defined in this plan |
| History migration method | `[x]` | Mirror plus `git filter-repo` method and verification gate defined |
| CI/deployment design | `[x]` | Path matrix, approvals, inventory check, smoke suite, and rollback defined |
| Shared contract design | `[x]` | JSON Schema approach and first tutor-session contract proposed |
| Plan review and decisions | `[-]` | Finish D04 and resolve D05 to D07 and D11; D01 to D03 and D08 to D10 are closed |
| Phase 0 baselines/freeze | `[-]` | Source, Firebase, Hosting, and Vercel baselines are captured; pull-request merges, tags, and freeze remain |
| Phase 1 history import | `[ ]` | Empty private destination created; no history imported yet |
| Phase 2 Firebase extraction | `[ ]` | Current portal remains authoritative |
| Phase 3 CI/provider setup | `[ ]` | Current workflows remain unchanged |
| Phase 4 production cutover | `[ ]` | Cutover has not begun; the current portal remains the deployment owner |
| Phase 5 contract foundation | `[ ]` | Starts after stable no-op cutover |
| Phase 6 tutor session contract | `[ ]` | Product rules require final approval |
| Phase 7 domain migrations | `[ ]` | Future incremental work |
| Phase 8 source archive | `[ ]` | Requires two stable monorepo deploys |

### Progress log

| Date | Change | Evidence / follow-up |
| --- | --- | --- |
| 20 Jul 2026 | Completed current-state audit | Verified the Flutter, portal/backend, and public website checkouts, deployment files, workflows, package manifests, Git state, and Firebase ownership documentation |
| 20 Jul 2026 | Defined target architecture and execution plan | Added history preservation, phased cutover, CI matrix, rollback, contract strategy, decisions, and active tracking |
| 21 Jul 2026 | Started Phase 0 source and validation baselines | Remote `main` SHAs matched local source refs. Flutter, portal, Functions, rules, emulator, and website checks passed. |
| 21 Jul 2026 | Captured live Firebase inventory | Verified 83 managed deployable endpoints against source, protected two legacy Xero resources, and recorded Hosting, extensions, rules releases, secrets, parameters, schedules, service accounts, and IAM metadata outside the public repo. |
| 21 Jul 2026 | Found pre-cutover source drift | Production has three indexes absent from source, and both deployed rulesets differ from local source. Vercel inventory remains blocked by expired local Vercel authentication. |
| 21 Jul 2026 | Resolved Firebase source drift | Added the three live indexes to portal source, deployed the tested local Firestore and Storage rules separately, and verified exact source-to-live matches for 27 indexes and both rulesets. |
| 21 Jul 2026 | Created the destination and preserved website state | Created empty private `tsowmi03/tenacity-platform`, committed and pushed the reviewed design-sync baseline, corrected the canonical website remote, and opened draft website PR 2. |
| 21 Jul 2026 | Completed the Vercel baseline | Verified that `tenacity-tutoring-tqi9` owns the custom domains and nine named environment variables, while the duplicate `tenacity-tutoring` project serves Vercel aliases only. Recorded both production deployments in the private portal migration record without secret values. |
| 21 Jul 2026 | Found a store-linked Hosting route gap | Live `/terms.html` returns the admin portal shell because the static legal page is absent from portal source. Added the committed mobile terms page to the portal Phase 0 branch for release before tagging. |

## 18. Execution checklist summary

- [ ] Close D01 to D11 and resolve the Phase 0 source drift.
- [ ] Complete Phase 0 and tag reproducible source state.
- [ ] Import histories and branches into the new repository.
- [ ] Extract Firebase into platform-owned paths without behavior changes.
- [ ] Establish protected CI and deployment workflows.
- [ ] Run the no-op production cutover and monitoring window.
- [ ] Establish contract generation and integration tests.
- [ ] Ship the tutor roll and feedback contract behind a feature flag.
- [ ] Migrate further critical mutations one domain at a time.
- [ ] Archive old repositories after the stability gate.

## 19. Relationship to the V3 redesign

The Flutter V3 redesign remains tracked in `V3_REDESIGN_ROADMAP.md`. The
monorepo migration does not need to wait for the entire redesign. The safe
sequence is:

1. Commit a coherent current V3 checkpoint.
2. Preserve and import the `redesign-v3` branch.
3. Complete the no-op monorepo cutover.
4. Build the tutor roll and feedback contract in the monorepo.
5. Connect V3 Tutor Dashboard and Class Roll screens to that contract.

This prevents a temporary repository move from freezing the whole redesign and
prevents new shared backend work from increasing the current ownership split.
