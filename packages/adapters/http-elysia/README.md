# @appaloft/adapter-http-elysia

HTTP adapter for Appaloft.

Responsibilities:

- expose REST endpoints through Elysia
- translate transport inputs and outputs using `@appaloft/contracts`
- map application errors to HTTP status codes

Must not:

- contain domain logic
- define persistence access inline
