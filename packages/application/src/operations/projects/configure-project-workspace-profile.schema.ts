import { z } from "zod";

export const configureProjectWorkspaceProfileCommandInputSchema = z
  .object({
    projectId: z
      .string()
      .trim()
      .regex(/^prj_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
    profileInstallationId: z
      .string()
      .trim()
      .regex(/^awpi_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
  })
  .strict();

export type ConfigureProjectWorkspaceProfileCommandInput = z.output<
  typeof configureProjectWorkspaceProfileCommandInputSchema
>;
