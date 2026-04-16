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

## Adding A Provider

1. Create `packages/providers/<name>`.
2. Export a stable `ProviderDescriptor`.
3. Keep vendor SDK details inside that package.
4. Add a contract test for descriptor shape/capabilities.
5. Register it through the provider registry.
6. Update docs and operations guidance.

## Provider vs Deploy Target vs Infra Service

- provider:
  - the high-level provider abstraction
- deploy target:
  - where workloads run
- infra service:
  - supporting services like DNS, registry, or storage

One provider family may implement more than one concern, but the abstractions stay separate.
