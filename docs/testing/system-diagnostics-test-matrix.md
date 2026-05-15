# System Diagnostics Test Matrix

## Normative Contract

Tests for provider, plugin, and system diagnostics must prove that operators can inspect safe
capability and configuration state through first-class query operations without leaking provider SDK
types, plugin internals, secrets, or raw external payloads.

`system.providers.list`, `system.plugins.list`, and `system.doctor` are read-only queries. They must
not mutate provider configuration, activate plugins or workers, probe external systems, repair
state, dispatch scheduler ticks, or call repository ports from transport adapters.

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
| SYSTEM-DIAG-003 | HTTP/oRPC contract | Provider, plugin, and doctor diagnostics dispatch through system queries | `GET /api/providers` dispatches `ListProvidersQuery`, `GET /api/plugins` dispatches `ListPluginsQuery`, and `GET /api/system/doctor` dispatches `DoctorQuery`; responses preserve safe diagnostics and omit secret-bearing fields. |
| SYSTEM-DIAG-004 | shell/application/CLI/Web contract | Doctor exposes configured maintenance worker activation | `system.doctor` includes certificate retry, preview expiry cleanup, preview cleanup retry, scheduled task, scheduled runtime prune, scheduled history retention, and runtime monitoring collector runner status from config, including enabled state, activation, interval, batch settings, safety mode, activation configuration keys, and worker operation keys without starting or ticking workers. Runtime monitoring collection is reported as the internal worker operation `runtime-monitoring.collect`, distinct from public read queries such as `runtime-monitoring.samples.list`. The CLI `appaloft doctor` output, HTTP/oRPC response, and Web Instance page read the same response and present worker status plus safe configuration keys without exposing worker controls. |
| SYSTEM-DIAG-DOCS-001 | public docs | Diagnostics behavior has public docs coverage | Provider, plugin, and doctor operation coverage points at stable public docs anchors that explain safe capability details, configuration diagnostics, inactive states, maintenance worker activation, default-disabled workers, and secret redaction boundaries. |

## Current Implementation Notes

`SYSTEM-DIAG-001` is automated by provider registry/provider descriptor tests.
`SYSTEM-DIAG-002` is automated by the plugin host registry tests.
`SYSTEM-DIAG-003` is automated by the system diagnostics HTTP route tests.
`SYSTEM-DIAG-004` is automated by `apps/shell/test/maintenance-worker-status-reader.test.ts`,
`packages/adapters/cli/test/lifecycle-command.test.ts`, the Web Instance page source coverage in
`apps/web/src/lib/console/auth-management.test.ts`, and the Bun.WebView `/instance` route coverage
in `apps/web/test/e2e-webview/home.webview.test.ts`.
`SYSTEM-DIAG-DOCS-001` is covered by the public docs registry tests, the provider/plugin public
docs pages, the maintenance worker activation section in the self-hosting advanced reference, and
the full scheduled-worker configuration key set in both localized configuration reference pages.
