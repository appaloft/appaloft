# Providers

## Provider Categories

- deploy target provider
  - example: Generic SSH
- infra service provider
  - future registry, DNS, object storage providers
- external onboarding provider
  - future provider-assisted flows that can propose SSH target details or open partner setup links

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
references, certificate material, or unredacted command output. Base Appaloft should not ship
vendor-specific placeholder providers that are not implemented.

## SSH Provider-Assisted Onboarding

Server registration always creates a `generic-ssh` deployment target. The console does not ask
operators to choose a cloud vendor or deploy-target provider when they create a server.

Future provider-assisted SSH onboarding should live behind a separate extension point. An
external onboarding provider may help an operator create or connect infrastructure, then return a
safe target proposal for the normal `generic-ssh` registration flow. The proposal may include:

- display name, host, SSH port, and login user hint
- credential source hint or a reference to an existing credential record
- partner setup URL or provider connection id
- safe capability and diagnostic metadata

The proposal must not include private key material, provider access tokens, raw SDK responses, or
provider-native objects that would leak through the public Appaloft model. Cloud or Enterprise
distributions can implement these adapters in their own composition root and prefill the generic
SSH form after the operator authorizes the provider flow.

The detailed public boundary is tracked in
[`SSH Onboarding Provider Extension Point Spec`](./specs/092-ssh-onboarding-provider/spec.md).

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
