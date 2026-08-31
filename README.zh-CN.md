<div align="center">
  <a href="https://www.appaloft.com">
    <img src="./apps/web/src/lib/assets/appaloft-logo-horizontal.svg" alt="Appaloft" width="360" />
  </a>

  <p><code>/ˌæp əˈlɔːft/</code></p>
  <h3>开源 Railway 替代方案。</h3>
  <p>
    两扇门：<strong>部署</strong> 把文件夹变成线上 URL（Git 可选），或
    <strong>Agent</strong> — 教会你已经在用的 Cursor、OpenCode 和其他已检测到的宿主。
  </p>
</div>

```bash
appaloft up
```

```bash
appaloft setup agent
```

如果还没登录，你会被要求登录。

<div align="center">
  <p>
    <a href="https://www.appaloft.com">官网</a> ·
    <a href="https://docs.appaloft.com">文档</a> ·
    <a href="https://www.appaloft.com/compare/railway">对比 Railway</a> ·
    <a href="https://github.com/appaloft/appaloft/releases/latest">Releases</a> ·
    <a href="./README.md">English</a>
  </p>
  <p>
    这是定位，不是 1:1 替换。
    <a href="https://www.appaloft.com/compare/railway">对比 Railway</a>
    FAQ 写明：Appaloft 不是 Railway 的完整替代。
  </p>
</div>

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

<p align="center">
  <img src="./docs/assets/appaloft-deploy-loop.gif" alt="Appaloft 部署、健康验证和公开 URL 终端演示" width="920" />
</p>

今天就可以从文件夹、Git URL、镜像、Compose 或 zip 部署。Agent Workspace 和 Sandbox
仍是 public alpha。这是一句实话，不是形式化正确性或合规声明。

自己带机器时用 `appaloft server register`。Self-hosted plane 登录时加 `--url`。

## Up 部署

在任意项目目录里执行。Git 可选。一个文件夹就够。成功就是这个应用的一条线上 URL。

```bash
appaloft up
```

目录里有 `public/index.html` 时，`appaloft up --yes` 会自动选 static。
`appaloft deploy` 在 1.x 中仍是同一工作流的受支持兼容写法。

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
appaloft up --config appaloft.yml
```

同一条命令也接受文件夹、Git URL、容器镜像、Compose 文件或 zip：

```bash
appaloft init
appaloft up
appaloft up ./dist --config appaloft.yml
appaloft up https://github.com/acme/web.git
appaloft up ghcr.io/acme/api:1.7.3
appaloft up ./docker-compose.yml
```

想先跑一个已知可用的示例？CLI 装好后再试官方
[`appaloft/examples/hello`](https://github.com/appaloft/examples/tree/main/hello)。它是可选项，
不是第一条命令。

## Agent

`appaloft setup agent` 会教会你已经在用的 Cursor、OpenCode 和其他已检测到的宿主。这是 Agent 门。

```bash
appaloft setup agent
```

它会复制相同的 Skill，并给检测到的宿主写入 token-free Local MCP。Universal 只写 Skill
（`~/.agents`）。存在 `~/.cursor` / `~/.claude` 时写入 Cursor / Claude Code 的 Skill 和 MCP。
OpenCode 在列表里，但默认不勾选；需要 `--agent opencode` 或 sibling 安装。MCP 复用已经登录的
Appaloft profile（`appaloft mcp remote-stdio --profile <active>`）。Token 不会进入编辑器配置。

```bash
# 显式 MCP sibling（OpenCode 需显式安装）
appaloft auth mcp cursor install
appaloft auth mcp claude-code install
appaloft auth mcp opencode install
```

仅复制 Skill / MCP launcher（次要）：`npx skills add` 只复制 Skill，不安装 CLI，也不写 MCP。

```bash
npx skills add appaloft/appaloft --skill appaloft --global --agent codex --copy --yes
npx skills add appaloft/appaloft --skill appaloft --global --agent claude-code --copy --yes
npx skills add appaloft/appaloft --skill appaloft --global --agent opencode --copy --yes
```

```bash
npx @appaloft/mcp
appaloft mcp stdio
```

skill-manager 复制请用 `npx skills list --global --agent <agent>` 确认后新开一个 agent 会话。
让它通过 Appaloft 部署或运维。skill 会约束 agent 走 Appaloft operation，而不是直接调用
Docker、SSH、数据库或云厂商。这是本仓库 CLI 的本地 Agent 门，不是 Cloud 营销站声明。

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
| Local Agent door | `appaloft setup agent` |
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

appaloft up
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
