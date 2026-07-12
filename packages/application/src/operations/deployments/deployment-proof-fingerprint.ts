import { createHash } from "node:crypto";

export interface DeploymentProofConfigurationVariable {
  key: string;
  value: string;
  kind: string;
  exposure: string;
  scope: string;
}

export function deploymentProofFingerprint(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function deploymentProofConfigurationFingerprint(
  variables: readonly DeploymentProofConfigurationVariable[],
): string {
  return deploymentProofFingerprint(
    [...variables]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((item) => [item.key, item.value, item.kind, item.exposure, item.scope]),
  );
}
