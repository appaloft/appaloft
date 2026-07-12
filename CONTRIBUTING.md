# Contributing to Appaloft

Thanks for helping improve Appaloft. This repository owns the neutral Community deployment model,
CLI, HTTP API, Web console, providers, MCP transport, public AI skill, and public documentation.

## Before You Start

- Search existing issues and pull requests before opening a new one.
- Use an issue form for bugs, feature proposals, or questions.
- Report security vulnerabilities privately through the process in [SECURITY.md](./SECURITY.md).
- Keep hosted Cloud pricing, billing, entitlement, private topology, and other commercial policy out
  of this public repository.

For a substantial behavior change, open an issue first. Describe the developer problem, current
behavior, expected behavior, affected entrypoints, and a small reproducible example. Maintainers may
ask for an ADR, operation-catalog update, workflow/spec change, or test-matrix entry before code.

## Local Setup

Requirements:

- Bun 1.3.14 or newer
- Docker for real runtime smoke tests
- PostgreSQL only when the selected test path requires it; PGlite covers the embedded path

```bash
bun install
bun run typecheck
bun run test
```

Run the narrowest relevant checks while iterating. Before requesting review, run:

```bash
bun run lint:ci
bun run typecheck
```

Real Docker, SSH, DNS, TLS, provider, and production-like smoke tests are opt-in. State exactly
which ones you ran and what external resources they created or cleaned up.

## Pull Requests

- Keep one behavior or documentation outcome per pull request.
- Add tests for behavior and boundary changes.
- Update the governing ADR, operation catalog, workflow, test matrix, CLI/API help, and public docs
  when the user-visible contract changes.
- Preserve dependency direction and provider boundaries described in [AGENTS.md](./AGENTS.md).
- Include reproduction steps, validation commands, limitations, and screenshots for Web changes.
- Do not include secrets, production identifiers, customer data, or private commercial plans.

Small fixes and documentation improvements are welcome. Maintainers may close proposals that expand
the public core with provider-specific or hosted-service policy, but will explain the appropriate
extension point or repository when possible.

## Commit Messages

Use the repository's commitlint-compatible form:

```text
type(scope): lower-case imperative subject
```

Common types include `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, and `security`.

By participating, you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).
