import type {
  DependencyResourceSecretStore,
  ExecutionContext,
} from "@appaloft/application";
import {
  domainError,
  err,
  ok,
  type Deployment,
  type DeploymentDependencyBindingReferenceState,
  type DeploymentState,
  type Result,
} from "@appaloft/core";

import { requireServerBackedDeploymentState } from "./deployment-target";
import type { DockerEnvironmentVariableInput } from "./runtime-commands";

const appaloftOwnedDependencySecretRefPrefixes = [
  "appaloft://dependency-resources/",
  "appaloft+pg://resource-binding/",
];

export interface DependencyRuntimeEnvironment {
  env: NodeJS.ProcessEnv;
  redactions: string[];
  dependencyTargetNames: Set<string>;
}

const appaloftDeploymentRuntimeEnvironmentKeys = new Set([
  "APPALOFT_DEPLOYMENT_ID",
  "APPALOFT_PROJECT_ID",
  "APPALOFT_ENVIRONMENT_ID",
  "APPALOFT_RESOURCE_ID",
  "APPALOFT_DESTINATION_ID",
]);

export function isAppaloftManagedRuntimeEnvironmentKey(key: string): boolean {
  return appaloftDeploymentRuntimeEnvironmentKeys.has(key);
}

export function runtimeContainerEnvironmentVariables(input: {
  env: NodeJS.ProcessEnv;
  state: DeploymentState;
  dependencyTargetNames: ReadonlySet<string>;
}): DockerEnvironmentVariableInput[] {
  return Object.entries(input.env)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .filter(
      ([key]) =>
        key === "PORT" ||
        isAppaloftManagedRuntimeEnvironmentKey(key) ||
        input.dependencyTargetNames.has(key) ||
        input.state.environmentSnapshot.variables.some((variable) => variable.key === key),
    )
    .map(([name, value]) => {
      const snapshotVariable = input.state.environmentSnapshot.variables.find(
        (variable) => variable.key === name,
      );
      return {
        name,
        value,
        ...(snapshotVariable?.isSecret || input.dependencyTargetNames.has(name)
          ? { redacted: true }
          : {}),
      };
    });
}

function isInjectableDependencyReference(
  reference: DeploymentDependencyBindingReferenceState,
): boolean {
  return (
    Boolean(reference.runtimeSecretRef) &&
    reference.snapshotReadiness.isReady() &&
    reference.scope.value === "runtime-only" &&
    reference.injectionMode.value === "env"
  );
}

function isAppaloftOwnedDependencySecretRef(secretRef: string): boolean {
  return appaloftOwnedDependencySecretRefPrefixes.some((prefix) => secretRef.startsWith(prefix));
}

async function resolveDependencyRuntimeSecretValue(input: {
  context: ExecutionContext;
  dependencyResourceSecretStore: DependencyResourceSecretStore | undefined;
  reference: DeploymentDependencyBindingReferenceState;
}): Promise<Result<string>> {
  const secretRef = input.reference.runtimeSecretRef?.value;
  if (!secretRef) {
    return err(
      domainError.dependencyRuntimeInjectionBlocked(
        "Dependency runtime secret reference is missing",
        {
          reason: "dependency_runtime_injection_secret_ref_missing",
          bindingCount: 1,
          targetName: input.reference.targetName.value,
        },
      ),
    );
  }

  if (!isAppaloftOwnedDependencySecretRef(secretRef)) {
    return ok(secretRef);
  }

  if (!input.dependencyResourceSecretStore) {
    return err(
      domainError.dependencyRuntimeInjectionBlocked(
        "Dependency runtime secret resolver is not configured",
        {
          reason: "dependency_runtime_secret_resolver_unavailable",
          bindingCount: 1,
          targetName: input.reference.targetName.value,
        },
      ),
    );
  }

  const resolved = await input.dependencyResourceSecretStore.resolve(input.context, {
    secretRef,
  });
  if (resolved.isErr()) {
    return err(
      domainError.dependencyRuntimeInjectionBlocked(
        "Dependency runtime secret could not be resolved",
        {
          reason: "dependency_runtime_secret_unresolved",
          bindingCount: 1,
          targetName: input.reference.targetName.value,
        },
      ),
    );
  }

  return ok(resolved.value.secretValue);
}

export async function resolveDependencyRuntimeEnvironment(input: {
  context: ExecutionContext;
  deployment: Deployment;
  dependencyResourceSecretStore: DependencyResourceSecretStore | undefined;
  port?: number;
  baseEnv?: NodeJS.ProcessEnv;
  includeDependencyRuntimeSecrets?: boolean;
}): Promise<Result<DependencyRuntimeEnvironment>> {
  const state = requireServerBackedDeploymentState(
    input.deployment,
    "dependency runtime environment resolution",
  );
  const env = {
    ...(input.baseEnv ?? process.env),
    APPALOFT_DEPLOYMENT_ID: state.id.value,
    APPALOFT_PROJECT_ID: state.projectId.value,
    APPALOFT_ENVIRONMENT_ID: state.environmentId.value,
    APPALOFT_RESOURCE_ID: state.resourceId.value,
    APPALOFT_DESTINATION_ID: state.destinationId.value,
  } as NodeJS.ProcessEnv;
  const redactions: string[] = [];
  const dependencyTargetNames = new Set<string>();

  for (const variable of state.environmentSnapshot.variables) {
    env[variable.key] = variable.value;
    if (variable.isSecret) {
      redactions.push(variable.value);
    }
  }

  if (input.includeDependencyRuntimeSecrets !== false) {
    for (const reference of state.dependencyBindingReferences) {
      if (!isInjectableDependencyReference(reference)) {
        continue;
      }
      const resolved = await resolveDependencyRuntimeSecretValue({
        context: input.context,
        dependencyResourceSecretStore: input.dependencyResourceSecretStore,
        reference,
      });
      if (resolved.isErr()) {
        return err(resolved.error);
      }
      env[reference.targetName.value] = resolved.value;
      redactions.push(resolved.value);
      dependencyTargetNames.add(reference.targetName.value);
    }
  }

  if (input.port) {
    env.PORT = String(input.port);
  }

  return ok({ env, redactions, dependencyTargetNames });
}
