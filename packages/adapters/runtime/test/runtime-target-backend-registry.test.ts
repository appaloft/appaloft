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
}): RuntimeTargetBackend {
  return new input.Adapter(
    {
      key: `single-server-${input.providerKey}`,
      providerKey: input.providerKey,
      targetKinds: ["single-server"],
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
