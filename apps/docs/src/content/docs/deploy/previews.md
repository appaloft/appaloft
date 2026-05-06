---
title: "Preview deployments"
description: "安全运行 pull request 预览、清理预览，并理解什么时候需要控制平面预览。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "pull request preview"
  - "PR preview"
  - "preview environment"
  - "deploy-action"
  - "GitHub App preview"
  - "预览部署"
relatedOperations:
  - deployments.create
  - deployments.cleanup-preview
  - preview-policies.configure
  - preview-policies.show
  - preview-environments.list
  - preview-environments.show
  - preview-environments.delete
sidebar:
  label: "Previews"
  order: 3
---

<h2 id="deployment-pr-preview-action-workflow">Action-only pull request previews</h2>

Action-only preview 由你自己的 GitHub Actions workflow 运行。Workflow checkout pull request，把可信的 GitHub 上下文映射成 Appaloft preview flags，通过普通部署路径部署，并在可用时输出预览 URL。

适合使用这个路径的情况：

- 仓库可以运行 `pull_request` workflow。
- 部署凭据保存在 GitHub Secrets 或其他 workflow secret store 中。
- 你希望 Appaloft 复用普通 CLI/config 部署的 source、resource profile、environment、server 和 route 规则。
- 仓库有单独的 close-event workflow 负责清理。

对于同仓库 pull request，workflow 可以带 preview context 调用 Appaloft CLI：

```bash
appaloft deploy . \
  --config appaloft.preview.yml \
  --preview pull-request \
  --preview-id "pr-${PR_NUMBER}" \
  --preview-domain-template "pr-${PR_NUMBER}.preview.example.com" \
  --preview-tls-mode disabled \
  --require-preview-url
```

这些 preview flags 在 committed config 之外选择预览身份和路由策略。它们不会把 pull request、branch、source、route 或 preview 字段加入 `deployments.create`。

公开 Marketplace 的 `appaloft/deploy-action` wrapper 仍在推进中。在它发布前，可以直接使用上面的 CLI 形状，或使用仓库自有 wrapper，把可信 workflow 输入映射到同一组 CLI flags。

<h2 id="deployment-pr-preview-output">Preview URL output</h2>

Preview deploy 可以从 generated/default access 或可信 preview domain template 暴露 URL。Generated access 需要所选服务器有可用的 generated access provider 和公网地址。像 `pr-123.preview.example.com` 这样的自定义预览域名需要 wildcard DNS 已经指向所选服务器。

如果 workflow 在无法观测到公开预览路由时应该失败，请使用 `--require-preview-url`。不使用该 flag 时，部署仍可能被接受并带诊断信息展示，即使暂时没有 public URL。

<h2 id="deployment-pr-preview-cleanup-workflow">Close-event cleanup</h2>

Action-only cleanup 是显式动作。为仓库添加 `pull_request.closed` workflow，并运行：

```bash
appaloft preview cleanup . \
  --config appaloft.preview.yml \
  --preview pull-request \
  --preview-id "pr-${PR_NUMBER}"
```

Cleanup 是幂等的。它会在存在时停止 preview-owned runtime state，删除 preview route desired state，解除 preview source identity，并保留生产部署和普通部署历史。

<h2 id="deployment-preview-fork-safety">Fork safety and secrets</h2>

不要把部署凭据暴露给不可信的 fork pull request。默认安全做法是跳过 fork preview，除非你已经设计了显式的降权凭据策略。

Secrets 应来自 GitHub Secrets 或其他可信 workflow secret store，并通过 `ci-env:NAME` 这类 secret reference 传入。不要把 SSH key、token、database URL、生产 secret value，或 Appaloft project/resource/server identity 写进 `appaloft.yml`。

<h2 id="product-grade-preview-deployments">Product-grade control-plane previews</h2>

Product-grade preview 是未来由 Appaloft Cloud 或 self-hosted control plane 拥有的 workflow。它和 Action-only preview 不是同一个产品形态。

这个产品线会使用 GitHub App webhooks、preview policy、fork/secret policy、preview environment list/show/delete、comments/checks/status feedback、cleanup retries、quotas、audit，以及 managed domain follow-up。即便如此，控制平面选择或创建 preview context 之后，真正部署仍必须通过 ids-only `deployments.create`。

当你需要 Appaloft 统一拥有 preview orchestration、policy、feedback、cleanup retries 和团队可见 audit，而不是让每个仓库维护自己的 workflow file 时，使用 product-grade preview。

<h2 id="deployment-preview-troubleshooting">Troubleshoot previews</h2>

常见检查：

- 没有 preview URL：确认 generated access readiness 或 wildcard DNS，再决定 workflow 是否应使用 `--require-preview-url`。
- 路由不符合预期：确认 preview domain template 来自可信 workflow 输入，而不是生产 `access.domains[]`。
- 重复部署：确认同一个 pull request 使用稳定的 preview id，且 cleanup 没有使用另一个 id。
- cleanup 没有效果：确认 close-event workflow 使用了与 deploy 相同的 preview type、preview id、source path 和 config path。
- fork 被跳过：在暴露部署凭据前，先确认 pull request 来源仓库是否可信。
