---
name: order
description: "DITL order (explicit invocation only): work orders and feedback."
disable-model-invocation: true
---

Explicit invocation required. Proceed only if the current user message explicitly invokes this skill by name (`$order`, `/order`, or the host's equivalent). Otherwise, stop without any action, before reading references or using tools, and say: "You can run this DITL skill by name: `$order` (or `/order` in Claude Code)." Related requests and mentions of the skill are not invocations.

When the user invokes `$order`, treat the requested work as a brief for the designer. Turn clear instructions into a title, goal, and numbered tasks and send the order without a separate approval round. Ask only for essential missing information. Perform the requested work yourself only if the user explicitly asks you to do it.

Read [Project](references/project.md), then [Create a work order](references/orders-create.md). Bind the explicitly opened developer project, reconcile saved creation requests, and create or resume exactly one request. Feedback and scope changes are new linked orders; an explicit cancellation creates a task-free request naming its target. Report verified remote identity only after the exact saved request is reconciled and local completion is safely recorded.
