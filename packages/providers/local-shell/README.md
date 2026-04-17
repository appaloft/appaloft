# @appaloft/provider-local-shell

Local shell deployment target provider.

Responsibilities:

- describe the current machine as a first-class deploy target
- advertise local command, docker, and compose capabilities
- back the manual smoke and local validation workflow

Must not:

- own runtime planning logic
- embed UI or HTTP-specific behavior
