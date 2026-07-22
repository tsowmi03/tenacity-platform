# Solo production authorization

- Applies to: production workflow activation and Phase 4 cutover
- Operator: `@tsowmi03`
- Selected: 22 July 2026

This project is currently maintained by one engineer. Independent review,
CODEOWNERS enforcement, and a backup production approver are deferred until a
second maintainer exists. This runbook defines the compensating controls; it
does not waive validation, branch protection, staging rehearsal, rollback, or
evidence requirements.

## Mandatory provider controls

Before any production credential is added, any production workflow becomes
discoverable, or Phase 4 begins:

- the private personal repository must use GitHub Pro or a later plan that
  supports private-repository protection;
- Stage A protection from `github-branch-protection.md` must be verified on
  `main` with no administrator bypass;
- the stable `Validate platform / Required validation gate` must be strict and
  required;
- `tenacity-production` must accept deployments only from protected `main` and
  scope its secrets and variables; and
- `TENACITY_PRODUCTION_DEPLOYS_ENABLED` must remain `false`.

The environment is a credential and branch-policy boundary. It does not
provide independent approval on the selected account model. A written record
supplements these controls and does not replace branch protection.

## Two-record model

Do not place an exact final merge SHA in the pull request that creates that
SHA. Use two linked records in a private repository issue.

### Readiness record

Initialize the readiness record before opening the draft workflow-activation
pull request. Complete it only after the pull request reaches its final reviewed
head and every required validation check passes. Include:

- record ID and state `preparing` or `ready`;
- operator and selected window;
- activation branch, pull request, reviewed head SHA, and validation run;
- exact production workflow files proposed for activation;
- Stage A and environment-policy evidence;
- confirmation that production credentials are scoped and the arming value is
  `false`;
- staging bootstrap and rehearsal run IDs plus evidence-manifest digests;
- Vercel integration evidence;
- authorized surfaces, typed confirmations, freeze scope, abort conditions,
  monitoring thresholds, and rollback procedures; and
- owner self-review and explicit risk acceptance for solo operation.

The readiness record authorizes review and merge of inert production workflow
activation only. It does not authorize a provider deployment.

### Cutover execution record

Create or update the linked record after the activation pull request merges and
before arming. Include:

- record ID and state `ready-to-arm`, `armed`, `executing`, `completed`, or
  `aborted`;
- exact current `main` SHA and successful full validation run URL;
- fresh provider baselines, backups, and rollback identifiers;
- each authorized workflow, surface, run ID, attempt, and typed confirmation;
- production and staging target identifiers;
- credential-scope verification without secret values;
- operator session/access checks and the complete deployment window;
- cross-repository and provider-console freeze owner and scope;
- the arming transition `false -> true -> false` with timestamps;
- smoke results, monitoring duration, measurable rollback thresholds, and
  final outcome; and
- confirmation that old deployment paths and provider rollback remain
  available.

Reset the arming variable to `false` after completion, failure, cancellation,
or timeout. An inability to record that reset is an abort condition and
requires immediate provider-state inspection.

## Lifecycle

Use one private issue per cutover window. Do not edit away prior values; append
state transitions and corrections as timestamped comments. Link every workflow
artifact and evidence manifest to that issue without copying credentials,
tokens, raw Function environment data, or other secrets into it.

The activation pull request must add a record ID or digest input to the final
production workflows before they are made discoverable, so workflow evidence
can be matched to the execution record.

## Later Stage B

When a second eligible maintainer receives write access, enable Stage B review
and CODEOWNERS enforcement. That later change strengthens the process but is
not required for staging work or for the documented solo-production model.
