---
title: "Status and events"
description: "Use status and events to understand where a deployment is."
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "status"
  - "events"
  - "deployment status"
relatedOperations:
  - deployments.show
sidebar:
  label: "Status and events"
  order: 2
---

## Check status first [#observe-status-first]

Inspect resource, deployment, runtime, proxy, and access URL status separately before judging the whole deployment.

Status answers "is it usable now"; events answer "why did it become this way." Read them together to distinguish input errors, execution failures, health-check failures, and access-layer readiness problems.

| Signal | Check first |
| --- | --- |
| Deploy failed but the old version is still reachable | New deployment events, build logs, health checks. |
| Runtime is healthy but the domain is unreachable | Proxy status, DNS, TLS certificate, routing rule. |
| Preview page is missing | Pull request state, preview cleanup event, deployment artifact. |
| Status stays pending | Running task, server connection, timestamp of the latest event. |

> Tip: If status and events appear to disagree, use the event timeline to confirm the last successful change before deciding whether to wait, retry, or roll back.

## Event timeline [#observe-event-timeline]

Events explain how status changed. Look for the most recent failed phase, error code, and retry guidance.

## Find the current object [step]

First confirm whether you are looking at a project, environment, resource, deployment, or preview. These objects can have different states; do not treat a preview failure as a production failure.

## Read the latest change [step]

Check the latest event phase, timestamp, and error code. If the latest event only says the request was accepted, inspect the running task. If the latest event already failed, move into recovery.

## Compare with health [step]

Health summaries describe the current runtime, proxy, and access URL state. Events explain history; health explains the current observation.

## Capture recovery evidence [step]

Before retrying or rolling back, record the failed state, error code, related logs, and access URL. After recovery, compare the same details to prove the state changed.
