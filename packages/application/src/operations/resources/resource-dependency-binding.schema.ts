import { z } from "zod";

export const resourceDependencyBindingScopeSchema = z.enum([
  "environment",
  "release",
  "build-only",
  "runtime-only",
]);

export const resourceDependencyBindingInjectionModeSchema = z.enum(["env", "file", "reference"]);
