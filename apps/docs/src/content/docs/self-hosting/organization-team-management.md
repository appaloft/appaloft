---
title: "Organization team management"
description: "邀请成员、查看成员和邀请、更新角色、移除成员，并安全处理 401/403。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "organization"
  - "team"
  - "members"
  - "invitations"
  - "roles"
  - "APPALOFT_AUTH_COOKIE"
  - "APPALOFT_AUTHORIZATION"
  - "product_auth_missing"
  - "product_auth_forbidden"
  - "组织"
  - "成员"
  - "邀请"
  - "角色"
relatedOperations:
  - "organizations.current-context"
  - "organizations.switch-current"
  - "organizations.list-members"
  - "organizations.list-invitations"
  - "organizations.invite-member"
  - "organizations.update-member-role"
  - "organizations.remove-member"
sidebar:
  label: "Team"
  order: 3
---

<h2 id="self-hosting-organization-team-management">Organization team management</h2>

首次管理员会成为初始 organization 的 owner。登录后，可以读取当前 organization context、切换到当前
session 已可见的 organization、查看成员和邀请，并用 owner 或 admin role 管理成员。

这些操作需要有效的产品 session。HTTP/API 使用登录后的 cookie 或 authorization header。CLI 会从
`APPALOFT_AUTH_COOKIE` 或 `APPALOFT_AUTHORIZATION` 读取等价的 session 输入；不要把这些值写入 shell
history、CI 日志、仓库文件、issue 或 PR 评论。

<h2 id="self-hosting-organization-current-context">查看当前 context</h2>

```sh
appaloft organization context
appaloft organization switch org_second
```

该命令返回当前用户、当前 organization、当前 role、可选 organization 和可用登录方式的安全元数据。
输出不会包含 session token、cookie、OAuth provider token、邀请 secret 或 deploy token 原始值。
切换命令只允许选择当前产品 session 已可见的 organization；重复选择当前 organization 是幂等操作。

<h2 id="self-hosting-organization-members">查看成员和邀请</h2>

```sh
appaloft organization members list --organization-id org_self_hosted
appaloft organization invitations list --organization-id org_self_hosted --status pending
```

成员列表只返回 member id、用户安全元数据、role、加入时间等字段。邀请列表只返回安全邀请元数据，
不会返回原始邀请 token。

<h2 id="self-hosting-organization-member-management">邀请、更新 role、移除成员</h2>

```sh
appaloft organization member invite --organization-id org_self_hosted --email operator@example.com --role developer
appaloft organization member role mem_operator --organization-id org_self_hosted --role admin
appaloft organization member remove mem_operator --organization-id org_self_hosted
```

可用 role 是 `owner`、`admin`、`developer`、`billing` 和 `viewer`。Owner 和 admin 可以管理成员。
早期自托管构建会在 auth runtime 边界把默认 `member` role 映射回 Appaloft 的 `developer`，直到更完整
的自定义 role 持久化完成。

Role update 和 remove member 会保留至少一个 owner。如果操作会让 organization 没有 owner，Appaloft
会拒绝操作，而不是留下不可恢复的 organization。

<h2 id="self-hosting-organization-http-api">HTTP/API routes</h2>

同一套操作也可以通过 HTTP/API 调用：

```http
GET /api/organizations/current-context
POST /api/organizations/current-context/switch
GET /api/organizations/{organizationId}/members
GET /api/organizations/{organizationId}/invitations
POST /api/organizations/{organizationId}/invitations
POST /api/organizations/{organizationId}/members/{memberId}/role
DELETE /api/organizations/{organizationId}/members/{memberId}
```

HTTP/API routes 和 CLI 都执行同一组 Appaloft 操作。Auth runtime 是实现细节，调用方不需要也不应该
依赖底层 auth route、table 或 provider payload。

<h2 id="self-hosting-organization-web-status">Web console status</h2>

Web console 的 `/organization` 页面可以读取当前 organization context、切换到另一个可见
organization、查看成员和邀请、邀请成员、更新 role、移除成员，并管理 deploy token 的创建、轮换和撤销。
浏览器端 self-hosted auth e2e 覆盖仍是后续 Phase 8 工作。

<h2 id="self-hosting-organization-recovery">恢复和排查</h2>

- 看到 `401 product_auth_missing` 时，重新登录，或为 CLI 提供受信任的 session handoff。
- 看到 `403 product_auth_forbidden` 时，确认当前用户属于目标 organization。成员管理和 deploy token
  管理还需要 owner 或 admin role。
- 如果无法移除或降级成员，检查该成员是否是最后一个 owner。
- 不要直接编辑 auth 数据库表来绕过成员、role 或邀请状态；优先使用 CLI/HTTP/API 或从受信任备份恢复。
