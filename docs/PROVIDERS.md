# Providers

## Provider Categories

- cloud provider
  - examples: Aliyun, Tencent Cloud
- deploy target provider
  - example: Generic SSH
- infra service provider
  - future registry, DNS, object storage providers

## What A Provider Is Not

- not a runtime strategy
- not a plugin
- not a VCS integration

## Current Providers

- `local-shell`
  - category: deploy target
  - capabilities: local command, docker host, docker compose, single server
- `generic-ssh`
  - category: deploy target
  - capabilities: remote command, file upload, single server
- `aliyun`
  - category: cloud provider
  - capabilities: ECS, registry, future VPC integration
- `tencent-cloud`
  - category: cloud provider
  - capabilities: CVM, registry, future VPC integration
- `acme`
  - category: infra service
  - capabilities: certificate issuance, HTTP-01 challenge, ACME account/order flow

## Provider Diagnostics

`system.providers.list` returns the provider inventory with safe operational diagnostics:

- `capabilities`: stable capability flags for automation and compatibility checks
- `capabilityDetails`: user-facing capability labels, enabled state, and safe descriptions
- `configuration`: configured/not-configured/partial/unknown status plus stable diagnostic codes

Provider diagnostics must describe Appaloft-visible capability and configuration state only. They
must not expose provider SDK types, raw SDK response payloads, access tokens, private keys, secret
references, certificate material, or unredacted command output. Planned providers may stay visible
with disabled capability details and `not-configured` diagnostics so operators can distinguish
"known but unavailable" from "unknown provider".

## Adding A Provider

1. Create `packages/providers/<name>`.
2. Export a stable `ProviderDescriptor`.
3. Add safe `capabilityDetails` and `configuration` diagnostics.
4. Keep vendor SDK details inside that package.
5. Add a contract test for descriptor shape/capabilities/diagnostics.
6. Register it through the provider registry.
7. Update docs and operations guidance.

## Provider vs Deploy Target vs Infra Service

- provider:
  - the high-level provider abstraction
- deploy target:
  - where workloads run
- infra service:
  - supporting services like DNS, registry, or storage

One provider family may implement more than one concern, but the abstractions stay separate.
