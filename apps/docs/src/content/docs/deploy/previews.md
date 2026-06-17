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

最简单的 BYOS 形态是 Pure SSH Action：默认 `control-plane-mode: none`，Action 安装/运行 CLI，通过 SSH 部署，SSH 目标使用 server-owned `ssh-pglite` 状态。这个路径不需要 Appaloft console、deploy token、project id、resource id 或 server id；首次部署建立 source-link 后，后续会自动复用。

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

公开 `appaloft/deploy-action` wrapper 会把可信 workflow 输入映射到同一组 preview flags。需要本地调试或使用尚未发布的 wrapper 行为时，可以直接使用上面的 CLI 形状。

<h2 id="deployment-action-self-hosted-server-mode">Self-hosted server Action mode</h2>

对于已有 self-hosted Appaloft console/API 的仓库，`appaloft/deploy-action` 可以触发 server API，而不是在 GitHub runner 里运行 CLI/SSH。必须用 `control-plane-url` 显式选择 Appaloft instance，并用 `appaloft-token` 认证 Action mutation endpoint：

```yaml
- uses: appaloft/deploy-action@v1
  id: deploy
  with:
    control-plane-mode: self-hosted
    control-plane-url: https://console.example.com
    appaloft-token: ${{ secrets.APPALOFT_TOKEN }}
    server-config-deploy: true
    config: appaloft.yml
    secret-variables: |
      APP_SECRET=ci-env:APP_SECRET
```

推荐使用 `server-config-deploy: true`。在这个模式下，Action 执行 server handshake，发送有边界的 GitHub source/config 引用，从 runner environment 解析 `ci-env:` secrets，并调用 server API。部署路径不调用 CLI、不打开 SSH、不选择 state backend，也不修改 SSH-server PGlite state；当前 composite wrapper 仍可能先执行共享 binary setup，但 self-hosted deploy/cleanup mutation 都是发往所选 control plane 的 API 调用。Server 会验证 committed config，通过 Appaloft operations 应用 runtime/network/health/env/domain 设置，解析 source-link 或 repository binding context，然后 dispatch ids-only deployment admission。

不使用 `server-config-deploy` 时，这个 server API slice 要求 project、environment、resource 和 deployment target 已经能由 Appaloft server 解析。Action 会调用 server 的 source-link deployment route。Server 会从已有 source-link state，或唯一指向目标的 deploy token scope 解析上下文。显式 ids 只是高级 bootstrap/debug 输入，并且必须和 source-link state、token scope、可信仓库事实一致。这个路径不会应用 `appaloft.yml`、上传 source archive、创建 resource、打开 SSH，或修改 SSH-server PGlite state。

Project、environment、resource、server ids 不应作为普通用户默认心智。优先让 server 从 source-link、repository binding、deploy-token scope 和 GitHub repository/config fingerprint 解析上下文。缺少绑定时，才使用一次 trusted bootstrap 或 advanced override：

```yaml
- uses: appaloft/deploy-action@v1
  id: deploy
  with:
    control-plane-mode: self-hosted
    control-plane-url: https://console.example.com
    appaloft-token: ${{ secrets.APPALOFT_TOKEN }}
    config: appaloft.yml
    server-config-deploy: true
    secret-variables: |
      APP_SECRET=ci-env:APP_SECRET
```

在这个模式下，Action 执行 server handshake，发送有边界的 GitHub source/config 引用，从
runner environment 解析 `ci-env:` secrets，并调用 server API。Runner 仍然不会安装 CLI、
打开 SSH、选择 state backend，或修改 SSH-server PGlite state。Server 会验证 committed
config，拒绝 identity 和 raw secret 字段，通过 Appaloft operations 应用
runtime/network/health/env/domain 设置，然后 dispatch ids-only deployment admission。如果没有
已有 source link、token scope、source binding 或可信 bootstrap context 能识别目标，server 会在
任何 mutation 前失败，并提示你在 console 中 link source、执行 source-link relink，或传入一次性的
bootstrap ids。

Self-hosted server mode 也可以触发 PR preview deploy：

```yaml
- uses: appaloft/deploy-action@v1
  id: deploy
  with:
    control-plane-mode: self-hosted
    control-plane-url: https://console.example.com
    appaloft-token: ${{ secrets.APPALOFT_TOKEN }}
    server-config-deploy: true
    config: appaloft.preview.yml
    preview: pull-request
    preview-id: pr-${{ github.event.pull_request.number }}
    preview-domain-template: pr-${{ github.event.pull_request.number }}.preview.example.com
    preview-tls-mode: disabled
    require-preview-url: true
```

