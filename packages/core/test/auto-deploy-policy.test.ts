import { describe, expect, test } from "bun:test";

import {
  GitRefText,
  ResourceAutoDeployPathPolicy,
  ResourceAutoDeployPolicy,
  ResourceAutoDeployPolicyBlockedReasonValue,
  ResourceAutoDeploySecretRef,
  ResourceAutoDeployTriggerKindValue,
  SourceBindingFingerprint,
  SourceEventKindValue,
  SourcePathPattern,
  UpdatedAt,
} from "../src";

const updatedAt = UpdatedAt.rehydrate("2026-07-20T00:00:00.000Z");
const fingerprint = SourceBindingFingerprint.create("srcfp_demo")._unsafeUnwrap();

describe("ResourceAutoDeployPolicy", () => {
  test("[CORE-AUTO-DEPLOY-001] creates an enabled git-push policy", () => {
    const policy = ResourceAutoDeployPolicy.create({
      triggerKind: ResourceAutoDeployTriggerKindValue.rehydrate("git-push"),
      refs: [GitRefText.rehydrate("main"), GitRefText.rehydrate(" main ")],
      eventKinds: [SourceEventKindValue.rehydrate("push")],
      sourceBindingFingerprint: fingerprint,
      updatedAt,
      includePaths: [SourcePathPattern.create("apps/**")._unsafeUnwrap()],
    })._unsafeUnwrap();

    expect(policy.toState().status.value).toBe("enabled");
    expect(policy.toState().refs.map((ref) => ref.value)).toEqual(["main"]);
    expect(policy.toState().includePaths?.map((path) => path.value)).toEqual(["apps/**"]);
  });

  test("[CORE-AUTO-DEPLOY-002] rejects missing refs or event kinds", () => {
    expect(
      ResourceAutoDeployPolicy.create({
        triggerKind: ResourceAutoDeployTriggerKindValue.rehydrate("git-push"),
        refs: [],
        eventKinds: [SourceEventKindValue.rehydrate("push")],
        sourceBindingFingerprint: fingerprint,
        updatedAt,
      }).isErr(),
    ).toBe(true);

    expect(
      ResourceAutoDeployPolicy.create({
        triggerKind: ResourceAutoDeployTriggerKindValue.rehydrate("git-push"),
        refs: [GitRefText.rehydrate("main")],
        eventKinds: [],
        sourceBindingFingerprint: fingerprint,
        updatedAt,
      }).isErr(),
    ).toBe(true);
  });

  test("[CORE-AUTO-DEPLOY-003] requires secret for generic signed webhook and forbids path filters", () => {
    const missingSecret = ResourceAutoDeployPolicy.create({
      triggerKind: ResourceAutoDeployTriggerKindValue.rehydrate("generic-signed-webhook"),
      refs: [GitRefText.rehydrate("main")],
      eventKinds: [SourceEventKindValue.rehydrate("push")],
      sourceBindingFingerprint: fingerprint,
      updatedAt,
    });
    expect(missingSecret.isErr()).toBe(true);

    const withPaths = ResourceAutoDeployPolicy.create({
      triggerKind: ResourceAutoDeployTriggerKindValue.rehydrate("generic-signed-webhook"),
      refs: [GitRefText.rehydrate("main")],
      eventKinds: [SourceEventKindValue.rehydrate("push")],
      sourceBindingFingerprint: fingerprint,
      updatedAt,
      genericWebhookSecretRef: ResourceAutoDeploySecretRef.create(
        "resource-secret:APPALOFT_WEBHOOK_SECRET",
      )._unsafeUnwrap(),
      includePaths: [SourcePathPattern.create("apps/**")._unsafeUnwrap()],
    });
    expect(withPaths.isErr()).toBe(true);
    expect(withPaths._unsafeUnwrapErr().message).toContain(
      "Path filters are supported only for git-push auto-deploy",
    );
  });

  test("[CORE-AUTO-DEPLOY-004] blocks when source binding fingerprint changes and can re-ack", () => {
    const policy = ResourceAutoDeployPolicy.create({
      triggerKind: ResourceAutoDeployTriggerKindValue.rehydrate("git-push"),
      refs: [GitRefText.rehydrate("main")],
      eventKinds: [SourceEventKindValue.rehydrate("push")],
      sourceBindingFingerprint: fingerprint,
      updatedAt,
    })._unsafeUnwrap();

    const unchanged = policy.blockIfSourceBindingChanged({
      currentSourceBindingFingerprint: fingerprint,
      changedAt: UpdatedAt.rehydrate("2026-07-20T00:01:00.000Z"),
    });
    expect(unchanged.toState().status.value).toBe("enabled");

    const nextFingerprint = SourceBindingFingerprint.create("srcfp_next")._unsafeUnwrap();
    const blocked = policy.blockIfSourceBindingChanged({
      currentSourceBindingFingerprint: nextFingerprint,
      changedAt: UpdatedAt.rehydrate("2026-07-20T00:02:00.000Z"),
    });
    expect(blocked.toState().status.value).toBe("blocked");
    expect(blocked.toState().blockedReason?.value).toBe(
      ResourceAutoDeployPolicyBlockedReasonValue.sourceBindingChanged().value,
    );

    const acknowledged = blocked.acknowledgeSourceBinding({
      currentSourceBindingFingerprint: nextFingerprint,
      acknowledgedAt: UpdatedAt.rehydrate("2026-07-20T00:03:00.000Z"),
    });
    expect(acknowledged.toState().status.value).toBe("enabled");
    expect(acknowledged.toState().sourceBindingFingerprint.value).toBe("srcfp_next");
  });
});

describe("ResourceAutoDeployPathPolicy", () => {
  test("[CORE-AUTO-DEPLOY-005] requires patterns and matches include then exclude", () => {
    expect(ResourceAutoDeployPathPolicy.create({}).isErr()).toBe(true);

    const policy = ResourceAutoDeployPathPolicy.create({
      includePaths: [SourcePathPattern.create("packages/**")._unsafeUnwrap()],
      excludePaths: [SourcePathPattern.create("packages/**/test/**")._unsafeUnwrap()],
    })._unsafeUnwrap();

    expect(
      policy.matchingPaths([
        "packages/core/src/index.ts",
        "packages/core/test/foo.test.ts",
        "apps/web/src/index.ts",
      ]),
    ).toEqual(["packages/core/src/index.ts"]);
  });
});
