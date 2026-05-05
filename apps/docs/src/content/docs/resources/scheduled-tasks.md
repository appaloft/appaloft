---
title: "Scheduled tasks"
description: "管理 Resource 拥有的定时任务、手动运行、运行历史和任务日志。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "scheduled task"
  - "cron"
  - "run history"
  - "task logs"
  - "定时任务"
  - "任务日志"
relatedOperations:
  - scheduled-tasks.create
  - scheduled-tasks.list
  - scheduled-tasks.show
  - scheduled-tasks.configure
  - scheduled-tasks.delete
  - scheduled-tasks.run-now
  - scheduled-task-runs.list
  - scheduled-task-runs.show
  - scheduled-task-runs.logs
sidebar:
  label: "Scheduled tasks"
  order: 7
---

<h2 id="scheduled-task-resource-lifecycle">Scheduled task 生命周期</h2>

Scheduled task 是 Resource 拥有的重复任务定义，用来运行迁移、同步、cache warm、维护脚本或其他
不会替换线上服务进程的命令。任务定义保存 schedule、timezone、command、timeout、retry、
enabled/disabled 状态和并发策略，但不会创建 Deployment，也不会写入 deployment history。

```bash title="创建定时任务"
appaloft scheduled-task create res_web \
  --schedule "0 2 * * *" \
  --timezone UTC \
  --command "bun run migrate" \
  --timeout-seconds 600 \
  --retry-limit 1
```

禁用任务会阻止自动调度。删除任务只移除任务定义和后续触发入口，不会删除 Resource、Deployment、
runtime 进程或外部依赖。

<h2 id="scheduled-task-run-now">立即运行</h2>

`scheduled-tasks.run-now` 接受一次 manual run attempt。命令返回 run id 后，实际执行和完成状态通过
run detail、run list 和 run logs 查看。

```bash title="立即运行一次任务"
appaloft scheduled-task run tsk_daily_migration --resource-id res_web
```

如果 Resource 已归档、任务已禁用、任务不属于给定 Resource，或默认 `forbid` 并发策略发现已有未结束
run，Appaloft 会在启动任务命令前拒绝或跳过本次 run。

<h2 id="scheduled-task-run-history">运行历史</h2>

Task runs 是独立于 Deployment 的历史记录。它们记录 manual 或 scheduled trigger、
accepted/running/succeeded/failed/skipped 状态、开始和结束时间、退出码和安全失败摘要。

```bash title="查看运行历史"
appaloft scheduled-task runs list --task-id tsk_daily_migration
appaloft scheduled-task runs show str_daily_migration_1 --task-id tsk_daily_migration
```

运行失败不会自动 rollback 或 redeploy 正在服务的 Resource。需要修复任务命令、Resource runtime
profile、依赖或环境变量后，再手动运行任务或等待下一次 schedule。

<h2 id="scheduled-task-run-logs">任务日志</h2>

Task run logs 只属于对应的 run。它们不会混入 Deployment logs 或 Resource runtime logs。

```bash title="读取任务日志"
appaloft scheduled-task runs logs str_daily_migration_1 --task-id tsk_daily_migration
```

日志输出必须屏蔽看起来像 secret、token、password 或 connection string 的内容。需要调试时，优先
共享 task id、run id、状态、时间、退出码和已屏蔽日志，不要复制原始 secret 值。
