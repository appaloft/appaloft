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

Docker 安装会在 Appaloft HTTP 服务启动前自动应用待执行的数据库迁移。迁移失败时容器不会通过
health check，安装器会报错并提示查看容器日志；修复数据库或镜像问题后，重新运行同一条安装命令即可。

高级或离线安装可以用 `--image` 指定预加载的 Appaloft 镜像。只有在镜像已经存在于本机 Docker
daemon 且不需要从 registry 拉取时，才加 `--skip-image-pull`。

PGlite 模式会把 Appaloft 状态放在挂载到 `/appaloft-data` 的持久 Docker volume 中。不要把
数据库密码、GitHub token、SSH key 或部署身份值写进仓库配置；这些值应放在主机、CI secret
store，或安装后的 Appaloft server 内。

安装器也会为产品登录会话生成并复用一个稳定 secret，保存在安装目录的 `.env` 中并注入到 Appaloft
容器。升级或修复时不要删除这个值，否则已有登录会话会失效。

默认安装还会启动一个 Appaloft 自己管理的 Traefik edge proxy。没有配置域名时，console 可以通过
服务器的 `3721` 端口访问。要把 console 绑定到域名，先把 DNS 指向这台服务器，并开放 `80` 和
`443`，然后传 `--domain`：

```sh
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --domain console.example.com
```

这个域名是 Appaloft instance 自己的 console bootstrap route，不是项目资源的自定义域名，也不会
创建 deployment snapshot 或 DomainBinding。之后如果要换 console 域名，可以用新的 `--domain`
重新运行安装器。只有在外部反向代理已经负责公开入口时，才使用 `--proxy none`。

安装时如果需要 trace，可以传 `--trace jaeger`。安装器会启动一个 Jaeger all-in-one 容器，把
Appaloft 的 OTLP endpoint 指到内部 collector `http://jaeger:4318`，并把 trace link 写回
Jaeger UI。UI 默认绑定在 `127.0.0.1:16686`；需要从运维网络直接访问时，可以用 SSH tunnel，
或显式覆盖 `--jaeger-ui-host` 和 `--jaeger-ui-port`。Console 发起部署时会读取响应里的 trace
link，并在部署进度弹窗里显示可打开的 Jaeger 链接；如果 Jaeger 通过其它域名公开，请把
`APPALOFT_TRACE_LINK_BASE_URL` 设为这个外部 URL。

首次安装后，使用安装器创建本地管理员并登录 console。管理员 email、生成的一次性密码、OAuth
可选配置和恢复步骤见 [First admin bootstrap](/docs/self-hosting/first-admin-bootstrap/)。

如果主机已经是 Docker Swarm manager，可以把 console 安装成 Swarm stack：

```sh
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --database pglite --orchestrator swarm --stack-name appaloft
```

只有在明确希望安装器初始化单节点 Swarm manager 时，才加 `--swarm-init`。
