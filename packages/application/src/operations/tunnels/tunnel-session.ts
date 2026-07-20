import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { z } from "zod";

import {
  Command,
  CommandHandler,
  type CommandHandlerContract,
  Query,
  QueryHandler,
  type QueryHandlerContract,
} from "../../cqrs";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "../../execution-context";
import { type Clock, type IdGenerator } from "../../ports";
import { tokens } from "../../tokens";
import { parseOperationInput } from "../shared-schema";

export type TunnelProviderKey = "cloudflare-quick" | "ngrok";
export type TunnelSessionStatus = "starting" | "ready" | "failed" | "revoked" | "expired";

export interface TunnelProviderHandle {
  sessionRef: string;
  processId: number;
  executable: string;
  originUrl: string;
}

export interface TunnelSessionRecord {
  id: string;
  providerKey: TunnelProviderKey;
  originUrl: string;
  publicUrl: string | null;
  status: TunnelSessionStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  failureCode: string | null;
  providerHandle: TunnelProviderHandle | null;
}

export type TunnelSessionSummary = Omit<TunnelSessionRecord, "providerHandle">;

export interface TunnelSessionRepository {
  findOne(
    context: RepositoryContext,
    sessionId: string,
  ): Promise<Result<TunnelSessionRecord | null>>;
  listRecords(
    context: RepositoryContext,
    filter?: { statuses?: TunnelSessionStatus[]; expiresAtOrBefore?: string; limit?: number },
  ): Promise<Result<TunnelSessionRecord[]>>;
  save(
    context: RepositoryContext,
    record: TunnelSessionRecord,
  ): Promise<Result<TunnelSessionRecord>>;
}

export interface TunnelProviderPort {
  readonly key: TunnelProviderKey;
  start(input: {
    sessionId: string;
    originUrl: string;
    expiresAt: string;
  }): Promise<Result<{ publicUrl: string; handle: TunnelProviderHandle }>>;
  inspect(handle: TunnelProviderHandle): Promise<Result<{ running: boolean }>>;
  revoke(handle: TunnelProviderHandle): Promise<Result<void>>;
}

export interface TunnelProviderRegistry {
  find(providerKey: TunnelProviderKey): TunnelProviderPort | undefined;
}

export class InMemoryTunnelProviderRegistry implements TunnelProviderRegistry {
  private readonly providers: ReadonlyMap<TunnelProviderKey, TunnelProviderPort>;

  constructor(providers: readonly TunnelProviderPort[]) {
    this.providers = new Map(providers.map((provider) => [provider.key, provider]));
  }

  find(providerKey: TunnelProviderKey): TunnelProviderPort | undefined {
    return this.providers.get(providerKey);
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false;
  }
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function isValidIpv6(hostname: string): boolean {
  if (!hostname.includes(":") || !/^[0-9a-f:]+$/.test(hostname)) return false;
  const halves = hostname.split("::");
  if (halves.length > 2) return false;
  const groups = halves.flatMap((half) => (half ? half.split(":") : []));
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return false;
  return halves.length === 2 ? groups.length < 8 : groups.length === 8;
}

function isPrivateIpv6(hostname: string): boolean {
  if (!isValidIpv6(hostname)) return false;
  if (hostname === "::1" || hostname === "0:0:0:0:0:0:0:1") return true;
  const first = Number.parseInt(hostname.split(":")[0] ?? "", 16);
  return (first >= 0xfc00 && first <= 0xfdff) || (first >= 0xfe80 && first <= 0xfebf);
}

export function isEligibleTunnelOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return (
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname === "0:0:0:0:0:0:0:1" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      isPrivateIpv4(hostname) ||
      isPrivateIpv6(hostname)
    );
  } catch {
    return false;
  }
}

const tunnelOriginSchema = z.string().trim().url().max(2048).refine(isEligibleTunnelOrigin, {
  message: "Tunnel origin must be an HTTP(S) loopback or private-network URL without credentials",
});