Server mode 的 preview deploy 会使用 preview-scoped source fingerprint，并输出 `preview-id`、`deployment-id`、`console-url`，配置了预览域名时也会输出 `preview-url`。Preview fingerprint 会独立于生产分支目标解析，除非已有 accepted preview binding 或 token/source scope 明确选择同一个目标。`preview-domain-template` 和 `preview-tls-mode` 会作为 transient server-side preview route intent 应用；`environment-variables` 和 `secret-variables` 可以携带预览环境专用的运行时值。Preview cleanup 会从 preview source-link state 解析上下文，不接受 project/resource/server ids。

非 secret 的 control-plane connection policy 也可以写在 `appaloft.yml`：

```yaml
controlPlane:
  mode: self-hosted
  url: https://console.example.com
```

Token、SSH、database identity、organization/tenant/provider account identity 和 broad target identity 不要写进 committed config。Project、environment、resource 和 server ids 只是可选高级 bootstrap context；普通 self-hosted Action deploy 应让 source link、token scope、source binding 或 Appaloft server 解析它们。
`controlPlane.deploymentContext` 是例外的 narrow bootstrap/advanced override 字段，只应用于有意绑定仓库到已有 self-hosted project/environment/resource/server 的场景；它不是普通用户每个 workflow 都要维护的默认输入。

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

Secrets 应来自 GitHub Secrets 或其他可信 workflow secret store，并通过 `ci-env:NAME` 这类 secret reference 传入。不要把 SSH key、token、database URL、生产 secret value，或 Appaloft project/resource/server identity 写进 `appaloft.yml`。只有一次性 bootstrap 或 advanced override 才应使用 narrow `controlPlane.deploymentContext`。

<h2 id="product-grade-preview-deployments">Product-grade control-plane previews</h2>

Product-grade preview 是由 Appaloft Cloud 或 self-hosted control plane 拥有的 workflow。它和用户自己维护 workflow file 的 Action-only preview 不是同一个产品形态。

这个产品线使用 signed GitHub webhooks、preview policy、fork/secret policy、preview environment list/show/delete、comments/checks/status feedback、cleanup retries、quotas、audit，以及 managed domain follow-up。即便如此，控制平面选择或创建 preview context 之后，真正部署仍必须通过 ids-only `deployments.create`。

`preview.pullRequest.policy` 可以声明 `environmentProfileBaseEnvironmentId`，让 preview 从一个安全的 Environment Profile base 派生；这个值只作为 policy/read-model context，不会加入 `deployments.create`。

Preview environment 是所选 Resource 下面的临时派生运行环境，不是和主要 Resource 平级的长期资源。Resource detail 的预览区域显示这个 Resource 的 pull request 预览、过期时间、source fingerprint 和清理状态。全局 preview environment 页面只作为跨项目排查 rollup；日常查看和清理应优先从 Resource 进入。

如果 GitHub close event、provider callback 或 workflow cleanup 没有可靠触发，控制面仍保留补偿路径：关闭 PR 的 webhook 会按 preview source scope 触发清理；Resource 预览区域和 preview detail 可以手动请求 `preview-environments.delete`；cleanup 本身是幂等的，并且 retryable 的 runtime、route、source-link、provider metadata 或 feedback 失败会留下安全 retry/manual-review 状态。

对于 self-hosted control plane，webhook verification 使用 `APPALOFT_GITHUB_WEBHOOK_SECRET`。当 webhook 或 cleanup scheduler 这类 worker context 中没有 request-scoped GitHub connection 时，worker-side feedback publishing 使用 `APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN`。

当你需要 Appaloft 统一拥有 preview orchestration、policy、feedback、cleanup retries 和团队可见 audit，而不是让每个仓库维护自己的 workflow file 时，使用 product-grade preview。

<h2 id="deployment-preview-troubleshooting">Troubleshoot previews</h2>

常见检查：

- 没有 preview URL：确认 generated access readiness 或 wildcard DNS，再决定 workflow 是否应使用 `--require-preview-url`。
- 路由不符合预期：确认 preview domain template 来自可信 workflow 输入，而不是生产 `access.domains[]`。
- 重复部署：确认同一个 pull request 使用稳定的 preview id，且 cleanup 没有使用另一个 id。
- cleanup 没有效果：确认 close-event workflow 使用了与 deploy 相同的 preview type、preview id、source path 和 config path。
- fork 被跳过：在暴露部署凭据前，先确认 pull request 来源仓库是否可信。
