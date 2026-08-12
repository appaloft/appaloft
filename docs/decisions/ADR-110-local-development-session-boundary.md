# ADR-110: Local Development Session Boundary

Status: Accepted

Date: 2026-08-12

## Context

Appaloft has a mature Deployment lifecycle, repository configuration/service graph and a packaged
Rust/Ratatui Workspace control renderer. A Railway-style development experience must reuse those
truths without turning an ephemeral local process into a production Deployment or creating a
Cloud-only service graph.

## Decision

1. Public Appaloft owns `appaloft dev`, Development Plan/Session contracts and local runtime
   supervision.
2. The deployment-config parser and normalized service graph are shared input truth. An optional
   development overlay may change command/watch behavior only.
3. DevelopmentSession is a runtime coordination record with a secret-free local manifest. It is not
   a Deployment, Resource, Workspace, aggregate event stream or product database table.
4. Foreground execution is default; Ctrl-C performs bounded graceful cleanup. Detached execution is
   explicit and exact re-runs resume instead of duplicating the graph.
5. Interactive presentation extends the accepted Rust/Ratatui sidecar. Bun owns lifecycle, process,
   gateway and IO; the renderer owns no business truth.
6. Readiness requires declared health evidence. Stop preserves declared persistent data; reset is
   explicit and destructive.
7. R2b transports the same plan/session semantics through an outbound Worker and may not redefine
   them in Cloud.

## Consequences

- Local and remote development can share one public contract.
- Production deployment history stays truthful.
- Headless automation and TUI use the same lifecycle and error model.
- Cloud adoption requires no private Dev aggregate or table.

## Rejected Alternatives

- Fake local Deployments, a Cloud Dev model, an OpenTUI rewrite, implicit background execution,
  silent certificate trust or process cleanup based only on PID.

## Verification

See [Local Development Session](../specs/132-local-development-session/spec.md) and the
[Local Development Session Test Matrix](../testing/local-development-session-test-matrix.md).
