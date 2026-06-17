---
title: "Connections and connectors"
description: "理解 Appaloft 如何连接源码、DNS、基础设施和通知服务。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "connector"
  - "connection"
  - "dns connector"
  - "cloudflare dns"
  - "source connector"
  - "连接"
  - "DNS connector"
relatedOperations:
  - connections.catalog.list
  - connections.categories.list
  - connections.list
  - connections.connect.start
  - connections.capability.plan
  - connections.capability.apply
sidebar:
  label: "Connections"
  order: 1
---

<h2 id="connections-model">模型</h2>

Connection 是 Appaloft 代表用户或 operator 保存的一次授权关系。它可以来自 GitHub App installation、DNS provider 授权、基础设施 provider 凭据、Slack webhook，或未来的 billing/identity/observability provider。

ConnectorDefinition 是 catalog 里的具体可连接项，例如 `github-source`、`cloudflare-dns`、`vultr-infrastructure`、`slack-notification`。用户安装、授权、撤销和审计的对象是这些具体 connector，不是抽象分类。

ConnectionCategory 是能力分类，例如 `source`、`dns`、`infrastructure`、`notification`、`billing`。分类用于页面分组、筛选、权限说明和 CLI 快捷命名空间。`dns` 本身不是一个可安装 connector；`cloudflare-dns` 才是具体 DNS connector。

ConnectionCapability 是 Appaloft 可以用确定性代码执行或规划的动作，例如 `dns.records.plan`、`dns.records.apply`、`source.repositories.list`、`infrastructure.servers.plan`、`notification.messages.send`。

<h2 id="connector-naming">命名边界</h2>

| 层级 | 示例 | 用途 |
| --- | --- | --- |
| 主模型 | Connection、ConnectorDefinition | 授权生命周期、readback、审计、撤销。 |
| Category | `source`、`dns`、`infrastructure`、`notification` | 页面分组、能力筛选、快捷入口。 |
| Concrete connector | `github-source`、`cloudflare-dns`、`vultr-infrastructure`、`slack-notification` | 真实安装、授权、token/secret 引用、provider adapter 选择。 |
| Capability | `dns.records.apply`、`infrastructure.servers.plan` | 确定性 plan/apply/verify/cleanup 动作。 |

因此，“DNS connector”在口语里通常指“DNS category 下的具体 connector”。在 API、CLI JSON、审计记录和测试里应使用具体 key，例如 `cloudflare-dns`。`appaloft dns ...` 这种命令只是按 DNS 能力组织的快捷入口，底层仍应翻译到 `connections.capability.*` 和具体 connector key。

<h2 id="dns-connections">DNS 连接</h2>

DNS 连接用于规划、应用、验证和清理 Appaloft 管理的 DNS 记录。Appaloft 可以自动创建这些记录，但必须通过确定性 provider adapter 执行：先生成计划，检测冲突，用户或 workflow 接受后再调用 provider API。LLM 可以解释计划或帮助选择入口，但不应该持有 token，也不应该直接操作 DNS。

DNS 可以有两类授权：

| 授权方式 | 是否保存长期 secret | 典型用途 |
| --- | --- | --- |
| Temporary setup | 否 | Domain Connect 这类一次性窗口，用户在 provider 页面确认模板，Appaloft 回来验证结果。 |
| Persistent provider credential | 是，必须加密或引用受控 secret | Cloudflare/Route53 这类持续管理记录、验证、cleanup、漂移检查的连接。 |

<h2 id="source-connections">Source 连接</h2>

GitHub 登录只代表 identity，不自动代表 source access。访问仓库、列出 repositories、接收 webhook 或回写 deployment status 需要 source connector，例如 `github-source`。现有 GitHub App installation 可以兼容迁移成 source connection readback，但仍要保留 provider app installation 的权限边界和短期 token 交换。

<h2 id="infrastructure-connections">Infrastructure 连接</h2>

Infrastructure connector 可以用于规划或导入外部运行目标，例如向 Vultr、DigitalOcean、Hetzner 或其他 provider 申请一个可审核的 SSH server proposal。创建付费或稀缺资源必须先返回 plan、成本/风险摘要、cleanup 路径和 provider readback，再由用户或 operator 明确接受。

<h2 id="notification-connections">Notification 连接</h2>

Notification connector 用于把部署、资源或 workflow 状态发送到外部系统，例如 Slack channel 或 webhook。Readback 只能显示目的地和安全状态，不应返回 webhook URL、token 或 provider 原始 payload。

<h2 id="billing-connections">Billing 连接</h2>

Billing 是连接分类之一，但 billing policy 不拥有 Appaloft domain facts。部署、资源、connection lifecycle 可以被 billing policy 观察并转换成 metering 事实；connection command 不应直接写 invoice、subscription 或 ledger。

<h2 id="connections-ai-boundary">AI 边界</h2>

Connector 本身和 AI 无关。Human、CLI、Web、API、agent 都使用同一套 operation catalog。AI agent 可以调用 Appaloft operation 来请求 plan、展示风险、等待用户确认或读取状态；长期 provider token、private key、webhook secret 和 raw provider response 不应进入模型上下文、日志、错误消息或公开 read model。

<h2 id="connections-entrypoints">入口</h2>

通用入口以 `connectors` 或 `connections` 语义暴露：

```text
appaloft connectors catalog
appaloft connectors categories
appaloft connectors list
appaloft connectors connect <connector>
appaloft connectors plan --connector <connector> --capability <key> --parameters-json <json>
appaloft connectors apply --connector <connector> --capability <key> --parameters-json <json> --accepted-plan-id <acceptedPlanId>
appaloft connectors revoke <connectionId>
```

按能力分类的快捷命令可以存在，但它们不是另一套模型：

```text
appaloft dns plan <domain> --hostname <host> --target <target> --connector cloudflare-dns
appaloft dns apply <domain> --hostname <host> --target <target> --connector cloudflare-dns --accepted-plan-id <acceptedPlanId>
appaloft infrastructure propose <target> --provider vultr --region <region> --size <size> --image <image>
```

HTTP、SDK、Web 和 future tool runtime 应暴露同一组语义：catalog、categories、list、show、connect、callback、plan、accept、apply、status、revoke。不同入口可以有不同 UI，但不能绕过 connection lifecycle、accepted plan、tenant scope、secret redaction 和 audit。
