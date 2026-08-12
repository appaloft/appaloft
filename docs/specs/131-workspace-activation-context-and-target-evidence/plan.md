# Plan: Workspace Activation Context And Target Evidence

1. Add initializer and validated evidence contracts in application.
2. Invoke initializer only on missing Binding/default Profile and re-read canonical repositories.
3. Extend placement reservation and open entry/result with safe evidence.
4. Persist evidence in PG/PGlite open-entry schema; preserve legacy unclassified reads.
5. Return evidence through operation schema, SDK, CLI and Workspace presentation.
6. Update public Workspace docs, operation map and Test Matrix.
7. Run focused tests, lint, typecheck, full tests/build and docs-impact gate.

No new event, aggregate or command is required. Existing open command/query boundaries remain.
