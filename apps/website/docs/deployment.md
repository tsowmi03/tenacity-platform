# Vercel deployment

> Migration hold: do not import this monorepo as a new Vercel project, rebind
> the existing project, add or move domains, enable automatic deployments, or
> deploy from this repository before the reviewed no-op cutover.

Production ownership remains with the original `tsowmi03/tenacity-tutoring`
repository. The canonical project is `tenacity-tutoring-tqi9`; the tracked
`vercel.json` only disables automatic production aliasing for the future
cutover.

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

## Future cutover

The reviewed production design remains inert at
`../../../docs/operations/workflow-templates/vercel-production.yml`. It must not
move into `.github/workflows` until every gate in the
[production deployment runbook](../../../docs/operations/production-deployment-controls.md)
is closed in a separate pull request.

The cutover design stages an unaliased Production build, verifies the exact
owner, project, commit metadata, READY state, and absence of the production
domain, then performs read-only smoke checks before promotion. Smoke checks
must never submit the registration form or write production Firebase data.
