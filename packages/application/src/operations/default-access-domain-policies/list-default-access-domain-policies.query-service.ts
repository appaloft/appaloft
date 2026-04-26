import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import {
  type DefaultAccessDomainPolicyRepository,
  type ListDefaultAccessDomainPoliciesResult,
} from "../../ports";
import { tokens } from "../../tokens";
import { toDefaultAccessDomainPolicyRead } from "./policy-readback";

@injectable()
export class ListDefaultAccessDomainPoliciesQueryService {
  constructor(
    @inject(tokens.defaultAccessDomainPolicyRepository)
    private readonly policyRepository: DefaultAccessDomainPolicyRepository,
  ) {}

  async execute(): Promise<Result<ListDefaultAccessDomainPoliciesResult>> {
    const records = await this.policyRepository.list();
    if (records.isErr()) {
      return err(records.error);
    }

    return ok({
      schemaVersion: "default-access-domain-policies.list/v1",
      items: records.value.map(toDefaultAccessDomainPolicyRead),
    });
  }
}
