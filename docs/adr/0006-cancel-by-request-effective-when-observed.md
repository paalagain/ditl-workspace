# Cancel an order by request, effective when the designer's agent observes it

Order status is only open or closed, with no labels or extra states. Orders are never reopened, and rework always arrives as a new linked order. To cancel, the developer sends a cancellation request: a new linked issue with no tasks whose machine metadata names the order it withdraws. The request takes effect when the designer's agent observes it, in inbox or in a send's checks before capture and before publication. The agent then closes the order as not planned and the request as completed, and clears the order's assignment if it is active, keeping local progress and design edits. A delivery published before the request was observed is a legitimate delivery that crossed the request in transit, not a conflict. A request that arrives after the final delivery is reported and closed without effect. The designer's agent is therefore the only writer of order closure, and the close reason (completed or not planned) states the outcome.

## Considered Options

- **Developer closes the order to cancel it.** Rejected: closure takes effect at once on GitHub, and GitHub has no atomic guard spanning issue closure and release publication, so a delivery published moments later would contradict it. Telling cancellation apart from final closure would also need event history that is not always precise enough.
- **Arbitration through the transport** (a lock label, a claim comment, or a handshake). Rejected: it adds states this decision rules out, and every option still has the same read-then-write gap.
- **A custom arbitration service.** Rejected for the same reasons ADR 0004 rejected a custom service: credentials and a status writer we would have to build and run.

## Consequences

- Cancellation is not instant. It applies once the designer runs inbox or attempts a send, which matches the explicitly invoked workflow.
- Checks for requests use complete, paginated issue listings parsed for metadata, not GitHub search, whose index can lag.
- If the developer closes an order by hand anyway, the agent treats it as a cancellation request observed at that moment: it does not close anything and records the outcome as cancelled, unless a final delivery was already published.
