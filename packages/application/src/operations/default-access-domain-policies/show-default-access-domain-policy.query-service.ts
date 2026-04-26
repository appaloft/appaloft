import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  DefaultAccessDomainPolicyByScopeSpec,
  type DefaultAccessDomainPolicyRepository,
  type DefaultAccessDomainPolicyScope,
  type ServerRepository,
  type ShowDefaultAccessDomainPolicyResult,
} from "../../ports";
import { tokens } from "../../tokens";
import { toDefaultAccessDomainPolicyRead } from "./policy-readback";

@injectable()
export class ShowDefaultAccessDomainPolicyQueryService {
  constructor(
    @inject(tokens.defaultAccessDomainPolicyRepository)
    private readonly policyRepository: DefaultAccessDomainPolicyRepository,
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
  ) {}

  async execute(
    context: ExecutionContext,
    input: {
      scopeKind: "system" | "deployment-target";
      serverId?: string;
    },
  ): Promise<Result<ShowDefaultAccessDomainPolicyResult>> {
    const scopeResult = await this.resolveScope(context, input);
    if (scopeResult.isErr()) {
      return err(scopeResult.error);
    }

    const scope = scopeResult.value;
    const record = await this.policyRepository.findOne(
      DefaultAccessDomainPolicyByScopeSpec.create(scope),
    );
    if (record.isErr()) {
      return err(record.error);
    }

    return ok({
      schemaVersion: "default-access-domain-policies.show/v1",
      scope,
      policy: record.value ? toDefaultAccessDomainPolicyRead(record.value) : null,
    });
  }

  private async resolveScope(
    context: ExecutionContext,
    input: {
      scopeKind: "system" | "deployment-target";
      serverId?: string;
    },
  ): Promise<Result<DefaultAccessDomainPolicyScope>> {
    if (input.scopeKind === "system") {
      return ok({ kind: "system" });
    }

    const serverIdResult = DeploymentTargetId.create(input.serverId ?? "");
    if (serverIdResult.isErr()) {
      return err(serverIdResult.error);
    }

    const server = await this.serverRepository.findOne(
      toRepositoryContext(context),
      DeploymentTargetByIdSpec.create(serverIdResult.value),
    );

    if (!server) {
      return err(domainError.notFound("server", input.serverId ?? ""));
    }

    return ok({
      kind: "deployment-target",
      serverId: serverIdResult.value.value,
    });
  }
}
