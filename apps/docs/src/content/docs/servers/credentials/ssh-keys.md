---
title: "SSH credentials"
description: "配置 SSH key、密钥路径和 secret 屏蔽规则。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "ssh"
  - "credential"
  - "private key"
  - "凭据"
relatedOperations:
  - servers.configure-credential
  - credentials.create-ssh
sidebar:
  label: "SSH credentials"
  order: 3
---

<h2 id="server-ssh-credential-path">SSH 凭据</h2>

SSH 凭据让 Appaloft 能连接服务器并执行部署计划。凭据可以是一次性输入，也可以保存为可复用凭据。

凭据是安全边界。Web、CLI、API、日志和诊断摘要都不应该显示明文 private key、passphrase 或 token。

<h2 id="server-ssh-key-path">密钥路径</h2>

CLI 可以读取本机密钥路径，例如用户明确传入的 key path。Web 和 API 更适合使用已保存凭据或受控 secret 输入，因为浏览器和远程 API 不能假设能访问用户本机文件。

用户需要区分：

- key path：本机文件路径，只适合 CLI 本地执行。
- private key content：敏感 secret，提交后不应回显。
- saved credential：Appaloft 可复用的凭据引用。

<h2 id="server-credential-validation">凭据校验</h2>

凭据创建或配置后，应通过连接测试验证，而不是只保存字段。

校验应覆盖：

- key 是否可解析。
- passphrase 是否正确或是否需要交互输入。
- user 是否能登录服务器。
- 服务器是否接受该 key。
- Appaloft 是否能读取必要环境信息。

<h2 id="server-credential-rotation">轮换凭据</h2>

轮换凭据后需要重新运行连接测试，确认后续部署使用新凭据。

轮换建议：

1. 添加新凭据。
2. 将服务器切换到新凭据。
3. 运行连接测试。
4. 确认新部署可以执行。
5. 再移除旧凭据。

不要在连接测试失败时删除旧凭据，否则可能同时失去部署和恢复入口。

相关页面：[Register and test a server](/docs/servers/register-connect/)。
