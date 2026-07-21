---
title: "Servers and credentials"
description: "Register deployment target servers, configure SSH credentials, and understand proxy readiness."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "server"
  - "ssh"
  - "credential"
  - "deployment target"
relatedOperations:
  - servers.register
  - servers.configure-credential
  - credentials.create-ssh
  - servers.test-connectivity
  - terminal-sessions.open
sidebar:
  label: "Servers and credentials"
  order: 5
---

## What a server means [#server-deployment-target]

A server is a target Appaloft can connect to, inspect, and deploy onto.

## SSH credentials [#server-ssh-credential-path]

SSH credentials may be one-time input or reusable saved credentials. Plain secret values must not appear in read models, logs, or diagnostics.

## Connectivity test [#server-connectivity-test]

Connectivity tests confirm Appaloft can reach the server and inspect the required runtime context.

## Proxy readiness [#server-proxy-readiness]

Proxy readiness controls whether generated access routes and routing checks can work.

## Open a terminal session [#server-terminal-session]

Terminal sessions are for controlled server or resource troubleshooting, not the normal deployment path. Before opening one, confirm the target, identity, and purpose. Web, CLI, and API descriptions should remind users to enter only the commands needed for the current task.

Terminal output can include environment, path, or runtime details. Prefer the diagnostic summary when copying support data, and avoid sharing secrets, private keys, or full environment variable values.
