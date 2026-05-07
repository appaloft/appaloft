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
