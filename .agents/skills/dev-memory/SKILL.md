---
name: dev-memory
description: Session memory protocol for the keyward project. Read at the start of every session, write at the end.
---

# dev-memory (keyward project)

This is the canonical repository. `devtechedge/keylens` and `devtechedge/keyops` are retired parallel
builds; do not treat either as active.

Standing memory for this repository lives in `~/.agents/memory/`, not in the repo. The repo holds
the code; the memory store holds the state.

## Session start

1. Read `~/.agents/memory/MEMORY.md` and `~/.agents/memory/USER.md`.
2. Read the domain file for whatever the session is about. For keyward work that is
   `~/.agents/memory/domains/ai-key-ops/MEMORY.md`.
3. Check today's dated log in that domain for continuity, for example
   `~/.agents/memory/domains/ai-key-ops/2026-10-22.md`.
4. Open the first reply of a session with one line: `Mem OK: ...` naming the standing facts you
   loaded. A missing receipt line means the load failed.

## Session end

On a wrap up cue (save memory, checkpoint, session ended, goodbye, or a clear task finish plus a
topic pivot):

1. Append what happened to `~/.agents/memory/domains/<domain>/YYYY-MM-DD.md`. Write once, never
   rewrite history. Correct an earlier entry with a new dated entry.
2. Promote the durable parts to `~/.agents/memory/domains/<domain>/MEMORY.md` and, if the rule is
   cross domain, to `~/.agents/memory/MEMORY.md`. Rules, not history. Counts carry their date.
3. End with one line saying what was saved and where.

## Rules for this project

- Standing files have character caps: global 6,000, USER 2,500, each domain 8,000. Caps are in
  characters, not lines.
- When a standing file goes over cap, zip `~/.agents/memory/` into `~/.agents/memory-backups/`
  first, push the moved detail into the dated logs word for word, then compact the standing file.
  Confirm every path, date and number still appears somewhere in the folder afterwards.
- A rule lives in one file only. Do not keep the same rule in the global file and a domain file.
- Never write a secret value into any memory file. Key names, masked forms, lengths and
  fingerprints only.
- Keyward is the only active repository. A retired repo gets no new features, releases, or memory
  beyond its retirement note.
