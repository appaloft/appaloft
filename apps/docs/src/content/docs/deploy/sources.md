---
title: "Deployment sources"
description: "理解本地目录、Git 仓库、镜像、Compose 和静态站点如何成为部署输入。"
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "source"
  - "repository"
  - "docker image"
  - "static site"
  - "来源"
relatedOperations:
  - deployments.create
  - system.integrations.list
  - system.github-app-connection.show
  - system.github-repositories.list
  - source-links.relink
  - resources.configure-auto-deploy
  - source-events.ingest
  - source-events.list
  - source-events.show
  - source-events.replay
  - source-events.prune
sidebar:
  label: "Sources"
  order: 2
---

<h2 id="deployment-source">选择部署来源</h2>

部署来源回答“要部署什么”。它可以是本地目录、Git 仓库、Docker 镜像、Compose 清单或静态站点输出。

这个输入不应该承担项目、服务器、环境或域名的职责。Appaloft 会在 detect 阶段读取来源证据，并在 plan 阶段生成可解释的运行计划。

已有入口应该把 Web、CLI 和 HTTP API 的 source 解释成同一个概念。Web 里的 source 字段、CLI 的 positional source 或 `--source`、API 的 source input 都应该指向这里，而不是各自定义一套含义。

<h2 id="deployment-source-kind">来源类型</h2>

常见来源类型：

| 类型 | 适合场景 | 用户需要确认 |
| --- | --- | --- |
| 本地目录 | CLI 本地部署、快速试验。 | 当前目录、忽略文件、构建输出。 |
| Git 仓库 | 可重复部署、CI、preview。 | 仓库 URL、ref、子目录、访问权限。 |
| Docker/OCI 镜像 | 已经有构建产物。 | 镜像地址、tag、运行端口。 |
| Compose 清单 | 多容器或已有 Compose 配置。 | compose 文件路径、服务名、暴露端口。 |
| 静态站点 | 前端静态产物。 | 构建命令和 publish directory。 |

用户不确定时，应先选择最接近当前交付物的来源。后续 runtime profile 会描述如何运行它。

<h2 id="deployment-source-integration-connection-modes">Integration connection modes</h2>

外部 source integration 可以声明连接模式，帮助 Web、CLI 和工具用同一套中性词汇解释“谁来完成 provider 配置”。

常见模式包括：

| Mode | 含义 |
| --- | --- |
| `user-oauth` | 最终用户用自己的 provider 账号授权，适合个人或团队的浏览式连接。 |
| `hosted-provider-app` | 运行方提供 provider app，最终用户只安装或授权该 app。 |
| `operator-managed-app` | 实例 operator 创建 provider app，并在实例配置里管理 credential reference。 |

`GET /api/integrations` 返回这些模式和安全的配置状态。它只描述 capability、audience、是否需要 provider installation，以及是否需要 operator secret material；不返回 token、private key、webhook secret 或 provider 原始 payload。

当 GitHub integration 使用 `hosted-provider-app` 或 `operator-managed-app` 时，Web console 的仓库选择器会先引导用户安装已配置的 GitHub App。安装完成后，GitHub setup URL 会回到 Appaloft，Appaloft 只保存 installation id、账号名、仓库选择方式和更新时间等 readback 信息。仓库列表使用 installation access token 拉取，不会回退到用户 OAuth。

CLI 可以查看当前 workspace 的安装状态，并且只列出已授权给该 installation 的仓库：

```bash
appaloft github status
appaloft github repositories --search web
```

如果 `status` 显示当前 workspace 尚未安装 App，请打开它返回的 install URL，选择正确的
GitHub 账号和仓库，再重新列出仓库。

<h2 id="deployment-source-validation">输入检查</h2>

用户应能看到来源是否可读取、ref 或路径是否存在、静态输出目录是否明确，以及来源和资源 runtime profile 是否明显冲突。

Web console 应在提交前提示缺失字段，例如 Git ref、base directory 或静态输出目录。CLI 应把无法读取路径、无法访问仓库、空 source 等问题作为输入错误。HTTP API 应返回结构化 validation error，包含字段名和恢复建议。

CLI source 示例：

