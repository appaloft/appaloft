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
  - projects.list
  - projects.show
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

<h2 id="cli-remote-control-plane-login">远程控制面登录</h2>

`appaloft login` 和 `appaloft auth login` 默认连接 Appaloft Cloud：`https://app.appaloft.com`。如果要连接自托管控制面或其他受信任 endpoint，显式传入 `--url <url>`。登录成功后，CLI 会把 endpoint、profile 名称、认证引用和握手摘要保存到本机 CLI profile。这个 profile 位于 `APPALOFT_HOME` 或用户本机 Appaloft home，不属于仓库配置。

登录需要先通过 `/api/version` 兼容性发现和当前组织上下文校验。`appaloft auth status`、`appaloft logout`、`appaloft auth logout`、`appaloft context list`、`appaloft context show`、`appaloft context use <profile>` 只管理本机 profile/context。

登录不是部署接管，也不是 SSH PGlite state adoption。它不会创建 project、resource、deployment、source link、domain binding，不会把 `controlPlane` 塞进 `deployments.create`，也不会把 token、cookie、database URL、SSH key、credential id、tenant/org secret identity 写进 committed `appaloft.yml`。

交互式 Cloud 登录会打开或提示浏览器登录 URL。当前 CLI 仍需要一个受信任的本机 credential 才能完成 profile 写入：`APPALOFT_AUTH_COOKIE` 用于 product session，`APPALOFT_TOKEN` 用于明确的 bearer token 自动化输入。浏览器/device/OIDC 自动把 session/token 交换回 CLI 属于后续能力；在该能力落地前，浏览器登录只是引导，不会让 CLI 读取浏览器 cookie。

<h2 id="cli-remote-control-plane-dispatch">远程控制面 dispatch</h2>

有 active profile，或显式传入 `--control-plane-mode cloud|self-hosted`、`--control-plane-url <url>`、`APPALOFT_CONTROL_PLANE_MODE`、`APPALOFT_CONTROL_PLANE_URL` 时，普通 CLI 业务命令会先解析执行目标。`controlPlane.mode: none` 和 `--control-plane-mode none` 继续使用本地 CLI/SSH runtime。

远程目标会在业务请求前执行兼容性/auth handshake，然后通过同一套 typed HTTP/API contract dispatch 非 streaming、非 webhook-signature 的 generated SDK operation。CLI 不维护另一份业务 schema；同一个 operation key 和 input schema 也服务于 HTTP/oRPC、Web、SDK 和 MCP。

没有 profile、URL、token 或其他受信任远程来源时，`auto` 和默认行为会回落到本地模式。这个回落不会联系 public Cloud、不会扫描网络、不会上传或 adopt SSH PGlite state。

`serve`、`db`、`remote-state`、`init`、top-level quick `deploy`、本地 terminal attach/source-package/streaming 类命令仍保持本地或在显式 remote mode 下报 `control_plane_unsupported`。远程已选择但 auth、handshake 或 operation capability 不满足时，CLI 会失败，不会静默改走本地执行。

<h2 id="cli-local-server-docs">本地文档路径</h2>

当 Appaloft 本地服务运行时，CLI 文档链接应优先指向本地 `/docs/*`，避免离线自托管用户必须访问外部站点。

<h2 id="cli-automation">自动化使用</h2>

自动化脚本应优先使用明确 flag 或配置文件字段，避免依赖无法重放的交互输入。
