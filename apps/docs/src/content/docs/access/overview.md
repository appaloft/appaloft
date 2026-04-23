---
title: "Domains and access"
description: "生成访问地址、服务器路由、自定义域名、证书和 readiness 的用户说明。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "domain"
  - "tls"
  - "certificate"
  - "access route"
  - "域名"
  - "证书"
relatedOperations:
  - domain-bindings.create
  - domain-bindings.confirm-ownership
  - certificates.issue-or-renew
sidebar:
  label: "Domains and access"
  order: 7
---

<h2 id="access-generated-route">默认访问地址</h2>

默认访问地址依赖服务器公共地址、代理准备状态和资源网络配置。它适合快速验证部署是否可访问。

<h2 id="domain-binding-purpose">自定义域名绑定</h2>

域名绑定表示用户希望某个域名指向某个资源。它不是部署输入，也不是证书签发的隐式副作用。

<h2 id="domain-binding-ownership-check">域名所有权检查</h2>

所有权检查用于证明用户能控制该域名。检查失败时应显示可执行的 DNS 或路由修复步骤。

<h2 id="certificate-readiness">证书 readiness</h2>

证书 readiness 描述 TLS 是否可用。证书失败不应掩盖部署状态，用户应该能分别看到应用运行状态和域名/TLS 状态。
