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

Jira changes for the work in hand — creating a ticket, writing a description,
transitioning status, commenting, linking a PR — don't need approval first.
Make the change and say what you did, so it is visible without being a
question.

Ask before: deleting a ticket or a comment, changing several tickets at once,
and editing tickets belonging to work that isn't yours. Those are hard to
undo or land on someone else's board.

When writing tickets (new or updates), keep them concise — short description,
clear acceptance criteria, no padding.

When asked to pull a ticket, review it and ask clarifying questions before
doing anything else. Do not start implementation unless the user has
specifically asked for it — pulling a ticket for context is not a request to
build it.