export const startTunnelCommandInputSchema = z.object({
  providerKey: z.enum(["cloudflare-quick", "ngrok"]),
  originUrl: tunnelOriginSchema,
  durationMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(60),
});
export const listTunnelSessionsQueryInputSchema = z.object({
  status: z.enum(["starting", "ready", "failed", "revoked", "expired"]).optional(),
});
export const showTunnelSessionQueryInputSchema = z.object({ sessionId: z.string().trim().min(1) });
export const revokeTunnelSessionCommandInputSchema = showTunnelSessionQueryInputSchema;

export type StartTunnelCommandInput = z.input<typeof startTunnelCommandInputSchema>;
export type ListTunnelSessionsQueryInput = z.input<typeof listTunnelSessionsQueryInputSchema>;
export type ShowTunnelSessionQueryInput = z.input<typeof showTunnelSessionQueryInputSchema>;
export type RevokeTunnelSessionCommandInput = z.input<typeof revokeTunnelSessionCommandInputSchema>;
export interface ListTunnelSessionsResponse {
  schemaVersion: "tunnel-sessions.list/v1";
  items: TunnelSessionSummary[];
}
export interface ShowTunnelSessionResponse {
  schemaVersion: "tunnel-sessions.show/v1";
  session: TunnelSessionSummary;
}
export interface StartTunnelResponse {
  schemaVersion: "tunnel-sessions.start/v1";
  session: TunnelSessionSummary;
}
export interface RevokeTunnelSessionResponse {
  schemaVersion: "tunnel-sessions.revoke/v1";
  session: TunnelSessionSummary;
}

function toSummary(record: TunnelSessionRecord): TunnelSessionSummary {
  const { providerHandle: _providerHandle, ...summary } = record;
  return summary;
}

export class StartTunnelCommand extends Command<StartTunnelResponse> {
  constructor(
    public readonly providerKey: TunnelProviderKey,
    public readonly originUrl: string,
    public readonly durationMinutes: number,
  ) {
    super();
  }
  static create(input: StartTunnelCommandInput): Result<StartTunnelCommand> {
    return parseOperationInput(startTunnelCommandInputSchema, input).map(
      (value) => new StartTunnelCommand(value.providerKey, value.originUrl, value.durationMinutes),
    );
  }
}

export class ListTunnelSessionsQuery extends Query<ListTunnelSessionsResponse> {
  constructor(public readonly status?: TunnelSessionStatus) {
    super();
  }
  static create(input: ListTunnelSessionsQueryInput = {}): Result<ListTunnelSessionsQuery> {
    return parseOperationInput(listTunnelSessionsQueryInputSchema, input).map(
      (value) => new ListTunnelSessionsQuery(value.status),
    );
  }
}

export class ShowTunnelSessionQuery extends Query<ShowTunnelSessionResponse> {
  constructor(public readonly sessionId: string) {
    super();
  }
  static create(input: ShowTunnelSessionQueryInput): Result<ShowTunnelSessionQuery> {
    return parseOperationInput(showTunnelSessionQueryInputSchema, input).map(
      (value) => new ShowTunnelSessionQuery(value.sessionId),
    );
  }
}

export class RevokeTunnelSessionCommand extends Command<RevokeTunnelSessionResponse> {
  constructor(public readonly sessionId: string) {
    super();
  }
  static create(input: RevokeTunnelSessionCommandInput): Result<RevokeTunnelSessionCommand> {
    return parseOperationInput(revokeTunnelSessionCommandInputSchema, input).map(
      (value) => new RevokeTunnelSessionCommand(value.sessionId),
    );
  }
}

@injectable()
export class TunnelSessionService {
  constructor(
    @inject(tokens.tunnelSessionRepository) private readonly repository: TunnelSessionRepository,
    @inject(tokens.tunnelProviderRegistry) private readonly providers: TunnelProviderRegistry,
    @inject(tokens.clock) private readonly clock: Clock,
    @inject(tokens.idGenerator) private readonly idGenerator: IdGenerator,
  ) {}

