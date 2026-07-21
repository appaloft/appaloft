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
  - connections.show
  - connections.connect.start
  - connections.connect.callback
  - connections.revoke
  - connections.status.show
  - connections.capability.plan
  - connections.capability.accept
  - connections.capability.apply
sidebar:
  label: "Connections"
  order: 1
---

## 模型 [#connections-model]

Connection 是 Appaloft 代表用户或 operator 保存的一次授权关系。它可以来自 GitHub App installation、DNS provider 授权、基础设施 provider 凭据、Slack webhook，或未来的 billing/identity/observability provider。

ConnectorDefinition 是 catalog 里的具体可连接项，例如 `github-source`、`cloudflare-dns`、`vultr-infrastructure`、`slack-notification`。用户安装、授权、撤销和审计的对象是这些具体 connector，不是抽象分类。

ConnectionCategory 是能力分类，例如 `source`、`dns`、`infrastructure`、`notification`、`billing`。分类用于页面分组、筛选、权限说明和 CLI 快捷命名空间。`dns` 本身不是一个可安装 connector；`cloudflare-dns` 才是具体 DNS connector。

ConnectionCapability 是 Appaloft 可以用确定性代码执行或规划的动作，例如 `dns.records.plan`、`dns.records.apply`、`source.repositories.list`、`infrastructure.servers.plan`、`notification.messages.send`。

## 命名边界 [#connector-naming]

| 层级 | 示例 | 用途 |
| --- | --- | --- |
| 主模型 | Connection、ConnectorDefinition | 授权生命周期、readback、审计、撤销。 |
| Category | `source`、`dns`、`infrastructure`、`notification` | 页面分组、能力筛选、快捷入口。 |
| Concrete connector | `github-source`、`cloudflare-dns`、`vultr-infrastructure`、`slack-notification` | 真实安装、授权、token/secret 引用、provider adapter 选择。 |
| Capability | `dns.records.apply`、`infrastructure.servers.plan` | 确定性 plan/apply/verify/cleanup 动作。 |

因此，“DNS connector”在口语里通常指“DNS category 下的具体 connector”。在 API、CLI JSON、审计记录和测试里应使用具体 key，例如 `cloudflare-dns`。`appaloft dns ...` 这种命令只是按 DNS 能力组织的快捷入口，底层仍应翻译到 `connections.capability.*` 和具体 connector key。

## DNS 连接 [#dns-connections]

DNS 连接用于规划、应用、验证和清理 Appaloft 管理的 DNS 记录。Appaloft 可以自动创建这些记录，但必须通过确定性 provider adapter 执行：先生成计划，检测冲突，用户或 workflow 接受后再调用 provider API。LLM 可以解释计划或帮助选择入口，但不应该持有 token，也不应该直接操作 DNS。

DNS readiness 分三层：

| 层 | 是否需要授权 | 作用 |
| --- | --- | --- |
| Public DNS discovery | 否 | 根据 hostname 归约 base domain，并查询公开 NS/authoritative nameserver，判断大概率由 Cloudflare、GoDaddy、Route53、Namecheap、Vercel、DNSPod、阿里云、腾讯云或未知 provider 托管。 |
| Connector authorization | 是 | 用户授权具体 connector，例如 `cloudflare-dns`。授权只证明 Appaloft 可以访问这个 provider 账号，不等于该账号拥有当前 hostname。 |
| Zone ownership matching | 是 | Appaloft 通过授权账号列出 zones，只有能覆盖当前 hostname 的 zone 才能生成和应用 DNS plan。 |

如果 public DNS discovery 检测到 Cloudflare，页面可以推荐连接 Cloudflare DNS；如果用户授权的 Cloudflare 账号里没有覆盖该 hostname 的 zone，Appaloft 必须阻止自动配置并提示授权账号不包含该 base domain。如果检测到 GoDaddy 但暂时没有 GoDaddy connector，则只能显示手动 DNS fallback。

DNS 可以有两类授权：

| 授权方式 | 是否保存长期 secret | 典型用途 |
| --- | --- | --- |
| Temporary setup | 否 | Domain Connect 这类一次性窗口，用户在 provider 页面确认模板，Appaloft 回来验证结果。 |
| Persistent provider credential | 是，必须加密或引用受控 secret | Cloudflare/Route53 这类持续管理记录、验证、cleanup、漂移检查的连接。 |

当前 Cloudflare DNS connector 默认走 Temporary setup，也就是 Domain Connect 一次性授权：

1. 用户在资源的 Custom domains 区域或域名绑定详情页点击 Configure DNS。
2. Appaloft 通过 public DNS discovery 检测 provider，并生成当前绑定需要的 DNS plan。
3. 检测到 Cloudflare 时，用户点击 Connect Cloudflare DNS，Appaloft 打开 Cloudflare 的 Domain Connect apply 页面。
4. 用户在 Cloudflare 页面确认模板记录。Appaloft 不保存长期 Cloudflare token，也不会获得未来自动改 DNS 的权限。
5. 用户回到 Appaloft 后刷新计划或重新验证。Appaloft 通过 public DNS readback 确认记录是否已经指向目标。
6. 如果 provider 不可自动连接、授权账号不覆盖 zone，或用户不想使用 Domain Connect，Appaloft 继续展示 Manual DNS 表格。

这个流程仍然属于 `cloudflare-dns` 具体 connector；`dns` 只是能力分类。审计、计划和状态里应记录 concrete connector、Domain Connect operation、目标 hostname、记录类型和 readback 结果。

## Source 连接 [#source-connections]

GitHub 登录只代表 identity，不自动代表 source access。访问仓库、列出 repositories、接收 webhook 或回写 deployment status 需要 source connector，例如 `github-source`。现有 GitHub App installation 可以兼容迁移成 source connection readback，但仍要保留 provider app installation 的权限边界和短期 token 交换。

## Infrastructure 连接 [#infrastructure-connections]

Infrastructure connector 可以用于规划或导入外部运行目标，例如向 Vultr、DigitalOcean、Hetzner 或其他 provider 申请一个可审核的 SSH server proposal。创建付费或稀缺资源必须先返回 plan、成本/风险摘要、cleanup 路径和 provider readback，再由用户或 operator 明确接受。

## Notification 连接 [#notification-connections]

Notification connector 用于把部署、资源或 workflow 状态发送到外部系统，例如 Slack channel 或 webhook。Readback 只能显示目的地和安全状态，不应返回 webhook URL、token 或 provider 原始 payload。

## Billing 连接 [#billing-connections]

Billing 是连接分类之一，但 billing policy 不拥有 Appaloft domain facts。部署、资源、connection lifecycle 可以被 billing policy 观察并转换成 metering 事实；connection command 不应直接写 invoice、subscription 或 ledger。

## AI 边界 [#connections-ai-boundary]

Connector 本身和 AI 无关。Human、CLI、Web、API、agent 都使用同一套 operation catalog。AI agent 可以调用 Appaloft operation 来请求 plan、展示风险、等待用户确认或读取状态；长期 provider token、private key、webhook secret 和 raw provider response 不应进入模型上下文、日志、错误消息或公开 read model。

## 入口 [#connections-entrypoints]

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
