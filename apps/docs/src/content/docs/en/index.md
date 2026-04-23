---
title: "Appaloft Docs"
description: "Appaloft docs help you deploy apps, connect servers, configure access, manage environment variables, and troubleshoot issues."
template: splash
docType: index
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "docs"
  - "documentation"
  - "help"
  - "deployment"
  - "self-hosting"
  - "app hosting"
relatedOperations: []
hero:
  title: "Deploy and manage apps with Appaloft"
  tagline: "From your first deployment to servers, domains, environment variables, and troubleshooting, these docs are organized around what you want to get done."
  actions:
    - text: "Complete your first deployment"
      link: /docs/en/start/first-deployment/
      icon: right-arrow
    - text: "View troubleshooting"
      link: /docs/en/observe/diagnostics/
      variant: minimal
      icon: external
---

<h2 id="docs-entry-map">Start From Your Goal</h2>

Appaloft helps you deploy apps into environments you control, then manage access, configuration, status, and recovery in one place. You do not need to learn complex concepts first; start with what you are trying to do.

- **I want to get something running**: Start with [your first deployment](/docs/en/start/first-deployment/) and follow the shortest successful path.
- **I need to connect a server**: Read [server registration and connectivity](/docs/en/servers/register-connect/) to confirm the server, SSH credentials, and health checks.
- **I want people to reach my app**: Read [default access routes](/docs/en/access/generated-routes/) and [custom domains](/docs/en/access/domains/custom-domains/).
- **I need to configure variables**: Read [environment variable precedence](/docs/en/environments/variables/precedence/) and [secret handling](/docs/en/environments/variables/secrets/).
- **Something failed**: Start with [logs and health](/docs/en/observe/logs-health/) or [diagnostics](/docs/en/observe/diagnostics/).

<h2 id="docs-reader-path">Recommended path</h2>

1. New users should read [Start here](/docs/en/start/first-deployment/) and complete one deployment from input to reachable URL.
2. When configuring an app, read [Projects and resources](/docs/en/resources/projects/) and [Environment variables](/docs/en/environments/variables/precedence/).
3. When configuring access, read [Default access](/docs/en/access/generated-routes/), [Custom domains](/docs/en/access/domains/custom-domains/), and [TLS certificates](/docs/en/access/tls/certificates/).
4. For operations and automation, read [CLI reference](/docs/en/reference/cli/), [HTTP API reference](/docs/en/reference/http-api/), and [Self-hosting](/docs/en/self-hosting/install/).

<h2 id="docs-local-help">Open Help Inside Appaloft</h2>

Fields with a `?` in the Web console open the relevant docs page. Self-hosted and binary installs serve these docs locally with Appaloft, so operators can still read help when the server environment cannot reach the public internet. To replace the local docs site, see [static assets](/docs/en/self-hosting/static-assets/).
