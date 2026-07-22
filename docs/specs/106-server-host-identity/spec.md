# Server Host Identity

## Status

- Round: Post-Implementation Sync
- Artifact state: implemented and verified
- Compatibility impact: `1.0.x` validation/correctness patch

## Outcome

IPv6-only servers can be registered and tested without treating an allocated network as an SSH
host, duplicating equivalent address spellings, or rendering ambiguous endpoints.

## Acceptance Criteria

| ID | Given | When | Then |
| --- | --- | --- | --- |
| SERVER-BOOT-HOST-001 | Equivalent raw or bracketed IPv6 text | host identity is created | one compressed, unbracketed value is stored |
| SERVER-BOOT-HOST-002 | DNS, URL, or combined host-port text | registration input is parsed | DNS is canonical; URL and host-port are rejected |
| SERVER-BOOT-HOST-003 | IPv4 or IPv6 CIDR | registration input is parsed | validation rejects the network prefix and selects no host |
| SERVER-BOOT-HOST-004 | A canonical IPv6 host and port | endpoint is displayed | output is `[host]:port` |
| SERVER-BOOT-HOST-005 | An IPv6-only generic SSH server | connectivity runs | SSH receives host and port as separate argv values |
| SERVER-BOOT-HOST-006 | SSH reports network unreachable | results are normalized | metadata reports `failureKind = network-unreachable` |
| SERVER-BOOT-HOST-007 | A valid legacy IPv6 spelling is persisted | migration 100 runs | the row stores canonical host identity |
| SERVER-BOOT-HOST-008 | A server is reachable through an internal single-label DNS name | host identity is created | the hostname is accepted and canonicalized without treating it as a public domain/TLS request |
| SERVER-BOOT-CMD-004 | Same organization, provider, canonical host, and port | registration repeats | `conflict`; no duplicate target or event |

## Boundaries

Runtime Topology owns host identity. Provider adapters may propose an explicit address, but provider
network allocation and Hetzner-specific address selection are out of scope. No command/event model
is added.
