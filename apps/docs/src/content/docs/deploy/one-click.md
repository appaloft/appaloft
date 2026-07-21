---
title: "One-click deploy"
description: "为应用 README 添加 Deploy on Appaloft 按钮，并把用户带到 Blueprint 部署入口。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "one click deploy"
  - "deploy button"
  - "Deploy on Appaloft"
  - "Blueprint"
  - "一键部署"
  - "部署按钮"
relatedOperations:
  - blueprints.list
  - blueprints.show
  - blueprints.install
sidebar:
  label: "One-click deploy"
  order: 4
---

One-click deploy 是一个入口规范，不是新的应用定义格式。按钮只负责把用户带到 Appaloft 的部署入口；应用拓扑继续由 `appaloft.blueprint/v1` Blueprint 描述。

## 快速开始 [#quickstart]

1. 在仓库中维护 `appaloft.blueprint.yaml`，或者先把应用收录到一个 Appaloft Blueprint catalog。
2. 生成 Appaloft 部署链接。
3. 把官方 badge Markdown 放进 README。
4. 用户点击后，在 Appaloft 中选择项目、服务器、依赖资源和 secret，再确认部署。

官方 badge 资产：

```txt title="Badge URL"
https://appaloft.com/badge/deploy.svg
```

README 示例：

```md title="README.md"
[![Deploy on Appaloft](https://appaloft.com/badge/deploy.svg)](https://app.appaloft.com/deploy?source=blueprint&sourceExtension=cloud-blueprint-marketplace&blueprintSlug=pocketbase&blueprintTitle=PocketBase&step=project&projectMode=new&projectName=PocketBase)
```

远程 Blueprint URL 示例：

```md title="README.md"
[![Deploy on Appaloft](https://appaloft.com/badge/deploy.svg)](https://app.appaloft.com/deploy?source=blueprint&blueprintUrl=https%3A%2F%2Fraw.githubusercontent.com%2Fappaloft%2Fexamples%2Fmain%2Foneclick%2Fappaloft.blueprint.yaml&blueprintTitle=Oneclick&blueprintProfile=production&step=project&projectMode=new&projectName=Oneclick)
```

也可以打开 [One-click deploy 生成器](https://appaloft.com/deploy/one-click) 生成 Markdown。

## Deploy handoff URL [#deploy-handoff-url]

标准入口是 `/deploy`，参数描述要打开哪个 Blueprint 和默认项目状态。

| 参数 | 说明 |
| --- | --- |
| `source=blueprint` | 固定值，表示从 Blueprint 进入部署。 |
| `blueprintSlug` | 已注册 catalog 中的 Blueprint slug；与 `blueprintUrl` 二选一。 |
| `blueprintTitle` | UI 展示名称，可选。 |
| `sourceExtension` | 提供 catalog endpoint 的 Web extension key。使用 `blueprintSlug` 时可选；使用 `blueprintUrl` 时通常省略，由 runtime 选择默认远程导入入口。 |
| `blueprintVariant` | 选择 Blueprint variant，可选。 |
| `blueprintProfile` | 选择 profile，例如 `production`，可选。 |
| `projectMode=new` | 默认创建新项目；用户仍可在 UI 中调整。 |
| `projectName` | 新项目默认名称，可选。 |
| `blueprintUrl` | 公开可读取的远程 Blueprint manifest URL；与 `blueprintSlug` 二选一。直接执行能力取决于当前 Appaloft runtime 是否启用远程导入 surface。 |

不要在 URL 中放真实 secret、数据库密码、provider token 或私有仓库凭据。Secret 应在部署向导里由用户输入，或者通过 Appaloft 的 secret/resource binding 机制引用。

## 最小 Blueprint [#minimal-blueprint]

```yaml title="appaloft.blueprint.yaml"
schemaVersion: appaloft.blueprint/v1
id: pocketbase
name: PocketBase
version: 1.0.0
summary: PocketBase service
components:
  - id: app
    name: PocketBase
    kind: service
    runtime:
      strategy: container-image
      image: ghcr.io/muchobien/pocketbase:latest
    ports:
      - name: http
        containerPort: 8090
        protocol: http
        public: true
    routes:
      - port: http
        pathPrefix: /
profiles:
  production:
    label: Production
```

## 边界 [#boundary]

- Blueprint 是 portable manifest，不是 Cloud Marketplace listing。
- Deploy handoff URL 是入口状态，不是新的 deployment command。
- 官方 badge 由 Appaloft 样式规范提供；应用 README 只引用图片和链接。
- Appaloft Cloud 可以托管 `app.appaloft.com/deploy` 和 `appaloft.com/badge/deploy.svg`，但 self-hosted Appaloft 也可以使用同样的 URL 参数规则指向自己的控制面。
