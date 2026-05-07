import { describe, expect, test } from "bun:test";
import {
  type ExecutionBackend,
  type ExecutionContext,
  type RuntimeTargetBackend,
  type RuntimeTargetBackendDescriptor,
} from "@appaloft/application";
import {
  ok,
  type Deployment,
  type DeploymentLogEntry,
  type Result,
  type RollbackPlan,
  type TargetKind,
} from "@appaloft/core";

type RuntimeTargetAdapterConstructor = new (
  descriptor: RuntimeTargetBackendDescriptor,
  backend: ExecutionBackend,
) => RuntimeTargetBackend;

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??=
    () =>
    () => {};
}

function createContext(): ExecutionContext {
  return {
    entrypoint: "system",
    locale: "en",
    requestId: "req_runtime_target_registry",
    t: ((key: string) => key) as ExecutionContext["t"],
    tracer: {
      startActiveSpan(_name, _options, callback) {
        return Promise.resolve(
          callback({
            addEvent() {},
            recordError() {},
            setAttribute() {},
            setAttributes() {},
            setStatus() {},
          }),
        );
      },
    },
  };
}

class RecordingExecutionBackend implements ExecutionBackend {
  readonly calls: string[] = [];

  constructor(private readonly name: string) {}

  async execute(
    _context: Parameters<ExecutionBackend["execute"]>[0],
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    this.calls.push(`${this.name}:execute`);
    return ok({ deployment });
  }

  async cancel(
    _context: Parameters<ExecutionBackend["cancel"]>[0],
    _deployment: Deployment,
  ): Promise<Result<{ logs: DeploymentLogEntry[] }>> {
    this.calls.push(`${this.name}:cancel`);
    return ok({ logs: [] });
  }

  async rollback(
    _context: Parameters<ExecutionBackend["rollback"]>[0],
    deployment: Deployment,
    _plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    this.calls.push(`${this.name}:rollback`);
    return ok({ deployment });
  }
}

function deploymentFor(input: {
  providerKey: string;
  targetKind?: TargetKind;
}): Deployment {
  return {
    toState: () => ({
      runtimePlan: {
        target: {
          kind: input.targetKind ?? "single-server",
          providerKey: input.providerKey,
        },
      },
    }),
  } as unknown as Deployment;
}

function registeredBackend(input: {
  Adapter: RuntimeTargetAdapterConstructor;
  providerKey: string;
  backend?: ExecutionBackend;
  capabilities?: RuntimeTargetBackend["descriptor"]["capabilities"];
  targetKinds?: RuntimeTargetBackendDescriptor["targetKinds"];
  key?: string;
}): RuntimeTargetBackend {
  return new input.Adapter(
    {
      key: input.key ?? `single-server-${input.providerKey}`,
      providerKey: input.providerKey,
      targetKinds: input.targetKinds ?? ["single-server"],
      capabilities: input.capabilities ?? ["runtime.apply"],
    },
    input.backend ?? new RecordingExecutionBackend(input.providerKey),
  );
}

