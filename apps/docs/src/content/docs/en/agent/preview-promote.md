---
title: "Preview and promote"
description: "Freeze a Sandbox workspace into an immutable Source Artifact, then explicitly promote it to production delivery."
docType: task
localeState: { zh-CN: complete, en-US: complete }
searchAliases: ["Source Artifact", "Candidate Preview", "Sandbox Promotion"]
relatedOperations: [sandboxes.sourceArtifacts.create, sandboxes.candidatePreviews.create, sandboxes.promotions.plan, sandboxes.promotions.accept]
sidebar: { label: "Preview and promote", order: 2 }
---

> Maturity: **Private preview**. Immutable capture, exact-digest candidates, and durable Promotion
> are implemented. Candidate Preview currently covers statically publishable output.

# From workspace to candidate

Capture requires a ready Sandbox with no active Run. It validates relative paths, file count, and
total size; hashes every file; and hashes an ordered safe manifest. Preview then reads only the
Artifact Store, never the mutable live workspace.

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

In a product, stop after `plan` by default. Show the candidate URL and exact digest to the user,
then call `accept` only from an explicit external control-plane action:

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

The plan binds the artifact digest, verified candidate, target, and expiry. Accept is an external
control-plane action; a Runtime or harness identity cannot self-publish. The durable workflow saves
Resource and Deployment checkpoints so restart does not duplicate an already recorded Resource.

See the complete [Preview-to-Promotion example](https://github.com/appaloft/examples/blob/main/sandbox-agent/src/preview-promote.ts),
including digest verification and the opt-in acceptance gate.