```bash title="本地目录"
appaloft deploy ./apps/web --method static --publish-dir build
```

```bash title="已构建静态输出"
appaloft deploy ./dist --as static-site
```

```bash title="Git 仓库"
appaloft deploy https://github.com/example/web \
  --method static \
  --publish-dir dist \
  --resource-name web
```

资源 source profile 示例：

```bash title="配置已有资源的 Git source"
appaloft resource configure-source res_web \
  --kind git-repository \
  --locator https://github.com/example/web \
  --git-ref main \
  --base-directory apps/web
```

<h2 id="application-graph-dependencies">让多个应用共用一个依赖</h2>

在 application graph 中，只在顶层定义一次托管依赖，再让每个消费者应用引用它的 key。一个依赖被
多个应用共用时必须提供稳定的 `resourceName`，这样后续消费者会复用同一个托管 Resource，而不是
重复创建数据库：

```yaml
dependencies:
  database:
    resourceName: Acme Shared Postgres
    kind: postgres
    source: managed
    bind:
      env: DATABASE_URL

applications:
  api:
    resource:
      name: Acme API
    dependencies:
      - database
  worker:
    resource:
      name: Acme Worker
      kind: worker
    dependencies:
      - database
```

Appaloft 会协调一个具名 Postgres Resource，并为每个消费者 Resource 分别创建 `DATABASE_URL`
binding。所有顶层依赖都必须被引用，每个引用都必须能解析，临时 preview 依赖不能被多个应用共用。
连接值和 dependency Resource id 不会写进提交的配置文件。

默认情况下，一次 config deploy 会展开所有声明的 application。只部署其中一个时，传入它的 config
key；需要选择多个时可以重复该参数：

```bash
appaloft deploy . --application site
appaloft deploy . --application api --application worker
```

如果 key 不存在，Appaloft 会在初始化部署状态或修改资源之前失败，并列出可用的 application key。

<h2 id="local-static-output">本地静态输出</h2>

当用户已经有 `dist`、`build` 或类似静态输出目录时，可以把这个目录作为 source 直接交给 Appaloft：

```bash
appaloft deploy ./dist --as static-site
```

这个入口只改变用户层交互：它会归一化为静态站点资源和普通部署请求，不会新增 `quick-deploy.create` 操作，也不会把目录上传到 Appaloft 托管云。除非用户显式选择托管功能，部署目标仍然是用户选择的服务器或环境。

<h2 id="deployment-source-output">部署后会看到什么</h2>

部署被接受后，source 会进入部署快照。后续修改资源 source profile 不会改变已经完成或正在执行的部署。

用户应能在部署详情里看到安全的 source 摘要，例如 repository、ref、base directory、镜像 tag 或静态输出目录。Secret token、私有仓库凭据和完整本地路径中的敏感片段不应出现在日志或诊断摘要中。

<h2 id="deployment-source-errors">常见错误</h2>

常见恢复方式：

- 本地目录不存在：确认 CLI 当前工作目录或传入绝对路径。
- Git 仓库不可访问：确认凭据、仓库 URL、ref 和网络。
- 静态输出目录为空：确认 build 命令已经生成产物。
- 来源和 runtime profile 不匹配：调整资源 runtime profile，或换成更合适的 source kind。

