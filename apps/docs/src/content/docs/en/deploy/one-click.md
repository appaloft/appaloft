---
title: "One-click deploy"
description: "Add a Deploy on Appaloft button to an app README and hand users into Blueprint deployment."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "one click deploy"
  - "deploy button"
  - "Deploy on Appaloft"
  - "Blueprint"
relatedOperations:
  - blueprints.list
  - blueprints.show
  - blueprints.install
sidebar:
  label: "One-click deploy"
  order: 4
---

One-click deploy is an entrypoint convention, not another application definition format. The button carries the user into an Appaloft deploy entry; the deployable topology still lives in an `appaloft.blueprint/v1` Blueprint.

<h2 id="quickstart">Quickstart</h2>

1. Maintain `appaloft.blueprint.yaml` in the app repository, or publish the app through an Appaloft Blueprint catalog.
2. Generate an Appaloft deploy link.
3. Put the official badge Markdown in the README.
4. The user clicks it, then selects project, server, dependency resources, and secrets in Appaloft before accepting deployment.

Official badge asset:

```txt title="Badge URL"
https://appaloft.com/badge/deploy.svg
```

README example:

```md title="README.md"
[![Deploy on Appaloft](https://appaloft.com/badge/deploy.svg)](https://app.appaloft.com/deploy?source=blueprint&sourceExtension=cloud-blueprint-marketplace&blueprintSlug=pocketbase&blueprintTitle=PocketBase&step=project&projectMode=new&projectName=PocketBase)
```

Remote Blueprint URL example:

```md title="README.md"
[![Deploy on Appaloft](https://appaloft.com/badge/deploy.svg)](https://app.appaloft.com/deploy?source=blueprint&blueprintUrl=https%3A%2F%2Fraw.githubusercontent.com%2Fappaloft%2Fone-click-deploy-docker-demo%2Fmain%2Fappaloft.blueprint.yaml&blueprintTitle=One-Click+Docker+Demo&blueprintProfile=production&step=project&projectMode=new&projectName=One-Click+Docker+Demo)
```

You can also use the [One-click deploy generator](https://appaloft.com/deploy/one-click).

<h2 id="deploy-handoff-url">Deploy handoff URL</h2>

The standard entry is `/deploy`. Query parameters describe the Blueprint to open and the default project state.

| Parameter | Meaning |
| --- | --- |
| `source=blueprint` | Fixed value for a Blueprint deploy entry. |
| `blueprintSlug` | Blueprint slug in a registered catalog; mutually exclusive with `blueprintUrl`. |
| `blueprintTitle` | Optional UI display title. |
| `sourceExtension` | Web extension key that provides catalog endpoints. Optional for `blueprintSlug`; usually omitted for `blueprintUrl` so the runtime can choose its default remote import entry. |
| `blueprintVariant` | Optional Blueprint variant. |
| `blueprintProfile` | Optional profile, for example `production`. |
| `projectMode=new` | Default to creating a project; users can still adjust in the UI. |
| `projectName` | Optional default project name. |
| `blueprintUrl` | Publicly readable remote Blueprint manifest URL; mutually exclusive with `blueprintSlug`. Direct execution depends on whether the current Appaloft runtime enables a remote import surface. |

Do not put real secrets, database passwords, provider tokens, or private repository credentials in the URL. Secrets should be entered in the deploy wizard or referenced through Appaloft secret/resource binding mechanisms.

<h2 id="minimal-blueprint">Minimal Blueprint</h2>

```yaml title="appaloft.blueprint.yaml"
schemaVersion: appaloft.blueprint/v1
id: pocketbase
name: PocketBase
version: 1.0.0
summary: PocketBase service
components:
  - id: app
    name: PocketBase
    kind: service
    runtime:
      strategy: container-image
      image: ghcr.io/muchobien/pocketbase:latest
    ports:
      - name: http
        containerPort: 8090
        protocol: http
        public: true
    routes:
      - port: http
        pathPrefix: /
profiles:
  production:
    label: Production
```

<h2 id="boundary">Boundary</h2>

- A Blueprint is a portable manifest, not a Cloud Marketplace listing.
- A deploy handoff URL is entry state, not a new deployment command.
- The official badge is provided by the Appaloft style convention; app READMEs only reference the image and link.
- Appaloft Cloud can host `app.appaloft.com/deploy` and `appaloft.com/badge/deploy.svg`, while self-hosted Appaloft can use the same URL parameter rules against its own control plane.
