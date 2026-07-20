---
title: "Appaloft skill"
description: "让 AI agent 像使用 CLI、HTTP API、Web 或 MCP 一样使用完整 Appaloft 能力。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "appaloft skill"
  - "AI entrypoint"
  - "AI 入口"
  - "完整 skill"
relatedOperations:
  - deployments.create
  - resources.create
  - servers.register
  - domain-bindings.create
  - dependency-resources.provision
sidebar:
  label: "Appaloft skill"
  order: 0
---

<h2 id="appaloft-skill">Appaloft AI 入口</h2>

Appaloft Skill 是面向 AI agent 的完整产品入口。它和 CLI、HTTP API、Web console、MCP
工具一样，都映射到同一套 Appaloft operation catalog；区别只是它的使用者是 AI。

它不是新的业务操作，也不是 `appaloft deploy` 包装器。它把用户意图翻译成既有 Appaloft 操作，并根据当前环境选择 CLI、HTTP/API、Web 或 MCP 表面。MCP 配置好时，skill 可以把它作为 callable tool layer；未配置 MCP 时，skill 仍可通过 CLI、HTTP/API 或 Web 工作。

GitHub Action 场景中，skill 必须区分三种模式：Pure SSH Action 是默认 BYOS SSH 路径，不需要
Appaloft console 或 ids；Self-hosted Server Action 通过 `control-plane-url` 和 `appaloft-token`
调用已有 self-hosted console/API，Action 不运行 CLI、不 SSH；Product-grade Preview 由 Appaloft
Cloud 或 self-hosted control plane 拥有 preview policy、GitHub App webhook、comments/checks、
cleanup retry、scheduler、audit 和 quota。

需要 hosted Cloud 或 self-hosted Appaloft 上下文时，agent 应先检查 `appaloft auth status`、
`appaloft context show` 和 `APPALOFT_TOKEN`。没有 active profile/token 时，不要默认让 agent
打开浏览器、复制 user code 或读取 cookie；应让用户通过可信 UI、secret manager、环境变量或
CLI-approved handoff 授权 scoped、可过期 token，然后使用 `APPALOFT_TOKEN` 或
`appaloft auth token login --stdin` / `--token-file <path>` 让 CLI 自己验证并写入本机 profile。

<h2 id="appaloft-skill-install">安装</h2>

推荐安装完整 Appaloft skill：

```bash
# Codex
npx skills add appaloft/appaloft --skill appaloft --global --agent codex --copy --yes

# Claude Code
npx skills add appaloft/appaloft --skill appaloft --global --agent claude-code --copy --yes
```

安装命令只复制 skill 文件，不会部署应用、创建资源、调用 API，也不会包装 CLI。Appaloft 不提供单独的 npm skill installer，避免和 `appaloft` CLI 边界混淆。

运行 `npx skills list --global --agent codex` 或
`npx skills list --global --agent claude-code` 确认列表中有 Appaloft；同时确认 Codex 的
`~/.agents/skills/appaloft/SKILL.md` 或 Claude Code 的 `~/.claude/skills/appaloft/SKILL.md`
存在。然后新开一个 agent 会话，让宿主重新加载 skill 目录。

<h2 id="appaloft-skill-scope">能力范围</h2>

完整 skill 覆盖 Appaloft CLI operation catalog 中的所有入口，包括：

- 项目、服务器、环境和资源生命周期；
- source/runtime/network/health/access/variable/resource profile 配置；
- deploy、preview cleanup、plan、logs、events、retry、redeploy、rollback；
- domain binding、certificate、default access；
- dependency resources、backup/restore、resource dependency binding；
- storage volumes、scheduled tasks、runtime control、terminal sessions；
- runtime usage、runtime monitoring、operator work、audit events、retention；
- organization、auth bootstrap、deploy tokens、providers、plugins、upgrade、database maintenance。

完整 CLI 映射随安装包一起发布在 `skills/appaloft/references/cli-entrypoints.md`。

<h2 id="appaloft-skill-evals">最佳实践校验</h2>

Appaloft skill 遵循 Agent Skills 的渐进披露原则：`SKILL.md` 保持短小，长命令表、部署协议和
MCP 指引放在一层 `references/` 中。为了避免 skill 变成泛泛而谈的部署说明，仓库还维护
`skills/appaloft/evals/evals.json`。

这组 eval 来自公开文档、workflow、test matrix 和 operation catalog，覆盖真实 Appaloft
任务族：项目生命周期、保存/注册并管理 server、server readiness/capacity/proxy maintenance、SSH
credential、环境、Resource profile、Resource secrets/effective config、首次部署、部署观测和恢复、
domain/TLS、generated default access 和 route diagnostics、dependency resource、storage、scheduled
task、runtime monitoring、runtime control、terminal session、source link、preview、source-event
auto-deploy diagnostics、static artifact、audit/retention、组织和 deploy token、system capabilities/
maintenance、MCP，以及拒绝读取 secret 或绕过 Appaloft 的反例。

维护 skill 时先运行：

```bash
bun run scripts/validate-appaloft-skill-evals.ts
```

发布准备或 nightly 手动检查时，可以用真实模型跑同一组案例。该检查需要模型 provider key，因此不作为
默认 PR gate：

```bash
bun run scripts/run-appaloft-skill-model-evals.ts --model gpt-5-mini
```

也可以用 DeepSeek 的 OpenAI-compatible API：

```bash
DEEPSEEK_API_KEY=... bun run scripts/run-appaloft-skill-model-evals.ts \
  --provider deepseek \
  --model deepseek-v4-flash
```

GitHub Actions 不会在普通 PR 自动跑真实模型 eval。需要先把 `DEEPSEEK_API_KEY` 或
`OPENAI_API_KEY` 配成 repository secret，再手动触发 `Appaloft Skill Model Evals` workflow 作为
release readiness 检查。

如果只想验证 prompt 构建而不调用模型，可加 `--dry-run`。

<h2 id="appaloft-skill-mcp">MCP 工具</h2>

MCP 是 Appaloft 的机器可调用工具层。运行 `appaloft mcp stdio` 可以启动 stdio MCP server；
运行 `appaloft mcp serve` 可以启动本地 HTTP `/mcp` endpoint；`npx appaloft-mcp` 则提供独立
launcher。每个 tool 都由 operation key 生成，例如 `deployments.create` 对应 `deployments_create`。
Tool 输入 schema 来自同一套 command/query schema，调用仍进入 Appaloft command/query bus。

查看 [Appaloft MCP server](/docs/agent/mcp-server/#appaloft-mcp-server) 了解工具命名、resources、prompts
和安全边界。

<h2 id="appaloft-skill-safety">安全边界</h2>

- 不读取 `.env`、私钥、token 文件内容、云厂商凭据、deploy token、SSH material、cookie 或未脱敏 secret。
- 不让用户把 product-session cookie、bearer token、deploy token、browser cookie 或 token 文件内容粘贴进 chat；token 只能通过 CLI/env/secret manager 等可信 handoff 进入。
- 不绕过 Appaloft 直接操作 Docker、SSH、数据库、proxy 或 provider SDK。
- 不创造 agent-only operation；所有行为必须映射到既有 CLI/API/Web/MCP operation。
- 不假设产物上传到托管云；默认仍部署到用户选择的 BYOS 目标。

<h2 id="appaloft-skill-reference">规范文档</h2>

完整规范位于 `docs/agent/appaloft-skill.md`。标准 skill source 位于仓库根目录
`skills/appaloft`，部署子协议和入口边界分别位于 `skills/appaloft/references/deploy-protocol.md`
和 `skills/appaloft/references/surfaces.md`。
