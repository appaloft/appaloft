# resource-secret-reference-deleted Event Spec

Produced by `resources.secrets.delete` after an existing Resource-owned secret reference is
removed. Payload includes safe Resource, Project, Environment, secret key, exposure, and
`deletedAt`. It must not include raw secret material.

