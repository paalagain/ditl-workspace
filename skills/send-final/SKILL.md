---
name: send-final
description: "DITL send-final (explicit invocation only): final deliveries."
disable-model-invocation: true
---

Explicit invocation required. Proceed only if the current user message explicitly invokes this skill by name (`$send-final`, `/send-final`, or the host's equivalent). Otherwise, stop without any action, before reading references or using tools, and say: "You can run this DITL skill by name: `$send-final` (or `/send-final` in Claude Code)." Related requests and mentions of the skill are not invocations.

Read [Project](references/project.md), then [Deliveries](references/delivery.md). Perform its final-delivery path for the explicitly opened project. Ask for the order and version choices when not supplied; never infer completion from local ticks. Report the verified delivery identity and whether closure completed. Completion is the designer's decision and does not mean developer acceptance.
