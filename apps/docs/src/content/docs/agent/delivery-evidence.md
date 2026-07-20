---
title: "Delivery Evidence Chain"
description: "理解从不可变候选到 Deployment Proof 的证据链和声明边界。"
docType: concept
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["delivery proof", "deployment proof", "verified production"]
relatedOperations: [sandboxes.promotions.show, deployments.proof, deployments.show]
sidebar: { label: "Delivery Evidence Chain", order: 3 }
---

# 交付证据链

Appaloft 保存并读取以下关联：Source Artifact digest → verified Candidate Preview → accepted Promotion
→ created Resource → first Deployment → Deployment Proof。Promotion 只有在公开 proof verdict 为
`verified` 后才成为 `completed`；proof 仍 pending 时 durable worker 继续轮询，终态失败则保留
Resource、Deployment 和错误 checkpoint 供重试或诊断。

这条链证明的是 Appaloft 观察到的交付事实，例如部署执行、运行时身份、路由、健康和内容关联证据。
它不证明 Agent 生成的程序在形式上正确、安全、无漏洞或满足某项合规制度。需要这些保证时，仍应把
测试、review、扫描、policy 和人工批准作为独立 gate。
