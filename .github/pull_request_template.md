<!-- Keep PR titles in conventional-commit form: type(scope): subject
     Examples: feat(api): ..., fix(web): ..., test(api): ..., ci: ... -->

## Summary

<!-- One or two bullets describing what changed and why. Link the
     motivation: an issue, a customer report, a perf metric, etc. -->

-

## Risk + blast radius

<!-- One sentence per: who is affected, what the worst case is, what
     guard rails exist. If this is a config or schema change, call out
     the deploy-time/migration order. -->

-

## Test plan

<!-- Markdown checklist. Local validation goes here, not just "CI green".
     For UI changes, attach screenshots or a Loom. -->

- [ ]

## Rollback plan

<!-- How to revert if something goes wrong. For most PRs this is just
     `git revert`, but flag the cases where revert isn't safe (DB schema
     migrated, external API state changed, feature flag flipped). -->

-

---

<sub>By opening this PR you confirm: tests added or updated for new
behaviour, no secrets committed, and breaking changes called out above.</sub>
