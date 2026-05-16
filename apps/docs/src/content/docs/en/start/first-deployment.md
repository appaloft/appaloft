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
- AI agents should install the [Appaloft skill](/docs/en/agent/appaloft-skill/#appaloft-skill), then
  follow the [Agent deploy skill](/docs/en/agent/deploy-skill/#agent-deploy-skill) subprotocol to
  inspect the source safely and call existing CLI/API/Web entrypoints.

<h2 id="agent-deploy-skill">AI agent deployment</h2>

Agent deployment is not a new business operation. It translates "deploy this project" into the existing project, server, environment, resource, and deployment operations, then returns the access URL, deployment status, logs, diagnostics, and recovery commands first.

For an already built static directory, an agent can use `appaloft deploy ./dist --as static-site`. This behaves like publishing a static output directory, while Appaloft still deploys to the user's selected BYOS target by default instead of silently uploading to a hosted cloud.

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
