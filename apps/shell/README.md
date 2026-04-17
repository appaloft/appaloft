# @appaloft/shell

Composition root and runtime entry for Appaloft.

Responsibilities:

- load config, logger, tracing, database, repositories, registries
- wire `tsyringe` registrations in one place
- expose the `appaloft` CLI and `appaloft serve`

Depends on:

- application ports and use cases
- infrastructure adapters and registries

Must not:

- contain core business rules
- bypass application use cases
- use `container.resolve()` inside business logic
