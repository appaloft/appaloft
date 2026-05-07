---
title: "Configuration file"
description: "面向用户的 Appaloft 配置文件字段说明。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "config file"
  - "appaloft config"
  - "repository config"
  - "配置文件"
relatedOperations: []
sidebar:
  label: "Config file"
  order: 6
---

<h2 id="environment-config-file-purpose">配置文件用途</h2>

配置文件适合保存可审查的项目、资源、环境和部署默认值。Secret 值不应该直接写入仓库。

<h2 id="environment-config-file-fields">字段分类</h2>

字段应按 project、resource、environment、deployment 和 access 分类解释，避免暴露内部实现术语。

<h2 id="environment-config-file-env">环境变量值</h2>

`env` 用来写非敏感值，`secrets` 用来声明由仓库外部提供的值：

```yaml
env:
  APP_URL: "http://{pr_number}.preview.example.com"
secrets:
  APP_SECRET:
    from: ci-env:APP_SECRET
    required: true
```

Pull request preview 部署里，非敏感 `env` 值可以使用 `{pr_number}` 和 `{preview_id}`。
secret 值本身必须保存在 GitHub Secrets、其他 CI secret store，或 Appaloft 管理的 secrets 中。

<h2 id="environment-config-file-control-plane">控制面</h2>

`controlPlane` 用来保存可审查的部署所有权默认值：

```yaml
controlPlane:
  mode: none
```

`mode: none` 表示纯 CLI 或 Action SSH 部署。自托管 Appaloft server 应拥有部署状态，并且
Action 应调用 server API 而不是直接改 SSH PGlite 时，使用 `mode: self-hosted` 和可信 `url`。

`controlPlane.url` 不是 secret，但必须是没有凭据、路径、query 或 fragment 的 `http` 或
`https` origin。Token、SSH key、仓库身份、project id 和 resource id 不应写进仓库配置。
