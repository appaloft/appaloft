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
  - projects.archive
  - resources.create
sidebar:
  label: "Projects and resources"
  order: 2
---

<h2 id="concept-project">Project</h2>

A project is the user boundary for a set of resources, environments, and deployment history. It is not a server or source repository.

<h2 id="project-lifecycle">Project lifecycle</h2>

Projects can be read, renamed, and archived. Archiving a project keeps the project, resources, and deployment history visible, but blocks new environments, resources, and deployments under that project.

<h3 id="project-rename">Rename a project</h3>

When you rename a project through Web, CLI, or API, Appaloft derives a new project slug from the new name. Pick a different name if another project already owns that slug.

<h3 id="project-archive">Archive a project</h3>

Archive projects that should no longer receive new deployments. Archive does not delete resources, environments, domains, certificates, logs, or deployment history. Use the resource lifecycle actions when you need to clean up individual resources.

<h2 id="concept-resource">Resource</h2>

A resource is an application or service that can be deployed. It owns source, runtime, health, and network profiles.

<h2 id="resource-profile-purpose">Why resource profiles exist</h2>

Resource configuration describes future deployment behavior. It is not a one-off deployment parameter bag.
