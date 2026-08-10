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

`.github/workflows/vercel-production.yml` is the only supported route. It is
manual-dispatch-only, runs in the protected `tenacity-production` environment,
and does nothing unless `TENACITY_PRODUCTION_DEPLOYS_ENABLED` is `true` for a
recorded window. Dispatch it with the exact current `main` SHA, the confirmation
string `DEPLOY WEBSITE tenacity-tutoring-tqi9`, and the cutover execution record
issue number.

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
