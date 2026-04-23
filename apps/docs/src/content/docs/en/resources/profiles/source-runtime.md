---
title: "Source and runtime profiles"
description: "Configure where a resource comes from and how it runs."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "source profile"
  - "runtime profile"
  - "start command"
relatedOperations:
  - resources.configure-source
  - resources.configure-runtime
sidebar:
  label: "Source and runtime"
  order: 3
---

![Resource profile flow](/docs/diagrams/resource-profiles.svg)

<h2 id="resource-source-profile">Source profile</h2>

The source profile tells Appaloft where to read the application from. It belongs to the resource, not to one temporary deployment request.

Existing entrypoints should cover:

- Local folder or current workspace source.
- Git repository, ref, and base directory.
- Source snapshot provided by automation.
- Image, static site, or Compose source summaries.

After source profile changes, new deployments read the new source. Completed and running deployments keep their own deployment snapshots.

<h2 id="resource-runtime-profile">Runtime profile</h2>

The runtime profile describes how Appaloft should run the resource. It includes install, build, start, static output, container naming intent, and runtime strategy.

Users should be able to configure or observe:

- Install and build commands.
- Start command or image entrypoint.
- Static site publish directory.
- Runtime strategy, such as auto, Docker/OCI, or static publishing.
- The expected listener port, confirmed in the network profile.

During deployment, Appaloft combines source and runtime profiles into a runtime plan. The plan should explain what will run instead of exposing internal structures.

<h2 id="resource-source-runtime-fit">Source and runtime fit</h2>

If source and runtime settings clearly conflict, users should see actionable correction guidance before deployment.

Common mismatches:

- Static site without a publish directory.
- Git repository with no detectable build evidence and no runtime profile.
- Image source combined with source build commands.
- Application listener port does not match the network profile.

<h2 id="resource-source-runtime-surfaces">Entrypoints</h2>

The Web console should show source/runtime profile in resource creation and resource configuration screens with field-level help.

The CLI should map `resources create`, `resources configure-source`, and `resources configure-runtime` arguments to the same concepts. Interactive prompts may ask for missing fields, but they should not rename the concept.

The HTTP API should reuse resource configuration schemas and avoid transport-only source/runtime shapes.

<h2 id="resource-source-runtime-verification">Verify the configuration</h2>

After configuration, inspect resource details for the source/runtime summary. The next deployment writes these profiles into its deployment snapshot. If deployment fails, detect failures usually point to source, while plan failures usually point to source/runtime/profile mismatch.

CLI examples:

```bash title="Configure source profile"
appaloft resource configure-source res_web \
  --kind git-repository \
  --locator https://github.com/example/web \
  --git-ref main \
  --base-directory apps/web
```

```bash title="Configure runtime profile"
appaloft resource configure-runtime res_web \
  --strategy static \
  --build-command "bun run build" \
  --publish-directory dist
```

HTTP API example:

```http title="Update runtime profile"
POST /api/resources/res_web/runtime-profile
Content-Type: application/json

{
  "strategy": "static",
  "buildCommand": "bun run build",
  "publishDirectory": "dist"
}
```
