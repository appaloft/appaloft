import { customAlphabet } from "nanoid";

import {
  type ConfigureResourceHealthInput,
  type ConfigureResourceHealthResponse,
  type ConfigureResourceNetworkInput,
  type ConfigureResourceRuntimeInput,
  type ConfigureResourceSourceInput,
  type ConfigureResourceSourceResponse,
  type ConfigureServerCredentialInput,
  type CreateDeploymentInput,
  type CreateDeploymentResponse,
  type CreateEnvironmentInput,
  type CreateEnvironmentResponse,
  type CreateProjectInput,
  type CreateProjectResponse,
  type CreateResourceInput,
  type CreateResourceResponse,
  type CreateSshCredentialInput,
  type CreateSshCredentialResponse,
  type DependencyResourceCapabilityRequirement,
  type DependencyResourceSummary,
  type RegisterServerInput,
  type RegisterServerResponse,
  type SetEnvironmentVariableInput,
} from "./index";

const generatedNameAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
const generatedResourceNameSuffixLength = 6;
const generateQuickDeployNameSuffix = customAlphabet(
  generatedNameAlphabet,
  generatedResourceNameSuffixLength,
);

export type QuickDeployReference<CreateInput> =
  | {
      mode: "existing";
      id: string;
    }
  | {
      mode: "create";
      input: CreateInput;
    };

export type QuickDeployCreateEnvironmentInput = Omit<CreateEnvironmentInput, "projectId"> & {
  projectId?: string;
};

export type QuickDeployCreateResourceInput = Omit<
  CreateResourceInput,
  "projectId" | "environmentId"
> & {
  projectId?: string;
  environmentId?: string;
};

export type QuickDeployEnvironmentVariableInput = SetEnvironmentVariableInput & {
  environmentId?: string;
};

export type QuickDeploySetEnvironmentVariableInput = SetEnvironmentVariableInput & {
  environmentId: string;
};

export type QuickDeployDependencyBindingInput = {
  targetName?: string;
  scope?: "environment" | "release" | "build-only" | "runtime-only";
  injectionMode?: "env" | "file" | "reference";
};

export type QuickDeployDependencyProvisioningInput =
  | {
      mode: "create";
      requirementId: string;
      kind: DependencyResourceSummary["kind"];
      name: string;
      providerKey?: string;
      serverId?: string;
      capabilities?: DependencyResourceCapabilityRequirement[];
      description?: string;
      binding?: QuickDeployDependencyBindingInput;
    }
  | {
      mode: "reuse";
      requirementId: string;
      kind: DependencyResourceSummary["kind"];
      name: string;
      connectionUrl: string;
      secretRef?: string;
      connectionSecret?: string;
      capabilities?: DependencyResourceCapabilityRequirement[];
      description?: string;
      binding?: QuickDeployDependencyBindingInput;
    };

export type QuickDeployProvisionDependencyResourcesInput = {
  projectId: string;
  environmentId: string;
  resourceId: string;
  items: QuickDeployDependencyProvisioningInput[];
};

export type QuickDeployProvisionDependencyResourcesResponse = {
  dependencyResourceIds: string[];
  bindingIds: string[];
};

export type QuickDeployServerCredential =
  | {
      mode: "configure";
      credential: ConfigureServerCredentialInput["credential"];
    }
  | {
      mode: "create-ssh-and-configure";
      input: CreateSshCredentialInput;
    };

export type QuickDeployServerReference =
  | {
      mode: "existing";
      id: string;
      credential?: QuickDeployServerCredential;
    }
  | {
      mode: "create";
      input: RegisterServerInput;
      credential?: QuickDeployServerCredential;
    };

export type QuickDeployResourceReference =
  | {
      mode: "existing";
      id: string;
      configureSource?: Omit<ConfigureResourceSourceInput, "resourceId">;
      configureNetwork?: Omit<ConfigureResourceNetworkInput, "resourceId">;
      configureRuntime?: Omit<ConfigureResourceRuntimeInput, "resourceId">;
      configureHealth?: Omit<ConfigureResourceHealthInput, "resourceId">;
    }
  | {
      mode: "create";
      input: QuickDeployCreateResourceInput;
    };

