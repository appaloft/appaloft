---
title: "Start here"
description: "The smallest path from an SSH server to a reachable app."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "quick start"
  - "getting started"
  - "first deploy"
relatedOperations:
  - projects.create
  - servers.register
  - resources.create
  - deployments.create
sidebar:
  label: "Start here"
  order: 1
---

<h2 id="start-first-deployment-path">First deployment path</h2>

The smallest path is: create a project, choose an environment, register an SSH server, create a resource, request a deployment, then observe the access URL, status, logs, and diagnostics.

<h2 id="start-entrypoints">Choose an entrypoint</h2>

- Use the Web console for interactive configuration and status review.
- Use the CLI for local development, server-local operation, and GitHub Actions.
- Use the HTTP API for integrations and control-plane automation.

<h2 id="start-success-check">Success check</h2>

A successful minimal deployment should answer:

- Which resource was deployed to which server.
- Which source, runtime, and network settings Appaloft used.
- Which lifecycle status the deployment reached.
- Which URL the user should open.
- Which diagnostic summary should be copied when support context is needed.

<h2 id="start-next-links">Next links</h2>

- [Deployment lifecycle](/docs/en/deploy/lifecycle/) explains deployment stages.
- [Register and test a server](/docs/en/servers/register-connect/) explains SSH target setup.
- [Logs and health](/docs/en/observe/logs-health/) explains status, logs, and recovery.
