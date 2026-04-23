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
