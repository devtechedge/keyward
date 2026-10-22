---
name: curator
description: Prune stale skills in the keyward project. Deterministic, no judgement.
---

# curator (keyward project)

The machine skill store is `~/.agents/skills`, mirrored into `~/.config/opencode/skills` and the
private `devtechedge/skills-hub`. Usage lives in `~/.agents/skills/.usage.json`, the event log in
`~/.agents/skills/.curator_ledger.jsonl`, and the archive in `~/.agents/skills/.archive`.

## Run

```bash
python "$HOME/.agents/skills/curator/scripts/curator_pass.py"
```

The script snapshots learn created skills, keeps the newest five backups, marks skills unused for
14 days as stale, and archives those unused for 30 days.

## Rules

- Read the script summary. Do not archive anything the script left alone.
- Never touch pinned skills, the self-learn skill, or any skill whose usage record is missing or
  whose `created_by` is neither `learn` nor `agent`. Hand written skills stay even if unused.
- Consolidate only when the request says consolidate. Merge overlapping learn created skills into
  one umbrella, fix paths, then move the absorbed directories into `.archive`. Print an old name to
  new name map. Never consolidate hand written skills.
- Archive is the worst case. Never delete a skill directory. Restoring moves the directory back,
  sets `state` to `active` and appends a `restore` ledger line.

## Project note

The project carries its own skills under `.agents/skills`. Those are documentation of how the
project is worked on, not a substitute for the machine store. The curator pass does not touch them.
The six hand-written copies (`dev-memory`, `curator`, `journey`, `learn`, `oss`, `refine`) are
updated by hand when a procedure changes, never archived by a machine-store pass.
