# Portable design delivery

The product exchanges work orders and portable HTML prototype versions through a separate private GitHub repository. The designer controls the design and decides when work is complete; developer acceptance happens outside the workflow.

## Actions and ownership

- Designer: `inbox`, `new-version`, `send`, `send-final`. Inbox discovers work and starts/resumes an unambiguous order; explicit check-only requests remain observational.
- Developer: `inbox`, `order`.
- Project owns explicit local-root selection, role/repository identity and verified local record replacement.
- Orders owns immutable agreed scope, local progress, active assignment and recoverable work-order creation.
- Versions owns project-wide numbering, the working marker, coherent copying and portability.
- Deliveries owns captures, completion evidence, exact packages, publication/closure and recovery.
- Inbox owns observations, verified extraction, disclosure receipts and retained history.

## Required behavior

1. Every action is explicitly invoked and uses the selected project root. Configuration version 2 contains role and stable repository identity; developers also have a delivery destination. State and transport descriptors remain version 1. Unknown formats are retained for explicit reconciliation.
2. Setup installs only the selected role's copied skills in both supported hosts. It verifies prerequisites, private transport access and invitation identity. Joining requires explicit confirmation before invitation acceptance. Updates preserve project records and locally changed installation evidence.
3. Starting an order saves its exact agreed scope and a separate local checklist. Local ticks never change the developer's order. Switching assignment preserves progress and design versions. Scope changes and feedback create new linked orders.
4. Prototype versions contain accumulated design. Number reservations are permanent. Creating a version moves the working marker after verified copying; selecting a version for delivery preserves the marker.
5. Both sends select an open uncancelled order and an explicit numbered version, reserve an immutable delivery UUID/tag and coherently capture its files and directories.
6. Both sends establish direct-file portability on the capture with complete source/dependency inspection and actual state/interaction/network observations. Missing required checks or unresolved dependencies block publication.
7. Final delivery reassesses every agreed task against the capture. Fulfilled work is delivered checked only if it is locally checked too. Unknown, unfinished and locally unchecked tasks remain delivered unchecked and require explicit acknowledgment. The agent preserves local progress.
8. Final manifest version 2 contains exact frozen reassessment and decision records. Decision version 2 binds payload, agreed scope, exact reassessment hash, delivered unchecked ordinals, genuine designer completion statement and timestamp. Any changed evidence invalidates the earlier decision. Nonfinal delivery retains local progress as context and leaves its order open.
9. Capture replacement before packaging requires an explicit user-selected numbered version and complete bound remote observations. It retains UUID/tag, reservation ledger, original record/capture/evidence and a durable selected-inventory intent. It performs coherent copying only. New bytes require fresh portability, task evidence and completion choice.
10. Any partial package file, saved package/remote identity, draft attempt, remote draft/publication or occupied tag prevents capture replacement. Interrupted promotion resumes the saved intent. Changed or partial staging is preserved for explicit reconciliation.
11. Packaging writes one exact ZIP, manifest and descriptor. Reception verifies descriptor identity, hashes, complete files and directories, bounded archive metadata, safe paths, capacity and extracted bytes before recording a receipt.
12. Packaged retries reuse exact bytes, identity and completion evidence. Uncertain draft creation permits read-only reconciliation until identity appears or independent bound non-dispatch proof permits another attempt. Publication precedes final closure. Later assignment tokens are preserved during completion.
13. Cancellation takes effect when observed. Apply it before capture and immediately before publication. Published deliveries stand. Retain local progress, versions, pending evidence and reservation history.
14. Canonical source, generated skills, documentation, prompts, tests and trial fixtures share the same current contracts. Source regeneration preserves project records and delivery artifacts.

## Verification

Use installed skill invocations and observable files/transport state as the product seam. Maintainer tests additionally exercise canonical executable protocol blocks with actual filesystem and archive bytes. Cover agreed-task completeness, evidence invalidation, exact reception, safe archives, explicit capture replacement, interrupted promotion, immutable retries, cancellation and uncertain remote effects. Run the complete unit suite and both canonical bundle checks. Live host/service trials are opt-in and report only the environments and flows actually exercised.
