---
title: "Agent Sandboxes"
description: "理解 Agent Runtime 与隔离 Sandbox 的所有权和安全边界。"
docType: concept
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["agent sandbox", "isolation", "VPS"]
relatedOperations: [sandboxes.create, sandboxes.show, sandboxes.exec, sandbox-processes.terminate]
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

生产凭据不应写入 Sandbox 环境变量、文件、Run event 或错误。需要调用外部目标时，应使用
destination-bound credential broker；destination、method、expiry 与变换方式不匹配时 fail closed。
Appaloft 的隔离边界降低宿主暴露面，但不把任意依赖、模型输出或 Agent 生成代码变成可信代码。
