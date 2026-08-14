# Resource portal — Claude Code instructions

Jira space for this app: **Admin Web Portal**. See root [`CLAUDE.md`](../../CLAUDE.md)
for the full Jira space mapping and the read/write workflow.

This application must not import from `apps/admin-portal`, link to it, or detect
the hostname to decide which portal it is. `src/portalSeparation.test.js`
enforces all three. See [`README.md`](README.md) for why the shared shell is a
copy rather than a shared package.
