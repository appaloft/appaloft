# Security

## Secrets

- secrets are modeled explicitly
- read models mask secret values
- build-time secrets are rejected
- logs should never contain unmasked secrets

## SSH Keys

- treat server credentials as provider-side secrets
- prefer dedicated deployment users
- prefer least-privilege SSH keys per environment or server group

## Token Storage

- keep provider and integration tokens outside the frontend
- store them in backend-controlled configuration or future secret manager adapters

## Least Privilege

- providers should receive only the permissions required for deployment operations
- hosted and self-hosted should both minimize credential scope

## Telemetry

- OpenTelemetry is wired at the backend edge
- telemetry is disabled by default
- no tracing SDK leaks into domain aggregates

## Provider Credential Boundaries

- `core` never sees raw provider SDK types
- credentials stay in adapter/provider layers
- web never receives provider credentials or secrets
