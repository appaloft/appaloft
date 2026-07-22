# ADR-090: Server Host Identity

## Status

Accepted.

## Context

Server registration previously accepted any non-empty host text. A provider network prefix such as
an IPv6 `/64`, a URL, or a combined `host:port` could therefore be persisted and passed to SSH.
Equivalent IPv6 spellings also bypassed duplicate registration checks and bare IPv6 `host:port`
display was ambiguous.

## Decision

- `HostAddress` owns the canonical server host identity. It accepts internal single-label DNS names
  because SSH/server identity is not a durable public domain or TLS issuance request.
- Registration accepts one explicit hostname, IPv4 address, raw IPv6 literal, bracketed IPv6
  literal, or the retained `user@host` compatibility form. DNS names are lowercase without a final
  dot; IPv6 is stored in canonical compressed form without brackets.
- CIDR/network prefixes, URLs, combined host-port values, control characters, and unsafe SSH
  destination text are rejected. Appaloft never chooses an address from a provider network range.
- A non-deleted server endpoint is unique within an organization by canonical
  `providerKey + host + port`. A duplicate returns `conflict` and publishes no registration event.
- SSH receives host and port as separate argv values. Connectivity failure metadata distinguishes
  resolution, network reachability, endpoint reachability, authentication, and host-key failures.
- Human-readable IPv6 endpoints use `[host]:port`; persisted host identity remains unbracketed.
- A data migration canonicalizes valid existing host rows. Invalid historical rows stay readable
  and must be corrected explicitly; the migration never invents an address.

## Consequences

Provider provisioning adapters must resolve a network allocation to an explicit host before calling
`servers.register`. Existing invalid persisted values remain readable but cannot be newly created.
This is neutral Community behavior and does not add provider-specific provisioning logic.
`PublicDomainName` remains a separate durable routing/TLS value and continues to require a
multi-label public DNS hostname.

## References

- [Server registration/connect command spec](../commands/servers.register-or-connect.md)
- [Server bootstrap test matrix](../testing/server-bootstrap-test-matrix.md)
- [Feature spec 106](../specs/106-server-host-identity/spec.md)