  async start(
    context: ExecutionContext,
    command: StartTunnelCommand,
  ): Promise<Result<StartTunnelResponse>> {
    const repositoryContext = toRepositoryContext(context);
    const provider = this.providers.find(command.providerKey);
    if (!provider) {
      return err(
        domainError.providerCapabilityUnsupported("Tunnel provider is unavailable", {
          phase: "tunnel-session-start",
          providerKey: command.providerKey,
        }),
      );
    }
    const now = this.clock.now();
    const session: TunnelSessionRecord = {
      id: this.idGenerator.next("tun"),
      providerKey: command.providerKey,
      originUrl: command.originUrl,
      publicUrl: null,
      status: "starting",
      expiresAt: new Date(new Date(now).getTime() + command.durationMinutes * 60_000).toISOString(),
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
      failureCode: null,
      providerHandle: null,
    };
    const recorded = await this.repository.save(repositoryContext, session);
    if (recorded.isErr()) return err(recorded.error);

    const started = await provider.start({
      sessionId: session.id,
      originUrl: session.originUrl,
      expiresAt: session.expiresAt,
    });
    if (started.isErr()) {
      await this.repository.save(repositoryContext, {
        ...session,
        status: "failed",
        failureCode: started.error.code,
        updatedAt: this.clock.now(),
      });
      return err(started.error);
    }
    const ready: TunnelSessionRecord = {
      ...session,
      publicUrl: started.value.publicUrl,
      providerHandle: started.value.handle,
      status: "ready",
      updatedAt: this.clock.now(),
    };
    const persisted = await this.repository.save(repositoryContext, ready);
    if (persisted.isErr()) {
      await provider.revoke(started.value.handle);
      return err(persisted.error);
    }
    return ok({ schemaVersion: "tunnel-sessions.start/v1", session: toSummary(persisted.value) });
  }

  async list(
    context: ExecutionContext,
    query: ListTunnelSessionsQuery,
  ): Promise<Result<ListTunnelSessionsResponse>> {
    const records = await this.repository.listRecords(toRepositoryContext(context), {
      ...(query.status ? { statuses: [query.status] } : {}),
    });
    return records.map((items) => ({
      schemaVersion: "tunnel-sessions.list/v1",
      items: items.map(toSummary),
    }));
  }

  async show(
    context: ExecutionContext,
    sessionId: string,
  ): Promise<Result<ShowTunnelSessionResponse>> {
    const record = await this.repository.findOne(toRepositoryContext(context), sessionId);
    if (record.isErr()) return err(record.error);
    if (!record.value) return err(domainError.notFound("tunnel_session", sessionId));
    return ok({ schemaVersion: "tunnel-sessions.show/v1", session: toSummary(record.value) });
  }

  async revoke(
    context: ExecutionContext,
    sessionId: string,
  ): Promise<Result<RevokeTunnelSessionResponse>> {
    const repositoryContext = toRepositoryContext(context);
    const found = await this.repository.findOne(repositoryContext, sessionId);
    if (found.isErr()) return err(found.error);
    if (!found.value) return err(domainError.notFound("tunnel_session", sessionId));
    if (["revoked", "expired"].includes(found.value.status)) {
      return ok({ schemaVersion: "tunnel-sessions.revoke/v1", session: toSummary(found.value) });
    }
    if (found.value.providerHandle) {
      const provider = this.providers.find(found.value.providerKey);
      if (!provider)
        return err(domainError.providerCapabilityUnsupported("Tunnel provider is unavailable"));
      const revoked = await provider.revoke(found.value.providerHandle);
      if (revoked.isErr()) return err(revoked.error);
    }
    const now = this.clock.now();
    const persisted = await this.repository.save(repositoryContext, {
      ...found.value,
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
      providerHandle: null,
    });
    return persisted.map((session) => ({
      schemaVersion: "tunnel-sessions.revoke/v1",
      session: toSummary(session),
    }));
  }

