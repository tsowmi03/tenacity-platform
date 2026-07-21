# Pull request

## Summary

Describe the change and why it belongs in this pull request.

## Affected areas

- [ ] Mobile
- [ ] Admin portal
- [ ] Public website
- [ ] Firebase backend, rules, indexes, or Hosting
- [ ] Shared contracts
- [ ] Repository governance, CI, or migration records

## Change classification

- [ ] Structural only
- [ ] Runtime behavior
- [ ] Persisted data or contract
- [ ] Permission or security boundary
- [ ] Deployment or provider configuration
- [ ] Documentation only

## Production effect

State whether this changes a production deployment, provider binding, Firebase
resource, secret, environment, permission, or released client. Phase 1 changes
should say `None` and explain why.

## Verification

List every command run and its result. Include affected application tests,
builds, analyzers, emulator checks, `git diff --check`, and any manual checks.

## Compatibility and ownership

- [ ] Existing released clients remain compatible.
- [ ] Structural moves are separate from behavior changes.
- [ ] Required CODEOWNERS and affected-client reviewers have been requested.
- [ ] Generated output, if any, matches its reviewed source.
- [ ] No secret value is present in the diff.

## Rollback

State the rollback point and command, or explain why the change has no runtime
rollback requirement.
