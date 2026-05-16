# resource-secret-reference-rotated Event Spec

Produced by `resources.secrets.rotate` after an existing Resource-owned secret reference value is
rotated. Payload includes safe Resource, Project, Environment, secret key, exposure, and
`updatedAt`. It must not include raw secret material.

