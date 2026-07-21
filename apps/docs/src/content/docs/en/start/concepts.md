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

## Project [#concept-project]

A project is the work boundary that groups resources, environments, and deployment history.

## Resource [#concept-resource]

A resource is a deployable unit, such as a web app, backend service, static site, worker, or Compose stack.

## Server [#concept-server]

A server is a deployment target Appaloft can connect to and operate. Users see SSH details, credential state, connectivity, and proxy readiness.

## Environment [#concept-environment]

An environment stores configuration context before deployment. Deployments persist immutable snapshots so later edits do not rewrite history.

## Deployment [#concept-deployment]

A deployment is one attempt. Appaloft uses it to detect, plan, execute, verify, and preserve recovery context.
