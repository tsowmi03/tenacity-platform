# GitHub branch protection

- Repository: `tsowmi03/tenacity-platform`
- Target branch: `main`
- Checked: 22 July 2026
- Current status: blocked by the GitHub plan

## Current state

The repository is private and owned by the personal `tsowmi03` account. GitHub
reports `main` and `feature/mobile/redesign-v3` as unprotected. The repository
has one collaborator, `@tsowmi03`, with admin access and no repository teams.

Both the branch-protection and repository-rulesets APIs returned HTTP 403 with:

```text
Upgrade to GitHub Pro or make this repository public to enable this feature.
```

The repository must remain private. Do not make it public to obtain branch
protection. Activate the settings below after GitHub Pro is available or the
repository moves to an account plan that supports protection for private
repositories.

Until then, `main` is PR-only by project policy, but GitHub cannot enforce that
policy.

## Solo project policy

This project is currently solo-operated. Do not require an independent
reviewer, CODEOWNERS review, or deployment approver while `@tsowmi03` is the
only engineer. Those controls would deadlock normal maintenance without adding
a real review boundary.

Until GitHub branch protection is available, `main` remains PR-only by project
policy and by local operating discipline, but not by provider enforcement. This
does not block staging Firebase setup, repository configuration updates, inert
rehearsal design, or documentation work. Under the selected execution model it
does block adding staging credentials, activating staging workflows, or running
privileged staging rehearsal. It also blocks claiming that `main` is
provider-protected.

Before any protected staging or production credential is configured, any
deployment workflow is moved into `.github/workflows/`, or Phase 4 begins,
upgrade the private personal repository to GitHub Pro and enforce Stage A. The
[solo authorization record](solo-production-authorization.md) supplements this
provider control; it does not replace it.

## Stage A settings

Use these settings while `@tsowmi03` is the sole write collaborator:

- require a pull request before merging;
- require zero independent approvals so owner-authored PRs are not deadlocked;
- enforce the rule for administrators;
- require conversation resolution;
- require linear history;
- block force pushes;
- block branch deletion;
- require `Validate platform / Required validation gate` and require the branch
  to be current before merge;
- configure no required deployments; and
- configure no bypass actor.

This stage blocks direct pushes while keeping the repository operable with one
maintainer. It is optional for emulator work and provider or repository setup
that introduces no credential or discoverable deployment path. It is mandatory
before protected staging credentials, staging workflow activation, privileged
staging rehearsal, production credentials, production workflow activation, or
Phase 4.

After Stage A is verified, create `tenacity-staging` for the rehearsal path and
`tenacity-production` for the later cutover path. Allow deployments only from
protected `main`. On GitHub Pro each environment scopes secrets and branch
policy but has no independent required reviewer for this private repository.

## Stage B settings

After a second repository owner has write access and is added to every
applicable explicit CODEOWNERS line:

- require one approval;
- require review from CODEOWNERS;
- dismiss stale approvals when new commits are pushed;
- require approval of the most recent reviewable push; and
- retain every Stage A setting.

The stable non-deployment check was established in Phase 3. Do not make a
deployment environment or a production workflow a branch-protection
requirement.

Repository ownership and production deployment approval are separate. Stage B
is deferred until there is a real second maintainer.

## Verification after activation

Record the resulting API response and confirm:

1. the API or ruleset response shows PR-only enforcement applies to admins;
2. a pull request can merge under the active stage;
3. force push and deletion remain disabled; and
4. no production workflow or deployment gate was enabled as a side effect.
