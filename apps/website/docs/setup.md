# Setup and installation

This guide covers the website workspace inside the Tenacity platform
monorepo. It does not authorize production Firebase or Vercel changes.

## Prerequisites

- Node.js 22
- Corepack, included with Node.js
- Git

## Install

From the monorepo root:

```bash
cd apps/website
corepack enable
corepack prepare yarn@1.22.19 --activate
yarn install --frozen-lockfile
```

Use Yarn for this workspace. Do not generate or commit an npm lockfile.

## Configure local environment

Create an untracked `apps/website/.env.local` using the
[environment variable guide](./environment-variables.md). Use an isolated
non-production Firebase project for write testing. Do not use production
credentials or alter production data during migration validation.

The [Firebase setup notes](./firebase-setup.md) describe the non-production
boundary. Creating a new provider project is a separate, explicitly approved
operation; it is not part of repository setup.

## Validate and run

```bash
yarn lint
yarn build
yarn dev
```

Open [http://localhost:3003](http://localhost:3003). Homepage and registration
navigation are safe read-only checks. Only submit the registration form when
the app is connected to an approved disposable test project.

If port 3003 is in use:

```bash
yarn dev -- -p 3004
```

## Next steps

- [Understanding the registration flow](./registration-flow.md)
- [Firebase setup boundary](./firebase-setup.md)
- [Vercel deployment controls](./deployment.md)
