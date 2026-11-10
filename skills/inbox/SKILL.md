---
name: inbox
description: "DITL inbox (explicit invocation only): work and deliveries."
disable-model-invocation: true
---

Explicit invocation required. Proceed only if the current user message explicitly invokes this skill by name (`$inbox`, `/inbox`, or the host's equivalent). Otherwise, stop without any action, before reading references or using tools, and say: "You can run this DITL skill by name: `$inbox` (or `/inbox` in Claude Code)." Related requests and mentions of the skill are not invocations.

Read [Project](references/project.md), then [Inbox](references/inbox.md). Follow the configured role's path only when explicitly invoked. For designers, Inbox discovers work and starts or resumes it in this conversation; an explicit check/show/review-only request or setup connectivity check stops after observations. Use the active eligible order, otherwise the sole eligible order; ask once only when several choices remain. A named order selects that eligible order. Keep the understood order and from-scratch intent separate from a missing project-root blocker. Report observations, refused artifacts, and verified destinations with their identities. Preserve independent developer deliveries when one fails.
