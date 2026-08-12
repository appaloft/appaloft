# Outbound Server Worker Relay Test Matrix

| ID | Level | Planned binding | Required evidence |
| --- | --- | --- | --- |
| SWR-ENROLL-001 | contract/integration | CLI + issuer + credential store | one-time exchange, no key leakage |
| SWR-ENROLL-002 | application | Server attachment adapter | Server identity/lifecycle unchanged |
| SWR-MTLS-003 | real loopback TLS | Cloud listener + Worker | valid pair accepted, invalid cert rejected |
| SWR-PROTO-004 | unit | protocol state machine | version/capability negotiation |
| SWR-LEASE-005 | unit/integration | fake clock + registry | heartbeat, reconnect and fencing |
| SWR-EXEC-006 | contract | Worker dispatcher | argv/path/size/time/isolation bounds |
| SWR-PTY-007 | integration | terminal stream | opaque bytes, resize, reconnect/fence |
| SWR-DEV-008 | acceptance | R2a transport | remote plan/start/status/logs/stop/cleanup |
| SWR-SNAPSHOT-009 | acceptance | relay Docker runner | existing snapshot and snapshot-source provision |
| SWR-FORWARD-010 | real loopback | multiplexed stream | scoped bytes and listener cleanup |
| SWR-RECONNECT-011 | integration | request journal | duplicate/unknown outcome handling |
| SWR-ROTATE-012 | integration | issuer + fake clock | overlap and old-serial fencing |
| SWR-REVOKE-013 | integration | registry/tickets/credential store | exact close/deny/remove |
| SWR-UPGRADE-014 | integration | fake signed manifest/runtime | drain, health and rollback |
| SWR-ORPHAN-015 | integration | lease reconciler | no new work and exact ephemeral cleanup |
| SWR-STATUS-016 | contract | public/Cloud readback | safe bounded fields only |
| SWR-ERROR-017 | contract | CLI/API/TUI mapping | stable safe errors |
| SWR-LOCAL-018 | composition | local issuer/relay fake | no Cloud import or SSH regression |

The terminal R2b acceptance is a real local CA + TLS relay + separate Worker process journey. It
must prove invalid-certificate denial, enroll/connect, R2a remote dev, port forward, existing
Workspace PTY, snapshot/source-fork, reconnect, rotate, revoke, upgrade rollback and independent
listener/process/credential/ticket/lease zero-residual cleanup. A real external VPS remains opt-in.
