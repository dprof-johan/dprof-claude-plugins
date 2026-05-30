---
description: Create or refresh a localized README.md for a directory, linked back into the chronicle.
argument-hint: "[directory path]"
model: opus
---

Use the **dev-chronicler** skill, `readme` procedure, to create or refresh a
localized `README.md` that orients a reader to a specific directory and links
back into the chronicle.

`$ARGUMENTS` is the target directory (default: the current working directory if
omitted — ask if ambiguous). Inspect the directory's contents and write a README
that explains what it's for, a status table of the notable files, any
"kept-for-audit / delete-safe" annotations, and back-links into `actions/` and
`decisions/`. The README lives **in that directory**, not under the chronicle root.
