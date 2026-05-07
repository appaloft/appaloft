---
title: "Scheduled tasks"
description: "Manage Resource-owned scheduled tasks, manual runs, run history, and task logs."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "scheduled task"
  - "cron"
  - "run history"
  - "task logs"
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

<h2 id="scheduled-task-resource-lifecycle">Scheduled task lifecycle</h2>

A scheduled task is a Resource-owned recurring task definition for migrations, sync jobs, cache
warmers, maintenance scripts, or other commands that do not replace the live service process. The
task definition stores schedule, timezone, command, timeout, retry, enabled/disabled state, and
concurrency policy, but it does not create a Deployment or write to deployment history.

```bash title="Create a scheduled task"
appaloft scheduled-task create res_web \
  --schedule "0 2 * * *" \
  --timezone UTC \
  --command "bun run migrate" \
  --timeout-seconds 600 \
  --retry-limit 1
```

Disabling a task prevents automatic scheduling. Deleting a task removes the definition and future
trigger entrypoint only. It does not delete the Resource, Deployments, runtime process, or external
dependencies.

<h2 id="scheduled-task-run-now">Run now</h2>

`scheduled-tasks.run-now` accepts one manual run attempt. After the command returns a run id,
execution and completion are visible through run detail, run list, and run logs.

```bash title="Run a task immediately"
appaloft scheduled-task run tsk_daily_migration --resource-id res_web
```

If the Resource is archived, the task is disabled, the task does not belong to the given Resource, or
the default `forbid` concurrency policy finds another non-terminal run, Appaloft rejects or skips
the run before starting the task command.

<h2 id="scheduled-task-run-history">Run history</h2>

Task runs are history records separate from Deployments. They record manual or scheduled trigger,
accepted/running/succeeded/failed/skipped state, start and finish time, exit code, and safe failure
summary.

```bash title="Inspect run history"
appaloft scheduled-task runs list --task-id tsk_daily_migration
appaloft scheduled-task runs show str_daily_migration_1 --task-id tsk_daily_migration
```

A failed run does not automatically roll back or redeploy the serving Resource. Fix the task
command, Resource runtime profile, dependency, or environment variable, then run the task manually
or wait for the next schedule.

<h2 id="scheduled-task-run-logs">Task logs</h2>

Task run logs belong only to the corresponding run. They are not mixed into Deployment logs or Resource runtime logs.

```bash title="Read task logs"
appaloft scheduled-task runs logs str_daily_migration_1 --task-id tsk_daily_migration
```

Log output must mask content that looks like a secret, token, password, or connection string. For
debugging, share the task id, run id, status, timestamps, exit code, and masked logs instead of raw
secret values.
