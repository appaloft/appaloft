---
title: "GitHub repositories"
description: "Use GitHub repositories as deployment sources."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "github"
  - "repository"
  - "pull request"
relatedOperations: []
sidebar:
  label: "GitHub"
  order: 1
---

## GitHub source [#integration-github-source]

GitHub repositories bind a deployment to a traceable source snapshot. Record the repository, ref, working directory, and deployment identity so retries, rollbacks, and previews can return to the same input set.

> Note: Preview deployments should use the pull request commit SHA, not a moving branch name. The preview page, logs, and cleanup action then all point at the same commit.

## Permission boundary [#integration-github-permissions]

The GitHub integration should expose only information that helps users decide what to fix: repository access, ref existence, event delivery, and preview cleanup state. Docs and diagnostics must not expose tokens, private keys, raw webhook payloads, or unredacted command output.

## Connect the repository [step]

Choose the organization and repository, then confirm that Appaloft can read code, receive pull request events, and report deployment status when needed. Grant only the repositories required for deployment instead of opening the whole organization by default.

## Choose deployment inputs [step]

Every GitHub source needs these inputs:

| Input | Meaning |
| --- | --- |
| Repository | Owner and repository name, for example `appaloft/appaloft`. |
| Ref | Branch, tag, or full commit SHA. Production usually uses a stable branch or tag; previews use the pull request SHA. |
| Directory | The application directory. In a monorepo, do not assume the repository root is the deploy directory. |
| Trigger | Manual deploy, push deploy, or pull request preview. |

## Run a preview [step]

Pull request previews should have a separate environment name, access domain, and cleanup policy. A preview can reuse project configuration, but it must not replace production domains, secrets, or long-lived resources.

## Troubleshoot sync [step]

If Appaloft does not see the latest commit, first check whether the webhook arrived, the installation still has repository access, and the pull request came from a restricted fork. Then inspect deployment logs so source sync problems are not mistaken for build failures.
