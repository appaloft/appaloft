import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { tokens } from "../../tokens";
import {
  type DependencyResourceBackupPolicyRepository,
  dependencyResourceBackupPolicyRecordReadback,
  type ShowDependencyResourceBackupPolicyResult,
} from "./dependency-resource-backup-policy.types";

@injectable()
export class ShowDependencyResourceBackupPolicyQueryService {
  constructor(
    @inject(tokens.dependencyResourceBackupPolicyRepository)
    private readonly policyRepository: DependencyResourceBackupPolicyRepository,
  ) {}

  async execute(
    context: ExecutionContext,
    input: { policyId: string },
  ): Promise<Result<ShowDependencyResourceBackupPolicyResult>> {
    const record = await this.policyRepository.findOne(
      toRepositoryContext(context),
      input.policyId,
    );
    if (record.isErr()) {
      return err(record.error);
    }

    return ok({
      schemaVersion: "dependency-resource-backup-policies.show/v1",
      policy: record.value ? dependencyResourceBackupPolicyRecordReadback(record.value) : null,
    });
  }
}
