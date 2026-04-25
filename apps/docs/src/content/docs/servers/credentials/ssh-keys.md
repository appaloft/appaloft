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
  - credentials.show
  - credentials.delete-ssh
  - credentials.rotate-ssh
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

已保存的可复用 SSH 凭据可以原地轮换。原地轮换会保留 credential id 和已有服务器引用，只替换后续连接、部署和恢复操作使用的凭据材料。轮换成功不代表新 key 已经能连通服务器；轮换后仍需要重新运行连接测试。

轮换前 Appaloft 会读取同一个 usage surface：

- `totalServers = 0`：可以输入完整 credential id 后轮换。
- `totalServers > 0`：需要明确确认这些活跃或已停用服务器后续会使用轮换后的凭据材料。
- usage 暂不可读：不能继续轮换，请先重试或修复状态读取问题。

CLI 轮换从本机文件读取新私钥：

```bash
appaloft server credential-rotate <credentialId> \
  --private-key-file ~/.ssh/appaloft-new \
  --confirm <credentialId> \
  --acknowledge-server-usage
```

当 usage 为 0 时可以省略 `--acknowledge-server-usage`。HTTP API 使用同一个命令语义：

```http
POST /api/credentials/ssh/{credentialId}/rotate
```

Web 控制台的已保存 SSH 凭据区域会打开轮换对话框。它会重新检查 usage，要求输入完整 credential id，并在 usage 不为 0 时要求确认影响范围。轮换后请在关联服务器上运行连接测试，再继续部署。

如果你想创建一个新的 credential id，而不是保留原引用，可以添加新凭据、把服务器切换到新凭据、运行连接测试，再删除旧凭据。

<h2 id="server-credential-delete-unused">删除未使用的已保存凭据</h2>

只有没有任何活跃或已停用服务器引用的 saved credential 可以删除。先查看凭据详情和 usage：

- `totalServers = 0`：可以通过 Web、CLI 或 HTTP API 删除。
- `totalServers > 0`：删除会以 `credential_in_use` 拒绝；先切换或删除引用它的服务器。
- usage 暂不可读：不能当作 0 使用量，删除会拒绝；请重试或先修复状态读取问题。

CLI 删除需要 typed confirmation：

```bash
appaloft server credential-delete <credentialId> --confirm <credentialId>
```

HTTP API 使用同一个命令语义：

```http
DELETE /api/credentials/ssh/{credentialId}
```

Web 控制台的已保存 SSH 凭据区域会打开 destructive confirmation dialog。它会重新检查 usage；当 usage 暂不可读或不为 0 时禁用删除，并要求输入完整 credential id 后才会发起删除命令。

相关页面：[Register and test a server](/docs/servers/register-connect/)。
