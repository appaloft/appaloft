---
title: "TypeScript SDK reference"
description: "TypeScript SDK 安装、认证、操作调用、错误和流式事件的公开入口。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "sdk"
  - "typescript"
  - "client"
  - "automation"
  - "typed errors"
  - "streaming"
  - "TypeScript SDK"
relatedOperations:
  - projects.create
  - organizations.current-context
  - deployments.timeline.stream
sidebar:
  label: "TypeScript SDK"
  order: 11
---

## 操作客户端 [#typescript-sdk-operation-client]

`@appaloft/sdk` 是面向自动化和集成的操作客户端。它调用 Appaloft HTTP/oRPC API，不嵌入应用运行时，也不暴露内部 use case、repository、handler 或领域对象。

SDK 方法必须来自 OpenAPI SDK contract 以及 `x-appaloft-*` operation metadata。不要为 SDK 单独添加业务方法；如果需要新的业务能力，应先添加或扩展 operation catalog 中的 command/query。

## 安装和配置 [#typescript-sdk-install]

SDK 发布后，Node、Bun 或浏览器自动化可以安装 `@appaloft/sdk`，然后创建一个带 `baseUrl` 的客户端。

```ts
import { createAppaloftClient } from "@appaloft/sdk";

const appaloft = createAppaloftClient({
  baseUrl: "https://appaloft.example/api",
});
```

`baseUrl` 应指向同一个 Appaloft 实例的 `/api` 根路径。自托管环境应优先使用安装脚本打印的控制台/API 地址。

## 认证 [#typescript-sdk-authentication]

交互式产品操作使用产品会话 cookie。机器自动化使用 deploy token bearer credential。不要把 deploy token 写入仓库配置文件；在 CI 中应通过受信任的 secret 或环境变量注入。

```ts
const productClient = createAppaloftClient({
  baseUrl: "https://appaloft.example/api",
  auth: {
    kind: "product-session",
    cookie: "better-auth.session_token=...",
  },
});

const actionClient = createAppaloftClient({
  baseUrl: "https://appaloft.example/api",
  auth: {
    kind: "deploy-token",
    token: process.env.APPALOFT_TOKEN ?? "",
  },
});
```

组织范围通过具体 operation 的 path、query 或 body 字段传递，例如 `organizationId`。切换当前组织仍应调用公开的组织切换操作，而不是在 SDK 内维护隐藏状态。

## 操作示例 [#typescript-sdk-operation-examples]

每个 SDK 调用应对应一个 operation key。输入字段来自同一个 command/query schema，输出来自 HTTP/oRPC contract。

```ts
const created = await appaloft.projects.create({ name: "Demo" });
const listed = await appaloft.projects.list({ limit: 20 });
const shown = await appaloft.projects.show({ projectId: "prj_123" });

const plan = await appaloft.dependencyResources.provisioning.plan({
  projectId: "prj_123",
  environmentId: "env_123",
});

if (!created.ok) {
  // created.error 是结构化 Appaloft 错误。
  throw new Error(created.error.code);
}
```

facade 名称从 operation key 生成：kebab-case 转为 camelCase，点号转为嵌套分组。例如 `dependency-resources.provisioning.plan` 会生成 `dependencyResources.provisioning.plan`。

path 参数可以作为顶层字段传入。剩余字段在 `GET`、`DELETE` 和流式 operation 中默认进入 query；在其他 operation 中默认进入 JSON body。集成代码需要精确控制拆分时，可以显式传入 `pathParams`、`query` 或 `body`。

operation descriptor 是生成器内部元数据。公开 SDK 调用方应使用 facade 方法，不需要手工传入 operation metadata。

SDK 是 API 边界测试和外部自动化的合适入口。领域规则、应用 handler、repository 或 adapter 单元测试仍应在它们各自的层级测试。

## Sandbox 资源句柄 [#typescript-sdk-resource-handles]

