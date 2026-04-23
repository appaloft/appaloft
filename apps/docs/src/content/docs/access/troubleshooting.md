---
title: "Access troubleshooting"
description: "排查默认地址、域名、DNS 和 TLS 失败。"
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "dns"
  - "tls error"
  - "domain failed"
  - "访问失败"
relatedOperations:
  - domain-bindings.create
  - certificates.issue-or-renew
sidebar:
  label: "Troubleshooting"
  order: 6
---

<h2 id="access-troubleshooting-order">排查顺序</h2>

先看资源运行状态，再看代理 readiness，然后看域名所有权，最后看证书 readiness。

<h2 id="access-dns-failures">DNS 失败</h2>

确认记录类型、目标值、TTL 和是否指向当前服务器或代理入口。
