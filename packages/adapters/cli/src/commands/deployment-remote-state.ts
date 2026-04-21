import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type DomainError,
  domainError,
  type EdgeProxyKind,
  err,
  ok,
  type Result,
} from "@appaloft/core";

export interface RemoteStateLifecycleOptions {
  dataRoot: string;
  schemaVersion?: number;
  owner?: string;
  correlationId?: string;
  now?: () => Date;
  failMigration?: boolean;
}

export interface RemoteStateSession {
  dataRoot: string;
  schemaVersion: number;
  backupPath?: string;
  journalPath?: string;
  release(): Promise<Result<void>>;
}

export interface SourceLinkTarget {
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId?: string;
  destinationId?: string;
}

export interface SourceLinkRecord extends SourceLinkTarget {
  sourceFingerprint: string;
  updatedAt: string;
  reason?: string;
}

export interface SourceLinkDiagnostics {
  sourceFingerprint: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId?: string;
  destinationId?: string;
  updatedAt: string;
  reason?: string;
}

export interface ServerAppliedRouteTarget {
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId?: string;
}

export type ServerAppliedRouteTlsMode = "auto" | "disabled";

export interface ServerAppliedRouteDomainIntent {
  host: string;
  pathPrefix: string;
  tlsMode: ServerAppliedRouteTlsMode;
  redirectTo?: string;
  redirectStatus?: 301 | 302 | 307 | 308;
}

export type ServerAppliedRouteDesiredStateStatus = "desired" | "applied" | "failed";

export interface ServerAppliedRouteAppliedState {
  deploymentId: string;
  appliedAt: string;
  providerKey?: string;
  proxyKind?: EdgeProxyKind;
}

export interface ServerAppliedRouteFailureState {
  deploymentId: string;
  failedAt: string;
  phase: string;
  errorCode: string;
  message?: string;
  retryable: boolean;
  providerKey?: string;
  proxyKind?: EdgeProxyKind;
}

export interface ServerAppliedRouteDesiredStateRecord extends ServerAppliedRouteTarget {
  routeSetId: string;
  sourceFingerprint?: string;
  domains: ServerAppliedRouteDomainIntent[];
  status: ServerAppliedRouteDesiredStateStatus;
  updatedAt: string;
  lastApplied?: ServerAppliedRouteAppliedState;
  lastFailure?: ServerAppliedRouteFailureState;
}

