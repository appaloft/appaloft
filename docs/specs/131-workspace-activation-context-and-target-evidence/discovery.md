# Workspace Activation Context And Target Evidence Discovery

## Outcome

A developer can use one public Workspace activation workflow across local, registered-Server and
hosted managed compositions. A composition may ensure missing public context and return safe target
selection evidence, while infrastructure policy and topology stay outside public core.

## Confirmed decisions

- Reuse `workspaces.open`; do not add a Workspace aggregate or command.
- Add optional initializer and placement-evidence ports.
- Persist safe evidence across create/resume/status.
- Never infer target ownership or expose infrastructure identity.
- Default behavior remains fail closed when context is missing.

## Non-goals

- Hosted entitlement, billing, fleet inventory or target policy implementation.
- Automatic local/BYOS fallback.
- Server provisioning, relay, or Workspace lifecycle changes.
