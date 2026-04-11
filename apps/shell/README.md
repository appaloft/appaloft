# @yundu/shell

Composition root and runtime entry for Yundu.

Responsibilities:

- load config, logger, tracing, database, repositories, registries
- wire `tsyringe` registrations in one place
- expose the `yundu` CLI and `yundu serve`

Depends on:

- application ports and use cases
- infrastructure adapters and registries

Must not:

- contain core business rules
- bypass application use cases
- use `container.resolve()` inside business logic
