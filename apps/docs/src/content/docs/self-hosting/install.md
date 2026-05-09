---
title: "Install and serve Appaloft"
description: "安装 Appaloft，并理解 serve 的 Web console 和 docs 路径。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "install"
  - "serve"
  - "binary"
  - "安装"
relatedOperations: []
sidebar:
  label: "Install and serve"
  order: 1
---

<h2 id="self-hosting-serve-paths">Serve 路径</h2>

`appaloft serve` 根路径提供 Web console，`/docs/*` 提供 public docs。

<h2 id="self-hosting-install-binary">安装 binary</h2>

Binary 包含运行时入口、Web console 静态资源和 public docs 静态资源。

<h2 id="self-hosting-install-docker">使用 Docker 安装</h2>

Release 里的 `install.sh` 会把 Appaloft 安装成 Docker Compose stack，同一个 Appaloft server
同时提供 console 和 docs：

```sh
curl -fsSL https://appaloft.com/install.sh | sudo sh
```

默认 Docker 安装使用 PostgreSQL，适合生产自托管。单机 portable console 如果要继续使用嵌入式
PGlite，可以传 `--database pglite`：

```sh
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --database pglite
```

PGlite 模式会把 Appaloft 状态放在挂载到 `/appaloft-data` 的持久 Docker volume 中。不要把
数据库密码、GitHub token、SSH key 或部署身份值写进仓库配置；这些值应放在主机、CI secret
store，或安装后的 Appaloft server 内。

默认安装还会启动一个 Appaloft 自己管理的 Traefik edge proxy。没有配置域名时，console 可以通过
服务器的 `3721` 端口访问。要把 console 绑定到域名，先把 DNS 指向这台服务器，并开放 `80` 和
`443`，然后传 `--domain`：

```sh
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --domain console.example.com
```

这个域名是 Appaloft instance 自己的 console bootstrap route，不是项目资源的自定义域名，也不会
创建 deployment snapshot 或 DomainBinding。之后如果要换 console 域名，可以用新的 `--domain`
重新运行安装器。只有在外部反向代理已经负责公开入口时，才使用 `--proxy none`。

如果主机已经是 Docker Swarm manager，可以把 console 安装成 Swarm stack：

```sh
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --database pglite --orchestrator swarm --stack-name appaloft
```

只有在明确希望安装器初始化单节点 Swarm manager 时，才加 `--swarm-init`。
