# GitHub branch protection

- Repository: `tsowmi03/tenacity-platform`
- Target branch: `main`
- Checked: 22 July 2026
- Current status: Stage A active and API-verified

## Current state

The repository is private on GitHub Pro, owned by the personal `tsowmi03`
account, with one collaborator holding admin access. Stage A protection was
applied to `main` on 22 July 2026 and the API response confirmed every
setting: pull request required with zero approvals, enforced for
administrators, strict required `Required validation gate` status check,
required conversation resolution, required linear history, and force pushes,
deletions, and bypass actors all absent.

Required linear history means pull requests now merge by squash or rebase,
not merge commits.

The repository must remain private. Do not make it public.

## Solo project policy

This project is currently solo-operated. Do not require an independent
reviewer, CODEOWNERS review, or deployment approver while `@tsowmi03` is the
only engineer. Those controls would deadlock normal maintenance without adding
a real review boundary.

With Stage A active, `main` is PR-only by provider enforcement, which
satisfies the precondition for the protected staging environment, federated
staging identities, and active staging workflows. Production credentials,
production workflow activation, and Phase 4 additionally require the
[solo authorization record](solo-production-authorization.md), which
supplements this provider control and does not replace it. Do not weaken or
remove Stage A while any deployment workflow is discoverable.

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

## Why this matters more now

The website and admin portal deploy automatically when `Validate platform`
succeeds on `main`. Stage A and the strict required gate are therefore the last
controls between a merge and production, not merely repository hygiene. Do not
weaken either while auto-deploy is enabled. See
[production deployment](production-deployment-controls.md).
