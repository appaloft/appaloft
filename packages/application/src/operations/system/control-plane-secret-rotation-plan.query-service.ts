import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type ControlPlaneSecretRotationPort } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ControlPlaneSecretRotationPlanQueryService {
  constructor(
    @inject(tokens.controlPlaneSecretRotationPort)
    private readonly rotationPort: ControlPlaneSecretRotationPort,
  ) {}

  execute(_context: ExecutionContext) {
    return this.rotationPort.plan();
  }
}
