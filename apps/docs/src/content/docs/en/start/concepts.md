---
title: "Concepts"
description: "Core Appaloft concepts from the user's point of view."
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "concept"
  - "project"
  - "resource"
  - "server"
  - "deployment"
relatedOperations:
  - projects.create
  - resources.create
  - deployments.create
sidebar:
  label: "Concepts"
  order: 2
---

<h2 id="concept-project">Project</h2>

A project is the work boundary that groups resources, environments, and deployment history.

<h2 id="concept-resource">Resource</h2>

A resource is a deployable unit, such as a web app, backend service, static site, worker, or Compose stack.

<h2 id="concept-server">Server</h2>

A server is a deployment target Appaloft can connect to and operate. Users see SSH details, credential state, connectivity, and proxy readiness.

<h2 id="concept-environment">Environment</h2>

An environment stores configuration context before deployment. Deployments persist immutable snapshots so later edits do not rewrite history.

<h2 id="concept-deployment">Deployment</h2>

A deployment is one attempt. Appaloft uses it to detect, plan, execute, verify, and preserve recovery context.
