---
title: "CLI reference"
description: "CLI commands, flags, prompts, and documentation links."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "cli"
  - "command"
  - "terminal"
relatedOperations:
  - projects.create
  - servers.register
  - resources.create
  - deployments.create
sidebar:
  label: "CLI reference"
  order: 9
---

<h2 id="cli-command-shape">Command shape</h2>

The CLI is a first-class input surface. Commands collect user input and execute shared business operations.

<h2 id="cli-help-links">Help links</h2>

CLI help, interactive prompts, and recovery messages should point to stable public docs anchors.

<h2 id="cli-local-server-docs">Local docs path</h2>

When the local Appaloft server is running, CLI docs links should prefer local `/docs/*` URLs.

<h2 id="cli-automation">Automation</h2>

Automation should prefer explicit flags or config-file fields over non-replayable interactive input.
