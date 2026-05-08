# Self-Hosted Instance Bootstrap Proxy

## Behavior

Self-hosted installation should produce a reachable Appaloft console without requiring users to
manually author reverse-proxy configuration.

## Acceptance Criteria

| ID | Scenario | Acceptance |
| --- | --- | --- |
| INSTANCE-BOOTSTRAP-SPEC-001 | Install without a domain | `install.sh` uses PostgreSQL by default, keeps direct host access on port `3721`, derives a usable `APPALOFT_WEB_ORIGIN`, and starts the resident Traefik edge unless disabled. |
| INSTANCE-BOOTSTRAP-SPEC-002 | Install with a domain | `install.sh --domain <domain>` sets `APPALOFT_WEB_ORIGIN=https://<domain>`, writes the console bootstrap route to Traefik, enables ACME HTTP challenge storage, and keeps the direct host port available. |
| INSTANCE-BOOTSTRAP-SPEC-003 | Reconfigure instance domain | Rerunning the installer with a new `--domain` is idempotent and preserves existing database volumes. |
| INSTANCE-BOOTSTRAP-SPEC-004 | Console guidance | The Web console exposes an Instance page that shows the current origin and the installation or rerun commands operators need for domain and Action configuration. |

## Boundaries

- The instance bootstrap route is not a project `Resource`, a `DomainBinding`, or a deployment
  route.
- GitHub Actions self-hosted mode still requires an explicit `control-plane-url`.
- Automatic server discovery and automatic GitHub link-token adoption are out of scope for this
  slice.
