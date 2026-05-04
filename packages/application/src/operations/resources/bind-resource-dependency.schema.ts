import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";
import {
  resourceDependencyBindingInjectionModeSchema,
  resourceDependencyBindingScopeSchema,
} from "./resource-dependency-binding.schema";

export const bindResourceDependencyCommandInputSchema = z.object({
  resourceId: nonEmptyTrimmedString("Resource id"),
  dependencyResourceId: nonEmptyTrimmedString("Dependency resource id"),
  targetName: nonEmptyTrimmedString("Binding target name"),
  scope: resourceDependencyBindingScopeSchema.default("runtime-only"),
  injectionMode: resourceDependencyBindingInjectionModeSchema.default("env"),
});

export type BindResourceDependencyCommandInput = z.input<
  typeof bindResourceDependencyCommandInputSchema
>;
