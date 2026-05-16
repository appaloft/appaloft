---
title: "Appaloft skill"
description: "让 AI agent 像使用 CLI、HTTP API 或 Web 一样使用完整 Appaloft 能力。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "appaloft skill"
  - "AI entrypoint"
  - "AI 入口"
  - "完整 skill"
relatedOperations:
  - deployments.create
  - resources.create
  - servers.register
  - domain-bindings.create
  - dependency-resources.provision-postgres
sidebar:
  label: "Appaloft skill"
  order: 0
---

<h2 id="appaloft-skill">Appaloft AI 入口</h2>

Appaloft Skill 是面向 AI agent 的完整产品入口。它和 CLI、HTTP API、Web console、未来 MCP
工具一样，都映射到同一套 Appaloft operation catalog；区别只是它的使用者是 AI。

它不是新的业务操作，也不是 `appaloft deploy` 包装器。它把用户意图翻译成既有 Appaloft 操作，并根据当前环境选择 CLI、HTTP/API、Web 或未来 MCP 表面。

<h2 id="appaloft-skill-install">安装</h2>

推荐安装完整 Appaloft skill：

```bash
npx skills add appaloft/appaloft
```

安装命令只复制 skill 文件，不会部署应用、创建资源、调用 API，也不会包装 CLI。Appaloft 不提供单独的 npm skill installer，避免和 `appaloft` CLI 边界混淆。

<h2 id="appaloft-skill-scope">能力范围</h2>

完整 skill 覆盖 Appaloft CLI operation catalog 中的所有入口，包括：

- 项目、服务器、环境和资源生命周期；
- source/runtime/network/health/access/variable/resource profile 配置；
- deploy、preview cleanup、plan、logs、events、retry、redeploy、rollback；
- domain binding、certificate、default access；
- dependency resources、backup/restore、resource dependency binding；
- storage volumes、scheduled tasks、runtime control、terminal sessions；
- runtime usage、runtime monitoring、operator work、audit events、retention；
- organization、auth bootstrap、deploy tokens、providers、plugins、upgrade、database maintenance。

完整 CLI 映射随安装包一起发布在 `skills/appaloft/references/cli-entrypoints.md`。

<h2 id="appaloft-skill-safety">安全边界</h2>

- 不读取 `.env`、私钥、token 文件、云厂商凭据、deploy token、SSH material、cookie 或未脱敏 secret。
- 不绕过 Appaloft 直接操作 Docker、SSH、数据库、proxy 或 provider SDK。
- 不创造 agent-only operation；所有行为必须映射到既有 CLI/API/Web/MCP operation。
- 不假设产物上传到托管云；默认仍部署到用户选择的 BYOS 目标。

<h2 id="appaloft-skill-reference">规范文档</h2>

完整规范位于 `docs/agent/appaloft-skill.md`。标准 skill source 位于仓库根目录
`skills/appaloft`，部署子协议和入口边界分别位于 `skills/appaloft/references/deploy-protocol.md`
和 `skills/appaloft/references/surfaces.md`。
