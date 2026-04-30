---
title: "Domain ownership"
description: "验证用户是否控制自定义域名。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "ownership"
  - "dns verification"
  - "domain verify"
  - "所有权"
relatedOperations:
  - domain-bindings.confirm-ownership
  - domain-bindings.retry-verification
sidebar:
  label: "Ownership"
  order: 4
---

<h2 id="domain-binding-ownership-check">域名所有权检查</h2>

域名所有权检查用于证明用户能控制这个 hostname。Appaloft 不应该在无法确认控制权时把域名标记为 ready，也不应该把所有权失败伪装成部署失败。

所有权检查通常发生在创建或更新自定义域名绑定之后。用户需要根据 Appaloft 给出的 DNS 指令添加记录，然后重新检查。

<h2 id="domain-binding-dns-records">DNS 记录</h2>

DNS 指令应该至少包含：

- 记录类型，例如 `CNAME`、`A`、`AAAA` 或 TXT 验证记录。
- 主机名，也就是用户要配置的 record name。
- 目标值，例如服务器公共地址、代理入口或验证 token。
- TTL 或建议等待时间。

用户复制 DNS 记录时，只需要复制 Appaloft 提供的值。不要从日志里找 token，也不要把 secret 或私钥作为 DNS 值。

<h2 id="domain-binding-ownership-status">状态含义</h2>

常见状态：

- `pending`：还没有观察到所需 DNS 记录。
- `checking`：正在检查 DNS 或代理观测结果。
- `verified`：用户控制权已确认。
- `failed`：记录存在但值不匹配，或无法解析。

如果 DNS 刚刚修改，`pending` 不一定表示配置错误。先等待 TTL 或 DNS 传播窗口，再重新检查。

<h2 id="domain-binding-ownership-retry">什么时候重试</h2>

可以重试检查的情况：

- 刚添加或修改 DNS 记录。
- DNS provider 控制台显示记录已生效。
- Appaloft 提示的是暂时无法解析或超时。

`appaloft domain-binding retry-verification <domainBindingId>` 会创建新的所有权验证 attempt。旧 attempt 会保留为历史；它不会重试证书签发、撤销证书、修复代理路由、重新部署或回滚部署。

需要修复后再重试的情况：

- 记录类型不对。
- 主机名写错，例如把 `app.example.com` 写成了根域。
- 目标值不匹配。
- 域名仍指向旧服务器或旧代理。

下一步通常是 [TLS certificates](/docs/access/tls/certificates/)。
