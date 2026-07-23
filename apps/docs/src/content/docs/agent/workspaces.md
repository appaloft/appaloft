---
title: "Agent Workspace"
description: "用一个公共入口创建、重连和预览 Pi 或 OpenCode 远程开发环境。"
docType: task
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["远程开发", "OpenCode", "Pi", "workspace"]
relatedOperations: [sandboxes.create, sandboxes.agents.runtimes.create, terminal-sessions.open, sandbox-ports.expose]
sidebar: { label: "Agent Workspace", order: 0 }
---

> 成熟度：**Public alpha**。Workspace CLI、SDK 和底层 operation 属于 Public Appaloft；具体
> Sandbox provider、模板、网关和公网地址能力取决于部署配置。

# 创建一个 Agent Workspace

Agent Workspace 是公共工作流，不是 Cloud 专属资源。它把一个 Sandbox 和其中一个 Pi 或 OpenCode
Runtime 组合起来；`workspaceId` 就是 `sandboxId`，因此没有第二份生命周期或数据库记录。

```bash
appaloft workspace create \
  --harness opencode \
  --sandbox-template sbt_opencode \
  --isolation gvisor \
  --cpu-millis 2000 \
  --memory-bytes 2147483648 \
  --disk-bytes 10737418240 \
  --max-processes 128
```

改成 `--harness pi` 即可创建 Pi Workspace。默认 harness template 分别是
`aht_opencode_managed_v1` 和 `aht_pi_managed_v1`；运营方必须把对应的固定版本 Sandbox template
注册到运行时。

SDK 提供同样的便利组合：

```ts
const workspace = await appaloft.workspaces.create({
  sandbox: sandboxInput,
  harness: "opencode",
});

console.log(workspace.workspaceId, workspace.agent.runtimeId);
```

如果第二步 Runtime 创建失败，SDK 会抛出 `AppaloftWorkspaceCreateError`，其中仍包含已经创建的
`workspaceId`/`sandboxId`。调用方可以重试 Runtime 创建或显式终止该 Sandbox。

## 断线重连

```bash
appaloft workspace terminal <workspaceId> --attach
```

Terminal Session 由 Appaloft 托管 PTY。客户端断线只会 detach；只要 Session TTL 和 Sandbox
仍有效，稍后 attach 会重放有界输出并继续同一个进程。tmux 可以由模板额外安装，但不是保持
Workspace 会话的必需依赖。

OpenCode Runtime 会在 Sandbox 内启动 loopback-only `opencode serve`，并把 HOME/XDG data 放在
`/workspace` 下，因此 session 数据跟随持久 Workspace 文件系统。远程原生 attach 需要部署方提供
受身份验证的 scoped gateway；不要直接暴露 OpenCode server 端口。

## 临时开发预览

```bash
appaloft workspace preview <workspaceId> \
  --port 3000 \
  --visibility private \
  --expires-at 2026-07-24T12:00:00.000Z
```

这会调用公共 Sandbox Port operation。URL、TLS、鉴权和路由由 provider/gateway adapter 提供；
exposure 到期、被 revoke 或 Sandbox 被清理后，地址必须失效。它是 live development preview，
不是不可变的 Promotion Candidate Preview。

不同团队成员使用不同 Sandbox 时，文件、进程、Terminal Session 和端口 exposure 都有独立
identity；两人都监听内部 3000 端口也不会互相占用。

## 生命周期

```bash
appaloft workspace list
appaloft workspace show <workspaceId>
appaloft workspace pause <workspaceId>
appaloft workspace resume <workspaceId>
appaloft workspace terminate <workspaceId>
```

`workspace list` 是 Sandbox inventory 的组合视图：每项都带 `agentRuntimes`；数组为空表示它还是
可重试或可清理的 partial Workspace，而不是另一张 Workspace 表中的隐藏状态。

pause/resume 保留 Sandbox identity；terminate 终止 Sandbox 及其 owned runtime state。Git
clone/source materialization 尚未隐藏在 Workspace create 中，第一版需要模板或调用方显式准备
`/workspace` 内容。
