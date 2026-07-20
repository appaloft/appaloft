---
title: "Run agents"
description: "Create a Runtime inside an Appaloft Sandbox and submit observable, cancellable Agent Runs."
docType: task
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["Agent Runtime", "Pi", "Agent Run"]
relatedOperations: [sandboxes.agents.runtimes.create, sandboxes.agents.runs.create, sandboxes.agents.runs.events, sandboxes.agents.runs.cancel]
sidebar: { label: "Run agents", order: 0 }
---

> Maturity: **Private preview**. The API is implemented. The Pi adapter requires an
> operator-provisioned Sandbox template pinned by version and digest, with
> `APPALOFT_PI_SANDBOX_TEMPLATE_ID` configured.

# Run an agent in a Sandbox

An Agent Runtime belongs to one ready Sandbox. Your application keeps the chat/session; Appaloft
owns isolated execution, one active Run per Runtime, fresh/continue lineage, event readback, and
cancellation.

```ts
const runtime = await appaloft.sandboxes.agents.runtimes.create({
  sandboxId,
  harnessKey: "pi",
  harnessTemplateId: "aht_pi_managed_v1",
  idempotencyKey: crypto.randomUUID(),
});
const run = await appaloft.sandboxes.agents.runs.create({
  sandboxId,
  runtimeId: runtime.data.runtimeId,
  task: "Build the requested app in /workspace/app",
  context: { mode: "fresh" },
  idempotencyKey: crypto.randomUUID(),
});
```

Run events have count, depth, and string bounds and recursively redact credential, secret,
password, token, and authorization fields. They are not audit events or a full model transcript.
Pi runs as a terminable background process in the Sandbox. Cancellation terminates that process and
prevents a late success result from overwriting `cancelled`.
