---
title: "Deploy an app"
description: "理解 Appaloft 的部署生命周期：detect、plan、execute、verify、rollback。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "deploy"
  - "deployment"
  - "rollback"
  - "verify"
  - "部署"
  - "回滚"
relatedOperations:
  - deployments.create
  - deployments.cleanup-preview
  - source-links.relink
sidebar:
  label: "Deploy an app"
  order: 3
---

![Appaloft docs surface](/docs/diagrams/docs-surface.svg)

<h2 id="deployment-source">选择部署来源</h2>

部署来源可以是本地目录、Git 仓库、Docker 镜像、Compose 清单或静态站点。这个选择决定 Appaloft 在 detect 阶段读取什么证据，以及后续 plan 阶段会生成哪种运行策略。

Web、CLI 和 HTTP API 应该把 source 输入解释成同一个概念：它描述“要部署什么”，不是项目、服务器、环境或域名的替代字段。

最小 CLI 示例：

```bash title="从当前目录部署"
appaloft deploy . \
  --project prj_example \
  --environment env_production \
  --server srv_primary \
  --method static \
  --publish-dir dist \
  --port 3000
```

HTTP API 示例：

```http title="Create deployment"
POST /api/deployments
Content-Type: application/json

{
  "projectId": "prj_example",
  "environmentId": "env_production",
  "serverId": "srv_primary",
  "resourceId": "res_web",
  "source": {
    "kind": "git-repository",
    "locator": "https://github.com/example/web",
    "gitRef": "main",
    "baseDirectory": "."
  }
}
```

<h2 id="deployment-source-relink">重新关联部署来源</h2>

当资源或部署记录指向的来源不再可访问，或者用户需要把同一个资源切换到新的仓库、路径或镜像时，source relink 是显式恢复动作。它应该解释新的来源会影响后续 detect 和 plan，不应该被当成普通重试。

执行前应确认目标资源、当前来源、新来源和预期环境。执行后通过下一次部署或资源详情确认 Appaloft 读取的是新的来源。

<h2 id="deployment-lifecycle">部署生命周期</h2>

Appaloft 把部署建模为 `detect -> plan -> execute -> verify -> rollback`。

![Deployment lifecycle](/docs/diagrams/deployment-lifecycle.svg)

<h3 id="deployment-detect">Detect</h3>

Detect 阶段读取源代码和配置线索，判断应用类型、构建方式、运行时入口和网络暴露需求。

<h3 id="deployment-plan">Plan</h3>

Plan 阶段把资源的 source、runtime、health、network 配置转成可执行计划。计划应该能解释 Appaloft 准备运行什么，而不是只显示一条命令。

<h3 id="deployment-execute">Execute</h3>

Execute 阶段在目标服务器或所选执行环境中构建、上传、启动和路由应用。

<h3 id="deployment-verify">Verify</h3>

Verify 阶段检查进程、健康策略、代理路由和可访问地址。用户应该从状态、日志和诊断摘要确认结果。

<h3 id="deployment-rollback">Rollback</h3>

Rollback 是恢复路径，不是隐藏的成功条件。失败时文档会说明哪些状态可以重试，哪些状态需要人工处理或回退到旧版本。

<h2 id="deployment-preview-cleanup">清理 Preview 部署</h2>

Preview cleanup 用于删除某个 pull request、分支或临时来源产生的预览部署。它是显式生命周期操作：清理对象必须由 preview 类型和 preview id 定位，不能误删生产环境或普通部署历史。

清理后应检查资源、部署列表、访问路由和运行时日志，确认预览实例已经停止，相关默认访问地址不再作为有效入口展示。