export type QuickDeployWorkflowInput = {
  project: QuickDeployReference<CreateProjectInput>;
  server: QuickDeployServerReference;
  environment: QuickDeployReference<QuickDeployCreateEnvironmentInput>;
  resource: QuickDeployResourceReference;
  environmentVariable?: QuickDeployEnvironmentVariableInput;
  environmentVariables?: QuickDeployEnvironmentVariableInput[];
  dependencyProvisioning?: QuickDeployDependencyProvisioningInput[];
  deployment?: {
    destinationId?: string;
  };
};

export type QuickDeployWorkflowResult = {
  projectId: string;
  serverId: string;
  environmentId: string;
  resourceId: string;
  deploymentId: string;
};

export type QuickDeployOutcomeAccess =
  | {
      status: "available";
      url: string;
    }
  | {
      status: "pending" | "unavailable" | "unknown";
      url?: string;
      reason?: string;
    };

export type QuickDeployOutcomePacket = QuickDeployWorkflowResult & {
  access: QuickDeployOutcomeAccess;
  commands: {
    openDeployment: string;
    openResource: string;
    logs: string;
    diagnosticSummary: string;
    recoveryReadiness: string;
  };
};

export function createQuickDeployOutcomePacket(
  result: QuickDeployWorkflowResult,
  input: {
    access?: QuickDeployOutcomeAccess;
  } = {},
): QuickDeployOutcomePacket {
  return {
    ...result,
    access: input.access ?? { status: "unknown" },
    commands: {
      openDeployment: `appaloft deployments show ${result.deploymentId}`,
      openResource: `appaloft resource show ${result.resourceId}`,
      logs: `appaloft logs ${result.deploymentId}`,
      diagnosticSummary: `appaloft resource diagnose ${result.resourceId}`,
      recoveryReadiness: `appaloft deployments recovery-readiness ${result.deploymentId}`,
    },
  };
}

export type QuickDeployWorkflowStep =
  | {
      kind: "projects.create";
      input: CreateProjectInput;
    }
  | {
      kind: "servers.register";
      input: RegisterServerInput;
    }
  | {
      kind: "credentials.ssh.create";
      input: CreateSshCredentialInput;
    }
  | {
      kind: "servers.configureCredential";
      input: ConfigureServerCredentialInput;
    }
  | {
      kind: "environments.create";
      input: CreateEnvironmentInput;
    }
  | {
      kind: "resources.create";
      input: CreateResourceInput;
    }
  | {
      kind: "resources.configureSource";
      input: ConfigureResourceSourceInput;
    }
  | {
      kind: "resources.configureNetwork";
      input: ConfigureResourceNetworkInput;
    }
  | {
      kind: "resources.configureRuntime";
      input: ConfigureResourceRuntimeInput;
    }
  | {
      kind: "resources.configureHealth";
      input: ConfigureResourceHealthInput;
    }
  | {
      kind: "environments.setVariable";
      input: QuickDeploySetEnvironmentVariableInput;
    }
  | {
      kind: "dependencyResources.provision";
      input: QuickDeployProvisionDependencyResourcesInput;
    }
  | {
      kind: "deployments.create";
      input: CreateDeploymentInput;
    };

export type QuickDeployWorkflowStepOutput =
  | CreateProjectResponse
  | RegisterServerResponse
  | CreateSshCredentialResponse
  | CreateEnvironmentResponse
  | CreateResourceResponse
  | ConfigureResourceSourceResponse
  | ConfigureResourceHealthResponse
  | CreateDeploymentResponse
  | QuickDeployProvisionDependencyResourcesResponse
  | void;

export type QuickDeployWorkflowExecutor = (
  step: QuickDeployWorkflowStep,
) => QuickDeployWorkflowStepOutput | Promise<QuickDeployWorkflowStepOutput>;

export function normalizeQuickDeployGeneratedNameBase(value: string, fallback = "app"): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/\.git$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

export function createQuickDeployGeneratedNameSuffix(length = generatedResourceNameSuffixLength) {
  if (length === generatedResourceNameSuffixLength) {
    return generateQuickDeployNameSuffix();
  }

  return customAlphabet(generatedNameAlphabet, length)();
}

export function createQuickDeployGeneratedResourceName(
  baseName: string,
  suffix = createQuickDeployGeneratedNameSuffix(),
): string {
  return `${normalizeQuickDeployGeneratedNameBase(baseName)}-${suffix}`;
}

