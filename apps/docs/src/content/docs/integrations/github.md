---
title: "GitHub repositories"
description: "把 GitHub 仓库作为部署来源。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "github"
  - "repository"
  - "pull request"
  - "仓库"
relatedOperations:
  - system.github-app-connection.show
  - system.github-repositories.list
sidebar:
  label: "GitHub"
  order: 1
---

## GitHub 来源 [#integration-github-source]

GitHub 仓库用于把一次部署和一段可追溯的源码绑定起来。你应该记录仓库、ref、工作目录和部署身份，这样重试、回滚和 preview 都能回到同一组输入。

> 注意：Preview 部署应该使用 pull request 的提交 SHA，而不是会移动的分支名。这样你看到的 preview 页面、日志和之后的清理动作都指向同一个提交。

## 权限边界 [#integration-github-permissions]

GitHub 集成只应该展示用户能判断和修复的信息：仓库是否可访问、ref 是否存在、事件是否到达、preview 是否已经清理。不要在文档或诊断中暴露 token、private key、原始 webhook payload 或未脱敏的命令输出。

## 连接仓库 [step]

选择组织和仓库，然后确认 Appaloft 需要读取代码、接收 pull request 事件，并在需要时回写部署状态。只授予部署需要的仓库，不要把整个组织默认开放给所有环境。

使用 `appaloft github status` 查看当前 workspace installation，并用
`appaloft github repositories --search <text>` 浏览它已获授权的仓库。

## 选择部署输入 [step]

每个 GitHub 来源至少需要这些输入：

| 输入 | 说明 |
| --- | --- |
| Repository | 仓库所有者和仓库名，例如 `appaloft/appaloft`。 |
| Ref | 分支、tag 或完整 commit SHA。生产环境通常选择稳定分支或 tag，preview 使用 pull request SHA。 |
| Directory | 应用所在目录。monorepo 中不要假设仓库根目录就是部署目录。 |
| Trigger | 手动部署、push 自动部署或 pull request preview。 |

## 运行 preview [step]

Pull request preview 应该带有独立的环境名称、访问域名和清理策略。preview 可以复用项目配置，但不能覆盖生产环境的域名、secret 或长期运行资源。

## 排查同步问题 [step]

如果 Appaloft 没有看到最新提交，先检查 webhook 是否到达、安装是否仍有仓库权限、pull request 是否来自受限 fork。然后再检查部署日志，避免把来源同步问题误判成构建失败。
