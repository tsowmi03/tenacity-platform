# Phase 1 repository hardening, 21 July 2026

## Status

The persistent monorepo checkout, file-based governance, history reachability,
and imported-path validation are complete on
`migration/phase-1-hardening`.

Phase 1 is not fully closed because GitHub cannot enforce branch protection or
CODEOWNERS on this private personal repository under the current account plan.
The deploy freeze and second-maintainer access confirmation also remain open.

No application, Firebase resource, Vercel project, provider binding, or
production workflow changed during this work.

## Completed work

- Created the persistent checkout at
  `/Users/thomassowmi/Development/tenacity-platform` and branched from imported
  `main` at `addf7ca204e24d99e12e9e17726c243cdab8258e`.
- Added the root repository map, production boundary, local safety warnings,
  validation commands, contribution policy, CODEOWNERS paths, and pull-request
  template.
- Added the exact history import record and branch-protection activation
  runbook.
- Audited imported history reachability and published seven minimal archive refs
  so all 672 commits mapped during the import are reachable in the destination.
- Confirmed that no imported application file changed during dependency
  resolution, tests, or builds.

## Imported-path validation

| Area | Result |
| --- | --- |
| Repository | `git fsck --full` passed; source tree and imported subtree hashes matched; remote refs were read back after the archive push |
| Documentation | Trailing-whitespace, code-fence balance, relative-link, and Markdown structure checks passed |
| Mobile | 30 tests passed; web build passed |
| Admin portal | 140 unit tests passed; Vite production build passed with the existing large-chunk warning |
| Firebase rules | 16 Firestore and Storage emulator tests passed |
| Firebase Functions | Under Node.js 22.23.1, 564 unit tests and 80 emulator integration tests passed; 86 local exports loaded successfully |
| Public website | Lint and production build passed with two existing React Hooks warnings |

The mobile format check reports five pre-existing unformatted files:

- `lib/controllers/invoice_controller.dart`;
- `lib/src/helpers/invoice_list_tile.dart`;
- `lib/src/models/announcement_model.dart`;
- `lib/src/models/payment_model.dart`; and
- `lib/src/services/user_service.dart`.

`flutter analyze` reports 87 existing informational findings. These application
files were not reformatted or changed because Phase 1 keeps repository hardening
separate from application cleanup.

The locked dependency installs completed. npm reported existing dependency
advisories in both portal packages. No automatic audit fix was run because it
could change dependency versions and belongs in separate reviewed work.

## GitHub controls blocker

Only `@tsowmi03` currently has repository write access. GitHub returned HTTP
403 for both branch protection and repository rulesets:

```text
Upgrade to GitHub Pro or make this repository public to enable this feature.
```

The repository must remain private. The desired Stage A and Stage B settings
are in
[`docs/operations/github-branch-protection.md`](../operations/github-branch-protection.md).

Phase 1 was squash-merged through pull request 1 as
`399a76a120b4def59f67d34e7879c7539a13b31a` on 21 July 2026.

## External gates remaining after Phase 1

- Upgrade or move the repository to a plan that supports private-repository
  protection, then activate Stage A.
- Grant a second eligible repository owner write access before Stage B code-owner
  approval is enabled.
- Confirm all intended maintainers can access the repository.
- Announce the short backend and deployment freeze before the later no-op
  production cutover window.
