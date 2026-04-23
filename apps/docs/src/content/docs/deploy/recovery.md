---
title: "Deployment recovery"
description: "重新关联来源、清理 preview 部署，并决定重试、修复或回滚。"
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "relink"
  - "preview cleanup"
  - "retry"
  - "rollback"
  - "恢复"
relatedOperations:
  - source-links.relink
  - deployments.cleanup-preview
sidebar:
  label: "Recovery"
  order: 4
---

<h2 id="deployment-source-relink">重新关联部署来源</h2>

当资源或部署记录指向的来源不再可访问，或者用户需要把资源切换到新的仓库、路径或镜像时，source relink 是显式恢复动作。

执行前确认目标资源、当前来源、新来源和预期环境。执行后通过下一次部署或资源详情确认 Appaloft 读取的是新的来源。

不要把 relink 当成普通重试。Relink 会改变后续部署读取的 source，适合处理仓库迁移、目录重组、镜像来源变化或本地 source 指纹失效。

<h2 id="deployment-preview-cleanup">清理 Preview 部署</h2>

Preview cleanup 用于删除某个 pull request、分支或临时来源产生的预览部署。清理对象必须由 preview 类型和 preview id 定位，不能误删生产环境或普通部署历史。

清理后应检查：

- 预览部署实例是否停止。
- 预览访问地址是否不再展示为有效入口。
- 生产部署和普通历史记录是否未被影响。
- 后续同一 preview id 是否可以重新创建。

<h2 id="deployment-retry-or-rollback">重试还是回滚</h2>

输入校验失败应先修正输入。执行阶段临时失败可以重试。verify 失败要先看健康摘要和日志，再决定修复配置、重试或回滚。

推荐判断：

| 现象 | 优先动作 |
| --- | --- |
| source 无法读取 | 修 source 或 relink。 |
| runtime/profile 不匹配 | 修资源 profile 后重新部署。 |
| SSH 或服务器执行失败 | 运行连接测试，查看服务器诊断。 |
| 应用启动但健康检查失败 | 查看日志和 health profile。 |
| 默认访问地址失败 | 查看 proxy readiness 和 network profile。 |
| 自定义域名失败 | 先验证默认访问地址，再看 DNS/TLS。 |

<h2 id="deployment-recovery-surfaces">入口差异</h2>

Web console 应把恢复动作放在资源、部署或访问状态附近。CLI 适合 preview cleanup、source relink 和重试。HTTP API 应暴露可机器判断的状态、错误 code 和恢复建议。

恢复动作不应该要求用户直接修改数据库或手动删除运行时状态。
