# Plan: Control-Plane Portability

- Add encrypted-envelope, artifact-custody, and transactional snapshot provider ports.
- Add plan/export/import-plan/import/list/show/delete operations and durable readback.
- Supply PG/PGlite snapshot adapter and local artifact provider; downstream distributions may
  replace custody without changing operations.
- Add owner authorization, redaction, compatibility, merge/replace, rollback, cleanup, CLI stdin,
  API, Web, docs, and tests.
