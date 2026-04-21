import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  domainError,
  err,
  ok,
  type Result,
  safeTry,
  UpdatedAt,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  DefaultAccessDomainPolicyByScopeSpec,
  type DefaultAccessDomainPolicyConfiguration,
  type DefaultAccessDomainPolicyRecord,
  type DefaultAccessDomainPolicyRepository,
  type DefaultAccessDomainPolicyScope,
  type DefaultAccessDomainPolicySupport,
  type IdGenerator,
  type ServerRepository,
  UpsertDefaultAccessDomainPolicySpec,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ConfigureDefaultAccessDomainPolicyCommandInput } from "./configure-default-access-domain-policy.command";

function samePolicy(
  left: DefaultAccessDomainPolicyConfiguration,
  right: DefaultAccessDomainPolicyConfiguration,
): boolean {
  return (
    left.mode === right.mode &&
    (left.providerKey ?? undefined) === (right.providerKey ?? undefined) &&
    (left.templateRef ?? undefined) === (right.templateRef ?? undefined)
  );
}

@injectable()
export class ConfigureDefaultAccessDomainPolicyUseCase {
  constructor(
    @inject(tokens.defaultAccessDomainPolicyRepository)
    private readonly policyRepository: DefaultAccessDomainPolicyRepository,
    @inject(tokens.defaultAccessDomainPolicySupport)
    private readonly policySupport: DefaultAccessDomainPolicySupport,
    @inject(tokens.serverRepository)
    private readonly serverRepository: ServerRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigureDefaultAccessDomainPolicyCommandInput,
  ): Promise<Result<{ id: string }>> {
    const repositoryContext = toRepositoryContext(context);
    const { clock, idGenerator, policyRepository, policySupport, serverRepository } = this;

    return safeTry(async function* () {
      let scope: DefaultAccessDomainPolicyScope;
      if (input.scope.kind === "system") {
        scope = { kind: "system" };
      } else {
        const serverId = yield* DeploymentTargetId.create(input.scope.serverId);
        const server = await serverRepository.findOne(
          repositoryContext,
          DeploymentTargetByIdSpec.create(serverId),
        );

        if (!server) {
          return err(domainError.notFound("server", input.scope.serverId));
        }

        scope = {
          kind: "deployment-target",
          serverId: serverId.value,
        };
      }

      const policy = yield* await policySupport.validate(context, {
        mode: input.mode,
        ...(input.providerKey ? { providerKey: input.providerKey } : {}),
        ...(input.templateRef ? { templateRef: input.templateRef } : {}),
      });
      const existing = yield* await policyRepository.findOne(
        DefaultAccessDomainPolicyByScopeSpec.create(scope),
      );

      if (input.idempotencyKey && existing?.idempotencyKey === input.idempotencyKey) {
        if (!samePolicy(existing, policy)) {
          return err(
            domainError.defaultAccessPolicyConflict(
              "Default access policy idempotency key does not match existing policy state",
              {
                phase: "policy-admission",
                idempotencyKey: input.idempotencyKey,
                scopeKind: scope.kind,
                ...(scope.kind === "deployment-target" ? { serverId: scope.serverId } : {}),
              },
            ),
          );
        }

        return ok({ id: existing.id });
      }

      const updatedAt = yield* UpdatedAt.create(clock.now());
      const record: DefaultAccessDomainPolicyRecord = {
        id: existing?.id ?? idGenerator.next("dap"),
        scope,
        mode: policy.mode,
        updatedAt: updatedAt.value,
        ...(policy.providerKey ? { providerKey: policy.providerKey } : {}),
        ...(policy.templateRef ? { templateRef: policy.templateRef } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      };
      const persisted = yield* await policyRepository.upsert(
        record,
        UpsertDefaultAccessDomainPolicySpec.fromRecord(record),
      );

      return ok({ id: persisted.id });
    });
  }
}
