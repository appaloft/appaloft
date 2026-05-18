---
title: "Status and events"
description: "从状态和事件判断部署当前处于哪一步。"
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "status"
  - "events"
  - "deployment status"
  - "状态"
relatedOperations:
  - deployments.show
sidebar:
  label: "Status and events"
  order: 2
---

## 先看状态 [#observe-status-first]

排查时先确认资源、部署、运行时、代理和访问地址各自的状态。不要只根据一个失败提示判断整个部署失败。

状态回答“现在能不能用”，事件回答“为什么变成这样”。排查时把它们放在一起读，才能区分输入错误、执行失败、健康检查失败和访问层未就绪。

| 你看到的信号 | 先检查 |
| --- | --- |
| 部署失败但旧版本仍可访问 | 新部署事件、构建日志、健康检查。 |
| 运行时健康但域名不可访问 | 代理状态、DNS、TLS 证书、路由规则。 |
| Preview 页面不存在 | pull request 状态、preview 清理事件、部署 artifact。 |
| 状态长时间 pending | 运行任务、服务器连接、最近一次事件时间。 |

> 提示：如果状态和事件看起来冲突，以事件时间线确认最后一次成功改变了什么，再决定是等待、重试还是回滚。

## 事件时间线 [#observe-event-timeline]

事件用于解释状态如何变化。用户应关注最近失败阶段、错误代码和是否有可重试提示。

## 找到当前对象 [step]

先确认你正在查看的是项目、环境、资源、部署还是 preview。不同对象的状态可能不同，不要把 preview 的失败当成生产环境失败。

## 读取最后一次变化 [step]

查看最新事件的阶段、时间和错误代码。如果最后事件只是“已接收请求”，继续查看运行中任务；如果最后事件已经失败，进入恢复流程。

## 对照健康摘要 [step]

健康摘要说明运行时、代理和访问地址的当前状态。事件解释历史，健康摘要解释当前观察结果。

## 记录恢复证据 [step]

重试或回滚前记录失败状态、错误代码、相关日志和访问地址。恢复后用同一组信息确认状态确实改变。
