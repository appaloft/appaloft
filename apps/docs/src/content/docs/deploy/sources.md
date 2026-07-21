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

## 选择部署来源 [#deployment-source]

部署来源回答“要部署什么”。它可以是本地目录、Git 仓库、Docker 镜像、Compose 清单或静态站点输出。

这个输入不应该承担项目、服务器、环境或域名的职责。Appaloft 会在 detect 阶段读取来源证据，并在 plan 阶段生成可解释的运行计划。

已有入口应该把 Web、CLI 和 HTTP API 的 source 解释成同一个概念。Web 里的 source 字段、CLI 的 positional source 或 `--source`、API 的 source input 都应该指向这里，而不是各自定义一套含义。

## 来源类型 [#deployment-source-kind]

常见来源类型：

| 类型 | 适合场景 | 用户需要确认 |
| --- | --- | --- |
| 本地目录 | CLI 本地部署、快速试验。 | 当前目录、忽略文件、构建输出。 |
| Git 仓库 | 可重复部署、CI、preview。 | 仓库 URL、ref、子目录、访问权限。 |
| Docker/OCI 镜像 | 已经有构建产物。 | 镜像地址、tag、运行端口。 |
| Compose 清单 | 多容器或已有 Compose 配置。 | compose 文件路径、服务名、暴露端口。 |
| 静态站点 | 前端静态产物。 | 构建命令和 publish directory。 |

用户不确定时，应先选择最接近当前交付物的来源。后续 runtime profile 会描述如何运行它。

## 零配置部署支持范围 [#zero-configuration-support]

这里的“零配置”是指：Appaloft 能检查一个已经选定的应用目录，安全推导生产构建/启动方式或静态
产物计划，并在不填写 runtime profile override 的情况下通过真实 Appaloft Docker 路径。
generic-SSH gate 单独记录。服务器、项目、环境、凭据、secret 和域名策略仍需显式选择或配置。

状态含义：

- **Supported**：当前检测/规划实现和对应真实 smoke 证据都存在。
- **Preview**：部分链路已实现，但缺少完整 source-to-runtime smoke 证据，或仍需显式 profile
  输入。Preview 不等于零配置承诺。
- **Unsupported**：Appaloft 无法安全生成完整计划，会停止而不是猜测。

| 来源或应用形态 | 状态 | 证据或原因 |
| --- | --- | --- |
| 本地单应用根目录：Next.js runtime/standalone/static export | Supported | 这些精确模式有启用的真实 Docker 和 generic-SSH fixture descriptor。 |
| 本地单应用根目录：Vite、React、Vue、Svelte、Solid、Angular 静态 SPA | Supported | 静态 fixture smoke 会真实构建并验证 Appaloft static server。 |
| 本地单应用根目录：Astro static、Nuxt generate、SvelteKit adapter-static | Supported | 当前 smoke 只覆盖这些静态模式。 |
| 本地单应用根目录：Remix、Express、Fastify、NestJS、Hono、Koa、带生产 start script 的 generic Node | Supported | Workspace image fixture smoke 覆盖构建、启动和 HTTP 验证。 |
| 本地单应用根目录：FastAPI、Django、Flask、可确定的 ASGI/WSGI、受支持的 Poetry Web 应用 | Supported | Python fixture smoke 覆盖当前 package tool 和 app target 规则。 |
| 本地单应用根目录：Spring Boot Maven/Gradle、Quarkus Maven JVM mode、可确定的 runnable jar | Supported | JVM fixture smoke 覆盖这些精确构建和启动路径。 |
| 显式 Dockerfile、Compose、prebuilt image 或 install/build/start commands | Supported | 有真实 substrate/fixture smoke，但 profile 由用户提供；这是显式 fallback，不属于零配置检测。 |
| 本地 Sinatra/Rack、Go Gin、ASP.NET Core 或 Rust Axum 应用 | Supported | 这些精确 fixture 已通过真实 Appaloft Docker build、run 和 HTTP verification；generic-SSH gate 单独处于已接线状态。 |
| 本地 Rails、Laravel、Symfony 或 Phoenix 应用 | Preview | Detection/planning 已实现，但这些精确路径没有通过真实 Appaloft Docker smoke。 |
| Public remote Git 依赖自动 framework/runtime detection | Unsupported | Create 和 plan 不会为了 framework inspection clone 远程仓库；需要自动检测时，应先在本地 clone。 |
| Public remote Git 使用显式 Dockerfile、Compose、prebuilt-image 或 install/build/start command profile | Preview | 显式 profile 不依赖自动 framework inspection，但专门的远程 source-to-runtime smoke 尚未完成；不声明 authenticated remote-Git parity。 |
| 通用 workload `.zip` 或 source archive 依赖自动检测 | Unsupported | 通用 archive extraction-to-framework planning 链路未完成。已经构建好的静态文件应使用独立的 static artifact publishing workflow。 |
| Bounded local monorepo discovery 只有一个应用，或显式 `baseDirectory` | Preview | Discovery 已实现，显式选择在 create 和 plan 中生效，但专门的真实 Appaloft Docker monorepo smoke 尚未完成。 |
| Monorepo 根目录包含多个 candidate app 且未选择 | Unsupported | Appaloft 返回 candidate roots 并阻塞，直到 `baseDirectory` 选中一个；不会选择第一个应用。 |
| SvelteKit server adapter、Astro SSR、Nuxt SSR、自动推断 worker、ambiguous hybrid mode 或 buildpack execution | Unsupported | 这些推断路径没有完整、确定的 planner 和当前真实 smoke 支持。 |

