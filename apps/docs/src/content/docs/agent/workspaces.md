---
title: "Agent Workspace"
description: "用一个公共入口创建、重连和预览 Pi 或 OpenCode 远程开发环境。"
docType: task
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["远程开发", "OpenCode", "Pi", "workspace"]
relatedOperations: [sandboxes.create, sandboxes.agents.harnesses.list, sandboxes.agents.runtimes.create, sandboxes.agents.runtimes.attach, sandboxes.agent-tasks.create, terminal-sessions.open, sandbox-ports.expose]
sidebar: { label: "Agent Workspace", order: 0 }
---

> 成熟度：**Public alpha**。Workspace CLI、SDK 和底层 operation 属于 Public Appaloft；具体
> Sandbox provider、模板、网关和公网地址能力取决于部署配置。

# 创建一个 Agent Workspace [#agent-workspace]

Agent Workspace 是公共工作流，不是 Cloud 专属资源。它把一个 Sandbox 和其中一个 Pi 或 OpenCode
Runtime 组合起来；`workspaceId` 就是 `sandboxId`，因此没有第二份生命周期或数据库记录。

```bash
appaloft workspace create \
  --harness opencode \
  --sandbox-template sbt_opencode \
  --repo https://github.com/acme/web.git \
  --branch feature/login \
  --isolation gvisor \
  --cpu-millis 2000 \
  --memory-bytes 2147483648 \
  --disk-bytes 10737418240 \
  --max-processes 128
```

改成 `--harness pi` 即可创建 Pi Workspace。默认 harness template 分别是
`aht_opencode_managed_v1` 和 `aht_pi_managed_v1`；运营方必须把对应的固定版本 Sandbox template
注册到运行时。

`appaloft workspace harness list` 会返回当前部署实际注册的 adapter、Sandbox Template、
交互方式、Session 恢复、持久化路径、healthcheck 与 task capability。Console 的创建入口也读取
这份公共 catalog，不靠 Agent 名称写死按钮。

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
appaloft workspace connect <workspaceId>
appaloft workspace connect <workspaceId> --session-id <terminalSessionId>
```

Terminal Session 由 Appaloft 托管 PTY。客户端断线只会 detach；只要 Session TTL 和 Sandbox
仍有效，使用同一个 `terminalSessionId` 重连会重放有界输出并继续同一个进程。Console 重新打开
Workspace 详情时也会查找并重连最新的 active Sandbox Session。tmux 可以由模板额外安装，但不是
保持 Workspace 会话的必需依赖。

OpenCode Runtime 会在 Sandbox provider 的私有网络命名空间内启动 `opencode serve`，且不发布
宿主机端口；HOME/XDG data 放在 `/workspace` 下，因此 session 数据跟随持久 Workspace 文件系统。
远程原生 attach 需要部署方提供受身份验证的 scoped gateway；不要直接暴露 OpenCode server 端口。

```bash
appaloft workspace attach <workspaceId>
```

该命令刷新远端 OpenCode 服务与模型能力，只签发最长一小时、可撤销的 private access
descriptor，并返回本地 `opencode attach` handoff。
不支持安全 gateway 的 provider 会明确返回 unavailable。

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

## 多人和多 Agent 协作

一个 Collaboration 把已有的 Workspace/Sandbox 作为独立 Lane 组织起来，不接管它们的生命周期：

```bash
appaloft workspace collaboration create
appaloft workspace collaboration participant add <collaborationId>
appaloft workspace collaboration lane add <collaborationId>
appaloft workspace collaboration writer acquire <collaborationId> <laneId>
```

参与者可以是团队成员，也可以是 Pi、OpenCode 或其他 Agent Runtime。每条 Lane 同时只有一个持有
租约的 writer；其他参与者可通过带时效、可撤销的 access descriptor 旁观同一个真实 PTY 输出，
但不能发送输入。writer 转交会增加 fencing generation，旧客户端即使仍连接也不能继续写入。

Console 和 CLI 只管理连接、权限、重连与交接，不重新实现 Agent 自己的 TUI。支持 native attach
的 Agent 可以获得原生客户端连接命令；其他交互式 Agent 继续使用其自身 TUI 所在的受管 PTY。
评审交接绑定不可变 Source Artifact digest，接受或拒绝不会把两个 Workspace 的工作目录直接合并。

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
clone/source materialization 可由 `workspace create --repo/--ref/--branch` 以 argv-safe 流程完成；
失败会返回已经创建的 Workspace identity，供调用方重试或清理。该入口当前只接受不含用户名、
密码或 token 的 HTTPS locator；私有仓库 credential 不得嵌入 URL，需由部署方的可信 source
integration 或模板准备。

## 运行、评审和交付 Task

```bash
appaloft workspace task run <workspaceId> \
  --runtime-id <runtimeId> \
  --task "修复 Issue #123 并运行测试" \
  --check-arg bun \
  --check-arg test

appaloft workspace task show <workspaceId> <taskRunId>
appaloft workspace task resume <workspaceId> <taskRunId>
appaloft workspace task approve <workspaceId> <taskRunId>
appaloft workspace task deliver <workspaceId> <taskRunId> \
  --branch fix/issue-123 \
  --commit-message "fix: resolve issue 123" \
  --pull-request-title "Fix issue 123"
```

Task Run 由服务端持久化和恢复。客户端断开不会取消 Agent；完成后会运行显式 argv checks、保存
有界且脱敏的 Git status/stat/patch，并可启动 Development Preview 或生成不可变
Source Artifact/Candidate Preview。批准和源码交付必须由外部用户或可信 CLI actor 发起，Sandbox
runtime identity 不能自我批准。GitHub 交付 credential 由服务端 integration auth 临时解析，经
有界 stdin 注入 Git/GitHub CLI 子进程，不进入 Task state、argv 或日志。
