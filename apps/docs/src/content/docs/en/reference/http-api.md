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

<h2 id="api-shared-operation-schema">Shared operation schema</h2>

HTTP/oRPC inputs must reuse business operation schemas instead of inventing transport-only business semantics.

<h2 id="api-lifecycle-status">Lifecycle status</h2>

API callers should observe asynchronous state through public query/read surfaces.

<h2 id="api-error-recovery">Errors and recovery</h2>

Error docs should include stable code, category, retryability, user action, and troubleshooting links.

<h2 id="api-doc-links">Documentation links</h2>

OpenAPI, oRPC, and future tool descriptions should point to public docs anchors.
