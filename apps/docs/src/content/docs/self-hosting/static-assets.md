---
title: "Static assets"
description: "理解 Web console 和 docs 静态资源如何打包和覆盖。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "static assets"
  - "docs static"
  - "web console"
  - "静态资源"
relatedOperations: []
sidebar:
  label: "Static assets"
  order: 2
---

## Binary 打包 [#advanced-binary-packaging]

Binary 会嵌入 Web console 静态资源和 public docs 静态资源。两者分开嵌入、分开覆盖，docs 默认服务在 `/docs/*`。

这种设计让自托管实例在没有公网访问、没有 Node 运行时、也不能从 GitHub 拉取源码时，仍然可以打开帮助文档。Web console 继续作为控制台资源发布，docs 则作为独立的 public docs 包发布。

```files
appaloft-static
├── web
│   ├── index.html
│   └── assets
└── docs
    ├── index.html
    ├── api
    │   └── search
    ├── llms.txt
    └── _next
```

> 提示：如果你只替换 docs，不需要重新打包或替换 Web console。把新的 docs 静态目录放到服务器上，再指向 `APPALOFT_DOCS_STATIC_DIR` 即可。

## Docs 覆盖 [#self-hosting-docs-override]

如果设置 `APPALOFT_DOCS_STATIC_DIR`，Appaloft 会从该目录提供 docs，而 Web console 继续使用自己的静态资源来源。覆盖目录必须是已经构建好的静态站点，而不是源码目录。

## 准备静态目录 [step]

构建 docs 站点，保留 `index.html`、`_next/`、`api/search`、`llms.txt` 和 `llms-full.txt`。如果部署在 `/docs/*` 之外的路径，构建时要使用匹配的 docs base。

## 上传到服务器 [step]

把构建产物上传到一个只由 Appaloft 读取的目录。不要把源码、`.env`、私钥或 CI 工作目录一起上传。

## 指向覆盖目录 [step]

设置 `APPALOFT_DOCS_STATIC_DIR` 后重启 Appaloft。打开 `/docs/`、`/docs/api/search` 和 `/docs/llms.txt` 检查页面、搜索和 LLM 入口是否都来自新的构建产物。

## 回退覆盖 [step]

如果新 docs 无法访问，移除 `APPALOFT_DOCS_STATIC_DIR` 或指回上一版目录。Web console 静态资源不受这个操作影响。
