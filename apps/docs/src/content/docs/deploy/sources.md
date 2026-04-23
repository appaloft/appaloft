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
  - source-links.relink
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

<h2 id="deployment-source-validation">输入检查</h2>

用户应能看到来源是否可读取、ref 或路径是否存在、静态输出目录是否明确，以及来源和资源 runtime profile 是否明显冲突。

Web console 应在提交前提示缺失字段，例如 Git ref、base directory 或静态输出目录。CLI 应把无法读取路径、无法访问仓库、空 source 等问题作为输入错误。HTTP API 应返回结构化 validation error，包含字段名和恢复建议。

CLI source 示例：

```bash title="本地目录"
appaloft deploy ./apps/web --method static --publish-dir build
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
