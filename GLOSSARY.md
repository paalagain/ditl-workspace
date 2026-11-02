# Designer in the loop

A designer iterates on prototypes and delivers versions in response to a developer's work orders.

## Language

### Project and roles

**Project**:
The shared undertaking of one designer and one developer, with its own transport, prototype versions and work orders. A person can take part in several projects.
_Avoid_: Product repo (the developer's code, which a project never needs access to), workspace

**Role**:
A participant's part in a project: designer or developer.

**Transport**:
The shared channel through which the designer and developer exchange work orders and deliveries.

### Design

**Prototype version**:
A saved iteration of the project's accumulated design that can be selected for delivery independently of other iterations. It normally keeps earlier design areas together so shared design changes can carry across them.
_Avoid_: Delivery (the act or result of sending a version)

**Working version**:
The prototype version selected for ordinary design edits. Creating a new version makes it the working version; selecting another version solely for delivery leaves it unchanged.
_Avoid_: Active order (the current assignment, rather than the design being edited)

**Portability**:
The property of a prototype version that opens directly from its own files, with no build step and nothing loaded from the network. Every delivery must have it.

### Work orders

**Work order**:
A developer's request for design work, expressed as a goal and a checklist of tasks whose scope is agreed when work starts. Later scope changes and feedback requesting further work are new work orders that refer to an earlier one.
_Avoid_: Delivery, version

**Local checklist**:
The designer's record of a work order's agreed scope and progress, taken when work starts. Its progress stays with the designer and is never written back to the order.
_Avoid_: Work order (the developer's request, which the checklist copies)

**Active order**:
The work order currently selected for the agent to work on, with progress tracked in its local checklist. Switching orders preserves that progress and does not roll the project design back.

**Cancellation request**:
The developer's request to withdraw an earlier work order, sent as a new linked request with no tasks. It takes effect when the designer's agent observes it; deliveries sent before then stand.
_Avoid_: Work order (a request for design work, which a cancellation request is not)

**Cancelled order**:
A work order withdrawn by an observed cancellation request before its final delivery. It is no longer an active assignment and receives no new deliveries; local progress and design edits are retained.
_Avoid_: Completed order (closed after a final delivery)

**Completed order**:
A work order closed following its final delivery. Completion ends the designer's active assignment and is separate from the developer's acceptance of the design.
_Avoid_: Cancelled order, developer acceptance

### Delivery

**Delivery**:
A prototype version sent to the developer in response to exactly one work order, together with information identifying that order and whether the delivery is final.
_Avoid_: Prototype version (a version can exist without being delivered)

**Send**:
A delivery of a version as it stands, which the designer does not consider complete. It leaves the work order open.
_Avoid_: Final delivery

**Final delivery**:
A delivery the designer considers complete for its work order, with its agreed tasks reassessed against the selected version. It closes that order and is separate from the developer's acceptance of the design.
_Avoid_: Developer acceptance, approval

**Order reassessment**:
A judgement of which checklist tasks the version selected for final delivery actually fulfils, made against that version rather than against recorded progress.
_Avoid_: Checklist progress (ticks that may belong to another version)

**Acknowledgment**:
The designer's explicit decision to make a final delivery despite unfinished checklist tasks. It is recorded with the delivery and never counts as the tasks being done.
_Avoid_: Override, pass

**Delivery note**:
A short explanation accompanying a delivery that highlights changes outside its work order and any included design work still in progress.

**Developer acceptance**:
The developer's judgement that a delivery satisfies their work order. It happens outside the project's workflow and is never implied by a final delivery.
_Avoid_: Completed order, final delivery