  async reconcile(
    context: ExecutionContext,
    input: { now?: string; limit?: number } = {},
  ): Promise<Result<{ inspected: number; expired: number; failed: number }>> {
    const repositoryContext = toRepositoryContext(context);
    const now = input.now ?? this.clock.now();
    const records = await this.repository.listRecords(repositoryContext, {
      statuses: ["starting", "ready"],
      limit: input.limit ?? 100,
    });
    if (records.isErr()) return err(records.error);
    let expired = 0;
    let failed = 0;
    for (const session of records.value) {
      const provider = this.providers.find(session.providerKey);
      if (session.expiresAt <= now) {
        if (provider && session.providerHandle) {
          const revoked = await provider.revoke(session.providerHandle);
          if (revoked.isErr()) continue;
        }
        const saved = await this.repository.save(repositoryContext, {
          ...session,
          status: "expired",
          revokedAt: now,
          updatedAt: now,
          providerHandle: null,
        });
        if (saved.isOk()) expired += 1;
        continue;
      }
      if (!provider || !session.providerHandle) {
        const saved = await this.repository.save(repositoryContext, {
          ...session,
          status: "failed",
          failureCode: provider ? "TUNNEL_PROCESS_MISSING" : "TUNNEL_PROVIDER_UNAVAILABLE",
          updatedAt: now,
          providerHandle: null,
        });
        if (saved.isOk()) failed += 1;
        continue;
      }
      const inspected = await provider.inspect(session.providerHandle);
      if (inspected.isOk() && !inspected.value.running) {
        const saved = await this.repository.save(repositoryContext, {
          ...session,
          status: "failed",
          failureCode: "TUNNEL_PROCESS_EXITED",
          updatedAt: now,
          providerHandle: null,
        });
        if (saved.isOk()) failed += 1;
      }
    }
    return ok({ inspected: records.value.length, expired, failed });
  }
}

@CommandHandler(StartTunnelCommand)
@injectable()
export class StartTunnelCommandHandler
  implements CommandHandlerContract<StartTunnelCommand, StartTunnelResponse>
{
  constructor(
    @inject(tokens.tunnelSessionService) private readonly service: TunnelSessionService,
  ) {}
  handle(context: ExecutionContext, command: StartTunnelCommand) {
    return this.service.start(context, command);
  }
}

@QueryHandler(ListTunnelSessionsQuery)
@injectable()
export class ListTunnelSessionsQueryHandler
  implements QueryHandlerContract<ListTunnelSessionsQuery, ListTunnelSessionsResponse>
{
  constructor(
    @inject(tokens.tunnelSessionService) private readonly service: TunnelSessionService,
  ) {}
  handle(context: ExecutionContext, query: ListTunnelSessionsQuery) {
    return this.service.list(context, query);
  }
}

@QueryHandler(ShowTunnelSessionQuery)
@injectable()
export class ShowTunnelSessionQueryHandler
  implements QueryHandlerContract<ShowTunnelSessionQuery, ShowTunnelSessionResponse>
{
  constructor(
    @inject(tokens.tunnelSessionService) private readonly service: TunnelSessionService,
  ) {}
  handle(context: ExecutionContext, query: ShowTunnelSessionQuery) {
    return this.service.show(context, query.sessionId);
  }
}

@CommandHandler(RevokeTunnelSessionCommand)
@injectable()
export class RevokeTunnelSessionCommandHandler
  implements CommandHandlerContract<RevokeTunnelSessionCommand, RevokeTunnelSessionResponse>
{
  constructor(
    @inject(tokens.tunnelSessionService) private readonly service: TunnelSessionService,
  ) {}
  handle(context: ExecutionContext, command: RevokeTunnelSessionCommand) {
    return this.service.revoke(context, command.sessionId);
  }
}
