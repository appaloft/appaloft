---
title: "Register and test a server"
description: "注册部署目标服务器并运行连接测试。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "server"
  - "connectivity"
  - "ssh test"
  - "服务器"
relatedOperations:
  - servers.register
  - servers.show
  - servers.rename
  - servers.configure-edge-proxy
  - servers.deactivate
  - servers.delete-check
  - servers.delete
  - servers.test-connectivity
sidebar:
  label: "Register and test"
  order: 2
---

![Server connectivity flow](/docs/diagrams/server-connectivity.svg)

<h2 id="server-deployment-target">服务器是什么</h2>

服务器是 Appaloft 可以连接、检查和部署应用的目标。用户看到的是 SSH 地址、凭据、连接状态、运行环境摘要和代理准备状态。

服务器不是项目，也不是资源。一个服务器可以承载多个资源；资源是否能访问还取决于 resource network profile 和代理 readiness。

注册服务器的目标是让 Appaloft 能安全地执行部署计划，而不是立即部署应用。

读取服务器详情用于确认某个部署目标的 host、provider、已配置凭据摘要、代理状态，以及当前部署、资源和域名的汇总。这个读取不会运行连接测试、修复代理或修改服务器。

重命名服务器只修改显示名称。它不会改变 server id、host、provider、credential、proxy、lifecycle 或历史部署/域名/审计引用。active 和 inactive 服务器都可以重命名；已经删除的服务器不会出现在普通重命名入口中。

修改 edge proxy 类型只保存服务器未来路由使用的代理意图。`none` 会让后续生成访问地址或自定义域名路由不再把这个服务器当作代理承载目标；`traefik` 和 `caddy` 会把服务器标记为后续代理准备和路由实现的目标。这个操作不会改 server id、host、provider、credential、lifecycle，也不会删除历史 route snapshot、部署、域名或审计引用。只有 active 服务器可以修改；已停用服务器需要重新启用或走专门恢复流程后才能接收新的代理目标配置工作。

停用服务器用于阻止它继续作为新的部署、调度或代理配置目标。停用不会停止已有运行任务，也不会删除部署历史、域名、证书、凭据、路由、日志或审计记录。

删除前应先运行 delete safety check。检查会返回阻止删除的原因，例如服务器仍是 active、仍有部署历史或运行中的部署、资源 placement、域名、证书、已配置凭据、server-applied routes、default access policy、terminal session、runtime task、日志或审计保留。检查只是预览，不会删除任何内容。

删除服务器只适用于已经停用且检查没有 blocker 的服务器。删除会把服务器从普通列表、详情和新部署目标选择中移除，但不会自动清理部署历史、资源、域名、证书、凭据、路由、日志或审计记录。CLI 删除需要显式确认，例如 `--confirm srv_primary`。

<h2 id="server-connectivity-test">连接测试</h2>

连接测试用于确认 Appaloft 能到达服务器，并能读取必要的运行环境信息。测试失败不等于已有部署失败，但会阻止依赖该服务器的新部署。

连接测试应检查：

- DNS/IP 和端口是否可达。
- SSH 凭据是否可用。
- 目标用户是否有部署所需权限。
- 基础运行环境是否满足当前 provider/runtime 要求。
- 必要时返回代理或 Docker 相关诊断。

<h2 id="server-registration-inputs">注册输入</h2>

注册服务器时应明确 host、port、user、凭据来源和可选标签。不要把资源、环境或域名写进服务器注册输入。

常见输入：

- `host`：服务器地址。
- `port`：SSH 端口，默认通常是 22。
- `user`：用于连接的系统用户。
- credential：SSH key 路径、已保存凭据或一次性 secret 输入。
- display name / labels：帮助用户区分服务器。

<h2 id="server-registration-surfaces">入口说明</h2>

Web console 应把注册和连接测试放在同一条引导路径中。用户输入 SSH 信息后，应能立即看到连接测试结果和下一步。

CLI 适合本地 SSH 服务器 bootstrap，因为它能读取本机 key path 并进行交互确认。

HTTP API 适合自动化注册服务器，但应避免回显 secret。连接测试结果应以结构化状态返回。

<h2 id="server-registration-recovery">失败恢复</h2>

常见失败和恢复：

- 连接超时：检查 host、port、防火墙和网络。
- 认证失败：检查 SSH key、user 和服务器 authorized keys。
- 权限不足：检查目标用户是否能执行部署所需命令。
- 运行环境缺失：按诊断提示安装或选择支持的 provider/runtime。

连接测试通过后，再继续 [SSH credentials](/docs/servers/credentials/ssh-keys/) 和 [Proxy readiness](/docs/servers/operations/proxy-and-terminal/)。

CLI 示例：

```bash title="注册服务器"
appaloft server register \
  --name primary \
  --host 203.0.113.10 \
  --port 22 \
  --provider generic-ssh \
  --proxy-kind traefik
```

```bash title="运行连接测试"
appaloft server test srv_primary
```

```bash title="读取服务器详情"
appaloft server show srv_primary
```

```bash title="重命名服务器"
appaloft server rename srv_primary --name "Primary SSH server"
```

```bash title="修改 edge proxy 类型"
appaloft server proxy configure srv_primary --kind caddy
```

```bash title="停用服务器"
appaloft server deactivate srv_primary
```

```bash title="检查删除安全性"
appaloft server delete-check srv_primary
```

```bash title="删除停用且无 blocker 的服务器"
appaloft server delete srv_primary --confirm srv_primary
```
