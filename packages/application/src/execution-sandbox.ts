import {
  CreatedAt,
  domainError,
  ExpiresAt,
  err,
  ok,
  type Result,
  Sandbox,
  SandboxId,
  type SandboxIsolation,
  SandboxIsolationLevel,
  SandboxNetworkPolicy,
  type SandboxNetworkPolicyState,
  SandboxResourceLimits,
  type SandboxResourceLimitsState,
  SandboxSnapshot,
  SandboxSnapshotId,
  SandboxWorkspacePath,
  UpdatedAt,
} from "@appaloft/core";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "./execution-context";
import { type Clock, type IdGenerator } from "./ports";

export interface SandboxProviderCapabilities {
  isolation: SandboxIsolation;
  pause: boolean;
  snapshot: ("filesystem" | "filesystem-memory")[];
  processes: boolean;
  files: boolean;
  ports: boolean;
  networkPolicy: boolean;
  credentialBroker: boolean;
}

export interface SandboxProviderRequest {
  sandboxId: string;
  source: { kind: "image"; image: string };
  requestedIsolation: SandboxIsolation;
  limits: SandboxResourceLimitsState;
  networkPolicy: SandboxNetworkPolicyState;
}

export type SandboxProcessStreamFrame =
  | { kind: "stdout" | "stderr"; sequence: number; data: string }
  | { kind: "exit"; sequence: number; exitCode: number }
  | { kind: "error"; sequence: number; code: string; retryable: boolean };
export type SandboxExecResult =
  | { mode: "foreground"; frames: SandboxProcessStreamFrame[] }
  | { mode: "background"; processId: string };
export interface SandboxFileDescriptor {
  path: string;
  sizeBytes: number;
  digest?: string;
  modifiedAt?: string;
}
export interface SandboxPortExposure {
  exposureId: string;
  port: number;
  visibility: "private" | "organization" | "public";
  url: string;
  expiresAt: string;
}
export interface SandboxProcessDescriptor {
  processId: string;
  status: "running" | "exited" | "failed" | "terminated";
  exitCode?: number;
}

export interface SandboxProvider {
  readonly key: string;
  readonly capabilities: SandboxProviderCapabilities;
  provision(request: SandboxProviderRequest): Promise<{
    providerHandle: string;
    realizedIsolation: SandboxIsolation;
  }>;
  pause(request: { sandboxId: string; providerHandle: string }): Promise<void>;
  resume(request: { sandboxId: string; providerHandle: string }): Promise<{
    providerHandle: string;
    realizedIsolation: SandboxIsolation;
  }>;
  terminate(request: { sandboxId: string; providerHandle: string }): Promise<void>;
  exec(request: {
    sandboxId: string;
    providerHandle: string;
    argv: string[];
    cwd?: string;
    background?: boolean;
    timeoutMs?: number;
  }): Promise<SandboxExecResult>;
  listProcesses(request: {
    sandboxId: string;
    providerHandle: string;
  }): Promise<SandboxProcessDescriptor[]>;
  terminateProcess(request: {
    sandboxId: string;
    providerHandle: string;
    processId: string;
  }): Promise<void>;
  listFiles(request: {
    sandboxId: string;
    providerHandle: string;
    path: string;
  }): Promise<SandboxFileDescriptor[]>;
  readFile(request: {
    sandboxId: string;
    providerHandle: string;
    path: string;
  }): Promise<Uint8Array>;
  writeFile(request: {
    sandboxId: string;
    providerHandle: string;
    path: string;
    content: Uint8Array;
  }): Promise<SandboxFileDescriptor>;
  removeFile(request: {
    sandboxId: string;
    providerHandle: string;
    path: string;
    recursive?: boolean;
  }): Promise<void>;
  exposePort(request: {
    sandboxId: string;
    providerHandle: string;
    port: number;
    visibility: "private" | "organization" | "public";
    expiresAt?: string;
  }): Promise<SandboxPortExposure>;
  listPorts(request: { sandboxId: string; providerHandle: string }): Promise<SandboxPortExposure[]>;
  revokePort(request: {
    sandboxId: string;
    providerHandle: string;
    exposureId: string;
  }): Promise<void>;
  captureSnapshot(request: {
    sandboxId: string;
    providerHandle: string;
    snapshotId: string;
    capability: "filesystem" | "filesystem-memory";
  }): Promise<{ providerHandle: string; sizeBytes: number }>;
}

