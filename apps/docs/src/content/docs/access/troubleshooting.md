---
title: "Access troubleshooting"
description: "排查默认地址、域名、DNS 和 TLS 失败。"
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "dns"
  - "tls error"
  - "domain failed"
  - "访问失败"
relatedOperations:
  - domain-bindings.create
  - certificates.issue-or-renew
sidebar:
  label: "Troubleshooting"
  order: 6
---

<h2 id="access-troubleshooting-order">排查顺序</h2>

先看资源运行状态，再看代理 readiness，然后看域名所有权，最后看证书 readiness。

当应用打不开时，不要只看一个 URL 或一段日志。Appaloft 会把当前访问意图和状态拆成几个
可读位置：

- 资源详情和 `appaloft resource show <resourceId>`：查看当前选择的访问地址，以及默认生成地址、
  自定义域名、server-applied route 是否同时存在。
- `appaloft resource health <resourceId> --checks --public-access-probe`：查看运行时、健康检查、
  代理和公开访问是否一致；这里会给出稳定的 blocking reason，而不是只显示“访问失败”。
- `appaloft resource proxy-config <resourceId>`：查看代理计划或 provider-rendered 配置里是否有
  对应 host/path/target，适合判断 route missing、stale 或 failed。
- `appaloft resource logs <resourceId>`：查看应用 stdout/stderr，判断启动命令、端口、配置和运行时异常。
- `appaloft logs <deploymentId>`：查看某次部署 attempt 的执行日志；它是部署历史，不等同于当前路由状态。
- `appaloft resource diagnose <resourceId>`：复制安全诊断摘要，把 access、proxy、health、runtime logs、
  deployment logs 和推荐动作放在同一个 payload 里。

Web console、CLI 和 HTTP API 使用同一组 operation contract。Web 上的资源详情、健康、代理配置、
日志和诊断复制入口对应的 API 分别是 `/api/resources/{resourceId}`、
`/api/resources/{resourceId}/health`、`/api/resources/{resourceId}/proxy-configuration`、
`/api/resources/{resourceId}/runtime-logs`、`/api/resources/{resourceId}/diagnostic-summary`，部署日志
对应 `/api/deployments/{deploymentId}/logs`。

<h2 id="access-dns-failures">DNS 失败</h2>

确认记录类型、目标值、TTL 和是否指向当前服务器或代理入口。
