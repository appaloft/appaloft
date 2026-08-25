import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { ScalarValueObject } from "../shared/value-object";

function occupancyAgentValidation(message: string, details: Record<string, string> = {}) {
  return domainError.validation(message, { phase: "occupancy-agent", ...details });
}

const occupancyAgentIdBrand: unique symbol = Symbol("OccupancyAgentId");
export class OccupancyAgentId extends ScalarValueObject<string> {
  private [occupancyAgentIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<OccupancyAgentId> {
    const normalized = value.trim();
    if (
      !normalized.startsWith("agt_") ||
      normalized.length > 160 ||
      !/^agt_[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(normalized)
    ) {
      return err(occupancyAgentValidation("Occupancy Agent id is invalid", { field: "id" }));
    }
    return ok(new OccupancyAgentId(normalized));
  }

  static rehydrate(value: string): OccupancyAgentId {
    return new OccupancyAgentId(value.trim());
  }

  static generate(next: (prefix: string) => string): Result<OccupancyAgentId> {
    return OccupancyAgentId.create(next("agt"));
  }
}

const occupancyAgentStatusBrand: unique symbol = Symbol("OccupancyAgentStatus");
export class OccupancyAgentStatus extends ScalarValueObject<"active" | "retired"> {
  private [occupancyAgentStatusBrand]!: void;

  private constructor(value: "active" | "retired") {
    super(value);
  }

  static active(): OccupancyAgentStatus {
    return new OccupancyAgentStatus("active");
  }

  static retired(): OccupancyAgentStatus {
    return new OccupancyAgentStatus("retired");
  }

  static create(value: string): Result<OccupancyAgentStatus> {
    if (value === "active") return ok(OccupancyAgentStatus.active());
    if (value === "retired") return ok(OccupancyAgentStatus.retired());
    return err(occupancyAgentValidation("Occupancy Agent status is invalid", { field: "status" }));
  }

  static rehydrate(value: "active" | "retired"): OccupancyAgentStatus {
    return new OccupancyAgentStatus(value);
  }

  get isActive(): boolean {
    return this.value === "active";
  }
}
