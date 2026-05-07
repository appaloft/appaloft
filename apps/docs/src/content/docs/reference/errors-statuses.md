---
title: "Errors and statuses"
description: "用户可见错误、阶段和状态说明。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "error"
  - "status"
  - "phase"
  - "错误"
relatedOperations:
  - operator-work.list
  - operator-work.show
sidebar:
  label: "Errors and statuses"
  order: 4
---

<h2 id="reference-error-shape">错误形状</h2>

用户可见错误应包含稳定 code、category、phase 和可执行恢复建议。

<h2 id="error-knowledge-contract">Error Knowledge Contract</h2>

Appaloft 错误不能只给一段 message。公共入口应该保留稳定的 `code`、`category`、`phase`、`retryable` 和安全 details，并为已知错误附上错误知识：

- `responsibility`：这次失败主要需要 user、operator、system、provider 还是 Appaloft 处理。
- `actionability`：调用方应该修输入、等待重试、运行诊断、交给自动恢复、上报问题，还是无需动作。
- `links`：人看的 public docs、agent/LLM 可读 guide、相关 spec/runbook/source symbol。
- `remedies`：可以安全展示或自动建议的恢复动作。

Web、CLI、HTTP/API 和未来 MCP 工具都应该按这些字段渲染错误，不能依赖 message 文本来判断错误类型。

<h2 id="operator-work-ledger">Operator work ledger</h2>

当部署、代理引导、证书签发或远端状态维护这类后台工作没有按预期完成时，先查看工作台账，而不是猜测哪个恢复命令应该运行：

```bash title="查看后台工作"
appaloft work list
appaloft work show <workId>
```

工作台账是只读入口。它汇总 attempt kind、status、phase、关联的 resource/server/deployment/certificate id、稳定 error code/category、是否可重试，以及安全的 `nextActions`。`diagnostic` 表示下一步应该先运行诊断；`manual-review` 表示需要人工确认；`retry` 只表示未来恢复命令可以考虑重试，不会在查询时自动执行；`no-action` 表示当前条目不需要用户动作。

这个入口不会 retry、cancel、recover、dead-letter、delete 或 prune。恢复、清理和重试能力会通过独立的显式命令暴露，避免用户在查看状态时意外改变运行时或远端 SSH 状态。

<h2 id="remote-state-resolution">SSH remote state resolution</h2>

`infra_error` + `remote-state-resolution` 表示 Appaloft 已经到达 SSH 目标机，但在部署身份解析之前，无法准备这台服务器拥有的 `ssh-pglite` 状态根。常见原因包括磁盘或 inode 容量不足、文件系统只读、配置的 runtime root 没有写权限、升级前部署留下的旧版不兼容 PGlite 状态目录，或远端 shell 在创建 state、lock、backup、journal 目录时失败。

处理顺序：

1. 查看 CLI 打印的错误 details，尤其是 `stateBackend`、`host`、`port`、`exitCode`、`reason` 和 `stderr`。
2. 如果 `stderr` 提到 no space、quota、read-only filesystem、permission denied 或 PGlite initialization failure，先修复 SSH 目标机上配置 runtime root 的容量/权限，或者让当前 Appaloft 运行隔离不兼容的本地 mirror，并在成功 sync 时替换远端状态。
3. 当错误指向目标机容量时，先运行 `appaloft server capacity inspect` 或等价的 SSH 诊断命令，再重试。
4. 目标机能够创建并写入 Appaloft 状态目录后，再重新执行部署。

<h2 id="remote-state-lock">SSH remote state lock</h2>

`infra_error` + `remote-state-lock` 表示 SSH `ssh-pglite` 状态根正在被另一个 Appaloft 进程保护，或者前一次被取消的进程留下了仍未过期的 lock。它通常是 operator 可诊断的 infrastructure error，不代表部署请求本身的业务输入无效。

处理顺序：

1. 查看错误 details 里的 `lockOwner`、`correlationId`、`lockHeartbeatAt`、`staleAfterSeconds`、`waitedSeconds`。
2. Appaloft deploy 和 cleanup 命令本身会做 bounded wait；当 heartbeat 已超过 stale window 时，也会走 stale-only lock recovery。
3. 如果 heartbeat 仍在更新，等待当前部署完成或稍后重试。
4. 如果错误持续出现，运行 `appaloft remote-state lock inspect --server-host <host>`，并带上同一次部署使用的 SSH 目标参数，只读查看远端 lock owner metadata。这个命令不会进入部署 mutation path。
5. 只有诊断确认 heartbeat 已超过 stale window 后，才运行 `appaloft remote-state lock recover-stale --server-host <host>`。这个命令会归档 stale lock metadata，不会 force 删除 active lock。
6. 不要直接删除远端 lock 目录，除非诊断确认没有活跃进程并且已保留 recovered journal。

<h2 id="reference-status-shape">状态形状</h2>

状态应区分资源、部署、运行时、代理、访问地址和证书 readiness。
