---
title: "First admin bootstrap"
description: "首次自托管安装后创建本地管理员、登录 console，并安全处理 OAuth 和恢复。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "first admin"
  - "bootstrap"
  - "local admin"
  - "OAuth"
  - "login"
  - "product_auth_missing"
  - "product_auth_forbidden"
  - "首次管理员"
  - "本地管理员"
relatedOperations:
  - "auth.bootstrap-status"
  - "auth.bootstrap-first-admin"
sidebar:
  label: "First admin"
  order: 2
---

<h2 id="self-hosting-first-admin-bootstrap">首次管理员 bootstrap</h2>

自托管 Appaloft 第一次启动时需要一个本地管理员。这个账号用于登录 Web console、完成后续
organization 配置，并在 admin authorization 开放后管理 deploy token 和成员。

首次管理员可以由安装器通过受信任的安装输入创建：

```sh
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- \
  --first-admin-email admin@example.com \
  --first-admin-name "Admin"
```

如果没有传 `--first-admin-password`，安装器会生成一次性密码，并只在 Appaloft 容器健康后从受信任
handoff 输出读取并打印一次。请立即保存该密码。重新运行安装器时，如果已经存在管理员或
organization owner，bootstrap 会安全跳过，不会再次显示密码。

如果需要提供自己的初始密码，可以传：

```sh
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- \
  --first-admin-email admin@example.com \
  --first-admin-password "$APPALOFT_INITIAL_ADMIN_PASSWORD"
```

安装器不会把你提供的密码回显到输出里。不要把密码写进仓库配置、shell history、CI 日志、issue、
PR 评论或部署输出。

也可以在安装后打开 console 的 `/bootstrap/auth/first-admin` 页面完成首次管理员设置。该页面会先读取
bootstrap status；如果实例已经有管理员，会引导你去 `/login` 登录，而不会再次创建账号。

CLI bootstrap 走同一条 application command/query 路径：

```sh
appaloft auth bootstrap-status
appaloft auth bootstrap-first-admin \
  --email admin@example.com \
  --display-name "Admin"
```

<h2 id="self-hosting-first-admin-login">登录 console</h2>

安装器会打印 console URL。没有配置域名时，通常是服务器的 `3721` 端口；配置了 `--domain` 时，
使用对应的 HTTPS 域名。

用 first-admin email 和密码登录。登录后，Appaloft 会把你识别为用户会话，并按 organization role
保护产品 mutation。没有 session 的 mutation 会返回 `401 product_auth_missing`；已登录但不属于目标
organization 或 role 不足时，会返回 `403 product_auth_forbidden`。

<h2 id="self-hosting-first-admin-public-api">Bootstrap status 和 setup API</h2>

安装和 console setup 可以读取公开 bootstrap status：

```http
GET /api/bootstrap/auth/status
```

当 status 表示需要创建首次管理员时，可以调用一次 setup endpoint：

```http
POST /api/bootstrap/auth/first-admin
```

这些 bootstrap endpoints 是刻意公开的；它们不要求已有产品 session。安全性来自一次性/idempotent
setup 规则：一旦已经存在管理员或 organization owner，后续 setup 不会再创建新管理员，也不会返回
密码。

<h2 id="self-hosting-first-admin-oauth">OAuth 是可选项</h2>

Google、GitHub 或通用 OIDC 可以稍后再配置。缺少 OAuth client id、client secret、callback URL 或
trusted origin 时，OAuth 登录应保持关闭，但这不应该阻塞本地 first-admin 登录。

先用本地管理员完成首次登录；确认 console 可用后，再添加 OAuth 配置：

| Provider | 必需配置 |
| --- | --- |
| GitHub | `APPALOFT_GITHUB_CLIENT_ID`、`APPALOFT_GITHUB_CLIENT_SECRET`、`APPALOFT_GITHUB_REDIRECT_URI` |
| Google | `APPALOFT_GOOGLE_CLIENT_ID`、`APPALOFT_GOOGLE_CLIENT_SECRET`、`APPALOFT_GOOGLE_REDIRECT_URI` |
| OIDC | `APPALOFT_OIDC_CLIENT_ID`、`APPALOFT_OIDC_CLIENT_SECRET`、`APPALOFT_OIDC_DISCOVERY_URL`、`APPALOFT_OIDC_REDIRECT_URI` |

callback URL 使用 auth API origin；GitHub 和 Google 默认路径是
`<APPALOFT_BETTER_AUTH_URL>/api/auth/callback/<provider>`，通用 OIDC 默认路径是
`<APPALOFT_BETTER_AUTH_URL>/api/auth/oauth2/callback/oidc`。browser console origin 必须通过
`APPALOFT_WEB_ORIGIN` 配置为 trusted origin。

不要为了绕过首次登录而手工编辑数据库用户、member 或 organization 记录。

<h2 id="self-hosting-first-admin-next-team">下一步：管理 organization 成员</h2>

首次管理员会成为初始 organization 的 owner。登录后，使用
[Organization team management](/docs/self-hosting/organization-team-management/) 查看当前
organization context、邀请成员、更新角色、移除成员，并处理 `401 product_auth_missing` 和
`403 product_auth_forbidden`。

<h2 id="self-hosting-first-admin-recovery">恢复和排查</h2>

如果忘记生成的一次性密码，重新运行安装器不会再次显示旧密码。优先使用已登录的管理员会话或后续
正式的管理员恢复流程。早期自托管实例在没有可用管理员时，应从受信任备份恢复，而不是直接修改
auth 数据库表。

如果安装后无法登录：

- 确认使用的是安装器打印的 console URL，而不是项目资源域名。
- 检查首次管理员 email 是否和安装输入一致。
- 查看安装器输出是否显示 bootstrap 已跳过；如果已跳过，说明实例里已经存在管理员或 owner。
- 看到 `401 product_auth_missing` 时重新登录；看到 `403 product_auth_forbidden` 时确认当前用户属于
  目标 organization 且有 admin 或 owner role。
