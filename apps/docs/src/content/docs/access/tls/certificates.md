---
title: "TLS certificates"
description: "理解证书 readiness、签发、导入和续期。"
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "certificate"
  - "tls"
  - "https"
  - "证书"
relatedOperations:
  - certificates.issue-or-renew
  - certificates.import
  - certificates.show
  - certificates.retry
  - certificates.revoke
  - certificates.delete
sidebar:
  label: "Certificates"
  order: 5
---

<h2 id="certificate-readiness">证书 readiness</h2>

证书 readiness 描述 HTTPS 是否可用。它和应用部署状态、默认访问地址状态、域名所有权状态是不同维度。

一个资源可以已经部署成功，但证书还没 ready。反过来，证书 ready 也不代表应用健康检查一定通过。

证书 readiness 应回答三个问题：

- Appaloft 是否有可用于这个 hostname 的证书材料。
- 证书是否覆盖当前 hostname，且没有过期。
- 代理是否已经使用这份证书对外提供 HTTPS。

<h2 id="certificate-inputs">证书输入</h2>

已有能力应覆盖两类输入：

- 自动签发或续期：用户提供 hostname 和所有权证明，Appaloft 负责签发流程。
- 导入证书：用户提供 certificate chain、private key 和相关 metadata。

导入证书时，private key 是 secret。Web、CLI、API、日志和诊断摘要都不能回显完整 key。

<h2 id="certificate-validation">校验内容</h2>

证书 readiness 检查应验证：

- 证书链是否可解析。
- private key 是否匹配证书。
- hostname 是否被证书覆盖。
- 证书是否过期或即将过期。
- 算法和 key size 是否满足当前运行时要求。

<h2 id="certificate-renewal">续期</h2>

续期状态应可观察，并在失败时指向 DNS、所有权或证书材料问题。

续期失败时不要直接重新部署应用。先检查：

1. 域名所有权是否仍然有效。
2. DNS 是否还指向当前代理入口。
3. 证书材料是否过期、链不完整或 key 不匹配。
4. 代理是否成功 reload 新证书。

<h2 id="certificate-lifecycle">证书生命周期操作</h2>

`certificate show` 只返回安全元数据、状态和 attempt history，不返回 certificate PEM、private key、passphrase 或 secret ref。

`certificate retry` 只用于 provider-issued certificate 的 retryable 签发或续期失败。它会创建新的证书 attempt，不会重试 domain ownership verification。

`certificate revoke` 让 active certificate 不再用于 Appaloft 托管 TLS。Provider-issued certificate 会通过 provider boundary 执行 provider revocation；imported certificate 只在 Appaloft 本地撤出使用，因为 Appaloft 不一定有外部 CA 的吊销权限。

`certificate delete` 只把非 active certificate 移出可见活跃生命周期，并保留必要审计历史。删除 domain binding 不会自动 revoke 或 delete certificate；反过来，certificate revoke/delete 也不会删除 domain binding。

相关页面：[Domain ownership](/docs/access/domains/ownership/) 和 [Access troubleshooting](/docs/access/troubleshooting/)。
