---
title: "Agent deploy skill"
description: "让 AI agent 通过 Appaloft 安全部署 Web、服务、镜像、Compose、worker 和静态站点。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "agent deploy"
  - "AI deploy"
  - "skill"
  - "AI 部署"
relatedOperations:
  - projects.create
  - servers.register
  - resources.create
  - deployments.create
sidebar:
  label: "Agent deploy skill"
  order: 1
---

<h2 id="agent-deploy-skill">Agent 部署协议</h2>

Appaloft Deploy Skill 是完整 [Appaloft Skill](/docs/agent/appaloft-skill/#appaloft-skill)
中的部署子协议。它不是新的部署操作，也不是 MCP 的替代实现；它是一套给 AI agent 使用的用户层协议，让 agent
使用现有 CLI、HTTP API、Web Quick Deploy 或 [MCP tools](/docs/agent/mcp-server/#appaloft-mcp-tools)
完成部署。

Skill 的目标是覆盖完整 Appaloft 部署入口，让 agent 优先回答用户真正关心的问题：访问地址、部署状态、日志、诊断摘要和恢复路径。静态输出只是最快的入口之一，不是 skill 的边界。GitHub Action 部署时，agent 还必须先区分 Pure SSH Action、Self-hosted Server Action 和 Product-grade Preview，不要把三者混成一个配置模板。

<h2 id="agent-deploy-install">安装 skill</h2>

推荐安装完整 Appaloft skill：

```bash
npx skills add appaloft/appaloft
```

安装命令只复制完整 Appaloft skill，不会部署应用、创建资源、调用部署 API，也不是
`appaloft deploy` 的包装器。部署子协议属于完整 skill 内部能力，不提供单独的 npm installer。

<h2 id="agent-deploy-flow">推荐流程</h2>

1. 安全检查来源：只读取项目结构、构建脚本、运行端口、镜像引用、Docker/Compose 配置、静态输出目录和 Appaloft 配置。
2. 选择最小入口：Appaloft config 优先；然后根据证据选择 prebuilt image、Compose、Dockerfile、静态输出、静态源码或 workspace commands。
3. 使用既有操作：在当前可用的 Appaloft 表面中创建或选择项目、服务器、环境和资源，然后发起 `deployments.create`。Shell
   场景可以使用 CLI；Web 或 HTTP/API 场景使用等价的 Resource/Deployment 操作。
4. 输出结果：优先给访问 URL，其次给 deployment id、resource id、日志命令、诊断命令和 recovery readiness 命令。

<h2 id="agent-deploy-action-modes">GitHub Action 部署模式</h2>

- Pure SSH Action：默认 `control-plane-mode: none`，Action 安装/运行 CLI，通过 SSH 部署，SSH 目标使用 server-owned `ssh-pglite` 状态。不要要求 Appaloft console、deploy token、project id、resource id 或 server id。
- Self-hosted Server Action：已有 self-hosted Appaloft console/API 拥有状态。Action 只调用由 `control-plane-url` 显式选择的 server API，必须使用 `appaloft-token`，不运行 CLI、不打开 SSH。优先使用 `server-config-deploy: true`，让 server 读取 `appaloft.yml` 并应用 profile/env/domain 后再 dispatch ids-only deployment。
- Product-grade Preview：由 Appaloft Cloud 或 self-hosted control plane 拥有 preview policy、GitHub App webhook、comments/checks、cleanup retry、scheduler、audit 和 quota。它不是用户自己维护 workflow file 的 Action-only PR preview。

如果缺少 source-link 或 repository binding，agent 应提示建立绑定，或运行一次 trusted bootstrap context。Project/resource/server ids 只适合首次 bootstrap、advanced override 或 debug，不是普通用户默认要提供的输入。

<h2 id="agent-deploy-safety">安全边界</h2>

- 不读取 `.env`、私钥、token 文件或云厂商凭据文件。
- 不把 secret 明文写进日志、PR、诊断摘要或聊天回复。
- 不绕过 Appaloft 直接操作 Docker、SSH、数据库或 provider SDK。
- 不把 source、runtime、network 字段塞进 `deployments.create`；这些属于 Resource profile 和部署快照。
- 不假设 Appaloft 会把产物上传到托管云。默认仍然部署到用户选择的 BYOS 目标。

<h2 id="agent-deploy-follow-up">完成后要返回什么</h2>

Agent 应返回一份短结果：

- access URL，或说明它还不可用；
- deployment id 和 resource id；
- 当前 lifecycle status；
- `appaloft logs <deploymentId>`；
- `appaloft resource diagnose <resourceId>`；
- `appaloft deployments recovery-readiness <deploymentId>`。

如果失败，agent 应先读取结构化错误、日志、诊断摘要和 recovery readiness，再给下一步操作。

<h2 id="agent-deploy-reference">规范文档</h2>

完整规范位于仓库内的 `docs/agent/appaloft-deploy-skill.md`。可安装的完整 skill 位于
`skills/appaloft`，部署子协议位于 `skills/appaloft/references/deploy-protocol.md`。
