# Vercel deployment

Production deploys from this repository. The Phase 4 no-op cutover completed on
24 July 2026, and the public website is one of the five production surfaces now
owned here — see the
[production deployment controls](../../../docs/operations/production-deployment-controls.md).

The canonical project is `tenacity-tutoring-tqi9`. The tracked `vercel.json`
disables automatic production aliasing, so a build is staged unaliased and
promoted only after verification. `tsowmi03/tenacity-tutoring` no longer serves
production but must stay available until the two-deployment archive gate is
satisfied; do not archive it yet.

## Local validation

Run from `apps/website` with Node.js 22:

```bash
corepack enable
corepack prepare yarn@1.22.19 --activate
yarn install --frozen-lockfile
yarn lint
yarn build
```

These commands do not contact Vercel or authorize a deployment.

## Deploying

**A website change goes live on its own.** Merging to `main` runs
`Validate platform`; when that succeeds, `vercel-production.yml` picks up the
same commit and deploys it. There is nothing to dispatch, arm, or write.

Two conditions have to hold, both decided by
`scripts/ci/resolve-deploy-context.mjs`:

- something under `apps/website/` actually changed (documentation there does
  not count), and
- the same commit did **not** also change the backend. A merge touching both
  skips auto-deploy and says so, because the site must not go live against
  rules or Functions that have not deployed yet. Dispatch the production
  orchestrator for those, which deploys in order.

Manual dispatch still exists for reruns and for deploying a specific commit:
supply the SHA and the confirmation string `DEPLOY WEBSITE
tenacity-tutoring-tqi9`. A dispatch skips the path checks — it is an explicit
instruction.

Either way the run opens and closes its own deploy record issue.

`github.autoAlias: false` in `vercel.json` must stay. It is what stops the
Vercel Git integration aliasing the domain to its own build, which would race
the workflow's staged-then-promoted deployment. The `validate` job asserts it.

## Rolling back

`vercel-rollback-production.yml`, dispatched with the previous deployment URL
and `ROLLBACK WEBSITE tenacity-tutoring-tqi9`. Every deploy records the URL it
replaced as `production-before.json` in its evidence artifact. The rollback
verifies the domain resolves to the restored deployment and smoke-tests it.

The workflow stages an unaliased Production build, verifies the exact owner,
project, commit metadata, READY state, and absence of the production domain,
then performs read-only smoke checks on `/` and `/register` before promoting
that exact deployment and confirming the production domain resolves to its
deployment ID. Smoke checks never submit the registration form or write
production Firebase data.

Rollback is `vercel rollback` against the previous production deployment URL,
which the workflow captures before promotion. Record it in the cutover issue
before arming.

Do not deploy from a workstation, convert the workflow to a push trigger, or
add domains outside a recorded window. Read the
[production deployment runbook](../../../docs/operations/production-deployment-controls.md)
first — it governs every production deployment from this repository, and a
completed window authorizes only itself.
