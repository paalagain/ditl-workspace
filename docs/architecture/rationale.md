# Design rationale

A separate private GitHub repository carries work orders as issues and deliveries as releases. GitHub owns shared state, while each participant keeps role-specific local records. The designer needs no product-code access or transport checkout. See [ADR 0004](../adr/0004-github-issues-and-releases-as-transport.md).

[Agent Skills](../adr/0005-ship-as-agent-skills-without-a-cli.md) share instruction bodies across hosts. Canonical Markdown owns executable integrity and recovery policy; every independently installed action includes its full reference closure. Maintainer tooling builds and verifies those copies.

Project versions keep accumulated design independent of work-order assignment. Immutable capture separates user edits from the bytes being delivered. Explicit task reassessment and the designer's completion decision make unfinished work visible without changing local progress or implying developer acceptance.

Exact retained packages and observed-state recovery reduce duplicate effects when a response is lost. Permanent identity reservations prevent retries from silently becoming new operations. An explicit pre-package capture replacement permits user-repaired work while preserving earlier evidence and the transaction's identity.
