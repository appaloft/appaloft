# @yundu/application

CQRS-oriented application layer for Yundu.

Responsibilities:

- command/query messages, buses, decorator-registered handlers, use-case handlers, ports, tokens, execution context
- orchestration across repositories, registries, event bus, and execution backend
- keep CLI and HTTP on the same command/query dispatch path
- define one operation per file set under `src/operations/<domain>/`
- keep `src/operation-catalog.ts` as the canonical operation inventory for AI agents and transport adapters
- keep handlers, use cases, and query services constructor-driven, annotated with `@injectable()` plus explicit `@inject(tokens.xxx)`, and register them into `tsyringe` from the shell composition root via explicit tokens
- for complex workflows, keep aggregate/snapshot/runtime-plan construction in operation-local factories, builders, or lifecycle services so the use case stays orchestration-focused

Depends on:

- `@yundu/core`

Must not:

- talk to HTTP, CLI, database, or providers directly
- call container APIs directly or use service-locator patterns
- bypass command/query handlers from transport adapters for newly introduced business endpoints
- reintroduce grouped implementation files that mix multiple commands, queries, handlers, or use cases in one module
