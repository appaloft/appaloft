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

<h2 id="observe-status-first">先看状态</h2>

排查时先确认资源、部署、运行时、代理和访问地址各自的状态。不要只根据一个失败提示判断整个部署失败。

<h2 id="observe-event-timeline">事件时间线</h2>

事件用于解释状态如何变化。用户应关注最近失败阶段、错误代码和是否有可重试提示。
