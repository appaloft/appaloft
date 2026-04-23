---
title: "Deployment sources"
description: "Understand how folders, Git repositories, images, Compose files, and static sites become deployment input."
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "source"
  - "repository"
  - "docker image"
  - "static site"
relatedOperations:
  - deployments.create
  - source-links.relink
sidebar:
  label: "Sources"
  order: 2
---

<h2 id="deployment-source">Choose a deployment source</h2>

A deployment source answers what Appaloft should deploy. It can be a local folder, Git repository, Docker image, Compose file, or static site output.

The source is not a substitute for project, server, environment, or domain fields. Appaloft reads source evidence during detect and turns it into an explainable plan during plan.

Existing entrypoints should use the same source vocabulary. A Web source field, CLI positional source or `--source`, and API source input should all point here instead of redefining the concept.

<h2 id="deployment-source-kind">Source kinds</h2>

Common kinds:

| Kind | Fits | User should confirm |
| --- | --- | --- |
| Local folder | CLI local deployment and experiments. | Working directory, ignored files, build output. |
| Git repository | Repeatable deploys, CI, preview. | Repository URL, ref, base directory, access. |
| Docker/OCI image | Existing runtime artifact. | Image address, tag, exposed port. |
| Compose file | Multi-container or existing Compose setup. | Compose file path, service name, exposed port. |
| Static site | Frontend static output. | Build command and publish directory. |

If unsure, choose the kind closest to the artifact you already have. The runtime profile explains how Appaloft should run it.

<h2 id="deployment-source-validation">Input checks</h2>

Users should see whether the source is readable, whether the ref or path exists, whether the static output is clear, and whether the source conflicts with the resource runtime profile.

The Web console should warn before submit when fields like Git ref, base directory, or static output are missing. The CLI should report unreadable paths, inaccessible repositories, and empty source as input errors. The HTTP API should return structured validation errors with field names and recovery hints.

CLI source examples:

```bash title="Local folder"
appaloft deploy ./apps/web --method static --publish-dir build
```

```bash title="Git repository"
appaloft deploy https://github.com/example/web \
  --method static \
  --publish-dir dist \
  --resource-name web
```

Resource source profile example:

```bash title="Configure Git source for an existing resource"
appaloft resource configure-source res_web \
  --kind git-repository \
  --locator https://github.com/example/web \
  --git-ref main \
  --base-directory apps/web
```

<h2 id="deployment-source-output">What you see after deployment</h2>

Once accepted, source becomes part of the deployment snapshot. Later resource source profile changes do not change completed or running deployments.

Deployment details should show a safe source summary, such as repository, ref, base directory, image tag, or static output directory. Secret tokens, private repository credentials, and sensitive local path fragments should not appear in logs or diagnostics.

<h2 id="deployment-source-errors">Common errors</h2>

Recovery examples:

- Local folder does not exist: check the CLI working directory or pass an absolute path.
- Git repository is inaccessible: check credentials, repository URL, ref, and network.
- Static output is empty: confirm the build command produced artifacts.
- Source and runtime profile conflict: update the runtime profile or choose a better source kind.

If the resource already points at an old source, use [Deployment recovery](/docs/en/deploy/recovery/#deployment-source-relink).