export class SandboxProviderRegistry {
  private readonly providers = new Map<string, SandboxProvider>();
  constructor(providers: SandboxProvider[] = []) {
    for (const provider of providers) this.providers.set(provider.key, provider);
  }
  register(provider: SandboxProvider): void {
    this.providers.set(provider.key, provider);
  }
  findCompatible(input: {
    isolation: SandboxIsolationLevel;
    providerKey?: string;
  }): SandboxProvider | null {
    const candidates = input.providerKey
      ? [this.providers.get(input.providerKey)].filter((item): item is SandboxProvider =>
          Boolean(item),
        )
      : [...this.providers.values()];
    return (
      candidates.find((provider) =>
        SandboxIsolationLevel.rehydrate(provider.capabilities.isolation).satisfies(input.isolation),
      ) ?? null
    );
  }
  get(key: string): SandboxProvider | null {
    return this.providers.get(key) ?? null;
  }
}

type StoredSandbox = { tenantId: string; providerKey: string; sandbox: Sandbox };
type StoredSnapshot = { tenantId: string; providerKey: string; snapshot: SandboxSnapshot };
export interface SandboxRepository {
  save(context: RepositoryContext, sandbox: Sandbox, providerKey: string): Promise<void>;
  find(context: RepositoryContext, sandboxId: string): Promise<StoredSandbox | null>;
  list(
    context: RepositoryContext,
    input: { limit: number; offset: number },
  ): Promise<StoredSandbox[]>;
  saveSnapshot(
    context: RepositoryContext,
    snapshot: SandboxSnapshot,
    providerKey: string,
  ): Promise<void>;
  findSnapshot(context: RepositoryContext, snapshotId: string): Promise<StoredSnapshot | null>;
  listSnapshots(
    context: RepositoryContext,
    input: { limit: number; offset: number },
  ): Promise<StoredSnapshot[]>;
}

function tenantId(context: RepositoryContext): string {
  return context.tenant?.tenantId ?? "tenant_instance";
}

export class InMemorySandboxRepository implements SandboxRepository {
  private readonly items = new Map<string, StoredSandbox>();
  private readonly snapshots = new Map<string, StoredSnapshot>();
  async save(context: RepositoryContext, sandbox: Sandbox, providerKey: string): Promise<void> {
    const tenant = tenantId(context);
    this.items.set(`${tenant}:${sandbox.id.value}`, { tenantId: tenant, providerKey, sandbox });
  }
  async find(context: RepositoryContext, sandboxId: string): Promise<StoredSandbox | null> {
    return this.items.get(`${tenantId(context)}:${sandboxId}`) ?? null;
  }
  async list(
    context: RepositoryContext,
    input: { limit: number; offset: number },
  ): Promise<StoredSandbox[]> {
    return [...this.items.values()]
      .filter((item) => item.tenantId === tenantId(context))
      .slice(input.offset, input.offset + input.limit);
  }
  async saveSnapshot(
    context: RepositoryContext,
    snapshot: SandboxSnapshot,
    providerKey: string,
  ): Promise<void> {
    const tenant = tenantId(context);
    this.snapshots.set(`${tenant}:${snapshot.id.value}`, {
      tenantId: tenant,
      providerKey,
      snapshot,
    });
  }
  async findSnapshot(
    context: RepositoryContext,
    snapshotId: string,
  ): Promise<StoredSnapshot | null> {
    return this.snapshots.get(`${tenantId(context)}:${snapshotId}`) ?? null;
  }
  async listSnapshots(
    context: RepositoryContext,
    input: { limit: number; offset: number },
  ): Promise<StoredSnapshot[]> {
    return [...this.snapshots.values()]
      .filter((item) => item.tenantId === tenantId(context))
      .slice(input.offset, input.offset + input.limit);
  }
}

