# System Diagnostics Test Matrix

## Normative Contract

Tests for provider, plugin, and system diagnostics must prove that operators can inspect safe
capability and configuration state through first-class query operations without leaking provider SDK
types, plugin internals, secrets, or raw external payloads.

`system.providers.list` and `system.plugins.list` are read-only queries. They must not mutate
provider configuration, activate plugins, probe external systems, repair state, or call repository
ports from transport adapters.

## Global References

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Providers](../PROVIDERS.md)
- [Plugins](../PLUGINS.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Error Model](../errors/model.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)

## Matrix

| Test ID | Layer | Case | Expected result |
| --- | --- | --- | --- |
| SYSTEM-DIAG-001 | provider contract | Provider descriptors expose safe capability and configuration diagnostics | Provider registry returns stable capability flags, capability details, configured/not-configured/partial state, and stable diagnostic codes without access tokens, private keys, provider SDK types, or raw provider payloads. |
| SYSTEM-DIAG-002 | plugin contract | Plugin summaries expose safe capability, compatibility, and configuration diagnostics | Plugin registry returns manifest capabilities, capability details, compatibility state, and stable diagnostic codes. Incompatible plugins remain visible but inactive without leaking plugin internals or secrets. |
| SYSTEM-DIAG-003 | HTTP/oRPC contract | Provider and plugin diagnostics dispatch through system queries | `GET /api/providers` dispatches `ListProvidersQuery` and `GET /api/plugins` dispatches `ListPluginsQuery`; responses preserve safe diagnostics and omit secret-bearing fields. |
| SYSTEM-DIAG-DOCS-001 | public docs | Diagnostics behavior has public docs coverage | Provider and plugin operation coverage points at stable public docs anchors that explain safe capability details, configuration diagnostics, inactive states, and secret redaction boundaries. |

## Current Implementation Notes

`SYSTEM-DIAG-001` is automated by provider registry/provider descriptor tests.
`SYSTEM-DIAG-002` is automated by the plugin host registry tests.
`SYSTEM-DIAG-003` is automated by the system diagnostics HTTP route tests.
`SYSTEM-DIAG-DOCS-001` is covered by the public docs registry tests and the provider/plugin public
docs pages.
