---
title: "Self-hosted Action deploy tokens"
description: "为自托管 Appaloft 的 GitHub Action server API 模式配置 deploy token。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "deploy token"
  - "appaloft-token"
  - "GitHub Action"
  - "self-hosted auth"
  - "401"
  - "403"
  - "自托管认证"
relatedOperations:
  - "deploy-tokens.create"
  - "deploy-tokens.list"
  - "deploy-tokens.show"
  - "deploy-tokens.rotate"
  - "deploy-tokens.revoke"
sidebar:
  label: "Action deploy tokens"
  order: 5
---

<h2 id="self-hosting-action-deploy-token-auth">Action deploy token 认证</h2>

自托管 server API 模式会拒绝没有 deploy token 的 GitHub Action mutation 请求。token 是给自动化
使用的机器凭据，不是 Web console 登录会话，也不应该写进仓库配置、workflow 文件正文、URL query
string 或日志。

<h2 id="self-hosting-action-token-setup">安装后保存 GitHub Secret</h2>

普通 SSH 安装不会自动创建 Action deploy token。需要立刻接入 GitHub Action server API 模式时，
安装时传 `--bootstrap-deploy-token`，Docker 安装器会在 Appaloft 容器健康后打印一次 bootstrap
JSON。`token` 字段只在首次创建时出现：

```json
{
  "schemaVersion": "deploy-token.bootstrap/v1",
  "created": true,
  "organizationId": "org_self_hosted",
  "actionSecretName": "APPALOFT_TOKEN",
  "tokenId": "dpt_...",
  "secretSuffix": "abcd1234",
  "token": "aplt_dt_..."
}
```

把 `token` 的值保存到 GitHub repository 或 organization secret，名称使用 `APPALOFT_TOKEN`。
Action workflow 通过 `appaloft-token` input 传给 Appaloft：

```yaml
- uses: appaloft/deploy-action@v1
  with:
    control-plane-mode: self-hosted
    control-plane-url: https://console.example.com
    appaloft-token: ${{ secrets.APPALOFT_TOKEN }}
```

重新运行安装器时，如果已经存在 active deploy token，输出只包含安全 metadata，不会再次显示 raw
token。

<h2 id="self-hosting-action-token-scope">Scope 和当前限制</h2>

Deploy token 可以限制到 workflow command、project、environment、resource、server 和 repository。
当前安装器创建的是初始自托管 Action token，用来让已有 server API deploy、server config deploy 和
preview cleanup 路径先具备认证边界。

first admin 创建后，管理员可以通过 CLI 或受 product session 保护的 HTTP/API 入口管理 deploy token。
CLI 使用同一组 application command/query：

- `appaloft deploy-token create --organization-id org_self_hosted --display-name "GitHub Action" --workflow-commands source-link-deploy,server-config-deploy,preview-cleanup`
- `appaloft deploy-token list --organization-id org_self_hosted`
- `appaloft deploy-token show dpt_... --organization-id org_self_hosted`

HTTP/API 入口如下：

- `POST /api/deploy-tokens` 创建新 token。响应里的 raw token 只显示一次。
- `GET /api/deploy-tokens?organizationId=...` 列出安全 metadata。
- `GET /api/deploy-tokens/{tokenId}?organizationId=...` 查看单个 token 的安全 metadata。

Web token 管理和未来 MCP 入口仍在 Phase 8 后续工作里；不要依赖数据库手工编辑来扩大或绕过 scope。

<h2 id="self-hosting-action-auth-errors">401 和 403</h2>

`401 action_auth_missing` 表示 Action 没有发送 bearer token。检查 workflow 是否传了
`appaloft-token: ${{ secrets.APPALOFT_TOKEN }}`，以及 secret 名称是否正确。

`401 action_auth_invalid` 表示 token 格式错误、未知、过期、已撤销，或 server 无法验证 token。重新
复制 GitHub Secret 时只复制 `aplt_dt_...` token 值，不要复制整个 bootstrap JSON。

`403 action_auth_forbidden` 表示 token 有效，但 scope 不允许当前请求。常见原因是 repository、
resource、environment 或 workflow command 不匹配。

<h2 id="self-hosting-action-token-rotation">轮换和撤销</h2>

Raw token 只显示一次。不要把 token 放在 issue、PR 评论、workflow 日志或部署输出里。

如果 token 泄露，先从 GitHub Secrets 删除或替换 `APPALOFT_TOKEN`，暂停使用该 secret 的 workflow，
然后用管理员 session 调用：

- `appaloft deploy-token rotate dpt_... --organization-id org_self_hosted --confirm dpt_...`
- `appaloft deploy-token revoke dpt_... --organization-id org_self_hosted --confirm dpt_...`

- `POST /api/deploy-tokens/{tokenId}/rotate` 轮换 token。响应里的新 raw token 只显示一次。
- `POST /api/deploy-tokens/{tokenId}/revoke` 撤销 token。旧 token 后续 Action 请求会按无效凭据拒绝。

在 Web token 管理完成前，生产实例应限制 GitHub Secret 的可见范围，并把 API 返回的 raw token 当作
一次性敏感输出处理。
