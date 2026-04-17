import { ok, type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type DiagnosticsStatus, type PluginSummary, type ProviderDescriptor } from "../../ports";

export type DoctorQueryInput = Record<string, never>;

export class DoctorQuery extends Query<{
  readiness: DiagnosticsStatus;
  providers: ProviderDescriptor[];
  plugins: PluginSummary[];
}> {
  static create(): Result<DoctorQuery> {
    return ok(new DoctorQuery());
  }
}
