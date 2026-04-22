<div align="center">
  <img src="./apps/web/src/lib/assets/appaloft-logo-horizontal.svg" alt="Appaloft logo" width="360" />
  <p><code>/ˌæp əˈlɔːft/</code></p>
  <p><strong>From localhost to cloud.</strong></p>
  <p>
    一个 AI-native 的部署控制面，把本地目录、Git 仓库、Docker 镜像和 Compose 应用发布到你自己的服务器。
  </p>
  <p>
    <a href="https://www.appaloft.com/zh-CN/">网站</a> ·
    <a href="./README.md">English</a> ·
    <a href="./docs/BOOTSTRAP.md">文档</a> ·
    <a href="https://github.com/appaloft/appaloft/releases/latest">下载</a>
  </p>
</div>

## 快速开始

> 最快路径：先在 Linux 服务器或 VM 上装 self-hosted stack。

```bash
curl -fsSL https://appaloft.com/install.sh | sudo sh
```

固定某个发布版本：

```bash
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --version 0.2.1
```

这个 installer 会安装或校验 Docker Engine 和 Compose plugin，把 self-hosted stack 写到
`/opt/appaloft`，并启动 Appaloft backend、static console 和 PostgreSQL。

## 为什么是 Appaloft

- 把本地目录、本地 Git 仓库、GitHub 仓库、zip、Docker 镜像或 Compose bundle 发到自己的服务器。
- 保持 `CLI`、`HTTP API` 和未来 `MCP tools` 为一等接口。
- 部署流程按后端工作流运行：`detect -> plan -> execute -> verify -> rollback`。
- Web 只是 static console，不是业务核心。

## 本地开发

```bash
bun install
export APPALOFT_DATABASE_DRIVER=pglite
bun run db:migrate
bun run serve
```

另一个终端里启动前端：

```bash
bun --cwd apps/web run dev
```

如果本地要接 PostgreSQL，启动 `docker-compose.dev.yml`，然后设置
`APPALOFT_DATABASE_DRIVER=postgres` 和 `APPALOFT_DATABASE_URL`。

## 文档入口

- [英文 README](./README.md)
- [Bootstrap](./docs/BOOTSTRAP.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Core operations](./docs/CORE_OPERATIONS.md)
- [Providers](./docs/PROVIDERS.md)
- [Plugins](./docs/PLUGINS.md)
- [Testing](./docs/TESTING.md)
- [Release](./docs/RELEASE.md)
- [Security](./docs/SECURITY.md)
- [AGENTS](./AGENTS.md)

## License

Apache-2.0。

本仓库的源代码属于开源版本。Appaloft Cloud 以及其他托管服务专属代码可能会以不同条款单独分发。

Apache-2.0 不授予 Appaloft 名称、logo 和相关品牌资产的使用权；参见
[TRADEMARKS.md](./TRADEMARKS.md)。
