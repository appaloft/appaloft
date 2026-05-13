---
title: "TypeScript SDK reference"
description: "Public reference for TypeScript SDK installation, authentication, operation calls, errors, and streams."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "sdk"
  - "typescript"
  - "client"
  - "automation"
  - "typed errors"
  - "streaming"
  - "TypeScript SDK"
relatedOperations:
  - projects.create
  - organizations.current-context
  - deployments.stream-events
sidebar:
  label: "TypeScript SDK"
  order: 11
---

<h2 id="typescript-sdk-operation-client">Operation client</h2>

`@appaloft/sdk` is an operation client for automation and integrations. It calls the Appaloft HTTP/oRPC API. It does not embed the application runtime or expose internal use cases, repositories, handlers, or domain objects.

SDK methods must come from the OpenAPI SDK contract and `x-appaloft-*` operation metadata. Do not add SDK-only business methods. Add or extend a command/query in the operation catalog when a new business capability is needed.

<h2 id="typescript-sdk-install">Install and configure</h2>

After publication, Node, Bun, or browser automation can install `@appaloft/sdk` and create a client with a `baseUrl`.

```ts
import { createAppaloftSdkClient, generatedSdkOperations } from "@appaloft/sdk";

const appaloft = createAppaloftSdkClient({
  baseUrl: "https://appaloft.example/api",
});
```

`baseUrl` should point to the `/api` root of the same Appaloft instance. For self-hosted installs, prefer the console/API URL printed by the installer.

<h2 id="typescript-sdk-authentication">Authentication</h2>

Interactive product operations use a product-session cookie. Machine automation uses a deploy-token bearer credential. Do not store deploy tokens in repository config files. In CI, pass them through trusted secrets or environment variables.

```ts
const productClient = createAppaloftSdkClient({
  baseUrl: "https://appaloft.example/api",
  auth: {
    kind: "product-session",
    cookie: "better-auth.session_token=...",
  },
});

const actionClient = createAppaloftSdkClient({
  baseUrl: "https://appaloft.example/api",
  auth: {
    kind: "deploy-token",
    token: process.env.APPALOFT_TOKEN ?? "",
  },
});
```

Organization scope is passed through the concrete operation path, query, or body fields, such as `organizationId`. Switching the current organization should still call the public organization-switch operation instead of relying on hidden SDK state.

<h2 id="typescript-sdk-operation-examples">Operation examples</h2>

Every SDK call should correspond to an operation key. Input fields come from the same command/query schema, and output comes from the HTTP/oRPC contract.

```ts
const result = await appaloft.request({
  operation: generatedSdkOperations.find(
    (operation) => operation.operationKey === "organizations.current-context",
  )!,
});

if (!result.ok) {
  // result.error is a structured Appaloft error.
  throw new Error(result.error.code);
}
```

The SDK is the right boundary for API tests and external automation. Domain rules, application handlers, repositories, and adapter unit tests should stay at the layer they prove.

<h2 id="typescript-sdk-errors">Structured errors</h2>

The SDK returns stable structured error fields: `code`, `category`, `message`, `retryable`, and optional `details`. Automation should branch on `code`, `category`, or `retryable`, not the human-readable `message`.

Common auth errors include:

- `product_auth_missing` or `product_auth_invalid`: the product session is missing, expired, or unverifiable.
- `product_auth_forbidden`: the current user is not a member of the target organization or does not have the required role.
- `action_auth_missing` or `action_auth_invalid`: the Action/deploy-token credential is missing or invalid.
- `action_auth_forbidden`: the deploy token is valid, but its scope does not cover the current request.

<h2 id="typescript-sdk-streaming">Streaming events</h2>

Only operations marked with `x-appaloft-streaming: true` in OpenAPI metadata can use the SDK stream helper. Callers should pass an `AbortSignal` to cancel long-lived connections and handle structured envelopes for events, heartbeats, gaps, close signals, and errors.

```ts
const controller = new AbortController();

for await (const envelope of appaloft.stream({
  operation: generatedSdkOperations.find(
    (operation) =>
      operation.operationKey === "deployments.stream-events" && operation.streaming,
  )!,
  pathParams: { deploymentId: "dep_123" },
  signal: controller.signal,
})) {
  if (envelope && typeof envelope === "object" && "kind" in envelope) {
    // Handle event, heartbeat, gap, closed, or error envelopes.
  }
}
```

When the stream returns `closed`, or when the caller aborts the `AbortSignal`, automation should stop reading and reopen the stream only when needed.
