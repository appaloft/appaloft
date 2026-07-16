import { ok, type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ControlPlaneSecretRotationPlan } from "../../ports";

export class ControlPlaneSecretRotationPlanQuery extends Query<ControlPlaneSecretRotationPlan> {
  static create(): Result<ControlPlaneSecretRotationPlanQuery> {
    return ok(new ControlPlaneSecretRotationPlanQuery());
  }
}
