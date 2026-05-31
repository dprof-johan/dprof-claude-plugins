---
description: Check the chronicle's health — broken links, leftover wikilinks, unfilled placeholders, missing sections.
argument-hint: ""
model: sonnet
---

Use the **dev-chronicler** skill, `doctor` procedure, to check the chronicle's
health and report what (if anything) needs fixing.

Run the engine's `doctor` subcommand, summarise the findings for the user
(errors first, then warnings), and offer to fix the concrete ones — broken
relative links, leftover `[[wikilinks]]`, unfilled skeleton placeholders.

If the project isn't initialised yet, tell the user to run `/dev-chronicler:init`
first.
