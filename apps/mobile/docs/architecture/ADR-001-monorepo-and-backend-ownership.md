# ADR-001: Monorepo and backend ownership

- Status: Accepted for migration planning
- Date: 21 July 2026
- Related plan: `TENACITY_PLATFORM_MONOREPO_MIGRATION_PLAN.md`

## Context

Tenacity currently operates three application repositories:

- a Flutter mobile application;
- a React and Vite admin portal;
- a Next.js public website.

All three applications use Firebase project `tenacity-tutoring-b8eb2`. Active
Cloud Functions, Firestore rules and indexes, Storage rules, emulators, and
Firebase Hosting are owned by the admin portal repository. This makes a shared
platform dependency appear application-specific and separates backend changes
from some of their affected clients.

The mobile repository also contains legacy Firebase Hosting configuration for
support pages. The portal and mobile manifests can both address the default
Hosting site, which creates an unsafe deployment ambiguity.

## Decision

Create a history-preserving `tenacity-platform` monorepo with these boundaries:

- `apps/mobile` owns the Flutter client;
- `apps/admin-portal` owns the portal client;
- `apps/website` owns the public website;
- `backend/firebase` owns shared Functions, rules, and indexes;
- root `firebase.json` and `.firebaserc` own Firebase deployment configuration;
- `contracts` owns versioned cross-client schemas and generated types.

Firebase Hosting will use explicit named targets. The admin portal will remain
on Firebase Hosting. The public website will remain on Vercel with an explicit
monorepo root. Mobile support pages will receive a separate named target only if
their routes cannot move safely to the public website.

The structural cutover will preserve application behaviour, production Function
inventory, rules, indexes, runtimes, package managers, and deployment providers.
Product contract work begins after the repository and deployment cutover is
stable.

## History and cutover policy

- Import committed source refs from fresh mirror clones using `git filter-repo`.
- Prefix source tags to avoid collisions.
- Keep active branches, authors, dates, messages, and representative file
  history accessible.
- Rehearse the import in a disposable local repository before creating the final
  combined history.
- Keep production workflows disabled in the monorepo until validation and
  provider configuration pass.
- Do not use `firebase deploy --force` during migration.
- Stop a Functions deployment if it proposes an unexpected deletion.
- Preserve the two legacy Node 18 Xero resources outside the managed export set.
- Keep the original repositories available as rollback references until the
  monorepo has completed at least two stable production deployments.

## Consequences

- Shared backend changes can be reviewed with every affected client.
- Deployment ownership becomes explicit and protected at the platform root.
- Existing build systems and lockfiles remain independent during the migration.
- CI must route checks by changed path and prevent concurrent production
  deployments.
- Existing source and production drift must be resolved before the no-op
  cutover. Phase 0 currently tracks Firestore index drift and Firestore and
  Storage rule drift.
- Recovery of compiled-only Function source remains a separate project after
  cutover.

## Rejected alternatives

### Copy current working trees into a new repository

This would omit committed history and could silently include local-only files.

### Keep Firebase under the portal application

This would preserve the current ownership split and continue to hide shared
backend impact from the mobile and website clients.

### Combine the migration with the V3 redesign or backend rewrite

This would make structural and behavioural rollback inseparable.
