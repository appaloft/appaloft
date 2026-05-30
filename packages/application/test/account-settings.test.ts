import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";

import {
  type AccountProfileSummary,
  type AccountSessionSummary,
  type AccountSettingsPort,
  ChangeAccountProfileCommand,
  ChangeAccountProfileCommandHandler,
  type ChangeAccountProfileInput,
  ChangeAccountProfileUseCase,
  createExecutionContext,
  DeleteAccountCommand,
  DeleteAccountCommandHandler,
  type DeleteAccountInput,
  DeleteAccountUseCase,
  type ExecutionContext,
  ListAccountSessionsQuery,
  ListAccountSessionsQueryHandler,
  ListAccountSessionsQueryService,
  type OperationCheckRequest,
  type OperationGuardDecision,
  type OperationGuardPort,
  operationCatalog,
  RevokeAccountSessionCommand,
  RevokeAccountSessionCommandHandler,
  type RevokeAccountSessionInput,
  RevokeAccountSessionUseCase,
  ShowAccountProfileQuery,
  ShowAccountProfileQueryHandler,
  ShowAccountProfileQueryService,
} from "../src";

const context = createExecutionContext({ entrypoint: "http" });

const profile: AccountProfileSummary = {
  userId: "usr_admin",
  email: "admin@example.com",
  displayName: "Admin User",
  avatarUrl: "https://example.com/avatar.png",
  emailVerified: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:01:00.000Z",
};

const session: AccountSessionSummary = {
  sessionId: "sess_current",
  userId: "usr_admin",
  clientKind: "cli",
  displayName: "Appaloft CLI",
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-02-01T00:00:00.000Z",
  current: true,
  ipAddress: "127.0.0.1",
  userAgent: "Appaloft Test",
};

class CapturingAccountSettingsPort implements AccountSettingsPort {
  readonly calls: string[] = [];
  readonly inputs: unknown[] = [];

  async showAccountProfile(_context: ExecutionContext): Promise<Result<AccountProfileSummary>> {
    this.calls.push("showAccountProfile");
    return ok(profile);
  }

  async changeAccountProfile(
    _context: ExecutionContext,
    input: ChangeAccountProfileInput,
  ): Promise<Result<AccountProfileSummary>> {
    this.calls.push("changeAccountProfile");
    this.inputs.push(input);
    return ok({
      ...profile,
      ...(input.displayName ? { displayName: input.displayName } : {}),
      ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
    });
  }

  async listAccountSessions(
    _context: ExecutionContext,
  ): Promise<Result<{ items: AccountSessionSummary[]; nextCursor?: string }>> {
    this.calls.push("listAccountSessions");
    return ok({ items: [session] });
  }

  async revokeAccountSession(
    _context: ExecutionContext,
    input: RevokeAccountSessionInput,
  ): Promise<Result<{ sessionId: string; revokedAt: string }>> {
    this.calls.push("revokeAccountSession");
    this.inputs.push(input);
    return ok({
      sessionId: input.sessionId,
      revokedAt: "2026-01-01T00:02:00.000Z",
    });
  }

  async deleteAccount(
    _context: ExecutionContext,
    input: DeleteAccountInput,
  ): Promise<Result<{ userId: string; deletedAt: string }>> {
    this.calls.push("deleteAccount");
    this.inputs.push(input);
    return ok({
      userId: input.confirmation.userId,
      deletedAt: "2026-01-01T00:03:00.000Z",
    });
  }
}

class DenyingOperationGuardPort implements OperationGuardPort {
  readonly requests: OperationCheckRequest[] = [];

  async checkOperation(
    _context: ExecutionContext,
    request: OperationCheckRequest,
  ): Promise<OperationGuardDecision> {
    this.requests.push(request);
    return {
      allowed: false,
      checks: [
        {
          allowed: false,
          checkKey: "test.policy",
          kind: "policy",
          reason: "test-operation-denied",
        },
      ],
      deniedBy: {
        checkKey: "test.policy",
        kind: "policy",
      },
      reason: "test-operation-denied",
    };
  }
}

