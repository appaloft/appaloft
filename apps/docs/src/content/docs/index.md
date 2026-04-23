---
title: "Appaloft 文档"
description: "Appaloft 文档帮助你部署应用、接入服务器、配置访问地址、管理环境变量并排查问题。"
template: splash
docType: index
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "docs"
  - "documentation"
  - "帮助"
  - "文档"
  - "部署"
  - "自托管"
  - "应用发布"
relatedOperations: []
hero:
  title: "用 Appaloft 部署和管理你的应用"
  tagline: "从第一次部署到服务器、域名、环境变量和故障排查，这里按你想完成的事情组织。"
  actions:
    - text: "完成第一次部署"
      link: /docs/start/first-deployment/
      icon: right-arrow
    - text: "查看常见问题"
      link: /docs/observe/diagnostics/
      variant: minimal
      icon: external
---

<h2 id="docs-entry-map">从你的目标开始</h2>

Appaloft 帮你把应用部署到可控的运行环境，并把访问地址、配置、状态和恢复动作放在同一个地方管理。你不需要先掌握复杂概念；先选择你现在要完成的事情。

- **我想先跑起来**：从 [第一次部署](/docs/start/first-deployment/) 开始，按最短路径把一个应用部署出来。
- **我需要接入服务器**：阅读 [服务器注册与连通性](/docs/servers/register-connect/)，确认服务器、SSH 凭据和健康检查是否可用。
- **我想让别人能访问**：阅读 [默认访问地址](/docs/access/generated-routes/) 和 [自定义域名](/docs/access/domains/custom-domains/)。
- **我需要配置环境变量**：阅读 [环境变量优先级](/docs/environments/variables/precedence/) 和 [密钥处理](/docs/environments/variables/secrets/)。
- **我遇到了问题**：从 [日志与健康状态](/docs/observe/logs-health/) 或 [诊断信息](/docs/observe/diagnostics/) 开始定位原因。

<h2 id="docs-reader-path">建议阅读路径</h2>

1. 新用户先读 [Start here](/docs/start/first-deployment/)，完成一次从输入到可访问地址的部署。
2. 配置应用时读 [Projects and resources](/docs/resources/projects/) 与 [Environment variables](/docs/environments/variables/precedence/)。
3. 配置访问时读 [Default access](/docs/access/generated-routes/)、[Custom domains](/docs/access/domains/custom-domains/) 和 [TLS certificates](/docs/access/tls/certificates/)。
4. 运维和自动化时读 [CLI reference](/docs/reference/cli/)、[HTTP API reference](/docs/reference/http-api/) 与 [Self-hosting](/docs/self-hosting/install/)。

<h2 id="docs-local-help">在 Appaloft 里打开帮助</h2>

Web console 中带 `?` 的字段会打开相关文档页面。自托管和 binary 版本也会随 Appaloft 一起提供本地文档，所以服务器环境不能访问公网时仍可以查看帮助。需要替换本地文档站时，请看 [静态资源说明](/docs/self-hosting/static-assets/)。
