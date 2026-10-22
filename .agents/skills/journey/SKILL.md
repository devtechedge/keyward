---
name: journey
description: Audit view of learned skills and memory state for the keyward project. Read only, it never changes anything.
---

# journey (keyward project)

An audit view. It reports and never edits.

## Run

```bash
python "$HOME/.agents/skills/journey/scripts/journey_report.py"
```

The report lists every tracked skill with its state, use count, patch count and last use, the
archived directories, a short count of the OpenCode fast snapshot, the dev-memory standing file
sizes against their character caps, and the last thirty ledger events oldest first.

## Rules

- Paste the report. It is the point of the command.
- An over cap standing file is only flagged here. Compacting it is a separate action, and it needs
  agreement first.
- If the request is to prune or correct, stop and ask before deleting or archiving. Archiving a
  learn created skill is restorable through the curator.
- Dropping a dev-memory fact is an in place edit of `~/.agents/memory`, and only after the fact is
  named.
- Removing a `domains/<name>` folder is not a journey action. Append its substance verbatim to a
  dated log, verify it landed, then delete.
