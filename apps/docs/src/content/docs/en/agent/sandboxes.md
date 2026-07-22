---
title: "Agent Sandboxes"
description: "Understand the ownership and security boundary between an Agent Runtime and its isolated Sandbox."
docType: concept
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["agent sandbox", "isolation", "VPS"]
relatedOperations: [sandboxes.create, sandboxes.show, sandboxes.exec, sandboxes.agents.runs.events.stream, sandbox-processes.terminate]
sidebar: { label: "Agent Sandboxes", order: 1 }
---

> Maturity: **Private preview**. The Execution Sandbox domain, API, and Docker provider are
> implemented. Cloud worker, gVisor, internal-network, and gateway availability is operator-specific.

# A Sandbox is not a VPS account

A Sandbox is a controlled execution environment with ownership, lifecycle, resource limits,
network policy, file/process APIs, template or snapshot provenance, and exact cleanup. A VPS or
worker hosts the provider; it is not directly exposed to the application developer or agent.

```text
Sandbox
└── Agent Runtime
    ├── Run (active)
    └── Run (terminal lineage)
```

An application normally creates one short-lived Sandbox per user task or isolated work branch:

```ts
const sandbox = await appaloft.sandboxes.create({
  source: { kind: "template", templateId: process.env.APPALOFT_SANDBOX_TEMPLATE_ID! },
  requestedIsolation: "gvisor",
  limits: { cpuMillis: 2_000, memoryBytes: 2_147_483_648, diskBytes: 10_737_418_240, maxProcesses: 128 },
  networkPolicy: { mode: "deny", rules: [] },
  expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
});

try {
  await sandbox.files.write({ path: "job/input.txt", contentBase64: "aGVsbG8=" });
  await sandbox.exec({ argv: ["python3", "/workspace/job.py"], timeoutMs: 10_000 });

  const agent = await sandbox.agents.create({ harness: "pi" });
  const run = await agent.stream({ task: "Check the test failures and fix production code" });
  for await (const envelope of run.fullStream) {
    if (envelope.kind === "event") console.log(envelope.data);
  }
} finally {
  await sandbox.terminate();
}
```

Run events are persisted incrementally while execution is active. After disconnecting, use
`run.events.stream({ afterSequence })` to resume after the last acknowledged sequence. Closing a
browser or API connection only stops reading; cancel the Run explicitly to stop execution.

Production credentials must not enter Sandbox environment variables, files, Run events, or errors.
External access should use a destination-bound credential broker that fails closed on a destination,
method, expiry, or transformation mismatch. Isolation reduces host exposure; it does not make
arbitrary dependencies, model output, or generated code trusted.

See the [Chat-to-App example](https://github.com/appaloft/examples/blob/main/sandbox-agent/src/chat-to-app.ts)
for the complete Sandbox → Runtime → Run ownership chain.
