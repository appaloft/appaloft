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
relatedOperations: []
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

<h2 id="remote-state-lock">SSH remote state lock</h2>

`infra_error` + `remote-state-lock` 表示 SSH `ssh-pglite` 状态根正在被另一个 Appaloft 进程保护，或者前一次被取消的进程留下了仍未过期的 lock。它通常是 operator 可诊断的 infrastructure error，不代表部署请求本身的业务输入无效。

处理顺序：

1. 查看错误 details 里的 `lockOwner`、`correlationId`、`lockHeartbeatAt`、`staleAfterSeconds`、`waitedSeconds`。
2. 如果 heartbeat 仍在更新，等待当前部署完成或重试。
3. 运行 `appaloft remote-state lock inspect --server-host <host>`，并带上同一次部署使用的 SSH 目标参数，只读查看远端 lock owner metadata。这个命令不会进入部署 mutation path。
4. 如果 heartbeat 已超过 stale window，运行 `appaloft remote-state lock recover-stale --server-host <host>` 归档 stale lock。
5. 不要直接删除远端 lock 目录，除非诊断确认没有活跃进程并且已保留 recovered journal。

<h2 id="reference-status-shape">状态形状</h2>

状态应区分资源、部署、运行时、代理、访问地址和证书 readiness。
