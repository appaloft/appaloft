---
title: "HTTP API reference"
description: "HTTP/oRPC operations, schemas, lifecycle status, and recovery guidance."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "api"
  - "http"
  - "orpc"
  - "openapi"
relatedOperations:
  - projects.create
  - resources.create
  - deployments.create
sidebar:
  label: "HTTP API reference"
  order: 10
---

## Shared operation schema [#api-shared-operation-schema]

HTTP/oRPC inputs must reuse business operation schemas instead of inventing transport-only business semantics.

## OpenAPI and Scalar reference [#api-openapi-reference]

The backend serves the OpenAPI 3.1 document at `/api/openapi.json` and the Scalar interactive API reference at `/api/reference` by default.

The public docs site also generates OpenAPI reference pages at `/docs/reference/openapi/`, with each operation expanded into its own page.

OpenAPI operations are tagged by Appaloft business domain so Scalar and generated docs avoid a flat route list.

Those entries are registered by the built-in OpenAPI Reference system plugin. Other Bun or Elysia servers can import `@appaloft/openapi` and mount the exported `Response` handlers on their own routes.

## Lifecycle status [#api-lifecycle-status]

API callers should observe asynchronous state through public query/read surfaces.

## Errors and recovery [#api-error-recovery]

Error docs should include stable code, category, retryability, user action, and troubleshooting links.

## Documentation links [#api-doc-links]

OpenAPI, oRPC, and future tool descriptions should point to public docs anchors.
