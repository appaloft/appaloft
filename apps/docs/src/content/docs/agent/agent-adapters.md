---
title: "管理 Agent Adapter"
description: "校验、安装和管理租户隔离的声明式 Agent Adapter。"
docType: task
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["Agent Adapter", "adapter manifest", "Codex", "OpenCode", "Pi"]
relatedOperations: [agent-adapters.validate, agent-adapters.install, agent-adapters.list, agent-adapters.show, agent-adapters.disable, agent-adapters.uninstall]
sidebar: { label: "Agent Adapter", order: 1 }
---

# 管理 Agent Adapter [#agent-adapter-installations]

Agent Adapter 是一个声明式、不可变的 Agent 集成定义。它描述所需 Sandbox template、运行时、
能力、交互模式、持久路径和凭据类型；Appaloft 不会从 manifest 加载代码，也不接受 shell command
字符串。

每次安装都属于当前组织。两个组织可以安装相同 digest 的定义，但不能看到或操作彼此的安装。
组织成员可以查看安装；组织管理员可以校验、安装、停用和卸载。

## 准备 manifest

下面的 manifest 展示最小的 Codex terminal/headless 适配方式。把 template id、版本、digest 和
runtime 版本范围替换成当前 Appaloft 实例已经准入的值。

```json
{
  "schemaVersion": "appaloft.agent-adapter/v1",
  "id": "codex",
  "displayName": "Codex",
  "version": "1.0.0",
  "kind": "declarative",
  "requirements": {
    "adapterApi": "^1.0.0",
    "sandboxTemplate": {
      "id": "agent-workspace",
      "version": "^1.0.0",
      "digest": "sha256:1111111111111111111111111111111111111111111111111111111111111111"
    },
    "runtimes": [{ "id": "codex", "version": "^1.0.0" }],
    "capabilities": {
      "required": ["managed-terminal", "headless"],
      "optional": []
    }
  },
  "interactionModes": [
    {
      "id": "terminal",
      "transport": "terminal",
      "command": ["codex"],
      "eventFidelity": "raw-pty",
      "sessionRecovery": "process-lifetime"
    },
    {
      "id": "headless",
      "transport": "headless",
      "command": ["codex", "exec"],
      "taskInput": "append-argument",
      "eventFidelity": "line-events",
      "sessionRecovery": "managed-run-lineage"
    }
  ],
  "persistentPaths": ["/workspace/.codex"],
  "healthcheck": { "kind": "process" },
  "credentials": []
}
```

校验只返回规范化后的 digest 和兼容性结果，不会持久化数据或启动 Agent：

```bash
appaloft agent-adapter validate ./codex.agent-adapter.json
appaloft agent-adapter install ./codex.agent-adapter.json
appaloft agent-adapter list
appaloft agent-adapter show <installation-id>
```

也可以在 Web 控制台的“组织设置 → Agent Adapter”粘贴 manifest、先校验再安装。

## 停用和卸载

停用阻止新 Workspace 解析该安装，但不会破坏已有 Workspace 的恢复引用：

```bash
appaloft agent-adapter disable <installation-id>
```

只有没有 active Workspace 引用时才能卸载。存在引用时，服务端返回冲突并保留安装：

```bash
appaloft agent-adapter uninstall <installation-id>
```

卸载只删除当前组织的安装记录，不删除可由其他组织共享的不可变 definition，也不终止已有
Sandbox 或 Agent 进程。
