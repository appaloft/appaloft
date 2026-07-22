---
title: "Agent Sandboxes"
description: "理解 Agent Runtime 与隔离 Sandbox 的所有权和安全边界。"
docType: concept
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["agent sandbox", "isolation", "VPS"]
relatedOperations: [sandboxes.create, sandboxes.show, sandboxes.exec, sandboxes.agents.runs.events.stream, sandbox-processes.terminate]
sidebar: { label: "Agent Sandboxes", order: 1 }
---

> 成熟度：**Private preview**。Execution Sandbox 的领域、API 和 Docker provider 已实现；Cloud
> worker、gVisor、内部网络和 gateway 是否可用取决于运营配置。

# Sandbox 不是一个 VPS 账户

Sandbox 是一次受控执行环境：它有 owner、生命周期、资源上限、网络策略、文件与进程 API、
模板/快照来源和确定的 cleanup。VPS 或 worker 是 Sandbox provider 的承载基础设施，不直接暴露给
应用开发者或 Agent。

Runtime 必须在某个 Sandbox 下创建：

```text
Sandbox
└── Agent Runtime
    ├── Run (active)
    └── Run (terminal lineage)
```

应用通常为每个用户任务或隔离工作分支创建一个短生命周期 Sandbox：

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
  const run = await agent.stream({ task: "检查测试失败并修复生产代码" });
  for await (const envelope of run.fullStream) {
    if (envelope.kind === "event") console.log(envelope.data);
  }
} finally {
  await sandbox.terminate();
}
```

Run 事件会在执行过程中增量持久化；断线后可使用
`run.events.stream({ afterSequence })` 从已确认 sequence 之后继续。终止浏览器或 API 连接只会
停止读取，不会取消 Run；需要停止执行时应显式调用 Run cancel operation。

生产凭据不应写入 Sandbox 环境变量、文件、Run event 或错误。需要调用外部目标时，应使用
destination-bound credential broker；destination、method、expiry 与变换方式不匹配时 fail closed。
Appaloft 的隔离边界降低宿主暴露面，但不把任意依赖、模型输出或 Agent 生成代码变成可信代码。

完整 Sandbox → Runtime → Run 所有权链见官方
[Chat-to-App 示例](https://github.com/appaloft/examples/blob/main/sandbox-agent/src/chat-to-app.ts)。