export function* quickDeployWorkflow(
  input: QuickDeployWorkflowInput,
): Generator<QuickDeployWorkflowStep, QuickDeployWorkflowResult, QuickDeployWorkflowStepOutput> {
  const projectId =
    input.project.mode === "existing"
      ? input.project.id
      : readStepId(
          yield { kind: "projects.create", input: input.project.input },
          "projects.create",
        );

  const serverId =
    input.server.mode === "existing"
      ? input.server.id
      : readStepId(
          yield { kind: "servers.register", input: input.server.input },
          "servers.register",
        );

  if (input.server.credential) {
    if (input.server.credential.mode === "create-ssh-and-configure") {
      const createdCredentialId = readStepId(
        yield {
          kind: "credentials.ssh.create",
          input: input.server.credential.input,
        },
        "credentials.ssh.create",
      );

      yield {
        kind: "servers.configureCredential",
        input: {
          serverId,
          credential: {
            kind: "stored-ssh-private-key",
            credentialId: createdCredentialId,
            ...(input.server.credential.input.username
              ? { username: input.server.credential.input.username }
              : {}),
          },
        },
      };
    } else {
      yield {
        kind: "servers.configureCredential",
        input: {
          serverId,
          credential: input.server.credential.credential,
        },
      };
    }
  }

  const environmentId =
    input.environment.mode === "existing"
      ? input.environment.id
      : readStepId(
          yield {
            kind: "environments.create",
            input: {
              ...input.environment.input,
              projectId: input.environment.input.projectId ?? projectId,
            },
          },
          "environments.create",
        );

  const resourceId =
    input.resource.mode === "existing"
      ? input.resource.id
      : readStepId(
          yield {
            kind: "resources.create",
            input: {
              ...input.resource.input,
              projectId: input.resource.input.projectId ?? projectId,
              environmentId: input.resource.input.environmentId ?? environmentId,
            },
          },
          "resources.create",
        );

  if (input.resource.mode === "existing" && input.resource.configureSource) {
    yield {
      kind: "resources.configureSource",
      input: {
        resourceId,
        ...input.resource.configureSource,
      },
    };
  }

  if (input.resource.mode === "existing" && input.resource.configureRuntime) {
    yield {
      kind: "resources.configureRuntime",
      input: {
        resourceId,
        ...input.resource.configureRuntime,
      },
    };
  }

  if (input.resource.mode === "existing" && input.resource.configureHealth) {
    yield {
      kind: "resources.configureHealth",
      input: {
        resourceId,
        ...input.resource.configureHealth,
      },
    };
  }

  if (input.resource.mode === "existing" && input.resource.configureNetwork) {
    yield {
      kind: "resources.configureNetwork",
      input: {
        resourceId,
        ...input.resource.configureNetwork,
      },
    };
  }

  for (const environmentVariable of [
    ...(input.environmentVariable ? [input.environmentVariable] : []),
    ...(input.environmentVariables ?? []),
  ]) {
    yield {
      kind: "environments.setVariable",
      input: {
        ...environmentVariable,
        environmentId: environmentVariable.environmentId ?? environmentId,
      },
    };
  }

  if (input.dependencyProvisioning && input.dependencyProvisioning.length > 0) {
    yield {
      kind: "dependencyResources.provision",
      input: {
        projectId,
        environmentId,
        resourceId,
        items: input.dependencyProvisioning.map((item) =>
          item.mode === "create" && !item.serverId
            ? {
                ...item,
                serverId,
              }
            : item,
        ),
      },
    };
  }

  const deploymentId = readStepId(
    yield {
      kind: "deployments.create",
      input: {
        projectId,
        serverId,
        ...(input.deployment?.destinationId
          ? { destinationId: input.deployment.destinationId }
          : {}),
        environmentId,
        resourceId,
      },
    },
    "deployments.create",
  );

  return {
    projectId,
    serverId,
    environmentId,
    resourceId,
    deploymentId,
  };
}

export async function runQuickDeployWorkflow(
  input: QuickDeployWorkflowInput,
  execute: QuickDeployWorkflowExecutor,
): Promise<QuickDeployWorkflowResult> {
  const workflow = quickDeployWorkflow(input);
  let state = workflow.next();

  while (!state.done) {
    state = workflow.next(await execute(state.value));
  }

  return state.value;
}

function readStepId(output: QuickDeployWorkflowStepOutput, stepKind: string): string {
  if (output && typeof output === "object" && "id" in output && typeof output.id === "string") {
    return output.id;
  }

  throw new Error(`${stepKind} workflow step must return an id`);
}
