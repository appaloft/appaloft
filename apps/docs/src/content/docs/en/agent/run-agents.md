---
title: "Run agents"
description: "Create a Runtime inside an Appaloft Sandbox and submit observable, cancellable Agent Runs."
docType: task
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["Agent Runtime", "Pi", "OpenCode", "Agent Run"]
relatedOperations: [sandboxes.agents.runtimes.create, sandboxes.agents.runs.create, sandboxes.agents.runs.events, sandboxes.agents.runs.cancel]
sidebar: { label: "Run agents", order: 0 }
---

> Maturity: **Public alpha**. The public API supports Pi and OpenCode adapters. Both require an
> operator-provisioned Sandbox template pinned by version and digest.

# Run an agent in a Sandbox [#sandbox-agent-runtime]

An Agent Runtime belongs to one ready Sandbox. Your application keeps the chat/session; Appaloft
owns isolated execution, one active Run per Runtime, fresh/continue lineage, event readback, and
cancellation.

Typical product stories include:

- **Chat-to-App:** a user asks your SaaS to create or modify an application. Your product keeps the
  chat and user session; Appaloft receives a bounded task and runs it in an expiring Sandbox.
- **Repository maintenance:** a support or engineering workflow gives a coding agent a prepared
  workspace, then reads Run events and the terminal outcome back into the originating ticket.
- **Human-gated automation:** a Run can pause on a structured approval request; your application
  shows the capability, destination, request digest, and expiry before resolving it.

Agent operations currently require a product session. Do not substitute a deploy token in a
backend example until a scoped long-lived application credential is explicitly available.

```ts
const workspace = await appaloft.workspaces.create({
  sandbox: sandboxInput,
  harness: "opencode",
});
const agent = workspace.agent;
const run = await agent.runs.create({ task: "Build the requested app in /workspace/app" });
```

The SDK maps `Agent` to the canonical Sandbox Agent Runtime, uses the admitted Pi/OpenCode template defaults,
and generates idempotency keys. Pass `harnessTemplateId`, `context`, or `idempotencyKey` when the
caller needs an explicit pin or continuation. Resource methods throw `AppaloftSdkRequestError`;
the non-throwing generated operations remain at `appaloft.operations`.

Run events have count, depth, and string bounds and recursively redact credential, secret,
password, token, and authorization fields. They are not audit events or a full model transcript.
Pi runs as a terminable background process in the Sandbox. OpenCode uses one server confined to the
Sandbox provider's private network namespace, without a published host port, and a separate attached
client process. Cancellation terminates the client process and prevents a late success result from
overwriting `cancelled`.

The official examples repository contains runnable, end-to-end-oriented source for
[Chat-to-App](https://github.com/appaloft/examples/blob/main/sandbox-agent/src/chat-to-app.ts),
[human approval](https://github.com/appaloft/examples/blob/main/sandbox-agent/src/approval-loop.ts),
and [Preview-to-Promotion](https://github.com/appaloft/examples/blob/main/sandbox-agent/src/preview-promote.ts).
