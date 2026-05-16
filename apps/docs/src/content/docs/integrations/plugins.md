---
title: "Plugins"
description: "理解 plugin 发现、兼容性、权限和沙箱假设。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "plugin"
  - "extension"
  - "compatibility"
  - "插件"
relatedOperations:
  - system.plugins.list
sidebar:
  label: "Plugins"
  order: 3
---

<h2 id="advanced-plugin-boundary">Plugin 边界</h2>

Plugin 扩展能力必须显式声明。用户文档应说明兼容性、权限和沙箱假设。

<h2 id="plugin-safety">安全假设</h2>

插件文档应说明它能读取什么、修改什么、如何禁用，以及不兼容时用户会看到什么状态。

`appaloft plugins list` 和 `GET /api/plugins` 会暴露安全的 plugin 诊断信息。每个 plugin 可以返回 manifest capability 标记、面向用户的能力详情、启用状态、兼容性状态和配置诊断。

不兼容的 plugin 应保持可见但不可激活，方便 operator 区分“extension 不可用”和“未知 plugin”。Plugin 诊断不应暴露 plugin 实现内部、provider SDK 对象、access token、private key、secret reference 或原始 runtime 输出。

<h2 id="server-composition-extensions">Server composition extensions</h2>

需要组合 Appaloft 和额外 runtime 行为的 integrator，应导入公开 server factory，而不是导入 app 源码路径：

```ts
import { createAppaloftServer } from "@appaloft/server";

const server = await createAppaloftServer({
  extensions: [
    {
      name: "health-extension",
      http: {
        routes: [
          {
            method: "GET",
            path: "/extension/health",
            handle: () => new Response("ok"),
          },
        ],
      },
    },
  ],
});
```

`@appaloft/server` 会创建 server composition、dependency container、HTTP app 和 lifecycle methods。Extension 可以添加 HTTP routes 或 middleware、提供 system plugins、替换 auth runtime，并通过 container hooks 覆盖 provider、adapter 或 runtime registrations。Extension 行为应保持 provider-neutral，并从 operator 视角说明新增的 routes、middleware、plugins 或 adapters。
