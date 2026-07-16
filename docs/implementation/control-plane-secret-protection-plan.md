# Control-Plane Secret Protection Implementation Plan

1. Add protector/keyring and rotation-store ports plus safe schemas/results.
2. Implement the versioned authenticated encryption adapter and unavailable-keyring adapter.
3. Protect Environment/Resource secret writes and dependency secret stores.
4. Validate deployment snapshots at plan/admission and materialize all secret values together in the
   shared runtime environment resolver.
5. Implement atomic PG/PGlite rotation dry-run/apply with fault-injection coverage.
6. Align Docker/Compose/SSH/Swarm key semantics and Deployment Proof readback.
7. Wire API/CLI/system composition, public docs/help, and Cloud authz/composition consumption.
8. Run focused, package, integration, real substrate, redaction, and migration verification.
