# Verify an attempted order

Revision: 1

Use this procedure after the POST returns or fails, and when resuming a saved request with `submissionAttempted:true` and `result:null`. Reuse the bound repository, saved UUID and exact body. Every retry is read-only.

1. Run the complete paginated lookup from step 5 of [Create a work order](orders-create.md) immediately. If a complete lookup finds no match, or a lookup fails with a transient transport error such as a timeout or HTTP 5xx, repeat the entire lookup after 1 second, then 2 seconds, then 4 seconds. Wait after each retryable outcome, for at most four lookups per run. Discard partial output before each retry.
2. Stop immediately on authentication or authorization failure, invalid or truncated output, malformed or unsupported order metadata, duplicate UUIDs, changed matching body, or a conflicting saved issue number. Preserve the request and evidence, and report the specific blocker. Use the installed `reconcileOrderRequest` helper for identity checks. Its attempted-but-absent error after a complete lookup is a retryable outcome.
3. On a verified unique match, return the issue number to the creation procedure for durable local completion. If the retry budget runs out, report that submission was attempted and GitHub verification is pending. Include the bound repository and saved request UUID, and explain that the next invocation can resume read-only verification of that request. Absence leaves the POST outcome uncertain.
4. At the driver boundary, summarize failures using the error message and relevant transport status. Keep the full stack available for debugging and omit the base64 module URL from normal output.