export interface SandboxDescriptor {
  sandboxId: string;
  status: string;
  sourceKind: string;
  requestedIsolation: SandboxIsolation;
  realizedIsolation?: SandboxIsolation;
  limits: SandboxResourceLimitsState;
  networkPolicy: SandboxNetworkPolicyState;
  createdAt: string;
  updatedAt?: string;
  expiresAt?: string;
  providerKey: string;
  attemptId?: string;
}

export interface SandboxSnapshotDescriptor {
  snapshotId: string;
  sourceSandboxId: string;
  capability: "filesystem" | "filesystem-memory";
  status: string;
  sizeBytes?: number;
  createdAt: string;
  expiresAt?: string;
}

function descriptor(stored: StoredSandbox): SandboxDescriptor {
  const state = stored.sandbox.toState();
  return {
    sandboxId: state.id.value,
    status: state.status.value,
    sourceKind: state.source.kind,
    requestedIsolation: state.requestedIsolation.value,
    limits: state.limits.toState(),
    networkPolicy: state.networkPolicy.toState(),
    createdAt: state.createdAt.value,
    providerKey: stored.providerKey,
    ...(state.realizedIsolation ? { realizedIsolation: state.realizedIsolation.value } : {}),
    ...(state.updatedAt ? { updatedAt: state.updatedAt.value } : {}),
    ...(state.expiresAt ? { expiresAt: state.expiresAt.value } : {}),
    ...(state.currentAttemptId ? { attemptId: state.currentAttemptId } : {}),
  };
}

function snapshotDescriptor(stored: StoredSnapshot): SandboxSnapshotDescriptor {
  const state = stored.snapshot.toState();
  return {
    snapshotId: state.id.value,
    sourceSandboxId: state.sourceSandboxId.value,
    capability: state.capability,
    status: state.status.value,
    createdAt: state.createdAt.value,
    ...(state.sizeBytes !== undefined ? { sizeBytes: state.sizeBytes } : {}),
    ...(state.expiresAt ? { expiresAt: state.expiresAt.value } : {}),
  };
}

function isolationUnsupported(requested: SandboxIsolation, available: SandboxIsolation[]) {
  return {
    code: "sandbox_isolation_unsupported",
    category: "provider" as const,
    message: `No Sandbox provider satisfies ${requested}`,
    retryable: false,
    details: {
      phase: "execution-sandbox-placement",
      requestedIsolation: requested,
      availableIsolation: available,
    },
  };
}

export class ExecutionSandboxService {
  private readonly repository: SandboxRepository;
  private readonly providerRegistry: SandboxProviderRegistry;
  private readonly clock: Clock;
  private readonly idGenerator: IdGenerator;
  constructor(input: {
    repository: SandboxRepository;
    providerRegistry: SandboxProviderRegistry;
    clock: Clock;
    idGenerator: IdGenerator;
  }) {
    this.repository = input.repository;
    this.providerRegistry = input.providerRegistry;
    this.clock = input.clock;
    this.idGenerator = input.idGenerator;
  }

  async create(
    context: ExecutionContext,
    input: {
      source: { kind: "image"; image: string };
      requestedIsolation: SandboxIsolation;
      limits: SandboxResourceLimitsState;
      networkPolicy: SandboxNetworkPolicyState;
      expiresAt?: string;
      providerKey?: string;
    },
  ): Promise<Result<SandboxDescriptor>> {
    const isolation = SandboxIsolationLevel.create(input.requestedIsolation);
    if (isolation.isErr()) return err(isolation.error);
    const provider = this.providerRegistry.findCompatible({
      isolation: isolation.value,
      ...(input.providerKey ? { providerKey: input.providerKey } : {}),
    });
    if (!provider) return err(isolationUnsupported(input.requestedIsolation, []));
    const limits = SandboxResourceLimits.create(input.limits);
    if (limits.isErr()) return err(limits.error);
    const networkPolicy = SandboxNetworkPolicy.create(input.networkPolicy);
    if (networkPolicy.isErr()) return err(networkPolicy.error);
    const createdAt = CreatedAt.create(this.clock.now());
    if (createdAt.isErr()) return err(createdAt.error);
    const expiresAt = input.expiresAt ? ExpiresAt.create(input.expiresAt) : null;
    if (expiresAt?.isErr()) return err(expiresAt.error);
    const sandbox = Sandbox.create({
      id: SandboxId.rehydrate(this.idGenerator.next("sbx")),
      source: input.source,
      requestedIsolation: isolation.value,
      limits: limits.value,
      networkPolicy: networkPolicy.value,
      createdAt: createdAt.value,
      ...(expiresAt?.isOk() ? { expiresAt: expiresAt.value } : {}),
      currentAttemptId: this.idGenerator.next("sat"),
    });
    if (sandbox.isErr()) return err(sandbox.error);
    await this.repository.save(toRepositoryContext(context), sandbox.value, provider.key);
    return ok(
      descriptor({
        tenantId: context.tenant?.tenantId ?? "tenant_instance",
        providerKey: provider.key,
        sandbox: sandbox.value,
      }),
    );
  }

