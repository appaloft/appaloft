import {
  type ConnectionOwnerSnapshot,
  type ConnectionSnapshot,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";

import { type ExecutionContext } from "../../execution-context";

export function defaultConnectionOwnerForContext(
  context: ExecutionContext | undefined,
): ConnectionOwnerSnapshot {
  const tenant = context?.tenant;
  if (!isConnectionTenantScopeEnforced(context) || !tenant) {
    return { scope: "operator", id: "local" };
  }
  if (tenant.organizationId) {
    return { scope: "organization", id: tenant.organizationId, tenantId: tenant.tenantId };
  }
  if (tenant.accountId) {
    return { scope: "account", id: tenant.accountId, tenantId: tenant.tenantId };
  }
  return { scope: "organization", id: tenant.tenantId, tenantId: tenant.tenantId };
}

export function ensureConnectionOwnerAllowedForContext(
  context: ExecutionContext | undefined,
  owner: ConnectionOwnerSnapshot,
): Result<ConnectionOwnerSnapshot> {
  if (!isConnectionTenantScopeEnforced(context)) {
    return ok(owner);
  }
  if (connectionOwnerBelongsToContext(context, owner)) {
    return ok({
      ...owner,
      tenantId: owner.tenantId ?? context?.tenant?.tenantId,
    });
  }
  return err(domainError.notFound("Connection owner", `${owner.scope}:${owner.id}`));
}

export function connectionBelongsToContext(
  context: ExecutionContext | undefined,
  connection: ConnectionSnapshot,
): boolean {
  if (!isConnectionTenantScopeEnforced(context)) {
    return true;
  }
  return connectionOwnerBelongsToContext(context, connection.owner);
}

export function ownerScopeForConnectionList(
  context: ExecutionContext,
  requestedOwner: ConnectionOwnerSnapshot | undefined,
): Result<ConnectionOwnerSnapshot | undefined> {
  if (requestedOwner) {
    return ensureConnectionOwnerAllowedForContext(context, requestedOwner);
  }
  if (!isConnectionTenantScopeEnforced(context)) {
    return ok(undefined);
  }
  return ok(defaultConnectionOwnerForContext(context));
}

function isConnectionTenantScopeEnforced(context: ExecutionContext | undefined): boolean {
  const tenant = context?.tenant;
  return Boolean(
    tenant &&
      tenant.tenantId &&
      tenant.tenantId !== "tenant_instance" &&
      tenant.source !== "instance-default",
  );
}

function connectionOwnerBelongsToContext(
  context: ExecutionContext | undefined,
  owner: ConnectionOwnerSnapshot,
): boolean {
  const tenant = context?.tenant;
  if (!tenant) {
    return true;
  }
  if (owner.tenantId) {
    return owner.tenantId === tenant.tenantId;
  }
  if (owner.scope === "organization") {
    return owner.id === (tenant.organizationId ?? tenant.tenantId);
  }
  if (owner.scope === "account") {
    return owner.id === (tenant.accountId ?? tenant.tenantId);
  }
  return false;
}