describe("DefaultRuntimeTargetBackendRegistry", () => {
  test("resolves a backend by target kind, provider key, and required capabilities", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimeTargetBackendRegistry, ExecutionBackendRuntimeTargetAdapter } =
      await import("../src");
    const registry = new DefaultRuntimeTargetBackendRegistry([
      registeredBackend({
        Adapter: ExecutionBackendRuntimeTargetAdapter,
        providerKey: "local-shell",
        capabilities: ["runtime.apply", "runtime.verify", "runtime.logs"],
      }),
    ]);

    const result = registry.find({
      targetKind: "single-server",
      providerKey: "local-shell",
      requiredCapabilities: ["runtime.apply", "runtime.verify"],
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().descriptor.key).toBe("single-server-local-shell");
  });

  test("returns runtime_target_unsupported with missing capability details", async () => {
    ensureReflectMetadata();
    const { DefaultRuntimeTargetBackendRegistry, ExecutionBackendRuntimeTargetAdapter } =
      await import("../src");
    const registry = new DefaultRuntimeTargetBackendRegistry([
      registeredBackend({
        Adapter: ExecutionBackendRuntimeTargetAdapter,
        providerKey: "local-shell",
        capabilities: ["runtime.apply"],
      }),
    ]);

    const result = registry.find({
      targetKind: "single-server",
      providerKey: "local-shell",
      requiredCapabilities: ["runtime.apply", "runtime.logs"],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("runtime_target_unsupported");
      expect(result.error.details).toEqual(
        expect.objectContaining({
          phase: "runtime-target-resolution",
          targetKind: "single-server",
          providerKey: "local-shell",
          missingCapability: "runtime.logs",
        }),
      );
    }
  });

  test("[DEP-CREATE-SMOKE-005][DEP-CREATE-SMOKE-006] resolves generic-ssh for Dockerfile and Compose apply/log capabilities", async () => {
    ensureReflectMetadata();
    const { createDefaultRuntimeTargetBackendRegistry } = await import("../src");
    const registry = createDefaultRuntimeTargetBackendRegistry({
      localBackend: new RecordingExecutionBackend("local"),
      sshBackend: new RecordingExecutionBackend("ssh"),
    });

    const dockerfileResult = registry.find({
      targetKind: "single-server",
      providerKey: "generic-ssh",
      requiredCapabilities: ["runtime.apply", "runtime.verify", "runtime.logs"],
    });
    const composeResult = registry.find({
      targetKind: "single-server",
      providerKey: "generic-ssh",
      requiredCapabilities: ["runtime.apply", "runtime.logs"],
    });

    expect(dockerfileResult.isOk()).toBe(true);
    expect(composeResult.isOk()).toBe(true);
    expect(dockerfileResult._unsafeUnwrap().descriptor.providerKey).toBe("generic-ssh");
    expect(composeResult._unsafeUnwrap().descriptor.targetKinds).toContain("single-server");
  });

  test("[SWARM-TARGET-SELECT-001] resolves docker-swarm by target kind, provider key, and capabilities", async () => {
    ensureReflectMetadata();
    const {
      createDockerSwarmRuntimeTargetBackendDescriptor,
      DefaultRuntimeTargetBackendRegistry,
      ExecutionBackendRuntimeTargetAdapter,
    } = await import("../src");
    const registry = new DefaultRuntimeTargetBackendRegistry([
      new ExecutionBackendRuntimeTargetAdapter(
        createDockerSwarmRuntimeTargetBackendDescriptor({
          capabilities: ["runtime.apply", "runtime.verify", "runtime.logs", "proxy.route"],
        }),
        new RecordingExecutionBackend("swarm"),
      ),
      registeredBackend({
        Adapter: ExecutionBackendRuntimeTargetAdapter,
        providerKey: "docker-swarm",
        key: "single-server-docker-swarm",
        targetKinds: ["single-server"],
        capabilities: ["runtime.apply", "runtime.verify", "runtime.logs", "proxy.route"],
      }),
    ]);

    const result = registry.find({
      targetKind: "orchestrator-cluster",
      providerKey: "docker-swarm",
      requiredCapabilities: ["runtime.apply", "runtime.verify", "runtime.logs", "proxy.route"],
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().descriptor).toMatchObject({
      key: "docker-swarm",
      providerKey: "docker-swarm",
      targetKinds: ["orchestrator-cluster"],
    });
  });

  test("[SWARM-TARGET-ADM-002][SWARM-TARGET-SELECT-001] reports unsupported Swarm targets when no backend is registered", async () => {
    ensureReflectMetadata();
    const { createDefaultRuntimeTargetBackendRegistry } = await import("../src");
    const registry = createDefaultRuntimeTargetBackendRegistry({
      localBackend: new RecordingExecutionBackend("local"),
      sshBackend: new RecordingExecutionBackend("ssh"),
    });

    const result = registry.find({
      targetKind: "orchestrator-cluster",
      providerKey: "docker-swarm",
      requiredCapabilities: ["runtime.apply", "runtime.verify", "runtime.logs"],
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("runtime_target_unsupported");
      expect(result.error.details).toMatchObject({
        phase: "runtime-target-resolution",
        targetKind: "orchestrator-cluster",
        providerKey: "docker-swarm",
      });
    }
  });

  test("[SWARM-TARGET-SELECT-001] resolves an explicitly composed Docker Swarm backend", async () => {
    ensureReflectMetadata();
    const { createDefaultRuntimeTargetBackendRegistry, DockerSwarmExecutionBackend } = await import(
      "../src"
    );
    const registry = createDefaultRuntimeTargetBackendRegistry({
      localBackend: new RecordingExecutionBackend("local"),
      sshBackend: new RecordingExecutionBackend("ssh"),
      swarmBackend: new DockerSwarmExecutionBackend({
        async run() {
          return ok({ exitCode: 0 });
        },
      }),
    });

    const result = registry.find({
      targetKind: "orchestrator-cluster",
      providerKey: "docker-swarm",
      requiredCapabilities: ["runtime.apply", "runtime.verify", "runtime.logs", "proxy.route"],
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().descriptor).toMatchObject({
      key: "docker-swarm",
      providerKey: "docker-swarm",
      targetKinds: ["orchestrator-cluster"],
    });
  });
});

describe("RoutingExecutionBackend", () => {
  test("dispatches current single-server providers through the runtime target registry", async () => {
    ensureReflectMetadata();
    const { createDefaultRuntimeTargetBackendRegistry, RoutingExecutionBackend } =
      await import("../src");
    const localBackend = new RecordingExecutionBackend("local");
    const sshBackend = new RecordingExecutionBackend("ssh");
    const fallbackBackend = new RecordingExecutionBackend("fallback");
    const registry = createDefaultRuntimeTargetBackendRegistry({
      localBackend,
      sshBackend,
    });
    const routingBackend = new RoutingExecutionBackend(registry, fallbackBackend);
    const context = createContext();

    await routingBackend.execute(
      context,
      deploymentFor({ providerKey: "local-shell" }),
    );
    await routingBackend.rollback(
      context,
      deploymentFor({ providerKey: "generic-ssh" }),
      {} as RollbackPlan,
    );
    await routingBackend.cancel(context, deploymentFor({ providerKey: "unknown-provider" }));

    expect(localBackend.calls).toEqual(["local:execute"]);
    expect(sshBackend.calls).toEqual(["ssh:rollback"]);
    expect(fallbackBackend.calls).toEqual(["fallback:cancel"]);
  });
});
