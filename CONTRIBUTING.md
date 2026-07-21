# Contributing

## Branch and pull-request policy

Create a focused branch from `main` and merge through a pull request. Use a
descriptive prefix such as `feature/`, `fix/`, or `migration/` and include the
affected area where it improves clarity.

Every pull request must:

- identify every affected application or platform surface;
- describe whether runtime behavior, persisted data, permissions, deployment,
  or provider bindings change;
- record the exact validation commands and results;
- state the rollback path for deployment or migration work; and
- record the owner self-review while one maintainer has access, or obtain the
  independent reviews required below once eligible owners are available.

Do not combine a repository move with a behavior change. This rule is strict
during the Firebase ownership extraction and no-op cutover.

## Ownership rules

Ownership paths are documented in
[`.github/CODEOWNERS`](.github/CODEOWNERS). On the current GitHub plan,
CODEOWNERS does not automatically request or require review for this private
personal repository. When that feature becomes available, it still cannot
express every required combination of reviewers. Apply these additional rules:

| Change | Required review |
| --- | --- |
| One application only | Owner of that application |
| `backend/firebase/**` | Backend owner |
| Root Firebase configuration | Backend owner and deployment owner |
| Root workflows | Deployment owner, plus backend owner when Firebase is affected |
| Firebase rules, shared contracts, or shared API behavior | Backend owner and the owner of every affected client |
| Generated contract output | Owners of the schema source and each generated client target |
| Migration records and repository governance | Repository owner and migration owner |

Only `@tsowmi03` currently has repository write access. Until a second eligible
repository owner is granted write access and added to every applicable explicit
CODEOWNERS pattern, CODEOWNERS is advisory and an author's review is not an
independent approval. The author must still perform and record a full
self-review before merge. The second repository owner and the production deploy
approver may be the same person, but they are separate responsibilities.

## Phase 1 restrictions

Phase 1 hardens the imported repository without changing production ownership.
Phase 1 pull requests must not:

- add or enable a root deployment workflow;
- add secrets, environment values, or provider credentials;
- rebind Firebase Hosting or Vercel;
- deploy Functions, rules, indexes, Hosting, or the website;
- change a Firebase project alias; or
- change application behavior while documenting the import.

The nested workflows under `apps/admin-portal/.github/workflows/` are inert
historical references. Do not copy or move them verbatim. Phase 3 must create
new root workflows with monorepo paths, test gates, environment approval, and
Function-inventory controls.

## Validation

Run every applicable command from the root README. Before committing:

1. Inspect the complete diff and confirm unrelated files are absent.
2. Run `git diff --check`.
3. Run the affected application tests, analyzers, builds, and emulator checks.
4. Confirm documentation links and commands point to tracked files.
5. For history work, run `git fsck --full` and verify source-to-subtree identity.

If a check cannot run, record the exact reason and treat it as an open review
item. Do not describe an unrun check as passing.

## Production changes

Production changes require a separately reviewed cutover or deployment plan.
The pull request must record the before and after inventory, approval, smoke
checks, monitoring window, and rollback command. A source move alone must
produce no runtime or permission change.