  async list(
    context: ExecutionContext,
    input: { limit?: number; offset?: number },
  ): Promise<Result<{ items: SandboxDescriptor[] }>> {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const items = await this.repository.list(toRepositoryContext(context), {
      limit,
      offset: Math.max(input.offset ?? 0, 0),
    });
    return ok({ items: items.map(descriptor) });
  }

  async show(context: ExecutionContext, sandboxId: string): Promise<Result<SandboxDescriptor>> {
    const stored = await this.repository.find(toRepositoryContext(context), sandboxId);
    return stored ? ok(descriptor(stored)) : err(domainError.notFound("Sandbox", sandboxId));
  }

  private async ready(
    context: ExecutionContext,
    sandboxId: string,
  ): Promise<Result<{ stored: StoredSandbox; provider: SandboxProvider; providerHandle: string }>> {
    const stored = await this.repository.find(toRepositoryContext(context), sandboxId);
    if (!stored) return err(domainError.notFound("Sandbox", sandboxId));
    const state = stored.sandbox.toState();
    if (!stored.sandbox.canUseRuntime() || !state.providerHandle) {
      return err(
        domainError.conflict("Sandbox runtime is not ready", {
          phase: "execution-sandbox-runtime-admission",
          status: state.status.value,
        }),
      );
    }
    const provider = this.providerRegistry.get(stored.providerKey);
    if (!provider)
      return err(
        domainError.infra("Sandbox provider is unavailable", {
          phase: "execution-sandbox-provider-resolution",
          providerKey: stored.providerKey,
        }),
      );
    return ok({ stored, provider, providerHandle: state.providerHandle });
  }

  async reconcile(
    context: ExecutionContext,
    sandboxId: string,
  ): Promise<Result<SandboxDescriptor>> {
    const stored = await this.repository.find(toRepositoryContext(context), sandboxId);
    if (!stored) return err(domainError.notFound("Sandbox", sandboxId));
    const provider = this.providerRegistry.get(stored.providerKey);
    if (!provider) return err(domainError.infra("Sandbox provider is unavailable"));
    const at = UpdatedAt.rehydrate(this.clock.now());
    const started = stored.sandbox.startProvisioning({
      attemptId: stored.sandbox.toState().currentAttemptId ?? this.idGenerator.next("sat"),
      at,
    });
    if (started.isErr()) return err(started.error);
    await this.repository.save(toRepositoryContext(context), stored.sandbox, stored.providerKey);
    const state = stored.sandbox.toState();
    if (state.source.kind !== "image")
      return err(
        domainError.validation("Only image sources are implemented by this provider slice"),
      );
    try {
      const observed = await provider.provision({
        sandboxId,
        source: state.source,
        requestedIsolation: state.requestedIsolation.value,
        limits: state.limits.toState(),
        networkPolicy: state.networkPolicy.toState(),
      });
      const ready = stored.sandbox.markReady({
        realizedIsolation: SandboxIsolationLevel.rehydrate(observed.realizedIsolation),
        providerHandle: observed.providerHandle,
        at,
      });
      if (ready.isErr()) return err(ready.error);
      await this.repository.save(toRepositoryContext(context), stored.sandbox, stored.providerKey);
      return ok(descriptor(stored));
    } catch {
      stored.sandbox.markFailed({ code: "sandbox_provision_failed", retryable: true, at });
      await this.repository.save(toRepositoryContext(context), stored.sandbox, stored.providerKey);
      return err({
        code: "sandbox_provision_failed",
        category: "provider",
        message: "Sandbox provisioning failed",
        retryable: true,
        details: { phase: "execution-sandbox-provision" },
      });
    }
  }

