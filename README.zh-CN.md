<div align="center">
  <a href="https://www.appaloft.com">
    <img src="./apps/web/src/lib/assets/appaloft-logo-horizontal.svg" alt="Appaloft" width="360" />
  </a>

  <p><code>/ˌæp əˈlɔːft/</code></p>
  <h3>开源 Railway 替代方案。</h3>
  <p>
    两扇门。选一扇，立刻开始。
  </p>
  <p>
    <strong>部署</strong> — 一个文件夹变成 URL。Git 可选。<br />
    <strong>Agent</strong> — 教会你已经在用的 coding agent（skill + MCP）。
    <code>appaloft code</code> 占用你的 Sandbox。
    <code>appaloft code --local</code> 是这台 Mac 上的 Scratch。
  </p>
  <p>
    <a href="https://www.appaloft.com">官网</a> ·
    <a href="https://docs.appaloft.com">文档</a> ·
    <a href="https://www.appaloft.com/compare/railway">对比 Railway</a> ·
    <a href="https://github.com/appaloft/appaloft/releases/latest">Releases</a> ·
    <a href="./README.md">English</a>
  </p>
</div>

<p align="center">
  <img src="./docs/assets/appaloft-deploy-loop.gif" alt="Appaloft 部署、健康验证和公开 URL 终端演示" width="920" />
</p>

今天就可以从文件夹、Git URL、镜像、Compose 或 zip 部署。Agent Workspace 和 Sandbox
仍是 public alpha。这是一句实话，不是形式化正确性或合规声明。

## 安装

先装 CLI。部署不需要先装 self-hosted stack。

```bash
npm install -g @appaloft/cli
```

```bash
brew install appaloft/tap/appaloft
```

