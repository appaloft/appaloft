import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";

export const serverWorkloadRoles = [
  "deployment-runtime",
  "artifact-builder",
  "sandbox-worker",
] as const;

export type ServerWorkloadRole = (typeof serverWorkloadRoles)[number];

const roleOrder: Record<ServerWorkloadRole, number> = {
  "deployment-runtime": 0,
  "artifact-builder": 1,
  "sandbox-worker": 2,
};

const serverWorkloadRoleBrand: unique symbol = Symbol("ServerWorkloadRole");

export class ServerWorkloadRoleValue {
  private [serverWorkloadRoleBrand]!: void;

  private constructor(public readonly value: ServerWorkloadRole) {}

  static create(value: string): Result<ServerWorkloadRoleValue> {
    if (!serverWorkloadRoles.includes(value as ServerWorkloadRole)) {
      return err(
        domainError.validation("Server workload role is not supported", {
          phase: "server-workload-role-validation",
          workloadRole: value,
          supportedWorkloadRoles: [...serverWorkloadRoles],
        }),
      );
    }

    return ok(new ServerWorkloadRoleValue(value as ServerWorkloadRole));
  }

  static rehydrate(value: ServerWorkloadRole): ServerWorkloadRoleValue {
    return new ServerWorkloadRoleValue(value);
  }

  equals(other: ServerWorkloadRoleValue): boolean {
    return this.value === other.value;
  }
}

const deploymentTargetWorkloadRolesBrand: unique symbol = Symbol("DeploymentTargetWorkloadRoles");

export class DeploymentTargetWorkloadRoles {
  private [deploymentTargetWorkloadRolesBrand]!: void;

  private constructor(public readonly values: readonly ServerWorkloadRoleValue[]) {}

  static create(values: readonly string[]): Result<DeploymentTargetWorkloadRoles> {
    const seen = new Set<string>();
    const roles: ServerWorkloadRoleValue[] = [];

    for (const value of values) {
      if (seen.has(value)) {
        return err(
          domainError.validation("Server workload roles must not contain duplicates", {
            phase: "server-workload-role-validation",
            workloadRole: value,
          }),
        );
      }

      seen.add(value);
      const role = ServerWorkloadRoleValue.create(value);
      if (role.isErr()) {
        return err(role.error);
      }
      roles.push(role.value);
    }

    roles.sort((left, right) => roleOrder[left.value] - roleOrder[right.value]);

    return ok(new DeploymentTargetWorkloadRoles(roles));
  }

  static rehydrate(values: readonly ServerWorkloadRole[]): DeploymentTargetWorkloadRoles {
    return new DeploymentTargetWorkloadRoles(
      [...values]
        .sort((left, right) => roleOrder[left] - roleOrder[right])
        .map(ServerWorkloadRoleValue.rehydrate),
    );
  }

  static unrestricted(): DeploymentTargetWorkloadRoles {
    return new DeploymentTargetWorkloadRoles([]);
  }

  isUnrestricted(): boolean {
    return this.values.length === 0;
  }

  allows(role: ServerWorkloadRoleValue): boolean {
    return this.isUnrestricted() || this.values.some((candidate) => candidate.equals(role));
  }

  equals(other: DeploymentTargetWorkloadRoles): boolean {
    return (
      this.values.length === other.values.length &&
      this.values.every((role, index) => role.equals(other.values[index] ?? role))
    );
  }

  toJSON(): ServerWorkloadRole[] {
    return this.values.map((role) => role.value);
  }
}
