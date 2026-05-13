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
  - audit-events.list
  - audit-events.show
  - audit-events.export
  - audit-events.export-global
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

<h2 id="operator-audit-events">Audit events</h2>

当你需要解释某个 resource、server、certificate 或其他对象的历史变化时，可以按 aggregate id 查看保留的审计事件：

```bash title="查看审计事件"
appaloft audit-event list --aggregate <aggregateId>
appaloft audit-event show <auditEventId> --aggregate <aggregateId>
```

审计事件查询是只读入口。列表只返回事件 id、aggregate id、event type 和创建时间。详情会返回经过安全处理的 payload，并用 `redactedFields` 标出被遮蔽的字段。私钥、token、secret、环境变量值、证书材料、签名、credential payload 或其他复杂 provider/native payload 不会原样出现在输出里。

如果需要在 prune 或 delete review 前导出可复制的安全内容，可以导出一个 aggregate：

```bash title="导出经过遮蔽的审计事件"
appaloft audit-event export --aggregate <aggregateId> --limit 100
```

如果需要跨 aggregate 做 incident triage 或 support handoff，必须使用有界时间窗口：

```bash title="导出有界全局审计窗口"
appaloft audit-event export-global --from 2026-01-01T00:00:00.000Z --to 2026-01-02T00:00:00.000Z --limit 100
```

全局导出仍然是有界、经过遮蔽、只读的导出。它不是 legal hold、immutable archive、replay source、organization retention default 或 scheduled retention policy。查看或导出审计事件不会删除历史、清理运行时、恢复状态或触发重试。

当 support、incident 或 compliance review 期间需要保留旧的审计行时，可以配置 legal hold：

```bash title="Hold and release audit rows"
appaloft audit-event legal-hold configure --aggregate <aggregateId> --reason "support review"
appaloft audit-event legal-hold list --status active
appaloft audit-event legal-hold release <holdId> --reason "review complete"
```

Legal hold 是 retention blocker，不是 immutable archive 或 discovery workflow。`appaloft audit-event prune` 会报告 held rows，并跳过所有被 active hold 匹配的行，直到匹配的 hold 全部 release。

<h2 id="operator-provider-job-logs">Provider job logs</h2>

Provider job logs 与 deployment rows 和 deployment 内嵌 logs 分开保留。执行破坏性清理前先 dry-run：

```bash title="Dry-run provider job log retention"
appaloft provider-job-log prune --before 2026-01-01T00:00:00.000Z
```

需要时可以缩小范围：

```bash title="Prune one provider scope"
appaloft provider-job-log prune --before 2026-01-01T00:00:00.000Z --provider generic-ssh --dry-run false
```

只有显式传入 `--dry-run false` 时，这个命令才会删除早于 cutoff 的 `provider_job_logs` rows。它不会删除 deployment rows、deployment 内嵌 logs、runtime logs、audit rows、events、process attempts、snapshots、runtime artifacts、provider resources 或业务状态。

<h2 id="operator-retention-defaults">Organization retention defaults</h2>

Retention defaults 是非执行型策略记录。它们只保存每类历史的默认保留窗口和未来 scheduled retention 是否允许 dry-run 或 destructive 调度，不会自己删除 rows，也不会让手动 prune 命令推断 cutoff。

```bash title="Configure retention defaults"
appaloft retention-default configure --scope system --category provider-job-logs --retention-days 30
appaloft retention-default list --scope system
appaloft retention-default show provider-job-logs --scope system
```

即使某个 category 允许 destructive scheduling，manual prune 仍然必须显式提供 cutoff 和 destructive/dry-run 输入。Legal holds、immutable archives、replay guards、active attempts 和各 category 的 skip rules 仍然优先生效。

<h2 id="operator-domain-events">Domain event stream retention</h2>

Domain event stream retention 只针对保留的 event stream observation rows。先 dry-run，再按显式 cutoff 删除：

```bash title="Dry-run retained domain events"
appaloft domain-event prune --before 2026-01-01T00:00:00.000Z
```

这个命令不会删除 deployments、audit rows、provider logs、process attempts、snapshots、rollback candidates、runtime artifacts 或业务状态。Replay guards、cursor continuity 和 recovery evidence 会优先阻止不安全删除。

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
2. Appaloft deploy 和 cleanup 命令本身会做 bounded wait；当 heartbeat 已超过 stale window 时，也会走 stale-only lock recovery。当前版本可以把旧 lock metadata 里的较长 stale window 限制到更短的 state-root maintenance stale window 后再恢复。
3. 如果 heartbeat 仍在更新，等待当前部署完成或稍后重试。
4. 如果错误持续出现，运行 `appaloft remote-state lock inspect --server-host <host>`，并带上同一次部署使用的 SSH 目标参数，只读查看远端 lock owner metadata。这个命令不会进入部署 mutation path。
5. 只有诊断确认 heartbeat 已超过 stale window 后，才运行 `appaloft remote-state lock recover-stale --server-host <host>`。这个命令会归档 stale lock metadata，不会 force 删除 active lock。
6. 不要直接删除远端 lock 目录，除非诊断确认没有活跃进程并且已保留 recovered journal。

<h2 id="reference-status-shape">状态形状</h2>

状态应区分资源、部署、运行时、代理、访问地址和证书 readiness。
