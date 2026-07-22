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
  - deployments.timeline.stream
sidebar:
  label: "TypeScript SDK"
  order: 11
---

## Operation client [#typescript-sdk-operation-client]

`@appaloft/sdk` is an operation client for automation and integrations. It calls the Appaloft HTTP/oRPC API. It does not embed the application runtime or expose internal use cases, repositories, handlers, or domain objects.

SDK methods must come from the OpenAPI SDK contract and `x-appaloft-*` operation metadata. Do not add SDK-only business methods. Add or extend a command/query in the operation catalog when a new business capability is needed.

## Install and configure [#typescript-sdk-install]

After publication, Node, Bun, or browser automation can install `@appaloft/sdk` and create a client with a `baseUrl`.

```ts
import { createAppaloftClient } from "@appaloft/sdk";

const appaloft = createAppaloftClient({
  baseUrl: "https://appaloft.example/api",
});
```

`baseUrl` should point to the `/api` root of the same Appaloft instance. For self-hosted installs, prefer the console/API URL printed by the installer.

## Authentication [#typescript-sdk-authentication]

Interactive product operations use a product-session cookie. Machine automation uses a deploy-token bearer credential. Do not store deploy tokens in repository config files. In CI, pass them through trusted secrets or environment variables.

```ts
const productClient = createAppaloftClient({
  baseUrl: "https://appaloft.example/api",
  auth: {
    kind: "product-session",
    cookie: "better-auth.session_token=...",
  },
});

const actionClient = createAppaloftClient({
  baseUrl: "https://appaloft.example/api",
  auth: {
    kind: "deploy-token",
    token: process.env.APPALOFT_TOKEN ?? "",
  },
});
```

Organization scope is passed through the concrete operation path, query, or body fields, such as `organizationId`. Switching the current organization should still call the public organization-switch operation instead of relying on hidden SDK state.

## Operation examples [#typescript-sdk-operation-examples]

Every SDK call should correspond to an operation key. Input fields come from the same command/query schema, and output comes from the HTTP/oRPC contract.

```ts
const created = await appaloft.projects.create({ name: "Demo" });
const listed = await appaloft.projects.list({ limit: 20 });
const shown = await appaloft.projects.show({ projectId: "prj_123" });

const plan = await appaloft.dependencyResources.provisioning.plan({
  projectId: "prj_123",
  environmentId: "env_123",
});

if (!created.ok) {
  // result.error is a structured Appaloft error.
  throw new Error(created.error.code);
}
```

Facade names are generated from operation keys: kebab-case becomes camelCase, and dots become nested groups. For example, `dependency-resources.provisioning.plan` becomes `dependencyResources.provisioning.plan`.

Path parameters can be passed as top-level fields. Remaining fields default to query parameters for `GET`, `DELETE`, and streaming operations, and to JSON body for other operations. Use explicit `pathParams`, `query`, or `body` when an integration needs to control that split.

Operation descriptors are generated internals. Public SDK callers should use the facade methods instead of passing operation metadata by hand.

The SDK is the right boundary for API tests and external automation. Domain rules, application handlers, repositories, and adapter unit tests should stay at the layer they prove.

## Sandbox resource handles [#typescript-sdk-resource-handles]

Ownership-led Sandbox flows use resource handles so callers do not repeat parent ids:

```ts
const sandbox = await appaloft.sandboxes.create(sandboxInput);

try {
  const agent = await sandbox.agents.create({ harness: "pi" });
  const run = await agent.stream({ prompt: "Analyze and update the workspace" });

  for await (const envelope of run.fullStream) {
    if (envelope.kind === "event") console.log(envelope.eventType, envelope.data);
    if (envelope.kind === "error") throw new Error(envelope.code);
  }
} finally {
  await sandbox.terminate();
}
```

`Agent` is an SDK alias for a Sandbox Agent Runtime. The Pi shorthand defaults to the admitted
`aht_pi_managed_v1` harness template, fresh Run context, and generated idempotency keys. Explicit
`harnessTemplateId`, `context`, and `idempotencyKey` values override those SDK defaults.
`agent.stream({ task })` creates a Run and returns that same Run's durable event sequence as
`fullStream`; `prompt` is a migration-friendly alias for `task`. Appaloft does not own the chat
session: the caller still stores messages and decides between fresh context and continuation with
`parentRunId`. Existing Runs can be read or resumed with `run.events.list()` and
`run.events.stream({ afterSequence, signal })`.

Sandbox handles also expose `sandbox.files.read/write`, `sandbox.exec`, and `sandbox.terminate`.
These methods only inject the handle's `sandboxId`; they still call the generated public operations.

Resource methods return descriptors directly and throw `AppaloftSdkRequestError` on failure. For
the complete non-throwing `{ ok, status, data/error }` facade, use `appaloft.operations`, for example
`appaloft.operations.sandboxes.create(input)`.

## Structured errors [#typescript-sdk-errors]

Generated operations return stable structured error fields: `code`, `category`, `message`,
`retryable`, and optional `details`. Resource handles expose the same safe fields on
`AppaloftSdkRequestError`. Automation should branch on `code`, `category`, or `retryable`, not the
human-readable `message`.

Common auth errors include:

- `product_auth_missing` or `product_auth_invalid`: the product session is missing, expired, or unverifiable.
- `product_auth_forbidden`: the current user is not a member of the target organization or does not have the required role.
- `action_auth_missing` or `action_auth_invalid`: the Action/deploy-token credential is missing or invalid.
- `action_auth_forbidden`: the deploy token is valid, but its scope does not cover the current request.

## Streaming events [#typescript-sdk-streaming]

Only operations marked with `x-appaloft-streaming: true` in OpenAPI metadata can use the SDK stream helper. Callers should pass an `AbortSignal` to cancel long-lived connections and handle structured envelopes for events, heartbeats, gaps, close signals, and errors.

```ts
const controller = new AbortController();

for await (const envelope of appaloft.deployments.streamEvents({
  deploymentId: "dep_123",
  signal: controller.signal,
})) {
  if (envelope && typeof envelope === "object" && "kind" in envelope) {
    // Handle event, heartbeat, gap, closed, or error envelopes.
  }
}
```

When the stream returns `closed`, or when the caller aborts the `AbortSignal`, automation should stop reading and reopen the stream only when needed.

Streaming facade methods return `AsyncIterable` values. They do not switch the SDK to throw-only request behavior; ordinary request facades still return `{ ok, status, data }` or `{ ok, status, error }`.

Current generator note: the operation catalog and OpenAPI metadata do not yet expose enough stable schema names for per-operation input/output aliases in every generated facade method. The TypeScript facade is generated from operation keys and route metadata today; future generator work should attach request, response, and stream envelope schema ids so non-TypeScript SDKs can emit equivalent typed method signatures.
