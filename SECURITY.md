# Security

Do not place credentials, private photographs, invitation links, recovery codes or signed provider URLs in a public issue. Report a security concern privately to the repository owner through an available private GitHub reporting channel. This repository does not promise a response-time SLA or an independent security certification.

## Boundaries

- Host-only Secure/HttpOnly/SameSite cookies; only their SHA-256 digests are stored.
- One-time recovery is claimed atomically and revokes earlier sessions.
- Every private garment/circle/image operation checks membership; loan operations check owner or initiating borrower; preview outputs check their initiating account.
- State-changing calls require a configured exact Origin and application header. No credentialed cross-origin API is enabled.
- Parameterized SQL, server-authoritative state transitions, SQL overlap triggers and version guards prevent stale client state from deciding data integrity.
- Client text rendering escapes HTML. Photo uploads are bounded and re-encoded by the browser. Only JPEG/PNG images with supported dimensions reach inference.
- Provider signed URLs use an explicit HTTPS host allowlist and no redirects. Bearer credentials are sent only to the fixed first-party API endpoint.
- Private responses are no-store. Result chunks are access-bounded and expire; provider deletion is retried fairly with backoff.
- Preview budgets fail closed; ambiguous submissions are never automatically resubmitted as new tasks.

These safeguards have automated tests, but they do not establish that the service is vulnerability-free. Rate limits and quotas limit casual abuse, not determined Sybil attacks. Guest identities do not verify email, age or identity. Operate the service within provider quotas and review production logs without collecting sensitive payloads.
