# Tunnel Session Test Matrix

| ID | Automation | Binding | Status |
| --- | --- | --- | --- |
| TUNNEL-START-CF-001 | provider/application | `tunnel-provider.test.ts`; `tunnel-provider.real-cloudflare.test.ts`; `tunnel-session.test.ts` | passing |
| TUNNEL-START-NGROK-002 | provider/application | `tunnel-provider.test.ts` | passing |
| TUNNEL-AUTH-003 | application | `tunnel-session.test.ts`; `tunnel-provider.test.ts` | passing |
| TUNNEL-STATUS-004 | persistence/API | `tunnel-session.pglite.test.ts`; `data-safety-and-tunnel.http.test.ts` | passing |
| TUNNEL-REVOKE-005 | provider/application | `tunnel-session.test.ts`; real Cloudflare smoke | passing |
| TUNNEL-EXPIRY-006 | worker/provider | `tunnel-session.test.ts` | passing |
| TUNNEL-SURFACE-007 | API/CLI/Web | `data-safety-and-tunnel.http.test.ts`; browser validation | passing |