  async exec(
    context: ExecutionContext,
    sandboxId: string,
    input: { argv: string[]; cwd?: string; background?: boolean; timeoutMs?: number },
  ): Promise<Result<SandboxExecResult>> {
    if (
      input.argv.length === 0 ||
      input.argv.length > 256 ||
      input.argv.some((part) => part.includes("\0"))
    ) {
      return err(
        domainError.validation("Sandbox argv is invalid", {
          phase: "execution-sandbox-exec-admission",
        }),
      );
    }
    const ready = await this.ready(context, sandboxId);
    if (ready.isErr()) return err(ready.error);
    let cwd: string | undefined;
    if (input.cwd) {
      const path = SandboxWorkspacePath.create(input.cwd);
      if (path.isErr()) return err(path.error);
      cwd = path.value.value;
    }
    return ok(
      await ready.value.provider.exec({
        sandboxId,
        providerHandle: ready.value.providerHandle,
        argv: [...input.argv],
        ...(cwd ? { cwd } : {}),
        ...(input.background !== undefined ? { background: input.background } : {}),
        ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
      }),
    );
  }

  async writeFile(
    context: ExecutionContext,
    sandboxId: string,
    input: { path: string; content: Uint8Array },
  ): Promise<Result<SandboxFileDescriptor>> {
    const path = SandboxWorkspacePath.create(input.path);
    if (path.isErr()) return err(path.error);
    const ready = await this.ready(context, sandboxId);
    if (ready.isErr()) return err(ready.error);
    return ok(
      await ready.value.provider.writeFile({
        sandboxId,
        providerHandle: ready.value.providerHandle,
        path: path.value.value,
        content: input.content,
      }),
    );
  }

  async listFiles(
    context: ExecutionContext,
    sandboxId: string,
    input: { path: string },
  ): Promise<Result<SandboxFileDescriptor[]>> {
    const path = SandboxWorkspacePath.create(input.path);
    if (path.isErr()) return err(path.error);
    const ready = await this.ready(context, sandboxId);
    if (ready.isErr()) return err(ready.error);
    return ok(
      await ready.value.provider.listFiles({
        sandboxId,
        providerHandle: ready.value.providerHandle,
        path: path.value.value,
      }),
    );
  }

  async readFile(
    context: ExecutionContext,
    sandboxId: string,
    input: { path: string },
  ): Promise<Result<Uint8Array>> {
    const path = SandboxWorkspacePath.create(input.path);
    if (path.isErr()) return err(path.error);
    const ready = await this.ready(context, sandboxId);
    if (ready.isErr()) return err(ready.error);
    return ok(
      await ready.value.provider.readFile({
        sandboxId,
        providerHandle: ready.value.providerHandle,
        path: path.value.value,
      }),
    );
  }

  async removeFile(
    context: ExecutionContext,
    sandboxId: string,
    input: { path: string; recursive?: boolean },
  ): Promise<Result<void>> {
    const path = SandboxWorkspacePath.create(input.path);
    if (path.isErr()) return err(path.error);
    const ready = await this.ready(context, sandboxId);
    if (ready.isErr()) return err(ready.error);
    await ready.value.provider.removeFile({
      sandboxId,
      providerHandle: ready.value.providerHandle,
      path: path.value.value,
      ...(input.recursive !== undefined ? { recursive: input.recursive } : {}),
    });
    return ok(undefined);
  }

  async listProcesses(
    context: ExecutionContext,
    sandboxId: string,
  ): Promise<Result<SandboxProcessDescriptor[]>> {
    const ready = await this.ready(context, sandboxId);
    if (ready.isErr()) return err(ready.error);
    return ok(
      await ready.value.provider.listProcesses({
        sandboxId,
        providerHandle: ready.value.providerHandle,
      }),
    );
  }

