---
title: "CLI reference"
description: "CLI 命令、参数、交互提示和文档链接的公开入口。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "cli"
  - "command"
  - "terminal"
  - "命令行"
relatedOperations:
  - projects.create
  - servers.register
  - resources.create
  - deployments.create
sidebar:
  label: "CLI reference"
  order: 9
---

<h2 id="cli-command-shape">命令结构</h2>

CLI 是一等入口。命令应该收集用户输入，然后通过共享业务操作执行，而不是绕过应用层。

<h2 id="cli-help-links">帮助链接</h2>

CLI `--help`、交互式 prompt 和错误恢复提示应该链接到稳定 public docs anchor。当前 help registry 尚未实现，本页先定义目标位置。

<h2 id="cli-local-server-docs">本地文档路径</h2>

当 Appaloft 本地服务运行时，CLI 文档链接应优先指向本地 `/docs/*`，避免离线自托管用户必须访问外部站点。

<h2 id="cli-automation">自动化使用</h2>

自动化脚本应优先使用明确 flag 或配置文件字段，避免依赖无法重放的交互输入。
