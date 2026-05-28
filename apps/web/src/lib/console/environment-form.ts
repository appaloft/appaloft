import { type EnvironmentSummary } from "@appaloft/contracts";

export type EnvironmentKind = EnvironmentSummary["kind"];

export const environmentKinds = [
  "local",
  "development",
  "test",
  "staging",
  "production",
  "preview",
  "custom",
] as const satisfies readonly EnvironmentKind[];

export function parseEnvironmentKind(value: string | null): EnvironmentKind {
  return environmentKinds.includes(value as EnvironmentKind) ? (value as EnvironmentKind) : "local";
}