  async terminateProcess(
    context: ExecutionContext,
    sandboxId: string,
    processId: string,
  ): Promise<Result<void>> {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(processId)) {
      return err(domainError.validation("Sandbox process id is invalid"));
    }
    const ready = await this.ready(context, sandboxId);
    if (ready.isErr()) return err(ready.error);
    await ready.value.provider.terminateProcess({
      sandboxId,
      providerHandle: ready.value.providerHandle,
      processId,
    });
    return ok(undefined);
  }

  async exposePort(
    context: ExecutionContext,
    sandboxId: string,
    input: {
      port: number;
      visibility?: "private" | "organization" | "public";
      expiresAt?: string;
    },
  ): Promise<Result<SandboxPortExposure>> {
    if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
      return err(domainError.validation("Sandbox port is invalid"));
    }
    const ready = await this.ready(context, sandboxId);
    if (ready.isErr()) return err(ready.error);
    return ok(
      await ready.value.provider.exposePort({
        sandboxId,
        providerHandle: ready.value.providerHandle,
        port: input.port,
        visibility: input.visibility ?? "private",
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      }),
    );
  }

  async listPorts(
    context: ExecutionContext,
    sandboxId: string,
  ): Promise<Result<SandboxPortExposure[]>> {
    const ready = await this.ready(context, sandboxId);
    if (ready.isErr()) return err(ready.error);
    return ok(
      await ready.value.provider.listPorts({
        sandboxId,
        providerHandle: ready.value.providerHandle,
      }),
    );
  }

  async revokePort(
    context: ExecutionContext,
    sandboxId: string,
    exposureId: string,
  ): Promise<Result<void>> {
    const ready = await this.ready(context, sandboxId);
    if (ready.isErr()) return err(ready.error);
    await ready.value.provider.revokePort({
      sandboxId,
      providerHandle: ready.value.providerHandle,
      exposureId,
    });
    return ok(undefined);
  }

  async pause(context: ExecutionContext, sandboxId: string): Promise<Result<SandboxDescriptor>> {
    const ready = await this.ready(context, sandboxId);
    if (ready.isErr()) return err(ready.error);
    if (!ready.value.provider.capabilities.pause) {
      return err(domainError.conflict("Sandbox provider does not support pause"));
    }
    const at = UpdatedAt.rehydrate(this.clock.now());
    const requested = ready.value.stored.sandbox.requestPause({ at });
    if (requested.isErr()) return err(requested.error);
    await this.repository.save(
      toRepositoryContext(context),
      ready.value.stored.sandbox,
      ready.value.stored.providerKey,
    );
    await ready.value.provider.pause({
      sandboxId,
      providerHandle: ready.value.providerHandle,
    });
    const paused = ready.value.stored.sandbox.markPaused({ at });
    if (paused.isErr()) return err(paused.error);
    await this.repository.save(
      toRepositoryContext(context),
      ready.value.stored.sandbox,
      ready.value.stored.providerKey,
    );
    return ok(descriptor(ready.value.stored));
  }

  async resume(context: ExecutionContext, sandboxId: string): Promise<Result<SandboxDescriptor>> {
    const repositoryContext = toRepositoryContext(context);
    const stored = await this.repository.find(repositoryContext, sandboxId);
    if (!stored) return err(domainError.notFound("Sandbox", sandboxId));
    const state = stored.sandbox.toState();
    if (state.status.value !== "paused" || !state.providerHandle) {
      return err(domainError.conflict("Sandbox is not paused"));
    }
    const provider = this.providerRegistry.get(stored.providerKey);
    if (!provider) return err(domainError.infra("Sandbox provider is unavailable"));
    const at = UpdatedAt.rehydrate(this.clock.now());
    const requested = stored.sandbox.requestResume({ at });
    if (requested.isErr()) return err(requested.error);
    await this.repository.save(repositoryContext, stored.sandbox, stored.providerKey);
    const observed = await provider.resume({ sandboxId, providerHandle: state.providerHandle });
    const resumed = stored.sandbox.markReady({
      realizedIsolation: SandboxIsolationLevel.rehydrate(observed.realizedIsolation),
      providerHandle: observed.providerHandle,
      at,
    });
    if (resumed.isErr()) return err(resumed.error);
    await this.repository.save(repositoryContext, stored.sandbox, stored.providerKey);
    return ok(descriptor(stored));
  }

  async createSnapshot(
    context: ExecutionContext,
    sandboxId: string,
    input: { capability: "filesystem" | "filesystem-memory"; expiresAt?: string },
  ): Promise<Result<SandboxSnapshotDescriptor>> {
    const ready = await this.ready(context, sandboxId);
    if (ready.isErr()) return err(ready.error);
    if (!ready.value.provider.capabilities.snapshot.includes(input.capability)) {
      return err(domainError.conflict("Sandbox snapshot capability is unsupported"));
    }
    const createdAt = CreatedAt.rehydrate(this.clock.now());
    const expiresAt = input.expiresAt ? ExpiresAt.create(input.expiresAt) : null;
    if (expiresAt?.isErr()) return err(expiresAt.error);
    const snapshot = SandboxSnapshot.create({
      id: SandboxSnapshotId.rehydrate(this.idGenerator.next("ssn")),
      sourceSandboxId: ready.value.stored.sandbox.id,
      capability: input.capability,
      createdAt,
      ...(expiresAt?.isOk() ? { expiresAt: expiresAt.value } : {}),
    });
    if (snapshot.isErr()) return err(snapshot.error);
    const attemptId = this.idGenerator.next("sat");
    const at = UpdatedAt.rehydrate(this.clock.now());
    snapshot.value.startCapture({ attemptId, at })._unsafeUnwrap();
    await this.repository.saveSnapshot(
      toRepositoryContext(context),
      snapshot.value,
      ready.value.stored.providerKey,
    );
    const observed = await ready.value.provider.captureSnapshot({
      sandboxId,
      providerHandle: ready.value.providerHandle,
      snapshotId: snapshot.value.id.value,
      capability: input.capability,
    });
    const captured = snapshot.value.markReady({ ...observed, at });
    if (captured.isErr()) return err(captured.error);
    await this.repository.saveSnapshot(
      toRepositoryContext(context),
      snapshot.value,
      ready.value.stored.providerKey,
    );
    return ok(
      snapshotDescriptor({
        tenantId: context.tenant?.tenantId ?? "tenant_instance",
        providerKey: ready.value.stored.providerKey,
        snapshot: snapshot.value,
      }),
    );
  }

  async listSnapshots(
    context: ExecutionContext,
    input: { limit?: number; offset?: number },
  ): Promise<Result<{ items: SandboxSnapshotDescriptor[] }>> {
    const items = await this.repository.listSnapshots(toRepositoryContext(context), {
      limit: Math.min(Math.max(input.limit ?? 50, 1), 100),
      offset: Math.max(input.offset ?? 0, 0),
    });
    return ok({ items: items.map(snapshotDescriptor) });
  }

  async showSnapshot(
    context: ExecutionContext,
    snapshotId: string,
  ): Promise<Result<SandboxSnapshotDescriptor>> {
    const stored = await this.repository.findSnapshot(toRepositoryContext(context), snapshotId);
    return stored
      ? ok(snapshotDescriptor(stored))
      : err(domainError.notFound("SandboxSnapshot", snapshotId));
  }

  async terminate(
    context: ExecutionContext,
    sandboxId: string,
  ): Promise<Result<SandboxDescriptor>> {
    const repositoryContext = toRepositoryContext(context);
    const stored = await this.repository.find(repositoryContext, sandboxId);
    if (!stored) return err(domainError.notFound("Sandbox", sandboxId));
    if (["terminated", "expired"].includes(stored.sandbox.toState().status.value))
      return ok(descriptor(stored));
    const at = UpdatedAt.rehydrate(this.clock.now());
    const requested = stored.sandbox.requestTermination({ at });
    if (requested.isErr()) return err(requested.error);
    await this.repository.save(repositoryContext, stored.sandbox, stored.providerKey);
    const handle = stored.sandbox.toState().providerHandle;
    const provider = this.providerRegistry.get(stored.providerKey);
    if (handle && provider) await provider.terminate({ sandboxId, providerHandle: handle });
    const terminated = stored.sandbox.markTerminated({ at });
    if (terminated.isErr()) return err(terminated.error);
    await this.repository.save(repositoryContext, stored.sandbox, stored.providerKey);
    return ok(descriptor(stored));
  }
}
