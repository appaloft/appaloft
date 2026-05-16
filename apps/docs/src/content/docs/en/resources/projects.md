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

<h2 id="concept-project">Project</h2>

A project is the user boundary for a set of resources, environments, and deployment history. It is not a server or source repository.

<h2 id="project-lifecycle">Project lifecycle</h2>

Projects can be read, renamed, described, archived, restored, checked for delete safety, and deleted after blockers are clear. Archiving a project keeps the project, resources, and deployment history visible, but blocks new environments, resources, and deployments under that project. Restoring a project reopens future project-scoped creation and deployment admission.

Rename, description, archive, restore, and delete changes in project settings only change project-level metadata or lifecycle. They do not create a deployment, rewrite historical deployment snapshots, or immediately stop, restart, or delete running runtime state.

<h3 id="project-rename">Rename a project</h3>

When you rename a project through Web, CLI, or API, Appaloft derives a new project slug from the new name. Pick a different name if another project already owns that slug.

<h3 id="project-description">Set a project description</h3>

Use the project description for human-facing metadata only. Clearing the description does not change the project slug, resources, environments, deployments, access routes, or runtime state.

<h3 id="project-archive">Archive a project</h3>

Archive projects that should no longer receive new deployments. Archive does not delete resources, environments, domains, certificates, logs, or deployment history. Use the resource lifecycle actions when you need to clean up individual resources.

<h3 id="project-restore">Restore a project</h3>

Restore archived projects that should receive new resources, environments, or deployments again. Restore only changes the project lifecycle back to active; it does not restore deleted child objects, retry deployments, change domains or certificates, clean logs, or touch runtime state.

<h3 id="project-delete">Delete a project</h3>

Run delete-check before deleting an archived project. Delete is enabled only when no retained environments, resources, deployment history, source events, domains, certificates, logs, audit, or runtime support records still depend on the project. Project delete removes the project from normal project lists through a tombstone; it does not cascade cleanup or erase retained history.

<h2 id="concept-resource">Resource</h2>

A resource is an application or service that can be deployed. It owns source, runtime, health, and network profiles.

<h2 id="resource-profile-purpose">Why resource profiles exist</h2>

Resource configuration describes future deployment behavior. It is not a one-off deployment parameter bag.
