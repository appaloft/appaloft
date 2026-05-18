---
title: "Static assets"
description: "Understand how Web console and docs static assets are bundled and overridden."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "static assets"
  - "docs static"
  - "web console"
relatedOperations: []
sidebar:
  label: "Static assets"
  order: 2
---

## Binary packaging [#advanced-binary-packaging]

The binary embeds Web console assets and public docs assets separately. Docs are served under `/docs/*` by default.

This keeps self-hosted instances useful when the server has no public network access, no Node runtime, and cannot fetch source from GitHub. The Web console remains the control surface, while docs ship as a separate public documentation bundle.

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

> Tip: Replacing docs does not require rebuilding or replacing the Web console. Put the new docs static directory on the server and point `APPALOFT_DOCS_STATIC_DIR` at it.

## Docs override [#self-hosting-docs-override]

Set `APPALOFT_DOCS_STATIC_DIR` to serve docs from a directory while the Web console keeps its own asset source. The override directory must contain a built static site, not the docs source directory.

## Prepare the static directory [step]

Build the docs site and keep `index.html`, `_next/`, `api/search`, `llms.txt`, and `llms-full.txt`. If the site is served somewhere other than `/docs/*`, build it with the matching docs base.

## Upload to the server [step]

Upload the build output to a directory that Appaloft can read. Do not upload source code, `.env` files, private keys, or CI work directories with it.

## Point Appaloft at the override [step]

Set `APPALOFT_DOCS_STATIC_DIR` and restart Appaloft. Open `/docs/`, `/docs/api/search`, and `/docs/llms.txt` to confirm the page, search index, and LLM entrypoint all come from the new build output.

## Roll back the override [step]

If the new docs cannot be reached, remove `APPALOFT_DOCS_STATIC_DIR` or point it back to the previous directory. Web console static assets are not affected by this rollback.
