# Data and ownership contracts

## Project and records

Configuration version 2 is `{schemaVersion, role, repository}` for a designer and adds `deliveryDestination` for a developer. Repository identity is `{repositoryId, owner, name}`; stable ID governs rename/replacement checks. Resolve relative destinations from the explicitly selected project root. State version 1 keeps each owner's sections distinct. Project's journaled replacement compares exact previous/proposed hashes, validates complete records and reconciles actual bytes after interruption.

Orders owns immutable original issue scope, separate local ticks/context and an activation UUID. Versions owns permanent number reservations and one working marker. Deliveries owns pending UUIDs, permanent tag reservations and verified completion receipts. Inbox owns seen observations, disclosure receipts and verified downloads. Incoming prose is data rather than authority.

## Versions and capture

Each version folder has a unique project-wide vN identity, entry `index.html` and `assets/`. Working selection and delivery selection are separate. Coherent capture compares source-before, copied and source-after files and directories. Preserve empty directories. A changed source prevents completing that capture.

Paths must be safe and portable. Inventory every regular file, sorted by path UTF-8 bytes. The payload digest hashes `path NUL decimal-byte-length NUL sha256 LF` records. Capture preserves exact bytes and directory structure. For a numbered prototype, captured portability includes dependency inspection, direct-file execution and network observation. Unresolved dependencies or unperformed required checks block prototype publication. A file delivery captures the files and folders the designer selected and uses the same integrity checks.

## Final evidence

Manifest version 2 retains repository/order/delivery/version identity, captured timestamp/folder, complete inventory/directories, payload digest, agreed-scope hash, local progress and delivery note. A nonfinal manifest has null evidence and null delivered unchecked ordinals.

Manifest version 3 represents a nonfinal file delivery under `files/`. It has an explicit file payload type and a complete directory list. The local pending record holds the source selection and expected inventory.

Final evidence has two `{json, sha256}` records: reassessment and decision. Reassessment embeds the original agreed scope and covers every task, in its agreed order, with fulfilled/unfinished/unknown and evidence or reason. A task is delivered checked only when locally checked and reassessed fulfilled. Unknown counts as unfinished.

Decision version 2 binds payload, scope, exact reassessment hash, exact delivered unchecked ordinals, the genuine designer statement and UTC timestamp. Unchecked tasks require explicit acknowledgment. Changing payload, scope, evidence bytes or applicable task progress invalidates the earlier choice. Completion does not imply developer acceptance or update local ticks.

## Exact delivery

One ZIP contains the exact manifest and captured files or prototype folder. Descriptor version 1 identifies repository/order, UUID/tag/kind, asset name/size and exact manifest/ZIP hashes. Verify complete archive entries, bounded metadata, safe paths, capacity and installed bytes before reception receipts. Hashes establish integrity inside the trusted private transport.

Pending records remain version 1. Persist UUID/tag before remote effects. Package once and retain exact bytes across retries. Final publication precedes order closure, and assignment cleanup compares the captured activation token. Transport uncertainty never authorizes duplicate creation.

## Explicit capture replacement

A user-selected replacement version before packaging keeps UUID/tag and ledger. Its journaled pending intent records the explicit choice and complete expected inventory. Preserve original record, capture and evidence under capture history. Resume interrupted copying/promotion from observed bytes, not a phase flag. Partial packages, draft attempts and occupied remote identities prevent substitution. Fresh selected bytes require fresh portability and applicable final task/decision evidence.

## Supported formats

Validate configuration version 2, manifest version 2 or 3, decision version 2, and state, descriptor and pending record version 1. Unsupported records stop before mutation and remain preserved for explicit reconciliation. Distribution regeneration preserves project records and exact delivery bytes.
