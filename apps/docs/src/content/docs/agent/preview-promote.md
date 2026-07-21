---
title: "预览与 Promote"
description: "把 Sandbox 工作区冻结为不可变 Source Artifact，再显式提升为正式部署。"
docType: task
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["Source Artifact", "Candidate Preview", "Sandbox Promotion"]
relatedOperations: [sandboxes.sourceArtifacts.create, sandboxes.candidatePreviews.create, sandboxes.promotions.plan, sandboxes.promotions.accept]
sidebar: { label: "预览与 Promote", order: 2 }
---

> 成熟度：**Private preview**。不可变 capture、exact-digest candidate 与 durable Promotion 已实现；
> Candidate Preview 当前覆盖可静态发布产物。

# 从工作区到候选产物

只有 Sandbox ready 且没有 active Run 时才能 capture。Capture 会验证相对路径、文件数量和总大小，
为每个文件计算 digest，并用有序安全 manifest 计算 Source Artifact digest。后续预览只读取 Artifact
Store，不读取仍可变化的 live workspace。

```ts
const artifact = await appaloft.sandboxes.sourceArtifacts.create({ sandboxId, sourceRoot: "app" });
const preview = await appaloft.sandboxes.candidatePreviews.create({ artifactId: artifact.data.artifactId });
const plan = await appaloft.sandboxes.promotions.plan({
  sandboxId,
  artifactId: artifact.data.artifactId,
  expectedArtifactDigest: artifact.data.digest,
  candidatePreviewId: preview.data.previewId,
  target: { projectId, environmentId, destinationId, resourceName: "Generated app" },
});
await appaloft.sandboxes.promotions.accept({
  promotionId: plan.data.promotionId,
  expectedArtifactDigest: artifact.data.digest,
  idempotencyKey: crypto.randomUUID(),
});
```

在产品里应默认停在 `plan`：先把候选 URL 与精确 digest 展示给用户，只有外部控制面的显式动作才能
调用 `accept`：

```ts
if (preview.data.artifactDigest !== artifact.data.digest) throw new Error("digest mismatch");
if (userConfirmedPromotion) {
  await appaloft.sandboxes.promotions.accept({
    promotionId: plan.data.promotionId,
    expectedArtifactDigest: artifact.data.digest,
    idempotencyKey: crypto.randomUUID(),
  });
}
```

Plan 绑定 artifact digest、verified candidate、目标和 expiry。Accept 是外部控制面动作；Runtime/harness
身份不能自我发布。Durable workflow 保存 Resource 与 Deployment checkpoint，重启后不会重复创建已经
记录的 Resource。

完整的 digest 校验和 opt-in accept gate 见官方
[Preview-to-Promotion 示例](https://github.com/appaloft/examples/blob/main/sandbox-agent/src/preview-promote.ts)。
