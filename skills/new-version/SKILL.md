---
name: new-version
description: "DITL new-version (explicit invocation only): working prototypes."
disable-model-invocation: true
---

Explicit invocation required. Proceed only if the current user message explicitly invokes this skill by name (`$new-version`, `/new-version`, or the host's equivalent). Otherwise, stop without any action, before reading references or using tools, and say: "You can run this DITL skill by name: `$new-version` (or `/new-version` in Claude Code)." Related requests and mentions of the skill are not invocations.

Read [Project](references/project.md), then [Versions](references/versions.md). Create or recover a numbered prototype in the explicitly opened designer project. Default to copying the uniquely marked working version; with no versions create the minimal empty prototype. An explicit `empty`, local import, or `from vN` selects that source. Preserve the whole accumulated design. Reconcile saved creation before a fresh reservation, verify complete content before marker transfer, and require explicit choices for ambiguous working markers. Report the actual working folder and any import dependency findings.