### 检测会读取什么 [#zero-configuration-detection]

Detection 只读取所选应用根目录下的文件，可使用 manifest、lockfile、framework config、生产
script、runtime version file、well-known project file 和可确定的 artifact path。检测阶段不会安装
依赖或执行项目代码。

Plan 应说明所选根目录、检测到的 runtime/framework/tool 和 files/scripts、planner、推导出的
commands/artifact/port；若被阻塞，则应说明 phase 和 reason。Plan 还会返回
`planVersion = "1"`、有效计划的稳定 `sha256:` fingerprint，以及 command provenance：推导命令为
`planner`，显式命令为 `resource-runtime-profile`。缺失证据不能被当作通用生产命令。

### Override 优先级 [#zero-configuration-overrides]

用户提供显式值时，Appaloft 按以下顺序处理：

1. Dockerfile、Compose、prebuilt-image 或 static strategy 及其字段。
2. 显式 install/build/start commands 和 publish/artifact 字段。
3. 用于选择单个应用根目录的显式 source `baseDirectory`。
4. 显式 Resource internal port 和 health policy。
5. Framework evidence，然后是 generic language evidence。
6. Buildpack diagnostic evidence，最后才是 Unsupported/ambiguous 结果。

检测不会静默替换显式 profile 值。

### Fail-closed 排查 [#zero-configuration-troubleshooting]

Planning 被阻塞后，不要重复提交相同部署。根据返回的 evidence 和 reason 处理：

- 直接传入准确的本地应用目录，或为仓库根目录设置 `baseDirectory`；
- 显式选择 Dockerfile、Compose、prebuilt image 或 static strategy；
- 提供 install/build/start commands 或静态 publish directory；
- 为入站应用提供 Resource internal port 和 health policy；
- Remote Git 需要自动检测时，先 clone 到本地；否则提供显式 Dockerfile、Compose、
  prebuilt-image 或 command profile，并将该远程路径视为 Preview；
- 在依赖自动检测前，先在本地解压 workload archive；
- 先运行 `appaloft deployments plan ...`，确认所选根目录、planner、commands、artifact、port 和
  warnings，再创建部署。

Appaloft 会 fail closed，不会选择 monorepo 中的第一个应用、猜测 archive layout，或把开发/watch
server 用作生产启动命令。

## Integration connection modes [#deployment-source-integration-connection-modes]

外部 source integration 可以声明连接模式，帮助 Web、CLI 和工具用同一套中性词汇解释“谁来完成 provider 配置”。

常见模式包括：

| Mode | 含义 |
| --- | --- |
| `user-oauth` | 最终用户用自己的 provider 账号授权，适合个人或团队的浏览式连接。 |
| `hosted-provider-app` | 运行方提供 provider app，最终用户只安装或授权该 app。 |
| `operator-managed-app` | 实例 operator 创建 provider app，并在实例配置里管理 credential reference。 |

`GET /api/integrations` 返回这些模式和安全的配置状态。它只描述 capability、audience、是否需要 provider installation，以及是否需要 operator secret material；不返回 token、private key、webhook secret 或 provider 原始 payload。

当 GitHub integration 使用 `hosted-provider-app` 或 `operator-managed-app` 时，Web console 的仓库选择器会先引导用户安装已配置的 GitHub App。安装完成且仓库浏览可用时，未手动选择来源方式、也未填写 public Git URL 的 Quick Deploy 会直接进入仓库选择；用户显式选择 public URL 时仍保持 URL 模式。GitHub setup URL 会回到 Appaloft，Appaloft 只保存 installation id、账号名、仓库选择方式和更新时间等 readback 信息。仓库列表使用 installation access token 拉取，不会回退到用户 OAuth。

CLI 可以查看当前 workspace 的安装状态，并且只列出已授权给该 installation 的仓库：

```bash
appaloft github status
appaloft github repositories --search web
```

如果 `status` 显示当前 workspace 尚未安装 App，请打开它返回的 install URL，选择正确的
GitHub 账号和仓库，再重新列出仓库。

