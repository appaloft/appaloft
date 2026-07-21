---
title: "Agent Sandboxes"
description: "Understand the ownership and security boundary between an Agent Runtime and its isolated Sandbox."
docType: concept
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["agent sandbox", "isolation", "VPS"]
relatedOperations: [sandboxes.create, sandboxes.show, sandboxes.exec, sandbox-processes.terminate]
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

Production credentials must not enter Sandbox environment variables, files, Run events, or errors.
External access should use a destination-bound credential broker that fails closed on a destination,
method, expiry, or transformation mismatch. Isolation reduces host exposure; it does not make
arbitrary dependencies, model output, or generated code trusted.
