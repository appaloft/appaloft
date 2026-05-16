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
使用现有 CLI、HTTP API 或 Web Quick Deploy 完成部署。

Skill 的目标是覆盖完整 Appaloft 部署入口，让 agent 优先回答用户真正关心的问题：访问地址、部署状态、日志、诊断摘要和恢复路径。静态输出只是最快的入口之一，不是 skill 的边界。

<h2 id="agent-deploy-install">安装 skill</h2>

推荐安装完整 Appaloft skill：

```bash
npx @appaloft/skills add appaloft
```

只需要部署子协议的 Codex 兼容 skill host 也可以直接安装：

```bash
npx @appaloft/skills install deploy
```

默认安装到 `${CODEX_HOME:-~/.codex}/skills/appaloft-deploy`。如果需要安装到仓库内或其他 agent 的 skill 目录：

```bash
npx @appaloft/skills install deploy --target directory --path ./.agents/skills
```

已有同名 skill 时需要显式传 `--force`。这个安装命令只复制 skill 文件，不会部署应用、创建资源、调用部署 API，也不是
`appaloft deploy` 的包装器。真正的部署发生在 agent host 加载该 skill 后，用户让 agent 执行部署任务时。

<h2 id="agent-deploy-flow">推荐流程</h2>

1. 安全检查来源：只读取项目结构、构建脚本、运行端口、镜像引用、Docker/Compose 配置、静态输出目录和 Appaloft 配置。
2. 选择最小入口：Appaloft config 优先；然后根据证据选择 prebuilt image、Compose、Dockerfile、静态输出、静态源码或 workspace commands。
3. 使用既有操作：在当前可用的 Appaloft 表面中创建或选择项目、服务器、环境和资源，然后发起 `deployments.create`。Shell
   场景可以使用 CLI；Web 或 HTTP/API 场景使用等价的 Resource/Deployment 操作。
4. 输出结果：优先给访问 URL，其次给 deployment id、resource id、日志命令、诊断命令和 recovery readiness 命令。

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

完整规范位于仓库内的 `docs/agent/appaloft-deploy-skill.md`，可安装 skill 位于 npm 包 `@appaloft/skills` 的 `skills/appaloft-deploy` 目录。
