import { inject, injectable } from "tsyringe";
import { type ExecutionContext } from "../../execution-context";
import { type InstanceUpgradePort } from "../../ports";
import { tokens } from "../../tokens";
import { type ApplyInstanceUpgradeCommand } from "./apply-instance-upgrade.command";

@injectable()
export class ApplyInstanceUpgradeUseCase {
  constructor(
    @inject(tokens.instanceUpgrade)
    private readonly instanceUpgrade: InstanceUpgradePort,
  ) {}

  execute(
    context: ExecutionContext,
    command: ApplyInstanceUpgradeCommand,
  ): ReturnType<InstanceUpgradePort["apply"]> {
    void context;
    return this.instanceUpgrade.apply({
      confirm: command.confirm,
      ...(command.targetVersion ? { targetVersion: command.targetVersion } : {}),
    });
  }
}