## 输入检查 [#deployment-source-validation]

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

## 让多个应用共用一个依赖 [#application-graph-dependencies]

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

## 本地静态输出 [#local-static-output]

当用户已经有 `dist`、`build` 或类似静态输出目录时，可以把这个目录作为 source 直接交给 Appaloft：

```bash
appaloft deploy ./dist --as static-site
```

这个入口只改变用户层交互：它会归一化为静态站点资源和普通部署请求，不会新增 `quick-deploy.create` 操作，也不会把目录上传到 Appaloft 托管云。除非用户显式选择托管功能，部署目标仍然是用户选择的服务器或环境。

## 部署后会看到什么 [#deployment-source-output]

部署被接受后，source 会进入部署快照。后续修改资源 source profile 不会改变已经完成或正在执行的部署。

用户应能在部署详情里看到安全的 source 摘要，例如 repository、ref、base directory、镜像 tag 或静态输出目录。Secret token、私有仓库凭据和完整本地路径中的敏感片段不应出现在日志或诊断摘要中。

## 常见错误 [#deployment-source-errors]

常见恢复方式：

- 本地目录不存在：确认 CLI 当前工作目录或传入绝对路径。
- Git 仓库不可访问：确认凭据、仓库 URL、ref 和网络。
- 静态输出目录为空：确认 build 命令已经生成产物。
- 来源和 runtime profile 不匹配：调整资源 runtime profile，或换成更合适的 source kind。

如果资源已经绑定过旧来源，使用 [Deployment recovery](/docs/deploy/recovery/#deployment-source-relink) 重新关联。

## 静态产物发布 [#static-artifact-publishing]

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

## 自动部署设置 [#source-auto-deploy-setup]

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

## 签名和 secret [#source-auto-deploy-signatures]

Git provider webhook 和 generic signed webhook 都必须先完成签名校验，再进入 policy matching。
generic signed webhook 使用 `X-Appaloft-Signature`，格式可以是 `sha256=<hex>` 或裸 HMAC
SHA-256 hex。策略里的 secret reference 必须是 `resource-secret:<KEY>`，其中 `<KEY>` 是同一个
Resource 上的 runtime secret variable。Appaloft 只保存安全的 reference metadata，不保存 secret
明文、签名 header 或 raw payload。

轮换 secret 时，应先替换底层 secret reference，再按需要重新确认自动部署策略。

## 重复投递 [#source-auto-deploy-dedupe]

Source event 会先写入 durable record，再尝试创建部署。重复投递使用 provider delivery id、
generic idempotency key，或 source/ref/revision/event kind 的 bounded-window key 去重。generic
signed route 的去重范围限定在 route Resource。

重复事件不会创建第二个部署。用户应能在 source event read model 中看到 `deduped` 状态和原始
source event id。

## 忽略和阻塞的事件 [#source-auto-deploy-ignored-events]

已验证的事件也可能不创建部署。常见原因包括 ref 不匹配、最终路径未匹配、最终 diff 不可用或被
截断、ref 被删除、没有启用的策略、策略被禁用、或 source binding 变化后策略处于 blocked pending
acknowledgement。

这些结果应该通过 `source-events.list` 和 `source-events.show` 显示安全的 reason code、匹配的
Resource、以及已创建的 deployment id。不要在日志或 UI 中暴露 webhook secret、provider token 或
raw payload。

## 自动部署恢复 [#source-auto-deploy-recovery]

第一版 ingestion path 会记录 source event state 和同步 dispatch 结果，不承诺后台自动重试。若事件
dispatch 失败，先查看 source event detail，再根据情况修复 source profile、secret reference、策略状态或
运行时阻塞。

修复后可以用 `appaloft source-event replay <sourceEventId> --resource <resourceId>` 或
`POST /api/source-events/{sourceEventId}/replay` 重放已保留的 safe delivery facts。Replay
会重新按当前 Resource policy 匹配并走普通 `deployments.create` admission；它不会读取 raw
webhook payload、signature、provider token 或 webhook secret。

如果部署已被创建，后续恢复应使用普通 deployment recovery/readiness、retry、redeploy 或 rollback
语义，而不是重放 webhook payload。

## Source event 保留 [#source-auto-deploy-retention]

使用 `appaloft source-event prune --before <iso>` 或 `POST /api/source-events/prune` 先检查已保留的
source event delivery。Prune 默认 dry-run，并返回按 status 和 source kind 分组的匹配数量。只有在确认
scope 和 cutoff 后，才传入 `--dry-run false` 执行清理。

Retention cleanup 只删除已持久化的安全 source event 诊断记录。它不会删除 Resource、deployment、
webhook secret、provider token、raw payload，也不会影响 cutoff 和 filter 之外事件的 replay 能力。