export interface ServerAppliedRouteDesiredStateStore {
  upsertDesired(input: {
    target: ServerAppliedRouteTarget;
    domains: ServerAppliedRouteDomainIntent[];
    sourceFingerprint?: string;
    updatedAt: string;
  }): Promise<Result<ServerAppliedRouteDesiredStateRecord>>;
  read(
    target: ServerAppliedRouteTarget,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>>;
  markApplied(input: {
    target: ServerAppliedRouteTarget;
    deploymentId: string;
    updatedAt: string;
    routeSetId?: string;
    providerKey?: string;
    proxyKind?: EdgeProxyKind;
  }): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>>;
  markFailed(input: {
    target: ServerAppliedRouteTarget;
    deploymentId: string;
    updatedAt: string;
    phase: string;
    errorCode: string;
    message?: string;
    retryable: boolean;
    routeSetId?: string;
    providerKey?: string;
    proxyKind?: EdgeProxyKind;
  }): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>>;
  deleteDesired(target: ServerAppliedRouteTarget): Promise<Result<boolean>>;
  deleteDesiredBySourceFingerprint(sourceFingerprint: string): Promise<Result<number>>;
}

const defaultSchemaVersion = 1;
const stateDirectories = [
  "pglite",
  "locks",
  "backups",
  "journals",
  "source-links",
  "server-applied-routes",
] as const;
const schemaMarkerFile = "schema-version.json";
const lockDirectory = "locks/mutation.lock";
const lockOwnerFile = "owner.json";
const recoveryMarkerFile = "recovery.json";

function isoStamp(now: () => Date): string {
  return now().toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function jsonStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function encodeSourceLinkFileName(sourceFingerprint: string): string {
  return `${encodeURIComponent(sourceFingerprint)}.json`;
}

function routeSetKey(target: ServerAppliedRouteTarget): string {
  return [
    target.projectId,
    target.environmentId,
    target.resourceId,
    target.serverId,
    target.destinationId ?? "default",
  ].join(":");
}

function encodeServerAppliedRouteFileName(target: ServerAppliedRouteTarget): string {
  return `${encodeURIComponent(routeSetKey(target))}.json`;
}

function lockErrorDetails(input: {
  dataRoot: string;
  lockOwner?: string;
  correlationId?: string;
}): Record<string, string> {
  return {
    phase: "remote-state-lock",
    stateBackend: "ssh-pglite",
    dataRoot: input.dataRoot,
    ...(input.lockOwner ? { lockOwner: input.lockOwner } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
  };
}

function sourceLinkError(
  code: string,
  message: string,
  details?: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    code,
    category: "user",
    message,
    retryable: false,
    ...(details ? { details } : {}),
  };
}

function validateSourceFingerprint(sourceFingerprint: string): Result<void> {
  if (!sourceFingerprint.trim()) {
    return err(
      domainError.validation("Source fingerprint is required", {
        phase: "source-link-validation",
      }),
    );
  }

  if (/\/\/[^/\s]+:[^/@\s]+@/.test(sourceFingerprint)) {
    return err(
      domainError.validation("Source fingerprint contains credential-bearing material", {
        phase: "source-link-validation",
      }),
    );
  }

  return ok(undefined);
}

function validateTargetContext(target: SourceLinkTarget): Result<void> {
  if (target.destinationId && !target.serverId) {
    return err(
      sourceLinkError(
        "source_link_context_mismatch",
        "Destination relink requires server context",
        {
          phase: "source-link-admission",
          destinationId: target.destinationId,
        },
      ),
    );
  }

  return ok(undefined);
}

function validateNonEmptyContextValue(input: { label: string; value: string }): Result<void> {
  if (!input.value.trim()) {
    return err(
      domainError.validation(`${input.label} is required`, {
        phase: "config-domain-resolution",
        field: input.label,
      }),
    );
  }

  return ok(undefined);
}

function validateServerAppliedRouteTarget(target: ServerAppliedRouteTarget): Result<void> {
  const fields = [
    ["projectId", target.projectId],
    ["environmentId", target.environmentId],
    ["resourceId", target.resourceId],
    ["serverId", target.serverId],
  ] as const;

  for (const [label, value] of fields) {
    const result = validateNonEmptyContextValue({ label, value });
    if (result.isErr()) {
      return err(result.error);
    }
  }

  if (target.destinationId !== undefined) {
    const result = validateNonEmptyContextValue({
      label: "destinationId",
      value: target.destinationId,
    });
    if (result.isErr()) {
      return err(result.error);
    }
  }

  return ok(undefined);
}

function validateServerAppliedRouteDomains(
  domains: readonly ServerAppliedRouteDomainIntent[],
): Result<void> {
  if (domains.length === 0) {
    return err(
      domainError.validation("Server-applied route domains are required", {
        phase: "config-domain-resolution",
      }),
    );
  }

  for (const domain of domains) {
    if (!domain.host.trim() || !domain.pathPrefix.trim()) {
      return err(
        domainError.validation("Server-applied route domain intent is incomplete", {
          phase: "config-domain-resolution",
          host: domain.host,
        }),
      );
    }
  }

  const byHost = new Map<string, ServerAppliedRouteDomainIntent>();
  for (const domain of domains) {
    if (byHost.has(domain.host)) {
      return err(
        domainError.validation("Server-applied route domains cannot contain duplicate hosts", {
          phase: "config-domain-resolution",
          host: domain.host,
        }),
      );
    }
    byHost.set(domain.host, domain);
  }

  for (const domain of domains) {
    if (domain.redirectStatus && !domain.redirectTo) {
      return err(
        domainError.validation("Server-applied route redirect status requires redirect target", {
          phase: "config-domain-resolution",
          host: domain.host,
        }),
      );
    }

    if (!domain.redirectTo) {
      continue;
    }

    const target = byHost.get(domain.redirectTo);
    if (!target) {
      return err(
        domainError.validation("Server-applied route redirect target is missing", {
          phase: "config-domain-resolution",
          host: domain.host,
          redirectTo: domain.redirectTo,
        }),
      );
    }

    if (target.host === domain.host) {
      return err(
        domainError.validation("Server-applied route redirect cannot target itself", {
          phase: "config-domain-resolution",
          host: domain.host,
        }),
      );
    }

    if (target.redirectTo) {
      return err(
        domainError.validation(
          "Server-applied route redirect target must be a served domain, not another redirect",
          {
            phase: "config-domain-resolution",
            host: domain.host,
            redirectTo: domain.redirectTo,
          },
        ),
      );
    }
  }

  return ok(undefined);
}

function serverAppliedRouteStateError(
  code: string,
  message: string,
  details?: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    code,
    category: "infra",
    message,
    retryable: true,
    ...(details ? { details } : {}),
  };
}

export class FileSystemRemoteStateLifecycle {
  private readonly dataRoot: string;
  private readonly schemaVersion: number;
  private readonly owner: string;
  private readonly correlationId: string;
  private readonly now: () => Date;
  private readonly failMigration: boolean;

