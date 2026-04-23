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
  - resources.create
sidebar:
  label: "Projects and resources"
  order: 2
---

<h2 id="concept-project">Project</h2>

A project is the user boundary for a set of resources, environments, and deployment history. It is not a server or source repository.

<h2 id="concept-resource">Resource</h2>

A resource is an application or service that can be deployed. It owns source, runtime, health, and network profiles.

<h2 id="resource-profile-purpose">Why resource profiles exist</h2>

Resource configuration describes future deployment behavior. It is not a one-off deployment parameter bag.