Sandbox 所有权链使用资源句柄，调用方不需要重复传递父级 id：

```ts
const sandbox = await appaloft.sandboxes.create(sandboxInput);

try {
  const agent = await sandbox.agents.create({ harness: "pi" });
  const run = await agent.stream({ prompt: "Analyze and update the workspace" });

  for await (const envelope of run.fullStream) {
    if (envelope.kind === "event") console.log(envelope.eventType, envelope.data);
    if (envelope.kind === "error") throw new Error(envelope.code);
  }
} finally {
  await sandbox.terminate();
}
```

`Agent` 是 Sandbox Agent Runtime 的 SDK 别名。Pi 简写默认使用已准入的
`aht_pi_managed_v1` harness template、fresh Run context 和自动生成的 idempotency key；显式传入
`harnessTemplateId`、`context` 或 `idempotencyKey` 会覆盖这些 SDK 默认值。
`agent.stream({ task })` 会创建一个 Run 并把同一 Run 的持久化事件作为 `fullStream` 返回；
`prompt` 是方便从 AI SDK 迁移的 `task` 别名。Appaloft 不接管聊天会话：调用方仍负责保存消息和
决定何时使用 fresh context 或 `parentRunId` 继续。已有 Run 也可通过
`run.events.list()` 或 `run.events.stream({ afterSequence, signal })` 读取和续接。

Sandbox handle 还提供 `sandbox.files.read/write`、`sandbox.exec` 和 `sandbox.terminate`。这些方法
只注入 handle 自己的 `sandboxId`，底层仍调用 generated public operation。

资源方法直接返回 descriptor，失败时抛出 `AppaloftSdkRequestError`。需要完整且不抛异常的
`{ ok, status, data/error }` facade 时使用 `appaloft.operations`，例如
`appaloft.operations.sandboxes.create(input)`。

## 结构化错误 [#typescript-sdk-errors]

Generated operation 返回稳定的结构化错误字段：`code`、`category`、`message`、`retryable` 和可选
`details`；资源句柄会把相同安全字段暴露在 `AppaloftSdkRequestError` 上。自动化应判断 `code`、
`category` 或 `retryable`，不要解析人类可读的 `message`。

常见认证错误包括：

- `product_auth_missing` 或 `product_auth_invalid`：产品会话缺失、过期或不可验证。
- `product_auth_forbidden`：当前用户不属于目标组织，或角色不足。
- `action_auth_missing` 或 `action_auth_invalid`：Action/deploy-token credential 缺失或无效。
- `action_auth_forbidden`：deploy token 有效，但 scope 不覆盖当前请求。

## 流式事件 [#typescript-sdk-streaming]

只有 OpenAPI metadata 标记为 `x-appaloft-streaming: true` 的 operation 才能使用 SDK stream helper。调用方应传入 `AbortSignal` 来取消长连接，并按结构化 envelope 处理心跳、事件、gap、关闭和错误。

```ts
const controller = new AbortController();

for await (const envelope of appaloft.deployments.streamEvents({
  deploymentId: "dep_123",
  signal: controller.signal,
})) {
  if (envelope && typeof envelope === "object" && "kind" in envelope) {
    // Handle event, heartbeat, gap, closed, or error envelopes.
  }
}
```

当流返回 `closed` 或调用方取消 `AbortSignal` 后，自动化应停止读取并根据需要重新打开流。

流式 facade 方法返回 `AsyncIterable`。它不会把 SDK 改成 throw-only 模式；普通请求 facade 仍返回 `{ ok, status, data }` 或 `{ ok, status, error }`。

当前生成器说明：operation catalog 和 OpenAPI metadata 还没有为每个 generated facade method 暴露足够稳定的 schema 名称来生成逐 operation 的输入/输出别名。TypeScript facade 目前从 operation key 和 route metadata 生成；后续生成器应补充 request、response 和 stream envelope schema id，以便非 TypeScript SDK 也能生成等价的 typed method signature。
