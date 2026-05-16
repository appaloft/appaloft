# resource-secret-reference-created Event Spec

Produced by `resources.secrets.create` after a Resource-owned secret reference is persisted.
Payload includes safe Resource, Project, Environment, secret key, exposure, and `createdAt`.
It must not include raw secret material.

