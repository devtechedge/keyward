# Agent workflows

These are the workflows used to work on this repository. They are the project scoped copies of the
same procedures the machine runs, kept in the repository so anyone reading the source can see how
the work is done.

`keyward` is the canonical repository. `devtechedge/keylens` and `devtechedge/keyops` are retired
parallel builds, and both carry a `docs/RETIRED.md` pointing here. Do not revive either one without
Dev's say.

| Workflow | What it is for |
| --- | --- |
| [`dev-memory`](skills/dev-memory/SKILL.md) | Session memory protocol. Read at session start, write at session end. |
| [`curator`](skills/curator/SKILL.md) | Prune stale skills. Deterministic, archive only, never delete. |
| [`journey`](skills/journey/SKILL.md) | Audit view of learned skills and memory state. Read only. |
| [`learn`](skills/learn/SKILL.md) | Turn a procedure into a reusable skill. |
| [`oss`](skills/oss/SKILL.md) | Commit and pull request rules for this repository. |
| [`refine`](skills/refine/SKILL.md) | Post-session review that saves durable lessons only. |

## The two hard rules for this codebase

**A raw secret never crosses a process, network or persistence boundary.** The types enforce it.
`SecretValue` is the only type that may hold a value, and anything that has seen a secret becomes a
`MaskedSecret` carrying a fingerprint and a mask. A new code path that needs a secret value has to
take a `SecretValue` and give a `MaskedSecret` back.

**Rotation never revokes early.** The order is create, write to every consumer, read each one back
and prove it changed, then revoke the old key. A failure at any point rolls back what was written
and says plainly when a destination cannot be restored, because a half rotated secret is worse than
a stale one.
