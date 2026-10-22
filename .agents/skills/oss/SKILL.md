---
name: oss
description: How upstream work is done for keyward, and the rules for opening a pull request from this repository.
---

# oss (keyward project)

keyward is a repository Dev owns. It is not an upstream target, so the upstream playbook in the
private `oss-contributions-private` repo does not apply to it directly. It applies when keyward
opens a pull request somewhere else.

## For work inside this repository

- Land changes as a direct commit on the default branch. Pull requests exist for external
  repositories. If a pull request is opened here by mistake, put the commit on the default branch
  and close or delete the pull request and its branch.
- One concern per commit. Never squash the presentation series into a single commit. The history is
  part of the product's first impression.
- Sign commits. `git -c commit.gpgsign=false commit` then rewrite the commit with the SSH
  signature, because git for Windows cannot reach the ssh-agent pipe.
- Never write a secret value into a commit, a log, an issue, or a release note. This repository
  exists to make that mistake impossible, so it must not commit one itself.
- Keyward is canonical. `keylens` and `keyops` are retired; do not restore them or open new work
  there unless Dev explicitly asks.

## Public text rules

- No em dashes in any public text: commit subjects, README, About, release notes, issues, comments.
- Never name internal file paths or private repository names in public fields.
- AI disclosure is mandatory only, never volunteered.
- Never describe the audience of a commit. Describe the product change.

## When keyward opens a pull request upstream

Fetch the canonical playbook and patterns from the private operational repository at the start of
the session and follow what comes back. The local copy is a derivative and can be stale. The rules
that matter most here:

- Reproduce the bug before claiming it.
- Run the full test suite, not only the new test.
- A bot review never clears the one PR at a time gate. A human maintainer does.
- Never yield a pull request keyward opened first.
- Check whether the repository already runs a scanner like gitleaks or trufflehog, and whether the
  finding keyward reports is already covered, before opening anything.
