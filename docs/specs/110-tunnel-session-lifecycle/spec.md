# Tunnel Session Lifecycle

## Status

- Round: Spec + Test-First
- Artifact state: ready for Code Round
- Compatibility impact: additive minor surface
- Decision: [ADR-093](../../decisions/ADR-093-tunnel-session-lifecycle.md)

## Business Outcome

Authorized users can expose an eligible local origin temporarily through Cloudflare Quick Tunnel or
ngrok, inspect the assigned URL and expiry, revoke it, and rely on orphan cleanup.

## Acceptance Criteria

| ID | Scenario | Then |
| --- | --- | --- |
| TUNNEL-START-CF-001 | Start Cloudflare Quick Tunnel | Ready session returns sanitized trycloudflare URL, expiry, and safe provider handle. |
| TUNNEL-START-NGROK-002 | Start ngrok Tunnel | Token stays adapter-only and ready session returns sanitized public URL. |
| TUNNEL-AUTH-003 | Unauthorized or unsafe origin | Start is rejected before provider invocation. |
| TUNNEL-STATUS-004 | List/show | Owner-scoped status exposes no token, command line, or raw provider output. |
| TUNNEL-REVOKE-005 | Revoke twice | Provider/process is stopped once and durable state is idempotently revoked. |
| TUNNEL-EXPIRY-006 | Session expires or process disappears | Reconciler records expired/failed state and cleans provider/process remnants. |
| TUNNEL-SURFACE-007 | Product surfaces | API/CLI/Web share operation schemas and show start/status/revoke controls. |

## Non-Goals

- No custom-domain or DNS mutation.
- No general reverse-proxy/CDN product.
