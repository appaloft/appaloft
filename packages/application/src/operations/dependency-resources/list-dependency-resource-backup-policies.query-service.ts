import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  type DependencyResourceBackupPolicyListFilter,
  type DependencyResourceBackupPolicyRepository,
  dependencyResourceBackupPolicyRecordReadback,
  type ListDependencyResourceBackupPoliciesResult,
} from "./dependency-resource-backup-policy.types";

@injectable()
export class ListDependencyResourceBackupPoliciesQueryService {
  constructor(
    @inject(tokens.dependencyResourceBackupPolicyRepository)
    private readonly policyRepository: DependencyResourceBackupPolicyRepository,
  ) {}

  async execute(
    context: ExecutionContext,
    filter: DependencyResourceBackupPolicyListFilter = {},
  ): Promise<Result<ListDependencyResourceBackupPoliciesResult>> {
    const records = await this.policyRepository.listRecords(toRepositoryContext(context), filter);
    if (records.isErr()) {
      return err(records.error);
    }

    return ok({
      schemaVersion: "dependency-resource-backup-policies.list/v1",
      items: records.value.map(dependencyResourceBackupPolicyRecordReadback),
    });
  }
}
