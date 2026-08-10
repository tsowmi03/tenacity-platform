# Solo production authorization

- Operator: `@tsowmi03`
- Applies to: every production deployment from this repository

This project is maintained by one engineer. Independent review, CODEOWNERS
enforcement, and a backup production approver are deferred until a second
maintainer exists. This runbook records what compensates for that, and what
deliberately does not.

## What a solo operator changes

A control that works by requiring a second person does not work here. It
produces the *appearance* of review while the same individual holds every key,
and it costs real time on every change. Two decisions follow from that, and
they are consistent with each other:

- `main` requires a pull request but **zero** approving reviews. See
  [branch protection](github-branch-protection.md).
- Deployment requires no pre-authorization ceremony. There is no readiness
  record to complete and no arming variable to set, because "the operator
  authorized themselves" was never an independent control.

What is kept is everything a machine can check without a second human:
protected-branch enforcement including for administrators, a strict required
validation gate, the protected `tenacity-production` environment as the
credential boundary, typed confirmations, and per-surface verification and
rollback. Those are described in
[production deployment](production-deployment-controls.md).

Note one structural gap that no setting here can close: GitHub Pro does not
offer required reviewers on private-repository environments. The absence of an
approval step is therefore a property of the plan, not a choice made to save
effort — and it is unchanged either way.

## The deploy record

Every deployment still produces a record, but it is generated rather than
written. `deploy-record.yml` opens a `Production deploy <sha12>` issue before
the privileged job runs and closes it with the outcome, one record per commit
across every surface deployed from it.

The record's job is evidence: which commit, which run, which surfaces, what
happened. That function is fully preserved. The thing that was dropped —
recording an intention to deploy *before* deploying, as though it were an
approval — never constrained anything.

## Mandatory provider controls

These must hold while any production workflow exists:

- the repository plan must support private-repository branch protection;
- Stage A protection must be enforced on `main` with no administrator bypass;
- `Validate platform / Required validation gate` must be strict and required;
  and
- `tenacity-production` must accept deployments only from protected `main` and
  scope its own secrets and variables.

Two of these carry more weight than they used to, because the website and admin
portal now deploy automatically on merge: Stage A and the required validation
gate are the last things standing between a merge and production. Do not weaken
either.
