# Appaloft Appaloft

Appaloft是一个 AI Native、本地优先、后端优先的本地到云部署平台，目标是让开发者把本地工作区、本地 Git 仓库、GitHub 仓库、zip、Docker 镜像或 Compose 文件一键部署到自己的服务器。

它不是“网页后台为主、CLI 为辅”的产品。当前仓库从第一天就按下面的原则组织：

- `CLI`、`HTTP API`、未来 `MCP tools` 与 Web UI 平级
- Web 只是 static interface，不承载核心业务
- source detect、runtime plan、environment snapshot、deploy/rollback 才是系统核心

## 当前里程碑

Milestone 1 已打通：

- Bun + TypeScript strict + Turborepo Monorepo
- `apps/shell` 作为组合入口，承载 backend runtime 和 CLI
- `apps/web` 作为 SvelteKit static 控制台
- `apps/web` 已通过 `@appaloft/orpc/client` + `@tanstack/svelte-query` 消费后端业务接口
- Elysia API 提供 health/readiness/version 与最小项目、服务器、环境、部署接口
- Kysely 持久化已同时支持外部 PostgreSQL 与嵌入式 PGlite 两种模式
- 默认 self-hosted 模式无需登录；进入 hosted-control-plane 模式后，GitHub 授权会在真正需要导入 GitHub 仓库时再触发
- Environment 作为一等领域对象，具备 snapshot、diff、promote、secret masking
- 部署执行器不是“直接返回 success”，而是有状态的 fake execution backend
- GitHub integration skeleton、Generic SSH provider skeleton、plugin host skeleton 已落地
- 已包含 release artifacts、Dockerfile、Compose、自测脚本与 GitHub Actions

## 快速开始

以 self-hosted Docker stack 运行 Appaloft：

```bash
curl -fsSL https://appaloft.com/install.sh | sudo sh
```

固定发布镜像版本：

```bash
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --version 0.2.1
```

公开 installer 会在 Linux 上安装或校验 Docker Engine 和 compose plugin，在 `/opt/appaloft` 写入
self-hosted Compose stack，并启动 Appaloft 后端、static console 和 PostgreSQL。生产机器如果要更严格
的安装链路，可以先通过 Docker 官方 package repository 安装 Docker Engine，再用
`--skip-docker-install` 只做校验和启动。

## 本地开发启动

1. 安装依赖

```bash
bun install
```

2. 选择数据库模式

```bash
# 本地开发默认推荐嵌入式 PGlite
export APPALOFT_DATABASE_DRIVER=pglite

# 或切到外部 PostgreSQL
# docker compose -f docker-compose.dev.yml up -d
# export APPALOFT_DATABASE_DRIVER=postgres
# export APPALOFT_DATABASE_URL=postgres://postgres:postgres@localhost:5432/appaloft
```

3. 执行 migration

```bash
bun run db:migrate
```

4. 启动后端

```bash
bun run serve
```

5. 启动前端开发界面

```bash
bun --cwd apps/web run dev
```

## 构建与打包

```bash
bun run build
bun run package:binary-bundle
bun run package:artifacts
bun run checksums
docker build -t appaloft-all-in-one:local .
```

当前 release 产物包含：

- `appaloft-backend`
- `appaloft-web-static`
- `appaloft-binary-bundle`
- `Dockerfile`
- `docker-compose.selfhost.yml`
- `install.sh` Docker self-host installer
- `release-manifest.json`
- `checksums.txt`

## 运行形态

Appaloft当前架构同时支持：

- 前后端分离部署
- All-in-one Docker
- Self-Hosted Docker Compose
- 未来可选 binary mode

必须明确：

- binary 只是分发形态，不代表内嵌数据库
- PostgreSQL 仍然是 Hosted 与标准生产环境的主后端
- PGlite 适用于嵌入式、单实例、文件落盘场景，默认写入平台用户数据目录；只有在需要便携的项目内状态时才设置 `APPALOFT_DATA_DIR=.appaloft/data`
- `appaloft-binary-bundle` 现在会打出单个 Bun 编译可执行文件，并把 web static 与 PGlite runtime 资源一起嵌进去

## 目录概览

```text
apps/
  shell/   后端组合入口、runtime entry、CLI
  web/     static 控制台
packages/
  core/ application/ contracts/ config/ observability/
  persistence/pg/
  adapters/{http-elysia,cli,filesystem,runtime,packaging}/
  providers/{core,generic-ssh,aliyun,tencent}/
  integrations/{core,github,gitlab}/
  plugins/{sdk,host,builtins}/
  ai/mcp/
  testkit/
  ui/
docs/
  架构、环境、测试、运维、发布、安全、ADR
```

## 文档入口

- [英文 README](./README.md)
- [BOOTSTRAP](./docs/BOOTSTRAP.md)
- [ARCHITECTURE](./docs/ARCHITECTURE.md)
- [ENVIRONMENTS](./docs/ENVIRONMENTS.md)
- [PLUGINS](./docs/PLUGINS.md)
- [PROVIDERS](./docs/PROVIDERS.md)
- [TESTING](./docs/TESTING.md)
- [OPERATIONS](./docs/OPERATIONS.md)
- [RELEASE](./docs/RELEASE.md)
- [SECURITY](./docs/SECURITY.md)
- [AGENTS](./AGENTS.md)

## License

Apache-2.0。

本仓库的源代码属于开源版本。Appaloft Cloud 以及其他托管服务专属代码可能会以不同条款单独分发。

Apache-2.0 license 不授予 Appaloft 名称、logo 和相关品牌资产的使用权；参见
[TRADEMARKS.md](./TRADEMARKS.md)。
