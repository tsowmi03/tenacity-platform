# Vercel deployment

The canonical project is `tenacity-tutoring-tqi9`, connected to this
repository (`tsowmi03/tenacity-platform`) via Vercel's GitHub integration.
Every push to `main` builds and deploys automatically; production
deployments are auto-aliased to `tenacitytutoring.com` with no manual
promotion step.

## Local validation

Run from `apps/website` with Node.js 22:

```bash
corepack enable
corepack prepare yarn@1.22.19 --activate
yarn install --frozen-lockfile
yarn lint
yarn build
```

These commands do not contact Vercel or trigger a deployment.

## Rollback

If a merged commit needs to come back off production, either revert the
commit on `main` and let the next push redeploy, or use `vercel rollback`
(or the Vercel dashboard's "Promote to Production" on an earlier
deployment) to point the domain at a prior READY production deployment
without waiting on a new build.
