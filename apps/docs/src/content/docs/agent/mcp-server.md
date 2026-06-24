---
title: "Appaloft MCP server"
description: "让 MCP client 使用 Appaloft operation catalog 中的真实部署、配置、观察和恢复工具。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "mcp"
  - "mcp server"
  - "appaloft mcp"
  - "AI tools"
relatedOperations:
  - deployments.create
  - deployments.plan
  - resources.configure-source
  - resources.diagnostic-summary
  - system.doctor
sidebar:
  label: "MCP server"
  order: 2
---

<h2 id="appaloft-mcp-server">Appaloft MCP server</h2>

Appaloft MCP server 是 Appaloft 的可调用工具入口。它把现有 operation catalog 暴露给 MCP
client，不创建新的 AI-only 业务模型。Skill 负责流程判断；MCP 负责在已配置工具时执行精确的
command/query 调用。

启动 stdio server：

```bash
appaloft mcp stdio
```

启动 server 本身不会部署应用、创建资源或修改状态。只有 MCP client 调用具体 tool 时才会进入
Appaloft command/query bus。

启动本地 HTTP endpoint：

```bash
appaloft mcp serve --host 127.0.0.1 --port 3939
```

这会在 `/mcp` 暴露 HTTP JSON-RPC MCP endpoint。默认只绑定 localhost；只有在可信 reverse proxy 或私有网络提供安全边界时才显式改 host。

使用独立 launcher：

```bash
npx appaloft-mcp
npx appaloft-mcp serve --host 127.0.0.1 --port 3939
```

`appaloft-mcp` 会委托给同一套 Appaloft runtime，不维护第二套 operation list 或业务实现。

<h2 id="appaloft-mcp-tools">工具模型</h2>

每个 tool 都对应一个 operation key：

- `deployments.create` -> `deployments_create`
- `deployments.plan` -> `deployments_plan`
- `resources.configure-source` -> `resources_configure_source`
- `runtime-monitoring.samples.list` -> `runtime_monitoring_samples_list`
- `system.doctor` -> `system_doctor`

Tool descriptor 来自 `packages/application/src/operation-catalog.ts`，输入 JSON schema 来自同一个
command/query Zod schema。Command 通过 `CommandBus.execute`，Query 通过 `QueryBus.execute`，
并使用 `entrypoint: "mcp"`。

Tool descriptor 会带 MCP annotations，标记 query 只读、破坏性 command、幂等 query，以及部署类操作可能触达外部系统。Tool response 同时返回 JSON text 和 structured content，兼容旧 MCP client 和支持结构化结果的新 host。

不存在 `quick_deploy_create` 这类 agent-only 工具。如果某个行为不在 operation catalog 中，就不是
Appaloft MCP operation。

<h2 id="appaloft-mcp-resources">资源和 prompts</h2>

只读 resources：

- `appaloft://operation-catalog`
- `appaloft://tools/high-value`
- `appaloft://skill/appaloft`
- `appaloft://skill/deploy-protocol`
- `appaloft://tools/mcp-guide`
- `appaloft://docs/agent`

Prompts：

- `appaloft-first-deploy`
- `appaloft-recover-deployment`
- `appaloft-configure-resource`
- `appaloft-observe-runtime`
- `appaloft-publish-static-artifact`

Resources 和 prompts 只提供上下文和 workflow 起点，不拥有写侧策略、租户选择、后台任务或隐藏状态。

<h2 id="appaloft-mcp-safety">安全边界</h2>

- 不绕过 Appaloft 直接调用 repository、use case、provider SDK、Docker、SSH、proxy 或数据库。
- 不读取或输出 `.env`、私钥、token、cookie、database URL、云厂商凭据、raw secret 或未脱敏日志。
- 鉴权、tenant context、operation guard、确认字段、redaction 和结构化错误都保留在既有 runtime 边界。
- 删除和破坏性操作仍必须使用对应 schema 中的 delete-safety 和 exact confirmation 字段。

<h2 id="appaloft-mcp-skill">和 skill 的关系</h2>

Appaloft Skill 是 agent 的流程协议：识别意图、选择 CLI/API/Web/MCP 表面、按顺序调用既有操作，并组织最终回复。MCP 是 callable tool layer：当 host 已配置 Appaloft MCP 时，skill 可以优先使用工具调用。

用户说 `/appaloft help me deploy this repo` 时，`/appaloft` 是 host 的 skill invocation phrase，不是 Appaloft CLI 命令。加载 skill 后，再根据当前 session 是否有 MCP tools 决定使用 MCP、CLI、HTTP/API 或 Web。