也可以从 [GitHub Releases](https://github.com/appaloft/appaloft/releases/latest) 下载对应平台
archive。

然后登录。`appaloft login` 默认连 Appaloft Cloud：`https://app.appaloft.com`。Self-hosted
control plane 请加 `--url`。

```bash
appaloft login
appaloft auth status
appaloft context show
```

## 部署

在任意项目目录里执行。Git 可选。

```bash
appaloft deploy .
```

可选的单文件配置：

```yaml
name: my-app
source:
  path: .
runtime:
  method: workspace-commands
  installCommand: bun install --frozen-lockfile
  buildCommand: bun run build
  startCommand: bun run start
network:
  internalPort: 3000
access:
  default: public
```

```bash
appaloft deploy . --config appaloft.yml
```

同一条命令也接受文件夹、Git URL、容器镜像、Compose 文件或 zip：

```bash
appaloft init
appaloft deploy .
appaloft deploy ./dist --config appaloft.yml
appaloft deploy https://github.com/acme/web.git
appaloft deploy ghcr.io/acme/api:1.7.3
appaloft deploy ./docker-compose.yml
```

想先跑一个已知可用的示例？CLI 装好后再试官方
[`appaloft/examples/hello`](https://github.com/appaloft/examples/tree/main/hello)。它是可选项，
不是第一条命令。

要用自己的服务器时再走 BYOS。这不是首页主路径：

```bash
appaloft server register
```

## Agent

教会你已经在用的 coding agent。Appaloft 不替换那个 agent。

安装 Appaloft skill（文档里写明的 host 是 Codex 和 Claude Code）：

```bash
npx skills add appaloft/appaloft --skill appaloft --global --agent codex --copy --yes
```

```bash
npx skills add appaloft/appaloft --skill appaloft --global --agent claude-code --copy --yes
```

用 `npx skills list --global --agent <agent>` 确认后，新开一个 agent 会话。让它通过
Appaloft 部署或运维。skill 会约束 agent 走 Appaloft operation，而不是直接调用 Docker、SSH、
数据库或云厂商。

把 MCP host 指到同一套 operation catalog：

```bash
npx @appaloft/mcp
appaloft mcp stdio
appaloft mcp serve --host 127.0.0.1 --port 3939
```

```bash
appaloft auth mcp login
appaloft auth mcp codex install
```

占用是另一扇门。登录后，`appaloft code` 占用你已登记服务器上的 Sandbox。
`appaloft code --local` 是这台 Mac 上的 Scratch：不登录、不建 Sandbox、也不远程保存。
Railway 风格的占用会把你放进托管 code-server / `ca` 式会话；Appaloft 占用的是*你的*
Sandbox，或本机 Scratch。

```bash
appaloft code
appaloft code --local
```

## Self-host（可选）

Linux control plane installer 是可选项。只有你想自己跑 Appaloft 时才从这里开始。

```bash
curl -fsSL https://appaloft.com/install.sh | sudo sh
```

固定某个发布版本：

```bash
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --version 1.9.2
```

这个 installer 会安装或校验 Docker Engine 和 Compose plugin，把 stack 写到 `/opt/appaloft`，
并启动 Appaloft backend、static console 和 PostgreSQL。

| 入口 | 命令 |
| --- | --- |
| npm CLI | `npm install -g @appaloft/cli` |
| Homebrew CLI | `brew install appaloft/tap/appaloft` |
| GitHub Release | 从 [latest releases](https://github.com/appaloft/appaloft/releases/latest) 下载对应平台 archive。 |
| MCP launcher | `npx @appaloft/mcp` |
| AI skill | `npx skills add appaloft/appaloft --skill appaloft --global --agent codex --copy --yes` |
| Self-hosted server | `curl -fsSL https://appaloft.com/install.sh \| sudo sh` |
| Self-hosted + PGlite | `curl -fsSL https://appaloft.com/install.sh \| sudo sh -s -- --database pglite` |
| Self-hosted + 域名 | `curl -fsSL https://appaloft.com/install.sh \| sudo sh -s -- --domain console.example.com` |
| Docker image | `docker pull ghcr.io/appaloft/appaloft:latest` |
| 源码运行 | `bun install && bun run --cwd apps/shell src/index.ts --help` |

## 常用 CLI

部署、观察、恢复。完整命令列表：
[skills/appaloft/references/cli-entrypoints.md](./skills/appaloft/references/cli-entrypoints.md)。

```bash
appaloft --version
appaloft auth status
appaloft context show

appaloft deploy .
appaloft deployments list
appaloft deployments show <deploymentId>
appaloft deployments timeline <deploymentId> --follow --json
appaloft deployments retry <deploymentId>
appaloft deployments redeploy <resourceId>
appaloft deployments rollback <deploymentId> --candidate <deploymentId>

appaloft resource logs <resourceId>
appaloft resource health <resourceId>
appaloft work list
appaloft work watch <workId> --json

appaloft server register
appaloft server list
appaloft server test <serverId>
```

## GitHub Actions

CI 可以用仓库内置 deploy action 走 pure SSH，或连接 self-hosted Appaloft control plane：

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: appaloft/appaloft/.github/actions/deploy-action@main
        with:
          source: .
          ssh-host: ${{ secrets.APPALOFT_SSH_HOST }}
          ssh-user: root
          ssh-private-key: ${{ secrets.APPALOFT_SSH_PRIVATE_KEY }}
```

## 本地开发

```bash
bun install
export APPALOFT_DATABASE_DRIVER=pglite
bun run db:migrate
bun run dev
```

如果本地要接 PostgreSQL，启动 `docker-compose.dev.yml`，然后设置
`APPALOFT_DATABASE_DRIVER=postgres` 和 `APPALOFT_DATABASE_URL`。

```bash
bun run lint:ci
bun run typecheck
bun run test
bun run build
bun run smoke:local:static
```

## 仓库结构

| 路径 | 用途 |
| --- | --- |
| `apps/shell` | CLI 和本地 server runtime 入口。 |
| `apps/web` | Static web console。 |
| `apps/docs` | Public documentation site。 |
| `packages/application` | Command/query handlers 和 operation catalog。 |
| `packages/adapters` | CLI、HTTP、persistence、runtime、provider adapters。 |
| `packages/ai/mcp` | MCP server transport。 |
| `packages/npm` | npm CLI 和 MCP launcher packages。 |
| `skills/appaloft` | 面向 AI 的 Appaloft skill 和 reference。 |
| `docs` | Architecture、operations、ADR、spec 和 release docs。 |

## 文档入口

- [文档](https://docs.appaloft.com)
- [第一次部署](https://docs.appaloft.com/start/first-deployment/)
- [Agents](https://docs.appaloft.com/agents/overview/)
- [TypeScript SDK](https://docs.appaloft.com/reference/typescript-sdk/)
- [Self-hosting install](https://docs.appaloft.com/self-hosting/install/)
- [Architecture](./docs/ARCHITECTURE.md)
- [Core operations](./docs/CORE_OPERATIONS.md)
- [MCP server](./docs/agent/appaloft-mcp-server.md)
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
