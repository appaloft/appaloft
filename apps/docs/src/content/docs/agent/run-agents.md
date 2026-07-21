---
title: "运行 Agent"
description: "在 Appaloft Sandbox 内创建 Runtime，并提交可观察、可取消的 Agent Run。"
docType: task
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["Agent Runtime", "Pi", "Agent Run"]
relatedOperations: [sandboxes.agents.runtimes.create, sandboxes.agents.runs.create, sandboxes.agents.runs.events, sandboxes.agents.runs.cancel]
sidebar: { label: "运行 Agent", order: 0 }
---

> 成熟度：**Private preview**。API 已实现；Pi 适配器要求运营方提供固定版本、固定 digest 的
> Sandbox template，并设置 `APPALOFT_PI_SANDBOX_TEMPLATE_ID`。

# 在 Sandbox 中运行 Agent

Agent Runtime 从属于一个已经 ready 的 Sandbox。应用开发者保留 chat/session；Appaloft 管理隔离
执行、每个 Runtime 同时一个 active Run、fresh/continue lineage、事件 readback 和取消。

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

Run 事件会限制数量、深度和字符串大小，并递归 redact credential、secret、password、token 与
authorization 字段。它们不是 audit event，也不能代替完整模型 transcript。

Pi 在 Sandbox 内作为可终止后台进程运行。取消会终止实际进程，并防止迟到的成功结果覆盖
`cancelled` 状态。当前 managed template 只应开放 Sandbox 内部能力；外部发布和 secret 使用必须
继续通过 Appaloft 控制面。
