# Self-Hosted Instance Bootstrap Proxy Tasks

- [x] Add ADR for installer-owned instance bootstrap route.
- [x] Change self-host direct access default port to `3721`.
- [x] Keep installer default database as PostgreSQL.
- [x] Add `install.sh --domain` and `--proxy traefik|none`.
- [x] Write a resident Traefik service, edge network, ACME volume, and console route labels.
- [x] Keep `--database pglite` as explicit single-server mode.
- [x] Update deploy-action install-console defaults and pass `--domain`/`--proxy`.
- [x] Add `controlPlane.install.proxy` config schema support.
- [x] Add Web console Instance guidance page.
- [x] Update public docs and operator docs.
- [x] Bind tests to `CONTROL-PLANE-INSTALL-004` coverage.
