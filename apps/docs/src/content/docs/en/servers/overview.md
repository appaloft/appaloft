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

<h2 id="server-deployment-target">What a server means</h2>

A server is a target Appaloft can connect to, inspect, and deploy onto.

<h2 id="server-ssh-credential-path">SSH credentials</h2>

SSH credentials may be one-time input or reusable saved credentials. Plain secret values must not appear in read models, logs, or diagnostics.

<h2 id="server-connectivity-test">Connectivity test</h2>

Connectivity tests confirm Appaloft can reach the server and inspect the required runtime context.

<h2 id="server-proxy-readiness">Proxy readiness</h2>

Proxy readiness controls whether generated access routes and routing checks can work.

<h2 id="server-terminal-session">Open a terminal session</h2>

Terminal sessions are for controlled server or resource troubleshooting, not the normal deployment path. Before opening one, confirm the target, identity, and purpose. Web, CLI, and API descriptions should remind users to enter only the commands needed for the current task.

Terminal output can include environment, path, or runtime details. Prefer the diagnostic summary when copying support data, and avoid sharing secrets, private keys, or full environment variable values.
