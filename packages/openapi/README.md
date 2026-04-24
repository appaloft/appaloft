# @appaloft/openapi

Framework-neutral OpenAPI reference package for Appaloft.

Responsibilities:

- generate the Appaloft OpenAPI document from the oRPC router
- tag operations by Appaloft business domain for reference navigation
- render a Scalar API reference page
- expose Web `Response` handlers that Bun, Elysia, or another HTTP runtime can mount
- expose a system plugin definition for the built-in Appaloft plugin host

Default routes:

- `/api/reference` for the Scalar UI
- `/api/openapi.json` for the OpenAPI document

This package intentionally does not import Elysia.
