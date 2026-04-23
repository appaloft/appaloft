---
title: "Generated access routes"
description: "理解默认访问地址如何生成以及它依赖哪些条件。"
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "access route"
  - "default url"
  - "generated domain"
  - "访问地址"
relatedOperations:
  - domain-bindings.create
sidebar:
  label: "Generated routes"
  order: 2
---

![Access readiness chain](/docs/diagrams/access-readiness.svg)

<h2 id="access-generated-route">默认访问地址</h2>

默认访问地址是 Appaloft 在没有自定义域名时给资源生成的可访问 URL。它用于第一次验证部署是否真的能从浏览器访问，也用于排查“应用已启动但外部打不开”的问题。

默认访问地址不是部署输入。它来自资源的 network profile、目标服务器的公共入口、代理 readiness 和当前部署状态。

常见使用场景：

- 第一次部署后确认应用是否可访问。
- 自定义域名还没配置完成时先验证资源。
- 排查域名或 TLS 问题时，判断问题是在应用/代理层还是域名层。

<h2 id="access-generated-route-inputs">它依赖哪些输入</h2>

默认访问地址至少依赖这些用户可见输入：

- 资源监听端口和协议，也就是 resource network profile。
- 目标服务器的公共地址或代理入口。
- 服务器代理是否已经 bootstrap 并处于 ready 状态。
- 部署是否已经执行到可验证状态。

如果资源没有明确监听端口，或者代理还没有准备好，Appaloft 可以展示资源和部署状态，但不应该把默认访问地址显示成 ready。

<h2 id="access-generated-route-readiness">Readiness 条件</h2>

默认访问地址 ready 通常意味着：

- 最近一次部署已经执行完成或进入可验证阶段。
- 应用进程正在运行。
- 健康检查通过，或当前资源没有配置强制健康检查。
- 代理知道资源应该被路由到哪个端口。
- 浏览器访问默认 URL 能到达资源，而不是只到达代理本身。

这些状态应该分开展示。应用运行失败、健康检查失败、代理未 ready、DNS/TLS 未 ready 是不同问题，不能被压成一个“访问失败”。

<h2 id="access-generated-route-surfaces">在哪里查看</h2>

Web console 应在资源详情、部署结果和访问区域显示默认访问地址，并在地址旁提供状态和排障入口。

CLI 应在部署成功结果、资源详情或访问相关命令中输出默认访问地址。适合复制给浏览器验证，但不应该要求用户从数据库或日志里找 URL。

HTTP API 应返回访问地址、ready 状态、最近观测时间和失败原因。自动化系统可以根据这些字段决定继续等待、重试检查或提示用户处理。

<h2 id="access-generated-route-troubleshooting">排查顺序</h2>

如果默认访问地址打不开，按这个顺序排查：

1. 查看资源运行状态，确认应用进程是否启动。
2. 查看健康摘要，确认 health profile 是否和实际访问路径一致。
3. 查看服务器代理 readiness，确认代理已安装、已启动、路由已写入。
4. 查看 network profile，确认监听端口和协议正确。
5. 再看自定义域名和证书；默认访问地址失败时，域名层通常不是第一原因。

相关页面：[Health and network profiles](/docs/resources/profiles/health-network/)、[Proxy readiness and terminal sessions](/docs/servers/operations/proxy-and-terminal/)、[Logs and health](/docs/observe/logs-health/)。

CLI 查看示例：

```bash title="查看资源访问摘要"
appaloft resource show res_web
```

健康检查 API 示例：

```http title="Read resource health"
GET /api/resources/res_web/health?checks=true&publicAccessProbe=true
```

```json title="示例响应"
{
  "resourceId": "res_web",
  "runtime": "ready",
  "health": "passing",
  "proxy": "ready",
  "generatedAccess": {
    "url": "https://res-web.203-0-113-10.sslip.io",
    "readiness": "ready"
  }
}
```
