# @appaloft/adapter-packaging

Responsibility:

- define release artifact descriptors for backend-only, web-static, all-in-one image, compose bundle, and future binary outputs
- keep packaging concerns out of `core` and out of the web app
- provide a single place for release-manifest generation

Allowed dependencies:

- Node runtime utilities
- release/build scripts

Forbidden:

- business use cases
- HTTP, CLI, or database logic
- cloud-provider SDK coupling
