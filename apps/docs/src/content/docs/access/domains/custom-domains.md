---
title: "Custom domains"
description: "把自定义域名绑定到资源。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "custom domain"
  - "domain binding"
  - "hostname"
  - "自定义域名"
relatedOperations:
  - domain-bindings.create
  - domain-bindings.show
  - domain-bindings.configure-route
  - domain-bindings.delete-check
  - domain-bindings.delete
sidebar:
  label: "Custom domains"
  order: 3
---

<h2 id="domain-binding-purpose">自定义域名绑定</h2>

自定义域名绑定表示“这个 hostname 应该访问这个资源”。它是访问配置，不是部署输入，也不是证书签发的隐式副作用。

先让默认访问地址可用，再绑定自定义域名。这样排查时可以区分应用/代理问题和 DNS/TLS 问题。

适合使用自定义域名的场景：

- 要把生产域名指向一个资源。
- 要给 staging、preview 或客户环境配置独立 hostname。
- 要在资源部署稳定后再接入外部访问入口。

<h2 id="domain-binding-inputs">绑定输入</h2>

用户需要明确这些输入：

- 资源：域名最终应该访问哪个 resource。
- 环境：域名绑定在哪个环境下生效，例如 production 或 staging。
- Hostname：用户控制的完整域名，例如 `app.example.com`。
- 访问策略：是否走默认代理入口、是否需要 HTTPS、是否允许临时未 ready 状态。
- 证书策略：自动签发、导入证书，或稍后再处理 TLS。

域名不应该用来代替资源名、服务器名或环境名。一个域名绑定只描述访问意图。

<h2 id="domain-binding-surfaces">Web、CLI 和 API</h2>

Web console 应让用户从资源页或访问页创建绑定，并在同一流程中提示所有权检查、route readiness、proxy readiness、diagnostics 和 TLS readiness。

CLI 适合自动化绑定，例如在发布脚本里把 hostname 绑定到已存在资源。用 `appaloft domain-binding show <domainBindingId>` 查看单个绑定，用 `configure-route` 在直接服务流量和重定向到 canonical binding 之间切换，用 `delete-check` 做删除预检，确认无 blocker 后再执行 `delete --confirm <domainBindingId>`。

HTTP API 使用同一组 operation contract。API 不应把 DNS/TLS 语义藏在普通部署状态里。

<h2 id="domain-binding-output">创建后会看到什么</h2>

创建绑定后，用户应该能看到：

- `pending_ownership`：等待 DNS 或所有权检查。
- `pending_certificate`：域名控制已确认，但 TLS 还没 ready。
- `ready`：域名和证书都可以使用。
- `failed` 或具体错误：需要用户修正 DNS、证书材料或代理入口。

<h2 id="domain-binding-recovery">失败恢复</h2>

如果绑定失败，先不要重新部署应用。按顺序检查：

1. 默认访问地址是否可用。
2. 域名是否指向当前服务器或代理入口。
3. 所有权检查需要的 DNS 记录是否存在。
4. 证书签发或导入是否失败。

删除绑定只移除 managed custom-domain route intent。它不会撤销证书、清除证书历史、删除 generated access、重写 deployment snapshot，也不会删除 server-applied route audit。只要 active certificate state 仍然挂在这个 binding 上，删除会被阻止，直到证书 revoke/delete lifecycle 作为独立操作实现。

相关页面：[Domain ownership](/docs/access/domains/ownership/)、[TLS certificates](/docs/access/tls/certificates/)、[Access troubleshooting](/docs/access/troubleshooting/)。