如果资源已经绑定过旧来源，使用 [Deployment recovery](/docs/deploy/recovery/#deployment-source-relink) 重新关联。

<h2 id="static-artifact-publishing">静态产物发布</h2>

直接静态产物发布是部署来源的一个扩展点。它适合已经完成构建的 `dist` 目录或 `.zip` 归档，并通过
`static-artifacts.*` 操作进入同一套 operation catalog：

```bash
appaloft static-artifacts publish ./dist
appaloft static-artifacts publish ./dist.zip
```

API 可以调用 `POST /api/static-artifacts/publish`、
`POST /api/static-artifacts/publish-payload` 或
`POST /api/static-artifacts/publish-archive`。发布记录通过
`GET /api/static-artifacts/publications` 读取。这个入口不会绕过 Resource、Deployment、route 或
访问控制边界；hosted alias/default-domain routing 仍是单独能力。

<h2 id="source-auto-deploy-setup">自动部署设置</h2>

Source auto-deploy 会把已验证的 source event 转换为普通部署请求，但不会把 branch、webhook 或
delivery id 塞进 `deployments.create`。第一条已启用的 ingestion route 是 Resource-scoped generic
signed webhook：

```text
POST /api/resources/{resourceId}/source-events/generic-signed
```

启用时，策略属于一个 Resource，并绑定到该 Resource 当前的 source profile。修改 Resource
source 后，旧策略会进入 blocked 状态，直到用户显式确认新 source 仍然应该触发自动部署。

Git push 策略可以额外配置仓库根目录相对的 `includePaths` 和 `excludePaths` glob。Appaloft
只比较最终 `before..after` 差异（新建 ref 使用空树到新 revision），先应用 include，再应用
exclude，不会合并中间 commit 的文件列表。删除 ref 永不部署；provider diff 不可用或被截断时，
带路径规则的策略 fail closed，不带路径规则的策略继续保持 ref-only 行为。

<h2 id="source-auto-deploy-signatures">签名和 secret</h2>

Git provider webhook 和 generic signed webhook 都必须先完成签名校验，再进入 policy matching。
generic signed webhook 使用 `X-Appaloft-Signature`，格式可以是 `sha256=<hex>` 或裸 HMAC
SHA-256 hex。策略里的 secret reference 必须是 `resource-secret:<KEY>`，其中 `<KEY>` 是同一个
Resource 上的 runtime secret variable。Appaloft 只保存安全的 reference metadata，不保存 secret
明文、签名 header 或 raw payload。

轮换 secret 时，应先替换底层 secret reference，再按需要重新确认自动部署策略。

<h2 id="source-auto-deploy-dedupe">重复投递</h2>

Source event 会先写入 durable record，再尝试创建部署。重复投递使用 provider delivery id、
generic idempotency key，或 source/ref/revision/event kind 的 bounded-window key 去重。generic
signed route 的去重范围限定在 route Resource。

重复事件不会创建第二个部署。用户应能在 source event read model 中看到 `deduped` 状态和原始
source event id。

<h2 id="source-auto-deploy-ignored-events">忽略和阻塞的事件</h2>

已验证的事件也可能不创建部署。常见原因包括 ref 不匹配、最终路径未匹配、最终 diff 不可用或被
截断、ref 被删除、没有启用的策略、策略被禁用、或 source binding 变化后策略处于 blocked pending
acknowledgement。

这些结果应该通过 `source-events.list` 和 `source-events.show` 显示安全的 reason code、匹配的
Resource、以及已创建的 deployment id。不要在日志或 UI 中暴露 webhook secret、provider token 或
raw payload。

<h2 id="source-auto-deploy-recovery">自动部署恢复</h2>

第一版 ingestion path 会记录 source event state 和同步 dispatch 结果，不承诺后台自动重试。若事件
dispatch 失败，先查看 source event detail，再根据情况修复 source profile、secret reference、策略状态或
运行时阻塞。

修复后可以用 `appaloft source-event replay <sourceEventId> --resource <resourceId>` 或
`POST /api/source-events/{sourceEventId}/replay` 重放已保留的 safe delivery facts。Replay
会重新按当前 Resource policy 匹配并走普通 `deployments.create` admission；它不会读取 raw
webhook payload、signature、provider token 或 webhook secret。

如果部署已被创建，后续恢复应使用普通 deployment recovery/readiness、retry、redeploy 或 rollback
语义，而不是重放 webhook payload。

<h2 id="source-auto-deploy-retention">Source event 保留</h2>

使用 `appaloft source-event prune --before <iso>` 或 `POST /api/source-events/prune` 先检查已保留的
source event delivery。Prune 默认 dry-run，并返回按 status 和 source kind 分组的匹配数量。只有在确认
scope 和 cutoff 后，才传入 `--dry-run false` 执行清理。

Retention cleanup 只删除已持久化的安全 source event 诊断记录。它不会删除 Resource、deployment、
webhook secret、provider token、raw payload，也不会影响 cutoff 和 filter 之外事件的 replay 能力。