describe("account settings application boundary", () => {
  test("[ACCOUNT-SETTINGS-PROFILE-001] profile read/change dispatch through AccountSettingsPort", async () => {
    const port = new CapturingAccountSettingsPort();
    const show = await new ShowAccountProfileQueryHandler(
      new ShowAccountProfileQueryService(port),
    ).handle(context, ShowAccountProfileQuery.create({})._unsafeUnwrap());
    const update = await new ChangeAccountProfileCommandHandler(
      new ChangeAccountProfileUseCase(port),
    ).handle(
      context,
      ChangeAccountProfileCommand.create({
        displayName: "Renamed User",
        avatarUrl: "https://example.com/new-avatar.png",
      })._unsafeUnwrap(),
    );

    expect(show._unsafeUnwrap()).toEqual(profile);
    expect(JSON.stringify(show._unsafeUnwrap())).not.toContain("providerToken");
    expect(update._unsafeUnwrap()).toMatchObject({
      displayName: "Renamed User",
      avatarUrl: "https://example.com/new-avatar.png",
    });
    expect(port.calls).toEqual(["showAccountProfile", "changeAccountProfile"]);
  });

  test("[ACCOUNT-SETTINGS-GUARD-001] profile changes can be denied before settings port side effects", async () => {
    const port = new CapturingAccountSettingsPort();
    const guard = new DenyingOperationGuardPort();
    const result = await new ChangeAccountProfileUseCase(port, guard).execute(context, {
      displayName: "Blocked User",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.policy",
        checkKind: "policy",
        operationKey: "account.profile.change",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toHaveLength(1);
    expect(guard.requests[0]).toMatchObject({
      operationKey: "account.profile.change",
    });
    expect(port.calls).toEqual([]);
  });

  test("[ACCOUNT-SETTINGS-SESSION-001] session list/revoke dispatch safely without token material", async () => {
    const port = new CapturingAccountSettingsPort();
    const list = await new ListAccountSessionsQueryHandler(
      new ListAccountSessionsQueryService(port),
    ).handle(context, ListAccountSessionsQuery.create({})._unsafeUnwrap());
    const revoke = await new RevokeAccountSessionCommandHandler(
      new RevokeAccountSessionUseCase(port),
    ).handle(
      context,
      RevokeAccountSessionCommand.create({
        sessionId: "sess_current",
      })._unsafeUnwrap(),
    );

    expect(list._unsafeUnwrap()).toEqual({ items: [session] });
    expect(JSON.stringify(list._unsafeUnwrap())).not.toContain("token");
    expect(revoke._unsafeUnwrap()).toEqual({
      sessionId: "sess_current",
      revokedAt: "2026-01-01T00:02:00.000Z",
    });
    expect(port.calls).toEqual(["listAccountSessions", "revokeAccountSession"]);
  });

  test("[ACCOUNT-SETTINGS-GUARD-002] session revocation can be denied before settings port side effects", async () => {
    const port = new CapturingAccountSettingsPort();
    const guard = new DenyingOperationGuardPort();
    const result = await new RevokeAccountSessionUseCase(port, guard).execute(context, {
      sessionId: "sess_current",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.policy",
        checkKind: "policy",
        operationKey: "account.sessions.revoke",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toHaveLength(1);
    expect(guard.requests[0]).toMatchObject({
      operationKey: "account.sessions.revoke",
      resourceRefs: {
        sessionId: "sess_current",
      },
    });
    expect(port.calls).toEqual([]);
  });

  test("[ACCOUNT-SETTINGS-DANGER-001] exact signed-in user-id confirmation is required before delete dispatch", async () => {
    const port = new CapturingAccountSettingsPort();
    const handler = new DeleteAccountCommandHandler(new DeleteAccountUseCase(port));

    const rejected = await handler.handle(
      context,
      DeleteAccountCommand.create({
        confirmation: {
          userId: "usr_other",
        },
      })._unsafeUnwrap(),
    );
    const deleted = await handler.handle(
      context,
      DeleteAccountCommand.create({
        confirmation: {
          userId: "usr_admin",
        },
      })._unsafeUnwrap(),
    );

    expect(rejected.isErr()).toBe(true);
    expect(rejected._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "account-danger-zone",
      },
    });
    expect(deleted._unsafeUnwrap()).toEqual({
      userId: "usr_admin",
      deletedAt: "2026-01-01T00:03:00.000Z",
    });
    expect(port.calls).toEqual(["showAccountProfile", "showAccountProfile", "deleteAccount"]);
  });

  test("[ACCOUNT-SETTINGS-GUARD-003] account deletion can be denied after confirmation but before delete side effects", async () => {
    const port = new CapturingAccountSettingsPort();
    const guard = new DenyingOperationGuardPort();
    const result = await new DeleteAccountUseCase(port, guard).execute(context, {
      confirmation: {
        userId: "usr_admin",
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "operation_check_denied",
      details: {
        checkKey: "test.policy",
        checkKind: "policy",
        operationKey: "account.delete",
        reason: "test-operation-denied",
      },
    });
    expect(guard.requests).toHaveLength(1);
    expect(guard.requests[0]).toMatchObject({
      contextAttributes: {
        accountUserId: "usr_admin",
      },
      operationKey: "account.delete",
    });
    expect(port.calls).toEqual(["showAccountProfile"]);
  });

  test("operation catalog includes account settings HTTP/oRPC transport entries", () => {
    const entries = operationCatalog.filter((entry) => entry.domain === "account");

    expect(entries.map((entry) => entry.key)).toEqual([
      "account.profile.show",
      "account.profile.change",
      "account.sessions.list",
      "account.sessions.revoke",
      "account.delete",
    ]);
    expect(entries.map((entry) => entry.transports.orpc?.path)).toEqual([
      "/api/account/profile",
      "/api/account/profile",
      "/api/account/sessions",
      "/api/account/sessions/{sessionId}/revoke",
      "/api/account",
    ]);
  });
});
