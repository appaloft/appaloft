import { inject, injectable } from "tsyringe";
import { type ExecutionContext } from "../../execution-context";
import { type InstanceUpgradePort } from "../../ports";
import { tokens } from "../../tokens";
import { type CheckInstanceUpgradeQuery } from "./check-instance-upgrade.query";

@injectable()
export class CheckInstanceUpgradeQueryService {
  constructor(
    @inject(tokens.instanceUpgrade)
    private readonly instanceUpgrade: InstanceUpgradePort,
  ) {}

  async execute(
    context: ExecutionContext,
    query: CheckInstanceUpgradeQuery,
  ): Promise<Awaited<ReturnType<InstanceUpgradePort["check"]>>> {
    void context;
    return this.instanceUpgrade.check({
      ...(query.targetVersion ? { targetVersion: query.targetVersion } : {}),
    });
  }
}