  constructor(options: RemoteStateLifecycleOptions) {
    this.dataRoot = options.dataRoot;
    this.schemaVersion = options.schemaVersion ?? defaultSchemaVersion;
    this.owner = options.owner ?? "appaloft-cli";
    this.correlationId = options.correlationId ?? "cli";
    this.now = options.now ?? (() => new Date());
    this.failMigration = options.failMigration ?? false;
  }

  async prepare(): Promise<Result<RemoteStateSession>> {
    try {
      await this.ensureDirectories();
      const lockResult = await this.acquireLock();
      if (lockResult.isErr()) {
        return err(lockResult.error);
      }

      const migrationResult = await this.migrate();
      if (migrationResult.isErr()) {
        await this.writeRecoveryMarker(migrationResult.error.message);
        await this.releaseLock();
        return err(migrationResult.error);
      }

      const integrityResult = await this.verifyIntegrity();
      if (integrityResult.isErr()) {
        await this.writeRecoveryMarker(integrityResult.error.message);
        await this.releaseLock();
        return err(integrityResult.error);
      }

      return ok({
        dataRoot: this.dataRoot,
        schemaVersion: this.schemaVersion,
        ...(migrationResult.value.backupPath
          ? { backupPath: migrationResult.value.backupPath }
          : {}),
        ...(migrationResult.value.journalPath
          ? { journalPath: migrationResult.value.journalPath }
          : {}),
        release: () => this.releaseLock(),
      });
    } catch (error) {
      return err(
        domainError.validation("Remote state could not be prepared", {
          phase: "remote-state-resolution",
          stateBackend: "ssh-pglite",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async recoveryStatus(): Promise<Result<{ exists: boolean; message?: string; phase?: string }>> {
    try {
      const marker = await readJsonFile<{ message?: string; phase?: string }>(
        join(this.dataRoot, recoveryMarkerFile),
      );
      return ok(marker ? { exists: true, ...marker } : { exists: false });
    } catch (error) {
      return err(
        domainError.infra("Remote state recovery marker could not be read", {
          phase: "remote-state-recovery",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private async ensureDirectories(): Promise<void> {
    await mkdir(this.dataRoot, { recursive: true });
    for (const directory of stateDirectories) {
      await mkdir(join(this.dataRoot, directory), { recursive: true });
    }
  }

  private async acquireLock(): Promise<Result<void>> {
    const lockPath = join(this.dataRoot, lockDirectory);
    try {
      await mkdir(lockPath);
      await writeFile(
        join(lockPath, lockOwnerFile),
        jsonStringify({
          owner: this.owner,
          correlationId: this.correlationId,
          startedAt: this.now().toISOString(),
        }),
      );
      return ok(undefined);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        const owner = await readJsonFile<{ owner?: string; correlationId?: string }>(
          join(lockPath, lockOwnerFile),
        );
        return err(
          domainError.infra(
            "Remote state mutation lock is already held",
            lockErrorDetails({
              dataRoot: this.dataRoot,
              ...(owner?.owner ? { lockOwner: owner.owner } : {}),
              ...(owner?.correlationId ? { correlationId: owner.correlationId } : {}),
            }),
          ),
        );
      }
      throw error;
    }
  }

  private async releaseLock(): Promise<Result<void>> {
    try {
      await rm(join(this.dataRoot, lockDirectory), { recursive: true, force: true });
      return ok(undefined);
    } catch (error) {
      return err(
        domainError.infra("Remote state mutation lock could not be released", {
          phase: "remote-state-lock",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private async migrate(): Promise<Result<{ backupPath?: string; journalPath?: string }>> {
    const markerPath = join(this.dataRoot, schemaMarkerFile);
    const marker = await readJsonFile<{ version?: number }>(markerPath);
    const currentVersion = marker?.version ?? 0;

    if (currentVersion === this.schemaVersion) {
      return ok({});
    }

    const stamp = isoStamp(this.now);
    const backupPath = join(
      this.dataRoot,
      "backups",
      `schema-${currentVersion}-to-${this.schemaVersion}-${stamp}.json`,
    );
    const journalPath = join(
      this.dataRoot,
      "journals",
      `schema-${currentVersion}-to-${this.schemaVersion}-${stamp}.json`,
    );
    await writeFile(
      backupPath,
      jsonStringify({
        fromVersion: currentVersion,
        toVersion: this.schemaVersion,
        marker,
      }),
    );
    await writeFile(
      journalPath,
      jsonStringify({
        phase: "remote-state-migration",
        fromVersion: currentVersion,
        toVersion: this.schemaVersion,
        startedAt: this.now().toISOString(),
      }),
    );

    if (this.failMigration) {
      return err(
        domainError.infra("Remote state migration failed", {
          phase: "remote-state-migration",
          backupPath,
          journalPath,
        }),
      );
    }

    await writeFile(
      markerPath,
      jsonStringify({
        version: this.schemaVersion,
        migratedAt: this.now().toISOString(),
      }),
    );

    return ok({ backupPath, journalPath });
  }

  private async verifyIntegrity(): Promise<Result<void>> {
    const marker = await readJsonFile<{ version?: number }>(join(this.dataRoot, schemaMarkerFile));
    if (marker?.version !== this.schemaVersion) {
      return err(
        domainError.infra("Remote state schema marker failed integrity check", {
          phase: "remote-state-migration",
          expectedSchemaVersion: this.schemaVersion,
          actualSchemaVersion: marker?.version ?? null,
        }),
      );
    }
    return ok(undefined);
  }

  private async writeRecoveryMarker(message: string): Promise<void> {
    await writeFile(
      join(this.dataRoot, recoveryMarkerFile),
      jsonStringify({
        phase: "remote-state-recovery",
        message,
        recordedAt: this.now().toISOString(),
      }),
    );
  }
}

export class FileSystemSourceLinkStore {
  constructor(private readonly dataRoot: string) {}

  async list(): Promise<Result<SourceLinkRecord[]>> {
    try {
      if (!(await pathExists(this.linksDirectory()))) {
        return ok([]);
      }

      const records: SourceLinkRecord[] = [];
      for (const entry of await readdir(this.linksDirectory())) {
        const record = await readJsonFile<SourceLinkRecord>(join(this.linksDirectory(), entry));
        if (record) {
          records.push(record);
        }
      }

      return ok(records);
    } catch (error) {
      return err(
        domainError.infra("Source links could not be listed", {
          phase: "source-link-resolution",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async read(sourceFingerprint: string): Promise<Result<SourceLinkRecord | null>> {
    const fingerprintResult = validateSourceFingerprint(sourceFingerprint);
    if (fingerprintResult.isErr()) {
      return err(fingerprintResult.error);
    }

    try {
      return ok(
        await readJsonFile<SourceLinkRecord>(
          join(this.linksDirectory(), encodeSourceLinkFileName(sourceFingerprint)),
        ),
      );
    } catch (error) {
      return err(
        domainError.infra("Source link could not be read", {
          phase: "source-link-resolution",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async createIfMissing(input: {
    sourceFingerprint: string;
    target: SourceLinkTarget;
    updatedAt: string;
  }): Promise<Result<SourceLinkRecord>> {
    const targetResult = validateTargetContext(input.target);
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }

    const existing = await this.read(input.sourceFingerprint);
    if (existing.isErr()) {
      return err(existing.error);
    }
    if (existing.value) {
      return ok(existing.value);
    }
    return await this.write({
      sourceFingerprint: input.sourceFingerprint,
      updatedAt: input.updatedAt,
      ...input.target,
    });
  }

  async requireSameTargetOrMissing(
    sourceFingerprint: string,
    target: SourceLinkTarget,
  ): Promise<Result<SourceLinkRecord | null>> {
    const targetResult = validateTargetContext(target);
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }

    const existing = await this.read(sourceFingerprint);
    if (existing.isErr() || !existing.value) {
      return existing;
    }
    if (sameTarget(existing.value, target)) {
      return existing;
    }
    return err(
      domainError.validation("Source link points at another deployment context", {
        phase: "source-link-resolution",
        sourceFingerprint,
        projectId: existing.value.projectId,
        environmentId: existing.value.environmentId,
        resourceId: existing.value.resourceId,
      }),
    );
  }

  async relink(input: {
    sourceFingerprint: string;
    target: SourceLinkTarget;
    updatedAt: string;
    expectedCurrentProjectId?: string;
    expectedCurrentEnvironmentId?: string;
    expectedCurrentResourceId?: string;
    reason?: string;
  }): Promise<Result<SourceLinkRecord>> {
    const targetResult = validateTargetContext(input.target);
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }

    const existing = await this.read(input.sourceFingerprint);
    if (existing.isErr()) {
      return err(existing.error);
    }
    if (!existing.value) {
      return err(
        sourceLinkError("source_link_not_found", "Source link was not found", {
          phase: "source-link-resolution",
          sourceFingerprint: input.sourceFingerprint,
        }),
      );
    }
    if (
      input.expectedCurrentProjectId &&
      existing.value.projectId !== input.expectedCurrentProjectId
    ) {
      return err(
        sourceLinkError(
          "source_link_conflict",
          "Source link current project did not match expected guard",
          {
            phase: "source-link-resolution",
            expectedCurrentProjectId: input.expectedCurrentProjectId,
            actualProjectId: existing.value.projectId,
          },
        ),
      );
    }
    if (
      input.expectedCurrentEnvironmentId &&
      existing.value.environmentId !== input.expectedCurrentEnvironmentId
    ) {
      return err(
        sourceLinkError(
          "source_link_conflict",
          "Source link current environment did not match expected guard",
          {
            phase: "source-link-resolution",
            expectedCurrentEnvironmentId: input.expectedCurrentEnvironmentId,
            actualEnvironmentId: existing.value.environmentId,
          },
        ),
      );
    }
    if (
      input.expectedCurrentResourceId &&
      existing.value.resourceId !== input.expectedCurrentResourceId
    ) {
      return err(
        sourceLinkError(
          "source_link_conflict",
          "Source link current resource did not match expected guard",
          {
            phase: "source-link-resolution",
            expectedCurrentResourceId: input.expectedCurrentResourceId,
            actualResourceId: existing.value.resourceId,
          },
        ),
      );
    }
    if (sameTarget(existing.value, input.target)) {
      return ok(existing.value);
    }
    return await this.write({
      sourceFingerprint: input.sourceFingerprint,
      updatedAt: input.updatedAt,
      ...(input.reason ? { reason: input.reason } : {}),
      ...input.target,
    });
  }

  async unlink(sourceFingerprint: string): Promise<Result<boolean>> {
    const fingerprintResult = validateSourceFingerprint(sourceFingerprint);
    if (fingerprintResult.isErr()) {
      return err(fingerprintResult.error);
    }

    try {
      const path = join(this.linksDirectory(), encodeSourceLinkFileName(sourceFingerprint));
      const exists = await pathExists(path);
      if (!exists) {
        return ok(false);
      }

      await rm(path);
      return ok(true);
    } catch (error) {
      return err(
        domainError.infra("Source link could not be removed", {
          phase: "source-link-persistence",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async diagnostics(sourceFingerprint: string): Promise<Result<SourceLinkDiagnostics | null>> {
    const record = await this.read(sourceFingerprint);
    if (record.isErr() || !record.value) {
      return record;
    }
    const value = record.value;
    return ok({
      sourceFingerprint: value.sourceFingerprint,
      projectId: value.projectId,
      environmentId: value.environmentId,
      resourceId: value.resourceId,
      ...(value.serverId ? { serverId: value.serverId } : {}),
      ...(value.destinationId ? { destinationId: value.destinationId } : {}),
      updatedAt: value.updatedAt,
      ...(value.reason ? { reason: value.reason } : {}),
    });
  }

  private linksDirectory(): string {
    return join(this.dataRoot, "source-links");
  }

  private async write(record: SourceLinkRecord): Promise<Result<SourceLinkRecord>> {
    try {
      await mkdir(this.linksDirectory(), { recursive: true });
      await writeFile(
        join(this.linksDirectory(), encodeSourceLinkFileName(record.sourceFingerprint)),
        jsonStringify(record),
      );
      return ok(record);
    } catch (error) {
      return err(
        domainError.infra("Source link could not be persisted", {
          phase: "source-link-persistence",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

export class FileSystemServerAppliedRouteDesiredStateStore
  implements ServerAppliedRouteDesiredStateStore
{
  constructor(private readonly dataRoot: string) {}

  async list(): Promise<Result<ServerAppliedRouteDesiredStateRecord[]>> {
    try {
      if (!(await pathExists(this.routesDirectory()))) {
        return ok([]);
      }

      const records: ServerAppliedRouteDesiredStateRecord[] = [];
      for (const entry of await readdir(this.routesDirectory())) {
        const record = await readJsonFile<ServerAppliedRouteDesiredStateRecord>(
          join(this.routesDirectory(), entry),
        );
        if (record) {
          records.push(record);
        }
      }

      return ok(records);
    } catch (error) {
      return err(
        domainError.infra("Server-applied route desired states could not be listed", {
          phase: "config-domain-resolution",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async upsertDesired(input: {
    target: ServerAppliedRouteTarget;
    domains: ServerAppliedRouteDomainIntent[];
    sourceFingerprint?: string;
    updatedAt: string;
  }): Promise<Result<ServerAppliedRouteDesiredStateRecord>> {
    const targetResult = validateServerAppliedRouteTarget(input.target);
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }

    const domainsResult = validateServerAppliedRouteDomains(input.domains);
    if (domainsResult.isErr()) {
      return err(domainsResult.error);
    }

    if (input.sourceFingerprint) {
      const fingerprintResult = validateSourceFingerprint(input.sourceFingerprint);
      if (fingerprintResult.isErr()) {
        return err(fingerprintResult.error);
      }
    }

    return await this.write({
      routeSetId: routeSetKey(input.target),
      ...input.target,
      ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}),
      domains: input.domains.map((domain) => ({
        host: domain.host,
        pathPrefix: domain.pathPrefix,
        tlsMode: domain.tlsMode,
        ...(domain.redirectTo ? { redirectTo: domain.redirectTo } : {}),
        ...(domain.redirectStatus ? { redirectStatus: domain.redirectStatus } : {}),
      })),
      status: "desired",
      updatedAt: input.updatedAt,
    });
  }

  async read(
    target: ServerAppliedRouteTarget,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    const targetResult = validateServerAppliedRouteTarget(target);
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }

    try {
      const exact = await this.readRecord(target);
      if (exact || !target.destinationId) {
        return ok(exact);
      }

      return ok(
        await this.readRecord({
          projectId: target.projectId,
          environmentId: target.environmentId,
          resourceId: target.resourceId,
          serverId: target.serverId,
        }),
      );
    } catch (error) {
      return err(
        domainError.infra("Server-applied route desired state could not be read", {
          phase: "config-domain-resolution",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async markApplied(input: {
    target: ServerAppliedRouteTarget;
    deploymentId: string;
    updatedAt: string;
    routeSetId?: string;
    providerKey?: string;
    proxyKind?: EdgeProxyKind;
  }): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    const existing = await this.readForStatusUpdate(input.target, input.routeSetId);
    if (existing.isErr() || !existing.value) {
      return existing;
    }

    const record = existing.value;
    return await this.write({
      routeSetId: record.routeSetId,
      projectId: record.projectId,
      environmentId: record.environmentId,
      resourceId: record.resourceId,
      serverId: record.serverId,
      ...(record.destinationId ? { destinationId: record.destinationId } : {}),
      ...(record.sourceFingerprint ? { sourceFingerprint: record.sourceFingerprint } : {}),
      domains: record.domains,
      status: "applied",
      updatedAt: input.updatedAt,
      lastApplied: {
        deploymentId: input.deploymentId,
        appliedAt: input.updatedAt,
        ...(input.providerKey ? { providerKey: input.providerKey } : {}),
        ...(input.proxyKind ? { proxyKind: input.proxyKind } : {}),
      },
    });
  }

  async markFailed(input: {
    target: ServerAppliedRouteTarget;
    deploymentId: string;
    updatedAt: string;
    phase: string;
    errorCode: string;
    message?: string;
    retryable: boolean;
    routeSetId?: string;
    providerKey?: string;
    proxyKind?: EdgeProxyKind;
  }): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    const existing = await this.readForStatusUpdate(input.target, input.routeSetId);
    if (existing.isErr() || !existing.value) {
      return existing;
    }

    const record = existing.value;
    return await this.write({
      routeSetId: record.routeSetId,
      projectId: record.projectId,
      environmentId: record.environmentId,
      resourceId: record.resourceId,
      serverId: record.serverId,
      ...(record.destinationId ? { destinationId: record.destinationId } : {}),
      ...(record.sourceFingerprint ? { sourceFingerprint: record.sourceFingerprint } : {}),
      domains: record.domains,
      status: "failed",
      updatedAt: input.updatedAt,
      ...(record.lastApplied ? { lastApplied: record.lastApplied } : {}),
      lastFailure: {
        deploymentId: input.deploymentId,
        failedAt: input.updatedAt,
        phase: input.phase,
        errorCode: input.errorCode,
        retryable: input.retryable,
        ...(input.message ? { message: input.message } : {}),
        ...(input.providerKey ? { providerKey: input.providerKey } : {}),
        ...(input.proxyKind ? { proxyKind: input.proxyKind } : {}),
      },
    });
  }

  async deleteDesired(target: ServerAppliedRouteTarget): Promise<Result<boolean>> {
    const targetResult = validateServerAppliedRouteTarget(target);
    if (targetResult.isErr()) {
      return err(targetResult.error);
    }

    try {
      const path = join(this.routesDirectory(), encodeServerAppliedRouteFileName(target));
      const exists = await pathExists(path);
      if (!exists) {
        return ok(false);
      }

      await rm(path);
      return ok(true);
    } catch (error) {
      return err(
        domainError.infra("Server-applied route desired state could not be removed", {
          phase: "config-domain-resolution",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  async deleteDesiredBySourceFingerprint(sourceFingerprint: string): Promise<Result<number>> {
    const fingerprintResult = validateSourceFingerprint(sourceFingerprint);
    if (fingerprintResult.isErr()) {
      return err(fingerprintResult.error);
    }

    try {
      if (!(await pathExists(this.routesDirectory()))) {
        return ok(0);
      }

      let deleted = 0;
      for (const entry of await readdir(this.routesDirectory())) {
        const path = join(this.routesDirectory(), entry);
        const record = await readJsonFile<ServerAppliedRouteDesiredStateRecord>(path);
        if (!record || record.sourceFingerprint !== sourceFingerprint) {
          continue;
        }

        await rm(path);
        deleted += 1;
      }

      return ok(deleted);
    } catch (error) {
      return err(
        domainError.infra("Server-applied route desired state sweep could not be removed", {
          phase: "config-domain-resolution",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private async readForStatusUpdate(
    target: ServerAppliedRouteTarget,
    expectedRouteSetId?: string,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    const existing = await this.read(target);
    if (existing.isErr() || !existing.value) {
      return existing;
    }

    if (expectedRouteSetId && existing.value.routeSetId !== expectedRouteSetId) {
      return err(
        serverAppliedRouteStateError(
          "server_applied_route_state_conflict",
          "Server-applied route state did not match expected route set",
          {
            phase: "proxy-route-realization",
            expectedRouteSetId,
            actualRouteSetId: existing.value.routeSetId,
          },
        ),
      );
    }

    return existing;
  }

  private routesDirectory(): string {
    return join(this.dataRoot, "server-applied-routes");
  }

  private async readRecord(
    target: ServerAppliedRouteTarget,
  ): Promise<ServerAppliedRouteDesiredStateRecord | null> {
    return await readJsonFile<ServerAppliedRouteDesiredStateRecord>(
      join(this.routesDirectory(), encodeServerAppliedRouteFileName(target)),
    );
  }

  private async write(
    record: ServerAppliedRouteDesiredStateRecord,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord>> {
    try {
      await mkdir(this.routesDirectory(), { recursive: true });
      await writeFile(
        join(this.routesDirectory(), encodeServerAppliedRouteFileName(record)),
        jsonStringify(record),
      );
      return ok(record);
    } catch (error) {
      return err(
        domainError.infra("Server-applied route desired state could not be persisted", {
          phase: "config-domain-resolution",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}

function sameTarget(left: SourceLinkTarget, right: SourceLinkTarget): boolean {
  return (
    left.projectId === right.projectId &&
    left.environmentId === right.environmentId &&
    left.resourceId === right.resourceId &&
    left.serverId === right.serverId &&
    left.destinationId === right.destinationId
  );
}

export async function remoteStatePathExists(path: string): Promise<boolean> {
  return await pathExists(path);
}
