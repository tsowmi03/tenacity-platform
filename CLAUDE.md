# Tenacity Platform — Claude Code instructions

## Jira

This monorepo's work is tracked in Jira across these spaces:

| App / scope | Directory | Jira space |
|---|---|---|
| Mobile app | `apps/mobile` | Mobile Application |
| Admin portal | `apps/admin-portal` | Admin Web Portal |
| Resource portal | `apps/resource-portal` | Admin Web Portal |
| Website | `apps/website` | Website |
| Cross-cutting / infra | (repo root, `backend/`, `scripts/`) | Tenacity Platform |

When working on a ticket, pull its Jira context (description, comments, linked
issues) before starting so the implementation matches what was actually
agreed, not just the ticket title.

When a task warrants a new ticket or an update to an existing one (status,
comment, linking a PR), draft the content and confirm with the user before
writing to Jira — ticket changes are visible to the team, so don't create or
edit tickets silently.

When writing tickets (new or updates), keep them concise — short description,
clear acceptance criteria, no padding.

When asked to pull a ticket, review it and ask clarifying questions before
doing anything else. Do not start implementation unless the user has
specifically asked for it — pulling a ticket for context is not a request to
build it.
