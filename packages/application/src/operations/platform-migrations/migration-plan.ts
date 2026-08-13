import { createHash } from "node:crypto";

import { type Result } from "@appaloft/core";
import { z } from "zod";

import {
  type MigrationBundle,
  type MigrationBundleInput,
  parseMigrationBundle,
} from "./migration-bundle";

export type MigrationPlanState = "ready" | "blocked";

export interface MigrationPlanReference {
  readonly $ref: string;
}

export interface MigrationPlanSecretReference {
  readonly $secretRef: string;
}

export interface MigrationPlanStep {
  readonly id: string;
  readonly operationKey: string;
  readonly dependsOn: readonly string[];
  readonly input: Readonly<Record<string, unknown>>;
  readonly produces?: Readonly<Record<string, string>> | undefined;
  readonly cleanup?:
    | {
        readonly operationKey: string;
        readonly ownership: "created-by-receipt";
        readonly input?: Readonly<Record<string, unknown>> | undefined;
      }
    | undefined;
}

export interface MigrationPlanBlocker {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface MigrationPlan {
  readonly protocol: "platform-migration/v1";
  readonly state: MigrationPlanState;
  readonly bundleDigest: string;
  readonly planDigest: string;
  readonly steps: readonly MigrationPlanStep[];
  readonly blockers: readonly MigrationPlanBlocker[];
  readonly warnings: readonly string[];
}

const migrationPlanStepSchema = z
  .object({
    id: z.string().trim().min(1),
    operationKey: z.string().trim().min(1),
    dependsOn: z.array(z.string().trim().min(1)).readonly(),
    input: z.record(z.string(), z.unknown()),
    produces: z.record(z.string(), z.string().trim().min(1)).optional(),
    cleanup: z
      .object({
        operationKey: z.string().trim().min(1),
        ownership: z.literal("created-by-receipt"),
        input: z.record(z.string(), z.unknown()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const migrationPlanBlockerSchema = z
  .object({
    code: z.string().trim().min(1),
    path: z.string().trim().min(1),
    message: z.string().trim().min(1),
  })
  .strict();

export const migrationPlanSchema = z
  .object({
    protocol: z.literal("platform-migration/v1"),
    state: z.enum(["ready", "blocked"]),
    bundleDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    planDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    steps: z.array(migrationPlanStepSchema).readonly(),
    blockers: z.array(migrationPlanBlockerSchema).readonly(),
    warnings: z.array(z.string()).readonly(),
  })
  .strict();

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function outputReference(stepId: string, output: string): MigrationPlanReference {
  return { $ref: `steps.${stepId}.output.${output}` };
}

function migrationVariableValue(variable: MigrationBundle["spec"]["variables"][number]) {
  return variable.secretRef ? { $secretRef: variable.secretRef } : (variable.value ?? "");
}

function collectMigrationBlockers(bundle: MigrationBundle): MigrationPlanBlocker[] {
  const resourceRefs = new Set(bundle.spec.resources.map((resource) => resource.ref));
  const blockers: MigrationPlanBlocker[] = [...bundle.spec.sourceBlockers];
  const requireResource = (input: {
    ownerKind: "Variable" | "Dependency binding" | "Volume" | "Domain";
    ownerRef: string;
    resourceRef: string;
    path: string;
  }) => {
    if (!resourceRefs.has(input.resourceRef)) {
      blockers.push({
        code: "unknown_resource_ref",
        path: input.path,
        message: `${input.ownerKind} "${input.ownerRef}" references unknown resource "${input.resourceRef}".`,
      });
    }
  };

  for (const variable of bundle.spec.variables) {
    if (variable.resourceRef) {
      requireResource({
        ownerKind: "Variable",
        ownerRef: variable.key,
        resourceRef: variable.resourceRef,
        path: `spec.variables.${variable.key}.resourceRef`,
      });
    }
  }
  for (const dependency of bundle.spec.dependencies) {
    for (const binding of dependency.bindings) {
      requireResource({
        ownerKind: "Dependency binding",
        ownerRef: `${dependency.ref}:${binding.targetName}`,
        resourceRef: binding.resourceRef,
        path: `spec.dependencies.${dependency.ref}.bindings.${binding.targetName}.resourceRef`,
      });
    }
  }
  for (const volume of bundle.spec.volumes) {
    requireResource({
      ownerKind: "Volume",
      ownerRef: volume.ref,
      resourceRef: volume.resourceRef,
      path: `spec.volumes.${volume.ref}.resourceRef`,
    });
  }
  for (const domain of bundle.spec.domains) {
    requireResource({
      ownerKind: "Domain",
      ownerRef: domain.hostname,
      resourceRef: domain.resourceRef,
      path: `spec.domains.${domain.hostname}.resourceRef`,
    });
  }

  return blockers.sort((left, right) => left.path.localeCompare(right.path));
}

function planFreshApplication(bundle: MigrationBundle): readonly MigrationPlanStep[] {
  const projectStepId = "project:create";
  const environmentStepId = "environment:create";
  const steps: MigrationPlanStep[] = [
    {
      id: projectStepId,
      operationKey: "projects.create",
      dependsOn: [],
      input: bundle.spec.project,
      produces: { projectId: "id" },
      cleanup: { operationKey: "projects.archive", ownership: "created-by-receipt" },
    },
    {
      id: environmentStepId,
      operationKey: "environments.create",
      dependsOn: [projectStepId],
      input: {
        projectId: outputReference(projectStepId, "projectId"),
        name: bundle.spec.environment.name,
        kind: bundle.spec.environment.kind,
      },
      produces: { environmentId: "id" },
      cleanup: { operationKey: "environments.archive", ownership: "created-by-receipt" },
    },
  ];

  for (const variable of bundle.spec.variables.filter((candidate) => !candidate.resourceRef)) {
    steps.push({
      id: `environment-variable:${variable.key}`,
      operationKey: "environments.set-variable",
      dependsOn: [environmentStepId],
      input: {
        environmentId: outputReference(environmentStepId, "environmentId"),
        key: variable.key,
        value: migrationVariableValue(variable),
        kind: variable.kind,
        exposure: variable.exposure,
        scope: "environment",
        isSecret: variable.kind === "secret",
      },
      cleanup: { operationKey: "environments.unset-variable", ownership: "created-by-receipt" },
    });
  }

  for (const dependency of bundle.spec.dependencies) {
    const dependencyStepId = `dependency:create:${dependency.ref}`;
    const commonInput = {
      kind: dependency.kind,
      projectId: outputReference(projectStepId, "projectId"),
      environmentId: outputReference(environmentStepId, "environmentId"),
      name: dependency.name,
      capabilities: [],
      backupRelationship: { retentionRequired: false },
    };
    steps.push({
      id: dependencyStepId,
      operationKey:
        dependency.sourceMode === "imported-external"
          ? "dependency-resources.import"
          : "dependency-resources.provision",
      dependsOn: [environmentStepId],
      input:
        dependency.sourceMode === "imported-external"
          ? {
              ...commonInput,
              connectionUrl: dependency.connectionSecretRef
                ? { $secretRef: dependency.connectionSecretRef }
                : "",
            }
          : {
              ...commonInput,
              serverId: bundle.spec.target.deploymentTargetId,
              providerKey: dependency.providerKey,
            },
      produces: { dependencyResourceId: "id" },
      cleanup: {
        operationKey: "dependency-resources.delete",
        ownership: "created-by-receipt",
      },
    });
  }

  for (const volume of bundle.spec.volumes) {
    steps.push({
      id: `volume:create:${volume.ref}`,
      operationKey: "storage-volumes.create",
      dependsOn: [environmentStepId],
      input: {
        projectId: outputReference(projectStepId, "projectId"),
        environmentId: outputReference(environmentStepId, "environmentId"),
        name: volume.name,
        kind: "named-volume",
        backupRelationship: { retentionRequired: false },
      },
      produces: { storageVolumeId: "id" },
      cleanup: {
        operationKey: "storage-volumes.delete",
        ownership: "created-by-receipt",
        input: { serverId: bundle.spec.target.deploymentTargetId },
      },
    });
  }

  for (const resource of bundle.spec.resources) {
    const resourceStepId = `resource:create:${resource.ref}`;
    steps.push({
      id: resourceStepId,
      operationKey: "resources.create",
      dependsOn: [environmentStepId],
      input: {
        projectId: outputReference(projectStepId, "projectId"),
        environmentId: outputReference(environmentStepId, "environmentId"),
        destinationId: bundle.spec.target.destinationId,
        name: resource.name,
        kind: resource.kind,
        services: resource.services,
        description: resource.description,
        source: resource.source,
        runtimeProfile: resource.runtime,
        networkProfile: resource.network,
      },
      produces: { resourceId: "id" },
      cleanup: { operationKey: "resources.delete", ownership: "created-by-receipt" },
    });

    for (const variable of bundle.spec.variables.filter(
      (candidate) => candidate.resourceRef === resource.ref,
    )) {
      steps.push({
        id: `resource-variable:${resource.ref}:${variable.key}`,
        operationKey: "resources.set-variable",
        dependsOn: [resourceStepId],
        input: {
          resourceId: outputReference(resourceStepId, "resourceId"),
          key: variable.key,
          value: migrationVariableValue(variable),
          kind: variable.kind,
          exposure: variable.exposure,
          isSecret: variable.kind === "secret",
        },
        cleanup: { operationKey: "resources.unset-variable", ownership: "created-by-receipt" },
      });
    }

    const deploymentDependencies = [resourceStepId];
    for (const dependency of bundle.spec.dependencies) {
      for (const binding of dependency.bindings.filter(
        (candidate) => candidate.resourceRef === resource.ref,
      )) {
        const dependencyStepId = `dependency:create:${dependency.ref}`;
        const bindingStepId = `dependency:bind:${dependency.ref}:${resource.ref}:${binding.targetName}`;
        steps.push({
          id: bindingStepId,
          operationKey: "resources.bind-dependency",
          dependsOn: [resourceStepId, dependencyStepId],
          input: {
            resourceId: outputReference(resourceStepId, "resourceId"),
            dependencyResourceId: outputReference(dependencyStepId, "dependencyResourceId"),
            targetName: binding.targetName,
            scope: binding.scope,
            injectionMode: binding.injectionMode,
          },
          produces: { bindingId: "id" },
          cleanup: { operationKey: "resources.unbind-dependency", ownership: "created-by-receipt" },
        });
        deploymentDependencies.push(bindingStepId);
      }
    }

    for (const volume of bundle.spec.volumes.filter(
      (candidate) => candidate.resourceRef === resource.ref,
    )) {
      const volumeStepId = `volume:create:${volume.ref}`;
      const attachmentStepId = `volume:attach:${volume.ref}:${resource.ref}`;
      steps.push({
        id: attachmentStepId,
        operationKey: "resources.attach-storage",
        dependsOn: [resourceStepId, volumeStepId],
        input: {
          resourceId: outputReference(resourceStepId, "resourceId"),
          storageVolumeId: outputReference(volumeStepId, "storageVolumeId"),
          destinationPath: volume.mountPath,
          mountMode: "read-write",
        },
        produces: { attachmentId: "id" },
        cleanup: { operationKey: "resources.detach-storage", ownership: "created-by-receipt" },
      });
      deploymentDependencies.push(attachmentStepId);
    }

    for (const domain of bundle.spec.domains.filter(
      (candidate) => candidate.resourceRef === resource.ref,
    )) {
      const domainStepId = `domain:create:${domain.hostname}`;
      steps.push({
        id: domainStepId,
        operationKey: "domain-bindings.create",
        dependsOn: [resourceStepId],
        input: {
          projectId: outputReference(projectStepId, "projectId"),
          environmentId: outputReference(environmentStepId, "environmentId"),
          resourceId: outputReference(resourceStepId, "resourceId"),
          serverId: bundle.spec.target.deploymentTargetId,
          destinationId: bundle.spec.target.destinationId,
          domainName: domain.hostname,
          proxyKind: "caddy",
          tlsMode: domain.tlsPolicy === "disabled" ? "disabled" : "auto",
          certificatePolicy:
            domain.tlsPolicy === "automatic"
              ? "auto"
              : domain.tlsPolicy === "manual"
                ? "manual"
                : "disabled",
        },
        produces: { domainBindingId: "id" },
        cleanup: { operationKey: "domain-bindings.delete", ownership: "created-by-receipt" },
      });
      deploymentDependencies.push(domainStepId);
    }

    steps.push({
      id: `deployment:create:${resource.ref}`,
      operationKey: "deployments.create",
      dependsOn: deploymentDependencies,
      input: {
        projectId: outputReference(projectStepId, "projectId"),
        environmentId: outputReference(environmentStepId, "environmentId"),
        resourceId: outputReference(resourceStepId, "resourceId"),
        serverId: bundle.spec.target.deploymentTargetId,
        destinationId: bundle.spec.target.destinationId,
        executionMode: "synchronous",
      },
      produces: { deploymentId: "id" },
      cleanup: { operationKey: "deployments.archive", ownership: "created-by-receipt" },
    });
  }

  return steps;
}

export function createMigrationPlan(input: MigrationBundleInput | unknown): Result<MigrationPlan> {
  return parseMigrationBundle(input).map((bundle) => {
    const bundleDigest = sha256(bundle);
    const steps = planFreshApplication(bundle);
    const blockers = collectMigrationBlockers(bundle);
    const warnings: string[] = [];
    const planWithoutDigest = {
      protocol: "platform-migration/v1" as const,
      state: blockers.length === 0 ? ("ready" as const) : ("blocked" as const),
      bundleDigest,
      steps,
      blockers,
      warnings,
    };

    return {
      ...planWithoutDigest,
      planDigest: sha256(planWithoutDigest),
    };
  });
}
