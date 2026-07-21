---
title: "Projects and resources"
description: "Understand how projects, resources, and environments organize deployment objects."
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "project"
  - "resource"
  - "app"
relatedOperations:
  - projects.create
  - projects.show
  - projects.rename
  - projects.set-description
  - projects.archive
  - projects.restore
  - projects.delete-check
  - projects.delete
  - resources.create
sidebar:
  label: "Projects and resources"
  order: 2
---

## Project [#concept-project]

A project is the user boundary for a set of resources, environments, and deployment history. It is not a server or source repository.

## Project lifecycle [#project-lifecycle]

Projects can be read, renamed, described, archived, restored, checked for delete safety, and deleted after blockers are clear. Archiving a project keeps the project, resources, and deployment history visible, but blocks new environments, resources, and deployments under that project. Restoring a project reopens future project-scoped creation and deployment admission.

Rename, description, archive, restore, and delete changes in project settings only change project-level metadata or lifecycle. They do not create a deployment, rewrite historical deployment snapshots, or immediately stop, restart, or delete running runtime state.

### Rename a project [#project-rename]

When you rename a project through Web, CLI, or API, Appaloft derives a new project slug from the new name. Pick a different name if another project already owns that slug.

### Set a project description [#project-description]

Use the project description for human-facing metadata only. Clearing the description does not change the project slug, resources, environments, deployments, access routes, or runtime state.

### Archive a project [#project-archive]

Archive projects that should no longer receive new deployments. Archive does not delete resources, environments, domains, certificates, logs, or deployment history. Use the resource lifecycle actions when you need to clean up individual resources.

### Restore a project [#project-restore]

Restore archived projects that should receive new resources, environments, or deployments again. Restore only changes the project lifecycle back to active; it does not restore deleted child objects, retry deployments, change domains or certificates, clean logs, or touch runtime state.

### Delete a project [#project-delete]

Run delete-check before deleting an archived project. Delete is enabled only when no retained environments, resources, deployment history, source events, domains, certificates, logs, audit, or runtime support records still depend on the project. Empty environments with no environment variables and no non-deleted resources do not block deletion; project delete archives those empty environments through the environment lifecycle before removing the project from normal project lists through a tombstone. It does not cascade other cleanup or erase retained history.

## Resource [#concept-resource]

A resource is an application or service that can be deployed. It owns source, runtime, health, and network profiles.

## Why resource profiles exist [#resource-profile-purpose]

Resource configuration describes future deployment behavior. It is not a one-off deployment parameter bag.
