import { inject, injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type ControlPlaneSecretRotationPort } from "../../ports";
import { tokens } from "../../tokens";
import { type ControlPlaneSecretRotationApplyCommand } from "./control-plane-secret-rotation-apply.command";

@injectable()
export class ControlPlaneSecretRotationApplyUseCase {
  constructor(
    @inject(tokens.controlPlaneSecretRotationPort)
    private readonly rotationPort: ControlPlaneSecretRotationPort,
  ) {}

  execute(_context: ExecutionContext, command: ControlPlaneSecretRotationApplyCommand) {
    return this.rotationPort.apply(command.input);
  }
}
